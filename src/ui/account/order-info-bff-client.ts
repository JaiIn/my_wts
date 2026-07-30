"use client";

export type BffBuyingPower = Readonly<{
  currency: string;
  cashBuyingPower: string;
}>;
export type BffSellableQuantity = Readonly<{
  symbol: string;
  sellableQuantity: string;
}>;
export type BffCommission = Readonly<{
  marketCountry: string;
  commissionRate: string;
  startDate?: string | null;
  endDate?: string | null;
}>;

export class OrderInfoBffError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly requestId?: string,
  ) {
    super("ORDER_INFO_BFF_REQUEST_FAILED");
    this.name = "OrderInfoBffError";
  }
}

const DECIMAL_PATTERN =
  /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decimal(value: unknown): string {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    throw new OrderInfoBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return value;
}

async function request(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
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
    throw new OrderInfoBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  if (!isRecord(body)) {
    throw new OrderInfoBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  if (!response.ok) {
    const error = isRecord(body.error) ? body.error : {};
    throw new OrderInfoBffError(
      typeof error.code === "string" ? error.code : "BFF_REQUEST_FAILED",
      response.status,
      error.retryable === true,
      typeof error.requestId === "string" ? error.requestId : undefined,
    );
  }
  return body.data;
}

export async function getBuyingPower(
  currency: "KRW" | "USD",
  signal?: AbortSignal,
): Promise<BffBuyingPower> {
  const data = await request(
    `/api/v1/order-info/buying-power?currency=${currency}`,
    signal,
  );
  if (
    !isRecord(data) ||
    typeof data.currency !== "string"
  ) {
    throw new OrderInfoBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return Object.freeze({
    currency: data.currency,
    cashBuyingPower: decimal(data.cashBuyingPower),
  });
}

export async function getSellableQuantity(
  symbol: string,
  signal?: AbortSignal,
): Promise<BffSellableQuantity> {
  const canonical = symbol.trim().toUpperCase();
  if (!/^[A-Za-z0-9.-]{1,32}$/.test(canonical)) {
    throw new OrderInfoBffError("VALIDATION_FAILED", 400, false);
  }
  const data = await request(
    `/api/v1/order-info/sellable-quantity?symbol=${encodeURIComponent(canonical)}`,
    signal,
  );
  if (!isRecord(data) || typeof data.symbol !== "string") {
    throw new OrderInfoBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return Object.freeze({
    symbol: data.symbol,
    sellableQuantity: decimal(data.sellableQuantity),
  });
}

export async function getCommissions(
  signal?: AbortSignal,
): Promise<readonly BffCommission[]> {
  const data = await request("/api/v1/order-info/commissions", signal);
  if (!Array.isArray(data)) {
    throw new OrderInfoBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return Object.freeze(
    data.map((value) => {
      if (
        !isRecord(value) ||
        typeof value.marketCountry !== "string" ||
        !(
          value.startDate === undefined ||
          value.startDate === null ||
          typeof value.startDate === "string"
        ) ||
        !(
          value.endDate === undefined ||
          value.endDate === null ||
          typeof value.endDate === "string"
        )
      ) {
        throw new OrderInfoBffError("INVALID_BFF_RESPONSE", 502, false);
      }
      return Object.freeze({
        marketCountry: value.marketCountry,
        commissionRate: decimal(value.commissionRate),
        startDate: value.startDate,
        endDate: value.endDate,
      });
    }),
  );
}
