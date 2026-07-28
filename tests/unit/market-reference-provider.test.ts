import { describe, expect, it, vi } from "vitest";

import { createMockMarketReferenceProvider } from "../../src/application/market/market-reference-provider";
import { MarketDataNotFoundError } from "../../src/application/market/market-service";
import { parseServerEnvironment } from "../../src/infrastructure/config/environment";
import { createLiveMarketReferenceProvider } from "../../src/infrastructure/market/live-market-reference-provider";
import { createMockMarketService } from "../../src/infrastructure/market/mock-market-service";
import {
  MOCK_EXCHANGE_RATE_TOSS_ENVELOPE,
  MOCK_KR_CALENDAR_TOSS_ENVELOPE,
  MOCK_US_CALENDAR_TOSS_ENVELOPE,
} from "../../src/infrastructure/market/mock-reference-fixtures";
import { selectMarketReferenceProvider } from "../../src/infrastructure/market/runtime-market-reference-provider";
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

function candle(
  timestamp: string,
  values: Partial<{
    openPrice: string;
    highPrice: string;
    lowPrice: string;
    closePrice: string;
    volume: string;
  }> = {},
) {
  return {
    timestamp,
    openPrice: "9007199254740993.00000001",
    highPrice: "9007199254740993.00000004",
    lowPrice: "9007199254740993.00000000",
    closePrice: "9007199254740993.00000003",
    volume: "90071992547409931234567890",
    currency: "XTS",
    ...values,
  };
}

describe("market reference providers", () => {
  it("preserves candle decimals, nextBefore, and request cursor exactly", async () => {
    const requests: TossGetRequest[] = [];
    const nextBefore = "2026-03-24T09:00:00+09:00";
    const provider = createLiveMarketReferenceProvider(
      fakeClient(
        () => ({
          result: {
            candles: [candle("2026-03-25T09:00:00+09:00"), candle(nextBefore)],
            nextBefore,
          },
        }),
        requests,
      ),
    );
    const page = await provider.getCandles({
      symbol: " aapl ",
      interval: "1d",
      count: 100,
      before: nextBefore,
      adjusted: false,
    });

    expect(page.candles[0]).toMatchObject({
      openPrice: "9007199254740993.00000001",
      volume: "90071992547409931234567890",
    });
    expect(page.nextBefore).toBe(nextBefore);
    expect(requests[0]).toMatchObject({
      path: "/api/v1/candles",
      operation: "getCandles",
      query: {
        symbol: "AAPL",
        interval: "1d",
        count: "100",
        before: nextBefore,
        adjusted: "false",
      },
    });
  });

  it("accepts empty and final candle pages", async () => {
    const provider = createLiveMarketReferenceProvider(
      fakeClient(() => ({ result: { candles: [], nextBefore: null } })),
    );
    await expect(
      provider.getCandles({
        symbol: "005930",
        interval: "1m",
        count: 1,
        adjusted: true,
      }),
    ).resolves.toEqual({ candles: [], nextBefore: null });
  });

  it.each([
    {
      name: "instant-equivalent duplicate timestamps",
      candles: [
        candle("2026-03-25T09:00:00+09:00"),
        candle("2026-03-25T00:00:00Z"),
      ],
    },
    {
      name: "reversed timestamps",
      candles: [
        candle("2026-03-24T09:00:00+09:00"),
        candle("2026-03-25T09:00:00+09:00"),
      ],
    },
    {
      name: "invalid high",
      candles: [
        candle("2026-03-25T09:00:00+09:00", {
          highPrice: "9007199254740992",
        }),
      ],
    },
    {
      name: "invalid low",
      candles: [
        candle("2026-03-25T09:00:00+09:00", {
          lowPrice: "9007199254740994",
        }),
      ],
    },
    {
      name: "negative volume",
      candles: [
        candle("2026-03-25T09:00:00+09:00", {
          volume: "-1",
        }),
      ],
    },
  ])("rejects malformed candle data: $name", async ({ candles }) => {
    const provider = createLiveMarketReferenceProvider(
      fakeClient(() => ({ result: { candles, nextBefore: null } })),
    );
    await expect(
      provider.getCandles({
        symbol: "005930",
        interval: "1d",
        count: 100,
        adjusted: true,
      }),
    ).rejects.toMatchObject({
      name: "TossEnvelopeDecodeError",
    });
  });

  it("preserves KR nullable sessions and US DST-adjusted instants", async () => {
    const requests: TossGetRequest[] = [];
    const provider = createLiveMarketReferenceProvider(
      fakeClient(
        ({ path }) =>
          path.endsWith("/KR")
            ? MOCK_KR_CALENDAR_TOSS_ENVELOPE
            : MOCK_US_CALENDAR_TOSS_ENVELOPE,
        requests,
      ),
    );
    const kr = await provider.getCalendar({
      country: "KR",
      date: "2025-03-10",
    });
    const us = await provider.getCalendar({
      country: "US",
      date: "2025-03-10",
    });

    expect("integrated" in kr.today && kr.today.integrated).toMatchObject({
      preMarket: expect.any(Object),
      regularMarket: expect.any(Object),
      afterMarket: expect.any(Object),
    });
    expect("regularMarket" in us.previousBusinessDay).toBe(true);
    if ("regularMarket" in us.previousBusinessDay) {
      expect(us.previousBusinessDay.regularMarket?.startTime).toContain(
        "23:30:00+09:00",
      );
    }
    if ("regularMarket" in us.today) {
      expect(us.today.regularMarket?.startTime).toContain("22:30:00+09:00");
    }
    expect(requests.map(({ path }) => path)).toEqual([
      "/api/v1/market-calendar/KR",
      "/api/v1/market-calendar/US",
    ]);
  });

  it("preserves exchange-rate direction and long decimals", async () => {
    const requests: TossGetRequest[] = [];
    const provider = createLiveMarketReferenceProvider(
      fakeClient(() => MOCK_EXCHANGE_RATE_TOSS_ENVELOPE, requests),
    );
    const rate = await provider.getExchangeRate({
      baseCurrency: "USD",
      quoteCurrency: "KRW",
      dateTime: "2025-03-10T22:30:00+09:00",
    });
    expect(rate).toMatchObject({
      baseCurrency: "USD",
      quoteCurrency: "KRW",
      rate: "1375.123456789012345678",
    });
    expect(requests[0]?.query).toEqual({
      baseCurrency: "USD",
      quoteCurrency: "KRW",
      dateTime: "2025-03-10T22:30:00+09:00",
    });
  });

  it("rejects same-currency exchange rates before transport", async () => {
    const get = vi.fn();
    const provider = createLiveMarketReferenceProvider({ get });
    await expect(
      provider.getExchangeRate({
        baseCurrency: "KRW",
        quoteCurrency: "KRW",
      }),
    ).rejects.toBeInstanceOf(MarketDataNotFoundError);
    expect(get).not.toHaveBeenCalled();
  });

  it("keeps mock pagination and returned values isolated", async () => {
    const provider = createMockMarketReferenceProvider(
      createMockMarketService(),
    );
    const first = await provider.getCandles({
      symbol: "005930",
      interval: "1d",
      count: 2,
      adjusted: true,
    });
    const cursor = first.nextBefore;
    expect(cursor).toBeTruthy();
    const second = await provider.getCandles({
      symbol: "005930",
      interval: "1d",
      count: 2,
      before: cursor ?? undefined,
      adjusted: true,
    });
    expect(second.candles[0]?.timestamp).toBe(cursor);
    (first.candles[0] as { closePrice: string }).closePrice = "1";
    expect(
      (
        await provider.getCandles({
          symbol: "005930",
          interval: "1d",
          count: 2,
          adjusted: true,
        })
      ).candles[0]?.closePrice,
    ).not.toBe("1");
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
    const mock = createMockMarketReferenceProvider(createMockMarketService());
    const live = vi.fn(() => mock);
    expect(
      selectMarketReferenceProvider(parseServerEnvironment(source), {
        mock,
        live,
      }),
    ).toMatchObject({ name: "mock", implementation: mock });
    expect(live).not.toHaveBeenCalled();
  });
});
