import { type NextRequest, NextResponse } from "next/server";

import {
  AccountRouteForbiddenError,
  accountErrorResponse,
} from "../account/account-route";
import { AccountNotSelectedError } from "../account/holdings-route";
import {
  ConditionalOrderIdValidationError,
  decodeConditionalOrderIdPathSegment,
} from "./conditional-order-id";
import { ConditionalOrderProviderError } from "./conditional-order-provider";
import {
  conditionalOrderErrorResponse,
  conditionalOrderJsonError,
  type ConditionalOrderBffDependencies,
} from "./conditional-order-route";
import { TossEnvelopeDecodeError } from "../../integrations/toss/envelope";
import { ReadonlyConditionalOrderDecodeError } from "../../infrastructure/orders/readonly-conditional-order-decoder";

const SESSION_COOKIE_NAME = "my_wts_session";
const LOOPBACK_HOST = "127.0.0.1:3000";

type Context = Readonly<{
  params: Promise<Readonly<{ conditionalOrderId: string }>>;
}>;

function detailError(requestId: string, error: unknown): NextResponse {
  if (error instanceof ConditionalOrderIdValidationError) {
    return conditionalOrderJsonError(
      requestId,
      400,
      "VALIDATION_FAILED",
      "Check the request values.",
    );
  }
  if (
    error instanceof AccountRouteForbiddenError ||
    error instanceof AccountNotSelectedError ||
    error instanceof ConditionalOrderProviderError ||
    error instanceof TossEnvelopeDecodeError ||
    error instanceof ReadonlyConditionalOrderDecodeError
  ) {
    return conditionalOrderErrorResponse(requestId, error);
  }
  return accountErrorResponse(requestId, error);
}

export function buildConditionalOrderDetailBffHandler(
  dependencies: ConditionalOrderBffDependencies,
) {
  return async function GET(
    request: NextRequest,
    context: Context,
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
        throw new ConditionalOrderIdValidationError();
      }
      const params = await context.params;
      const conditionalOrderId = decodeConditionalOrderIdPathSegment(
        params.conditionalOrderId,
      );
      const auth = dependencies.selection.authenticate(
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
      );
      const selected = dependencies.selection.resolveCurrent(auth);
      if (!selected) throw new AccountNotSelectedError();
      const provider = dependencies.provider();
      providerName = provider.name;
      const result = await provider.implementation.getConditionalOrder(
        selected.accountSeq,
        conditionalOrderId,
      );
      dependencies.log?.("conditional_order_detail.bff.succeeded", {
        requestId,
        operation: "getConditionalOrder",
        status: 200,
        provider: providerName,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
      });
      return NextResponse.json(
        {
          data: result,
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
      const response = detailError(requestId, error);
      dependencies.log?.("conditional_order_detail.bff.failed", {
        requestId,
        operation: "getConditionalOrder",
        status: response.status,
        provider: providerName,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
      });
      return response;
    }
  };
}
