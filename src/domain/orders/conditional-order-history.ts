import type { ReadonlyConditionalOrder } from "./conditional-order";

export type ConditionalOrderHistoryGroup = "OPEN" | "CLOSED";

export type ConditionalOrderHistoryQuery = Readonly<{
  status: ConditionalOrderHistoryGroup;
  symbol?: string;
  cursor?: string;
  limit: number;
}>;

export type ConditionalOrderHistoryPage = Readonly<{
  conditionalOrders: readonly ReadonlyConditionalOrder[];
  nextCursor: string | null;
  hasNext: boolean;
}>;
