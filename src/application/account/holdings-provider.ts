import type {
  HoldingsItem,
  HoldingsOverview,
  PublicHolding,
  PublicHoldingsOverview,
} from "../../domain/account/holdings";

export type HoldingsProvider = Readonly<{
  getHoldings(accountSeq: number, symbol?: string): Promise<HoldingsOverview>;
}>;

export class HoldingsProviderError extends Error {
  constructor(
    readonly code:
      | "UPSTREAM_AUTH_FAILED"
      | "UPSTREAM_RATE_LIMITED"
      | "UPSTREAM_TIMEOUT"
      | "UPSTREAM_UNAVAILABLE"
      | "UPSTREAM_INVALID_RESPONSE"
      | "UPSTREAM_UNKNOWN_ERROR",
    readonly retryable = false,
  ) {
    super("HOLDINGS_PROVIDER_ERROR");
    this.name = "HoldingsProviderError";
    this.stack = undefined;
  }
}

function cloneItem(item: HoldingsItem): HoldingsItem {
  return structuredClone(item);
}

export function cloneHoldings(value: HoldingsOverview): HoldingsOverview {
  return Object.freeze({
    ...structuredClone(value),
    items: Object.freeze(value.items.map(cloneItem)),
  });
}

function publicItem(item: HoldingsItem): PublicHolding {
  return Object.freeze({
    symbol: item.symbol,
    name: item.name,
    marketCountry: item.marketCountry,
    currency: item.currency,
    quantity: item.quantity,
    lastPrice: item.lastPrice,
    averagePurchasePrice: item.averagePurchasePrice,
    marketValue: structuredClone(item.marketValue),
    profitLoss: structuredClone(item.profitLoss),
    dailyProfitLoss: structuredClone(item.dailyProfitLoss),
  });
}

export function toPublicHoldings(
  value: HoldingsOverview,
): PublicHoldingsOverview {
  return Object.freeze({
    totalPurchaseAmount: structuredClone(value.totalPurchaseAmount),
    marketValue: structuredClone(value.marketValue),
    profitLoss: structuredClone(value.profitLoss),
    dailyProfitLoss: structuredClone(value.dailyProfitLoss),
    items: Object.freeze(value.items.map(publicItem)),
  });
}
