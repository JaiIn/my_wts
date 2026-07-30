import { describe, expect, it, vi } from "vitest";

import { createLiveOrderInfoProvider } from "../../src/infrastructure/account/live-order-info-provider";
import { createMockOrderInfoProvider } from "../../src/infrastructure/account/mock-order-info-provider";
import type { AccountScopedReadonlyTossClient } from "../../src/infrastructure/toss/readonly-http-client";

describe("order information providers", () => {
  it("preserves zero, large and fractional decimal values per account", async () => {
    const provider = createMockOrderInfoProvider();
    expect((await provider.getBuyingPower(101, "KRW")).cashBuyingPower).toBe(
      "9007199254740993",
    );
    expect((await provider.getBuyingPower(202, "KRW")).cashBuyingPower).toBe(
      "0",
    );
    expect(
      (await provider.getSellableQuantity(101, "AAPL")).sellableQuantity,
    ).toBe("5.500000000000000001");
    expect((await provider.getCommissions(202))[0]?.commissionRate).toBe("0");
    expect((await provider.getCommissions(303))[0]?.marketCountry).toBe(
      "FUTURE_MARKET",
    );
  });

  it("isolates returned fixtures from caller mutation", async () => {
    const provider = createMockOrderInfoProvider();
    const first = (await provider.getCommissions(101)) as unknown as Array<{
      marketCountry: string;
    }>;
    expect(() => {
      first[0]!.marketCountry = "changed";
    }).toThrow();
    expect((await provider.getCommissions(101))[0]?.marketCountry).toBe("KR");
  });

  it("uses only exact account-scoped GET endpoints", async () => {
    const getAccountScoped = vi.fn(async (request) => ({
      status: 200,
      data:
        request.operation === "getBuyingPower"
          ? { result: { currency: "KRW", cashBuyingPower: "1" } }
          : request.operation === "getSellableQuantity"
            ? { result: { sellableQuantity: "2.5" } }
            : {
                result: [
                  {
                    marketCountry: "KR",
                    commissionRate: "0.015",
                    startDate: null,
                    endDate: null,
                  },
                ],
              },
    }));
    const client = {
      get: vi.fn(),
      getAccountScoped,
    } as unknown as AccountScopedReadonlyTossClient;
    const provider = createLiveOrderInfoProvider(client);
    await provider.getBuyingPower(101, "KRW");
    await provider.getSellableQuantity(101, "aapl");
    await provider.getCommissions(101);
    expect(getAccountScoped.mock.calls.map(([request]) => request)).toEqual([
      expect.objectContaining({
        path: "/api/v1/buying-power",
        operation: "getBuyingPower",
        query: { currency: "KRW" },
      }),
      expect.objectContaining({
        path: "/api/v1/sellable-quantity",
        operation: "getSellableQuantity",
        query: { symbol: "AAPL" },
      }),
      expect.objectContaining({
        path: "/api/v1/commissions",
        operation: "getCommissions",
      }),
    ]);
    expect(client.get).not.toHaveBeenCalled();
  });
});
