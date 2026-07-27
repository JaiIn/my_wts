"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";

import type {
  MarketPriceView,
  MarketScreenData,
  MarketScreenErrorView,
  MarketStockView,
  MarketWarningView,
} from "../../application/market/market-screen";
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

function MarketHeader() {
  return (
    <header>
      <p className="text-sm font-semibold tracking-wide text-blue-700">
        MY WTS · LOCAL MOCK
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">시장 홈</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        종목 코드, 종목명 또는 시장을 검색해 고정 mock 현재가를 확인할 수
        있습니다.
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
  price,
  stock,
}: {
  error?: MarketScreenErrorView;
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
          <p className="text-sm font-medium text-blue-700">MOCK DATA</p>
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

export function MarketScreen({
  initialSymbol,
  priceErrors,
  prices,
  screenError,
  stocks,
  warningErrors,
  warnings,
}: MarketScreenData) {
  const inputId = useId();
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol);
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
  const listboxOpen = results.length > 0;

  function selectStock(stock: MarketStockView) {
    if (!stocks.some(({ symbol }) => symbol === stock.symbol)) {
      return;
    }
    setSelectedSymbol(stock.symbol);
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
        <MarketHeader />

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
              mock 종목 데이터가 준비되면 다시 확인해 주세요.
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
                  stock={selectedStock}
                  price={selectedPrice}
                />
              </>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
