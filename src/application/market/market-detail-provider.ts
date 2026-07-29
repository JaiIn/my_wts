import type { MarketService } from "./market-service";
import type {
  MarketOrderbook,
  MarketTrade,
  MarketWarning,
} from "../../domain/market/market";

export type MarketDetailProvider = Readonly<{
  getWarnings(symbol: string): Promise<readonly MarketWarning[]>;
  getOrderbook(symbol: string): Promise<MarketOrderbook>;
  getTrades(symbol: string, count: number): Promise<readonly MarketTrade[]>;
}>;

export type StockWarningResponse = Readonly<{
  warningType: string;
  exchange?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}>;

export type OrderbookResponse = Readonly<{
  timestamp?: string | null;
  currency: string;
  asks: readonly Readonly<{ price: string; volume: string }>[];
  bids: readonly Readonly<{ price: string; volume: string }>[];
}>;

export type TradeResponse = Readonly<{
  price: string;
  volume: string;
  timestamp: string;
  currency: string;
}>;

export function toStockWarningResponse(
  warning: MarketWarning,
): StockWarningResponse {
  return {
    warningType: warning.warningType,
    exchange: warning.exchange,
    startDate: warning.startDate,
    endDate: warning.endDate,
  };
}

export function toOrderbookResponse(
  orderbook: MarketOrderbook,
): OrderbookResponse {
  return {
    timestamp: orderbook.observedAt,
    currency: orderbook.currency,
    asks: orderbook.asks.map(({ price, volume }) => ({ price, volume })),
    bids: orderbook.bids.map(({ price, volume }) => ({ price, volume })),
  };
}

export function toTradeResponse(trade: MarketTrade): TradeResponse {
  return {
    price: trade.price,
    volume: trade.volume,
    timestamp: trade.observedAt,
    currency: trade.currency,
  };
}

export function createMockMarketDetailProvider(
  service: MarketService,
): MarketDetailProvider {
  return Object.freeze({
    getWarnings: (symbol) => service.getWarnings(symbol),
    getOrderbook: (symbol) => service.getOrderbook(symbol),
    getTrades: (symbol, count) => service.getTrades(symbol, count),
  });
}
