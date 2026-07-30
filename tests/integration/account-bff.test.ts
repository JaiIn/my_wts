import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAccountBffHandler } from "../../src/application/account/account-route";
import { createHoldingsBffHandler } from "../../src/application/account/holdings-route";
import { AccountSelectionService } from "../../src/application/account/account-selection-service";
import { createAccountSelectionHandlers } from "../../src/application/account/account-selection-route";
import { LoginService } from "../../src/application/auth/login-service";
import { LogoutService } from "../../src/application/auth/logout-service";
import { SessionService } from "../../src/application/auth/session-service";
import { hashPassword } from "../../src/domain/auth/password";
import { hashCanonicalSessionToken } from "../../src/domain/auth/session-token";
import { AccountRefRegistry } from "../../src/infrastructure/account/account-ref-registry";
import { SqliteLoginPersistence } from "../../src/infrastructure/auth/sqlite-login-persistence";
import { SqliteLogoutPersistence } from "../../src/infrastructure/auth/sqlite-logout-persistence";
import { SqliteSessionPersistence } from "../../src/infrastructure/auth/sqlite-session-persistence";
import {
  applyMigrations,
  closeDatabase,
  openDatabase,
  type AppDatabase,
} from "../../src/infrastructure/database/database";
import { UserRepository } from "../../src/infrastructure/database/user-repository";
import { createMockAccountProvider } from "../../src/infrastructure/account/mock-account-provider";
import { createMockHoldingsProvider } from "../../src/infrastructure/account/mock-holdings-provider";
import { SqliteAccountSelectionPersistence } from "../../src/infrastructure/account/sqlite-account-selection-persistence";
import { SessionRepository } from "../../src/infrastructure/database/session-repository";
import { createAuthProxy } from "../../proxy";

const NOW = new Date("2026-07-30T06:00:00.000Z");
const REQUEST_ID = "00000000-0000-4000-8000-000000000501";

describe("account BFF session integration", () => {
  let temporaryDirectory: string;
  let database: AppDatabase;
  let sessionService: SessionService;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "my-wts-account-bff-"));
    database = openDatabase(join(temporaryDirectory, "test.sqlite3"));
    applyMigrations(database);
    sessionService = new SessionService(
      new SqliteSessionPersistence(database),
      { now: () => NOW },
    );
  });

  afterEach(() => {
    closeDatabase(database);
    rmSync(temporaryDirectory, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("serves isolated process-memory references after SQLite session validation", async () => {
    const firstToken = await createUserAndSession("first", 51);
    const secondToken = await createUserAndSession("second", 52);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    let referenceIndex = 0;
    const registry = new AccountRefRegistry(
      () => `acct_integration_reference_${++referenceIndex}`,
    );
    const handler = createAccountBffHandler({
      provider: () => ({
        name: "mock",
        implementation: createMockAccountProvider(),
      }),
      authenticator: {
        authenticate(token) {
          const user = sessionService.authenticate(token);
          const sessionScope = hashCanonicalSessionToken(token);
          if (!sessionScope) throw new Error("INVALID_TEST_SCOPE");
          return { userId: user.id, tokenHash: sessionScope, sessionScope };
        },
      },
      registry,
      createRequestId: () => REQUEST_ID,
      now: () => NOW,
    });

    const first = await (await handler(request(firstToken))).json();
    const repeated = await (await handler(request(firstToken))).json();
    const second = await (await handler(request(secondToken))).json();
    expect(first.data.accounts).toHaveLength(3);
    expect(first.data.accounts[0].accountRef).toBe(
      repeated.data.accounts[0].accountRef,
    );
    expect(second.data.accounts[0].accountRef).not.toBe(
      first.data.accounts[0].accountRef,
    );
    expect(JSON.stringify(first)).not.toMatch(
      /accountSeq|00000001234|00000005678|00000009012/i,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks missing, modified, and expired sessions before provider access", async () => {
    const token = await createUserAndSession("blocked", 53);
    const getAccounts = vi.fn();
    const handler = createAccountBffHandler({
      provider: () => ({
        name: "mock",
        implementation: { getAccounts },
      }),
      authenticator: {
        authenticate(candidate) {
          const user = sessionService.authenticate(candidate);
          return {
            userId: user.id,
            tokenHash: "hash-scope",
            sessionScope: "scope",
          };
        },
      },
      registry: new AccountRefRegistry(),
      createRequestId: () => REQUEST_ID,
      now: () => NOW,
    });

    for (const candidate of [
      undefined,
      `${token.slice(0, -1)}A`,
      Buffer.alloc(32, 99).toString("base64url"),
    ]) {
      const response = await handler(request(candidate));
      expect(response.status).toBe(401);
    }
    database.$client
      .prepare("UPDATE sessions SET expires_at = ?")
      .run("2026-07-30T05:59:59.000Z");
    expect((await handler(request(token))).status).toBe(401);
    expect(getAccounts).not.toHaveBeenCalled();
  });

  it("protects /settings with the existing proxy boundary", async () => {
    const token = await createUserAndSession("settings", 54);
    const proxy = createAuthProxy(sessionService);
    const allowed = proxy(pageRequest("/settings", token));
    const redirected = proxy(pageRequest("/settings"));
    expect(allowed.status).toBe(200);
    expect(redirected.status).toBe(307);
    expect(redirected.headers.get("location")).toContain(
      "/login?next=%2Fsettings",
    );
    expect(proxy(pageRequest("/portfolio", token)).status).toBe(200);
    expect(proxy(pageRequest("/portfolio")).headers.get("location")).toContain(
      "/login?next=%2Fportfolio",
    );
  });

  it("resolves the current session selection server-side before serving holdings", async () => {
    const token = await createUserAndSession("holdings", 58);
    const registry = new AccountRefRegistry(
      () => "acct_holdings_integration_000001",
    );
    const selection = new AccountSelectionService(
      { authenticate: (candidate) => sessionService.authenticate(candidate) },
      new SqliteAccountSelectionPersistence(database),
      registry,
    );
    const context = selection.authenticate(token);
    const accountRef = registry
      .reconcile(context.sessionScope, [
        {
          accountNo: "00000001234",
          accountSeq: 101,
          accountType: "BROKERAGE",
        },
      ])
      .get(101)!;
    selection.select(token, accountRef);
    const getHoldings = vi.fn(createMockHoldingsProvider().getHoldings);
    const handler = createHoldingsBffHandler({
      provider: () => ({
        name: "mock",
        implementation: { getHoldings },
      }),
      selection,
      createRequestId: () => REQUEST_ID,
      now: () => NOW,
    });
    const response = await handler(
      new NextRequest(
        "http://127.0.0.1:3000/api/v1/portfolio/holdings",
        {
          headers: {
            Host: "127.0.0.1:3000",
            Cookie: `my_wts_session=${token}`,
          },
        },
      ),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(getHoldings).toHaveBeenCalledWith(101, undefined);
    expect(body.data.items).toHaveLength(2);
    expect(JSON.stringify(body)).not.toMatch(
      /accountSeq|accountRef|00000001234|authorization|cookie/i,
    );

    selection.clear(token);
    const blocked = await handler(
      new NextRequest(
        "http://127.0.0.1:3000/api/v1/portfolio/holdings",
        {
          headers: {
            Host: "127.0.0.1:3000",
            Cookie: `my_wts_session=${token}`,
          },
        },
      ),
    );
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error.code).toBe("ACCOUNT_NOT_SELECTED");
  });

  it("persists explicit selection per session, rejects cross-session refs, clears, and survives logout safely", async () => {
    const firstToken = await createUserAndSession("selection", 55);
    const secondToken = Buffer.alloc(32, 56).toString("base64url");
    await new LoginService(new SqliteLoginPersistence(database), {
      now: () => NOW,
      createId: () => "session-selection-second",
      createToken: () => secondToken,
    }).login({
      username: "account.selection",
      password: "x".repeat(10),
    });
    const registry = new AccountRefRegistry(
      (() => {
        let index = 0;
        return () => `acct_integration_selection_${++index}`.padEnd(32, "0");
      })(),
    );
    const selection = new AccountSelectionService(
      { authenticate: (token) => sessionService.authenticate(token) },
      new SqliteAccountSelectionPersistence(database),
      registry,
    );
    const firstContext = selection.authenticate(firstToken);
    const secondContext = selection.authenticate(secondToken);
    const accounts = [
      {
        accountNo: "00000001234",
        accountSeq: 101,
        accountType: "BROKERAGE",
      },
      {
        accountNo: "00000005678",
        accountSeq: 202,
        accountType: "PENSION_SAVINGS",
      },
    ];
    const firstRefs = registry.reconcile(firstContext.sessionScope, accounts);
    const secondRefs = registry.reconcile(secondContext.sessionScope, accounts);
    const firstRef = firstRefs.get(101)!;
    const secondRef = secondRefs.get(202)!;
    const handlers = createAccountSelectionHandlers(
      selection,
      () => REQUEST_ID,
    );

    expect(
      (
        await handlers.PUT(
          selectionRequest("PUT", firstToken, { accountRef: firstRef }),
        )
      ).status,
    ).toBe(204);
    expect(
      (
        await handlers.PUT(
          selectionRequest("PUT", secondToken, { accountRef: secondRef }),
        )
      ).status,
    ).toBe(204);
    expect(
      new SessionRepository(database).findByTokenHash(
        hashCanonicalSessionToken(firstToken)!,
      )?.selectedAccountRef,
    ).toBe(firstRef);
    expect(
      new SessionRepository(database).findByTokenHash(
        hashCanonicalSessionToken(secondToken)!,
      )?.selectedAccountRef,
    ).toBe(secondRef);

    const crossSession = await handlers.PUT(
      selectionRequest("PUT", secondToken, { accountRef: firstRef }),
    );
    expect(crossSession.status).toBe(409);
    expect((await crossSession.json()).error.code).toBe("ACCOUNT_REF_INVALID");

    expect(
      (await handlers.DELETE(selectionRequest("DELETE", firstToken))).status,
    ).toBe(204);
    expect(selection.resolveCurrent(firstContext)).toBeNull();
    expect(selection.resolveCurrent(secondContext)?.accountRef).toBe(secondRef);

    new LogoutService(new SqliteLogoutPersistence(database)).logout(
      secondToken,
    );
    expect(
      new SessionRepository(database).findByTokenHash(
        hashCanonicalSessionToken(secondToken)!,
      ),
    ).toBeUndefined();
  });

  it("clears a stale process-memory reference while keeping the login session valid", async () => {
    const token = await createUserAndSession("restart", 57);
    const persistence = new SqliteAccountSelectionPersistence(database);
    const originalRegistry = new AccountRefRegistry(
      () => "acct_restart_reference_000000001",
    );
    const original = new AccountSelectionService(
      { authenticate: (candidate) => sessionService.authenticate(candidate) },
      persistence,
      originalRegistry,
    );
    const context = original.authenticate(token);
    const accountRef = originalRegistry
      .reconcile(context.sessionScope, [
        {
          accountNo: "00000001234",
          accountSeq: 101,
          accountType: "BROKERAGE",
        },
      ])
      .get(101)!;
    original.select(token, accountRef);

    const restarted = new AccountSelectionService(
      { authenticate: (candidate) => sessionService.authenticate(candidate) },
      persistence,
      new AccountRefRegistry(),
    );
    expect(restarted.resolveCurrent(context)).toBeNull();
    expect(sessionService.authenticate(token).id).toBe("usr_account_restart");
  });

  function request(token?: string) {
    return new NextRequest("http://127.0.0.1:3000/api/v1/accounts", {
      headers: {
        Host: "127.0.0.1:3000",
        ...(token ? { Cookie: `my_wts_session=${token}` } : {}),
      },
    });
  }

  function pageRequest(path: string, token?: string) {
    return new NextRequest(`http://127.0.0.1:3000${path}`, {
      headers: token ? { Cookie: `my_wts_session=${token}` } : {},
    });
  }

  function selectionRequest(
    method: "PUT" | "DELETE",
    token: string,
    body?: { accountRef: string },
  ) {
    return new NextRequest("http://127.0.0.1:3000/api/v1/session/account", {
      method,
      headers: {
        Host: "127.0.0.1:3000",
        Origin: "http://127.0.0.1:3000",
        Cookie: `my_wts_session=${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async function createUserAndSession(label: string, tokenByte: number) {
    const username = `account.${label}`;
    new UserRepository(database).create({
      id: `usr_account_${label}`,
      username,
      usernameNormalized: username,
      displayName: `Account ${label}`,
      passwordHash: await hashPassword("x".repeat(10)),
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    const token = Buffer.alloc(32, tokenByte).toString("base64url");
    const result = await new LoginService(
      new SqliteLoginPersistence(database),
      {
        now: () => NOW,
        createId: () => `session-${label}`,
        createToken: () => token,
      },
    ).login({ username, password: "x".repeat(10) });
    return result.session.token;
  }
});
