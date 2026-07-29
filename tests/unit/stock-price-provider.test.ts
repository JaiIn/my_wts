import { describe, expect, it, vi } from "vitest";

import {
  createMockStockPriceProvider,
  toPriceResponse,
  toStockInfoResponse,
} from "../../src/application/market/stock-price-provider";
import { parseServerEnvironment } from "../../src/infrastructure/config/environment";
import { createLiveStockPriceProvider } from "../../src/infrastructure/market/live-stock-price-provider";
import { createMockMarketService } from "../../src/infrastructure/market/mock-market-service";
import { selectStockPriceProvider } from "../../src/infrastructure/market/runtime-stock-price-provider";
import type { ReadonlyTossClient } from "../../src/infrastructure/toss/readonly-http-client";

describe("stock and price providers", () => {
  it("maps Toss DTOs through domain models and preserves decimal strings", async () => {
    const requests: Parameters<ReadonlyTossClient["get"]>[0][] = [];
    const client: ReadonlyTossClient = {
      get: async <T>(request: Parameters<ReadonlyTossClient["get"]>[0]) => {
        requests.push(request);
        const data =
          request.path === "/api/v1/stocks"
            ? {
                result: [
                  {
                    symbol: "FWD1",
                    name: "Fixture",
                    englishName: "FIXTURE",
                    isinCode: "ZZ0000000001",
                    market: "FUTURE_MARKET",
                    securityType: "FUTURE_TYPE",
                    isCommonShare: false,
                    status: "FUTURE_STATUS",
                    currency: "XTS",
                    listDate: null,
                    delistDate: null,
                    sharesOutstanding: "90071992547409931234567890",
                    leverageFactor: "1.25",
                    koreanMarketDetail: null,
                    ignoredUpstreamField: "not exposed",
                  },
                ],
              }
            : {
                result: [
                  {
                    symbol: "FWD1",
                    timestamp: null,
                    lastPrice: "9007199254740993.123456789",
                    currency: "XTS",
                    ignoredUpstreamField: "not exposed",
                  },
                ],
              };
        return { status: 200, data: data as T };
      },
    };
    const provider = createLiveStockPriceProvider(client);

    const stock = (await provider.getStocks(["FWD1"]))[0];
    const price = (await provider.getPrices(["FWD1"]))[0];
    expect(toStockInfoResponse(stock)).toEqual({
      symbol: "FWD1",
      name: "Fixture",
      englishName: "FIXTURE",
      isinCode: "ZZ0000000001",
      market: "FUTURE_MARKET",
      securityType: "FUTURE_TYPE",
      isCommonShare: false,
      status: "FUTURE_STATUS",
      currency: "XTS",
      listDate: null,
      delistDate: null,
      sharesOutstanding: "90071992547409931234567890",
      leverageFactor: "1.25",
      koreanMarketDetail: null,
    });
    expect(toPriceResponse(price)).toEqual({
      symbol: "FWD1",
      timestamp: null,
      lastPrice: "9007199254740993.123456789",
      currency: "XTS",
    });
    expect(requests[0]).toMatchObject({
      path: "/api/v1/stocks",
      operation: "getStocks",
      query: { symbols: "FWD1" },
    });
  });

  it("sorts mock results deterministically and reports missing symbols", async () => {
    const provider = createMockStockPriceProvider(createMockMarketService());

    await expect(provider.getStocks(["AAPL", "005930"])).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: "005930" }),
        expect.objectContaining({ symbol: "AAPL" }),
      ]),
    );
    expect(
      (await provider.getPrices(["AAPL", "005930"])).map(
        ({ symbol }) => symbol,
      ),
    ).toEqual(["005930", "AAPL"]);
    await expect(provider.getPrices(["MISSING"])).rejects.toMatchObject({
      code: "UPSTREAM_NOT_FOUND",
    });
  });

  it("rejects malformed live envelopes and incomplete results", async () => {
    const malformed = createLiveStockPriceProvider({
      get: async <T>() => ({
        status: 200,
        data: { result: [{}] } as T,
      }),
    });
    await expect(malformed.getStocks(["005930"])).rejects.toMatchObject({
      reason: "INVALID_RESULT",
    });

    const incomplete = createLiveStockPriceProvider({
      get: async <T>() => ({
        status: 200,
        data: { result: [] } as T,
      }),
    });
    await expect(incomplete.getPrices(["005930"])).rejects.toMatchObject({
      code: "UPSTREAM_NOT_FOUND",
    });
  });

  it("selects mock without touching live credentials or factory", () => {
    const source = { ALLOW_LIVE_TOSS_API: "false" } as Record<
      string,
      string | undefined
    >;
    Object.defineProperties(source, {
      ["TOSS_CLIENT_ID"]: {
        get() {
          throw new Error("credential must not be read");
        },
      },
      ["TOSS_CLIENT_SECRET"]: {
        get() {
          throw new Error("credential must not be read");
        },
      },
    });
    const mock = createMockStockPriceProvider(createMockMarketService());
    const live = vi.fn(() => mock);

    expect(
      selectStockPriceProvider(parseServerEnvironment(source), { mock, live }),
    ).toMatchObject({ name: "mock", implementation: mock });
    expect(live).not.toHaveBeenCalled();
  });

  it("selects an injected live provider only from validated server config", () => {
    const mock = createMockStockPriceProvider(createMockMarketService());
    const liveProvider = createMockStockPriceProvider(
      createMockMarketService(),
    );
    const live = vi.fn(() => liveProvider);
    const selection = selectStockPriceProvider(
      parseServerEnvironment({
        ALLOW_LIVE_TOSS_API: "true",
        ["TOSS_CLIENT_ID"]: ["fixture", "client"].join("-"),
        ["TOSS_CLIENT_SECRET"]: ["fixture", "credential"].join("-"),
      }),
      { mock, live },
    );

    expect(selection).toEqual({
      name: "live",
      implementation: liveProvider,
    });
    expect(live).toHaveBeenCalledTimes(1);
  });
});
