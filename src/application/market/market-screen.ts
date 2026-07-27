import type { MarketService } from "./market-service";

export const INITIAL_MARKET_SYMBOL = "005930";

export type MarketStockView = {
  symbol: string;
  displayName: string;
  englishName: string;
  market: string;
  currency: string;
  status: string;
};

export type MarketPriceView = {
  symbol: string;
  observedAt?: string | null;
  lastPrice: string;
  currency: string;
};

export type MarketScreenData = {
  initialSymbol: string;
  stocks: readonly MarketStockView[];
  prices: readonly MarketPriceView[];
};

export async function loadMarketScreen(
  service: MarketService,
): Promise<MarketScreenData> {
  const stocks = await service.listStocks();
  const initialStock =
    stocks.find(({ symbol }) => symbol === INITIAL_MARKET_SYMBOL) ?? stocks[0];
  const prices = await Promise.all(
    stocks.map(({ symbol }) => service.getPrice(symbol)),
  );

  return {
    initialSymbol: initialStock?.symbol ?? "",
    stocks: stocks.map(
      ({ currency, displayName, englishName, market, status, symbol }) => ({
        symbol,
        displayName,
        englishName,
        market,
        currency,
        status,
      }),
    ),
    prices: prices.map(({ currency, lastPrice, observedAt, symbol }) => ({
      symbol,
      observedAt,
      lastPrice,
      currency,
    })),
  };
}
