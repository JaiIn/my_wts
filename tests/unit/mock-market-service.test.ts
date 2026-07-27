import { beforeEach, describe, expect, it, vi } from "vitest";

import { MarketDataNotFoundError } from "../../src/application/market/market-service";
import { decimalFromString } from "../../src/domain/common/decimal";
import {
  MOCK_ORDERBOOK_TOSS_ENVELOPES,
  MOCK_PRICES_TOSS_ENVELOPE,
  MOCK_STOCKS_TOSS_ENVELOPE,
  MOCK_TRADES_TOSS_ENVELOPES,
} from "../../src/infrastructure/market/mock-market-fixtures";
import { createMockMarketService } from "../../src/infrastructure/market/mock-market-service";
import { decodeTossEnvelope } from "../../src/integrations/toss/envelope";
import {
  tossOrderbookResponseSchema,
  tossPriceResponseListSchema,
  tossStockInfoListSchema,
  tossTradeListSchema,
} from "../../src/integrations/toss/market-schemas";

describe("mock market fixtures and service", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes every stock and price through the Toss envelope contract", () => {
    const stocks = decodeTossEnvelope(
      MOCK_STOCKS_TOSS_ENVELOPE,
      tossStockInfoListSchema,
    );
    const prices = decodeTossEnvelope(
      MOCK_PRICES_TOSS_ENVELOPE,
      tossPriceResponseListSchema,
    );

    expect(stocks.ok && stocks.result).toHaveLength(5);
    expect(prices.ok && prices.result).toHaveLength(4);
  });

  it("decodes orderbook and trades through their frozen Toss contracts", () => {
    const orderbook = decodeTossEnvelope(
      MOCK_ORDERBOOK_TOSS_ENVELOPES["005930"],
      tossOrderbookResponseSchema,
    );
    const trades = decodeTossEnvelope(
      MOCK_TRADES_TOSS_ENVELOPES["005930"],
      tossTradeListSchema,
    );

    expect(orderbook.ok && orderbook.result.asks).toHaveLength(3);
    expect(orderbook.ok && orderbook.result.bids).toHaveLength(3);
    expect(trades.ok && trades.result).toHaveLength(3);
  });

  it("preserves KR, US, and unknown enum values at the DTO boundary", () => {
    const decoded = decodeTossEnvelope(
      MOCK_STOCKS_TOSS_ENVELOPE,
      tossStockInfoListSchema,
    );
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    expect(new Set(decoded.result.map(({ market }) => market))).toEqual(
      new Set(["KOSPI", "NASDAQ", "FUTURE_MARKET"]),
    );
  });

  it("returns deterministic symbol ordering and representative lookups", async () => {
    const service = createMockMarketService();

    await expect(service.listStocks()).resolves.toEqual(
      await service.listStocks(),
    );
    await expect(
      service.listStocks().then((stocks) => stocks.map(({ symbol }) => symbol)),
    ).resolves.toEqual(["005930", "AAPL", "EMPTY1", "ERR1", "FWD1"]);
    await expect(service.getStock("005930")).resolves.toMatchObject({
      symbol: "005930",
      market: "KOSPI",
      currency: "KRW",
    });
    await expect(service.getPrice("AAPL")).resolves.toMatchObject({
      symbol: "AAPL",
      lastPrice: "185.70",
      currency: "USD",
    });
  });

  it("uses the frozen not-found contract for an unknown symbol", async () => {
    const service = createMockMarketService();

    await expect(service.getStock("MISSING")).rejects.toMatchObject({
      name: "MarketDataNotFoundError",
      code: "UPSTREAM_NOT_FOUND",
      status: 404,
      retryable: false,
    });
    await expect(service.getPrice("MISSING")).rejects.toBeInstanceOf(
      MarketDataNotFoundError,
    );
  });

  it("isolates nested fixture data from caller mutation", async () => {
    const service = createMockMarketService();
    const first = await service.getStock("005930");

    first.displayName = "mutated";
    if (first.koreanMarketDetail) {
      first.koreanMarketDetail.nxtSupported = false;
    }

    await expect(service.getStock("005930")).resolves.toMatchObject({
      displayName: "테스트 코리아",
      koreanMarketDetail: { nxtSupported: true },
    });
    expect(Object.isFrozen(MOCK_STOCKS_TOSS_ENVELOPE)).toBe(true);
    expect(Object.isFrozen(MOCK_STOCKS_TOSS_ENVELOPE.result[0])).toBe(true);
  });

  it("preserves decimal precision beyond JavaScript's safe integer range", async () => {
    const service = createMockMarketService();
    const stock = await service.getStock("FWD1");
    const price = await service.getPrice("FWD1");

    expect(stock.sharesOutstanding).toBe("90071992547409931234567890");
    expect(price.lastPrice).toBe("9007199254740993.123456789");
    expect(
      decimalFromString(price.lastPrice).plus("0.000000001").toFixed(9),
    ).toBe("9007199254740993.123456790");
  });

  it("rejects malformed decimal fixture data without exposing it", () => {
    expect(() =>
      createMockMarketService({
        stocksEnvelope: MOCK_STOCKS_TOSS_ENVELOPE,
        pricesEnvelope: {
          result: [
            {
              symbol: "005930",
              timestamp: null,
              lastPrice: 72000,
              currency: "KRW",
            },
          ],
        },
      }),
    ).toThrow("TOSS_ENVELOPE_DECODE_FAILED");
  });

  it("never calls fetch or another external network boundary", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("NETWORK_CALL_NOT_ALLOWED");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const service = createMockMarketService();
    await service.listStocks();
    await service.getStock("AAPL");
    await service.getPrice("AAPL");
    await service.getWarnings("AAPL");
    await service.getOrderbook("AAPL");
    await service.getTrades("AAPL");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns warnings in deterministic order and removes duplicate codes", async () => {
    const service = createMockMarketService();

    await expect(service.getWarnings("005930")).resolves.toMatchObject([
      { warningType: "VI_STATIC", startDate: "2025-01-02" },
      { warningType: "OVERHEATED", startDate: "2025-01-01" },
    ]);
    await expect(service.getWarnings("FWD1")).resolves.toMatchObject([
      { warningType: "FUTURE_WARNING" },
      { warningType: "INVESTMENT_RISK" },
    ]);
  });

  it("isolates warning fixture data from caller mutation", async () => {
    const service = createMockMarketService();
    const first = await service.getWarnings("005930");

    first[0]!.warningType = "mutated";

    expect((await service.getWarnings("005930"))[0]?.warningType).toBe(
      "VI_STATIC",
    );
  });

  it("maps a mock warning envelope error without exposing upstream content", async () => {
    const service = createMockMarketService();
    let thrown: unknown;

    try {
      await service.getWarnings("ERR1");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: "MarketDataSourceError",
      message: "MARKET_DATA_SOURCE_ERROR",
      code: "UPSTREAM_UNAVAILABLE",
      retryable: true,
    });
    expect(String(thrown)).not.toContain("Mock warning lookup failed.");
    expect(String(thrown)).not.toContain("mock-warning-request");
  });

  it("returns frozen ask, bid, and trade ordering without numeric conversion", async () => {
    const service = createMockMarketService();
    const orderbook = await service.getOrderbook("005930");
    const trades = await service.getTrades("005930");

    expect(orderbook.asks.map(({ price }) => price)).toEqual([
      "72100",
      "72200",
      "72300",
    ]);
    expect(orderbook.bids.map(({ price }) => price)).toEqual([
      "72000",
      "71900",
      "71800",
    ]);
    expect(trades.map(({ observedAt }) => observedAt)).toEqual([
      "2025-01-02T09:30:42.000+09:00",
      "2025-01-02T09:30:41.500+09:00",
      "2025-01-02T09:30:40.800+09:00",
    ]);
    expect(orderbook.asks[0]?.volume).toBe("9007199254740993");
    expect(trades[2]?.volume).toBe("9007199254740993");
  });

  it("keeps orderbook and trade fixture results isolated from mutation", async () => {
    const service = createMockMarketService();
    const orderbook = await service.getOrderbook("AAPL");
    const trades = await service.getTrades("AAPL");

    (orderbook.asks[0] as { price: string }).price = "1";
    (trades[0] as { price: string }).price = "1";

    expect((await service.getOrderbook("AAPL")).asks[0]?.price).toBe("185.70");
    expect((await service.getTrades("AAPL"))[0]?.price).toBe("185.70");
    expect(Object.isFrozen(MOCK_ORDERBOOK_TOSS_ENVELOPES)).toBe(true);
    expect(Object.isFrozen(MOCK_TRADES_TOSS_ENVELOPES)).toBe(true);
  });

  it("returns deterministic widget empty and source-error states", async () => {
    const service = createMockMarketService();

    await expect(service.getOrderbook("EMPTY1")).resolves.toMatchObject({
      asks: [],
      bids: [],
    });
    await expect(service.getTrades("FWD1")).resolves.toEqual([]);
    await expect(service.getOrderbook("ERR1")).rejects.toMatchObject({
      name: "MarketDataSourceError",
      code: "UPSTREAM_UNAVAILABLE",
      retryable: true,
    });
    await expect(service.getTrades("ERR1")).rejects.toMatchObject({
      name: "MarketDataSourceError",
      code: "UPSTREAM_UNAVAILABLE",
      retryable: true,
    });
  });

  it.each([
    {
      name: "negative orderbook decimal",
      orderbook: {
        result: {
          timestamp: null,
          currency: "KRW",
          asks: [{ price: "-1", volume: "1" }],
          bids: [],
        },
      },
    },
    {
      name: "duplicate orderbook price",
      orderbook: {
        result: {
          timestamp: null,
          currency: "KRW",
          asks: [{ price: "101.0", volume: "1" }],
          bids: [{ price: "101.00", volume: "2" }],
        },
      },
    },
    {
      name: "wrong ask order",
      orderbook: {
        result: {
          timestamp: null,
          currency: "KRW",
          asks: [
            { price: "102", volume: "1" },
            { price: "101", volume: "1" },
          ],
          bids: [],
        },
      },
    },
    {
      name: "wrong bid order",
      orderbook: {
        result: {
          timestamp: null,
          currency: "KRW",
          asks: [],
          bids: [
            { price: "101", volume: "1" },
            { price: "102", volume: "1" },
          ],
        },
      },
    },
  ])("rejects $name safely", async ({ orderbook }) => {
    const service = createMockMarketService({
      stocksEnvelope: MOCK_STOCKS_TOSS_ENVELOPE,
      pricesEnvelope: MOCK_PRICES_TOSS_ENVELOPE,
      orderbookEnvelopes: { "005930": orderbook },
    });

    await expect(service.getOrderbook("005930")).rejects.toMatchObject({
      name: "TossEnvelopeDecodeError",
      message: "TOSS_ENVELOPE_DECODE_FAILED",
    });
  });

  it("rejects malformed trade timestamp, decimal, and count", async () => {
    const service = createMockMarketService({
      stocksEnvelope: MOCK_STOCKS_TOSS_ENVELOPE,
      pricesEnvelope: MOCK_PRICES_TOSS_ENVELOPE,
      tradesEnvelopes: {
        "005930": {
          result: [
            {
              price: "not-decimal",
              volume: "-2",
              timestamp: "not-a-timestamp",
              currency: "KRW",
            },
          ],
        },
      },
    });

    await expect(service.getTrades("005930")).rejects.toMatchObject({
      name: "TossEnvelopeDecodeError",
      message: "TOSS_ENVELOPE_DECODE_FAILED",
    });
    await expect(
      createMockMarketService().getTrades("005930", 51),
    ).rejects.toThrow("INVALID_TRADE_COUNT");
  });

  it("sorts equal-timestamp trades deterministically and honors count", async () => {
    const service = createMockMarketService({
      stocksEnvelope: MOCK_STOCKS_TOSS_ENVELOPE,
      pricesEnvelope: MOCK_PRICES_TOSS_ENVELOPE,
      tradesEnvelopes: {
        "005930": {
          result: [
            {
              price: "100",
              volume: "1",
              timestamp: "2025-01-02T09:30:00.000+09:00",
              currency: "KRW",
            },
            {
              price: "101",
              volume: "2",
              timestamp: "2025-01-02T09:30:00.000+09:00",
              currency: "KRW",
            },
          ],
        },
      },
    });

    await expect(
      service.getTrades("005930", 1).then((trades) => trades[0]?.price),
    ).resolves.toBe("101");
  });
});
