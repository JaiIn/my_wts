"use client";

export type BffCurrencyAmounts = Readonly<{
  krw: string;
  usd?: string | null;
}>;

export type BffHolding = Readonly<{
  symbol: string;
  name: string;
  marketCountry: string;
  currency: string;
  quantity: string;
  lastPrice: string;
  averagePurchasePrice: string;
  marketValue: Readonly<{
    purchaseAmount: string;
    amount: string;
    amountAfterCost: string;
  }>;
  profitLoss: Readonly<{
    amount: string;
    amountAfterCost: string;
    rate: string;
    rateAfterCost: string;
  }>;
  dailyProfitLoss: Readonly<{ amount: string; rate: string }>;
}>;

export type BffHoldings = Readonly<{
  totalPurchaseAmount: BffCurrencyAmounts;
  marketValue: Readonly<{
    amount: BffCurrencyAmounts;
    amountAfterCost: BffCurrencyAmounts;
  }>;
  profitLoss: Readonly<{
    amount: BffCurrencyAmounts;
    amountAfterCost: BffCurrencyAmounts;
    rate: string;
    rateAfterCost: string;
  }>;
  dailyProfitLoss: Readonly<{
    amount: BffCurrencyAmounts;
    rate: string;
  }>;
  items: readonly BffHolding[];
}>;

export class HoldingsBffError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly requestId?: string,
  ) {
    super("HOLDINGS_BFF_REQUEST_FAILED");
    this.name = "HoldingsBffError";
  }
}

const DECIMAL_PATTERN =
  /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decimal(value: unknown): string {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    throw new HoldingsBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return value;
}

function currencyAmounts(value: unknown): BffCurrencyAmounts {
  if (!isRecord(value)) {
    throw new HoldingsBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return Object.freeze({
    krw: decimal(value.krw),
    usd:
      value.usd === undefined || value.usd === null
        ? value.usd
        : decimal(value.usd),
  });
}

function holding(value: unknown): BffHolding {
  if (
    !isRecord(value) ||
    !isRecord(value.marketValue) ||
    !isRecord(value.profitLoss) ||
    !isRecord(value.dailyProfitLoss) ||
    typeof value.symbol !== "string" ||
    typeof value.name !== "string" ||
    typeof value.marketCountry !== "string" ||
    typeof value.currency !== "string"
  ) {
    throw new HoldingsBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return Object.freeze({
    symbol: value.symbol,
    name: value.name,
    marketCountry: value.marketCountry,
    currency: value.currency,
    quantity: decimal(value.quantity),
    lastPrice: decimal(value.lastPrice),
    averagePurchasePrice: decimal(value.averagePurchasePrice),
    marketValue: Object.freeze({
      purchaseAmount: decimal(value.marketValue.purchaseAmount),
      amount: decimal(value.marketValue.amount),
      amountAfterCost: decimal(value.marketValue.amountAfterCost),
    }),
    profitLoss: Object.freeze({
      amount: decimal(value.profitLoss.amount),
      amountAfterCost: decimal(value.profitLoss.amountAfterCost),
      rate: decimal(value.profitLoss.rate),
      rateAfterCost: decimal(value.profitLoss.rateAfterCost),
    }),
    dailyProfitLoss: Object.freeze({
      amount: decimal(value.dailyProfitLoss.amount),
      rate: decimal(value.dailyProfitLoss.rate),
    }),
  });
}

function decodeHoldings(value: unknown): BffHoldings {
  if (
    !isRecord(value) ||
    !isRecord(value.marketValue) ||
    !isRecord(value.profitLoss) ||
    !isRecord(value.dailyProfitLoss) ||
    !Array.isArray(value.items)
  ) {
    throw new HoldingsBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return Object.freeze({
    totalPurchaseAmount: currencyAmounts(value.totalPurchaseAmount),
    marketValue: Object.freeze({
      amount: currencyAmounts(value.marketValue.amount),
      amountAfterCost: currencyAmounts(value.marketValue.amountAfterCost),
    }),
    profitLoss: Object.freeze({
      amount: currencyAmounts(value.profitLoss.amount),
      amountAfterCost: currencyAmounts(value.profitLoss.amountAfterCost),
      rate: decimal(value.profitLoss.rate),
      rateAfterCost: decimal(value.profitLoss.rateAfterCost),
    }),
    dailyProfitLoss: Object.freeze({
      amount: currencyAmounts(value.dailyProfitLoss.amount),
      rate: decimal(value.dailyProfitLoss.rate),
    }),
    items: Object.freeze(value.items.map(holding)),
  });
}

export async function getHoldings(
  signal?: AbortSignal,
): Promise<BffHoldings> {
  const response = await fetch("/api/v1/portfolio/holdings", {
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
    throw new HoldingsBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  if (!isRecord(body)) {
    throw new HoldingsBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  if (!response.ok) {
    const error = isRecord(body.error) ? body.error : {};
    throw new HoldingsBffError(
      typeof error.code === "string" ? error.code : "BFF_REQUEST_FAILED",
      response.status,
      error.retryable === true,
      typeof error.requestId === "string" ? error.requestId : undefined,
    );
  }
  return decodeHoldings(body.data);
}
