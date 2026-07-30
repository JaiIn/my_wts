import { describe, expect, it, vi } from "vitest";

import { createLiveHoldingsProvider } from "../../src/infrastructure/account/live-holdings-provider";
import {
  MOCK_HOLDINGS_ACCOUNT_101_ENVELOPE,
  MOCK_MALFORMED_HOLDINGS_ENVELOPE,
} from "../../src/infrastructure/account/mock-holdings-fixtures";
import { createMockHoldingsProvider } from "../../src/infrastructure/account/mock-holdings-provider";
import type { AccountScopedReadonlyTossClient } from "../../src/infrastructure/toss/readonly-http-client";

describe("holdings providers", () => {
  it("decodes, sorts, preserves decimal strings, filters and isolates mutation", async () => {
    const provider = createMockHoldingsProvider();
    const result = await provider.getHoldings(101);
    expect(result.items.map((item) => item.symbol)).toEqual(["005930", "AAPL"]);
    expect(result.items[0]?.quantity).toBe("9007199254740993");
    expect(result.items[1]?.lastPrice).toBe("178.500000000000000001");
    const mutable = result as unknown as {
      items: Array<{ name: string }>;
    };
    mutable.items[0]!.name = "changed";
    expect((await provider.getHoldings(101)).items[0]?.name).not.toBe("changed");
    expect((await provider.getHoldings(101, "aapl")).items).toHaveLength(1);
  });

  it("supports empty and forward-compatible market values", async () => {
    expect((await createMockHoldingsProvider().getHoldings(202)).items).toEqual(
      [],
    );
    expect(
      (await createMockHoldingsProvider().getHoldings(303)).items[0],
    ).toEqual(
      expect.objectContaining({
        marketCountry: "FUTURE_MARKET",
        currency: "FUTURE_CURRENCY",
      }),
    );
  });

  it("rejects malformed upstream holdings", async () => {
    const provider = createMockHoldingsProvider(
      new Map([[101, MOCK_MALFORMED_HOLDINGS_ENVELOPE]]),
    );
    await expect(provider.getHoldings(101)).rejects.toThrow();
  });

  it("uses only the account-scoped holdings GET boundary", async () => {
    const getAccountScoped = vi.fn().mockResolvedValue({
      status: 200,
      data: structuredClone(MOCK_HOLDINGS_ACCOUNT_101_ENVELOPE),
    });
    const client = {
      get: vi.fn(),
      getAccountScoped,
    } as unknown as AccountScopedReadonlyTossClient;
    const result = await createLiveHoldingsProvider(client).getHoldings(
      101,
      "aapl",
    );
    expect(result.items).toHaveLength(2);
    expect(getAccountScoped).toHaveBeenCalledWith({
      path: "/api/v1/holdings",
      operation: "getHoldings",
      accountSeq: 101,
      query: { symbol: "AAPL" },
    });
    expect(client.get).not.toHaveBeenCalled();
  });
});
