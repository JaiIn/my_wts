"use client";

import type { CandleInterval } from "../../domain/market/market";
import { MarketBffError } from "./market-bff-client";

export const MARKET_QUERY_TTL = Object.freeze({
  price: 1_000,
  orderbook: 1_000,
  trades: 1_000,
  candle1m: 10_000,
  candle1d: 300_000,
  stock: 21_600_000,
  calendar: 21_600_000,
  warnings: 300_000,
  exchangeRate: 60_000,
});

export const marketQueryKeys = {
  stocks: (symbols: readonly string[]) =>
    [
      "market",
      "stocks",
      [...symbols].map((value) => value.toUpperCase()).sort(),
    ] as const,
  prices: (symbols: readonly string[]) =>
    [
      "market",
      "prices",
      [...symbols].map((value) => value.toUpperCase()).sort(),
    ] as const,
  warnings: (symbol: string) =>
    ["market", "warnings", symbol.toUpperCase()] as const,
  orderbook: (symbol: string) =>
    ["market", "orderbook", symbol.toUpperCase()] as const,
  trades: (symbol: string) =>
    ["market", "trades", symbol.toUpperCase()] as const,
  candles: (symbol: string, interval: CandleInterval) =>
    ["market", "candles", symbol.toUpperCase(), interval] as const,
  calendar: (country: "KR" | "US", date: string) =>
    ["market", "calendar", country, date] as const,
  exchangeRate: (base: "USD", quote: "KRW") =>
    ["market", "exchange-rate", base, quote] as const,
  watchlists: ["watchlists"] as const,
};

export function candleStaleTime(interval: CandleInterval): number {
  return interval === "1m"
    ? MARKET_QUERY_TTL.candle1m
    : MARKET_QUERY_TTL.candle1d;
}

export function shouldRetryMarketQuery(
  failureCount: number,
  error: unknown,
): boolean {
  if (failureCount >= 1 || !(error instanceof MarketBffError)) return false;
  if ([400, 401, 403, 404, 429].includes(error.status)) return false;
  return error.retryable;
}
