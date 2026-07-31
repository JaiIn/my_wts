import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { SessionAuthenticationError } from "../../src/application/auth/session-service";
import { buildConditionalOrderDetailBffHandler } from "../../src/application/orders/conditional-order-detail-route";
import {
  ConditionalOrderProviderError,
  type ConditionalOrderHistoryProvider,
} from "../../src/application/orders/conditional-order-provider";
import { buildConditionalOrderHistoryBffHandler } from "../../src/application/orders/conditional-order-route";
import { createMockConditionalOrderProvider } from "../../src/infrastructure/orders/mock-conditional-order-provider";

const SESSION = "conditional-contract-session";
const REQUEST_ID = "00000000-0000-4000-8000-000000000604";
const NOW = new Date("2026-07-31T05:00:00.000Z");

function listRequest(
  query = "?status=OPEN",
  options: { authenticated?: boolean; host?: string; body?: boolean } = {},
) {
  return new NextRequest(
    `http://127.0.0.1:3000/api/v1/conditional-orders${query}`,
    {
      headers: {
        Host: options.host ?? "127.0.0.1:3000",
        ...(options.authenticated === false
          ? {}
          : { Cookie: `my_wts_session=${SESSION}` }),
        ...(options.body ? { "Content-Length": "2" } : {}),
      },
    },
  );
}

function detailRequest(
  query = "",
  options: { authenticated?: boolean; host?: string; body?: boolean } = {},
) {
  return new NextRequest(
    `http://127.0.0.1:3000/api/v1/conditional-orders/fixture-conditional-single${query}`,
    {
      headers: {
        Host: options.host ?? "127.0.0.1:3000",
        ...(options.authenticated === false
          ? {}
          : { Cookie: `my_wts_session=${SESSION}` }),
        ...(options.body ? { "Content-Length": "2" } : {}),
      },
    },
  );
}

function context(conditionalOrderId: string) {
  return { params: Promise.resolve({ conditionalOrderId }) };
}

function dependencies(options?: {
  accountSeq?: number | null;
  provider?: ConditionalOrderHistoryProvider;
}) {
  const implementation =
    options?.provider ?? createMockConditionalOrderProvider();

  return {
    provider: () => ({
      implementation,
      name: "mock" as const,
    }),
    selection: {
      authenticate(token: unknown) {
        if (token !== SESSION) {
          throw new SessionAuthenticationError("AUTH_REQUIRED");
        }
        return {
          userId: "usr_conditional_contract",
          tokenHash: "hash_conditional_contract",
          sessionScope: "scope_conditional_contract",
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
  };
}

describe("conditional order BFF contracts", () => {
  it.each(["OPEN", "CLOSED"] as const)(
    "returns paginated %s success with safe metadata",
    async (status) => {
      const response = await buildConditionalOrderHistoryBffHandler(
        dependencies(),
      )(listRequest(`?status=${status}&limit=2`));
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
      expect(body.data.conditionalOrders).toHaveLength(2);
      expect(body.data.hasNext).toBe(true);
      expect(body.meta).toEqual({
        requestId: REQUEST_ID,
        fetchedAt: NOW.toISOString(),
        stale: false,
        nextCursor: body.data.nextCursor,
      });
      expect(JSON.stringify(body)).not.toMatch(
        /accountSeq|accountRef|accountNo|authorization|cookie|sqlite|stack/i,
      );
    },
  );

  it("supports symbol filter and opaque next cursor", async () => {
    const handler = buildConditionalOrderHistoryBffHandler(dependencies());
    const first = await handler(listRequest("?status=OPEN&limit=1"));
    const firstBody = await first.json();
    expect(firstBody.data.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    const second = await handler(
      listRequest(
        `?status=OPEN&limit=1&cursor=${firstBody.data.nextCursor}`,
      ),
    );
    expect(second.status).toBe(200);
    expect((await second.json()).data.conditionalOrders).toHaveLength(1);
    const filtered = await handler(listRequest("?status=OPEN&symbol=TSTX"));
    expect(
      (await filtered.json()).data.conditionalOrders.every(
        (item: { symbol: string }) => item.symbol === "TSTX",
      ),
    ).toBe(true);
  });

  it("returns safe detail and identical 404 for missing/cross-account", async () => {
    const detail = await buildConditionalOrderDetailBffHandler(dependencies())(
      detailRequest(),
      context("fixture-conditional-single"),
    );
    expect(detail.status).toBe(200);
    expect((await detail.json()).data.type.code).toBe("SINGLE");
    for (const [accountSeq, id] of [
      [101, "missing-conditional"],
      [202, "fixture-conditional-single"],
    ] as const) {
      const response = await buildConditionalOrderDetailBffHandler(
        dependencies({ accountSeq }),
      )(detailRequest(), context(id));
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("UPSTREAM_NOT_FOUND");
    }
  });

  it("rejects invalid list/detail requests before provider", async () => {
    const provider = {
      getConditionalOrders: vi.fn(),
      getConditionalOrder: vi.fn(),
    };
    const listHandler = buildConditionalOrderHistoryBffHandler(
      dependencies({ provider }),
    );
    for (const request of [
      listRequest(""),
      listRequest("?status=OPEN&status=CLOSED"),
      listRequest("?status=OPEN&unexpected=1"),
      listRequest("?status=OPEN", { body: true }),
    ]) {
      expect((await listHandler(request)).status).toBe(400);
    }
    const detailHandler = buildConditionalOrderDetailBffHandler(
      dependencies({ provider }),
    );
    for (const [query, id] of [
      ["?unexpected=1", "safe-id"],
      ["", "%2Funsafe"],
      ["", "%252Funsafe"],
      ["", ".."],
    ]) {
      expect(
        (await detailHandler(detailRequest(query), context(id))).status,
      ).toBe(400);
    }
    expect(provider.getConditionalOrders).not.toHaveBeenCalled();
    expect(provider.getConditionalOrder).not.toHaveBeenCalled();
  });

  it("requires auth, loopback host, and explicit selection", async () => {
    const listHandler = buildConditionalOrderHistoryBffHandler(dependencies());
    expect(
      (await listHandler(listRequest("?status=OPEN", { authenticated: false })))
        .status,
    ).toBe(401);
    expect(
      (
        await listHandler(
          listRequest("?status=OPEN", { host: "example.invalid" }),
        )
      ).status,
    ).toBe(403);
    const unselected = await buildConditionalOrderHistoryBffHandler(
      dependencies({ accountSeq: null }),
    )(listRequest());
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
      getConditionalOrders: vi
        .fn()
        .mockRejectedValue(
          new ConditionalOrderProviderError(
            code,
            code === "UPSTREAM_RATE_LIMITED",
            code === "UPSTREAM_RATE_LIMITED" ? 7 : undefined,
          ),
        ),
      getConditionalOrder: vi.fn(),
    };
    const response = await buildConditionalOrderHistoryBffHandler(
      dependencies({ provider }),
    )(listRequest());
    expect(response.status).toBe(status);
    if (code === "UPSTREAM_RATE_LIMITED") {
      expect(response.headers.get("retry-after")).toBe("7");
    }
    expect(JSON.stringify(await response.json())).not.toMatch(
      /fixture-conditional|accountSeq|raw|sqlite|stack/i,
    );
  });
});
