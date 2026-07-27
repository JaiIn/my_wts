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
import { UserOwnedDataRepository } from "../../src/infrastructure/database/user-owned-data-repository";
import { UserRepository } from "../../src/infrastructure/database/user-repository";

const USER_A = "usr_isolation_a";
const USER_B = "usr_isolation_b";
const NOW = "2026-07-27T00:00:00.000Z";

describe("user-owned data isolation", () => {
  let temporaryDirectory: string;
  let database: AppDatabase;
  let repository: UserOwnedDataRepository;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "my-wts-isolation-"));
    database = openDatabase(join(temporaryDirectory, "test.sqlite3"));
    applyMigrations(database);
    const users = new UserRepository(database);
    users.create({
      id: USER_A,
      username: "User.A",
      usernameNormalized: "user.a",
      displayName: "사용자 A",
      passwordHash: "test-only-hash-a",
      createdAt: NOW,
      updatedAt: NOW,
    });
    users.create({
      id: USER_B,
      username: "User.B",
      usernameNormalized: "user.b",
      displayName: "사용자 B",
      passwordHash: "test-only-hash-b",
      createdAt: NOW,
      updatedAt: NOW,
    });
    seedOwnedData();
    repository = new UserOwnedDataRepository(database);
  });

  afterEach(() => {
    closeDatabase(database);
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  function seedOwnedData() {
    const insertSetting = database.$client.prepare(
      "INSERT INTO app_settings (user_id, key, value_json, updated_at) VALUES (?, ?, ?, ?)",
    );
    insertSetting.run(USER_A, "theme", '"light"', NOW);
    insertSetting.run(USER_B, "theme", '"dark"', NOW);

    const insertWatchlist = database.$client.prepare(
      "INSERT INTO watchlists (id, user_id, name, sort_order, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    insertWatchlist.run("wl_a", USER_A, "A 목록", 0, 1, NOW, NOW);
    insertWatchlist.run("wl_b", USER_B, "B 목록", 0, 1, NOW, NOW);

    const insertItem = database.$client.prepare(
      "INSERT INTO watchlist_items (watchlist_id, symbol, market_country, sort_order, added_at) VALUES (?, ?, ?, ?, ?)",
    );
    insertItem.run("wl_a", "005930", "KR", 0, NOW);
    insertItem.run("wl_b", "AAPL", "US", 0, NOW);
  }

  it("returns only settings and watchlists owned by the authenticated user", () => {
    expect(repository.findSettings(USER_A)).toEqual([
      expect.objectContaining({ userId: USER_A, valueJson: '"light"' }),
    ]);
    expect(repository.findWatchlists(USER_A)).toEqual([
      expect.objectContaining({ id: "wl_a", userId: USER_A }),
    ]);
    expect(repository.findWatchlistItems(USER_A, "wl_a")).toEqual([
      expect.objectContaining({ watchlistId: "wl_a", symbol: "005930" }),
    ]);
    expect(repository.findWatchlistItems(USER_A, "wl_b")).toEqual([]);
  });

  it("cannot update or delete another user's resources", () => {
    expect(
      repository.renameWatchlist(
        USER_A,
        "wl_b",
        "위조된 이름",
        "2026-07-27T01:00:00.000Z",
      ),
    ).toBe(false);
    expect(repository.deleteWatchlist(USER_A, "wl_b")).toBe(false);
    expect(repository.deleteWatchlistItem(USER_A, "wl_b", "AAPL", "US")).toBe(
      false,
    );

    expect(repository.findWatchlists(USER_B)).toEqual([
      expect.objectContaining({ id: "wl_b", name: "B 목록" }),
    ]);
    expect(repository.findWatchlistItems(USER_B, "wl_b")).toHaveLength(1);
  });

  it("scopes forged user identifiers in data to the authenticated user", () => {
    const forgedValue = JSON.stringify({
      userId: USER_B,
      theme: "forged",
    });

    expect(
      repository.updateSetting(
        USER_A,
        "theme",
        forgedValue,
        "2026-07-27T01:00:00.000Z",
      ),
    ).toBe(true);
    expect(repository.findSettings(USER_A)[0].valueJson).toBe(forgedValue);
    expect(repository.findSettings(USER_B)[0].valueJson).toBe('"dark"');
  });

  it("allows normal changes for the owner and treats foreign as absent", () => {
    expect(
      repository.renameWatchlist(
        USER_A,
        "wl_a",
        "내 목록",
        "2026-07-27T01:00:00.000Z",
      ),
    ).toBe(true);
    expect(repository.findWatchlists(USER_A)[0].name).toBe("내 목록");
    expect(repository.deleteWatchlistItem(USER_A, "wl_a", "005930", "KR")).toBe(
      true,
    );
    expect(repository.deleteSetting(USER_A, "theme")).toBe(true);
    expect(repository.deleteWatchlist(USER_A, "wl_a")).toBe(true);

    expect(repository.deleteWatchlist(USER_A, "missing")).toBe(false);
    expect(repository.deleteWatchlist(USER_A, "wl_b")).toBe(false);
    expect(repository.findSettings(USER_B)).toHaveLength(1);
    expect(repository.findWatchlists(USER_B)).toHaveLength(1);
  });
});
