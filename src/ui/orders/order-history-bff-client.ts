"use client";

export type BffOrderStatus = Readonly<{
  code: string;
  kind: string;
  label: string;
}>;

export type BffOrderExecution = Readonly<{
  filledQuantity: string;
  averageFilledPrice: string | null;
  filledAmount: string | null;
  commission: string | null;
  tax: string | null;
  filledAt: string | null;
  settlementDate: string | null;
}>;

export type BffOrder = Readonly<{
  orderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  orderType: string;
  timeInForce: string;
  status: BffOrderStatus;
  price?: string | null;
  quantity: string;
  orderAmount?: string | null;
  currency: string;
  orderedAt: string;
  canceledAt?: string | null;
  execution: BffOrderExecution;
}>;

export type BffOrderPage = Readonly<{
  orders: readonly BffOrder[];
  nextCursor: string | null;
  hasNext: boolean;
}>;

export type OrderHistoryInput = Readonly<{
  status: "OPEN" | "CLOSED";
  symbol?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}>;

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;
const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export class OrderHistoryBffError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly requestId?: string,
  ) {
    super("ORDER_HISTORY_BFF_REQUEST_FAILED");
    this.name = "OrderHistoryBffError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decimal(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    throw new OrderHistoryBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new OrderHistoryBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return value;
}

function decodeOrder(value: unknown): BffOrder {
  if (
    !isRecord(value) ||
    !isRecord(value.status) ||
    !isRecord(value.execution) ||
    typeof value.orderId !== "string" ||
    !ORDER_ID_PATTERN.test(value.orderId) ||
    typeof value.symbol !== "string" ||
    (value.side !== "BUY" && value.side !== "SELL") ||
    typeof value.orderType !== "string" ||
    typeof value.timeInForce !== "string" ||
    typeof value.status.code !== "string" ||
    typeof value.status.kind !== "string" ||
    typeof value.status.label !== "string" ||
    typeof value.currency !== "string" ||
    typeof value.orderedAt !== "string"
  ) {
    throw new OrderHistoryBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  const execution = Object.freeze({
    filledQuantity: decimal(value.execution.filledQuantity) as string,
    averageFilledPrice: decimal(value.execution.averageFilledPrice, true),
    filledAmount: decimal(value.execution.filledAmount, true),
    commission: decimal(value.execution.commission, true),
    tax: decimal(value.execution.tax, true),
    filledAt: nullableString(value.execution.filledAt),
    settlementDate: nullableString(value.execution.settlementDate),
  });
  return Object.freeze({
    orderId: value.orderId,
    symbol: value.symbol,
    side: value.side,
    orderType: value.orderType,
    timeInForce: value.timeInForce,
    status: Object.freeze({
      code: value.status.code,
      kind: value.status.kind,
      label: value.status.label,
    }),
    ...(value.price === undefined ? {} : { price: decimal(value.price, true) }),
    quantity: decimal(value.quantity) as string,
    ...(value.orderAmount === undefined
      ? {}
      : { orderAmount: decimal(value.orderAmount, true) }),
    currency: value.currency,
    orderedAt: value.orderedAt,
    ...(value.canceledAt === undefined
      ? {}
      : { canceledAt: nullableString(value.canceledAt) }),
    execution,
  });
}

async function responseBody(
  response: Response,
): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    if (
      !response.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      throw new Error("INVALID_CONTENT_TYPE");
    }
    body = await response.json();
  } catch {
    throw new OrderHistoryBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  if (!isRecord(body)) {
    throw new OrderHistoryBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  if (!response.ok) {
    const error = isRecord(body.error) ? body.error : {};
    throw new OrderHistoryBffError(
      typeof error.code === "string" ? error.code : "BFF_REQUEST_FAILED",
      response.status,
      error.retryable === true,
      typeof error.requestId === "string" ? error.requestId : undefined,
    );
  }
  return body;
}

export function canonicalOrderId(value: string): string {
  const canonical = value.trim();
  if (!ORDER_ID_PATTERN.test(canonical)) {
    throw new OrderHistoryBffError("VALIDATION_FAILED", 400, false);
  }
  return canonical;
}

export async function getOrderHistory(
  input: OrderHistoryInput,
  signal?: AbortSignal,
): Promise<BffOrderPage> {
  const query = new URLSearchParams({ status: input.status });
  if (input.symbol !== undefined) query.set("symbol", input.symbol);
  if (input.from !== undefined) query.set("from", input.from);
  if (input.to !== undefined) query.set("to", input.to);
  if (input.cursor !== undefined) query.set("cursor", input.cursor);
  if (input.limit !== undefined) query.set("limit", String(input.limit));
  const response = await fetch(`/api/v1/orders?${query.toString()}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await responseBody(response);
  const data = isRecord(body.data) ? body.data : undefined;
  if (
    !data ||
    !Array.isArray(data.orders) ||
    (data.nextCursor !== null && typeof data.nextCursor !== "string") ||
    typeof data.hasNext !== "boolean" ||
    data.hasNext !== (data.nextCursor !== null)
  ) {
    throw new OrderHistoryBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return Object.freeze({
    orders: Object.freeze(data.orders.map(decodeOrder)),
    nextCursor: data.nextCursor,
    hasNext: data.hasNext,
  });
}

export async function getOrderDetail(
  orderId: string,
  signal?: AbortSignal,
): Promise<BffOrder> {
  const canonical = canonicalOrderId(orderId);
  const response = await fetch(
    `/api/v1/orders/${encodeURIComponent(canonical)}`,
    {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    },
  );
  const body = await responseBody(response);
  return decodeOrder(body.data);
}
