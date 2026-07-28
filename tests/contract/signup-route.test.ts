import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SignupPersistenceError,
  SignupService,
} from "../../src/application/auth/signup-service";
import { SqliteSignupPersistence } from "../../src/infrastructure/auth/sqlite-signup-persistence";
import {
  applyMigrations,
  closeDatabase,
  openDatabase,
  type AppDatabase,
} from "../../src/infrastructure/database/database";
import { createSignupHandler } from "../../app/api/v1/auth/signup/route";

const REQUEST_ID = "00000000-0000-4000-8000-000000000001";

function signupRequest(body: unknown): Request {
  return new Request("http://127.0.0.1:3000/api/v1/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/auth/signup", () => {
  let temporaryDirectory: string;
  let database: AppDatabase;
  let service: SignupService;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "my-wts-signup-"));
    database = openDatabase(join(temporaryDirectory, "test.sqlite3"));
    applyMigrations(database);
    service = new SignupService(new SqliteSignupPersistence(database), {
      now: () => new Date("2026-07-27T00:00:00.000Z"),
      createToken: () => "route-test-session-value",
    });
  });

  afterEach(() => {
    closeDatabase(database);
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  it("creates a normalized user, hashed credential, and login session", async () => {
    const handler = createSignupHandler(service, () => REQUEST_ID);
    const response = await handler(
      signupRequest({
        username: "  Local.User  ",
        displayName: "로컬 사용자",
        password: "x".repeat(10),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      data: {
        user: {
          id: expect.stringMatching(/^usr_/),
          username: "Local.User",
          displayName: "로컬 사용자",
        },
      },
      meta: { requestId: REQUEST_ID },
    });
    expect(JSON.stringify(body)).not.toMatch(/password|salt|stack/i);

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("my_wts_session=");
    expect(cookie).toContain("route-test-session-value");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=strict");
    expect(cookie).toContain("Path=/");
    expect(
      database.$client
        .prepare(
          "SELECT name, sort_order, is_default FROM watchlists WHERE user_id = ?",
        )
        .get(body.data.user.id),
    ).toEqual({
      name: "기본 관심종목",
      sort_order: 0,
      is_default: 1,
    });
    expect(cookie).not.toContain("Secure");

    const storedUser = database.$client
      .prepare(
        "SELECT username, username_normalized, password_hash FROM users LIMIT 1",
      )
      .get() as {
      username: string;
      username_normalized: string;
      password_hash: string;
    };
    expect(storedUser.username).toBe("Local.User");
    expect(storedUser.username_normalized).toBe("local.user");
    expect(storedUser.password_hash).toMatch(/^scrypt\$v1\$N=32768,r=8,p=1\$/);
    expect(storedUser.password_hash).not.toContain("x".repeat(10));

    const storedSession = database.$client
      .prepare("SELECT token_hash FROM sessions LIMIT 1")
      .get() as { token_hash: string };
    expect(storedSession.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedSession.token_hash).not.toBe("route-test-session-value");
  });

  it("maps normalized username conflicts to the frozen error envelope", async () => {
    const handler = createSignupHandler(service, () => REQUEST_ID);
    const first = {
      username: "Duplicate.User",
      displayName: "First",
      password: "x".repeat(10),
    };

    expect((await handler(signupRequest(first))).status).toBe(201);
    const response = await handler(
      signupRequest({
        ...first,
        username: "duplicate.user",
        displayName: "Second",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: {
        requestId: REQUEST_ID,
        code: "USERNAME_ALREADY_EXISTS",
        message: "이미 사용 중인 사용자명입니다.",
        retryable: false,
        details: {},
      },
    });
  });

  it("rejects malformed JSON, wrong types, and unknown fields", async () => {
    const handler = createSignupHandler(service, () => REQUEST_ID);
    const malformed = await handler(
      new Request("http://127.0.0.1:3000/api/v1/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe("VALIDATION_FAILED");

    for (const body of [
      {
        username: 123,
        displayName: "Invalid",
        password: "x".repeat(10),
      },
      {
        username: "valid.user",
        displayName: "Invalid",
        password: "x".repeat(10),
        unknown: true,
      },
    ]) {
      const response = await handler(signupRequest(body));
      const responseBody = await response.json();
      expect(response.status).toBe(400);
      expect(responseBody.error.code).toBe("VALIDATION_FAILED");
      expect(JSON.stringify(responseBody)).not.toMatch(
        /password|stack|sqlite/i,
      );
    }
  });

  it("returns a safe database error without logging request data", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const handler = createSignupHandler(
      {
        signup: async () => {
          throw new SignupPersistenceError();
        },
      },
      () => REQUEST_ID,
    );
    const response = await handler(
      signupRequest({
        username: "valid.user",
        displayName: "Valid",
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
