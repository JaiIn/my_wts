import type {
  OrderHistoryPage,
  OrderHistoryQuery,
} from "../../domain/orders/order-history";
import type { ReadonlyOrder } from "../../domain/orders/readonly-order";

export type OrderHistoryProvider = Readonly<{
  getOrders(
    accountSeq: number,
    query: OrderHistoryQuery,
  ): Promise<OrderHistoryPage>;
  getOrder(accountSeq: number, orderId: string): Promise<ReadonlyOrder>;
}>;

export class OrderHistoryProviderError extends Error {
  readonly stack = undefined;

  constructor(
    readonly code:
      | "INVALID_CURSOR"
      | "ORDER_NOT_FOUND"
      | "UPSTREAM_AUTH_FAILED"
      | "UPSTREAM_RATE_LIMITED"
      | "UPSTREAM_TIMEOUT"
      | "UPSTREAM_UNAVAILABLE"
      | "UPSTREAM_INVALID_RESPONSE"
      | "UPSTREAM_UNKNOWN_ERROR",
    readonly retryable = false,
  ) {
    super("ORDER_HISTORY_PROVIDER_ERROR");
    this.name = "OrderHistoryProviderError";
  }
}

function cloneOrder(order: ReadonlyOrder): ReadonlyOrder {
  return Object.freeze({
    ...order,
    status: Object.freeze({ ...order.status }),
    execution: Object.freeze({ ...order.execution }),
  });
}

export function cloneOrderHistoryPage(
  page: OrderHistoryPage,
): OrderHistoryPage {
  return Object.freeze({
    orders: Object.freeze(page.orders.map(cloneOrder)),
    nextCursor: page.nextCursor,
    hasNext: page.hasNext,
  });
}
