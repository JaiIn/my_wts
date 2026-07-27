import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyMigrations,
  closeDatabase,
  openDatabase,
  type AppDatabase,
} from "../../src/infrastructure/database/database";
import { SessionRepository } from "../../src/infrastructure/database/session-repository";
import {
  UserRepository,
  UsernameAlreadyExistsError,
} from "../../src/infrastructure/database/user-repository";

describe("SQLite migration and auth repositories", () => {
  let temporaryDirectory: string;
  let database: AppDatabase;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "my-wts-database-"));
    database = openDatabase(join(temporaryDirectory, "test.sqlite3"));
    applyMigrations(database);
  });

  afterEach(() => {
    closeDatabase(database);
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  it("reproduces the six frozen baseline tables", () => {
    const tableNames = database.$client
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name",
      )
      .all()
      .map((row: unknown) => (row as { name: string }).name);

    expect(tableNames).toEqual([
      "app_settings",
      "audit_events",
      "sessions",
      "users",
      "watchlist_items",
      "watchlists",
    ]);
  });

  it("rejects duplicate normalized usernames and persists hashed sessions", () => {
    const users = new UserRepository(database);
    const sessions = new SessionRepository(database);
    const timestamp = "2026-07-27T00:00:00.000Z";

    users.create({
      id: "usr_first",
      username: "Local.User",
      usernameNormalized: "local.user",
      displayName: "Local User",
      passwordHash: "scrypt$v1$test-hash",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(() =>
      users.create({
        id: "usr_duplicate",
        username: "local.user",
        usernameNormalized: "local.user",
        displayName: "Duplicate",
        passwordHash: "scrypt$v1$other-test-hash",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ).toThrow(UsernameAlreadyExistsError);

    sessions.create({
      id: "ses_first",
      userId: "usr_first",
      tokenHash: "sha256-test-token-hash",
      selectedAccountRef: null,
      createdAt: timestamp,
      lastSeenAt: timestamp,
      expiresAt: "2026-08-03T00:00:00.000Z",
    });

    expect(sessions.findByTokenHash("sha256-test-token-hash")?.userId).toBe(
      "usr_first",
    );
    expect(sessions.deleteByTokenHash("sha256-test-token-hash")).toBe(true);
    expect(sessions.findByTokenHash("sha256-test-token-hash")).toBeUndefined();
  });
});
