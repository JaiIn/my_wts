import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import {
  createAccountBffHandler,
  type AccountAuthenticationContext,
} from "../../src/application/account/account-route";
import {
  AccountProviderError,
  type AccountProvider,
} from "../../src/application/account/account-provider";
import { SessionAuthenticationError } from "../../src/application/auth/session-service";
import { AccountRefRegistry } from "../../src/infrastructure/account/account-ref-registry";
import {
  MOCK_EMPTY_ACCOUNTS_ENVELOPE,
  MOCK_MULTIPLE_ACCOUNTS_ENVELOPE,
  MOCK_SINGLE_ACCOUNT_ENVELOPE,
} from "../../src/infrastructure/account/mock-account-fixtures";
import { createMockAccountProvider } from "../../src/infrastructure/account/mock-account-provider";
import { TossHttpClientError } from "../../src/infrastructure/toss/readonly-http-client";

const REQUEST_ID = "00000000-0000-4000-8000-000000000501";
const NOW = new Date("2026-07-30T05:00:00.000Z");
const SESSION = "fixture-session-0501";
let referenceIndex = 0;

function request(
  path = "/api/v1/accounts",
  options: { authenticated?: boolean; host?: string } = {},
) {
  return new NextRequest(`http://127.0.0.1:3000${path}`, {
    headers: {
      Host: options.host ?? "127.0.0.1:3000",
      ...(options.authenticated === false
        ? {}
        : { Cookie: `my_wts_session=${SESSION}` }),
    },
  });
}

function handler(
  provider: AccountProvider = createMockAccountProvider(),
  authentication: AccountAuthenticationContext = {
    userId: "usr_fixture",
    tokenHash: "hash_fixture",
    sessionScope: "session-scope-fixture",
  },
) {
  const registry = new AccountRefRegistry(
    () => `acct_contract_reference_${++referenceIndex}`,
  );
  return createAccountBffHandler({
    provider: () => ({ implementation: provider, name: "mock" }),
    authenticator: {
      authenticate(token) {
        if (token !== SESSION) {
          throw new SessionAuthenticationError("AUTH_REQUIRED");
        }
        return authentication;
      },
    },
    registry,
    createRequestId: () => REQUEST_ID,
    now: () => NOW,
  });
}

describe("GET /api/v1/accounts contract", () => {
  it.each([
    ["empty", MOCK_EMPTY_ACCOUNTS_ENVELOPE, 0],
    ["single", MOCK_SINGLE_ACCOUNT_ENVELOPE, 1],
    ["multiple", MOCK_MULTIPLE_ACCOUNTS_ENVELOPE, 3],
  ])("returns a safe %s account list", async (_label, fixture, count) => {
    const response = await handler(createMockAccountProvider(fixture))(
      request(),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    expect(body.meta).toEqual({
      requestId: REQUEST_ID,
      fetchedAt: NOW.toISOString(),
      stale: false,
    });
    expect(body.data.accounts).toHaveLength(count);
    for (const account of body.data.accounts) {
      expect(Object.keys(account).sort()).toEqual(
        ["accountRef", "accountType", "maskedAccountNo", "selected"].sort(),
      );
      expect(account.maskedAccountNo).toMatch(/^\*{7}\d{4}$/);
      expect(account.selected).toBe(false);
    }
    expect(JSON.stringify(body)).not.toMatch(
      /00000001234|00000005678|00000009012|accountSeq|password|authorization|cookie|sqlite|stack/i,
    );
  });

  it("keeps unknown account types and never auto-selects", async () => {
    const body = await (await handler()(request())).json();
    expect(body.data.accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountType: "FUTURE_ACCOUNT_TYPE",
          selected: false,
        }),
      ]),
    );
  });

  it.each(["?unknown=1", "?x=1&x=2", "?bad=%ZZ"])(
    "rejects unknown, duplicate, and malformed query without provider access: %s",
    async (query) => {
      const getAccounts = vi.fn();
      const response = await handler({ getAccounts })(
        request(`/api/v1/accounts${query}`),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
      expect(getAccounts).not.toHaveBeenCalled();
    },
  );

  it("requires a validated session and loopback Host", async () => {
    const unauthenticated = await handler()(
      request("/api/v1/accounts", { authenticated: false }),
    );
    const forbidden = await handler()(
      request("/api/v1/accounts", { host: "example.invalid" }),
    );
    expect(unauthenticated.status).toBe(401);
    expect((await unauthenticated.json()).error.code).toBe("AUTH_REQUIRED");
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).error.code).toBe("UPSTREAM_FORBIDDEN");
  });

  it("maps provider and readonly-client failures without raw details", async () => {
    const cases: Array<[unknown, number, string, string | null]> = [
      [
        new AccountProviderError("UPSTREAM_INVALID_RESPONSE"),
        502,
        "UPSTREAM_INVALID_RESPONSE",
        null,
      ],
      [
        new TossHttpClientError(
          "TOSS_GET_RATE_LIMITED",
          true,
          "getAccounts",
          429,
          12_000,
        ),
        429,
        "UPSTREAM_RATE_LIMITED",
        "12",
      ],
    ];
    for (const [error, status, code, retryAfter] of cases) {
      const response = await handler({
        getAccounts: vi.fn().mockRejectedValue(error),
      })(request());
      const serialized = JSON.stringify(await response.json());
      expect(response.status).toBe(status);
      expect(serialized).toContain(code);
      expect(response.headers.get("retry-after")).toBe(retryAfter);
      expect(serialized).not.toMatch(
        /accountSeq|00000001234|authorization|cookie|sqlite|stack/i,
      );
    }
  });

  it("reuses references in one session and isolates separate sessions", async () => {
    const provider = createMockAccountProvider(MOCK_SINGLE_ACCOUNT_ENVELOPE);
    let index = 0;
    const registry = new AccountRefRegistry(
      () => `acct_session_reference_${++index}`,
    );
    const create = (sessionScope: string) =>
      createAccountBffHandler({
        provider: () => ({ implementation: provider, name: "mock" }),
        authenticator: {
          authenticate: () => ({
            userId: "usr_fixture",
            tokenHash: `hash-${sessionScope}`,
            sessionScope,
          }),
        },
        registry,
        createRequestId: () => REQUEST_ID,
        now: () => NOW,
      });
    const first = await (await create("a")(request())).json();
    const repeated = await (await create("a")(request())).json();
    const other = await (await create("b")(request())).json();
    expect(first.data.accounts[0].accountRef).toBe(
      repeated.data.accounts[0].accountRef,
    );
    expect(other.data.accounts[0].accountRef).not.toBe(
      first.data.accounts[0].accountRef,
    );
  });

  it("projects only a registry-validated selected reference", async () => {
    const provider = createMockAccountProvider(MOCK_SINGLE_ACCOUNT_ENVELOPE);
    const registry = new AccountRefRegistry(
      () => "acct_selected_contract_00000001",
    );
    const selection = {
      resolveCurrent: vi.fn(() => ({
        accountRef: "acct_selected_contract_00000001",
        accountSeq: 101,
      })),
    };
    const response = await createAccountBffHandler({
      provider: () => ({ implementation: provider, name: "mock" }),
      authenticator: {
        authenticate: () => ({
          userId: "usr_fixture",
          tokenHash: "hash_fixture",
          sessionScope: "scope_fixture",
        }),
      },
      registry,
      selection,
      createRequestId: () => REQUEST_ID,
      now: () => NOW,
    })(request());
    const body = await response.json();
    expect(body.data.accounts[0]).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(JSON.stringify(body)).not.toMatch(
      /accountSeq|["']accountNo["']\s*:/i,
    );
  });
});
