import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { SessionAuthenticationError } from "../../src/application/auth/session-service";
import { OrderHistoryProviderError } from "../../src/application/orders/order-history-provider";
import { createOrderDetailBffHandler } from "../../src/application/orders/order-detail-route";
import { createMockOrderHistoryProvider } from "../../src/infrastructure/orders/mock-order-history-provider";
import { TossHttpClientError } from "../../src/infrastructure/toss/readonly-http-client";

const SESSION = "order-detail-contract-session";
const REQUEST_ID = "00000000-0000-4000-8000-000000000603";
const NOW = new Date("2026-07-31T04:00:00.000Z");

function request(query = "", authenticated = true, host = "127.0.0.1:3000") {
  return new NextRequest(
    `http://127.0.0.1:3000/api/v1/orders/fixture-order-3${query}`,
    {
      headers: {
        Host: host,
        ...(authenticated ? { Cookie: `my_wts_session=${SESSION}` } : {}),
      },
    },
  );
}

function context(orderId: string) {
  return { params: Promise.resolve({ orderId }) };
}

function handler(options?: {
  accountSeq?: number | null;
  provider?: ReturnType<typeof createMockOrderHistoryProvider>;
}) {
  const implementation = options?.provider ?? createMockOrderHistoryProvider();
  return createOrderDetailBffHandler({
    provider: () => ({ implementation, name: "mock" }),
    selection: {
      authenticate(token) {
        if (token !== SESSION) {
          throw new SessionAuthenticationError("AUTH_REQUIRED");
        }
        return {
          userId: "usr_order_detail",
          tokenHash: "hash_order_detail",
          sessionScope: "scope_order_detail",
        };
      },
      resolveCurrent() {
        const accountSeq =
          options && "accountSeq" in options ? options.accountSeq : 101;
        return accountSeq === null || accountSeq === undefined
          ? null
          : { accountRef: "opaque-not-returned", accountSeq };
      },
    },
    createRequestId: () => REQUEST_ID,
    now: () => NOW,
  });
}

describe("GET /api/v1/orders/{orderId} contract", () => {
  it("returns safe execution detail with no-store metadata", async () => {
    const response = await handler()(request(), context("fixture-order-3"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    expect(body.data.status.code).toBe("PARTIAL_FILLED");
    expect(body.data.execution.filledQuantity).not.toBe("0");
    expect(body.meta).toEqual({
      requestId: REQUEST_ID,
      fetchedAt: NOW.toISOString(),
      stale: false,
    });
    expect(JSON.stringify(body)).not.toMatch(
      /accountSeq|accountRef|accountNo|authorization|cookie|sqlite|stack/i,
    );
  });

  it("returns the same safe 404 for missing and cross-account ids", async () => {
    for (const [accountSeq, orderId] of [
      [101, "missing-order"],
      [202, "fixture-order-3"],
    ] as const) {
      const response = await handler({ accountSeq })(
        request(),
        context(orderId),
      );
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("UPSTREAM_NOT_FOUND");
    }
  });

  it.each([
    ["", "%2Forders"],
    ["", "%252Forders"],
    ["", ".."],
    ["?unexpected=1", "fixture-order-3"],
  ])("rejects invalid path/query before provider", async (query, orderId) => {
    const getOrder = vi.fn();
    const provider = {
      getOrders: vi.fn(),
      getOrder,
    };
    const response = await handler({ provider: provider as never })(
      request(query),
      context(orderId),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
    expect(getOrder).not.toHaveBeenCalled();
  });

  it("requires authentication, loopback host, and selected account", async () => {
    expect(
      (await handler()(request("", false), context("fixture-order-3"))).status,
    ).toBe(401);
    expect(
      (
        await handler()(
          request("", true, "example.invalid"),
          context("fixture-order-3"),
        )
      ).status,
    ).toBe(403);
    const unselected = await handler({ accountSeq: null })(
      request(),
      context("fixture-order-3"),
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
      getOrders: vi.fn(),
      getOrder: vi.fn().mockRejectedValue(new OrderHistoryProviderError(code)),
    };
    const response = await handler({ provider: provider as never })(
      request(),
      context("fixture-order-3"),
    );
    expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toMatch(
      /fixture-order|accountSeq|raw|sqlite|stack/i,
    );
  });

  it("preserves only a validated Retry-After value", async () => {
    const provider = {
      getOrders: vi.fn(),
      getOrder: vi
        .fn()
        .mockRejectedValue(
          new TossHttpClientError(
            "TOSS_GET_RATE_LIMITED",
            true,
            "getOrder",
            429,
            3_000,
          ),
        ),
    };
    const response = await handler({ provider: provider as never })(
      request(),
      context("fixture-order-3"),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("3");
  });
});
