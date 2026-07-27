import { describe, expect, it } from "vitest";

import {
  INITIAL_MARKET_SYMBOL,
  loadMarketScreen,
} from "../../src/application/market/market-screen";
import { createMockMarketService } from "../../src/infrastructure/market/mock-market-service";

describe("market screen server-to-client contract", () => {
  it("provides the frozen initial symbol and minimal serializable view models", async () => {
    const data = await loadMarketScreen(createMockMarketService());

    expect(data.initialSymbol).toBe(INITIAL_MARKET_SYMBOL);
    expect(data.initialSymbol).toBe("005930");
    expect(Object.keys(data.stocks[0] ?? {}).sort()).toEqual([
      "currency",
      "displayName",
      "englishName",
      "market",
      "status",
      "symbol",
    ]);
    expect(Object.keys(data.prices[0] ?? {}).sort()).toEqual([
      "currency",
      "lastPrice",
      "observedAt",
      "symbol",
    ]);
    expect(data.prices.find(({ symbol }) => symbol === "FWD1")?.lastPrice).toBe(
      "9007199254740993.123456789",
    );
    expect(
      data.warnings.find(({ symbol }) => symbol === "005930")?.warnings,
    ).toMatchObject([
      { title: "정적 변동성 완화장치 발동" },
      { title: "단기과열종목" },
    ]);
    expect(data.prices.some(({ symbol }) => symbol === "EMPTY1")).toBe(false);
    expect(data.priceErrors.some(({ symbol }) => symbol === "EMPTY1")).toBe(
      false,
    );
    expect(
      data.warningErrors.find(({ symbol }) => symbol === "ERR1")?.error.kind,
    ).toBe("unavailable");
    const initialOrderbook = data.orderbooks.find(
      ({ symbol }) => symbol === "005930",
    );
    expect(initialOrderbook?.currency).toBe("KRW");
    expect(initialOrderbook?.asks[0]).toEqual({
      price: "72100",
      volume: "9007199254740993",
    });
    expect(initialOrderbook?.bids[0]).toEqual({
      price: "72000",
      volume: "5200",
    });
    expect(
      data.trades.find(({ symbol }) => symbol === "005930")?.trades[0],
    ).toMatchObject({
      price: "72000",
      volume: "120",
      currency: "KRW",
    });
    expect(
      data.orderbooks.find(({ symbol }) => symbol === "EMPTY1"),
    ).toMatchObject({ asks: [], bids: [] });
    expect(
      data.trades.find(({ symbol }) => symbol === "FWD1")?.trades,
    ).toEqual([]);
    expect(
      data.orderbookErrors.find(({ symbol }) => symbol === "ERR1")?.error.kind,
    ).toBe("unavailable");
    expect(
      data.tradeErrors.find(({ symbol }) => symbol === "ERR1")?.error.kind,
    ).toBe("unavailable");
  });

  it("does not expose persistence or authentication internals", async () => {
    const serialized = JSON.stringify(
      await loadMarketScreen(createMockMarketService()),
    );

    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("sessionTokenHash");
    expect(serialized).not.toContain("accountSeq");
    expect(serialized).not.toContain("isinCode");
    expect(serialized).not.toContain("sharesOutstanding");
    expect(serialized).not.toContain("VI_STATIC");
    expect(serialized).not.toContain("internal-error");
    expect(serialized).not.toContain("mock-warning-request");
    expect(serialized).not.toContain("mock-orderbook-request");
    expect(serialized).not.toContain("mock-trades-request");
    expect(serialized).not.toContain("Mock orderbook lookup failed.");
    expect(serialized).not.toContain("Mock trades lookup failed.");
  });
});
