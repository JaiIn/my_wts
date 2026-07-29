import type {
  CandleInterval,
  ExchangeRate,
  MarketCandle,
  MarketCalendar,
  MarketCountry,
  MarketOrderbook,
  MarketTrade,
  MarketWarning,
} from "../../domain/market/market";
import type { Watchlist } from "../../domain/watchlist/watchlist";
import { TossEnvelopeDecodeError } from "../../integrations/toss/envelope";
import {
  MarketDataNotFoundError,
  MarketDataSourceError,
  type MarketService,
} from "./market-service";

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

export type MarketWarningView = {
  key: string;
  title: string;
  description: string;
  exchange?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type MarketOrderbookLevelView = {
  price: string;
  volume: string;
};

export type MarketOrderbookView = {
  symbol: string;
  observedAt?: string | null;
  currency: string;
  asks: readonly MarketOrderbookLevelView[];
  bids: readonly MarketOrderbookLevelView[];
};

export type MarketTradeView = {
  key: string;
  price: string;
  volume: string;
  observedAt: string;
  currency: string;
};

export type SymbolTradesView = {
  symbol: string;
  trades: readonly MarketTradeView[];
};

export type MarketCandleView = {
  timestamp: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  closePrice: string;
  volume: string;
  currency: string;
};

export type MarketCandlePageView = {
  candles: readonly MarketCandleView[];
  nextBefore?: string | null;
};

export type SymbolCandleSeriesView = {
  symbol: string;
  interval: CandleInterval;
  pages: readonly MarketCandlePageView[];
};

export type SymbolIntervalErrorView = SymbolErrorView & {
  interval: CandleInterval;
};

export type MarketSessionView = {
  kind: "day" | "pre" | "regular" | "after";
  startTime: string;
  endTime: string;
};

export type MarketCalendarView = {
  symbol: string;
  country: MarketCountry;
  marketTimeZone: string;
  displayTimeZone: string;
  date: string;
  status: "day" | "pre" | "regular" | "after" | "closed";
  sessions: readonly MarketSessionView[];
  previousBusinessDay: string;
  nextBusinessDay: string;
};

export type ExchangeRateView = {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  midRate: string;
  basisPoint: string;
  rateChangeType: "UP" | "EQUAL" | "DOWN";
  validFrom: string;
  validUntil: string;
};

export type MarketScreenErrorView = {
  kind: "invalid-data" | "not-found" | "unavailable" | "unexpected";
  title: string;
  description: string;
  retryable: boolean;
};

export type SymbolWarningsView = {
  symbol: string;
  warnings: readonly MarketWarningView[];
};

export type SymbolErrorView = {
  symbol: string;
  error: MarketScreenErrorView;
};

export type MarketScreenData = {
  initialSymbol: string;
  stocks: readonly MarketStockView[];
  prices: readonly MarketPriceView[];
  warnings: readonly SymbolWarningsView[];
  orderbooks: readonly MarketOrderbookView[];
  trades: readonly SymbolTradesView[];
  candleSeries: readonly SymbolCandleSeriesView[];
  priceErrors: readonly SymbolErrorView[];
  warningErrors: readonly SymbolErrorView[];
  orderbookErrors: readonly SymbolErrorView[];
  tradeErrors: readonly SymbolErrorView[];
  candleErrors: readonly SymbolIntervalErrorView[];
  calendars?: readonly MarketCalendarView[];
  exchangeRates?: readonly ExchangeRateView[];
  calendarErrors?: readonly SymbolErrorView[];
  exchangeRateErrors?: readonly SymbolErrorView[];
  watchlists?: readonly Watchlist[];
  screenError?: MarketScreenErrorView;
};

export const MARKET_SCREEN_REFERENCE_TIME = "2025-03-10T23:00:00+09:00";
export const MARKET_SCREEN_REFERENCE_DATE = "2025-03-10";

const WARNING_MESSAGES: Record<string, { title: string; description: string }> =
  {
    LIQUIDATION_TRADING: {
      title: "정리매매 종목",
      description: "상장폐지 절차에 따라 정리매매가 진행 중인 종목입니다.",
    },
    OVERHEATED: {
      title: "단기과열종목",
      description: "단기과열종목으로 지정된 상태입니다.",
    },
    INVESTMENT_WARNING: {
      title: "투자경고종목",
      description: "투자경고종목으로 지정된 상태입니다.",
    },
    INVESTMENT_RISK: {
      title: "투자위험종목",
      description: "투자위험종목으로 지정된 상태입니다.",
    },
    VI_STATIC_AND_DYNAMIC: {
      title: "변동성 완화장치 발동",
      description: "정적·동적 변동성 완화장치가 함께 발동된 상태입니다.",
    },
    VI_STATIC: {
      title: "정적 변동성 완화장치 발동",
      description: "정적 변동성 완화장치가 발동된 상태입니다.",
    },
    VI_DYNAMIC: {
      title: "동적 변동성 완화장치 발동",
      description: "동적 변동성 완화장치가 발동된 상태입니다.",
    },
    STOCK_WARRANTS: {
      title: "신주인수권 관련 종목",
      description: "신주인수권증서 또는 신주인수권증권 관련 종목입니다.",
    },
  };

export function marketWarningView(
  warning: MarketWarning,
  index: number,
): MarketWarningView {
  const message = WARNING_MESSAGES[warning.warningType] ?? {
    title: "종목 유의사항",
    description: "확인되지 않은 유형의 종목 유의사항이 있습니다.",
  };

  return {
    key: `warning-${index}`,
    ...message,
    exchange: warning.exchange,
    startDate: warning.startDate,
    endDate: warning.endDate,
  };
}

export function safeMarketScreenError(
  error: unknown,
  subject:
    | "candles"
    | "market"
    | "calendar"
    | "exchange-rate"
    | "orderbook"
    | "price"
    | "trades"
    | "warnings",
): MarketScreenErrorView {
  if (error instanceof MarketDataNotFoundError) {
    return {
      kind: "not-found",
      title:
        subject === "calendar"
          ? "장 운영 정보를 제공하지 않는 시장입니다."
          : subject === "exchange-rate"
            ? "환율 정보를 제공하지 않는 통화입니다."
            : subject === "price"
              ? "현재가를 찾을 수 없습니다."
              : subject === "candles"
                ? "캔들 데이터를 찾을 수 없습니다."
                : subject === "orderbook"
                  ? "호가를 찾을 수 없습니다."
                  : subject === "trades"
                    ? "체결 내역을 찾을 수 없습니다."
                    : subject === "warnings"
                      ? "종목 유의사항을 찾을 수 없습니다."
                      : "시장 데이터를 찾을 수 없습니다.",
      description: "다른 종목을 선택해 주세요.",
      retryable: false,
    };
  }

  if (error instanceof MarketDataSourceError) {
    return {
      kind: "unavailable",
      title:
        subject === "calendar"
          ? "장 운영 정보를 불러오지 못했습니다."
          : subject === "exchange-rate"
            ? "환율 정보를 불러오지 못했습니다."
            : subject === "warnings"
              ? "종목 유의사항을 불러오지 못했습니다."
              : subject === "candles"
                ? "캔들 데이터를 불러오지 못했습니다."
                : subject === "orderbook"
                  ? "호가를 불러오지 못했습니다."
                  : subject === "trades"
                    ? "체결 내역을 불러오지 못했습니다."
                    : subject === "price"
                      ? "현재가를 불러오지 못했습니다."
                      : "시장 데이터를 불러오지 못했습니다.",
      description: "일시적으로 데이터를 사용할 수 없습니다.",
      retryable: error.retryable,
    };
  }

  if (error instanceof TossEnvelopeDecodeError) {
    return {
      kind: "invalid-data",
      title: "시장 데이터를 표시할 수 없습니다.",
      description: "데이터 형식을 확인할 수 없습니다.",
      retryable: false,
    };
  }

  return {
    kind: "unexpected",
    title: "시장 데이터를 표시할 수 없습니다.",
    description: "예상하지 못한 문제가 발생했습니다.",
    retryable: false,
  };
}

export function failedMarketScreen(error: unknown): MarketScreenData {
  return {
    initialSymbol: "",
    stocks: [],
    prices: [],
    warnings: [],
    orderbooks: [],
    trades: [],
    candleSeries: [],
    priceErrors: [],
    warningErrors: [],
    orderbookErrors: [],
    tradeErrors: [],
    candleErrors: [],
    calendars: [],
    exchangeRates: [],
    calendarErrors: [],
    exchangeRateErrors: [],
    screenError: safeMarketScreenError(error, "market"),
  };
}

function orderbookView(
  symbol: string,
  orderbook: MarketOrderbook,
): MarketOrderbookView {
  return {
    symbol,
    observedAt: orderbook.observedAt,
    currency: orderbook.currency,
    asks: orderbook.asks.map(({ price, volume }) => ({ price, volume })),
    bids: orderbook.bids.map(({ price, volume }) => ({ price, volume })),
  };
}

function tradesView(
  symbol: string,
  trades: readonly MarketTrade[],
): SymbolTradesView {
  return {
    symbol,
    trades: trades.map(({ currency, observedAt, price, volume }, index) => ({
      key: `${symbol}-${observedAt}-${index}`,
      price,
      volume,
      observedAt,
      currency,
    })),
  };
}

function candleView(candle: MarketCandle): MarketCandleView {
  return {
    timestamp: candle.timestamp,
    openPrice: candle.openPrice,
    highPrice: candle.highPrice,
    lowPrice: candle.lowPrice,
    closePrice: candle.closePrice,
    volume: candle.volume,
    currency: candle.currency,
  };
}

async function loadCandleSeries(
  service: MarketService,
  symbol: string,
  interval: CandleInterval,
): Promise<SymbolCandleSeriesView> {
  const pages: MarketCandlePageView[] = [];
  const timestamps = new Set<number>();
  const cursors = new Set<string>();
  let before: string | undefined;
  let previousTimestamp = Number.POSITIVE_INFINITY;

  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const page = await service.getCandles({
      symbol,
      interval,
      count: 100,
      before,
      adjusted: true,
    });

    for (const candle of page.candles) {
      const timestamp = Date.parse(candle.timestamp);
      if (timestamps.has(timestamp) || timestamp >= previousTimestamp) {
        throw new TossEnvelopeDecodeError("INVALID_RESULT");
      }
      timestamps.add(timestamp);
      previousTimestamp = timestamp;
    }

    pages.push({
      candles: page.candles.map(candleView),
      nextBefore: page.nextBefore,
    });
    if (!page.nextBefore) {
      return { symbol, interval, pages };
    }
    if (cursors.has(page.nextBefore)) {
      throw new TossEnvelopeDecodeError("INVALID_RESULT");
    }
    cursors.add(page.nextBefore);
    before = page.nextBefore;
  }

  throw new TossEnvelopeDecodeError("INVALID_RESULT");
}

export async function loadMarketScreen(
  service: MarketService,
): Promise<MarketScreenData> {
  let stocks;
  try {
    stocks = await service.listStocks();
  } catch (error) {
    return failedMarketScreen(error);
  }

  if (stocks.length === 0) {
    return {
      initialSymbol: "",
      stocks: [],
      prices: [],
      warnings: [],
      orderbooks: [],
      trades: [],
      candleSeries: [],
      priceErrors: [],
      warningErrors: [],
      orderbookErrors: [],
      tradeErrors: [],
      candleErrors: [],
      calendars: [],
      exchangeRates: [],
      calendarErrors: [],
      exchangeRateErrors: [],
    };
  }

  const initialStock =
    stocks.find(({ symbol }) => symbol === INITIAL_MARKET_SYMBOL) ?? stocks[0];
  const priceResults = await Promise.all(
    stocks.map(async ({ symbol }) => {
      try {
        return { ok: true as const, value: await service.getPrice(symbol) };
      } catch (error) {
        if (error instanceof MarketDataNotFoundError) {
          return { ok: true as const, value: undefined };
        }
        return {
          ok: false as const,
          symbol,
          error: safeMarketScreenError(error, "price"),
        };
      }
    }),
  );
  const warningResults = await Promise.all(
    stocks.map(async ({ symbol }) => {
      try {
        const values = await service.getWarnings(symbol);
        return {
          ok: true as const,
          symbol,
          values: values.map(marketWarningView),
        };
      } catch (error) {
        return {
          ok: false as const,
          symbol,
          error: safeMarketScreenError(error, "warnings"),
        };
      }
    }),
  );
  const orderbookResults = await Promise.all(
    stocks.map(async ({ symbol }) => {
      try {
        return {
          ok: true as const,
          symbol,
          value: orderbookView(symbol, await service.getOrderbook(symbol)),
        };
      } catch (error) {
        return {
          ok: false as const,
          symbol,
          error: safeMarketScreenError(error, "orderbook"),
        };
      }
    }),
  );
  const tradeResults = await Promise.all(
    stocks.map(async ({ symbol }) => {
      try {
        return {
          ok: true as const,
          symbol,
          value: tradesView(symbol, await service.getTrades(symbol, 20)),
        };
      } catch (error) {
        return {
          ok: false as const,
          symbol,
          error: safeMarketScreenError(error, "trades"),
        };
      }
    }),
  );
  const candleResults = await Promise.all(
    stocks.flatMap(({ symbol }) =>
      (["1d", "1m"] as const).map(async (interval) => {
        try {
          return {
            ok: true as const,
            symbol,
            interval,
            value: await loadCandleSeries(service, symbol, interval),
          };
        } catch (error) {
          return {
            ok: false as const,
            symbol,
            interval,
            error: safeMarketScreenError(error, "candles"),
          };
        }
      }),
    ),
  );
  const referenceTimestamp = Date.parse(MARKET_SCREEN_REFERENCE_TIME);
  const calendarResults = await Promise.all(
    stocks.map(async ({ market, symbol }) => {
      const country = marketCountryFor(market);
      if (!country) {
        return {
          ok: false as const,
          symbol,
          error: safeMarketScreenError(
            new MarketDataNotFoundError(),
            "calendar",
          ),
        };
      }
      try {
        const calendar = await service.getMarketCalendar({
          country,
          date: MARKET_SCREEN_REFERENCE_DATE,
        });
        return {
          ok: true as const,
          value: marketCalendarView(symbol, calendar, referenceTimestamp),
        };
      } catch (error) {
        return {
          ok: false as const,
          symbol,
          error: safeMarketScreenError(error, "calendar"),
        };
      }
    }),
  );
  const exchangeRateResults = await Promise.all(
    stocks.map(async ({ currency, symbol }) => {
      if (currency === "KRW") {
        return { ok: true as const, value: undefined };
      }
      try {
        const rate = await service.getExchangeRate({
          baseCurrency: currency,
          quoteCurrency: "KRW",
          dateTime: MARKET_SCREEN_REFERENCE_TIME,
        });
        return {
          ok: true as const,
          value: marketExchangeRateView(symbol, rate),
        };
      } catch (error) {
        return {
          ok: false as const,
          symbol,
          error: safeMarketScreenError(error, "exchange-rate"),
        };
      }
    }),
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
    prices: priceResults.flatMap((result) => {
      if (!result.ok || !result.value) {
        return [];
      }
      const { currency, lastPrice, observedAt, symbol } = result.value;
      return [{ symbol, observedAt, lastPrice, currency }];
    }),
    warnings: warningResults
      .filter((result) => result.ok)
      .map(({ symbol, values }) => ({ symbol, warnings: values })),
    orderbooks: orderbookResults
      .filter((result) => result.ok)
      .map(({ value }) => value),
    trades: tradeResults
      .filter((result) => result.ok)
      .map(({ value }) => value),
    candleSeries: candleResults
      .filter((result) => result.ok)
      .map(({ value }) => value),
    priceErrors: priceResults
      .filter((result) => !result.ok)
      .map(({ error, symbol }) => ({ symbol, error })),
    warningErrors: warningResults
      .filter((result) => !result.ok)
      .map(({ error, symbol }) => ({ symbol, error })),
    orderbookErrors: orderbookResults
      .filter((result) => !result.ok)
      .map(({ error, symbol }) => ({ symbol, error })),
    tradeErrors: tradeResults
      .filter((result) => !result.ok)
      .map(({ error, symbol }) => ({ symbol, error })),
    candleErrors: candleResults
      .filter((result) => !result.ok)
      .map(({ error, interval, symbol }) => ({ symbol, interval, error })),
    calendars: calendarResults
      .filter((result) => result.ok)
      .map(({ value }) => value),
    exchangeRates: exchangeRateResults.flatMap((result) =>
      result.ok && result.value ? [result.value] : [],
    ),
    calendarErrors: calendarResults
      .filter((result) => !result.ok)
      .map(({ error, symbol }) => ({ symbol, error })),
    exchangeRateErrors: exchangeRateResults
      .filter((result) => !result.ok)
      .map(({ error, symbol }) => ({ symbol, error })),
  };
}

function marketCountryFor(market: string): MarketCountry | undefined {
  if (market === "KOSPI" || market === "KOSDAQ" || market === "KRX") {
    return "KR";
  }
  if (market === "NASDAQ" || market === "NYSE" || market === "AMEX") {
    return "US";
  }
  return undefined;
}

export function marketStatusAt(
  calendar: MarketCalendar,
  timestamp: number,
): MarketCalendarView["status"] {
  const active = calendar.today.sessions.find(
    ({ startTime, endTime }) =>
      Date.parse(startTime) <= timestamp && timestamp < Date.parse(endTime),
  );
  return active?.kind ?? "closed";
}

export function marketCalendarView(
  symbol: string,
  calendar: MarketCalendar,
  timestamp: number,
): MarketCalendarView {
  return {
    symbol,
    country: calendar.country,
    marketTimeZone: calendar.marketTimeZone,
    displayTimeZone: calendar.displayTimeZone,
    date: calendar.today.date,
    status: marketStatusAt(calendar, timestamp),
    sessions: calendar.today.sessions.map(({ kind, startTime, endTime }) => ({
      kind,
      startTime,
      endTime,
    })),
    previousBusinessDay: calendar.previousBusinessDay.date,
    nextBusinessDay: calendar.nextBusinessDay.date,
  };
}

export function marketExchangeRateView(
  symbol: string,
  rate: ExchangeRate,
): ExchangeRateView {
  return { symbol, ...rate };
}
