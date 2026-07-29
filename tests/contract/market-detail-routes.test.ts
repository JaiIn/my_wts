import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { SessionAuthenticationError } from "../../src/application/auth/session-service";
import type { MarketDetailProvider } from "../../src/application/market/market-detail-provider";
import { createMarketDetailBffHandler } from "../../src/application/market/market-detail-route";
import { MarketDataNotFoundError } from "../../src/application/market/market-service";
import { createMockMarketDetailProvider } from "../../src/application/market/market-detail-provider";
import { createMockMarketService } from "../../src/infrastructure/market/mock-market-service";
import { TossHttpClientError } from "../../src/infrastructure/toss/readonly-http-client";

const REQUEST_ID = "00000000-0000-4000-8000-000000000305";
const NOW = new Date("2026-07-28T11:00:00.000Z");
const SESSION_VALUE = ["fixture", "session", "0305"].join("-");

type Operation = "getOrderbook" | "getTrades" | "getWarnings";

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
  operation: Operation,
  provider: MarketDetailProvider = createMockMarketDetailProvider(
    createMockMarketService(),
  ),
) {
  return createMarketDetailBffHandler(operation, {
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

describe("warning, orderbook, and trades BFF contract", () => {
  it.each([
    ["getWarnings", "/api/v1/market/stocks/005930/warnings", "005930"],
    ["getOrderbook", "/api/v1/market/orderbook?symbol=005930", undefined],
    ["getTrades", "/api/v1/market/trades?symbol=005930&count=2", undefined],
  ] as const)(
    "returns frozen %s success envelope",
    async (operation, path, symbol) => {
      const response = await handler(operation)(request(path), symbol);
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
        /password|session|authorization|clientSecret|tokenHash|sqlite|stack|accountSeq|accountNo/i,
      );
    },
  );

  it("returns only official fields with decimal strings and deterministic order", async () => {
    const warnings = await (
      await handler("getWarnings")(
        request("/api/v1/market/stocks/FWD1/warnings"),
        "FWD1",
      )
    ).json();
    const orderbook = await (
      await handler("getOrderbook")(
        request("/api/v1/market/orderbook?symbol=FWD1"),
      )
    ).json();
    const trades = await (
      await handler("getTrades")(
        request("/api/v1/market/trades?symbol=005930&count=2"),
      )
    ).json();

    expect(
      warnings.data.map(
        ({ warningType }: { warningType: string }) => warningType,
      ),
    ).toEqual(["FUTURE_WARNING", "INVESTMENT_RISK"]);
    expect(Object.keys(warnings.data[0]).sort()).toEqual(
      ["warningType", "exchange", "startDate", "endDate"].sort(),
    );
    expect(orderbook.data).toEqual({
      timestamp: null,
      currency: "XTS",
      asks: [
        {
          price: "9007199254740993.223456789",
          volume: "90071992547409931234567890",
        },
      ],
      bids: [
        {
          price: "9007199254740993.023456789",
          volume: "90071992547409931234567889",
        },
      ],
    });
    expect(trades.data).toHaveLength(2);
    expect(
      trades.data.map(({ timestamp }: { timestamp: string }) => timestamp),
    ).toEqual([
      "2025-01-02T09:30:42.000+09:00",
      "2025-01-02T09:30:41.500+09:00",
    ]);
    expect(Object.keys(trades.data[0]).sort()).toEqual(
      ["price", "volume", "timestamp", "currency"].sort(),
    );
  });

  it("returns warnings, orderbook, and trades empty states as successful data", async () => {
    const warningResponse = await handler("getWarnings")(
      request("/api/v1/market/stocks/AAPL/warnings"),
      "AAPL",
    );
    const orderbookResponse = await handler("getOrderbook")(
      request("/api/v1/market/orderbook?symbol=EMPTY1"),
    );
    const tradeResponse = await handler("getTrades")(
      request("/api/v1/market/trades?symbol=FWD1"),
    );

    expect((await warningResponse.json()).data).toEqual([]);
    expect((await orderbookResponse.json()).data).toMatchObject({
      asks: [],
      bids: [],
    });
    expect((await tradeResponse.json()).data).toEqual([]);
    expect([
      warningResponse.status,
      orderbookResponse.status,
      tradeResponse.status,
    ]).toEqual([200, 200, 200]);
  });

  it.each([
    ["getOrderbook", "/api/v1/market/orderbook", undefined],
    ["getOrderbook", "/api/v1/market/orderbook?symbol=", undefined],
    [
      "getOrderbook",
      "/api/v1/market/orderbook?symbol=AAPL&symbol=005930",
      undefined,
    ],
    ["getOrderbook", "/api/v1/market/orderbook?symbol=AAPL,005930", undefined],
    ["getOrderbook", "/api/v1/market/orderbook?symbol=..", undefined],
    [
      "getOrderbook",
      "/api/v1/market/orderbook?symbol=AAPL&origin=x",
      undefined,
    ],
    ["getTrades", "/api/v1/market/trades?symbol=AAPL&count=0", undefined],
    ["getTrades", "/api/v1/market/trades?symbol=AAPL&count=51", undefined],
    ["getTrades", "/api/v1/market/trades?symbol=AAPL&count=01", undefined],
    ["getWarnings", "/api/v1/market/stocks/AAPL/warnings?symbol=AAPL", "AAPL"],
    ["getWarnings", "/api/v1/market/stocks/AAPL/warnings", "../AAPL"],
  ] as const)(
    "rejects invalid %s input before provider call",
    async (operation, path, symbol) => {
      const provider: MarketDetailProvider = {
        getWarnings: vi.fn(),
        getOrderbook: vi.fn(),
        getTrades: vi.fn(),
      };
      const response = await handler(operation, provider)(
        request(path),
        symbol,
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
      expect(provider.getWarnings).not.toHaveBeenCalled();
      expect(provider.getOrderbook).not.toHaveBeenCalled();
      expect(provider.getTrades).not.toHaveBeenCalled();
    },
  );

  it("canonicalizes symbols and applies the frozen trade default count", async () => {
    const delegate = createMockMarketDetailProvider(createMockMarketService());
    const getWarnings = vi.fn(delegate.getWarnings);
    const getOrderbook = vi.fn(delegate.getOrderbook);
    const getTrades = vi.fn(delegate.getTrades);
    const provider = { getWarnings, getOrderbook, getTrades };

    await handler("getWarnings", provider)(
      request("/api/v1/market/stocks/aapl/warnings"),
      " aapl ",
    );
    await handler(
      "getOrderbook",
      provider,
    )(request("/api/v1/market/orderbook?symbol=%20aapl%20"));
    await handler(
      "getTrades",
      provider,
    )(request("/api/v1/market/trades?symbol=%20aapl%20"));

    expect(getWarnings).toHaveBeenCalledWith("AAPL");
    expect(getOrderbook).toHaveBeenCalledWith("AAPL");
    expect(getTrades).toHaveBeenCalledWith("AAPL", 20);
  });

  it("requires a validated local session and loopback Host", async () => {
    const unauthenticated = await handler("getOrderbook")(
      request("/api/v1/market/orderbook?symbol=AAPL", {
        authenticated: false,
      }),
    );
    const forbidden = await handler("getTrades")(
      request("/api/v1/market/trades?symbol=AAPL", {
        host: "example.invalid",
      }),
    );
    expect(unauthenticated.status).toBe(401);
    expect((await unauthenticated.json()).error.code).toBe("AUTH_REQUIRED");
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).error.code).toBe("UPSTREAM_FORBIDDEN");
  });

  it("maps not-found and readonly failures without raw upstream data", async () => {
    const cases: Array<[unknown, number, string, string | null]> = [
      [new MarketDataNotFoundError(), 404, "UPSTREAM_NOT_FOUND", null],
      [
        new TossHttpClientError(
          "TOSS_GET_AUTHENTICATION_FAILED",
          false,
          "getOrderbook",
          401,
        ),
        502,
        "TOSS_AUTH_FAILED",
        null,
      ],
      [
        new TossHttpClientError("TOSS_GET_TIMEOUT", true, "getOrderbook"),
        504,
        "UPSTREAM_TIMEOUT",
        null,
      ],
      [
        new TossHttpClientError(
          "TOSS_GET_RATE_LIMITED",
          true,
          "getOrderbook",
          429,
          7_000,
        ),
        429,
        "UPSTREAM_RATE_LIMITED",
        "7",
      ],
      [
        new TossHttpClientError(
          "TOSS_GET_MALFORMED_JSON",
          false,
          "getOrderbook",
          200,
        ),
        502,
        "UPSTREAM_UNKNOWN_ERROR",
        null,
      ],
    ];

    for (const [error, status, code, retryAfter] of cases) {
      const response = await handler("getOrderbook", {
        getWarnings: vi.fn(),
        getOrderbook: async () => {
          throw error;
        },
        getTrades: vi.fn(),
      })(request("/api/v1/market/orderbook?symbol=AAPL"));
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
