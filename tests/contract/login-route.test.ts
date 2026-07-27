import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LoginPersistenceError,
  LoginService,
} from "../../src/application/auth/login-service";
import { hashPassword } from "../../src/domain/auth/password";
import { SqliteLoginPersistence } from "../../src/infrastructure/auth/sqlite-login-persistence";
import {
  applyMigrations,
  closeDatabase,
  openDatabase,
  type AppDatabase,
} from "../../src/infrastructure/database/database";
import { UserRepository } from "../../src/infrastructure/database/user-repository";
import { createLoginHandler } from "../../app/api/v1/auth/login/route";

const REQUEST_ID = "00000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-07-27T00:00:00.000Z");

function loginRequest(body: unknown): Request {
  return new Request("http://127.0.0.1:3000/api/v1/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:3000",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/auth/login", () => {
  let temporaryDirectory: string;
  let database: AppDatabase;
  let service: LoginService;

  beforeEach(async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "my-wts-login-"));
    database = openDatabase(join(temporaryDirectory, "test.sqlite3"));
    applyMigrations(database);
    new UserRepository(database).create({
      id: "usr_login_test",
      username: "Local.User",
      usernameNormalized: "local.user",
      displayName: "로컬 사용자",
      passwordHash: await hashPassword("x".repeat(10)),
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    service = new LoginService(new SqliteLoginPersistence(database), {
      now: () => NOW,
      createId: () => "login-test-id",
      createToken: () => "login-route-session-value",
    });
  });

  afterEach(() => {
    closeDatabase(database);
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  it("creates a hashed seven-day session and returns the frozen 204 contract", async () => {
    const handler = createLoginHandler(service, () => REQUEST_ID);
    const response = await handler(
      loginRequest({
        username: "  LOCAL.user  ",
        password: "x".repeat(10),
      }),
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("my_wts_session=");
    expect(cookie).toContain("login-route-session-value");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Expires=Mon, 03 Aug 2026 00:00:00 GMT");
    expect(cookie).not.toContain("Secure");

    const storedSession = database.$client
      .prepare(
        "SELECT user_id, token_hash, created_at, last_seen_at, expires_at FROM sessions LIMIT 1",
      )
      .get() as {
      user_id: string;
      token_hash: string;
      created_at: string;
      last_seen_at: string;
      expires_at: string;
    };
    expect(storedSession).toEqual({
      user_id: "usr_login_test",
      token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      created_at: NOW.toISOString(),
      last_seen_at: NOW.toISOString(),
      expires_at: "2026-08-03T00:00:00.000Z",
    });
    expect(storedSession.token_hash).not.toBe("login-route-session-value");
  });

  it("returns the same generic failure for an unknown user and wrong credential", async () => {
    const handler = createLoginHandler(service, () => REQUEST_ID);
    const expectedBody = {
      error: {
        requestId: REQUEST_ID,
        code: "INVALID_CREDENTIALS",
        message: "사용자명 또는 비밀번호를 확인해 주세요.",
        retryable: false,
        details: {},
      },
    };

    for (const body of [
      { username: "missing.user", password: "x".repeat(10) },
      { username: "local.user", password: "y".repeat(10) },
    ]) {
      const response = await handler(loginRequest(body));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(expectedBody);
      expect(response.headers.get("set-cookie")).toBeNull();
    }

    const sessionCount = database.$client
      .prepare("SELECT COUNT(*) AS count FROM sessions")
      .get() as { count: number };
    expect(sessionCount.count).toBe(0);
  });

  it("safely rejects a tampered password hash as invalid credentials", async () => {
    database.$client
      .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
      .run("scrypt$v1$invalid", "usr_login_test");
    const handler = createLoginHandler(service, () => REQUEST_ID);
    const response = await handler(
      loginRequest({
        username: "local.user",
        password: "x".repeat(10),
      }),
    );
    const serializedBody = JSON.stringify(await response.json());

    expect(response.status).toBe(401);
    expect(serializedBody).toContain("INVALID_CREDENTIALS");
    expect(serializedBody).not.toMatch(/password|hash|salt|stack|sqlite/i);
  });

  it("rejects malformed JSON, wrong types, unknown fields, and foreign origins", async () => {
    const handler = createLoginHandler(service, () => REQUEST_ID);
    const malformed = await handler(
      new Request("http://127.0.0.1:3000/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://127.0.0.1:3000",
        },
        body: "{",
      }),
    );
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe("VALIDATION_FAILED");

    for (const body of [
      { username: 123, password: "x".repeat(10) },
      {
        username: "local.user",
        password: "x".repeat(10),
        unknown: true,
      },
    ]) {
      const response = await handler(loginRequest(body));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
    }

    const foreignOrigin = await handler(
      new Request("http://127.0.0.1:3000/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: "{}",
      }),
    );
    expect(foreignOrigin.status).toBe(403);
    expect((await foreignOrigin.json()).error.code).toBe("FORBIDDEN");
  });

  it("rate-limits after five failures and resets at the frozen boundary", async () => {
    let currentTime = NOW;
    const limitedService = new LoginService(
      new SqliteLoginPersistence(database),
      {
        now: () => currentTime,
        createId: () => "rate-limit-session",
        createToken: () => "rate-limit-session-value",
      },
    );
    const handler = createLoginHandler(limitedService, () => REQUEST_ID);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await handler(
        loginRequest({
          username: "LOCAL.USER",
          password: "y".repeat(10),
        }),
      );
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("INVALID_CREDENTIALS");
    }

    const limited = await handler(
      loginRequest({
        username: "local.user",
        password: "x".repeat(10),
      }),
    );
    const limitedBody = await limited.json();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("900");
    expect(limitedBody.error).toEqual({
      requestId: REQUEST_ID,
      code: "AUTH_RATE_LIMITED",
      message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      retryable: true,
      details: {},
    });
    expect(JSON.stringify(limitedBody)).not.toMatch(
      /password|hash|counter|sqlite|stack/i,
    );

    currentTime = new Date("2026-07-27T00:15:00.000Z");
    expect(
      (
        await handler(
          loginRequest({
            username: "local.user",
            password: "x".repeat(10),
          }),
        )
      ).status,
    ).toBe(204);
  });

  it("returns a safe database error without logging request data", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const handler = createLoginHandler(
      {
        login: async () => {
          throw new LoginPersistenceError();
        },
      },
      () => REQUEST_ID,
    );
    const response = await handler(
      loginRequest({
        username: "local.user",
        password: "x".repeat(10),
      }),
    );
    const serializedBody = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(serializedBody).toContain("DATABASE_ERROR");
    expect(serializedBody).not.toMatch(/password|hash|salt|stack|sqlite/i);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
