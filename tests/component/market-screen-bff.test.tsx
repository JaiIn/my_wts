// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarketQueryProvider } from "../../src/ui/market/market-query-provider";
import { MarketScreenBff } from "../../src/ui/market/market-screen-bff";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function response(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(
      status < 400
        ? { data, meta: { requestId: "req-component" } }
        : {
            error: {
              requestId: "req-component",
              code: "UPSTREAM_UNAVAILABLE",
              retryable: true,
              details: {},
            },
          },
    ),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}

function installBffFetch() {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const fetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      calls.push({ path, init });
      const url = new URL(path, "http://127.0.0.1:3000");
      const symbol =
        url.searchParams.get("symbols") ??
        url.searchParams.get("symbol") ??
        url.pathname.split("/").at(-2);
      if (url.pathname === "/api/v1/market/stocks") {
        return response([
          {
            symbol: "005930",
            name: "테스트 코리아",
            englishName: "TEST KOREA",
            market: "KOSPI",
            status: "ACTIVE",
            currency: "KRW",
          },
          {
            symbol: "AAPL",
            name: "테스트 애플",
            englishName: "TEST US",
            market: "NASDAQ",
            status: "ACTIVE",
            currency: "USD",
          },
        ]);
      }
      if (url.pathname === "/api/v1/market/prices") {
        return response([
          {
            symbol,
            timestamp: "2025-03-10T23:00:00+09:00",
            lastPrice: symbol === "AAPL" ? "185.70" : "72000",
            currency: symbol === "AAPL" ? "USD" : "KRW",
          },
        ]);
      }
      if (url.pathname.endsWith("/warnings")) return response([]);
      if (url.pathname.endsWith("/orderbook")) {
        return response({
          timestamp: null,
          currency: symbol === "AAPL" ? "USD" : "KRW",
          asks: [
            { price: symbol === "AAPL" ? "185.80" : "72100", volume: "10" },
          ],
          bids: [
            { price: symbol === "AAPL" ? "185.60" : "71900", volume: "20" },
          ],
        });
      }
      if (url.pathname.endsWith("/trades")) {
        return response([
          {
            price: symbol === "AAPL" ? "185.70" : "72000",
            volume: "3",
            timestamp: "2025-03-10T22:59:00+09:00",
            currency: symbol === "AAPL" ? "USD" : "KRW",
          },
        ]);
      }
      if (url.pathname.endsWith("/candles")) {
        const currency = symbol === "AAPL" ? "USD" : "KRW";
        return response({
          candles: [
            {
              timestamp: "2025-03-10T22:59:00+09:00",
              openPrice: "100",
              highPrice: "110",
              lowPrice: "90",
              closePrice: "105",
              volume: "9007199254740993",
              currency,
            },
          ],
          nextBefore: null,
        });
      }
      if (url.pathname.includes("/calendars/")) {
        const country = url.pathname.endsWith("/US") ? "US" : "KR";
        const session = {
          startTime:
            country === "US"
              ? "2025-03-10T22:30:00+09:00"
              : "2025-03-10T09:00:00+09:00",
          endTime:
            country === "US"
              ? "2025-03-11T05:00:00+09:00"
              : "2025-03-10T15:30:00+09:00",
        };
        const day =
          country === "US"
            ? { date: "2025-03-10", regularMarket: session }
            : { date: "2025-03-10", integrated: { regularMarket: session } };
        return response({
          today: day,
          previousBusinessDay: { ...day, date: "2025-03-07" },
          nextBusinessDay: { ...day, date: "2025-03-11" },
        });
      }
      if (url.pathname.endsWith("/exchange-rate")) {
        return response({
          baseCurrency: "USD",
          quoteCurrency: "KRW",
          rate: "1375.123456789012345678",
          midRate: "1375.123456789012345678",
          basisPoint: "0",
          rateChangeType: "EQUAL",
          validFrom: "2025-03-10T00:00:00+09:00",
          validUntil: "2025-03-11T00:00:00+09:00",
        });
      }
      if (url.pathname === "/api/v1/watchlists") {
        return response({ watchlists: [] });
      }
      return response({}, 503);
    },
  );
  vi.stubGlobal("fetch", fetch);
  return calls;
}

describe("market screen BFF boundary", () => {
  it("renders mock widgets through same-origin BFFs and changes every query key", async () => {
    const calls = installBffFetch();
    render(
      <MarketQueryProvider>
        <MarketScreenBff />
      </MarketQueryProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("last-price").textContent).toBe("72,000 KRW"),
    );
    const search = screen.getByRole("combobox");
    fireEvent.change(search, { target: { value: "aapl" } });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByTestId("last-price").textContent).toBe("185.70 USD"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("exchange-rate").textContent).toContain(
        "1,375.123456789012345678 KRW",
      ),
    );

    expect(calls.some(({ path }) => path.includes("symbol=AAPL"))).toBe(true);
    expect(calls.some(({ path }) => path.includes("/calendars/US"))).toBe(true);
    expect(calls.some(({ path }) => path.includes("/exchange-rate"))).toBe(
      true,
    );
    expect(calls.every(({ path }) => path.startsWith("/api/v1/"))).toBe(true);
    expect(JSON.stringify(calls)).not.toMatch(
      /authorization|bearer|openapi\.tossinvest\.com|accountSeq|accountNo/i,
    );
    expect(screen.queryByRole("button", { name: /매수|매도|주문/ })).toBeNull();
  });
});
