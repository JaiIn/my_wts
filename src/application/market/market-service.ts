import type { MarketPrice, MarketStock } from "../../domain/market/market";

export interface MarketService {
  listStocks(): Promise<readonly MarketStock[]>;
  getStock(symbol: string): Promise<MarketStock>;
  getPrice(symbol: string): Promise<MarketPrice>;
}

export class MarketDataNotFoundError extends Error {
  readonly code = "UPSTREAM_NOT_FOUND";
  readonly status = 404;
  readonly retryable = false;

  constructor() {
    super("MARKET_DATA_NOT_FOUND");
    this.name = "MarketDataNotFoundError";
  }
}
