import type { DecimalString } from "../common/decimal";

export type BuyingPower = Readonly<{
  currency: string;
  cashBuyingPower: DecimalString;
}>;

export type SellableQuantity = Readonly<{
  symbol: string;
  sellableQuantity: DecimalString;
}>;

export type Commission = Readonly<{
  marketCountry: string;
  commissionRate: DecimalString;
  startDate?: string | null;
  endDate?: string | null;
}>;
