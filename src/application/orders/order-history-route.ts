import { type NextRequest, NextResponse } from "next/server";

import { AccountNotSelectedError } from "../account/holdings-route";
import {
  AccountRouteForbiddenError,
  accountErrorResponse,
} from "../account/account-route";
import type {
  AccountSelectionContext,
  SelectedAccountResolution,
} from "../account/account-selection-service";
import {
  OrderHistoryProviderError,
  type OrderHistoryProvider,
} from "./order-history-provider";
import {
  OrderHistoryValidationError,
  parseOrderHistoryQuery,
} from "./order-history-query";
import { TossEnvelopeDecodeError } from "../../integrations/toss/envelope";
import { ReadonlyOrderDecodeError } from "../../infrastructure/orders/readonly-order-decoder";

const SESSION_COOKIE_NAME = "my_wts_session";
const LOOPBACK_HOST = "127.0.0.1:3000";

export type OrderHistoryBffDependencies = Readonly<{
  provider(): {
    implementation: OrderHistoryProvider;
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

function jsonError(
  requestId: string,
  status: number,
  code: string,
  message: string,
  retryable = false,
): NextResponse {
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
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      },
    },
  );
}

function orderHistoryErrorResponse(
  requestId: string,
  error: unknown,
): NextResponse {
  if (error instanceof AccountRouteForbiddenError) {
    return jsonError(
      requestId,
      403,
      "FORBIDDEN",
      "This request is not allowed.",
    );
  }
  if (
    error instanceof OrderHistoryValidationError ||
    (error instanceof OrderHistoryProviderError &&
      error.code === "INVALID_CURSOR")
  ) {
    return jsonError(
      requestId,
      400,
      "VALIDATION_FAILED",
      "Check the request values.",
    );
  }
  if (error instanceof AccountNotSelectedError) {
    return jsonError(
      requestId,
      409,
      "ACCOUNT_NOT_SELECTED",
      "Select an account first.",
    );
  }
  if (error instanceof OrderHistoryProviderError) {
    const status =
      error.code === "UPSTREAM_RATE_LIMITED"
        ? 429
        : error.code === "UPSTREAM_TIMEOUT"
          ? 504
          : error.code === "UPSTREAM_UNAVAILABLE"
            ? 503
            : 502;
    return jsonError(
      requestId,
      status,
      error.code,
      "Order history could not be loaded safely.",
      error.retryable,
    );
  }
  if (
    error instanceof TossEnvelopeDecodeError ||
    error instanceof ReadonlyOrderDecodeError
  ) {
    return jsonError(
      requestId,
      502,
      "UPSTREAM_INVALID_RESPONSE",
      "The order history response was invalid.",
    );
  }
  return accountErrorResponse(requestId, error);
}

export function createOrderHistoryBffHandler(
  dependencies: OrderHistoryBffDependencies,
) {
  return async function GET(request: NextRequest): Promise<NextResponse> {
    const requestId = dependencies.createRequestId();
    const startedAt = dependencies.now().getTime();
    let providerName: "live" | "mock" | undefined;
    try {
      const host = request.headers.get("host") ?? request.nextUrl.host;
      if (host !== LOOPBACK_HOST) throw new AccountRouteForbiddenError();
      const query = parseOrderHistoryQuery(request);
      const context = dependencies.selection.authenticate(
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
      );
      const selected = dependencies.selection.resolveCurrent(context);
      if (!selected) throw new AccountNotSelectedError();
      const provider = dependencies.provider();
      providerName = provider.name;
      const page = await provider.implementation.getOrders(
        selected.accountSeq,
        query,
      );
      dependencies.log?.("order_history.bff.succeeded", {
        requestId,
        operation: "getOrders",
        status: 200,
        provider: providerName,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
      });
      return NextResponse.json(
        {
          data: {
            orders: page.orders,
            nextCursor: page.nextCursor,
            hasNext: page.hasNext,
          },
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
      const response = orderHistoryErrorResponse(requestId, error);
      dependencies.log?.("order_history.bff.failed", {
        requestId,
        operation: "getOrders",
        status: response.status,
        provider: providerName,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
      });
      return response;
    }
  };
}
