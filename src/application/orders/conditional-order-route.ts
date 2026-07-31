import { type NextRequest, NextResponse } from "next/server";

import {
  AccountRouteForbiddenError,
  accountErrorResponse,
} from "../account/account-route";
import { AccountNotSelectedError } from "../account/holdings-route";
import type {
  AccountSelectionContext,
  SelectedAccountResolution,
} from "../account/account-selection-service";
import {
  ConditionalOrderProviderError,
  type ConditionalOrderHistoryProvider,
} from "./conditional-order-provider";
import {
  ConditionalOrderValidationError,
  parseConditionalOrderHistoryQuery,
} from "./conditional-order-query";
import { TossEnvelopeDecodeError } from "../../integrations/toss/envelope";
import { ReadonlyConditionalOrderDecodeError } from "../../infrastructure/orders/readonly-conditional-order-decoder";

const SESSION_COOKIE_NAME = "my_wts_session";
const LOOPBACK_HOST = "127.0.0.1:3000";

export type ConditionalOrderBffDependencies = Readonly<{
  provider(): {
    implementation: ConditionalOrderHistoryProvider;
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

export function conditionalOrderJsonError(
  requestId: string,
  status: number,
  code: string,
  message: string,
  retryable = false,
  retryAfterSeconds?: number,
): NextResponse {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
  };
  if (
    retryAfterSeconds !== undefined &&
    Number.isSafeInteger(retryAfterSeconds) &&
    retryAfterSeconds >= 0
  ) {
    headers["Retry-After"] = String(retryAfterSeconds);
  }
  return NextResponse.json(
    {
      error: {
        requestId,
        code,
        message,
        retryable,
        details: {},
      },
    },
    { status, headers },
  );
}

export function conditionalOrderErrorResponse(
  requestId: string,
  error: unknown,
): NextResponse {
  if (error instanceof AccountRouteForbiddenError) {
    return conditionalOrderJsonError(
      requestId,
      403,
      "FORBIDDEN",
      "This request is not allowed.",
    );
  }
  if (
    error instanceof ConditionalOrderValidationError ||
    (error instanceof ConditionalOrderProviderError &&
      error.code === "INVALID_CURSOR")
  ) {
    return conditionalOrderJsonError(
      requestId,
      400,
      "VALIDATION_FAILED",
      "Check the request values.",
    );
  }
  if (error instanceof AccountNotSelectedError) {
    return conditionalOrderJsonError(
      requestId,
      409,
      "ACCOUNT_NOT_SELECTED",
      "Select an account first.",
    );
  }
  if (error instanceof ConditionalOrderProviderError) {
    if (error.code === "CONDITIONAL_ORDER_NOT_FOUND") {
      return conditionalOrderJsonError(
        requestId,
        404,
        "UPSTREAM_NOT_FOUND",
        "The conditional order was not found.",
      );
    }
    const status =
      error.code === "UPSTREAM_RATE_LIMITED"
        ? 429
        : error.code === "UPSTREAM_TIMEOUT"
          ? 504
          : error.code === "UPSTREAM_UNAVAILABLE"
            ? 503
            : 502;
    return conditionalOrderJsonError(
      requestId,
      status,
      error.code,
      "Conditional order history could not be loaded safely.",
      error.retryable,
      error.retryAfterSeconds,
    );
  }
  if (
    error instanceof TossEnvelopeDecodeError ||
    error instanceof ReadonlyConditionalOrderDecodeError
  ) {
    return conditionalOrderJsonError(
      requestId,
      502,
      "UPSTREAM_INVALID_RESPONSE",
      "The conditional order response was invalid.",
    );
  }
  return accountErrorResponse(requestId, error);
}

export function buildConditionalOrderHistoryBffHandler(
  dependencies: ConditionalOrderBffDependencies,
) {
  return async function GET(request: NextRequest): Promise<NextResponse> {
    const requestId = dependencies.createRequestId();
    const startedAt = dependencies.now().getTime();
    let providerName: "live" | "mock" | undefined;
    try {
      const host = request.headers.get("host") ?? request.nextUrl.host;
      if (host !== LOOPBACK_HOST) throw new AccountRouteForbiddenError();
      const query = parseConditionalOrderHistoryQuery(request);
      const auth = dependencies.selection.authenticate(
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
      );
      const selected = dependencies.selection.resolveCurrent(auth);
      if (!selected) throw new AccountNotSelectedError();
      const provider = dependencies.provider();
      providerName = provider.name;
      const page = await provider.implementation.getConditionalOrders(
        selected.accountSeq,
        query,
      );
      dependencies.log?.("conditional_order_history.bff.succeeded", {
        requestId,
        operation: "getConditionalOrders",
        status: 200,
        provider: providerName,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
      });
      return NextResponse.json(
        {
          data: page,
          meta: {
            requestId,
            fetchedAt: dependencies.now().toISOString(),
            stale: false,
            nextCursor: page.nextCursor,
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
      const response = conditionalOrderErrorResponse(requestId, error);
      dependencies.log?.("conditional_order_history.bff.failed", {
        requestId,
        operation: "getConditionalOrders",
        status: response.status,
        provider: providerName,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
      });
      return response;
    }
  };
}
