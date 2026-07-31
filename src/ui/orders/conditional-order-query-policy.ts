"use client";

import type { ConditionalOrderBffError } from "./conditional-order-bff-client";

export const CONDITIONAL_ORDER_HISTORY_TTL_MS = 2_000;
export const CONDITIONAL_ORDER_QUERY_KEY = "conditional-orders";

export function conditionalOrderListQueryKey(
  accountRef: string | undefined,
  status: "OPEN" | "CLOSED",
  symbol: string | undefined,
  limit: number,
) {
  return [
    CONDITIONAL_ORDER_QUERY_KEY,
    "list",
    accountRef ?? "unselected",
    status,
    symbol ?? null,
    limit,
  ] as const;
}

export function conditionalOrderDetailQueryKey(
  accountRef: string | undefined,
  conditionalOrderId: string,
) {
  return [
    CONDITIONAL_ORDER_QUERY_KEY,
    "detail",
    accountRef ?? "unselected",
    conditionalOrderId,
  ] as const;
}

export function shouldRetryConditionalOrderQuery(
  failureCount: number,
  error: Error,
): boolean {
  const typed = error as Partial<ConditionalOrderBffError>;
  return (
    failureCount < 1 &&
    typed.retryable === true &&
    typeof typed.status === "number" &&
    ![400, 401, 403, 404, 409, 429].includes(typed.status)
  );
}
