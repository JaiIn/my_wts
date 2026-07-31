import type { ReadonlyOrder } from "./readonly-order";

export type OrderHistoryGroup = "OPEN" | "CLOSED";

export type OrderHistoryQuery = Readonly<{
  status: OrderHistoryGroup;
  symbol?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit: number;
}>;

export type OrderHistoryPage = Readonly<{
  orders: readonly ReadonlyOrder[];
  nextCursor: string | null;
  hasNext: boolean;
}>;
