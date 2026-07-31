"use client";

import type { OrderHistoryBffError } from "./order-history-bff-client";

export const ORDER_HISTORY_TTL_MS = 2_000;

export const ORDER_QUERY_KEY = "orders";

export function orderListQueryKey(
  accountRef: string | undefined,
  status: "OPEN" | "CLOSED",
  filter: Readonly<{
    symbol?: string;
    from?: string;
    to?: string;
    limit: number;
  }>,
) {
  return [
    ORDER_QUERY_KEY,
    "list",
    accountRef ?? "unselected",
    status,
    filter.symbol ?? null,
    filter.from ?? null,
    filter.to ?? null,
    status === "CLOSED" ? filter.limit : null,
  ] as const;
}

export function orderDetailQueryKey(
  accountRef: string | undefined,
  orderId: string,
) {
  return [
    ORDER_QUERY_KEY,
    "detail",
    accountRef ?? "unselected",
    orderId,
  ] as const;
}

export function shouldRetryOrderQuery(
  failureCount: number,
  error: Error,
): boolean {
  const typed = error as Partial<OrderHistoryBffError>;
  return (
    failureCount < 1 &&
    typed.retryable === true &&
    typeof typed.status === "number" &&
    ![400, 401, 403, 404, 409, 429].includes(typed.status)
  );
}
