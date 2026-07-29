import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { SessionAuthenticationError } from "../../src/application/auth/session-service";
import { MarketDataNotFoundError } from "../../src/application/market/market-service";
import { createMarketBffHandler } from "../../src/application/market/stock-price-route";
import {
  createMockStockPriceProvider,
  type StockPriceProvider,
} from "../../src/application/market/stock-price-provider";
import { createMockMarketService } from "../../src/infrastructure/market/mock-market-service";
import { TossHttpClientError } from "../../src/infrastructure/toss/readonly-http-client";

const REQUEST_ID = "00000000-0000-4000-8000-000000000304";
const NOW = new Date("2026-07-28T10:00:00.000Z");
const SESSION_VALUE = ["fixture", "session", "0304"].join("-");

function request(
  path: string,
  options: { authenticated?: boolean; host?: string } = {},
) {
  return new NextRequest(`http://127.0.0.1:3000${path}`, {
    headers: {
      Host: options.host ?? "127.0.0.1:3000",
      ...(options.authenticated === false
        ? {}
        : { Cookie: `my_wts_session=${SESSION_VALUE}` }),
    },
  });
}

function handler(
  operation: "getPrices" | "getStocks",
  provider: StockPriceProvider = createMockStockPriceProvider(
    createMockMarketService(),
  ),
) {
  return createMarketBffHandler(operation, {
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

describe("stocks and prices BFF contract", () => {
  it.each([
    ["getStocks", "/api/v1/market/stocks", "005930,AAPL"],
    ["getPrices", "/api/v1/market/prices", "005930,AAPL"],
  ] as const)(
    "returns frozen %s success envelope",
    async (operation, path, symbols) => {
      const response = await handler(operation)(
        request(`${path}?symbols=${symbols}`),
      );
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
      expect(body.data.map(({ symbol }: { symbol: string }) => symbol)).toEqual(
        ["005930", "AAPL"],
      );
      expect(JSON.stringify(body)).not.toMatch(
        /password|session|authorization|clientSecret|tokenHash|sqlite|stack/i,
      );
    },
  );

  it("returns only official StockInfo and PriceResponse fields with exact decimals", async () => {
    const stockBody = await (
      await handler("getStocks")(request("/api/v1/market/stocks?symbols=FWD1"))
    ).json();
    const priceBody = await (
      await handler("getPrices")(request("/api/v1/market/prices?symbols=FWD1"))
    ).json();

    expect(Object.keys(stockBody.data[0]).sort()).toEqual(
      [
        "currency",
        "delistDate",
        "englishName",
        "isCommonShare",
        "isinCode",
        "koreanMarketDetail",
        "leverageFactor",
        "listDate",
        "market",
        "name",
        "securityType",
        "sharesOutstanding",
        "status",
        "symbol",
      ].sort(),
    );
    expect(priceBody.data[0]).toEqual({
      symbol: "FWD1",
      timestamp: null,
      lastPrice: "9007199254740993.123456789",
      currency: "XTS",
    });
  });

  it.each([
    "",
    "?symbols=",
    "?symbols=005930&symbols=AAPL",
    "?symbols=005930,,AAPL",
    "?symbols=005930,005930",
    "?symbols=005930&country=KR",
    "?symbol=005930",
    "?symbols=AAPL%ZZ",
  ])("rejects invalid query without calling provider: %s", async (query) => {
    const provider: StockPriceProvider = {
      getStocks: vi.fn(),
      getPrices: vi.fn(),
    };
    const response = await handler(
      "getStocks",
      provider,
    )(request(`/api/v1/market/stocks${query}`));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({
      requestId: REQUEST_ID,
      code: "VALIDATION_FAILED",
      retryable: false,
      details: { field: "symbols" },
    });
    expect(provider.getStocks).not.toHaveBeenCalled();
  });

  it("canonicalizes symbols before invoking the provider", async () => {
    const delegate = createMockStockPriceProvider(createMockMarketService());
    const getPrices = vi.fn(delegate.getPrices);
    const provider: StockPriceProvider = {
      getStocks: delegate.getStocks,
      getPrices,
    };
    const response = await handler(
      "getPrices",
      provider,
    )(request("/api/v1/market/prices?symbols=%20aapl%20"));

    expect(response.status).toBe(200);
    expect(getPrices).toHaveBeenCalledWith(["AAPL"]);
  });

  it("requires a valid local session and loopback Host", async () => {
    const unauthenticated = await handler("getStocks")(
      request("/api/v1/market/stocks?symbols=005930", {
        authenticated: false,
      }),
    );
    const forbidden = await handler("getStocks")(
      request("/api/v1/market/stocks?symbols=005930", {
        host: "example.invalid",
      }),
    );

    expect(unauthenticated.status).toBe(401);
    expect((await unauthenticated.json()).error.code).toBe("AUTH_REQUIRED");
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).error.code).toBe("UPSTREAM_FORBIDDEN");
  });

  it("maps not-found and readonly client failures without raw upstream data", async () => {
    const cases: Array<[unknown, number, string, string | null]> = [
      [new MarketDataNotFoundError(), 404, "UPSTREAM_NOT_FOUND", null],
      [
        new TossHttpClientError(
          "TOSS_GET_AUTHENTICATION_FAILED",
          false,
          "getStocks",
          401,
        ),
        502,
        "TOSS_AUTH_FAILED",
        null,
      ],
      [
        new TossHttpClientError("TOSS_GET_TIMEOUT", true, "getStocks"),
        504,
        "UPSTREAM_TIMEOUT",
        null,
      ],
      [
        new TossHttpClientError("TOSS_GET_NETWORK_FAILURE", true, "getStocks"),
        503,
        "UPSTREAM_UNAVAILABLE",
        null,
      ],
      [
        new TossHttpClientError(
          "TOSS_GET_RATE_LIMITED",
          true,
          "getStocks",
          429,
          5_000,
        ),
        429,
        "UPSTREAM_RATE_LIMITED",
        "5",
      ],
      [
        new TossHttpClientError(
          "TOSS_GET_MALFORMED_JSON",
          false,
          "getStocks",
          200,
        ),
        502,
        "UPSTREAM_UNKNOWN_ERROR",
        null,
      ],
    ];

    for (const [error, status, code, retryAfter] of cases) {
      const response = await handler("getStocks", {
        getStocks: async () => {
          throw error;
        },
        getPrices: vi.fn(),
      })(request("/api/v1/market/stocks?symbols=005930"));
      expect(response.status).toBe(status);
      expect(response.headers.get("retry-after")).toBe(retryAfter);
      const serialized = JSON.stringify(await response.json());
      expect(serialized).toContain(code);
      expect(serialized).not.toMatch(
        /raw upstream|authorization|credential|stack|sqlite/i,
      );
    }
  });
});
