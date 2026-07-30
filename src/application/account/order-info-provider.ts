import type {
  BuyingPower,
  Commission,
  SellableQuantity,
} from "../../domain/account/order-info";

export type OrderInfoProvider = Readonly<{
  getBuyingPower(accountSeq: number, currency: "KRW" | "USD"): Promise<BuyingPower>;
  getSellableQuantity(
    accountSeq: number,
    symbol: string,
  ): Promise<SellableQuantity>;
  getCommissions(accountSeq: number): Promise<readonly Commission[]>;
}>;

export class OrderInfoProviderError extends Error {
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
    super("ORDER_INFO_PROVIDER_ERROR");
    this.name = "OrderInfoProviderError";
    this.stack = undefined;
  }
}

export function cloneBuyingPower(value: BuyingPower): BuyingPower {
  return Object.freeze(structuredClone(value));
}

export function cloneSellableQuantity(
  value: SellableQuantity,
): SellableQuantity {
  return Object.freeze(structuredClone(value));
}

export function cloneCommissions(
  value: readonly Commission[],
): readonly Commission[] {
  return Object.freeze(
    value.map((commission) => Object.freeze(structuredClone(commission))),
  );
}
