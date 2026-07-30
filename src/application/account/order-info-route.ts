import { type NextRequest, NextResponse } from "next/server";

import {
  AccountNotSelectedError,
  HoldingsRequestValidationError,
} from "./holdings-route";
import {
  AccountRouteForbiddenError,
  accountErrorResponse,
} from "./account-route";
import type {
  AccountSelectionContext,
  SelectedAccountResolution,
} from "./account-selection-service";
import {
  OrderInfoProviderError,
  type OrderInfoProvider,
} from "./order-info-provider";
import { TossEnvelopeDecodeError } from "../../integrations/toss/envelope";

const SESSION_COOKIE_NAME = "my_wts_session";
const LOOPBACK_HOST = "127.0.0.1:3000";
const SYMBOL_PATTERN = /^[A-Za-z0-9.-]{1,32}$/;

export type OrderInfoOperation =
  | "getBuyingPower"
  | "getSellableQuantity"
  | "getCommissions";

export type OrderInfoBffDependencies = Readonly<{
  provider(): {
    implementation: OrderInfoProvider;
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

function assertNoBody(request: NextRequest): void {
  if (
    request.headers.has("content-length") ||
    request.headers.has("transfer-encoding")
  ) {
    throw new HoldingsRequestValidationError();
  }
}

function oneQuery(
  request: NextRequest,
  expected: string | undefined,
): string | undefined {
  if (/%(?![0-9A-Fa-f]{2})/.test(request.url)) {
    throw new HoldingsRequestValidationError();
  }
  const keys = [...request.nextUrl.searchParams.keys()];
  if (
    expected === undefined
      ? keys.length !== 0
      : keys.length !== 1 ||
        keys[0] !== expected ||
        request.nextUrl.searchParams.getAll(expected).length !== 1
  ) {
    throw new HoldingsRequestValidationError();
  }
  return expected
    ? request.nextUrl.searchParams.get(expected) ?? undefined
    : undefined;
}

export function parseOrderInfoRequest(
  operation: OrderInfoOperation,
  request: NextRequest,
): Readonly<{ currency?: "KRW" | "USD"; symbol?: string }> {
  assertNoBody(request);
  if (operation === "getCommissions") {
    oneQuery(request, undefined);
    return Object.freeze({});
  }
  if (operation === "getBuyingPower") {
    const currency = oneQuery(request, "currency");
    if (currency !== "KRW" && currency !== "USD") {
      throw new HoldingsRequestValidationError();
    }
    return Object.freeze({ currency });
  }
  const rawSymbol = oneQuery(request, "symbol");
  const symbol = rawSymbol?.trim().toUpperCase();
  if (
    !symbol ||
    symbol === "." ||
    symbol === ".." ||
    !SYMBOL_PATTERN.test(symbol)
  ) {
    throw new HoldingsRequestValidationError();
  }
  return Object.freeze({ symbol });
}

function orderInfoErrorResponse(
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
          message: "조회 조건을 확인해 주세요.",
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
    error instanceof OrderInfoProviderError ||
    error instanceof TossEnvelopeDecodeError
  ) {
    const status =
      error instanceof OrderInfoProviderError &&
      error.code === "UPSTREAM_RATE_LIMITED"
        ? 429
        : error instanceof OrderInfoProviderError &&
            error.code === "UPSTREAM_TIMEOUT"
          ? 504
          : error instanceof OrderInfoProviderError &&
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
          message: "조회용 계좌 정보를 안전하게 불러올 수 없습니다.",
          retryable:
            error instanceof OrderInfoProviderError && error.retryable,
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

export function createOrderInfoBffHandler(
  operation: OrderInfoOperation,
  dependencies: OrderInfoBffDependencies,
) {
  return async function GET(request: NextRequest): Promise<NextResponse> {
    const requestId = dependencies.createRequestId();
    const startedAt = dependencies.now().getTime();
    let providerName: "live" | "mock" | undefined;
    try {
      const host = request.headers.get("host") ?? request.nextUrl.host;
      if (host !== LOOPBACK_HOST) throw new AccountRouteForbiddenError();
      const input = parseOrderInfoRequest(operation, request);
      const context = dependencies.selection.authenticate(
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
      );
      const selected = dependencies.selection.resolveCurrent(context);
      if (!selected) throw new AccountNotSelectedError();
      const provider = dependencies.provider();
      providerName = provider.name;
      const data =
        operation === "getBuyingPower"
          ? await provider.implementation.getBuyingPower(
              selected.accountSeq,
              input.currency!,
            )
          : operation === "getSellableQuantity"
            ? await provider.implementation.getSellableQuantity(
                selected.accountSeq,
                input.symbol!,
              )
            : await provider.implementation.getCommissions(
                selected.accountSeq,
              );
      dependencies.log?.("order_info.bff.succeeded", {
        requestId,
        operation,
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
      const response = orderInfoErrorResponse(requestId, error);
      dependencies.log?.("order_info.bff.failed", {
        requestId,
        operation,
        status: response.status,
        provider: providerName,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
      });
      return response;
    }
  };
}
