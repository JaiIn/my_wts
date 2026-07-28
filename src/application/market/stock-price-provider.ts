import type { MarketPrice, MarketStock } from "../../domain/market/market";
import type { MarketService } from "./market-service";

export type StockPriceProvider = Readonly<{
  getStocks(symbols: readonly string[]): Promise<readonly MarketStock[]>;
  getPrices(symbols: readonly string[]): Promise<readonly MarketPrice[]>;
}>;

export class MarketRequestValidationError extends Error {
  readonly code = "VALIDATION_FAILED";
  readonly status = 400;
  readonly retryable = false;

  constructor(readonly field = "symbols") {
    super("MARKET_REQUEST_VALIDATION_FAILED");
    this.name = "MarketRequestValidationError";
  }
}

export class MarketProviderConfigurationError extends Error {
  readonly status = 503;
  readonly retryable = false;

  constructor(readonly code: "CONFIG_MISSING" | "LIVE_API_DISABLED") {
    super("MARKET_PROVIDER_CONFIGURATION_ERROR");
    this.name = "MarketProviderConfigurationError";
  }
}

export function compareMarketSymbols(
  left: { symbol: string },
  right: { symbol: string },
): number {
  return left.symbol < right.symbol ? -1 : left.symbol > right.symbol ? 1 : 0;
}

export function createMockStockPriceProvider(
  service: Pick<MarketService, "getPrice" | "getStock">,
): StockPriceProvider {
  return Object.freeze({
    async getStocks(symbols) {
      return (
        await Promise.all(symbols.map((symbol) => service.getStock(symbol)))
      ).sort(compareMarketSymbols);
    },
    async getPrices(symbols) {
      return (
        await Promise.all(symbols.map((symbol) => service.getPrice(symbol)))
      ).sort(compareMarketSymbols);
    },
  });
}

export function toStockInfoResponse(stock: MarketStock) {
  return {
    symbol: stock.symbol,
    name: stock.displayName,
    englishName: stock.englishName,
    isinCode: stock.isinCode,
    market: stock.market,
    securityType: stock.securityType,
    isCommonShare: stock.isCommonShare,
    status: stock.status,
    currency: stock.currency,
    listDate: stock.listedOn,
    delistDate: stock.delistedOn,
    sharesOutstanding: stock.sharesOutstanding,
    leverageFactor: stock.leverageFactor,
    koreanMarketDetail: stock.koreanMarketDetail,
  };
}

export function toPriceResponse(price: MarketPrice) {
  return {
    symbol: price.symbol,
    timestamp: price.observedAt,
    lastPrice: price.lastPrice,
    currency: price.currency,
  };
}
