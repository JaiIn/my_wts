import { describe, expect, it, vi } from "vitest";

import {
  createMockMarketDetailProvider,
  toOrderbookResponse,
  toStockWarningResponse,
  toTradeResponse,
} from "../../src/application/market/market-detail-provider";
import { parseServerEnvironment } from "../../src/infrastructure/config/environment";
import { createLiveMarketDetailProvider } from "../../src/infrastructure/market/live-market-detail-provider";
import { createMockMarketService } from "../../src/infrastructure/market/mock-market-service";
import { selectMarketDetailProvider } from "../../src/infrastructure/market/runtime-market-detail-provider";
import type {
  ReadonlyTossClient,
  TossGetRequest,
} from "../../src/infrastructure/toss/readonly-http-client";

function fakeClient(
  responseFor: (request: TossGetRequest) => unknown,
  requests: TossGetRequest[] = [],
): ReadonlyTossClient {
  return {
    async get<T>(request: TossGetRequest) {
      requests.push(request);
      return { status: 200, data: responseFor(request) as T };
    },
  };
}

describe("market detail providers", () => {
  it("maps, sorts, and de-duplicates known and unknown warnings", async () => {
    const requests: TossGetRequest[] = [];
    const provider = createLiveMarketDetailProvider(
      fakeClient(
        () => ({
          result: [
            {
              warningType: "OVERHEATED",
              exchange: "KRX",
              startDate: "2026-03-20",
              endDate: null,
              raw: "not exposed",
            },
            {
              warningType: "FUTURE_WARNING",
              exchange: null,
              startDate: "2026-03-27",
              endDate: null,
            },
            { warningType: "OVERHEATED", startDate: "2026-03-19" },
          ],
        }),
        requests,
      ),
    );

    const warnings = await provider.getWarnings(" aapl ");
    expect(warnings.map(({ warningType }) => warningType)).toEqual([
      "FUTURE_WARNING",
      "OVERHEATED",
    ]);
    expect(warnings.map(toStockWarningResponse)).toEqual([
      {
        warningType: "FUTURE_WARNING",
        exchange: null,
        startDate: "2026-03-27",
        endDate: null,
      },
      {
        warningType: "OVERHEATED",
        exchange: "KRX",
        startDate: "2026-03-20",
        endDate: null,
      },
    ]);
    expect(requests[0]).toMatchObject({
      path: "/api/v1/stocks/AAPL/warnings",
      operation: "getStockWarnings",
    });
  });

  it("accepts a normal empty warning result", async () => {
    const provider = createLiveMarketDetailProvider(
      fakeClient(() => ({ result: [] })),
    );
    await expect(provider.getWarnings("005930")).resolves.toEqual([]);
  });

  it("preserves orderbook decimal strings and frozen ordering", async () => {
    const provider = createLiveMarketDetailProvider(
      fakeClient(() => ({
        result: {
          timestamp: "2026-03-25T22:30:00.456+09:00",
          currency: "USD",
          asks: [
            { price: "9007199254740993.00000001", volume: "1" },
            { price: "9007199254740993.00000002", volume: "2" },
          ],
          bids: [
            { price: "0.0000000000000002", volume: "3" },
            { price: "0.0000000000000001", volume: "4" },
          ],
        },
      })),
    );

    expect(toOrderbookResponse(await provider.getOrderbook("AAPL"))).toEqual({
      timestamp: "2026-03-25T22:30:00.456+09:00",
      currency: "USD",
      asks: [
        { price: "9007199254740993.00000001", volume: "1" },
        { price: "9007199254740993.00000002", volume: "2" },
      ],
      bids: [
        { price: "0.0000000000000002", volume: "3" },
        { price: "0.0000000000000001", volume: "4" },
      ],
    });
  });

  it.each([
    {
      name: "equivalent duplicate prices",
      result: {
        currency: "KRW",
        asks: [{ price: "101.0", volume: "1" }],
        bids: [{ price: "101.00", volume: "2" }],
      },
    },
    {
      name: "unsorted asks",
      result: {
        currency: "KRW",
        asks: [
          { price: "102", volume: "1" },
          { price: "101", volume: "2" },
        ],
        bids: [],
      },
    },
    {
      name: "negative decimal",
      result: {
        currency: "KRW",
        asks: [{ price: "-1", volume: "1" }],
        bids: [],
      },
    },
  ])("rejects malformed orderbook: $name", async ({ result }) => {
    const provider = createLiveMarketDetailProvider(
      fakeClient(() => ({ result })),
    );
    await expect(provider.getOrderbook("005930")).rejects.toMatchObject({
      name: expect.stringMatching(/TossEnvelopeDecodeError|ZodError/),
    });
  });

  it("sorts trades newest-first with deterministic ties and honors count", async () => {
    const requests: TossGetRequest[] = [];
    const provider = createLiveMarketDetailProvider(
      fakeClient(
        () => ({
          result: [
            {
              price: "101",
              volume: "1",
              timestamp: "2026-03-25T09:30:41.000+09:00",
              currency: "KRW",
            },
            {
              price: "100",
              volume: "3",
              timestamp: "2026-03-25T09:30:42.000+09:00",
              currency: "KRW",
            },
            {
              price: "100",
              volume: "2",
              timestamp: "2026-03-25T09:30:42.000+09:00",
              currency: "KRW",
            },
          ],
        }),
        requests,
      ),
    );

    const trades = await provider.getTrades("005930", 2);
    expect(trades.map(toTradeResponse)).toEqual([
      {
        price: "100",
        volume: "3",
        timestamp: "2026-03-25T09:30:42.000+09:00",
        currency: "KRW",
      },
      {
        price: "100",
        volume: "2",
        timestamp: "2026-03-25T09:30:42.000+09:00",
        currency: "KRW",
      },
    ]);
    expect(requests[0]?.query).toEqual({ symbol: "005930", count: "2" });
  });

  it("rejects malformed trades and invalid counts", async () => {
    const malformed = createLiveMarketDetailProvider(
      fakeClient(() => ({
        result: [
          {
            price: "1",
            volume: "2",
            timestamp: "not-a-time",
            currency: "KRW",
          },
        ],
      })),
    );
    await expect(malformed.getTrades("005930", 20)).rejects.toBeDefined();
    await expect(malformed.getTrades("005930", 51)).rejects.toThrow(
      "INVALID_TRADE_COUNT",
    );
  });

  it("isolates mock return values from caller mutation", async () => {
    const provider = createMockMarketDetailProvider(createMockMarketService());
    const first = await provider.getOrderbook("AAPL");
    (first.asks[0] as { price: string }).price = "1";
    expect((await provider.getOrderbook("AAPL")).asks[0]?.price).toBe("185.70");
  });

  it("selects mock without reading credentials or constructing live", () => {
    const source = { ALLOW_LIVE_TOSS_API: "false" } as Record<
      string,
      string | undefined
    >;
    Object.defineProperties(source, {
      TOSS_CLIENT_ID: {
        get() {
          throw new Error("credential must not be read");
        },
      },
      TOSS_CLIENT_SECRET: {
        get() {
          throw new Error("credential must not be read");
        },
      },
    });
    const mock = createMockMarketDetailProvider(createMockMarketService());
    const live = vi.fn(() => mock);
    expect(
      selectMarketDetailProvider(parseServerEnvironment(source), {
        mock,
        live,
      }),
    ).toMatchObject({ name: "mock", implementation: mock });
    expect(live).not.toHaveBeenCalled();
  });
});
