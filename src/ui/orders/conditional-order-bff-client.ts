"use client";

export type BffConditionalCode = Readonly<{
  code: string;
  kind: string;
  label: string;
}>;

export type BffConditionalLeg = Readonly<{
  type: BffConditionalCode;
  status: BffConditionalCode;
  triggerPrice?: string | null;
  targetProfitRate?: string | null;
  orderPrice?: string | null;
  triggeredOrderId?: string | null;
}>;

export type BffConditionalOrder = Readonly<{
  conditionalOrderId: string;
  type: BffConditionalCode;
  status: BffConditionalCode;
  symbol: string;
  market: string;
  quantity: string;
  orderType: string;
  expireDate?: string;
  first: BffConditionalLeg;
  second?: BffConditionalLeg | null;
  createdAt: string;
}>;

export type BffConditionalOrderPage = Readonly<{
  conditionalOrders: readonly BffConditionalOrder[];
  nextCursor: string | null;
  hasNext: boolean;
}>;

export type ConditionalOrderInput = Readonly<{
  status: "OPEN" | "CLOSED";
  symbol?: string;
  cursor?: string;
  limit?: number;
}>;

const DECIMAL = /^\d+(?:\.\d+)?$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export class ConditionalOrderBffError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly requestId?: string,
  ) {
    super("CONDITIONAL_ORDER_BFF_REQUEST_FAILED");
    this.name = "ConditionalOrderBffError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function code(value: unknown): BffConditionalCode {
  if (
    !record(value) ||
    typeof value.code !== "string" ||
    typeof value.kind !== "string" ||
    typeof value.label !== "string"
  ) {
    throw new ConditionalOrderBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return Object.freeze({
    code: value.code,
    kind: value.kind,
    label: value.label,
  });
}

function decimal(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    throw new ConditionalOrderBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return value;
}

function leg(value: unknown): BffConditionalLeg {
  if (
    !record(value) ||
    (value.triggeredOrderId !== undefined &&
      value.triggeredOrderId !== null &&
      (typeof value.triggeredOrderId !== "string" ||
        !SAFE_ID.test(value.triggeredOrderId)))
  ) {
    throw new ConditionalOrderBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return Object.freeze({
    type: code(value.type),
    status: code(value.status),
    ...(value.triggerPrice === undefined
      ? {}
      : { triggerPrice: decimal(value.triggerPrice) }),
    ...(value.targetProfitRate === undefined
      ? {}
      : { targetProfitRate: decimal(value.targetProfitRate) }),
    ...(value.orderPrice === undefined
      ? {}
      : { orderPrice: decimal(value.orderPrice) }),
    ...(value.triggeredOrderId === undefined
      ? {}
      : { triggeredOrderId: value.triggeredOrderId as string | null }),
  });
}

function conditionalOrder(value: unknown): BffConditionalOrder {
  if (
    !record(value) ||
    typeof value.conditionalOrderId !== "string" ||
    !SAFE_ID.test(value.conditionalOrderId) ||
    typeof value.symbol !== "string" ||
    typeof value.market !== "string" ||
    typeof value.orderType !== "string" ||
    typeof value.createdAt !== "string" ||
    (value.expireDate !== undefined && typeof value.expireDate !== "string")
  ) {
    throw new ConditionalOrderBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  const second =
    value.second === undefined
      ? undefined
      : value.second === null
        ? null
        : leg(value.second);
  return Object.freeze({
    conditionalOrderId: value.conditionalOrderId,
    type: code(value.type),
    status: code(value.status),
    symbol: value.symbol,
    market: value.market,
    quantity: decimal(value.quantity) as string,
    orderType: value.orderType,
    ...(value.expireDate === undefined ? {} : { expireDate: value.expireDate }),
    first: leg(value.first),
    ...(second === undefined ? {} : { second }),
    createdAt: value.createdAt,
  });
}

async function body(response: Response): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    if (
      !response.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      throw new Error("INVALID_CONTENT_TYPE");
    }
    value = await response.json();
  } catch {
    throw new ConditionalOrderBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  if (!record(value)) {
    throw new ConditionalOrderBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  if (!response.ok) {
    const error = record(value.error) ? value.error : {};
    throw new ConditionalOrderBffError(
      typeof error.code === "string" ? error.code : "BFF_REQUEST_FAILED",
      response.status,
      error.retryable === true,
      typeof error.requestId === "string" ? error.requestId : undefined,
    );
  }
  return value;
}

export function canonicalConditionalOrderId(value: string): string {
  const result = value.trim();
  if (!SAFE_ID.test(result)) {
    throw new ConditionalOrderBffError("VALIDATION_FAILED", 400, false);
  }
  return result;
}

export async function getConditionalOrderHistory(
  input: ConditionalOrderInput,
  signal?: AbortSignal,
): Promise<BffConditionalOrderPage> {
  const query = new URLSearchParams({ status: input.status });
  if (input.symbol !== undefined) query.set("symbol", input.symbol);
  if (input.cursor !== undefined) query.set("cursor", input.cursor);
  if (input.limit !== undefined) query.set("limit", String(input.limit));
  const response = await fetch(
    `/api/v1/conditional-orders?${query.toString()}`,
    {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    },
  );
  const envelope = await body(response);
  const data = record(envelope.data) ? envelope.data : undefined;
  if (
    !data ||
    !Array.isArray(data.conditionalOrders) ||
    (data.nextCursor !== null && typeof data.nextCursor !== "string") ||
    typeof data.hasNext !== "boolean" ||
    data.hasNext !== (data.nextCursor !== null)
  ) {
    throw new ConditionalOrderBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return Object.freeze({
    conditionalOrders: Object.freeze(
      data.conditionalOrders.map(conditionalOrder),
    ),
    nextCursor: data.nextCursor,
    hasNext: data.hasNext,
  });
}

export async function getConditionalOrderDetail(
  conditionalOrderId: string,
  signal?: AbortSignal,
): Promise<BffConditionalOrder> {
  const id = canonicalConditionalOrderId(conditionalOrderId);
  const response = await fetch(
    `/api/v1/conditional-orders/${encodeURIComponent(id)}`,
    {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    },
  );
  const envelope = await body(response);
  return conditionalOrder(envelope.data);
}
