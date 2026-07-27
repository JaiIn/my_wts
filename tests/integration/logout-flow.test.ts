import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LoginService } from "../../src/application/auth/login-service";
import { LogoutService } from "../../src/application/auth/logout-service";
import {
  SessionAuthenticationError,
  SessionService,
} from "../../src/application/auth/session-service";
import { hashPassword } from "../../src/domain/auth/password";
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

const NOW = new Date("2026-07-27T12:00:00.000Z");
const FIRST_TOKEN = Buffer.alloc(32, 9).toString("base64url");
const SECOND_TOKEN = Buffer.alloc(32, 10).toString("base64url");

describe("logout persistence flow", () => {
  let temporaryDirectory: string;
  let database: AppDatabase;

  beforeEach(async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "my-wts-logout-flow-"));
    database = openDatabase(join(temporaryDirectory, "test.sqlite3"));
    applyMigrations(database);
    new UserRepository(database).create({
      id: "usr_logout_flow",
      username: "Local.User",
      usernameNormalized: "local.user",
      displayName: "로컬 사용자",
      passwordHash: await hashPassword("x".repeat(10)),
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
  });

  afterEach(() => {
    closeDatabase(database);
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  it("revokes one browser session without affecting another", async () => {
    const firstLogin = await login(FIRST_TOKEN, "first");
    const secondLogin = await login(SECOND_TOKEN, "second");
    const sessionService = new SessionService(
      new SqliteSessionPersistence(database),
      { now: () => new Date("2026-07-27T13:00:00.000Z") },
    );
    const logoutService = new LogoutService(
      new SqliteLogoutPersistence(database),
    );

    expect(sessionService.authenticate(firstLogin.session.token).id).toBe(
      "usr_logout_flow",
    );
    expect(sessionService.authenticate(secondLogin.session.token).id).toBe(
      "usr_logout_flow",
    );

    logoutService.logout(firstLogin.session.token);

    expect(() =>
      sessionService.authenticate(firstLogin.session.token),
    ).toThrowError(SessionAuthenticationError);
    expect(sessionService.authenticate(secondLogin.session.token).id).toBe(
      "usr_logout_flow",
    );
  });

  function login(token: string, id: string) {
    return new LoginService(new SqliteLoginPersistence(database), {
      now: () => NOW,
      createId: () => id,
      createToken: () => token,
    }).login({
      username: "local.user",
      password: "x".repeat(10),
    });
  }
});
