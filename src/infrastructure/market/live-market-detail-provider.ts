import "server-only";

import {
  MarketDataNotFoundError,
  MarketDataSourceError,
} from "../../application/market/market-service";
import type { MarketDetailProvider } from "../../application/market/market-detail-provider";
import { decimalFromString } from "../../domain/common/decimal";
import type {
  MarketOrderbook,
  MarketOrderbookLevel,
  MarketTrade,
  MarketWarning,
} from "../../domain/market/market";
import {
  decodeTossEnvelope,
  TossEnvelopeDecodeError,
} from "../../integrations/toss/envelope";
import {
  tossOrderbookResponseSchema,
  tossStockWarningListSchema,
  tossSymbolSchema,
  tossTradeListSchema,
  type TossOrderbookResponse,
  type TossStockWarning,
  type TossTrade,
} from "../../integrations/toss/market-schemas";
import type { ReadonlyTossClient } from "../toss/readonly-http-client";

function sourceError(code: string): MarketDataSourceError {
  if (code === "rate-limit-exceeded") {
    return new MarketDataSourceError("UPSTREAM_RATE_LIMITED", true);
  }
  if (code === "stock-not-found") throw new MarketDataNotFoundError();
  return new MarketDataSourceError("UPSTREAM_UNKNOWN_ERROR", false);
}

function canonicalSymbol(symbol: string): string {
  const canonical = tossSymbolSchema.parse(symbol.trim().toUpperCase());
  if (canonical === "." || canonical === "..") {
    throw new TossEnvelopeDecodeError("INVALID_RESULT");
  }
  return canonical;
}

function warningsPath(symbol: string): string {
  return `/api/v1/stocks/${encodeURIComponent(canonicalSymbol(symbol))}/warnings`;
}

function toMarketWarning(warning: TossStockWarning): MarketWarning {
  return {
    warningType: warning.warningType,
    exchange: warning.exchange,
    startDate: warning.startDate,
    endDate: warning.endDate,
  };
}

function compareWarnings(left: MarketWarning, right: MarketWarning): number {
  const leftDate = left.startDate ?? "";
  const rightDate = right.startDate ?? "";
  if (leftDate !== rightDate) return leftDate > rightDate ? -1 : 1;
  return left.warningType.localeCompare(right.warningType, "en");
}

function toLevel(
  level: TossOrderbookResponse["asks"][number],
): MarketOrderbookLevel {
  return { price: level.price, volume: level.volume };
}

function toMarketOrderbook(value: TossOrderbookResponse): MarketOrderbook {
  return {
    observedAt: value.timestamp,
    currency: value.currency,
    asks: value.asks.map(toLevel),
    bids: value.bids.map(toLevel),
  };
}

function assertOrderbook(orderbook: MarketOrderbook): void {
  const prices = new Set<string>();
  for (const level of [...orderbook.asks, ...orderbook.bids]) {
    const normalized = decimalFromString(level.price).toString();
    if (prices.has(normalized)) {
      throw new TossEnvelopeDecodeError("INVALID_RESULT");
    }
    prices.add(normalized);
  }
  for (let index = 1; index < orderbook.asks.length; index += 1) {
    if (
      decimalFromString(orderbook.asks[index - 1]!.price).greaterThan(
        orderbook.asks[index]!.price,
      )
    ) {
      throw new TossEnvelopeDecodeError("INVALID_RESULT");
    }
  }
  for (let index = 1; index < orderbook.bids.length; index += 1) {
    if (
      decimalFromString(orderbook.bids[index - 1]!.price).lessThan(
        orderbook.bids[index]!.price,
      )
    ) {
      throw new TossEnvelopeDecodeError("INVALID_RESULT");
    }
  }
}

function toMarketTrade(trade: TossTrade): MarketTrade {
  return {
    price: trade.price,
    volume: trade.volume,
    observedAt: trade.timestamp,
    currency: trade.currency,
  };
}

function compareTrades(left: MarketTrade, right: MarketTrade): number {
  const timestamp = Date.parse(right.observedAt) - Date.parse(left.observedAt);
  if (timestamp !== 0) return timestamp;
  const price = decimalFromString(right.price).comparedTo(left.price);
  if (price !== 0) return price;
  return decimalFromString(right.volume).comparedTo(left.volume);
}

export function createLiveMarketDetailProvider(
  client: ReadonlyTossClient,
): MarketDetailProvider {
  return Object.freeze({
    async getWarnings(symbol) {
      const response = await client.get({
        path: warningsPath(symbol),
        operation: "getStockWarnings",
      });
      const envelope = decodeTossEnvelope(
        response.data,
        tossStockWarningListSchema,
      );
      if (!envelope.ok) throw sourceError(envelope.error.code);
      const seen = new Set<string>();
      return envelope.result
        .map(toMarketWarning)
        .sort(compareWarnings)
        .filter(({ warningType }) => {
          if (seen.has(warningType)) return false;
          seen.add(warningType);
          return true;
        })
        .map((warning) => structuredClone(warning));
    },

    async getOrderbook(symbol) {
      const response = await client.get({
        path: "/api/v1/orderbook",
        operation: "getOrderbook",
        query: { symbol: canonicalSymbol(symbol) },
      });
      const envelope = decodeTossEnvelope(
        response.data,
        tossOrderbookResponseSchema,
      );
      if (!envelope.ok) throw sourceError(envelope.error.code);
      const orderbook = toMarketOrderbook(envelope.result);
      assertOrderbook(orderbook);
      return structuredClone(orderbook);
    },

    async getTrades(symbol, count) {
      if (!Number.isInteger(count) || count < 1 || count > 50) {
        throw new RangeError("INVALID_TRADE_COUNT");
      }
      const response = await client.get({
        path: "/api/v1/trades",
        operation: "getTrades",
        query: { symbol: canonicalSymbol(symbol), count: String(count) },
      });
      const envelope = decodeTossEnvelope(response.data, tossTradeListSchema);
      if (!envelope.ok) throw sourceError(envelope.error.code);
      return envelope.result
        .map(toMarketTrade)
        .sort(compareTrades)
        .slice(0, count)
        .map((trade) => structuredClone(trade));
    },
  });
}
