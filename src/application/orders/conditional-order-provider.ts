import type {
  ConditionalOrderHistoryPage,
  ConditionalOrderHistoryQuery,
} from "../../domain/orders/conditional-order-history";
import type {
  ConditionalOrderLeg,
  ReadonlyConditionalOrder,
} from "../../domain/orders/conditional-order";

export type ConditionalOrderHistoryProvider = Readonly<{
  getConditionalOrders(
    accountSeq: number,
    query: ConditionalOrderHistoryQuery,
  ): Promise<ConditionalOrderHistoryPage>;
  getConditionalOrder(
    accountSeq: number,
    conditionalOrderId: string,
  ): Promise<ReadonlyConditionalOrder>;
}>;

export class ConditionalOrderProviderError extends Error {
  readonly stack = undefined;

  constructor(
    readonly code:
      | "INVALID_CURSOR"
      | "CONDITIONAL_ORDER_NOT_FOUND"
      | "UPSTREAM_AUTH_FAILED"
      | "UPSTREAM_RATE_LIMITED"
      | "UPSTREAM_TIMEOUT"
      | "UPSTREAM_UNAVAILABLE"
      | "UPSTREAM_INVALID_RESPONSE"
      | "UPSTREAM_UNKNOWN_ERROR",
    readonly retryable = false,
    readonly retryAfterSeconds?: number,
  ) {
    super("CONDITIONAL_ORDER_PROVIDER_ERROR");
    this.name = "ConditionalOrderProviderError";
  }
}

function cloneLeg(value: ConditionalOrderLeg): ConditionalOrderLeg {
  return Object.freeze({
    ...value,
    type: Object.freeze({ ...value.type }),
    status: Object.freeze({ ...value.status }),
  });
}

export function cloneConditionalOrder(
  value: ReadonlyConditionalOrder,
): ReadonlyConditionalOrder {
  return Object.freeze({
    ...value,
    type: Object.freeze({ ...value.type }),
    status: Object.freeze({ ...value.status }),
    first: cloneLeg(value.first),
    ...(value.second === undefined
      ? {}
      : { second: value.second === null ? null : cloneLeg(value.second) }),
  });
}

export function cloneConditionalOrderPage(
  page: ConditionalOrderHistoryPage,
): ConditionalOrderHistoryPage {
  return Object.freeze({
    conditionalOrders: Object.freeze(
      page.conditionalOrders.map(cloneConditionalOrder),
    ),
    nextCursor: page.nextCursor,
    hasNext: page.hasNext,
  });
}
