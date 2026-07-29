"use client";

import type { CandleInterval } from "../../domain/market/market";
import type { Watchlist } from "../../domain/watchlist/watchlist";

export const MARKET_BFF_SYMBOLS = Object.freeze([
  "005930",
  "AAPL",
  "EMPTY1",
  "ERR1",
  "FWD1",
] as const);

export type BffStock = Readonly<{
  symbol: string;
  name: string;
  englishName: string;
  market: string;
  status: string;
  currency: string;
}>;

export type BffPrice = Readonly<{
  symbol: string;
  timestamp?: string | null;
  lastPrice: string;
  currency: string;
}>;

export type BffWarning = Readonly<{
  warningType: string;
  exchange?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}>;

export type BffOrderbook = Readonly<{
  timestamp?: string | null;
  currency: string;
  asks: readonly Readonly<{ price: string; volume: string }>[];
  bids: readonly Readonly<{ price: string; volume: string }>[];
}>;

export type BffTrade = Readonly<{
  price: string;
  volume: string;
  timestamp: string;
  currency: string;
}>;

export type BffCandle = Readonly<{
  timestamp: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  closePrice: string;
  volume: string;
  currency: string;
}>;

export type BffCandlePage = Readonly<{
  candles: readonly BffCandle[];
  nextBefore?: string | null;
}>;

type BffCalendarSession = Readonly<{
  startTime: string;
  endTime: string;
}>;

export type BffCalendarDay = Readonly<{
  date: string;
  integrated?: Readonly<{
    preMarket?: BffCalendarSession | null;
    regularMarket?: BffCalendarSession | null;
    afterMarket?: BffCalendarSession | null;
  }> | null;
  dayMarket?: BffCalendarSession | null;
  preMarket?: BffCalendarSession | null;
  regularMarket?: BffCalendarSession | null;
  afterMarket?: BffCalendarSession | null;
}>;

export type BffCalendar = Readonly<{
  today: BffCalendarDay;
  previousBusinessDay: BffCalendarDay;
  nextBusinessDay: BffCalendarDay;
}>;

export type BffExchangeRate = Readonly<{
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  midRate: string;
  basisPoint: string;
  rateChangeType: "UP" | "EQUAL" | "DOWN";
  validFrom: string;
  validUntil: string;
}>;

export class MarketBffError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly requestId?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super("MARKET_BFF_REQUEST_FAILED");
    this.name = "MarketBffError";
  }
}

function canonicalSymbol(symbol: string): string {
  const value = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,32}$/.test(value) || value === "." || value === "..") {
    throw new MarketBffError("VALIDATION_FAILED", 400, false);
  }
  return value;
}

function queryPath(path: string, query: Record<string, string | undefined>) {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) values.set(key, value);
  }
  return `${path}?${values.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new MarketBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  try {
    return await response.json();
  } catch {
    throw new MarketBffError("INVALID_BFF_RESPONSE", 502, false);
  }
}

async function getBff<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await readJson(response);
  if (!isRecord(body)) {
    throw new MarketBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  if (!response.ok) {
    const error = isRecord(body.error) ? body.error : {};
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds =
      retryAfterHeader !== null && /^\d+$/.test(retryAfterHeader)
        ? Number(retryAfterHeader)
        : undefined;
    throw new MarketBffError(
      typeof error.code === "string" ? error.code : "BFF_REQUEST_FAILED",
      response.status,
      error.retryable === true,
      typeof error.requestId === "string" ? error.requestId : undefined,
      retryAfterSeconds,
    );
  }
  if (!("data" in body)) {
    throw new MarketBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return structuredClone(body.data as T);
}

export function getMarketStocks(
  symbols: readonly string[],
  signal?: AbortSignal,
) {
  const canonical = [...new Set(symbols.map(canonicalSymbol))].sort();
  return getBff<readonly BffStock[]>(
    queryPath("/api/v1/market/stocks", { symbols: canonical.join(",") }),
    signal,
  );
}

export function getMarketPrices(
  symbols: readonly string[],
  signal?: AbortSignal,
) {
  const canonical = [...new Set(symbols.map(canonicalSymbol))].sort();
  return getBff<readonly BffPrice[]>(
    queryPath("/api/v1/market/prices", { symbols: canonical.join(",") }),
    signal,
  );
}

export function getMarketWarnings(symbol: string, signal?: AbortSignal) {
  return getBff<readonly BffWarning[]>(
    `/api/v1/market/stocks/${encodeURIComponent(canonicalSymbol(symbol))}/warnings`,
    signal,
  );
}

export function getMarketOrderbook(symbol: string, signal?: AbortSignal) {
  return getBff<BffOrderbook>(
    queryPath("/api/v1/market/orderbook", {
      symbol: canonicalSymbol(symbol),
    }),
    signal,
  );
}

export function getMarketTrades(symbol: string, signal?: AbortSignal) {
  return getBff<readonly BffTrade[]>(
    queryPath("/api/v1/market/trades", {
      symbol: canonicalSymbol(symbol),
      count: "20",
    }),
    signal,
  );
}

export function getMarketCandles(
  input: Readonly<{
    symbol: string;
    interval: CandleInterval;
    before?: string;
  }>,
  signal?: AbortSignal,
) {
  return getBff<BffCandlePage>(
    queryPath("/api/v1/market/candles", {
      symbol: canonicalSymbol(input.symbol),
      interval: input.interval,
      count: "100",
      before: input.before,
      adjusted: "true",
    }),
    signal,
  );
}

export function getMarketCalendar(
  country: "KR" | "US",
  date: string,
  signal?: AbortSignal,
) {
  return getBff<BffCalendar>(
    queryPath(`/api/v1/market/calendars/${country}`, { date }),
    signal,
  );
}

export function getMarketExchangeRate(
  baseCurrency: "USD",
  quoteCurrency: "KRW",
  signal?: AbortSignal,
) {
  return getBff<BffExchangeRate>(
    queryPath("/api/v1/market/exchange-rate", {
      baseCurrency,
      quoteCurrency,
    }),
    signal,
  );
}

export async function getWatchlists(signal?: AbortSignal) {
  const data = await getBff<Readonly<{ watchlists: readonly Watchlist[] }>>(
    "/api/v1/watchlists",
    signal,
  );
  return data.watchlists;
}
