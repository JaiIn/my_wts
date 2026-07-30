import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyMigrations,
  closeDatabase,
  openDatabase,
  type AppDatabase,
} from "../../src/infrastructure/database/database";
import { SessionRepository } from "../../src/infrastructure/database/session-repository";
import { UserRepository } from "../../src/infrastructure/database/user-repository";

const NOW = "2026-07-30T00:00:00.000Z";

describe("session account selection repository", () => {
  let database: AppDatabase;
  let sessions: SessionRepository;

  beforeEach(() => {
    database = openDatabase(":memory:");
    applyMigrations(database);
    new UserRepository(database).create({
      id: "usr_repository",
      username: "repository.user",
      usernameNormalized: "repository.user",
      displayName: "Repository User",
      passwordHash: "scrypt$v1$test",
      createdAt: NOW,
      updatedAt: NOW,
    });
    sessions = new SessionRepository(database);
    for (const id of ["a", "b"]) {
      sessions.create({
        id: `ses_${id}`,
        userId: "usr_repository",
        tokenHash: `hash_${id}`,
        selectedAccountRef: null,
        createdAt: NOW,
        lastSeenAt: NOW,
        expiresAt: "2026-08-06T00:00:00.000Z",
      });
    }
  });

  afterEach(() => closeDatabase(database));

  it("updates and clears only the authenticated session", () => {
    const accountRef = "acct_repository_reference_000001";
    expect(
      sessions.updateSelectedAccountRef("hash_a", "usr_repository", accountRef),
    ).toBe(true);
    expect(sessions.findByTokenHash("hash_a")?.selectedAccountRef).toBe(
      accountRef,
    );
    expect(sessions.findByTokenHash("hash_b")?.selectedAccountRef).toBeNull();
    expect(
      sessions.updateSelectedAccountRef("hash_a", "usr_repository", null),
    ).toBe(true);
    expect(sessions.findByTokenHash("hash_a")?.selectedAccountRef).toBeNull();
  });

  it("fails closed for a deleted session or mismatched user", () => {
    expect(
      sessions.updateSelectedAccountRef(
        "hash_a",
        "usr_other",
        "acct_repository_reference_000001",
      ),
    ).toBe(false);
    sessions.deleteByTokenHash("hash_a");
    expect(
      sessions.updateSelectedAccountRef(
        "hash_a",
        "usr_repository",
        "acct_repository_reference_000001",
      ),
    ).toBe(false);
  });

  it("stores only the opaque account reference", () => {
    const accountRef = "acct_repository_reference_000001";
    sessions.updateSelectedAccountRef("hash_a", "usr_repository", accountRef);
    const raw = database.$client
      .prepare("SELECT selected_account_ref FROM sessions WHERE token_hash = ?")
      .get("hash_a") as { selected_account_ref: string };
    expect(raw).toEqual({ selected_account_ref: accountRef });
    expect(JSON.stringify(raw)).not.toMatch(/accountSeq|accountNo/i);
  });
});
