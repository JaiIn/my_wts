import {
  cloneOrderHistoryPage,
  OrderHistoryProviderError,
} from "../../application/orders/order-history-provider";
import type {
  OrderHistoryGroup,
  OrderHistoryPage,
} from "../../domain/orders/order-history";
import {
  decodeTossEnvelope,
  TossEnvelopeDecodeError,
} from "../../integrations/toss/envelope";
import { tossPaginatedOrderResponseSchema } from "../../integrations/toss/order-history-schemas";
import { decodeReadonlyOrder } from "./readonly-order-decoder";

function upstreamError(code: string): OrderHistoryProviderError {
  if (code === "rate-limit-exceeded") {
    return new OrderHistoryProviderError("UPSTREAM_RATE_LIMITED", true);
  }
  if (code === "unauthorized") {
    return new OrderHistoryProviderError("UPSTREAM_AUTH_FAILED");
  }
  return new OrderHistoryProviderError("UPSTREAM_UNKNOWN_ERROR");
}

export function decodeOrderHistoryPage(
  input: unknown,
  group: OrderHistoryGroup,
): OrderHistoryPage {
  const envelope = decodeTossEnvelope(input, tossPaginatedOrderResponseSchema);
  if (!envelope.ok) throw upstreamError(envelope.error.code);
  const { hasNext, nextCursor } = envelope.result;
  if (
    (group === "OPEN" && (hasNext || nextCursor !== null)) ||
    (group === "CLOSED" &&
      ((hasNext && nextCursor === null) || (!hasNext && nextCursor !== null)))
  ) {
    throw new TossEnvelopeDecodeError("INVALID_RESULT");
  }
  return cloneOrderHistoryPage({
    orders: envelope.result.orders.map(decodeReadonlyOrder),
    nextCursor,
    hasNext,
  });
}
