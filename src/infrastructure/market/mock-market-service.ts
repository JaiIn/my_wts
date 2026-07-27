import {
  MarketDataNotFoundError,
  type MarketService,
} from "../../application/market/market-service";
import type { MarketPrice, MarketStock } from "../../domain/market/market";
import { decodeTossEnvelope } from "../../integrations/toss/envelope";
import {
  tossPriceResponseListSchema,
  tossStockInfoListSchema,
  type TossPriceResponse,
  type TossStockInfo,
} from "../../integrations/toss/market-schemas";
import {
  MOCK_PRICES_TOSS_ENVELOPE,
  MOCK_STOCKS_TOSS_ENVELOPE,
} from "./mock-market-fixtures";
import type { z } from "zod";

export type MockMarketFixtureSet = {
  stocksEnvelope: unknown;
  pricesEnvelope: unknown;
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
  };
}
