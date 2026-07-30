import { z } from "zod";

import { decimalStringSchema } from "../../domain/common/decimal";

const nonNegativeDecimalSchema = decimalStringSchema.refine(
  (value) => !value.startsWith("-"),
  "NEGATIVE_DECIMAL_NOT_ALLOWED",
);

const signedDecimalSchema = decimalStringSchema;
const forwardCompatibleEnumSchema = z.string().min(1).max(128);

const nonNegativeCurrencyAmountsSchema = z.looseObject({
  krw: nonNegativeDecimalSchema,
  usd: nonNegativeDecimalSchema.nullable().optional(),
});

const signedCurrencyAmountsSchema = z.looseObject({
  krw: signedDecimalSchema,
  usd: signedDecimalSchema.nullable().optional(),
});

const overviewMarketValueSchema = z.looseObject({
  amount: nonNegativeCurrencyAmountsSchema,
  amountAfterCost: nonNegativeCurrencyAmountsSchema,
});

const overviewProfitLossSchema = z.looseObject({
  amount: signedCurrencyAmountsSchema,
  amountAfterCost: signedCurrencyAmountsSchema,
  rate: signedDecimalSchema,
  rateAfterCost: signedDecimalSchema,
});

const overviewDailyProfitLossSchema = z.looseObject({
  amount: signedCurrencyAmountsSchema,
  rate: signedDecimalSchema,
});

export const tossHoldingsItemSchema = z.looseObject({
  symbol: z.string().min(1).max(32).regex(/^[A-Za-z0-9._-]+$/),
  name: z.string().min(1).max(256),
  marketCountry: forwardCompatibleEnumSchema,
  currency: forwardCompatibleEnumSchema,
  quantity: nonNegativeDecimalSchema,
  lastPrice: nonNegativeDecimalSchema,
  averagePurchasePrice: nonNegativeDecimalSchema,
  marketValue: z.looseObject({
    purchaseAmount: nonNegativeDecimalSchema,
    amount: nonNegativeDecimalSchema,
    amountAfterCost: nonNegativeDecimalSchema,
  }),
  profitLoss: z.looseObject({
    amount: signedDecimalSchema,
    amountAfterCost: signedDecimalSchema,
    rate: signedDecimalSchema,
    rateAfterCost: signedDecimalSchema,
  }),
  dailyProfitLoss: z.looseObject({
    amount: signedDecimalSchema,
    rate: signedDecimalSchema,
  }),
  cost: z.looseObject({
    commission: nonNegativeDecimalSchema,
    tax: nonNegativeDecimalSchema.nullable().optional(),
  }),
});

export const tossHoldingsOverviewSchema = z.looseObject({
  totalPurchaseAmount: nonNegativeCurrencyAmountsSchema,
  marketValue: overviewMarketValueSchema,
  profitLoss: overviewProfitLossSchema,
  dailyProfitLoss: overviewDailyProfitLossSchema,
  items: z.array(tossHoldingsItemSchema),
});

export type TossHoldingsOverview = z.infer<
  typeof tossHoldingsOverviewSchema
>;
