"use client";

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  INITIAL_MARKET_SYMBOL,
  MARKET_SCREEN_REFERENCE_DATE,
  MARKET_SCREEN_REFERENCE_TIME,
  marketWarningView,
  type MarketCalendarView,
  type MarketScreenData,
  type MarketScreenErrorView,
  type MarketStockView,
} from "../../application/market/market-screen";
import type { CandleInterval } from "../../domain/market/market";
import {
  getMarketCalendar,
  getMarketCandles,
  getMarketExchangeRate,
  getMarketOrderbook,
  getMarketPrices,
  getMarketStocks,
  getMarketTrades,
  getMarketWarnings,
  getWatchlists,
  MARKET_BFF_SYMBOLS,
  MarketBffError,
  type BffCalendar,
} from "./market-bff-client";
import {
  candleStaleTime,
  MARKET_QUERY_TTL,
  marketQueryKeys,
} from "./market-query";
import { MarketScreen } from "./market-screen";

function safeUiError(
  error: unknown,
  subject: string,
): MarketScreenErrorView | undefined {
  if (!error) return undefined;
  const bff = error instanceof MarketBffError ? error : undefined;
  const notFound = bff?.status === 404;
  const invalid = bff?.code === "INVALID_BFF_RESPONSE";
  const unavailableTitle: Record<string, string> = {
    현재가: "현재가를 불러오지 못했습니다.",
    "종목 경고": "종목 유의사항을 불러오지 못했습니다.",
    호가: "호가를 불러오지 못했습니다.",
    체결: "체결 내역을 불러오지 못했습니다.",
    캔들: "캔들 데이터를 불러오지 못했습니다.",
    "장 캘린더": "장 운영 정보를 불러오지 못했습니다.",
    환율: "환율 정보를 불러오지 못했습니다.",
    종목: "시장 데이터를 불러오지 못했습니다.",
  };
  return {
    kind: notFound ? "not-found" : invalid ? "invalid-data" : "unavailable",
    title: notFound
      ? `${subject} 데이터가 없습니다.`
      : (unavailableTitle[subject] ?? "시장 데이터를 불러오지 못했습니다."),
    description:
      bff?.status === 401
        ? "로그인 세션을 확인한 뒤 다시 시도해 주세요."
        : bff?.status === 429 && bff.retryAfterSeconds !== undefined
          ? `${bff.retryAfterSeconds}초 후 다시 시도해 주세요.`
          : "안전한 로컬 BFF 응답만 표시합니다.",
    retryable: bff?.retryable === true && bff.status !== 429,
  };
}

function countryFor(stock?: MarketStockView): "KR" | "US" | undefined {
  if (!stock) return undefined;
  if (["KOSPI", "KOSDAQ", "KRX"].includes(stock.market)) return "KR";
  if (["NASDAQ", "NYSE", "AMEX"].includes(stock.market)) return "US";
  return undefined;
}

function sessionList(calendar: BffCalendar, country: "KR" | "US") {
  const today = calendar.today;
  const values =
    country === "KR"
      ? [
          ["pre", today.integrated?.preMarket],
          ["regular", today.integrated?.regularMarket],
          ["after", today.integrated?.afterMarket],
        ]
      : [
          ["day", today.dayMarket],
          ["pre", today.preMarket],
          ["regular", today.regularMarket],
          ["after", today.afterMarket],
        ];
  return values.flatMap(([kind, session]) =>
    session && typeof session === "object"
      ? [
          {
            kind: kind as "day" | "pre" | "regular" | "after",
            startTime: session.startTime,
            endTime: session.endTime,
          },
        ]
      : [],
  );
}

function calendarView(
  symbol: string,
  country: "KR" | "US",
  calendar: BffCalendar,
): MarketCalendarView {
  const sessions = sessionList(calendar, country);
  const reference = Date.parse(MARKET_SCREEN_REFERENCE_TIME);
  const active = sessions.find(
    ({ startTime, endTime }) =>
      Date.parse(startTime) <= reference && reference < Date.parse(endTime),
  );
  return {
    symbol,
    country,
    marketTimeZone: country === "KR" ? "Asia/Seoul" : "America/New_York",
    displayTimeZone: "Asia/Seoul",
    date: calendar.today.date,
    status: active?.kind ?? "closed",
    sessions,
    previousBusinessDay: calendar.previousBusinessDay.date,
    nextBusinessDay: calendar.nextBusinessDay.date,
  };
}

export function MarketScreenBff() {
  const queryClient = useQueryClient();
  const [selectedSymbol, setSelectedSymbol] = useState(INITIAL_MARKET_SYMBOL);
  const [interval, setInterval] = useState<CandleInterval>("1d");

  const stocksQuery = useQuery({
    queryKey: marketQueryKeys.stocks(MARKET_BFF_SYMBOLS),
    queryFn: ({ signal }) => getMarketStocks(MARKET_BFF_SYMBOLS, signal),
    staleTime: MARKET_QUERY_TTL.stock,
  });
  const stocks = useMemo(
    () =>
      (stocksQuery.data ?? []).map(
        ({ symbol, name, englishName, market, currency, status }) => ({
          symbol,
          displayName: name,
          englishName,
          market,
          currency,
          status,
        }),
      ),
    [stocksQuery.data],
  );
  const selectedStock = stocks.find(({ symbol }) => symbol === selectedSymbol);
  const country = countryFor(selectedStock);
  const enabled = Boolean(selectedStock);

  const pricesQuery = useQuery({
    queryKey: marketQueryKeys.prices([selectedSymbol]),
    queryFn: ({ signal }) => getMarketPrices([selectedSymbol], signal),
    enabled,
    staleTime: MARKET_QUERY_TTL.price,
  });
  const warningsQuery = useQuery({
    queryKey: marketQueryKeys.warnings(selectedSymbol),
    queryFn: ({ signal }) => getMarketWarnings(selectedSymbol, signal),
    enabled,
    staleTime: MARKET_QUERY_TTL.warnings,
  });
  const orderbookQuery = useQuery({
    queryKey: marketQueryKeys.orderbook(selectedSymbol),
    queryFn: ({ signal }) => getMarketOrderbook(selectedSymbol, signal),
    enabled,
    staleTime: MARKET_QUERY_TTL.orderbook,
  });
  const tradesQuery = useQuery({
    queryKey: marketQueryKeys.trades(selectedSymbol),
    queryFn: ({ signal }) => getMarketTrades(selectedSymbol, signal),
    enabled,
    staleTime: MARKET_QUERY_TTL.trades,
  });
  const candlesQuery = useInfiniteQuery({
    queryKey: marketQueryKeys.candles(selectedSymbol, interval),
    queryFn: ({ pageParam, signal }) =>
      getMarketCandles(
        {
          symbol: selectedSymbol,
          interval,
          before: pageParam,
        },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextBefore ?? undefined,
    enabled,
    staleTime: candleStaleTime(interval),
  });
  const calendarQuery = useQuery({
    queryKey:
      country === undefined
        ? ["market", "calendar", "unsupported", selectedSymbol]
        : marketQueryKeys.calendar(country, MARKET_SCREEN_REFERENCE_DATE),
    queryFn: ({ signal }) =>
      getMarketCalendar(country!, MARKET_SCREEN_REFERENCE_DATE, signal),
    enabled: enabled && country !== undefined,
    staleTime: MARKET_QUERY_TTL.calendar,
  });
  const exchangeQuery = useQuery({
    queryKey: marketQueryKeys.exchangeRate("USD", "KRW"),
    queryFn: ({ signal }) => getMarketExchangeRate("USD", "KRW", signal),
    enabled: enabled && selectedStock?.currency === "USD",
    staleTime: MARKET_QUERY_TTL.exchangeRate,
  });
  const watchlistsQuery = useQuery({
    queryKey: marketQueryKeys.watchlists,
    queryFn: ({ signal }) => getWatchlists(signal),
    staleTime: 0,
  });

  const isFetching = [
    pricesQuery,
    warningsQuery,
    orderbookQuery,
    tradesQuery,
    candlesQuery,
    calendarQuery,
    exchangeQuery,
  ].some((query) => query.isFetching);
  const hasWidgetData = [
    pricesQuery.data,
    warningsQuery.data,
    orderbookQuery.data,
    tradesQuery.data,
    candlesQuery.data,
    calendarQuery.data,
    exchangeQuery.data,
  ].some(Boolean);

  const data: MarketScreenData = {
    initialSymbol: INITIAL_MARKET_SYMBOL,
    stocks,
    prices: (pricesQuery.data ?? []).map(
      ({ symbol, timestamp, lastPrice, currency }) => ({
        symbol,
        observedAt: timestamp,
        lastPrice,
        currency,
      }),
    ),
    warnings:
      warningsQuery.data === undefined
        ? []
        : [
            {
              symbol: selectedSymbol,
              warnings: warningsQuery.data.map(marketWarningView),
            },
          ],
    orderbooks:
      orderbookQuery.data === undefined
        ? []
        : [
            {
              symbol: selectedSymbol,
              observedAt: orderbookQuery.data.timestamp,
              currency: orderbookQuery.data.currency,
              asks: orderbookQuery.data.asks,
              bids: orderbookQuery.data.bids,
            },
          ],
    trades:
      tradesQuery.data === undefined
        ? []
        : [
            {
              symbol: selectedSymbol,
              trades: tradesQuery.data.map((trade, index) => ({
                key: `${selectedSymbol}-${trade.timestamp}-${index}`,
                price: trade.price,
                volume: trade.volume,
                observedAt: trade.timestamp,
                currency: trade.currency,
              })),
            },
          ],
    candleSeries:
      candlesQuery.data === undefined
        ? []
        : [
            {
              symbol: selectedSymbol,
              interval,
              pages: candlesQuery.data.pages,
            },
          ],
    calendars:
      calendarQuery.data && country
        ? [calendarView(selectedSymbol, country, calendarQuery.data)]
        : [],
    exchangeRates:
      exchangeQuery.data === undefined
        ? []
        : [{ symbol: selectedSymbol, ...exchangeQuery.data }],
    priceErrors: errorFor(selectedSymbol, pricesQuery.error, "현재가"),
    warningErrors: errorFor(selectedSymbol, warningsQuery.error, "종목 경고"),
    orderbookErrors: errorFor(selectedSymbol, orderbookQuery.error, "호가"),
    tradeErrors: errorFor(selectedSymbol, tradesQuery.error, "체결"),
    candleErrors: candlesQuery.error
      ? [
          {
            symbol: selectedSymbol,
            interval,
            error: safeUiError(candlesQuery.error, "캔들")!,
          },
        ]
      : [],
    calendarErrors:
      country === undefined && selectedStock
        ? [
            {
              symbol: selectedSymbol,
              error: {
                kind: "not-found",
                title: "지원하지 않는 시장입니다.",
                description: "KR 또는 US 종목을 선택해 주세요.",
                retryable: false,
              },
            },
          ]
        : errorFor(selectedSymbol, calendarQuery.error, "장 캘린더"),
    exchangeRateErrors:
      selectedStock?.currency !== "KRW" && selectedStock?.currency !== "USD"
        ? [
            {
              symbol: selectedSymbol,
              error: {
                kind: "not-found",
                title: "지원하지 않는 통화입니다.",
                description: "KRW 또는 USD 종목을 선택해 주세요.",
                retryable: false,
              },
            },
          ]
        : errorFor(selectedSymbol, exchangeQuery.error, "환율"),
    watchlists: watchlistsQuery.data ?? [],
    screenError: safeUiError(stocksQuery.error, "종목"),
  };

  return (
    <MarketScreen
      {...data}
      controlledSymbol={selectedSymbol}
      controlledCandleInterval={interval}
      onSymbolChange={(symbol) => {
        void queryClient.cancelQueries({
          predicate: ({ queryKey }) => queryKey.includes(selectedSymbol),
        });
        queryClient.removeQueries({
          queryKey: ["market", "candles", symbol.toUpperCase()],
        });
        setSelectedSymbol(symbol.toUpperCase());
        setInterval("1d");
      }}
      onCandleIntervalChange={(nextInterval) => {
        queryClient.removeQueries({
          queryKey: marketQueryKeys.candles(selectedSymbol, nextInterval),
          exact: true,
        });
        setInterval(nextInterval);
      }}
      onWatchlistsChanged={() =>
        queryClient.invalidateQueries({
          queryKey: marketQueryKeys.watchlists,
        })
      }
      onNextCandlePage={() => {
        if (candlesQuery.hasNextPage && !candlesQuery.isFetchingNextPage) {
          void candlesQuery.fetchNextPage();
        }
      }}
      hasNextCandlePage={candlesQuery.hasNextPage}
      isFetchingNextCandlePage={candlesQuery.isFetchingNextPage}
      networkStatus={
        isFetching ? (hasWidgetData ? "stale" : "fetching") : undefined
      }
    />
  );
}

function errorFor(symbol: string, error: unknown, subject: string) {
  const mapped = safeUiError(error, subject);
  return mapped ? [{ symbol, error: mapped }] : [];
}
