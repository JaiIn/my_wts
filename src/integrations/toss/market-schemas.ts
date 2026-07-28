import { z } from "zod";

import { decimalStringSchema } from "../../domain/common/decimal";

export const tossSymbolSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9._-]+$/);

const forwardCompatibleEnumSchema = z.string().min(1);
const optionalDateSchema = z.iso.date().nullable().optional();
const optionalDecimalSchema = decimalStringSchema.nullable().optional();
const nonNegativeDecimalSchema = decimalStringSchema.refine(
  (value) => !value.startsWith("-"),
  "NEGATIVE_DECIMAL_NOT_ALLOWED",
);

const koreanMarketDetailSchema = z.looseObject({
  liquidationTrading: z.boolean(),
  nxtSupported: z.boolean(),
  krxTradingSuspended: z.boolean(),
  nxtTradingSuspended: z.boolean().nullable().optional(),
});

export const tossStockInfoSchema = z.looseObject({
  symbol: tossSymbolSchema,
  name: z.string(),
  englishName: z.string(),
  isinCode: z.string(),
  market: forwardCompatibleEnumSchema,
  securityType: forwardCompatibleEnumSchema,
  isCommonShare: z.boolean(),
  status: forwardCompatibleEnumSchema,
  currency: forwardCompatibleEnumSchema,
  listDate: optionalDateSchema,
  delistDate: optionalDateSchema,
  sharesOutstanding: decimalStringSchema,
  leverageFactor: optionalDecimalSchema,
  koreanMarketDetail: koreanMarketDetailSchema.nullable().optional(),
});

export const tossPriceResponseSchema = z.looseObject({
  symbol: tossSymbolSchema,
  timestamp: z.iso.datetime({ offset: true }).nullable().optional(),
  lastPrice: decimalStringSchema,
  currency: forwardCompatibleEnumSchema,
});

export const tossStockWarningSchema = z.looseObject({
  warningType: forwardCompatibleEnumSchema,
  exchange: z.string().nullable().optional(),
  startDate: optionalDateSchema,
  endDate: optionalDateSchema,
});

export const tossOrderbookEntrySchema = z.looseObject({
  price: nonNegativeDecimalSchema,
  volume: nonNegativeDecimalSchema,
});

export const tossOrderbookResponseSchema = z.looseObject({
  timestamp: z.iso.datetime({ offset: true }).nullable().optional(),
  currency: forwardCompatibleEnumSchema,
  asks: z.array(tossOrderbookEntrySchema),
  bids: z.array(tossOrderbookEntrySchema),
});

export const tossTradeSchema = z.looseObject({
  price: nonNegativeDecimalSchema,
  volume: nonNegativeDecimalSchema,
  timestamp: z.iso.datetime({ offset: true }),
  currency: forwardCompatibleEnumSchema,
});

export const tossCandleSchema = z.looseObject({
  timestamp: z.iso.datetime({ offset: true }),
  openPrice: nonNegativeDecimalSchema,
  highPrice: nonNegativeDecimalSchema,
  lowPrice: nonNegativeDecimalSchema,
  closePrice: nonNegativeDecimalSchema,
  volume: nonNegativeDecimalSchema,
  currency: forwardCompatibleEnumSchema,
});

export const tossCandlePageResponseSchema = z.looseObject({
  candles: z.array(tossCandleSchema),
  nextBefore: z.iso.datetime({ offset: true }).nullable().optional(),
});

const marketSessionSchema = z.looseObject({
  startTime: z.iso.datetime({ offset: true }),
  endTime: z.iso.datetime({ offset: true }),
});

const krMarketSessionSchema = marketSessionSchema.extend({
  singlePriceAuctionStartTime: z.iso
    .datetime({ offset: true })
    .nullable()
    .optional(),
  singlePriceAuctionEndTime: z.iso
    .datetime({ offset: true })
    .nullable()
    .optional(),
});

const krMarketDaySchema = z.looseObject({
  date: z.iso.date(),
  integrated: z
    .looseObject({
      preMarket: krMarketSessionSchema.nullable().optional(),
      regularMarket: krMarketSessionSchema.nullable().optional(),
      afterMarket: krMarketSessionSchema.nullable().optional(),
    })
    .nullable()
    .optional(),
});

const usMarketDaySchema = z.looseObject({
  date: z.iso.date(),
  dayMarket: marketSessionSchema.nullable().optional(),
  preMarket: marketSessionSchema.nullable().optional(),
  regularMarket: marketSessionSchema.nullable().optional(),
  afterMarket: marketSessionSchema.nullable().optional(),
});

export const tossKrMarketCalendarResponseSchema = z.looseObject({
  today: krMarketDaySchema,
  previousBusinessDay: krMarketDaySchema,
  nextBusinessDay: krMarketDaySchema,
});

export const tossUsMarketCalendarResponseSchema = z.looseObject({
  today: usMarketDaySchema,
  previousBusinessDay: usMarketDaySchema,
  nextBusinessDay: usMarketDaySchema,
});

const positiveDecimalSchema = decimalStringSchema.refine(
  (value) => !value.startsWith("-") && value !== "0",
  "POSITIVE_DECIMAL_REQUIRED",
);

export const tossExchangeRateResponseSchema = z.looseObject({
  baseCurrency: forwardCompatibleEnumSchema,
  quoteCurrency: forwardCompatibleEnumSchema,
  rate: positiveDecimalSchema,
  midRate: positiveDecimalSchema,
  basisPoint: decimalStringSchema,
  rateChangeType: z.enum(["UP", "EQUAL", "DOWN"]),
  validFrom: z.iso.datetime({ offset: true }),
  validUntil: z.iso.datetime({ offset: true }),
});

export const tossStockInfoListSchema = z.array(tossStockInfoSchema);
export const tossPriceResponseListSchema = z.array(tossPriceResponseSchema);
export const tossStockWarningListSchema = z.array(tossStockWarningSchema);
export const tossTradeListSchema = z.array(tossTradeSchema);

export type TossStockInfo = z.infer<typeof tossStockInfoSchema>;
export type TossPriceResponse = z.infer<typeof tossPriceResponseSchema>;
export type TossStockWarning = z.infer<typeof tossStockWarningSchema>;
export type TossOrderbookResponse = z.infer<typeof tossOrderbookResponseSchema>;
export type TossTrade = z.infer<typeof tossTradeSchema>;
export type TossCandle = z.infer<typeof tossCandleSchema>;
export type TossCandlePageResponse = z.infer<
  typeof tossCandlePageResponseSchema
>;
export type TossKrMarketCalendarResponse = z.infer<
  typeof tossKrMarketCalendarResponseSchema
>;
export type TossUsMarketCalendarResponse = z.infer<
  typeof tossUsMarketCalendarResponseSchema
>;
export type TossExchangeRateResponse = z.infer<
  typeof tossExchangeRateResponseSchema
>;
