import {
  cloneConditionalOrder,
  cloneConditionalOrderPage,
  ConditionalOrderProviderError,
} from "../../application/orders/conditional-order-provider";
import type { ConditionalOrderHistoryPage } from "../../domain/orders/conditional-order-history";
import {
  decodeTossEnvelope,
  TossEnvelopeDecodeError,
} from "../../integrations/toss/envelope";
import { tossPaginatedConditionalOrderResponseSchema } from "../../integrations/toss/conditional-order-history-schemas";
import {
  decodeReadonlyConditionalOrder,
  decodeReadonlyConditionalOrderEnvelope,
} from "./readonly-conditional-order-decoder";

function upstreamError(code: string): ConditionalOrderProviderError {
  if (code === "rate-limit-exceeded") {
    return new ConditionalOrderProviderError("UPSTREAM_RATE_LIMITED", true);
  }
  if (code === "unauthorized") {
    return new ConditionalOrderProviderError("UPSTREAM_AUTH_FAILED");
  }
  if (code === "conditional-order-not-found") {
    return new ConditionalOrderProviderError("CONDITIONAL_ORDER_NOT_FOUND");
  }
  return new ConditionalOrderProviderError("UPSTREAM_UNKNOWN_ERROR");
}

export function decodeConditionalOrderDetail(input: unknown) {
  const envelope = decodeReadonlyConditionalOrderEnvelope(input);
  if (!envelope.ok) throw upstreamError(envelope.error.code);
  return cloneConditionalOrder(envelope.result);
}

export function decodeConditionalOrderPage(
  input: unknown,
): ConditionalOrderHistoryPage {
  const envelope = decodeTossEnvelope(
    input,
    tossPaginatedConditionalOrderResponseSchema,
  );
  if (!envelope.ok) throw upstreamError(envelope.error.code);
  const nextCursor = envelope.result.nextCursor ?? null;
  if (
    (envelope.result.hasNext && nextCursor === null) ||
    (!envelope.result.hasNext && nextCursor !== null)
  ) {
    throw new TossEnvelopeDecodeError("INVALID_RESULT");
  }
  return cloneConditionalOrderPage({
    conditionalOrders: envelope.result.conditionalOrders.map(
      decodeReadonlyConditionalOrder,
    ),
    nextCursor,
    hasNext: envelope.result.hasNext,
  });
}
