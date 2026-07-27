import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LoginService,
  type LoginResult,
} from "../../src/application/auth/login-service";
import {
  LogoutPersistenceError,
  LogoutService,
} from "../../src/application/auth/logout-service";
import { SessionService } from "../../src/application/auth/session-service";
import { hashPassword } from "../../src/domain/auth/password";
import { hashCanonicalSessionToken } from "../../src/domain/auth/session-token";
import { SqliteLoginPersistence } from "../../src/infrastructure/auth/sqlite-login-persistence";
import { SqliteLogoutPersistence } from "../../src/infrastructure/auth/sqlite-logout-persistence";
import { SqliteSessionPersistence } from "../../src/infrastructure/auth/sqlite-session-persistence";
import {
  applyMigrations,
  closeDatabase,
  openDatabase,
  type AppDatabase,
} from "../../src/infrastructure/database/database";
import { SessionRepository } from "../../src/infrastructure/database/session-repository";
import { UserRepository } from "../../src/infrastructure/database/user-repository";
import { createLogoutHandler } from "../../app/api/v1/auth/logout/route";
import { createSessionHandler } from "../../app/api/v1/auth/session/route";
import { createAuthProxy } from "../../proxy";

const REQUEST_ID = "00000000-0000-4000-8000-000000000004";
const NOW = new Date("2026-07-27T12:00:00.000Z");
const FIRST_TOKEN = Buffer.alloc(32, 6).toString("base64url");
const SECOND_TOKEN = Buffer.alloc(32, 7).toString("base64url");

function logoutRequest(
  token?: string,
  overrides: {
    host?: string;
    origin?: string;
    contentType?: string;
  } = {},
): NextRequest {
  return new NextRequest("http://127.0.0.1:3000/api/v1/auth/logout", {
    method: "POST",
    headers: {
      Host: overrides.host ?? "127.0.0.1:3000",
      Origin: overrides.origin ?? "http://127.0.0.1:3000",
      "Content-Type": overrides.contentType ?? "application/json",
      ...(token ? { Cookie: `my_wts_session=${token}` } : {}),
    },
  });
}

function sessionRequest(token: string): NextRequest {
  return new NextRequest("http://127.0.0.1:3000/api/v1/auth/session", {
    headers: {
      Host: "127.0.0.1:3000",
      Cookie: `my_wts_session=${token}`,
    },
  });
}

describe("POST /api/v1/auth/logout", () => {
  let temporaryDirectory: string;
  let database: AppDatabase;
  let logoutService: LogoutService;
  let sessionService: SessionService;
  let firstLogin: LoginResult;
  let secondLogin: LoginResult;

  beforeEach(async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "my-wts-logout-"));
    database = openDatabase(join(temporaryDirectory, "test.sqlite3"));
    applyMigrations(database);
    new UserRepository(database).create({
      id: "usr_logout_test",
      username: "Local.User",
      usernameNormalized: "local.user",
      displayName: "로컬 사용자",
      passwordHash: await hashPassword("x".repeat(10)),
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    firstLogin = await createLogin(FIRST_TOKEN, "first");
    secondLogin = await createLogin(SECOND_TOKEN, "second");
    logoutService = new LogoutService(new SqliteLogoutPersistence(database));
    sessionService = new SessionService(
      new SqliteSessionPersistence(database),
      { now: () => new Date("2026-07-27T13:00:00.000Z") },
    );
  });

  afterEach(() => {
    closeDatabase(database);
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  async function createLogin(token: string, id: string): Promise<LoginResult> {
    return new LoginService(new SqliteLoginPersistence(database), {
      now: () => NOW,
      createId: () => id,
      createToken: () => token,
    }).login({
      username: "local.user",
      password: "x".repeat(10),
    });
  }

  it("deletes only the current session and expires the frozen cookie", async () => {
    const handler = createLogoutHandler(logoutService, () => REQUEST_ID);
    const response = await handler(logoutRequest(firstLogin.session.token));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("my_wts_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(cookie).not.toContain("Secure");

    const repository = new SessionRepository(database);
    expect(
      repository.findByTokenHash(
        hashCanonicalSessionToken(firstLogin.session.token) ?? "",
      ),
    ).toBeUndefined();
    expect(
      repository.findByTokenHash(
        hashCanonicalSessionToken(secondLogin.session.token) ?? "",
      ),
    ).toBeDefined();
  });

  it("blocks session reuse in the BFF and proxy while preserving another session", async () => {
    const logoutHandler = createLogoutHandler(logoutService, () => REQUEST_ID);
    await logoutHandler(logoutRequest(FIRST_TOKEN));

    const sessionHandler = createSessionHandler(
      sessionService,
      () => REQUEST_ID,
    );
    expect((await sessionHandler(sessionRequest(FIRST_TOKEN))).status).toBe(
      401,
    );
    expect((await sessionHandler(sessionRequest(SECOND_TOKEN))).status).toBe(
      200,
    );

    const proxy = createAuthProxy(sessionService);
    const revokedPage = proxy(
      new NextRequest("http://127.0.0.1:3000/portfolio", {
        headers: { Cookie: `my_wts_session=${FIRST_TOKEN}` },
      }),
    );
    const otherSessionPage = proxy(
      new NextRequest("http://127.0.0.1:3000/portfolio", {
        headers: { Cookie: `my_wts_session=${SECOND_TOKEN}` },
      }),
    );
    expect(revokedPage.status).toBe(307);
    expect(new URL(revokedPage.headers.get("location") ?? "").pathname).toBe(
      "/login",
    );
    expect(otherSessionPage.status).toBe(200);
  });

  it("returns AUTH_REQUIRED and clears invalid, absent, and repeated cookies", async () => {
    const handler = createLogoutHandler(logoutService, () => REQUEST_ID);
    const unregisteredToken = Buffer.alloc(32, 8).toString("base64url");

    for (const token of [undefined, "invalid", unregisteredToken]) {
      const response = await handler(logoutRequest(token));
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("AUTH_REQUIRED");
      expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    }

    expect((await handler(logoutRequest(FIRST_TOKEN))).status).toBe(204);
    const repeated = await handler(logoutRequest(FIRST_TOKEN));
    expect(repeated.status).toBe(401);
    expect((await repeated.json()).error.code).toBe("AUTH_REQUIRED");
    expect(repeated.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects invalid Host, Origin, and Content-Type without deleting the session", async () => {
    const handler = createLogoutHandler(logoutService, () => REQUEST_ID);

    expect(
      (
        await handler(
          logoutRequest(FIRST_TOKEN, {
            host: "localhost:3000",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handler(
          logoutRequest(FIRST_TOKEN, {
            origin: "http://localhost:3000",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handler(
          logoutRequest(FIRST_TOKEN, {
            contentType: "text/plain",
          }),
        )
      ).status,
    ).toBe(400);

    expect(() => sessionService.authenticate(FIRST_TOKEN)).not.toThrow();
  });

  it("does not clear the cookie or log auth data when deletion fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const handler = createLogoutHandler(
      {
        logout: () => {
          throw new LogoutPersistenceError();
        },
      },
      () => REQUEST_ID,
    );
    const response = await handler(logoutRequest(FIRST_TOKEN));
    const serializedBody = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(serializedBody).toContain("DATABASE_ERROR");
    expect(serializedBody).not.toMatch(
      /password|token|hash|salt|stack|sqlite|path|sql/i,
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
