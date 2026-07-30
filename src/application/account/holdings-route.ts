import { type NextRequest, NextResponse } from "next/server";

import type {
  AccountSelectionContext,
  SelectedAccountResolution,
} from "./account-selection-service";
import {
  AccountRouteForbiddenError,
  accountErrorResponse,
} from "./account-route";
import {
  HoldingsProviderError,
  toPublicHoldings,
  type HoldingsProvider,
} from "./holdings-provider";
import {
  TossEnvelopeDecodeError,
} from "../../integrations/toss/envelope";

const SESSION_COOKIE_NAME = "my_wts_session";
const LOOPBACK_HOST = "127.0.0.1:3000";
const SYMBOL_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;

export class HoldingsRequestValidationError extends Error {
  readonly code = "VALIDATION_FAILED";
  constructor() {
    super("HOLDINGS_REQUEST_VALIDATION_FAILED");
    this.name = "HoldingsRequestValidationError";
    this.stack = undefined;
  }
}

export class AccountNotSelectedError extends Error {
  readonly code = "ACCOUNT_NOT_SELECTED";
  constructor() {
    super("ACCOUNT_NOT_SELECTED");
    this.name = "AccountNotSelectedError";
    this.stack = undefined;
  }
}

export type HoldingsBffDependencies = Readonly<{
  provider(): {
    implementation: HoldingsProvider;
    name: "live" | "mock";
  };
  selection: {
    authenticate(token: unknown): AccountSelectionContext;
    resolveCurrent(
      context: AccountSelectionContext,
    ): SelectedAccountResolution | null;
  };
  createRequestId(): string;
  now(): Date;
  log?(event: string, context: Record<string, unknown>): void;
}>;

function parseRequest(request: NextRequest): string | undefined {
  if (/%(?![0-9A-Fa-f]{2})/.test(request.url)) {
    throw new HoldingsRequestValidationError();
  }
  for (const key of request.nextUrl.searchParams.keys()) {
    if (
      key !== "symbol" ||
      request.nextUrl.searchParams.getAll(key).length !== 1
    ) {
      throw new HoldingsRequestValidationError();
    }
  }
  if (
    request.headers.has("content-length") ||
    request.headers.has("transfer-encoding")
  ) {
    throw new HoldingsRequestValidationError();
  }
  const raw = request.nextUrl.searchParams.get("symbol");
  if (raw === null) return undefined;
  const symbol = raw.trim().toUpperCase();
  if (
    symbol === "." ||
    symbol === ".." ||
    !SYMBOL_PATTERN.test(symbol)
  ) {
    throw new HoldingsRequestValidationError();
  }
  return symbol;
}

function holdingsErrorResponse(
  requestId: string,
  error: unknown,
): NextResponse {
  if (error instanceof AccountNotSelectedError) {
    return NextResponse.json(
      {
        error: {
          requestId,
          code: error.code,
          message: "계좌를 먼저 선택해 주세요.",
          retryable: false,
          details: {},
        },
      },
      {
        status: 409,
        headers: {
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
        },
      },
    );
  }
  if (error instanceof HoldingsRequestValidationError) {
    return NextResponse.json(
      {
        error: {
          requestId,
          code: error.code,
          message: "요청 값을 확인해 주세요.",
          retryable: false,
          details: {},
        },
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
        },
      },
    );
  }
  if (
    error instanceof HoldingsProviderError ||
    error instanceof TossEnvelopeDecodeError
  ) {
    const rateLimited =
      error instanceof HoldingsProviderError &&
      error.code === "UPSTREAM_RATE_LIMITED";
    const status =
      rateLimited
        ? 429
        : error instanceof HoldingsProviderError &&
            error.code === "UPSTREAM_TIMEOUT"
          ? 504
          : error instanceof HoldingsProviderError &&
              error.code === "UPSTREAM_UNAVAILABLE"
            ? 503
            : 502;
    return NextResponse.json(
      {
        error: {
          requestId,
          code:
            error instanceof TossEnvelopeDecodeError
              ? "UPSTREAM_INVALID_RESPONSE"
              : error.code,
          message: "보유자산을 안전하게 조회할 수 없습니다.",
          retryable:
            error instanceof HoldingsProviderError && error.retryable,
          details: {},
        },
      },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
        },
      },
    );
  }
  return accountErrorResponse(requestId, error);
}

export function createHoldingsBffHandler(
  dependencies: HoldingsBffDependencies,
) {
  return async function GET(request: NextRequest): Promise<NextResponse> {
    const requestId = dependencies.createRequestId();
    const startedAt = dependencies.now().getTime();
    let providerName: "live" | "mock" | undefined;
    try {
      const host = request.headers.get("host") ?? request.nextUrl.host;
      if (host !== LOOPBACK_HOST) throw new AccountRouteForbiddenError();
      const symbol = parseRequest(request);
      const context = dependencies.selection.authenticate(
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
      );
      const selected = dependencies.selection.resolveCurrent(context);
      if (!selected) throw new AccountNotSelectedError();
      const provider = dependencies.provider();
      providerName = provider.name;
      const data = toPublicHoldings(
        await provider.implementation.getHoldings(
          selected.accountSeq,
          symbol,
        ),
      );
      dependencies.log?.("holdings.bff.succeeded", {
        requestId,
        operation: "getHoldings",
        status: 200,
        provider: providerName,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
      });
      return NextResponse.json(
        {
          data,
          meta: {
            requestId,
            fetchedAt: dependencies.now().toISOString(),
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
    } catch (error) {
      const response = holdingsErrorResponse(requestId, error);
      dependencies.log?.("holdings.bff.failed", {
        requestId,
        operation: "getHoldings",
        status: response.status,
        provider: providerName,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
      });
      return response;
    }
  };
}
