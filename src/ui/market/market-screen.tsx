"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";

import type {
  MarketCandlePageView,
  MarketCandleView,
  ExchangeRateView,
  MarketCalendarView,
  MarketOrderbookView,
  MarketPriceView,
  MarketScreenData,
  MarketScreenErrorView,
  MarketStockView,
  MarketTradeView,
  MarketWarningView,
} from "../../application/market/market-screen";
import { buildCandleChartView } from "../../application/market/candle-chart";
import type { CandleInterval } from "../../domain/market/market";
import type {
  MarketCountry,
  Watchlist,
} from "../../domain/watchlist/watchlist";
import { CandleChart } from "./candle-chart";
import { searchMarketStocks } from "./market-search";

function formatDecimalString(value: string): string {
  const match = /^([+-]?)(\d+)(\.\d+)?([eE][+-]?\d+)?$/.exec(value);
  if (!match) {
    return value;
  }

  const [, sign, integer, fraction = "", exponent = ""] = match;
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${groupedInteger}${fraction}${exponent}`;
}

const sessionLabels = {
  day: "데이마켓",
  pre: "프리마켓",
  regular: "정규장",
  after: "애프터마켓",
} as const;

const statusLabels = {
  day: "데이마켓 운영 중",
  pre: "프리마켓 운영 중",
  regular: "정규장 운영 중",
  after: "애프터마켓 운영 중",
  closed: "현재 운영 세션 없음",
} as const;

function formatMarketTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function CalendarWidget({
  calendar,
  error,
  stock,
}: {
  calendar?: MarketCalendarView;
  error?: MarketScreenErrorView;
  stock?: MarketStockView;
}) {
  return (
    <section
      aria-labelledby="market-calendar-title"
      className="min-w-0 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 id="market-calendar-title" className="text-lg font-semibold">
        장 운영 상태
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        {stock ? `장 캘린더 · ${stock.symbol}` : "선택 종목 없음"}
      </p>
      {error ? (
        <div className="mt-5">
          <InlineError error={error} />
        </div>
      ) : !calendar ? (
        <div role="status" className="mt-5">
          장 캘린더가 비어 있습니다.
        </div>
      ) : (
        <div className="mt-5">
          <p role="status" className="font-semibold text-blue-800">
            {statusLabels[calendar.status]}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            이 상태는 주문 가능 여부를 보장하지 않습니다.
          </p>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-slate-500">시장 기준일</dt>
              <dd className="font-medium">{calendar.date}</dd>
            </div>
            <div>
              <dt className="text-slate-500">시간대</dt>
              <dd className="font-medium">
                {calendar.displayTimeZone}
                {calendar.marketTimeZone !== calendar.displayTimeZone
                  ? ` · 현지 기준일 ${calendar.marketTimeZone}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">인접 영업일</dt>
              <dd className="font-medium">
                {calendar.previousBusinessDay} · {calendar.nextBusinessDay}
              </dd>
            </div>
          </dl>
          {calendar.sessions.length === 0 ? (
            <p role="status" className="mt-4 text-sm text-slate-600">
              휴장일이며 운영 세션이 없습니다.
            </p>
          ) : (
            <ul aria-label="장 세션" className="mt-4 grid gap-2 text-sm">
              {calendar.sessions.map((session) => (
                <li
                  key={session.kind}
                  className="rounded-xl bg-slate-50 px-3 py-2"
                >
                  <span className="font-semibold">
                    {sessionLabels[session.kind]}
                  </span>
                  <span className="mt-1 block text-slate-600">
                    {formatMarketTime(
                      session.startTime,
                      calendar.displayTimeZone,
                    )}{" "}
                    ~{" "}
                    {formatMarketTime(
                      session.endTime,
                      calendar.displayTimeZone,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-slate-500">조회 일정 · 비실시간</p>
        </div>
      )}
    </section>
  );
}

function ExchangeRateWidget({
  error,
  rate,
  stock,
}: {
  error?: MarketScreenErrorView;
  rate?: ExchangeRateView;
  stock?: MarketStockView;
}) {
  if (stock?.currency === "KRW" && !error) {
    return null;
  }
  return (
    <section
      aria-labelledby="exchange-rate-title"
      className="min-w-0 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 id="exchange-rate-title" className="text-lg font-semibold">
        참고 환율
      </h2>
      {error ? (
        <div className="mt-5">
          <InlineError error={error} />
        </div>
      ) : !rate ? (
        <p role="status" className="mt-5 text-sm text-slate-600">
          표시할 환율이 없습니다.
        </p>
      ) : (
        <div className="mt-5">
          <p className="text-sm text-slate-600">
            1 {rate.baseCurrency} ={" "}
            <strong data-testid="exchange-rate">
              {formatDecimalString(rate.rate)} {rate.quoteCurrency}
            </strong>
          </p>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-slate-500">통화쌍</dt>
              <dd className="font-medium">
                {rate.baseCurrency}/{rate.quoteCurrency}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">기준 시각</dt>
              <dd className="font-medium">
                {formatMarketTime(rate.validFrom, "Asia/Seoul")}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            참고 환율 · 비실시간 · 실제 환전 또는 주문 적용 환율이 아닙니다.
          </p>
        </div>
      )}
    </section>
  );
}

function watchlistCountry(
  stock: MarketStockView | undefined,
): MarketCountry | undefined {
  if (!stock) return undefined;
  if (["KOSPI", "KOSDAQ", "KRX"].includes(stock.market)) return "KR";
  if (["NASDAQ", "NYSE", "AMEX"].includes(stock.market)) return "US";
  return undefined;
}

function WatchlistPanel({
  initialWatchlists,
  onChanged,
  onSelect,
  selectedStock,
  stocks,
}: {
  initialWatchlists: readonly Watchlist[];
  onChanged?: () => void | Promise<void>;
  onSelect: (stock: MarketStockView) => void;
  selectedStock?: MarketStockView;
  stocks: readonly MarketStockView[];
}) {
  const [watchlists, setWatchlists] = useState(initialWatchlists);
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const defaultWatchlist =
    watchlists.find(({ isDefault }) => isDefault) ?? watchlists[0];
  const country = watchlistCountry(selectedStock);
  const alreadyAdded = defaultWatchlist?.items.some(
    (item) =>
      item.symbol === selectedStock?.symbol && item.marketCountry === country,
  );

  function replaceWatchlist(updated: Watchlist) {
    setWatchlists((current) =>
      current
        .map((watchlist) => (watchlist.id === updated.id ? updated : watchlist))
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
        ),
    );
  }

  async function addSelected() {
    if (!defaultWatchlist || !selectedStock || !country || busyKey) return;
    setBusyKey("add");
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/v1/watchlists/${defaultWatchlist.id}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: selectedStock.symbol,
            marketCountry: country,
          }),
        },
      );
      if (response.status === 409) {
        setMessage("이미 관심종목에 추가되어 있습니다.");
        return;
      }
      if (!response.ok) throw new Error("WATCHLIST_ADD_FAILED");
      const body = (await response.json()) as {
        data?: { watchlist?: Watchlist };
      };
      if (!body.data?.watchlist) throw new Error("WATCHLIST_RESPONSE_INVALID");
      replaceWatchlist(body.data.watchlist);
      await onChanged?.();
      setMessage(`${selectedStock.symbol}을 관심종목에 추가했습니다.`);
    } catch {
      setError("관심종목을 추가하지 못했습니다. 기존 목록은 유지됩니다.");
    } finally {
      setBusyKey("");
    }
  }

  async function removeItem(
    watchlistId: string,
    item: Watchlist["items"][number],
  ) {
    if (busyKey) return;
    const key = `${item.marketCountry}:${item.symbol}`;
    setBusyKey(key);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/v1/watchlists/${watchlistId}/items/${item.marketCountry}/${encodeURIComponent(item.symbol)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("WATCHLIST_DELETE_FAILED");
      setWatchlists((current) =>
        current.map((watchlist) =>
          watchlist.id === watchlistId
            ? {
                ...watchlist,
                items: watchlist.items.filter(
                  (candidate) =>
                    candidate.symbol !== item.symbol ||
                    candidate.marketCountry !== item.marketCountry,
                ),
              }
            : watchlist,
        ),
      );
      await onChanged?.();
      setMessage(`${item.symbol}을 관심종목에서 제거했습니다.`);
    } catch {
      setError("관심종목을 제거하지 못했습니다. 기존 목록은 유지됩니다.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <section
      aria-labelledby="watchlist-title"
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="watchlist-title" className="text-lg font-semibold">
            관심종목
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            현재 로그인 사용자의 로컬 SQLite 목록입니다.
          </p>
        </div>
        <button
          type="button"
          disabled={
            !defaultWatchlist ||
            !selectedStock ||
            !country ||
            alreadyAdded ||
            Boolean(busyKey)
          }
          aria-pressed={alreadyAdded}
          onClick={addSelected}
          className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {alreadyAdded
            ? "추가됨"
            : busyKey === "add"
              ? "추가 중"
              : "선택 종목 추가"}
        </button>
      </div>

      {!defaultWatchlist || defaultWatchlist.items.length === 0 ? (
        <p role="status" className="mt-5 text-sm text-slate-600">
          저장된 관심종목이 없습니다. 시장 종목을 선택해 추가하세요.
        </p>
      ) : (
        <ul aria-label={defaultWatchlist.name} className="mt-5 grid gap-2">
          {defaultWatchlist.items.map((item) => {
            const stock = stocks.find(({ symbol }) => symbol === item.symbol);
            const key = `${item.marketCountry}:${item.symbol}`;
            return (
              <li
                key={key}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
              >
                <button
                  type="button"
                  disabled={!stock || Boolean(busyKey)}
                  onClick={() => stock && onSelect(stock)}
                  className="min-w-0 flex-1 text-left focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <span className="block font-semibold">{item.symbol}</span>
                  <span className="block text-xs text-slate-600">
                    {item.marketCountry} · 종목 선택
                  </span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyKey)}
                  aria-label={`${item.symbol} 관심종목 제거`}
                  onClick={() => removeItem(defaultWatchlist.id, item)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {busyKey === key ? "제거 중" : "제거"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {message ? (
        <p role="status" className="mt-4 text-sm text-blue-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <p className="mt-4 text-xs text-slate-500">
        로컬 사용자별 저장 · 시장 조회 데이터 · 비실시간
      </p>
    </section>
  );
}

function MarketHeader({
  liveReadEnabled,
}: Readonly<{ liveReadEnabled: boolean }>) {
  return (
    <header>
      <p className="text-sm font-semibold tracking-wide text-blue-700">
        {liveReadEnabled ? "MY WTS · LIVE READ-ONLY" : "MY WTS · LOCAL MOCK"}
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">시장 홈</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        {liveReadEnabled
          ? "Toss Open API의 참고용 조회 데이터입니다. 실시간 체결을 보장하지 않으며 실제 매수·매도·정정·취소 기능은 제공하지 않습니다."
          : "종목 코드, 종목명 또는 시장을 검색해 고정 mock 현재가를 확인할 수 있습니다."}
      </p>
    </header>
  );
}

function InlineError({ error }: { error: MarketScreenErrorView }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950"
    >
      <div className="flex gap-3">
        <span aria-hidden="true" className="text-lg">
          !
        </span>
        <div>
          <h3 className="font-semibold">{error.title}</h3>
          <p className="mt-1 text-sm leading-6">{error.description}</p>
          {error.retryable ? (
            <button
              className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-red-600"
              onClick={() => window.location.reload()}
              type="button"
            >
              다시 시도
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function WarningBanner({
  stock,
  warnings,
}: {
  stock: MarketStockView;
  warnings: readonly MarketWarningView[];
}) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <section
      aria-label={`${stock.displayName} 종목 유의사항`}
      role="alert"
      className="rounded-3xl border border-amber-300 bg-amber-50 p-6 text-amber-950 shadow-sm"
    >
      <div className="flex gap-3">
        <span aria-hidden="true" className="text-2xl">
          ⚠
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">종목 유의사항</h2>
          <p className="mt-1 text-sm leading-6">
            아래 정보는 투자 추천이나 거래 안전 보증이 아닙니다.
          </p>
          <ul className="mt-4 grid gap-3">
            {warnings.map((warning) => (
              <li
                key={warning.key}
                className="rounded-xl border border-amber-200 bg-white/70 p-4"
              >
                <h3 className="font-semibold">{warning.title}</h3>
                <p className="mt-1 text-sm leading-6">{warning.description}</p>
                {warning.exchange || warning.startDate || warning.endDate ? (
                  <p className="mt-2 text-xs text-amber-900">
                    {[
                      warning.exchange
                        ? `거래소 ${warning.exchange}`
                        : undefined,
                      warning.startDate
                        ? `시작 ${warning.startDate}`
                        : undefined,
                      warning.endDate ? `종료 ${warning.endDate}` : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function PriceCard({
  error,
  liveReadEnabled,
  price,
  stock,
}: {
  error?: MarketScreenErrorView;
  liveReadEnabled: boolean;
  price?: MarketPriceView;
  stock?: MarketStockView;
}) {
  if (error) {
    return (
      <section
        aria-labelledby="current-price-title"
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 id="current-price-title" className="mb-4 text-lg font-semibold">
          선택 종목 현재가
        </h2>
        <InlineError error={error} />
      </section>
    );
  }

  if (!stock || !price) {
    return (
      <section
        aria-labelledby="current-price-title"
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 id="current-price-title" className="text-lg font-semibold">
          선택 종목 현재가
        </h2>
        <div role="status" className="mt-4">
          <h3 className="font-medium">현재가가 없습니다.</h3>
          <p className="mt-1 text-sm text-slate-600">
            선택한 종목의 현재가가 제공되지 않습니다. 다른 종목을 선택해 주세요.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="current-price-title"
      aria-live="polite"
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-700">
            {liveReadEnabled ? "Toss Open API 조회 데이터" : "MOCK DATA"}
          </p>
          <h2 id="current-price-title" className="mt-1 text-2xl font-semibold">
            {stock.displayName}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {stock.symbol} · {stock.market}
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
          실시간 시세 아님
        </span>
      </div>

      <dl className="mt-8 grid gap-5 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-slate-500">현재가</dt>
          <dd
            data-testid="last-price"
            className="mt-1 font-mono text-3xl font-semibold tracking-tight"
          >
            {formatDecimalString(price.lastPrice)} {price.currency}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">시장</dt>
          <dd className="mt-1 text-lg font-medium">{stock.market}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">통화</dt>
          <dd className="mt-1 text-lg font-medium">{stock.currency}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">상장 상태</dt>
          <dd className="mt-1 text-lg font-medium">{stock.status}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm text-slate-500">데이터 시각</dt>
          <dd className="mt-1 text-sm font-medium">
            {price.observedAt ?? "제공되지 않음"}
          </dd>
        </div>
      </dl>

      <p className="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-600">
        개발용 고정 데이터이며 실제 투자 판단에 사용할 수 없습니다.
      </p>
    </section>
  );
}

function OrderbookWidget({
  error,
  orderbook,
  stock,
}: {
  error?: MarketScreenErrorView;
  orderbook?: MarketOrderbookView;
  stock?: MarketStockView;
}) {
  return (
    <section
      aria-labelledby="orderbook-title"
      className="min-w-0 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="orderbook-title" className="text-lg font-semibold">
            호가
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {stock
              ? `${stock.symbol} · ${stock.displayName}`
              : "선택 종목 없음"}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          조회 · 비실시간
        </span>
      </div>

      {error ? (
        <div className="mt-5">
          <InlineError error={error} />
        </div>
      ) : !stock || !orderbook ? (
        <div role="status" className="mt-5">
          <h3 className="font-medium">호가가 없습니다.</h3>
          <p className="mt-1 text-sm text-slate-600">
            선택한 종목의 호가 데이터가 제공되지 않습니다.
          </p>
        </div>
      ) : orderbook.asks.length === 0 && orderbook.bids.length === 0 ? (
        <div role="status" className="mt-5">
          <h3 className="font-medium">호가가 비어 있습니다.</h3>
          <p className="mt-1 text-sm text-slate-600">
            현재 표시할 매도·매수 호가가 없습니다.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              <caption className="sr-only">
                {stock.displayName} 매도 및 매수 호가
              </caption>
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th scope="col" className="px-3 py-2 font-medium">
                    구분
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    가격
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    잔량
                  </th>
                </tr>
              </thead>
              <tbody>
                {orderbook.asks.map((level) => (
                  <tr
                    key={`ask-${level.price}`}
                    className="border-b border-slate-100 bg-red-50/50"
                  >
                    <th
                      scope="row"
                      className="px-3 py-2 text-left font-medium text-red-800"
                    >
                      매도 호가
                    </th>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatDecimalString(level.price)} {orderbook.currency}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatDecimalString(level.volume)}
                    </td>
                  </tr>
                ))}
                {orderbook.bids.map((level) => (
                  <tr
                    key={`bid-${level.price}`}
                    className="border-b border-slate-100 bg-blue-50/50"
                  >
                    <th
                      scope="row"
                      className="px-3 py-2 text-left font-medium text-blue-800"
                    >
                      매수 호가
                    </th>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatDecimalString(level.price)} {orderbook.currency}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatDecimalString(level.volume)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            데이터 시각: {orderbook.observedAt ?? "제공되지 않음"}
          </p>
        </>
      )}
    </section>
  );
}

function TradesWidget({
  error,
  stock,
  trades,
}: {
  error?: MarketScreenErrorView;
  stock?: MarketStockView;
  trades: readonly MarketTradeView[];
}) {
  return (
    <section
      aria-labelledby="trades-title"
      className="min-w-0 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="trades-title" className="text-lg font-semibold">
            최근 체결
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {stock
              ? `${stock.symbol} · ${stock.displayName}`
              : "선택 종목 없음"}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          조회 · 비실시간
        </span>
      </div>

      {error ? (
        <div className="mt-5">
          <InlineError error={error} />
        </div>
      ) : !stock || trades.length === 0 ? (
        <div role="status" className="mt-5">
          <h3 className="font-medium">체결 내역이 없습니다.</h3>
          <p className="mt-1 text-sm text-slate-600">
            선택한 종목의 당일 체결 데이터가 제공되지 않습니다.
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-sm">
            <caption className="sr-only">
              {stock.displayName} 최근 체결 내역
            </caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th scope="col" className="px-3 py-2 font-medium">
                  체결 시각
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  체결가
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  체결 수량
                </th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <tr key={trade.key} className="border-b border-slate-100">
                  <td className="px-3 py-2">
                    <time dateTime={trade.observedAt}>{trade.observedAt}</time>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatDecimalString(trade.price)} {trade.currency}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatDecimalString(trade.volume)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            체결 내역은 가격 방향이나 주문 신호를 의미하지 않습니다.
          </p>
        </div>
      )}
    </section>
  );
}

function CandleWidget({
  error,
  interval,
  onIntervalChange,
  onNextPage,
  pages,
  stock,
  visiblePageCount,
  hasNextPageOverride,
  loadingNextPage = false,
}: {
  error?: MarketScreenErrorView;
  interval: CandleInterval;
  onIntervalChange: (interval: CandleInterval) => void;
  onNextPage: () => void;
  pages: readonly MarketCandlePageView[];
  stock?: MarketStockView;
  visiblePageCount: number;
  hasNextPageOverride?: boolean;
  loadingNextPage?: boolean;
}) {
  const candles = useMemo(() => {
    const byTimestamp = new Map<string, MarketCandleView>();
    for (const page of pages.slice(0, visiblePageCount)) {
      for (const candle of page.candles) {
        if (!byTimestamp.has(candle.timestamp)) {
          byTimestamp.set(candle.timestamp, candle);
        }
      }
    }
    return [...byTimestamp.values()].sort(
      (left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp),
    );
  }, [pages, visiblePageCount]);
  const chartView = useMemo(() => buildCandleChartView(candles), [candles]);
  const directionByTimestamp = new Map(
    chartView.points.map(({ direction, timestamp }) => [timestamp, direction]),
  );
  const hasNextPage = hasNextPageOverride ?? visiblePageCount < pages.length;

  return (
    <section
      aria-labelledby="candle-title"
      className="min-w-0 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="candle-title" className="text-lg font-semibold">
            캔들 차트
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {stock
              ? `${stock.symbol} · ${stock.displayName}`
              : "선택 종목 없음"}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          조회 · 비실시간
        </span>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-slate-700">
          캔들 주기
        </legend>
        <div className="mt-2 flex gap-2">
          {(["1d", "1m"] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={interval === candidate}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                interval === candidate
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-slate-300 bg-white text-slate-800"
              }`}
              onClick={() => onIntervalChange(candidate)}
            >
              {candidate === "1d" ? "일봉" : "1분봉"}
            </button>
          ))}
        </div>
      </fieldset>

      {error ? (
        <div className="mt-5">
          <InlineError error={error} />
        </div>
      ) : !stock || candles.length === 0 ? (
        <div role="status" className="mt-5">
          <h3 className="font-medium">캔들 데이터가 없습니다.</h3>
          <p className="mt-1 text-sm text-slate-600">
            선택한 종목과 주기의 캔들 데이터가 제공되지 않습니다.
          </p>
        </div>
      ) : (
        <>
          <div
            aria-label="캔들 방향 범례"
            className="mt-5 flex flex-wrap gap-4 text-sm"
          >
            <span>
              <span aria-hidden="true" className="text-emerald-700">
                ■
              </span>{" "}
              상승: 종가가 시가보다 높음
            </span>
            <span>
              <span aria-hidden="true" className="text-red-700">
                ■
              </span>{" "}
              하락: 종가가 시가보다 낮음
            </span>
            <span>
              <span aria-hidden="true" className="text-slate-500">
                ■
              </span>{" "}
              보합: 종가와 시가가 같음
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <CandleChart candles={candles} />
          </div>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">표시 캔들</dt>
              <dd data-testid="candle-count" className="font-semibold">
                {candles.length}개
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">최저가</dt>
              <dd className="font-mono font-semibold">
                {chartView.minimumPrice} {candles[0]?.currency}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">최고가</dt>
              <dd className="font-mono font-semibold">
                {chartView.maximumPrice} {candles[0]?.currency}
              </dd>
            </div>
          </dl>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[68rem] border-collapse text-sm">
              <caption className="sr-only">
                {stock.displayName} {interval} 캔들 원본 데이터
              </caption>
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  {[
                    "시각",
                    "방향",
                    "시가",
                    "고가",
                    "저가",
                    "종가",
                    "거래량",
                  ].map((heading) => (
                    <th key={heading} scope="col" className="px-3 py-2">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candles.map((candle) => {
                  const direction = directionByTimestamp.get(candle.timestamp);
                  return (
                    <tr
                      key={candle.timestamp}
                      className="border-b border-slate-100"
                    >
                      <th scope="row" className="px-3 py-2 font-medium">
                        <time dateTime={candle.timestamp}>
                          {candle.timestamp}
                        </time>
                      </th>
                      <td className="px-3 py-2">
                        {direction === "rising"
                          ? "상승"
                          : direction === "falling"
                            ? "하락"
                            : "보합"}
                      </td>
                      {[
                        candle.openPrice,
                        candle.highPrice,
                        candle.lowPrice,
                        candle.closePrice,
                      ].map((value, index) => (
                        <td
                          key={`${candle.timestamp}-price-${index}`}
                          className="px-3 py-2 font-mono"
                        >
                          {formatDecimalString(value)} {candle.currency}
                        </td>
                      ))}
                      <td className="px-3 py-2 font-mono">
                        {formatDecimalString(candle.volume)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {hasNextPage ? (
              <button
                type="button"
                disabled={loadingNextPage}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600"
                onClick={onNextPage}
              >
                {loadingNextPage ? "이전 캔들 로딩 중" : "이전 캔들 더 보기"}
              </button>
            ) : (
              <p role="status" className="text-sm text-slate-600">
                마지막 페이지입니다.
              </p>
            )}
            <p className="text-xs text-slate-500">
              Cursor는 BFF가 제공한 값을 그대로 사용합니다.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

export type MarketScreenProps = MarketScreenData &
  Readonly<{
    controlledSymbol?: string;
    controlledCandleInterval?: CandleInterval;
    hasNextCandlePage?: boolean;
    isFetchingNextCandlePage?: boolean;
    onCandleIntervalChange?: (interval: CandleInterval) => void;
    onNextCandlePage?: () => void;
    onSymbolChange?: (symbol: string) => void;
    onWatchlistsChanged?: () => void | Promise<void>;
    liveReadEnabled?: boolean;
    networkStatus?: "fetching" | "stale";
  }>;

export function MarketScreen({
  calendarErrors = [],
  calendars = [],
  candleErrors,
  candleSeries,
  exchangeRateErrors = [],
  exchangeRates = [],
  initialSymbol,
  orderbookErrors,
  orderbooks,
  priceErrors,
  prices,
  screenError,
  stocks,
  tradeErrors,
  trades,
  warningErrors,
  warnings,
  watchlists = [],
  controlledSymbol,
  controlledCandleInterval,
  hasNextCandlePage,
  isFetchingNextCandlePage = false,
  onCandleIntervalChange,
  onNextCandlePage,
  onSymbolChange,
  onWatchlistsChanged,
  liveReadEnabled = false,
  networkStatus,
}: MarketScreenProps) {
  const inputId = useId();
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [internalSelectedSymbol, setInternalSelectedSymbol] =
    useState(initialSymbol);
  const [internalCandleInterval, setInternalCandleInterval] =
    useState<CandleInterval>("1d");
  const selectedSymbol = controlledSymbol ?? internalSelectedSymbol;
  const candleInterval = controlledCandleInterval ?? internalCandleInterval;
  const [visibleCandlePages, setVisibleCandlePages] = useState(1);
  const [activeIndex, setActiveIndex] = useState(-1);
  const results = useMemo(
    () => searchMarketStocks(stocks, query),
    [query, stocks],
  );
  const trimmedQuery = query.trim();
  const belowMinimum = trimmedQuery.length > 0 && trimmedQuery.length < 2;
  const noResults = trimmedQuery.length >= 2 && results.length === 0;
  const hideSelectedData = belowMinimum || noResults;
  const selectedStock = stocks.find(({ symbol }) => symbol === selectedSymbol);
  const selectedPrice = prices.find(({ symbol }) => symbol === selectedSymbol);
  const selectedWarnings =
    warnings.find(({ symbol }) => symbol === selectedSymbol)?.warnings ?? [];
  const selectedPriceError = priceErrors.find(
    ({ symbol }) => symbol === selectedSymbol,
  )?.error;
  const selectedWarningError = warningErrors.find(
    ({ symbol }) => symbol === selectedSymbol,
  )?.error;
  const selectedOrderbook = orderbooks.find(
    ({ symbol }) => symbol === selectedSymbol,
  );
  const selectedTrades =
    trades.find(({ symbol }) => symbol === selectedSymbol)?.trades ?? [];
  const selectedOrderbookError = orderbookErrors.find(
    ({ symbol }) => symbol === selectedSymbol,
  )?.error;
  const selectedTradeError = tradeErrors.find(
    ({ symbol }) => symbol === selectedSymbol,
  )?.error;
  const selectedCandleSeries = candleSeries.find(
    ({ interval, symbol }) =>
      symbol === selectedSymbol && interval === candleInterval,
  );
  const selectedCandleError = candleErrors.find(
    ({ interval, symbol }) =>
      symbol === selectedSymbol && interval === candleInterval,
  )?.error;
  const selectedCalendar = calendars.find(
    ({ symbol }) => symbol === selectedSymbol,
  );
  const selectedCalendarError = calendarErrors.find(
    ({ symbol }) => symbol === selectedSymbol,
  )?.error;
  const selectedExchangeRate = exchangeRates.find(
    ({ symbol }) => symbol === selectedSymbol,
  );
  const selectedExchangeRateError = exchangeRateErrors.find(
    ({ symbol }) => symbol === selectedSymbol,
  )?.error;
  const listboxOpen = results.length > 0;

  function selectStock(stock: MarketStockView) {
    if (!stocks.some(({ symbol }) => symbol === stock.symbol)) {
      return;
    }
    setInternalSelectedSymbol(stock.symbol);
    onSymbolChange?.(stock.symbol);
    setInternalCandleInterval("1d");
    onCandleIntervalChange?.("1d");
    setVisibleCandlePages(1);
    setQuery("");
    setActiveIndex(-1);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
      return;
    }
    if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setActiveIndex((current) =>
        current <= 0 ? results.length - 1 : current - 1,
      );
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const result = results[activeIndex];
      if (result) {
        selectStock(result);
      }
      return;
    }
    if (event.key === "Escape") {
      setQuery("");
      setActiveIndex(-1);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950 sm:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-8">
        <MarketHeader liveReadEnabled={liveReadEnabled} />
        {networkStatus ? (
          <p role="status" className="text-sm text-slate-600">
            {networkStatus === "fetching"
              ? "로컬 BFF에서 시장 위젯을 불러오는 중입니다."
              : "캐시된 시장 데이터를 표시하며 갱신 중입니다."}
          </p>
        ) : null}

        {screenError ? (
          <section aria-label="시장 데이터 오류">
            <InlineError error={screenError} />
          </section>
        ) : stocks.length === 0 ? (
          <section
            role="status"
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2 className="text-lg font-semibold">표시할 종목이 없습니다.</h2>
            <p className="mt-2 text-sm text-slate-600">
              종목 데이터가 준비되면 다시 확인해 주세요.
            </p>
          </section>
        ) : (
          <>
            <section
              aria-labelledby="stock-search-title"
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 id="stock-search-title" className="text-lg font-semibold">
                종목 검색
              </h2>
              <div className="relative mt-4">
                <label
                  htmlFor={inputId}
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  종목 코드, 종목명 또는 시장
                </label>
                <input
                  id={inputId}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-controls={listboxId}
                  aria-expanded={listboxOpen}
                  aria-activedescendant={
                    activeIndex >= 0
                      ? `${listboxId}-option-${activeIndex}`
                      : undefined
                  }
                  autoComplete="off"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(-1);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="2자 이상 입력하세요"
                  type="search"
                  value={query}
                />

                {listboxOpen ? (
                  <ul
                    id={listboxId}
                    role="listbox"
                    aria-label="종목 검색 결과"
                    className="absolute z-10 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
                  >
                    {results.map((stock, index) => (
                      <li
                        id={`${listboxId}-option-${index}`}
                        key={stock.symbol}
                        role="option"
                        aria-selected={stock.symbol === selectedSymbol}
                        className={`cursor-pointer rounded-lg px-3 py-3 ${
                          index === activeIndex
                            ? "bg-blue-50 outline outline-2 outline-blue-600"
                            : "hover:bg-slate-50"
                        }`}
                        onClick={() => selectStock(stock)}
                        onMouseDown={(event) => event.preventDefault()}
                      >
                        <span className="block font-semibold">
                          {stock.symbol} · {stock.displayName}
                        </span>
                        <span className="mt-1 block text-sm text-slate-600">
                          {stock.englishName} · {stock.market}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : belowMinimum ? (
                  <p role="status" className="mt-3 text-sm text-slate-600">
                    검색하려면 2자 이상 입력해 주세요.
                  </p>
                ) : noResults ? (
                  <p role="status" className="mt-3 text-sm text-slate-600">
                    일치하는 종목이 없습니다. 다른 검색어를 입력해 주세요.
                  </p>
                ) : null}
              </div>
            </section>

            {!hideSelectedData ? (
              <>
                <WatchlistPanel
                  initialWatchlists={watchlists}
                  onChanged={onWatchlistsChanged}
                  onSelect={selectStock}
                  selectedStock={selectedStock}
                  stocks={stocks}
                />
                {selectedStock && !selectedWarningError ? (
                  <WarningBanner
                    stock={selectedStock}
                    warnings={selectedWarnings}
                  />
                ) : null}
                {selectedWarningError ? (
                  <section aria-label="종목 유의사항 오류">
                    <InlineError error={selectedWarningError} />
                  </section>
                ) : null}
                <PriceCard
                  error={selectedPriceError}
                  liveReadEnabled={liveReadEnabled}
                  stock={selectedStock}
                  price={selectedPrice}
                />
                <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                  <CalendarWidget
                    calendar={selectedCalendar}
                    error={selectedCalendarError}
                    stock={selectedStock}
                  />
                  <ExchangeRateWidget
                    error={selectedExchangeRateError}
                    rate={selectedExchangeRate}
                    stock={selectedStock}
                  />
                </div>
                <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                  <OrderbookWidget
                    error={selectedOrderbookError}
                    orderbook={selectedOrderbook}
                    stock={selectedStock}
                  />
                  <TradesWidget
                    error={selectedTradeError}
                    stock={selectedStock}
                    trades={selectedTrades}
                  />
                </div>
                <CandleWidget
                  error={selectedCandleError}
                  interval={candleInterval}
                  onIntervalChange={(interval) => {
                    setInternalCandleInterval(interval);
                    onCandleIntervalChange?.(interval);
                    setVisibleCandlePages(1);
                  }}
                  onNextPage={() => {
                    if (onNextCandlePage) {
                      onNextCandlePage();
                      return;
                    }
                    setVisibleCandlePages((current) =>
                      Math.min(
                        current + 1,
                        selectedCandleSeries?.pages.length ?? 1,
                      ),
                    );
                  }}
                  pages={selectedCandleSeries?.pages ?? []}
                  stock={selectedStock}
                  visiblePageCount={
                    onNextCandlePage
                      ? (selectedCandleSeries?.pages.length ?? 1)
                      : visibleCandlePages
                  }
                  hasNextPageOverride={hasNextCandlePage}
                  loadingNextPage={isFetchingNextCandlePage}
                />
              </>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
