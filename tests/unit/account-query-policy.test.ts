import { describe, expect, it } from "vitest";

import {
  ACCOUNT_QUERY_TTL,
  ACCOUNT_SCOPED_QUERY_KEYS,
} from "../../src/ui/account/account-query-policy";

describe("account query policy", () => {
  it("keeps the frozen holdings and commissions TTLs", () => {
    expect(ACCOUNT_QUERY_TTL).toEqual({
      accounts: 0,
      holdings: 5_000,
      buyingPower: 0,
      sellableQuantity: 0,
      commissions: 3_600_000,
    });
  });

  it("invalidates only account-scoped portfolio query families", () => {
    expect(ACCOUNT_SCOPED_QUERY_KEYS).toEqual(["holdings", "order-info"]);
    expect(ACCOUNT_SCOPED_QUERY_KEYS).not.toContain("market");
  });
});
