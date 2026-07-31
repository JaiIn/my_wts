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
import { OrderIdValidationError, decodeOrderIdPathSegment } from "./order-id";
import {
  OrderHistoryProviderError,
  type OrderHistoryProvider,
} from "./order-history-provider";
import { TossEnvelopeDecodeError } from "../../integrations/toss/envelope";
import { ReadonlyOrderDecodeError } from "../../infrastructure/orders/readonly-order-decoder";

const SESSION_COOKIE_NAME = "my_wts_session";
const LOOPBACK_HOST = "127.0.0.1:3000";

export type OrderDetailBffDependencies = Readonly<{
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

type OrderDetailContext = Readonly<{
  params: Promise<Readonly<{ orderId: string }>>;
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

function detailErrorResponse(requestId: string, error: unknown): NextResponse {
  if (error instanceof AccountRouteForbiddenError) {
    return jsonError(
      requestId,
      403,
      "FORBIDDEN",
      "This request is not allowed.",
    );
  }
  if (error instanceof OrderIdValidationError) {
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
    if (error.code === "ORDER_NOT_FOUND") {
      return jsonError(
        requestId,
        404,
        "UPSTREAM_NOT_FOUND",
        "The order was not found.",
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
    return jsonError(
      requestId,
      status,
      error.code,
      "The order detail could not be loaded safely.",
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
      "The order detail response was invalid.",
    );
  }
  return accountErrorResponse(requestId, error);
}

export function createOrderDetailBffHandler(
  dependencies: OrderDetailBffDependencies,
) {
  return async function GET(
    request: NextRequest,
    context: OrderDetailContext,
  ): Promise<NextResponse> {
    const requestId = dependencies.createRequestId();
    const startedAt = dependencies.now().getTime();
    let providerName: "live" | "mock" | undefined;
    try {
      const host = request.headers.get("host") ?? request.nextUrl.host;
      if (host !== LOOPBACK_HOST) throw new AccountRouteForbiddenError();
      if (
        request.nextUrl.search !== "" ||
        request.headers.has("content-length") ||
        request.headers.has("transfer-encoding")
      ) {
        throw new OrderIdValidationError();
      }
      const { orderId: rawOrderId } = await context.params;
      const orderId = decodeOrderIdPathSegment(rawOrderId);
      const auth = dependencies.selection.authenticate(
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
      );
      const selected = dependencies.selection.resolveCurrent(auth);
      if (!selected) throw new AccountNotSelectedError();
      const provider = dependencies.provider();
      providerName = provider.name;
      const order = await provider.implementation.getOrder(
        selected.accountSeq,
        orderId,
      );
      dependencies.log?.("order_detail.bff.succeeded", {
        requestId,
        operation: "getOrder",
        status: 200,
        provider: providerName,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
      });
      return NextResponse.json(
        {
          data: order,
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
      const response = detailErrorResponse(requestId, error);
      dependencies.log?.("order_detail.bff.failed", {
        requestId,
        operation: "getOrder",
        status: response.status,
        provider: providerName,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
      });
      return response;
    }
  };
}
