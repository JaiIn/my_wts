import type { MarketService } from "./market-service";
import type {
  ExchangeRate,
  MarketCalendar,
  MarketCandle,
  MarketCandlePage,
  MarketCountry,
  MarketDay,
} from "../../domain/market/market";

export type CandleRequest = Readonly<{
  symbol: string;
  interval: "1m" | "1d";
  count: number;
  before?: string;
  adjusted: boolean;
}>;

export type CalendarRequest = Readonly<{
  country: MarketCountry;
  date: string;
}>;

export type ExchangeRateRequest = Readonly<{
  baseCurrency: "KRW" | "USD";
  quoteCurrency: "KRW" | "USD";
  dateTime?: string;
}>;

export type CandleResponse = Readonly<{
  timestamp: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  closePrice: string;
  volume: string;
  currency: string;
}>;

export type CandlePageResponse = Readonly<{
  candles: readonly CandleResponse[];
  nextBefore?: string | null;
}>;

type CalendarSessionResponse = Readonly<{
  startTime: string;
  endTime: string;
  singlePriceAuctionStartTime?: string | null;
  singlePriceAuctionEndTime?: string | null;
}>;

export type KrMarketDayResponse = Readonly<{
  date: string;
  integrated?: Readonly<{
    preMarket?: CalendarSessionResponse | null;
    regularMarket?: CalendarSessionResponse | null;
    afterMarket?: CalendarSessionResponse | null;
  }> | null;
}>;

export type UsMarketDayResponse = Readonly<{
  date: string;
  dayMarket?: CalendarSessionResponse | null;
  preMarket?: CalendarSessionResponse | null;
  regularMarket?: CalendarSessionResponse | null;
  afterMarket?: CalendarSessionResponse | null;
}>;

export type KrMarketCalendarResponse = Readonly<{
  today: KrMarketDayResponse;
  previousBusinessDay: KrMarketDayResponse;
  nextBusinessDay: KrMarketDayResponse;
}>;

export type UsMarketCalendarResponse = Readonly<{
  today: UsMarketDayResponse;
  previousBusinessDay: UsMarketDayResponse;
  nextBusinessDay: UsMarketDayResponse;
}>;

export type MarketCalendarResponse =
  KrMarketCalendarResponse | UsMarketCalendarResponse;

export type ExchangeRateResponse = Readonly<{
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  midRate: string;
  basisPoint: string;
  rateChangeType: "UP" | "EQUAL" | "DOWN";
  validFrom: string;
  validUntil: string;
}>;

export type MarketReferenceProvider = Readonly<{
  getCandles(input: CandleRequest): Promise<CandlePageResponse>;
  getCalendar(input: CalendarRequest): Promise<MarketCalendarResponse>;
  getExchangeRate(input: ExchangeRateRequest): Promise<ExchangeRateResponse>;
}>;

export function toCandleResponse(candle: MarketCandle): CandleResponse {
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

export function toCandlePageResponse(
  page: MarketCandlePage,
): CandlePageResponse {
  return {
    candles: page.candles.map(toCandleResponse),
    nextBefore: page.nextBefore,
  };
}

function sessionFor(
  day: MarketDay,
  kind: MarketDay["sessions"][number]["kind"],
): CalendarSessionResponse | null {
  const session = day.sessions.find((candidate) => candidate.kind === kind);
  return session
    ? { startTime: session.startTime, endTime: session.endTime }
    : null;
}

function toKrDay(day: MarketDay): KrMarketDayResponse {
  if (day.sessions.length === 0) return { date: day.date, integrated: null };
  return {
    date: day.date,
    integrated: {
      preMarket: sessionFor(day, "pre"),
      regularMarket: sessionFor(day, "regular"),
      afterMarket: sessionFor(day, "after"),
    },
  };
}

function toUsDay(day: MarketDay): UsMarketDayResponse {
  return {
    date: day.date,
    dayMarket: sessionFor(day, "day"),
    preMarket: sessionFor(day, "pre"),
    regularMarket: sessionFor(day, "regular"),
    afterMarket: sessionFor(day, "after"),
  };
}

export function toCalendarResponse(
  calendar: MarketCalendar,
): MarketCalendarResponse {
  return calendar.country === "KR"
    ? {
        today: toKrDay(calendar.today),
        previousBusinessDay: toKrDay(calendar.previousBusinessDay),
        nextBusinessDay: toKrDay(calendar.nextBusinessDay),
      }
    : {
        today: toUsDay(calendar.today),
        previousBusinessDay: toUsDay(calendar.previousBusinessDay),
        nextBusinessDay: toUsDay(calendar.nextBusinessDay),
      };
}

export function toExchangeRateResponse(
  value: ExchangeRate,
): ExchangeRateResponse {
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

export function createMockMarketReferenceProvider(
  service: MarketService,
): MarketReferenceProvider {
  return Object.freeze({
    async getCandles(input) {
      return structuredClone(
        toCandlePageResponse(await service.getCandles(input)),
      );
    },
    async getCalendar(input) {
      return structuredClone(
        toCalendarResponse(await service.getMarketCalendar(input)),
      );
    },
    async getExchangeRate(input) {
      return structuredClone(
        toExchangeRateResponse(await service.getExchangeRate(input)),
      );
    },
  });
}
