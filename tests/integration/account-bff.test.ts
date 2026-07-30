import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAccountBffHandler } from "../../src/application/account/account-route";
import { LoginService } from "../../src/application/auth/login-service";
import { SessionService } from "../../src/application/auth/session-service";
import { hashPassword } from "../../src/domain/auth/password";
import { hashCanonicalSessionToken } from "../../src/domain/auth/session-token";
import { AccountRefRegistry } from "../../src/infrastructure/account/account-ref-registry";
import { SqliteLoginPersistence } from "../../src/infrastructure/auth/sqlite-login-persistence";
import { SqliteSessionPersistence } from "../../src/infrastructure/auth/sqlite-session-persistence";
import {
  applyMigrations,
  closeDatabase,
  openDatabase,
  type AppDatabase,
} from "../../src/infrastructure/database/database";
import { UserRepository } from "../../src/infrastructure/database/user-repository";
import { createMockAccountProvider } from "../../src/infrastructure/account/mock-account-provider";
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
          return { userId: user.id, sessionScope };
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
          return { userId: user.id, sessionScope: "scope" };
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
