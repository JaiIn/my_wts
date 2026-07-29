import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { SessionAuthenticationError } from "../../src/application/auth/session-service";
import type { MarketReferenceProvider } from "../../src/application/market/market-reference-provider";
import { createMarketReferenceBffHandler } from "../../src/application/market/market-reference-route";
import { MarketDataNotFoundError } from "../../src/application/market/market-service";
import { createMockMarketReferenceProvider } from "../../src/application/market/market-reference-provider";
import { createMockMarketService } from "../../src/infrastructure/market/mock-market-service";
import { TossHttpClientError } from "../../src/infrastructure/toss/readonly-http-client";

const REQUEST_ID = "00000000-0000-4000-8000-000000000306";
const NOW = new Date("2026-07-28T12:00:00.000Z");
const SESSION_VALUE = ["fixture", "session", "0306"].join("-");

type Operation = "getCalendar" | "getCandles" | "getExchangeRate";

function request(path: string, authenticated = true) {
  return new NextRequest(`http://127.0.0.1:3000${path}`, {
    headers: {
      Host: "127.0.0.1:3000",
      ...(authenticated ? { Cookie: `my_wts_session=${SESSION_VALUE}` } : {}),
    },
  });
}

function handler(
  operation: Operation,
  provider: MarketReferenceProvider = createMockMarketReferenceProvider(
    createMockMarketService(),
  ),
) {
  return createMarketReferenceBffHandler(operation, {
    provider: () => ({ implementation: provider, name: "mock" }),
    authenticator: {
      authenticate(token) {
        if (token !== SESSION_VALUE) {
          throw new SessionAuthenticationError("AUTH_REQUIRED");
        }
        return {
          id: "usr_fixture",
          username: "fixture.user",
          displayName: "Fixture",
        };
      },
    },
    createRequestId: () => REQUEST_ID,
    now: () => NOW,
  });
}

describe("candles, calendars, and exchange-rate BFF contract", () => {
  it.each([
    [
      "getCandles",
      "/api/v1/market/candles?symbol=005930&interval=1d&count=2",
      undefined,
    ],
    ["getCalendar", "/api/v1/market/calendars/KR?date=2025-03-10", "KR"],
    [
      "getExchangeRate",
      "/api/v1/market/exchange-rate?baseCurrency=USD&quoteCurrency=KRW",
      undefined,
    ],
  ] as const)(
    "returns the frozen %s success envelope",
    async (operation, path, country) => {
      const response = await handler(operation)(request(path), country);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(
        /^application\/json/,
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
      expect(body.meta).toEqual({
        requestId: REQUEST_ID,
        fetchedAt: NOW.toISOString(),
        stale: false,
      });
      expect(JSON.stringify(body)).not.toMatch(
        /password|sessionToken|authorization|clientSecret|tokenHash|sqlite|stack|accountSeq|accountNo/i,
      );
    },
  );

  it("preserves candle decimals, cursor, direction, and official response fields", async () => {
    const candleResponse = await handler("getCandles")(
      request(
        "/api/v1/market/candles?symbol=FWD1&interval=1d&count=1&adjusted=false",
      ),
    );
    const exchangeResponse = await handler("getExchangeRate")(
      request(
        "/api/v1/market/exchange-rate?baseCurrency=USD&quoteCurrency=KRW",
      ),
    );
    const candles = (await candleResponse.json()).data;
    const exchange = (await exchangeResponse.json()).data;

    expect(candles.candles[0].closePrice).toBe("9007199254740993.123456785");
    expect(candles.nextBefore).toBeDefined();
    expect(Object.keys(candles.candles[0]).sort()).toEqual(
      [
        "timestamp",
        "openPrice",
        "highPrice",
        "lowPrice",
        "closePrice",
        "volume",
        "currency",
      ].sort(),
    );
    expect(exchange.baseCurrency).toBe("USD");
    expect(exchange.quoteCurrency).toBe("KRW");
    expect(typeof exchange.rate).toBe("string");
  });

  it("applies count 100 and strict canonical request parsing", async () => {
    const delegate = createMockMarketReferenceProvider(
      createMockMarketService(),
    );
    const getCandles = vi.fn(delegate.getCandles);
    const provider = { ...delegate, getCandles };
    await handler(
      "getCandles",
      provider,
    )(
      request(
        "/api/v1/market/candles?symbol=%20aapl%20&interval=1m&before=2025-01-02T14%3A30%3A00.000Z",
      ),
    );
    expect(getCandles).toHaveBeenCalledWith({
      symbol: "AAPL",
      interval: "1m",
      count: 100,
      before: "2025-01-02T14:30:00.000Z",
      adjusted: true,
    });
  });

  it.each([
    "/api/v1/market/candles?symbol=AAPL&interval=5m",
    "/api/v1/market/candles?symbol=AAPL&interval=1d&count=0",
    "/api/v1/market/candles?symbol=AAPL&interval=1d&count=201",
    "/api/v1/market/candles?symbol=AAPL&interval=1d&count=01",
    "/api/v1/market/candles?symbol=AAPL&interval=1d&count=1e2",
    "/api/v1/market/candles?symbol=AAPL&interval=1d&adjusted=yes",
    "/api/v1/market/candles?symbol=AAPL&interval=1d&before=not-a-date",
    "/api/v1/market/candles?symbol=AAPL&symbol=005930&interval=1d",
    "/api/v1/market/candles?symbol=AAPL,005930&interval=1d",
    "/api/v1/market/candles?symbol=AAPL&interval=1d&origin=x",
  ])(
    "rejects invalid candle input before provider access: %s",
    async (path) => {
      const provider = emptyProvider();
      const response = await handler("getCandles", provider)(request(path));
      expect(response.status).toBe(400);
      expect(provider.getCandles).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["/api/v1/market/calendars/KR?date=2025-02-29", "KR"],
    ["/api/v1/market/calendars/KR?date=2025-13-01", "KR"],
    ["/api/v1/market/calendars/KR?date=2025-03-10&date=2025-03-11", "KR"],
    ["/api/v1/market/calendars/KR?date=2025-03-10&extra=x", "KR"],
    ["/api/v1/market/calendars/kr?date=2025-03-10", "kr"],
    ["/api/v1/market/calendars/KR?date=2025-03-10", "../KR"],
  ])(
    "rejects invalid calendar input before provider access",
    async (path, country) => {
      const provider = emptyProvider();
      const response = await handler("getCalendar", provider)(
        request(path),
        country,
      );
      expect(response.status).toBe(400);
      expect(provider.getCalendar).not.toHaveBeenCalled();
    },
  );

  it.each([
    "/api/v1/market/exchange-rate?baseCurrency=EUR&quoteCurrency=KRW",
    "/api/v1/market/exchange-rate?baseCurrency=USD&quoteCurrency=",
    "/api/v1/market/exchange-rate?baseCurrency=USD&baseCurrency=KRW&quoteCurrency=KRW",
    "/api/v1/market/exchange-rate?baseCurrency=USD&quoteCurrency=KRW&dateTime=nope",
    "/api/v1/market/exchange-rate?baseCurrency=USD&quoteCurrency=KRW&origin=x",
  ])(
    "rejects invalid exchange input before provider access: %s",
    async (path) => {
      const provider = emptyProvider();
      const response = await handler(
        "getExchangeRate",
        provider,
      )(request(path));
      expect(response.status).toBe(400);
      expect(provider.getExchangeRate).not.toHaveBeenCalled();
    },
  );

  it("requires a validated session and safely maps not-found and 429", async () => {
    const unauthorized = await handler("getCandles")(
      request("/api/v1/market/candles?symbol=AAPL&interval=1d", false),
    );
    expect(unauthorized.status).toBe(401);

    const notFound = emptyProvider();
    vi.mocked(notFound.getExchangeRate).mockRejectedValue(
      new MarketDataNotFoundError(),
    );
    const missing = await handler(
      "getExchangeRate",
      notFound,
    )(
      request(
        "/api/v1/market/exchange-rate?baseCurrency=KRW&quoteCurrency=KRW",
      ),
    );
    expect(missing.status).toBe(404);

    const limited = emptyProvider();
    vi.mocked(limited.getCalendar).mockRejectedValue(
      new TossHttpClientError(
        "TOSS_GET_RATE_LIMITED",
        true,
        "getKrMarketCalendar",
        429,
        5_000,
      ),
    );
    const response = await handler("getCalendar", limited)(
      request("/api/v1/market/calendars/KR?date=2025-03-10"),
      "KR",
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(JSON.stringify(await response.json())).not.toMatch(
      /authorization|token|raw|stack|sqlite/i,
    );
  });
});

function emptyProvider(): MarketReferenceProvider {
  return {
    getCandles: vi.fn(),
    getCalendar: vi.fn(),
    getExchangeRate: vi.fn(),
  };
}
