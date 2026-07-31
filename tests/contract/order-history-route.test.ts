import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { AccountNotSelectedError } from "../../src/application/account/holdings-route";
import { SessionAuthenticationError } from "../../src/application/auth/session-service";
import { OrderHistoryProviderError } from "../../src/application/orders/order-history-provider";
import { createOrderHistoryBffHandler } from "../../src/application/orders/order-history-route";
import { createMockOrderHistoryProvider } from "../../src/infrastructure/orders/mock-order-history-provider";

const SESSION = "order-history-contract-session";
const REQUEST_ID = "00000000-0000-4000-8000-000000000602";
const NOW = new Date("2026-07-31T03:00:00.000Z");

function request(query: string, authenticated = true, host = "127.0.0.1:3000") {
  return new NextRequest(`http://127.0.0.1:3000/api/v1/orders${query}`, {
    headers: {
      Host: host,
      ...(authenticated ? { Cookie: `my_wts_session=${SESSION}` } : {}),
    },
  });
}

function handler(options?: {
  accountSeq?: number | null;
  provider?: ReturnType<typeof createMockOrderHistoryProvider>;
}) {
  const implementation = options?.provider ?? createMockOrderHistoryProvider();
  return createOrderHistoryBffHandler({
    provider: () => ({
      implementation,
      name: "mock",
    }),
    selection: {
      authenticate(token) {
        if (token !== SESSION) {
          throw new SessionAuthenticationError("AUTH_REQUIRED");
        }
        return {
          userId: "usr_order_history",
          tokenHash: "hash_order_history",
          sessionScope: "scope_order_history",
        };
      },
      resolveCurrent() {
        const accountSeq =
          options && "accountSeq" in options ? options.accountSeq : 101;
        if (accountSeq === null) return null;
        if (accountSeq === undefined) return null;
        return { accountRef: "opaque-not-returned", accountSeq };
      },
    },
    createRequestId: () => REQUEST_ID,
    now: () => NOW,
  });
}

describe("GET /api/v1/orders contract", () => {
  it("returns all OPEN orders with the frozen no-pagination envelope", async () => {
    const response = await handler()(
      request("?status=OPEN&cursor=ignored&limit=1"),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    expect(body.data.orders).toHaveLength(5);
    expect(body.data.nextCursor).toBeNull();
    expect(body.data.hasNext).toBe(false);
    expect(body.meta).toEqual({
      requestId: REQUEST_ID,
      fetchedAt: NOW.toISOString(),
      stale: false,
      nextCursor: null,
    });
    expect(JSON.stringify(body)).not.toMatch(
      /accountSeq|accountRef|accountNo|authorization|cookie|sqlite|stack/i,
    );
  });

  it("returns stable CLOSED cursor pages and filters symbols and dates", async () => {
    const get = handler();
    const first = await (
      await get(
        request(
          "?status=CLOSED&symbol=TSTX&from=2026-01-01&to=2026-01-31&limit=2",
        ),
      )
    ).json();
    expect(first.data.orders).toHaveLength(2);
    expect(first.data.hasNext).toBe(true);
    const nextCursor = encodeURIComponent(first.data.nextCursor);
    const secondResponse = await get(
      request(
        `?status=CLOSED&symbol=TSTX&from=2026-01-01&to=2026-01-31&limit=2&cursor=${nextCursor}`,
      ),
    );
    const second = await secondResponse.json();
    expect(secondResponse.status).toBe(200);
    expect(
      new Set([
        ...first.data.orders.map((order: { orderId: string }) => order.orderId),
        ...second.data.orders.map(
          (order: { orderId: string }) => order.orderId,
        ),
      ]).size,
    ).toBe(first.data.orders.length + second.data.orders.length);
  });

  it.each([
    "",
    "?status=PENDING",
    "?status=OPEN&x=1",
    "?status=OPEN&status=CLOSED",
    "?status=CLOSED&limit=101",
    "?status=CLOSED&from=2026-02-02&to=2026-02-01",
  ])("returns safe 400 without provider access for %s", async (query) => {
    const getOrders = vi.fn();
    const response = await handler({
      provider: { getOrders } as never,
    })(request(query));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
    expect(getOrders).not.toHaveBeenCalled();
  });

  it("requires authentication, loopback host, and selected account", async () => {
    expect((await handler()(request("?status=OPEN", false))).status).toBe(401);
    expect(
      (await handler()(request("?status=OPEN", true, "orders.example.invalid")))
        .status,
    ).toBe(403);
    const unselected = await handler({ accountSeq: null })(
      request("?status=OPEN"),
    );
    expect(unselected.status).toBe(409);
    expect((await unselected.json()).error.code).toBe("ACCOUNT_NOT_SELECTED");
  });

  it.each([
    ["UPSTREAM_AUTH_FAILED", 502],
    ["UPSTREAM_RATE_LIMITED", 429],
    ["UPSTREAM_TIMEOUT", 504],
    ["UPSTREAM_UNAVAILABLE", 503],
    ["UPSTREAM_INVALID_RESPONSE", 502],
    ["UPSTREAM_UNKNOWN_ERROR", 502],
  ] as const)("maps %s to safe status %i", async (code, status) => {
    const provider = {
      getOrders: vi.fn().mockRejectedValue(new OrderHistoryProviderError(code)),
    };
    const response = await handler({ provider: provider as never })(
      request("?status=OPEN"),
    );
    const body = await response.json();
    expect(response.status).toBe(status);
    expect(body.error.code).toBe(code);
    expect(JSON.stringify(body)).not.toMatch(
      /orderId|symbol|cursor|accountSeq|raw|stack|sqlite/i,
    );
  });

  it("maps stale selection to the same safe unselected contract", async () => {
    const get = createOrderHistoryBffHandler({
      provider: () => ({
        implementation: createMockOrderHistoryProvider(),
        name: "mock",
      }),
      selection: {
        authenticate() {
          return {
            userId: "usr",
            tokenHash: "hash",
            sessionScope: "scope",
          };
        },
        resolveCurrent() {
          throw new AccountNotSelectedError();
        },
      },
      createRequestId: () => REQUEST_ID,
      now: () => NOW,
    });
    expect((await get(request("?status=OPEN"))).status).toBe(409);
  });
});
