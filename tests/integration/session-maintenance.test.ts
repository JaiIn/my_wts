import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SessionMaintenance } from "../../src/infrastructure/auth/session-maintenance";
import {
  applyMigrations,
  closeDatabase,
  openDatabase,
  type AppDatabase,
} from "../../src/infrastructure/database/database";
import { UserRepository } from "../../src/infrastructure/database/user-repository";

const NOW = new Date("2026-07-27T12:00:00.000Z");

describe("session maintenance", () => {
  let temporaryDirectory: string;
  let database: AppDatabase;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(
      join(tmpdir(), "my-wts-session-maintenance-"),
    );
    database = openDatabase(join(temporaryDirectory, "test.sqlite3"));
    applyMigrations(database);
    new UserRepository(database).create({
      id: "usr_maintenance",
      username: "Local.User",
      usernameNormalized: "local.user",
      displayName: "로컬 사용자",
      passwordHash: "test-only-hash",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
  });

  afterEach(() => {
    closeDatabase(database);
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  function insertSession(id: string, lastSeenAt: string, expiresAt: string) {
    database.$client
      .prepare(
        "INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        "usr_maintenance",
        id.padEnd(64, "0"),
        "2026-07-20T00:00:00.000Z",
        lastSeenAt,
        expiresAt,
      );
  }

  function sessionIds(): string[] {
    return (
      database.$client.prepare("SELECT id FROM sessions ORDER BY id").all() as {
        id: string;
      }[]
    ).map((row) => row.id);
  }

  it("cleans absolute and idle expiry at startup and at most daily", () => {
    insertSession(
      "absolute_expired",
      "2026-07-27T11:00:00.000Z",
      NOW.toISOString(),
    );
    insertSession(
      "idle_expired",
      "2026-07-27T00:00:00.000Z",
      "2026-08-03T00:00:00.000Z",
    );
    insertSession(
      "valid",
      "2026-07-27T00:00:00.001Z",
      "2026-07-27T12:00:00.001Z",
    );
    const maintenance = new SessionMaintenance(database);

    expect(maintenance.run(NOW)).toBe(2);
    expect(sessionIds()).toEqual(["valid"]);

    insertSession(
      "later_expired",
      "2026-07-27T00:00:00.000Z",
      NOW.toISOString(),
    );
    expect(maintenance.run(new Date("2026-07-28T11:59:59.999Z"))).toBe(0);
    expect(sessionIds()).toContain("later_expired");

    expect(maintenance.run(new Date("2026-07-28T12:00:00.000Z"))).toBe(2);
    expect(sessionIds()).toEqual([]);
  });
});
