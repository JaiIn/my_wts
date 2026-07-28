import type { DecimalString } from "../common/decimal";

export type KoreanMarketDetail = {
  liquidationTrading: boolean;
  nxtSupported: boolean;
  krxTradingSuspended: boolean;
  nxtTradingSuspended?: boolean | null;
};

export type MarketStock = {
  symbol: string;
  displayName: string;
  englishName: string;
  isinCode: string;
  market: string;
  securityType: string;
  isCommonShare: boolean;
  status: string;
  currency: string;
  listedOn?: string | null;
  delistedOn?: string | null;
  sharesOutstanding: DecimalString;
  leverageFactor?: DecimalString | null;
  koreanMarketDetail?: KoreanMarketDetail | null;
};

export type MarketPrice = {
  symbol: string;
  observedAt?: string | null;
  lastPrice: DecimalString;
  currency: string;
};

export type MarketWarning = {
  warningType: string;
  exchange?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type MarketOrderbookLevel = {
  price: DecimalString;
  volume: DecimalString;
};

export type MarketOrderbook = {
  observedAt?: string | null;
  currency: string;
  asks: readonly MarketOrderbookLevel[];
  bids: readonly MarketOrderbookLevel[];
};

export type MarketTrade = {
  price: DecimalString;
  volume: DecimalString;
  observedAt: string;
  currency: string;
};

export type CandleInterval = "1m" | "1d";

export type MarketCandle = {
  timestamp: string;
  openPrice: DecimalString;
  highPrice: DecimalString;
  lowPrice: DecimalString;
  closePrice: DecimalString;
  volume: DecimalString;
  currency: string;
};

export type MarketCandlePage = {
  candles: readonly MarketCandle[];
  nextBefore?: string | null;
};
