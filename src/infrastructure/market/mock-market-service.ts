import {
  MarketDataInvalidCursorError,
  MarketDataNotFoundError,
  MarketDataSourceError,
  type MarketService,
} from "../../application/market/market-service";
import type {
  CandleInterval,
  ExchangeRate,
  MarketCandle,
  MarketCandlePage,
  MarketCalendar,
  MarketCountry,
  MarketDay,
  MarketOrderbook,
  MarketOrderbookLevel,
  MarketPrice,
  MarketStock,
  MarketTrade,
  MarketWarning,
} from "../../domain/market/market";
import { decimalFromString } from "../../domain/common/decimal";
import {
  decodeTossEnvelope,
  TossEnvelopeDecodeError,
} from "../../integrations/toss/envelope";
import {
  tossCandlePageResponseSchema,
  tossExchangeRateResponseSchema,
  tossKrMarketCalendarResponseSchema,
  tossOrderbookResponseSchema,
  tossPriceResponseListSchema,
  tossStockInfoListSchema,
  tossStockWarningListSchema,
  tossTradeListSchema,
  tossUsMarketCalendarResponseSchema,
  type TossCandle,
  type TossExchangeRateResponse,
  type TossKrMarketCalendarResponse,
  type TossOrderbookResponse,
  type TossPriceResponse,
  type TossStockInfo,
  type TossStockWarning,
  type TossTrade,
  type TossUsMarketCalendarResponse,
} from "../../integrations/toss/market-schemas";
import {
  MOCK_CANDLE_ERROR_TOSS_ENVELOPES,
  MOCK_CANDLE_TOSS_DATASETS,
  MOCK_ORDERBOOK_TOSS_ENVELOPES,
  MOCK_PRICES_TOSS_ENVELOPE,
  MOCK_STOCKS_TOSS_ENVELOPE,
  MOCK_TRADES_TOSS_ENVELOPES,
  MOCK_WARNINGS_TOSS_ENVELOPES,
} from "./mock-market-fixtures";
import {
  MOCK_EXCHANGE_RATE_TOSS_ENVELOPE,
  MOCK_KR_CALENDAR_TOSS_ENVELOPE,
  MOCK_US_CALENDAR_TOSS_ENVELOPE,
} from "./mock-reference-fixtures";
import type { z } from "zod";

export type MockMarketFixtureSet = {
  stocksEnvelope: unknown;
  pricesEnvelope: unknown;
  warningsEnvelopes?: Readonly<Record<string, unknown>>;
  orderbookEnvelopes?: Readonly<Record<string, unknown>>;
  tradesEnvelopes?: Readonly<Record<string, unknown>>;
  candleDatasets?: readonly {
    symbol: string;
    interval: string;
    candles: readonly unknown[];
  }[];
  candleErrorEnvelopes?: Readonly<Record<string, unknown>>;
  calendarEnvelopes?: Readonly<Partial<Record<MarketCountry, unknown>>>;
  exchangeRateEnvelopes?: Readonly<Record<string, unknown>>;
};

function compareSymbols(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function toMarketStock(stock: TossStockInfo): MarketStock {
  return {
    symbol: stock.symbol,
    displayName: stock.name,
    englishName: stock.englishName,
    isinCode: stock.isinCode,
    market: stock.market,
    securityType: stock.securityType,
    isCommonShare: stock.isCommonShare,
    status: stock.status,
    currency: stock.currency,
    listedOn: stock.listDate,
    delistedOn: stock.delistDate,
    sharesOutstanding: stock.sharesOutstanding,
    leverageFactor: stock.leverageFactor,
    koreanMarketDetail:
      stock.koreanMarketDetail === undefined
        ? undefined
        : stock.koreanMarketDetail === null
          ? null
          : {
              liquidationTrading: stock.koreanMarketDetail.liquidationTrading,
              nxtSupported: stock.koreanMarketDetail.nxtSupported,
              krxTradingSuspended: stock.koreanMarketDetail.krxTradingSuspended,
              nxtTradingSuspended: stock.koreanMarketDetail.nxtTradingSuspended,
            },
  };
}

function toMarketPrice(price: TossPriceResponse): MarketPrice {
  return {
    symbol: price.symbol,
    observedAt: price.timestamp,
    lastPrice: price.lastPrice,
    currency: price.currency,
  };
}

function toMarketWarning(warning: TossStockWarning): MarketWarning {
  return {
    warningType: warning.warningType,
    exchange: warning.exchange,
    startDate: warning.startDate,
    endDate: warning.endDate,
  };
}

function toOrderbookLevel(
  level: TossOrderbookResponse["asks"][number],
): MarketOrderbookLevel {
  return { price: level.price, volume: level.volume };
}

function toMarketOrderbook(orderbook: TossOrderbookResponse): MarketOrderbook {
  return {
    observedAt: orderbook.timestamp,
    currency: orderbook.currency,
    asks: orderbook.asks.map(toOrderbookLevel),
    bids: orderbook.bids.map(toOrderbookLevel),
  };
}

function toMarketTrade(trade: TossTrade): MarketTrade {
  return {
    price: trade.price,
    volume: trade.volume,
    observedAt: trade.timestamp,
    currency: trade.currency,
  };
}

function toMarketCandle(candle: TossCandle): MarketCandle {
  return {
    timestamp: candle.timestamp,
    openPrice: candle.openPrice,
    highPrice: candle.highPrice,
    lowPrice: candle.lowPrice,
    closePrice: candle.closePrice,
    volume: candle.volume,
    currency: candle.currency,
  };
}

function compareWarning(left: MarketWarning, right: MarketWarning): number {
  const leftDate = left.startDate ?? "";
  const rightDate = right.startDate ?? "";
  if (leftDate !== rightDate) {
    return leftDate > rightDate ? -1 : 1;
  }
  return compareSymbols(left.warningType, right.warningType);
}

function marketSourceError(code: string): MarketDataSourceError {
  if (code === "rate-limit-exceeded") {
    return new MarketDataSourceError("UPSTREAM_RATE_LIMITED", true);
  }
  if (code === "timeout") {
    return new MarketDataSourceError("UPSTREAM_TIMEOUT", true);
  }
  if (code === "internal-error" || code === "maintenance") {
    return new MarketDataSourceError("UPSTREAM_UNAVAILABLE", true);
  }
  return new MarketDataSourceError("UPSTREAM_UNKNOWN_ERROR", false);
}

function assertOrderbookContract(orderbook: MarketOrderbook): void {
  const seenPrices = new Set<string>();
  for (const level of [...orderbook.asks, ...orderbook.bids]) {
    const normalizedPrice = decimalFromString(level.price).toString();
    if (seenPrices.has(normalizedPrice)) {
      throw new TossEnvelopeDecodeError("INVALID_RESULT");
    }
    seenPrices.add(normalizedPrice);
  }

  for (let index = 1; index < orderbook.asks.length; index += 1) {
    const previous = orderbook.asks[index - 1];
    const current = orderbook.asks[index];
    if (
      previous &&
      current &&
      decimalFromString(previous.price).greaterThan(current.price)
    ) {
      throw new TossEnvelopeDecodeError("INVALID_RESULT");
    }
  }

  for (let index = 1; index < orderbook.bids.length; index += 1) {
    const previous = orderbook.bids[index - 1];
    const current = orderbook.bids[index];
    if (
      previous &&
      current &&
      decimalFromString(previous.price).lessThan(current.price)
    ) {
      throw new TossEnvelopeDecodeError("INVALID_RESULT");
    }
  }
}

function compareTrades(left: MarketTrade, right: MarketTrade): number {
  const timestampOrder =
    Date.parse(right.observedAt) - Date.parse(left.observedAt);
  if (timestampOrder !== 0) {
    return timestampOrder;
  }
  const priceOrder = decimalFromString(right.price).comparedTo(left.price);
  if (priceOrder !== 0) {
    return priceOrder;
  }
  return decimalFromString(right.volume).comparedTo(left.volume);
}

function assertCandleContract(candles: readonly MarketCandle[]): void {
  const timestamps = new Set<number>();
  let previousTimestamp = Number.POSITIVE_INFINITY;

  for (const candle of candles) {
    const timestamp = Date.parse(candle.timestamp);
    if (timestamps.has(timestamp) || timestamp >= previousTimestamp) {
      throw new TossEnvelopeDecodeError("INVALID_RESULT");
    }
    timestamps.add(timestamp);
    previousTimestamp = timestamp;

    const open = decimalFromString(candle.openPrice);
    const high = decimalFromString(candle.highPrice);
    const low = decimalFromString(candle.lowPrice);
    const close = decimalFromString(candle.closePrice);
    if (
      high.lessThan(open) ||
      high.lessThan(close) ||
      high.lessThan(low) ||
      low.greaterThan(open) ||
      low.greaterThan(close) ||
      low.greaterThan(high)
    ) {
      throw new TossEnvelopeDecodeError("INVALID_RESULT");
    }
  }
}

function candleKey(symbol: string, interval: CandleInterval): string {
  return `${symbol}:${interval}`;
}

type CalendarDayDto =
  TossKrMarketCalendarResponse["today"] | TossUsMarketCalendarResponse["today"];

function toMarketDay(day: CalendarDayDto, country: MarketCountry): MarketDay {
  const integrated =
    "integrated" in day
      ? (day.integrated as
          | {
              preMarket?: { startTime: string; endTime: string } | null;
              regularMarket?: { startTime: string; endTime: string } | null;
              afterMarket?: { startTime: string; endTime: string } | null;
            }
          | null
          | undefined)
      : undefined;
  const sessions =
    country === "KR"
      ? [
          ["pre", integrated?.preMarket],
          ["regular", integrated?.regularMarket],
          ["after", integrated?.afterMarket],
        ]
      : [
          ["day", "dayMarket" in day ? day.dayMarket : null],
          ["pre", "preMarket" in day ? day.preMarket : null],
          ["regular", "regularMarket" in day ? day.regularMarket : null],
          ["after", "afterMarket" in day ? day.afterMarket : null],
        ];

  return {
    date: day.date,
    sessions: sessions.flatMap(([kind, session]) => {
      const typedSession = session as
        { startTime: string; endTime: string } | null | undefined;
      return typedSession
        ? [
            {
              kind: kind as MarketDay["sessions"][number]["kind"],
              startTime: typedSession.startTime,
              endTime: typedSession.endTime,
            },
          ]
        : [];
    }),
  };
}

function assertCalendarContract(calendar: MarketCalendar, date: string): void {
  const days = [
    calendar.previousBusinessDay,
    calendar.today,
    calendar.nextBusinessDay,
  ];
  if (
    calendar.today.date !== date ||
    !(days[0]!.date < days[1]!.date && days[1]!.date < days[2]!.date) ||
    new Set(days.map(({ date: day }) => day)).size !== days.length
  ) {
    throw new TossEnvelopeDecodeError("INVALID_RESULT");
  }

  for (const day of days) {
    let previousEnd = Number.NEGATIVE_INFINITY;
    for (const session of day.sessions) {
      const start = Date.parse(session.startTime);
      const end = Date.parse(session.endTime);
      if (!Number.isFinite(start) || start >= end || start < previousEnd) {
        throw new TossEnvelopeDecodeError("INVALID_RESULT");
      }
      previousEnd = end;
    }
  }
}

function toMarketCalendar(
  country: MarketCountry,
  value: TossKrMarketCalendarResponse | TossUsMarketCalendarResponse,
): MarketCalendar {
  return {
    country,
    marketTimeZone: country === "KR" ? "Asia/Seoul" : "America/New_York",
    displayTimeZone: "Asia/Seoul",
    today: toMarketDay(value.today, country),
    previousBusinessDay: toMarketDay(value.previousBusinessDay, country),
    nextBusinessDay: toMarketDay(value.nextBusinessDay, country),
  };
}

function toExchangeRate(value: TossExchangeRateResponse): ExchangeRate {
  return {
    baseCurrency: value.baseCurrency,
    quoteCurrency: value.quoteCurrency,
    rate: value.rate,
    midRate: value.midRate,
    basisPoint: value.basisPoint,
    rateChangeType: value.rateChangeType,
    validFrom: value.validFrom,
    validUntil: value.validUntil,
  };
}

function exchangeRateKey(baseCurrency: string, quoteCurrency: string): string {
  return `${baseCurrency}:${quoteCurrency}`;
}

function decodeFixture<T>(envelope: unknown, schema: z.ZodType<T[]>): T[] {
  const decoded = decodeTossEnvelope(envelope, schema);
  if (!decoded.ok) {
    throw new Error("MOCK_MARKET_FIXTURE_MUST_BE_SUCCESS");
  }
  return decoded.result;
}

export function createMockMarketService(
  fixtures: MockMarketFixtureSet = {
    stocksEnvelope: MOCK_STOCKS_TOSS_ENVELOPE,
    pricesEnvelope: MOCK_PRICES_TOSS_ENVELOPE,
  },
): MarketService {
  const stocks = decodeFixture<TossStockInfo>(
    fixtures.stocksEnvelope,
    tossStockInfoListSchema,
  )
    .map(toMarketStock)
    .sort((left, right) => compareSymbols(left.symbol, right.symbol));
  const prices = decodeFixture<TossPriceResponse>(
    fixtures.pricesEnvelope,
    tossPriceResponseListSchema,
  ).map(toMarketPrice);
  const warningsEnvelopes: Readonly<Record<string, unknown>> =
    fixtures.warningsEnvelopes ?? MOCK_WARNINGS_TOSS_ENVELOPES;
  const orderbookEnvelopes: Readonly<Record<string, unknown>> =
    fixtures.orderbookEnvelopes ?? MOCK_ORDERBOOK_TOSS_ENVELOPES;
  const tradesEnvelopes: Readonly<Record<string, unknown>> =
    fixtures.tradesEnvelopes ?? MOCK_TRADES_TOSS_ENVELOPES;
  const candleDatasets = fixtures.candleDatasets ?? MOCK_CANDLE_TOSS_DATASETS;
  const candleErrorEnvelopes: Readonly<Record<string, unknown>> =
    fixtures.candleErrorEnvelopes ?? MOCK_CANDLE_ERROR_TOSS_ENVELOPES;
  const calendarEnvelopes =
    fixtures.calendarEnvelopes ??
    ({
      KR: MOCK_KR_CALENDAR_TOSS_ENVELOPE,
      US: MOCK_US_CALENDAR_TOSS_ENVELOPE,
    } satisfies Partial<Record<MarketCountry, unknown>>);
  const exchangeRateEnvelopes =
    fixtures.exchangeRateEnvelopes ??
    ({
      "USD:KRW": MOCK_EXCHANGE_RATE_TOSS_ENVELOPE,
    } satisfies Record<string, unknown>);

  const stocksBySymbol = new Map(stocks.map((stock) => [stock.symbol, stock]));
  const pricesBySymbol = new Map(prices.map((price) => [price.symbol, price]));

  return {
    async listStocks() {
      return stocks.map((stock) => structuredClone(stock));
    },

    async getStock(symbol) {
      const stock = stocksBySymbol.get(symbol);
      if (!stock) {
        throw new MarketDataNotFoundError();
      }
      return structuredClone(stock);
    },

    async getPrice(symbol) {
      const price = pricesBySymbol.get(symbol);
      if (!price) {
        throw new MarketDataNotFoundError();
      }
      return structuredClone(price);
    },

    async getWarnings(symbol) {
      if (!stocksBySymbol.has(symbol)) {
        throw new MarketDataNotFoundError();
      }
      const envelope = warningsEnvelopes[symbol];
      if (envelope === undefined) {
        throw new MarketDataNotFoundError();
      }
      const decoded = decodeTossEnvelope(envelope, tossStockWarningListSchema);
      if (!decoded.ok) {
        throw marketSourceError(decoded.error.code);
      }

      const seen = new Set<string>();
      return decoded.result
        .map(toMarketWarning)
        .sort(compareWarning)
        .filter(({ warningType }) => {
          if (seen.has(warningType)) {
            return false;
          }
          seen.add(warningType);
          return true;
        })
        .map((warning) => structuredClone(warning));
    },

    async getOrderbook(symbol) {
      if (!stocksBySymbol.has(symbol)) {
        throw new MarketDataNotFoundError();
      }
      const envelope = orderbookEnvelopes[symbol];
      if (envelope === undefined) {
        throw new MarketDataNotFoundError();
      }
      const decoded = decodeTossEnvelope(envelope, tossOrderbookResponseSchema);
      if (!decoded.ok) {
        throw marketSourceError(decoded.error.code);
      }

      const orderbook = toMarketOrderbook(decoded.result);
      assertOrderbookContract(orderbook);
      return structuredClone(orderbook);
    },

    async getTrades(symbol, count = 20) {
      if (!Number.isInteger(count) || count < 1 || count > 50) {
        throw new RangeError("INVALID_TRADE_COUNT");
      }
      if (!stocksBySymbol.has(symbol)) {
        throw new MarketDataNotFoundError();
      }
      const envelope = tradesEnvelopes[symbol];
      if (envelope === undefined) {
        throw new MarketDataNotFoundError();
      }
      const decoded = decodeTossEnvelope(envelope, tossTradeListSchema);
      if (!decoded.ok) {
        throw marketSourceError(decoded.error.code);
      }

      return decoded.result
        .map(toMarketTrade)
        .sort(compareTrades)
        .slice(0, count)
        .map((trade) => structuredClone(trade));
    },

    async getCandles({
      symbol,
      interval,
      count = 100,
      before,
    }): Promise<MarketCandlePage> {
      if (interval !== "1m" && interval !== "1d") {
        throw new RangeError("INVALID_CANDLE_INTERVAL");
      }
      if (!Number.isInteger(count) || count < 1 || count > 200) {
        throw new RangeError("INVALID_CANDLE_COUNT");
      }
      if (!stocksBySymbol.has(symbol)) {
        throw new MarketDataNotFoundError();
      }

      const key = candleKey(symbol, interval);
      const errorEnvelope = candleErrorEnvelopes[key];
      if (errorEnvelope !== undefined) {
        const decodedError = decodeTossEnvelope(
          errorEnvelope,
          tossCandlePageResponseSchema,
        );
        if (!decodedError.ok) {
          throw marketSourceError(decodedError.error.code);
        }
      }

      const dataset = candleDatasets.find(
        (candidate) =>
          candidate.symbol === symbol && candidate.interval === interval,
      );
      if (!dataset) {
        throw new MarketDataNotFoundError();
      }
      if (dataset.symbol !== symbol || dataset.interval !== interval) {
        throw new TossEnvelopeDecodeError("INVALID_RESULT");
      }

      let startIndex = 0;
      if (before !== undefined) {
        startIndex = dataset.candles.findIndex(
          (candle) =>
            typeof candle === "object" &&
            candle !== null &&
            "timestamp" in candle &&
            candle.timestamp === before,
        );
        if (startIndex < 0) {
          throw new MarketDataInvalidCursorError();
        }
      }

      const pageItems = dataset.candles.slice(startIndex, startIndex + count);
      const nextItem = dataset.candles[startIndex + count];
      const nextBefore =
        typeof nextItem === "object" &&
        nextItem !== null &&
        "timestamp" in nextItem &&
        typeof nextItem.timestamp === "string"
          ? nextItem.timestamp
          : null;
      const decoded = decodeTossEnvelope(
        { result: { candles: pageItems, nextBefore } },
        tossCandlePageResponseSchema,
      );
      if (!decoded.ok) {
        throw marketSourceError(decoded.error.code);
      }

      const page = {
        candles: decoded.result.candles.map(toMarketCandle),
        nextBefore: decoded.result.nextBefore,
      };
      assertCandleContract(page.candles);
      return structuredClone(page);
    },

    async getMarketCalendar({ country, date }) {
      if (
        !["KR", "US"].includes(country) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date)
      ) {
        throw new RangeError("INVALID_MARKET_CALENDAR_REQUEST");
      }
      const envelope = calendarEnvelopes[country];
      if (envelope === undefined) {
        throw new MarketDataNotFoundError();
      }
      const schema =
        country === "KR"
          ? tossKrMarketCalendarResponseSchema
          : tossUsMarketCalendarResponseSchema;
      const decoded = decodeTossEnvelope(envelope, schema);
      if (!decoded.ok) {
        throw marketSourceError(decoded.error.code);
      }
      const calendar = toMarketCalendar(country, decoded.result);
      assertCalendarContract(calendar, date);
      return structuredClone(calendar);
    },

    async getExchangeRate({ baseCurrency, quoteCurrency, dateTime }) {
      if (
        baseCurrency === quoteCurrency ||
        !["KRW", "USD"].includes(baseCurrency) ||
        !["KRW", "USD"].includes(quoteCurrency) ||
        (dateTime !== undefined && !Number.isFinite(Date.parse(dateTime)))
      ) {
        throw new MarketDataNotFoundError();
      }
      const envelope =
        exchangeRateEnvelopes[exchangeRateKey(baseCurrency, quoteCurrency)];
      if (envelope === undefined) {
        throw new MarketDataNotFoundError();
      }
      const decoded = decodeTossEnvelope(
        envelope,
        tossExchangeRateResponseSchema,
      );
      if (!decoded.ok) {
        throw marketSourceError(decoded.error.code);
      }
      const rate = toExchangeRate(decoded.result);
      if (
        rate.baseCurrency !== baseCurrency ||
        rate.quoteCurrency !== quoteCurrency ||
        Date.parse(rate.validFrom) >= Date.parse(rate.validUntil)
      ) {
        throw new TossEnvelopeDecodeError("INVALID_RESULT");
      }
      return structuredClone(rate);
    },
  };
}
