import "server-only";

import {
  type CalendarRequest,
  type CandlePageResponse,
  type CandleRequest,
  type ExchangeRateRequest,
  type ExchangeRateResponse,
  type KrMarketCalendarResponse,
  type KrMarketDayResponse,
  type MarketCalendarResponse,
  type MarketReferenceProvider,
  type UsMarketCalendarResponse,
  type UsMarketDayResponse,
} from "../../application/market/market-reference-provider";
import {
  MarketDataNotFoundError,
  MarketDataSourceError,
} from "../../application/market/market-service";
import {
  decodeDecimalString,
  decimalFromString,
} from "../../domain/common/decimal";
import {
  decodeTossEnvelope,
  TossEnvelopeDecodeError,
} from "../../integrations/toss/envelope";
import {
  tossCandlePageResponseSchema,
  tossExchangeRateResponseSchema,
  tossKrMarketCalendarResponseSchema,
  tossSymbolSchema,
  tossUsMarketCalendarResponseSchema,
  type TossCandle,
  type TossExchangeRateResponse,
  type TossKrMarketCalendarResponse,
  type TossUsMarketCalendarResponse,
} from "../../integrations/toss/market-schemas";
import type { ReadonlyTossClient } from "../toss/readonly-http-client";

function sourceError(code: string): MarketDataSourceError {
  if (code === "rate-limit-exceeded") {
    return new MarketDataSourceError("UPSTREAM_RATE_LIMITED", true);
  }
  if (code === "stock-not-found" || code === "not-found") {
    throw new MarketDataNotFoundError();
  }
  return new MarketDataSourceError("UPSTREAM_UNKNOWN_ERROR", false);
}

function canonicalSymbol(symbol: string): string {
  const canonical = tossSymbolSchema.parse(symbol.trim().toUpperCase());
  if (canonical === "." || canonical === "..") {
    throw new TossEnvelopeDecodeError("INVALID_RESULT");
  }
  return canonical;
}

function toCandle(candle: TossCandle) {
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

function assertCandles(page: CandlePageResponse): void {
  const timestamps = new Set<number>();
  let previous = Number.POSITIVE_INFINITY;
  for (const candle of page.candles) {
    const timestamp = Date.parse(candle.timestamp);
    if (
      !Number.isFinite(timestamp) ||
      timestamps.has(timestamp) ||
      timestamp >= previous
    ) {
      throw new TossEnvelopeDecodeError("INVALID_RESULT");
    }
    timestamps.add(timestamp);
    previous = timestamp;

    const open = decimalFromString(decodeDecimalString(candle.openPrice));
    const high = decimalFromString(decodeDecimalString(candle.highPrice));
    const low = decimalFromString(decodeDecimalString(candle.lowPrice));
    const close = decimalFromString(decodeDecimalString(candle.closePrice));
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

type CalendarSessionDto = Readonly<{
  startTime: string;
  endTime: string;
  singlePriceAuctionStartTime?: string | null;
  singlePriceAuctionEndTime?: string | null;
}>;

function toSession(session: CalendarSessionDto | null | undefined) {
  if (session === null || session === undefined) return session;
  return {
    startTime: session.startTime,
    endTime: session.endTime,
    singlePriceAuctionStartTime: session.singlePriceAuctionStartTime,
    singlePriceAuctionEndTime: session.singlePriceAuctionEndTime,
  };
}

function toKrDay(
  day: TossKrMarketCalendarResponse["today"],
): KrMarketDayResponse {
  return {
    date: day.date,
    integrated:
      day.integrated === null || day.integrated === undefined
        ? day.integrated
        : {
            preMarket: toSession(day.integrated.preMarket),
            regularMarket: toSession(day.integrated.regularMarket),
            afterMarket: toSession(day.integrated.afterMarket),
          },
  };
}

function toKrCalendar(
  value: TossKrMarketCalendarResponse,
): KrMarketCalendarResponse {
  return {
    today: toKrDay(value.today),
    previousBusinessDay: toKrDay(value.previousBusinessDay),
    nextBusinessDay: toKrDay(value.nextBusinessDay),
  };
}

function toUsDay(
  day: TossUsMarketCalendarResponse["today"],
): UsMarketDayResponse {
  return {
    date: day.date,
    dayMarket: toSession(day.dayMarket),
    preMarket: toSession(day.preMarket),
    regularMarket: toSession(day.regularMarket),
    afterMarket: toSession(day.afterMarket),
  };
}

function toUsCalendar(
  value: TossUsMarketCalendarResponse,
): UsMarketCalendarResponse {
  return {
    today: toUsDay(value.today),
    previousBusinessDay: toUsDay(value.previousBusinessDay),
    nextBusinessDay: toUsDay(value.nextBusinessDay),
  };
}

function sessionsForCalendarDay(
  day: KrMarketDayResponse | UsMarketDayResponse,
): readonly (CalendarSessionDto | null | undefined)[] {
  if ("integrated" in day) {
    return [
      day.integrated?.preMarket,
      day.integrated?.regularMarket,
      day.integrated?.afterMarket,
    ];
  }
  const usDay = day as UsMarketDayResponse;
  return [
    usDay.dayMarket,
    usDay.preMarket,
    usDay.regularMarket,
    usDay.afterMarket,
  ];
}

function assertCalendar(
  calendar: MarketCalendarResponse,
  request: CalendarRequest,
): void {
  const days = [
    calendar.previousBusinessDay,
    calendar.today,
    calendar.nextBusinessDay,
  ];
  if (
    calendar.today.date !== request.date ||
    !(days[0]!.date < days[1]!.date && days[1]!.date < days[2]!.date) ||
    new Set(days.map(({ date }) => date)).size !== days.length
  ) {
    throw new TossEnvelopeDecodeError("INVALID_RESULT");
  }

  for (const day of days) {
    let previousEnd = Number.NEGATIVE_INFINITY;
    for (const session of sessionsForCalendarDay(day)) {
      if (!session) continue;
      const start = Date.parse(session.startTime);
      const end = Date.parse(session.endTime);
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start >= end ||
        start < previousEnd
      ) {
        throw new TossEnvelopeDecodeError("INVALID_RESULT");
      }
      for (const auction of [
        session.singlePriceAuctionStartTime,
        session.singlePriceAuctionEndTime,
      ]) {
        if (
          auction !== null &&
          auction !== undefined &&
          (Date.parse(auction) < start || Date.parse(auction) > end)
        ) {
          throw new TossEnvelopeDecodeError("INVALID_RESULT");
        }
      }
      previousEnd = end;
    }
  }
}

function toExchangeRate(value: TossExchangeRateResponse): ExchangeRateResponse {
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

function assertExchangeRate(
  value: ExchangeRateResponse,
  request: ExchangeRateRequest,
): void {
  if (
    value.baseCurrency !== request.baseCurrency ||
    value.quoteCurrency !== request.quoteCurrency ||
    Date.parse(value.validFrom) >= Date.parse(value.validUntil)
  ) {
    throw new TossEnvelopeDecodeError("INVALID_RESULT");
  }
}

export function createLiveMarketReferenceProvider(
  client: ReadonlyTossClient,
): MarketReferenceProvider {
  return Object.freeze({
    async getCandles(input: CandleRequest) {
      const response = await client.get({
        path: "/api/v1/candles",
        operation: "getCandles",
        query: {
          symbol: canonicalSymbol(input.symbol),
          interval: input.interval,
          count: String(input.count),
          before: input.before,
          adjusted: String(input.adjusted),
        },
      });
      const envelope = decodeTossEnvelope(
        response.data,
        tossCandlePageResponseSchema,
      );
      if (!envelope.ok) throw sourceError(envelope.error.code);
      const page: CandlePageResponse = {
        candles: envelope.result.candles.map(toCandle),
        nextBefore: envelope.result.nextBefore,
      };
      assertCandles(page);
      return structuredClone(page);
    },

    async getCalendar(input: CalendarRequest) {
      const path =
        input.country === "KR"
          ? "/api/v1/market-calendar/KR"
          : "/api/v1/market-calendar/US";
      const response = await client.get({
        path,
        operation:
          input.country === "KR"
            ? "getKrMarketCalendar"
            : "getUsMarketCalendar",
        query: { date: input.date },
      });
      const schema =
        input.country === "KR"
          ? tossKrMarketCalendarResponseSchema
          : tossUsMarketCalendarResponseSchema;
      const envelope = decodeTossEnvelope(response.data, schema);
      if (!envelope.ok) throw sourceError(envelope.error.code);
      const calendar =
        input.country === "KR"
          ? toKrCalendar(envelope.result as TossKrMarketCalendarResponse)
          : toUsCalendar(envelope.result as TossUsMarketCalendarResponse);
      assertCalendar(calendar, input);
      return structuredClone(calendar);
    },

    async getExchangeRate(input: ExchangeRateRequest) {
      if (input.baseCurrency === input.quoteCurrency) {
        throw new MarketDataNotFoundError();
      }
      const response = await client.get({
        path: "/api/v1/exchange-rate",
        operation: "getExchangeRate",
        query: {
          baseCurrency: input.baseCurrency,
          quoteCurrency: input.quoteCurrency,
          dateTime: input.dateTime,
        },
      });
      const envelope = decodeTossEnvelope(
        response.data,
        tossExchangeRateResponseSchema,
      );
      if (!envelope.ok) throw sourceError(envelope.error.code);
      const rate = toExchangeRate(envelope.result);
      assertExchangeRate(rate, input);
      return structuredClone(rate);
    },
  });
}
