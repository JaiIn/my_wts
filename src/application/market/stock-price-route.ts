import { type NextRequest, NextResponse } from "next/server";

import {
  SessionAuthenticationError,
  SessionPersistenceError,
  type SessionUser,
} from "../auth/session-service";
import {
  MarketDataNotFoundError,
  MarketDataSourceError,
} from "./market-service";
import {
  MarketProviderConfigurationError,
  MarketRequestValidationError,
  type StockPriceProvider,
  toPriceResponse,
  toStockInfoResponse,
} from "./stock-price-provider";
import { TossEnvelopeDecodeError } from "../../integrations/toss/envelope";
import { TossHttpClientError } from "../../infrastructure/toss/readonly-http-client";

const SESSION_COOKIE_NAME = "my_wts_session";
const LOOPBACK_HOST = "127.0.0.1:3000";
const SYMBOL_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;

type MarketOperation = "getPrices" | "getStocks";

class MarketRouteForbiddenError extends Error {
  constructor() {
    super("MARKET_ROUTE_FORBIDDEN");
    this.name = "MarketRouteForbiddenError";
  }
}

export type MarketBffAuthenticator = Readonly<{
  authenticate(token: unknown): SessionUser;
}>;

type MarketBffDependencies = Readonly<{
  provider(): {
    implementation: StockPriceProvider;
    name: "live" | "mock";
  };
  authenticator: MarketBffAuthenticator;
  createRequestId(): string;
  now(): Date;
  log?(event: string, context: Record<string, unknown>): void;
}>;

function hasMalformedPercentEncoding(url: string): boolean {
  const query = url.split("?", 2)[1]?.split("#", 1)[0] ?? "";
  return /%(?![0-9A-Fa-f]{2})/.test(query);
}

export function parseSymbols(request: NextRequest): readonly string[] {
  if (hasMalformedPercentEncoding(request.url)) {
    throw new MarketRequestValidationError();
  }
  const keys = [...request.nextUrl.searchParams.keys()];
  if (
    keys.some((key) => key !== "symbols") ||
    request.nextUrl.searchParams.getAll("symbols").length !== 1
  ) {
    throw new MarketRequestValidationError();
  }
  const raw = request.nextUrl.searchParams.get("symbols");
  if (raw === null) throw new MarketRequestValidationError();
  const symbols = raw.split(",").map((symbol) => symbol.trim().toUpperCase());
  if (
    symbols.length < 1 ||
    symbols.length > 200 ||
    symbols.some((symbol) => !SYMBOL_PATTERN.test(symbol)) ||
    new Set(symbols).size !== symbols.length
  ) {
    throw new MarketRequestValidationError();
  }
  return Object.freeze(symbols);
}

function successResponse(
  requestId: string,
  data: unknown,
  now: Date,
): NextResponse {
  return NextResponse.json(
    {
      data,
      meta: {
        requestId,
        fetchedAt: now.toISOString(),
        stale: false,
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      },
    },
  );
}

type SafeError = {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
  retryAfterSeconds?: number;
};

function mapHttpClientError(error: TossHttpClientError): SafeError {
  if (error.code === "TOSS_GET_AUTHENTICATION_FAILED") {
    return {
      status: 502,
      code: "TOSS_AUTH_FAILED",
      message: "외부 인증을 확인할 수 없습니다.",
      retryable: false,
    };
  }
  if (error.code === "TOSS_GET_RATE_LIMITED") {
    return {
      status: 429,
      code: "UPSTREAM_RATE_LIMITED",
      message: "잠시 후 다시 시도해 주세요.",
      retryable: error.retryable,
      retryAfterSeconds:
        error.retryAfterMs === undefined
          ? undefined
          : Math.floor(error.retryAfterMs / 1_000),
    };
  }
  if (error.code === "TOSS_GET_TIMEOUT") {
    return {
      status: 504,
      code: "UPSTREAM_TIMEOUT",
      message: "외부 조회 시간이 초과되었습니다.",
      retryable: true,
    };
  }
  if (error.code === "TOSS_GET_NETWORK_FAILURE") {
    return {
      status: 503,
      code: "UPSTREAM_UNAVAILABLE",
      message: "외부 조회 서비스를 사용할 수 없습니다.",
      retryable: true,
    };
  }
  if (error.status === 404) {
    return {
      status: 404,
      code: "UPSTREAM_NOT_FOUND",
      message: "대상을 찾을 수 없습니다.",
      retryable: false,
    };
  }
  return {
    status: 502,
    code: "UPSTREAM_UNKNOWN_ERROR",
    message: "외부 조회 응답을 처리할 수 없습니다.",
    retryable: false,
  };
}

function safeError(error: unknown): SafeError {
  if (error instanceof MarketRouteForbiddenError) {
    return {
      status: 403,
      code: "UPSTREAM_FORBIDDEN",
      message: "허용되지 않은 요청입니다.",
      retryable: false,
    };
  }
  if (error instanceof MarketRequestValidationError) {
    return {
      status: 400,
      code: error.code,
      message: "입력값을 확인해 주세요.",
      retryable: false,
      details: { field: error.field },
    };
  }
  if (error instanceof SessionAuthenticationError) {
    return {
      status: 401,
      code: error.code,
      message:
        error.code === "SESSION_EXPIRED"
          ? "세션이 만료되었습니다."
          : "로그인이 필요합니다.",
      retryable: false,
    };
  }
  if (error instanceof MarketDataNotFoundError) {
    return {
      status: 404,
      code: "UPSTREAM_NOT_FOUND",
      message: "대상을 찾을 수 없습니다.",
      retryable: false,
    };
  }
  if (error instanceof MarketDataSourceError) {
    const status =
      error.code === "UPSTREAM_RATE_LIMITED"
        ? 429
        : error.code === "UPSTREAM_TIMEOUT"
          ? 504
          : error.code === "UPSTREAM_UNAVAILABLE"
            ? 503
            : 502;
    return {
      status,
      code: error.code,
      message:
        status === 429
          ? "잠시 후 다시 시도해 주세요."
          : "외부 조회 응답을 처리할 수 없습니다.",
      retryable: error.retryable,
    };
  }
  if (error instanceof TossHttpClientError) return mapHttpClientError(error);
  if (error instanceof MarketProviderConfigurationError) {
    return {
      status: error.status,
      code: error.code,
      message: "외부 조회 설정을 사용할 수 없습니다.",
      retryable: false,
    };
  }
  if (
    error instanceof TossEnvelopeDecodeError ||
    error instanceof SessionPersistenceError
  ) {
    return {
      status: error instanceof SessionPersistenceError ? 500 : 502,
      code:
        error instanceof SessionPersistenceError
          ? "DATABASE_ERROR"
          : "UPSTREAM_UNKNOWN_ERROR",
      message: "요청을 처리할 수 없습니다.",
      retryable: false,
    };
  }
  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "요청을 처리할 수 없습니다.",
    retryable: false,
  };
}

function errorResponse(requestId: string, error: unknown): NextResponse {
  const mapped = safeError(error);
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
  };
  if (mapped.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(mapped.retryAfterSeconds);
  }
  return NextResponse.json(
    {
      error: {
        requestId,
        code: mapped.code,
        message: mapped.message,
        retryable: mapped.retryable,
        details: mapped.details ?? {},
      },
    },
    { status: mapped.status, headers },
  );
}

export function createMarketBffHandler(
  operation: MarketOperation,
  dependencies: MarketBffDependencies,
) {
  return async function GET(request: NextRequest): Promise<NextResponse> {
    const requestId = dependencies.createRequestId();
    const startedAt = dependencies.now().getTime();
    let providerName: "live" | "mock" | undefined;
    try {
      const host = request.headers.get("host") ?? request.nextUrl.host;
      if (host !== LOOPBACK_HOST) {
        throw new MarketRouteForbiddenError();
      }
      dependencies.authenticator.authenticate(
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
      );
      const symbols = parseSymbols(request);
      const provider = dependencies.provider();
      providerName = provider.name;
      const data =
        operation === "getStocks"
          ? (await provider.implementation.getStocks(symbols)).map(
              toStockInfoResponse,
            )
          : (await provider.implementation.getPrices(symbols)).map(
              toPriceResponse,
            );
      dependencies.log?.("market.bff.succeeded", {
        requestId,
        operation,
        status: 200,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
        provider: providerName,
      });
      return successResponse(requestId, data, dependencies.now());
    } catch (error) {
      const response = errorResponse(requestId, error);
      dependencies.log?.("market.bff.failed", {
        requestId,
        operation,
        status: response.status,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
        provider: providerName,
      });
      return response;
    }
  };
}
