import type { DecimalString } from "../common/decimal";

export type CurrencyAmounts = Readonly<{
  krw: DecimalString;
  usd?: DecimalString | null;
}>;

export type HoldingsItem = Readonly<{
  symbol: string;
  name: string;
  marketCountry: string;
  currency: string;
  quantity: DecimalString;
  lastPrice: DecimalString;
  averagePurchasePrice: DecimalString;
  marketValue: Readonly<{
    purchaseAmount: DecimalString;
    amount: DecimalString;
    amountAfterCost: DecimalString;
  }>;
  profitLoss: Readonly<{
    amount: DecimalString;
    amountAfterCost: DecimalString;
    rate: DecimalString;
    rateAfterCost: DecimalString;
  }>;
  dailyProfitLoss: Readonly<{
    amount: DecimalString;
    rate: DecimalString;
  }>;
  cost: Readonly<{
    commission: DecimalString;
    tax?: DecimalString | null;
  }>;
}>;

export type HoldingsOverview = Readonly<{
  totalPurchaseAmount: CurrencyAmounts;
  marketValue: Readonly<{
    amount: CurrencyAmounts;
    amountAfterCost: CurrencyAmounts;
  }>;
  profitLoss: Readonly<{
    amount: CurrencyAmounts;
    amountAfterCost: CurrencyAmounts;
    rate: DecimalString;
    rateAfterCost: DecimalString;
  }>;
  dailyProfitLoss: Readonly<{
    amount: CurrencyAmounts;
    rate: DecimalString;
  }>;
  items: readonly HoldingsItem[];
}>;

export type PublicHolding = Omit<HoldingsItem, "cost">;
export type PublicHoldingsOverview = Omit<HoldingsOverview, "items"> &
  Readonly<{ items: readonly PublicHolding[] }>;
