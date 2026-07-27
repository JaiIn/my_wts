import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LoginService,
  type LoginResult,
} from "../../src/application/auth/login-service";
import { SessionPersistenceError } from "../../src/application/auth/session-service";
import { hashPassword } from "../../src/domain/auth/password";
import { SqliteLoginPersistence } from "../../src/infrastructure/auth/sqlite-login-persistence";
import { SqliteSessionPersistence } from "../../src/infrastructure/auth/sqlite-session-persistence";
import {
  applyMigrations,
  closeDatabase,
  openDatabase,
  type AppDatabase,
} from "../../src/infrastructure/database/database";
import { UserRepository } from "../../src/infrastructure/database/user-repository";
import { SessionService } from "../../src/application/auth/session-service";
import { createSessionHandler } from "../../app/api/v1/auth/session/route";

const REQUEST_ID = "00000000-0000-4000-8000-000000000003";
const NOW = new Date("2026-07-27T12:00:00.000Z");
const VALID_TOKEN = Buffer.alloc(32, 2).toString("base64url");

function sessionRequest(token?: string): NextRequest {
  return new NextRequest("http://127.0.0.1:3000/api/v1/auth/session", {
    headers: {
      Host: "127.0.0.1:3000",
      ...(token ? { Cookie: `my_wts_session=${token}` } : {}),
    },
  });
}

describe("GET /api/v1/auth/session", () => {
  let temporaryDirectory: string;
  let database: AppDatabase;
  let service: SessionService;
  let loginResult: LoginResult;

  beforeEach(async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "my-wts-session-"));
    database = openDatabase(join(temporaryDirectory, "test.sqlite3"));
    applyMigrations(database);
    new UserRepository(database).create({
      id: "usr_session_test",
      username: "Local.User",
      usernameNormalized: "local.user",
      displayName: "로컬 사용자",
      passwordHash: await hashPassword("x".repeat(10)),
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    loginResult = await new LoginService(new SqliteLoginPersistence(database), {
      now: () => NOW,
      createId: () => "session-test-id",
      createToken: () => VALID_TOKEN,
    }).login({
      username: "local.user",
      password: "x".repeat(10),
    });
    service = new SessionService(new SqliteSessionPersistence(database), {
      now: () => new Date("2026-07-27T13:00:00.000Z"),
    });
  });

  afterEach(() => {
    closeDatabase(database);
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  it("returns the frozen safe-user response without exposing auth internals", async () => {
    const handler = createSessionHandler(
      service,
      () => REQUEST_ID,
      () => NOW,
    );
    const response = await handler(sessionRequest(loginResult.session.token));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      data: {
        user: {
          id: "usr_session_test",
          username: "Local.User",
          displayName: "로컬 사용자",
        },
      },
      meta: {
        requestId: REQUEST_ID,
        timestamp: NOW.toISOString(),
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /password|token|hash|salt|stack|sqlite/i,
    );

    const storedSession = database.$client
      .prepare(
        "SELECT last_seen_at, expires_at FROM sessions WHERE user_id = ?",
      )
      .get("usr_session_test") as {
      last_seen_at: string;
      expires_at: string;
    };
    expect(storedSession).toEqual({
      last_seen_at: "2026-07-27T13:00:00.000Z",
      expires_at: "2026-08-03T12:00:00.000Z",
    });
  });

  it("returns AUTH_REQUIRED for missing, nonexistent, and modified tokens", async () => {
    const handler = createSessionHandler(service, () => REQUEST_ID);
    const modifiedToken = `${VALID_TOKEN.slice(0, -1)}A`;

    for (const token of [
      undefined,
      Buffer.alloc(32, 3).toString("base64url"),
      modifiedToken,
    ]) {
      const response = await handler(sessionRequest(token));
      const body = await response.json();
      expect(response.status).toBe(401);
      expect(body.error.code).toBe("AUTH_REQUIRED");
      expect(JSON.stringify(body)).not.toContain(token ?? "undefined");
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("returns SESSION_EXPIRED for an expired persisted session", async () => {
    database.$client
      .prepare("UPDATE sessions SET expires_at = ?")
      .run("2026-07-27T12:59:59.000Z");
    const handler = createSessionHandler(service, () => REQUEST_ID);
    const response = await handler(sessionRequest(VALID_TOKEN));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("SESSION_EXPIRED");
    expect(body.error.message).toBe("세션이 만료되었습니다.");
  });

  it("returns a safe persistence error without logging auth data", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const handler = createSessionHandler(
      {
        authenticate: () => {
          throw new SessionPersistenceError();
        },
      },
      () => REQUEST_ID,
    );
    const response = await handler(sessionRequest(VALID_TOKEN));
    const serializedBody = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(serializedBody).toContain("DATABASE_ERROR");
    expect(serializedBody).not.toMatch(
      /password|token|hash|salt|stack|sqlite|path/i,
    );
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
