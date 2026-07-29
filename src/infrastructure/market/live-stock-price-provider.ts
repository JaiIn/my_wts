import "server-only";

import {
  MarketDataNotFoundError,
  MarketDataSourceError,
} from "../../application/market/market-service";
import {
  compareMarketSymbols,
  type StockPriceProvider,
} from "../../application/market/stock-price-provider";
import type { MarketPrice, MarketStock } from "../../domain/market/market";
import { decodeTossEnvelope } from "../../integrations/toss/envelope";
import {
  tossPriceResponseListSchema,
  tossStockInfoListSchema,
  type TossPriceResponse,
  type TossStockInfo,
} from "../../integrations/toss/market-schemas";
import type { ReadonlyTossClient } from "../toss/readonly-http-client";

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
    koreanMarketDetail: stock.koreanMarketDetail,
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

function sourceError(code: string): MarketDataSourceError {
  if (code === "rate-limit-exceeded") {
    return new MarketDataSourceError("UPSTREAM_RATE_LIMITED", true);
  }
  if (code === "stock-not-found") throw new MarketDataNotFoundError();
  return new MarketDataSourceError("UPSTREAM_UNKNOWN_ERROR", false);
}

function ensureRequestedSymbols(
  requested: readonly string[],
  received: readonly { symbol: string }[],
): void {
  const receivedSymbols = new Set(received.map(({ symbol }) => symbol));
  if (requested.some((symbol) => !receivedSymbols.has(symbol))) {
    throw new MarketDataNotFoundError();
  }
}

export function createLiveStockPriceProvider(
  client: ReadonlyTossClient,
): StockPriceProvider {
  return Object.freeze({
    async getStocks(symbols) {
      const response = await client.get({
        path: "/api/v1/stocks",
        operation: "getStocks",
        query: { symbols: symbols.join(",") },
      });
      const envelope = decodeTossEnvelope(
        response.data,
        tossStockInfoListSchema,
      );
      if (!envelope.ok) throw sourceError(envelope.error.code);
      ensureRequestedSymbols(symbols, envelope.result);
      return envelope.result.map(toMarketStock).sort(compareMarketSymbols);
    },
    async getPrices(symbols) {
      const response = await client.get({
        path: "/api/v1/prices",
        operation: "getPrices",
        query: { symbols: symbols.join(",") },
      });
      const envelope = decodeTossEnvelope(
        response.data,
        tossPriceResponseListSchema,
      );
      if (!envelope.ok) throw sourceError(envelope.error.code);
      ensureRequestedSymbols(symbols, envelope.result);
      return envelope.result.map(toMarketPrice).sort(compareMarketSymbols);
    },
  });
}
