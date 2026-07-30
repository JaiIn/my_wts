import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import {
  createOrderInfoBffHandler,
  type OrderInfoOperation,
} from "../../src/application/account/order-info-route";
import { SessionAuthenticationError } from "../../src/application/auth/session-service";
import { createMockOrderInfoProvider } from "../../src/infrastructure/account/mock-order-info-provider";

const SESSION = "order-info-contract-session";
const REQUEST_ID = "00000000-0000-4000-8000-000000000505";
const NOW = new Date("2026-07-30T05:05:00.000Z");

function request(path: string, authenticated = true, host = "127.0.0.1:3000") {
  return new NextRequest(`http://127.0.0.1:3000${path}`, {
    headers: {
      Host: host,
      ...(authenticated ? { Cookie: `my_wts_session=${SESSION}` } : {}),
    },
  });
}

function handler(operation: OrderInfoOperation, accountSeq: number | null = 101) {
  const provider = createMockOrderInfoProvider();
  return createOrderInfoBffHandler(operation, {
    provider: () => ({ implementation: provider, name: "mock" }),
    selection: {
      authenticate(token) {
        if (token !== SESSION) throw new SessionAuthenticationError("AUTH_REQUIRED");
        return {
          userId: "usr_order_info",
          tokenHash: "hash_order_info",
          sessionScope: "scope_order_info",
        };
      },
      resolveCurrent: () =>
        accountSeq === null
          ? null
          : { accountRef: "acct_order_info_contract", accountSeq },
    },
    createRequestId: () => REQUEST_ID,
    now: () => NOW,
  });
}

describe("order information BFF contracts", () => {
  it.each([
    [
      "getBuyingPower" as const,
      "/api/v1/order-info/buying-power?currency=KRW",
      "cashBuyingPower",
    ],
    [
      "getSellableQuantity" as const,
      "/api/v1/order-info/sellable-quantity?symbol=AAPL",
      "sellableQuantity",
    ],
    [
      "getCommissions" as const,
      "/api/v1/order-info/commissions",
      "0",
    ],
  ])("returns safe %s data", async (operation, path, expected) => {
    const response = await handler(operation)(request(path));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    expect(JSON.stringify(body)).toContain(expected);
    expect(JSON.stringify(body)).not.toMatch(
      /accountSeq|accountRef|accountNo|authorization|cookie|stack|sqlite/i,
    );
  });

  it("returns zero values without treating them as empty", async () => {
    const response = await handler("getBuyingPower", 202)(
      request("/api/v1/order-info/buying-power?currency=KRW"),
    );
    expect((await response.json()).data.cashBuyingPower).toBe("0");
  });

  it("fails closed without a selected account", async () => {
    const response = await handler("getCommissions", null)(
      request("/api/v1/order-info/commissions"),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("ACCOUNT_NOT_SELECTED");
  });

  it.each([
    ["getBuyingPower" as const, "/api/v1/order-info/buying-power"],
    [
      "getBuyingPower" as const,
      "/api/v1/order-info/buying-power?currency=EUR",
    ],
    [
      "getSellableQuantity" as const,
      "/api/v1/order-info/sellable-quantity?symbol=AAPL&symbol=005930",
    ],
    ["getCommissions" as const, "/api/v1/order-info/commissions?x=1"],
  ])("rejects invalid %s query", async (operation, path) => {
    expect((await handler(operation)(request(path))).status).toBe(400);
  });

  it("requires authentication and loopback Host", async () => {
    expect(
      (
        await handler("getCommissions")(
          request("/api/v1/order-info/commissions", false),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handler("getCommissions")(
          request("/api/v1/order-info/commissions", true, "example.invalid"),
        )
      ).status,
    ).toBe(403);
  });
});
