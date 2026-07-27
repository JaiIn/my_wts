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
  });
});
