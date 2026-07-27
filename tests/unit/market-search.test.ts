import { describe, expect, it } from "vitest";

import type { MarketStockView } from "../../src/application/market/market-screen";
import { searchMarketStocks } from "../../src/ui/market/market-search";

const STOCKS: readonly MarketStockView[] = [
  {
    symbol: "005930",
    displayName: "테스트 코리아",
    englishName: "TEST KOREA",
    market: "KOSPI",
    currency: "KRW",
    status: "ACTIVE",
  },
  {
    symbol: "AAPL",
    displayName: "테스트 유에스",
    englishName: "TEST US",
    market: "NASDAQ",
    currency: "USD",
    status: "ACTIVE",
  },
  {
    symbol: "FWD1",
    displayName: "미래 계약 테스트",
    englishName: "FORWARD COMPATIBILITY TEST",
    market: "FUTURE_MARKET",
    currency: "XTS",
    status: "FUTURE_STATUS",
  },
];

describe("market stock search", () => {
  it("requires two trimmed characters for local search", () => {
    expect(searchMarketStocks(STOCKS, " A ")).toEqual([]);
    expect(searchMarketStocks(STOCKS, "  AA  ")[0]?.symbol).toBe("AAPL");
  });

  it("searches symbols case-insensitively and prioritizes an exact symbol", () => {
    expect(
      searchMarketStocks(STOCKS, "aapl").map(({ symbol }) => symbol),
    ).toEqual(["AAPL"]);
  });

  it("searches Korean names and market identifiers", () => {
    expect(
      searchMarketStocks(STOCKS, "코리아").map(({ symbol }) => symbol),
    ).toEqual(["005930"]);
    expect(
      searchMarketStocks(STOCKS, "nasdaq").map(({ symbol }) => symbol),
    ).toEqual(["AAPL"]);
  });

  it("keeps input order deterministic and removes duplicate symbols", () => {
    const duplicateInput = [...STOCKS, { ...STOCKS[0] }];

    expect(
      searchMarketStocks(duplicateInput, "test").map(({ symbol }) => symbol),
    ).toEqual(["005930", "AAPL", "FWD1"]);
  });

  it("returns copies instead of mutable source objects", () => {
    const result = searchMarketStocks(STOCKS, "aapl");
    result[0]!.displayName = "mutated";

    expect(STOCKS[1]?.displayName).toBe("테스트 유에스");
  });
});
