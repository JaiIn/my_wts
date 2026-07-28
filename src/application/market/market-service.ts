import type {
  CandleInterval,
  MarketCandlePage,
  MarketOrderbook,
  MarketPrice,
  MarketStock,
  MarketTrade,
  MarketWarning,
} from "../../domain/market/market";

export interface MarketService {
  listStocks(): Promise<readonly MarketStock[]>;
  getStock(symbol: string): Promise<MarketStock>;
  getPrice(symbol: string): Promise<MarketPrice>;
  getWarnings(symbol: string): Promise<readonly MarketWarning[]>;
  getOrderbook(symbol: string): Promise<MarketOrderbook>;
  getTrades(symbol: string, count?: number): Promise<readonly MarketTrade[]>;
  getCandles(input: {
    symbol: string;
    interval: CandleInterval;
    count?: number;
    before?: string;
    adjusted?: boolean;
  }): Promise<MarketCandlePage>;
}

export class MarketDataInvalidCursorError extends Error {
  readonly code = "VALIDATION_FAILED";
  readonly status = 400;
  readonly retryable = false;

  constructor() {
    super("INVALID_CANDLE_CURSOR");
    this.name = "MarketDataInvalidCursorError";
  }
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
