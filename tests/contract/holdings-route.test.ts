import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import {
  createHoldingsBffHandler,
} from "../../src/application/account/holdings-route";
import { SessionAuthenticationError } from "../../src/application/auth/session-service";
import { createMockHoldingsProvider } from "../../src/infrastructure/account/mock-holdings-provider";

const SESSION = "holdings-contract-session";
const REQUEST_ID = "00000000-0000-4000-8000-000000000504";
const NOW = new Date("2026-07-30T05:04:00.000Z");

function request(
  path = "/api/v1/portfolio/holdings",
  options: { authenticated?: boolean; host?: string; body?: string } = {},
) {
  return new NextRequest(`http://127.0.0.1:3000${path}`, {
    method: "GET",
    headers: {
      Host: options.host ?? "127.0.0.1:3000",
      ...(options.authenticated === false
        ? {}
        : { Cookie: `my_wts_session=${SESSION}` }),
      ...(options.body ? { "Content-Length": String(options.body.length) } : {}),
    },
  });
}

function handler(accountSeq: number | null = 101) {
  const getHoldings = vi.fn(
    createMockHoldingsProvider().getHoldings,
  );
  return {
    getHoldings,
    handle: createHoldingsBffHandler({
      provider: () => ({
        implementation: { getHoldings },
        name: "mock",
      }),
      selection: {
        authenticate(token) {
          if (token !== SESSION) {
            throw new SessionAuthenticationError("AUTH_REQUIRED");
          }
          return {
            userId: "usr_holdings",
            tokenHash: "hash_holdings",
            sessionScope: "scope_holdings",
          };
        },
        resolveCurrent: () =>
          accountSeq === null
            ? null
            : { accountRef: "acct_contract_holdings_ref", accountSeq },
      },
      createRequestId: () => REQUEST_ID,
      now: () => NOW,
    }),
  };
}

describe("GET /api/v1/portfolio/holdings contract", () => {
  it("returns safe deterministic holdings with no-store", async () => {
    const response = await handler().handle(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    expect(body.meta.requestId).toBe(REQUEST_ID);
    expect(body.data.items.map((item: { symbol: string }) => item.symbol)).toEqual([
      "005930",
      "AAPL",
    ]);
    expect(body.data.items[0].quantity).toBe("9007199254740993");
    expect(JSON.stringify(body)).not.toMatch(
      /accountSeq|accountRef|accountNo|commission|tax|authorization|cookie|stack|sqlite/i,
    );
  });

  it("returns normal empty and filters an allowed symbol", async () => {
    const empty = await handler(202).handle(request());
    expect((await empty.json()).data.items).toEqual([]);
    const selected = handler();
    const filtered = await selected.handle(
      request("/api/v1/portfolio/holdings?symbol=aapl"),
    );
    expect(filtered.status).toBe(200);
    expect(selected.getHoldings).toHaveBeenCalledWith(101, "AAPL");
  });

  it("fails closed when no account is selected", async () => {
    const selected = handler(null);
    const response = await selected.handle(request());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("ACCOUNT_NOT_SELECTED");
    expect(selected.getHoldings).not.toHaveBeenCalled();
  });

  it.each([
    ["/api/v1/portfolio/holdings?unknown=1", 400],
    ["/api/v1/portfolio/holdings?symbol=AAPL&symbol=005930", 400],
    ["/api/v1/portfolio/holdings?symbol=%ZZ", 400],
  ])("rejects invalid query before provider: %s", async (path, status) => {
    const selected = handler();
    const response = await selected.handle(request(path));
    expect(response.status).toBe(status);
    expect(selected.getHoldings).not.toHaveBeenCalled();
  });

  it("requires an authenticated session and loopback host", async () => {
    expect(
      (
        await handler().handle(
          request("/api/v1/portfolio/holdings", {
            authenticated: false,
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handler().handle(
          request("/api/v1/portfolio/holdings", { host: "example.invalid" }),
        )
      ).status,
    ).toBe(403);
  });
});
