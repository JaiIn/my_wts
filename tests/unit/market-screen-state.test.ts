import { describe, expect, it } from "vitest";

import {
  failedMarketScreen,
  loadMarketScreen,
  safeMarketScreenError,
} from "../../src/application/market/market-screen";
import {
  MarketDataNotFoundError,
  MarketDataSourceError,
  type MarketService,
} from "../../src/application/market/market-service";
import { TossEnvelopeDecodeError } from "../../src/integrations/toss/envelope";
import {
  MOCK_PRICES_TOSS_ENVELOPE,
  MOCK_STOCKS_TOSS_ENVELOPE,
} from "../../src/infrastructure/market/mock-market-fixtures";
import { createMockMarketService } from "../../src/infrastructure/market/mock-market-service";

function emptyService(overrides: Partial<MarketService> = {}): MarketService {
  return {
    listStocks: async () => [],
    getStock: async () => {
      throw new MarketDataNotFoundError();
    },
    getPrice: async () => {
      throw new MarketDataNotFoundError();
    },
    getWarnings: async () => [],
    getOrderbook: async () => {
      throw new MarketDataNotFoundError();
    },
    getTrades: async () => [],
    ...overrides,
  };
}

describe("market screen safe states", () => {
  it("maps not-found, source, decoder, and unexpected errors to safe text", () => {
    const states = [
      safeMarketScreenError(new MarketDataNotFoundError(), "price"),
      safeMarketScreenError(
        new MarketDataSourceError("UPSTREAM_UNAVAILABLE", true),
        "warnings",
      ),
      safeMarketScreenError(
        new TossEnvelopeDecodeError("INVALID_RESULT"),
        "market",
      ),
      safeMarketScreenError(
        new Error("C:\\private\\data.sqlite3 SQL stack secret-body"),
        "market",
      ),
    ];
    const serialized = JSON.stringify(states);

    expect(states.map(({ kind }) => kind)).toEqual([
      "not-found",
      "unavailable",
      "invalid-data",
      "unexpected",
    ]);
    expect(serialized).not.toContain("private");
    expect(serialized).not.toContain("sqlite3");
    expect(serialized).not.toContain("SQL");
    expect(serialized).not.toContain("secret-body");
  });

  it("returns a safe screen error when the stock service fails", async () => {
    const data = await loadMarketScreen(
      emptyService({
        listStocks: async () => {
          throw new Error("raw-upstream-body stack trace");
        },
      }),
    );

    expect(data.screenError).toEqual({
      kind: "unexpected",
      title: "시장 데이터를 표시할 수 없습니다.",
      description: "예상하지 못한 문제가 발생했습니다.",
      retryable: false,
    });
    expect(JSON.stringify(data)).not.toContain("raw-upstream-body");
    expect(JSON.stringify(data)).not.toContain("stack trace");
  });

  it("creates a safe fallback for constructor-time schema failures", () => {
    const data = failedMarketScreen(
      new TossEnvelopeDecodeError("INVALID_RESULT"),
    );

    expect(data.stocks).toEqual([]);
    expect(data.screenError?.kind).toBe("invalid-data");
    expect(JSON.stringify(data)).not.toContain("INVALID_RESULT");
  });

  it("turns a malformed decimal fixture into a safe screen state", () => {
    let thrown: unknown;
    try {
      createMockMarketService({
        stocksEnvelope: MOCK_STOCKS_TOSS_ENVELOPE,
        pricesEnvelope: {
          result: [
            {
              symbol: "005930",
              timestamp: null,
              lastPrice: "C:\\private\\quote.sqlite stack",
              currency: "KRW",
            },
          ],
        },
      });
    } catch (error) {
      thrown = error;
    }

    const data = failedMarketScreen(thrown);
    expect(data.screenError?.kind).toBe("invalid-data");
    expect(JSON.stringify(data)).not.toContain("private");
    expect(JSON.stringify(data)).not.toContain("sqlite");
    expect(JSON.stringify(data)).not.toContain("stack");
  });

  it("maps every frozen warning type to user-facing text", async () => {
    const warningTypes = [
      "LIQUIDATION_TRADING",
      "OVERHEATED",
      "INVESTMENT_WARNING",
      "INVESTMENT_RISK",
      "VI_STATIC_AND_DYNAMIC",
      "VI_STATIC",
      "VI_DYNAMIC",
      "STOCK_WARRANTS",
    ];
    const data = await loadMarketScreen(
      createMockMarketService({
        stocksEnvelope: MOCK_STOCKS_TOSS_ENVELOPE,
        pricesEnvelope: MOCK_PRICES_TOSS_ENVELOPE,
        warningsEnvelopes: {
          "005930": {
            result: warningTypes.map((warningType) => ({ warningType })),
          },
          AAPL: { result: [] },
          EMPTY1: { result: [] },
          ERR1: { result: [] },
          FWD1: { result: [] },
        },
      }),
    );
    const titles =
      data.warnings
        .find(({ symbol }) => symbol === "005930")
        ?.warnings.map(({ title }) => title) ?? [];

    expect(new Set(titles)).toEqual(
      new Set([
        "정리매매 종목",
        "단기과열종목",
        "투자경고종목",
        "투자위험종목",
        "변동성 완화장치 발동",
        "정적 변동성 완화장치 발동",
        "동적 변동성 완화장치 발동",
        "신주인수권 관련 종목",
      ]),
    );
  });
});
