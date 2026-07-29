import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getMarketCalendar,
  getMarketCandles,
  getMarketExchangeRate,
  getMarketOrderbook,
  getMarketPrices,
  getMarketStocks,
  getMarketTrades,
  getMarketWarnings,
  MarketBffError,
} from "../../src/ui/market/market-bff-client";
import {
  candleStaleTime,
  MARKET_QUERY_TTL,
  marketQueryKeys,
  shouldRetryMarketQuery,
} from "../../src/ui/market/market-query";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("typed market BFF browser transport", () => {
  it("uses only typed same-origin GET endpoints and canonical query keys", async () => {
    const fetch = vi.fn<
      (input: string | URL | Request, init?: RequestInit) => Promise<Response>
    >(async () => jsonResponse({ data: [] }));
    vi.stubGlobal("fetch", fetch);

    await getMarketStocks(["aapl", "005930"]);
    await getMarketPrices(["aapl"]);
    await getMarketWarnings("aapl");
    await getMarketOrderbook("aapl");
    await getMarketTrades("aapl");
    await getMarketCandles({
      symbol: "aapl",
      interval: "1d",
      before: "2025-01-01T00:00:00.000Z",
    });
    await getMarketCalendar("US", "2025-03-10");
    await getMarketExchangeRate("USD", "KRW");

    const paths = fetch.mock.calls.map(([path]) => String(path));
    expect(paths).toEqual([
      "/api/v1/market/stocks?symbols=005930%2CAAPL",
      "/api/v1/market/prices?symbols=AAPL",
      "/api/v1/market/stocks/AAPL/warnings",
      "/api/v1/market/orderbook?symbol=AAPL",
      "/api/v1/market/trades?symbol=AAPL&count=20",
      "/api/v1/market/candles?symbol=AAPL&interval=1d&count=100&before=2025-01-01T00%3A00%3A00.000Z&adjusted=true",
      "/api/v1/market/calendars/US?date=2025-03-10",
      "/api/v1/market/exchange-rate?baseCurrency=USD&quoteCurrency=KRW",
    ]);
    for (const [, init] of fetch.mock.calls) {
      expect(init).toMatchObject({
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      expect(JSON.stringify(init)).not.toMatch(
        /authorization|bearer|accountSeq|accountNo|openapi\.tossinvest\.com/i,
      );
    }
    expect(marketQueryKeys.candles("aapl", "1d")).toEqual([
      "market",
      "candles",
      "AAPL",
      "1d",
    ]);
  });

  it("passes AbortSignal and the opaque cursor without rewriting", async () => {
    const fetch = vi.fn<
      (input: string | URL | Request, init?: RequestInit) => Promise<Response>
    >(async () =>
      jsonResponse({
        data: { candles: [], nextBefore: "opaque-value" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    await getMarketCandles(
      {
        symbol: "005930",
        interval: "1m",
        before: "2025-01-01T00:00:00+09:00",
      },
      controller.signal,
    );
    expect(fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    expect(fetch.mock.calls[0]?.[0]).toContain(
      `before=${encodeURIComponent("2025-01-01T00:00:00+09:00")}`,
    );
  });

  it("rejects malformed JSON/envelopes and exposes only safe BFF error fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("<raw-upstream>", {
            status: 502,
            headers: { "Content-Type": "text/plain" },
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ unexpected: true }))
        .mockResolvedValueOnce(
          jsonResponse(
            {
              error: {
                code: "UPSTREAM_RATE_LIMITED",
                requestId: "req-safe",
                retryable: true,
                message: "safe",
              },
            },
            429,
            { "Retry-After": "7" },
          ),
        ),
    );

    await expect(getMarketPrices(["AAPL"])).rejects.toMatchObject({
      code: "INVALID_BFF_RESPONSE",
    });
    await expect(getMarketPrices(["AAPL"])).rejects.toMatchObject({
      code: "INVALID_BFF_RESPONSE",
    });
    const error = await getMarketPrices(["AAPL"]).catch((value) => value);
    expect(error).toMatchObject({
      code: "UPSTREAM_RATE_LIMITED",
      status: 429,
      requestId: "req-safe",
      retryAfterSeconds: 7,
    });
    expect(JSON.stringify(error)).not.toContain("raw-upstream");
  });

  it("uses frozen TTLs and bounded retry policy", () => {
    expect(MARKET_QUERY_TTL).toMatchObject({
      price: 1_000,
      orderbook: 1_000,
      trades: 1_000,
      candle1m: 10_000,
      candle1d: 300_000,
      stock: 21_600_000,
      calendar: 21_600_000,
      warnings: 300_000,
      exchangeRate: 60_000,
    });
    expect(candleStaleTime("1m")).toBe(10_000);
    expect(candleStaleTime("1d")).toBe(300_000);
    for (const status of [400, 401, 403, 404, 429]) {
      expect(
        shouldRetryMarketQuery(0, new MarketBffError("SAFE", status, true)),
      ).toBe(false);
    }
    expect(
      shouldRetryMarketQuery(
        0,
        new MarketBffError("UPSTREAM_UNAVAILABLE", 503, true),
      ),
    ).toBe(true);
    expect(
      shouldRetryMarketQuery(
        1,
        new MarketBffError("UPSTREAM_UNAVAILABLE", 503, true),
      ),
    ).toBe(false);
  });
});
