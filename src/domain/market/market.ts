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
