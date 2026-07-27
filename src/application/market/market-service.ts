import type {
  MarketPrice,
  MarketStock,
  MarketWarning,
} from "../../domain/market/market";

export interface MarketService {
  listStocks(): Promise<readonly MarketStock[]>;
  getStock(symbol: string): Promise<MarketStock>;
  getPrice(symbol: string): Promise<MarketPrice>;
  getWarnings(symbol: string): Promise<readonly MarketWarning[]>;
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

export type MarketDataSourceErrorCode =
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_UNKNOWN_ERROR";

export class MarketDataSourceError extends Error {
  constructor(
    readonly code: MarketDataSourceErrorCode,
    readonly retryable: boolean,
  ) {
    super("MARKET_DATA_SOURCE_ERROR");
    this.name = "MarketDataSourceError";
  }
}
