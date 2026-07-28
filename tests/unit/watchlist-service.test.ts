import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WatchlistConflictError,
  WatchlistNotFoundError,
  WatchlistPersistenceError,
  WatchlistService,
  WatchlistValidationError,
} from "../../src/application/watchlist/watchlist-service";
import {
  applyMigrations,
  closeDatabase,
  openDatabase,
  type AppDatabase,
} from "../../src/infrastructure/database/database";
import { UserOwnedDataRepository } from "../../src/infrastructure/database/user-owned-data-repository";
import { UserRepository } from "../../src/infrastructure/database/user-repository";
import { createMockMarketService } from "../../src/infrastructure/market/mock-market-service";

const USER_A = "usr_watchlist_a";
const USER_B = "usr_watchlist_b";
const LIST_A = "00000000-0000-4000-8000-000000000001";
const LIST_B = "00000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-07-28T00:00:00.000Z");

describe("watchlist service", () => {
  let temporaryDirectory: string;
  let database: AppDatabase;
  let service: WatchlistService;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "my-wts-watchlist-"));
    database = openDatabase(join(temporaryDirectory, "test.sqlite3"));
    applyMigrations(database);
    const users = new UserRepository(database);
    for (const [id, username] of [
      [USER_A, "watch.a"],
      [USER_B, "watch.b"],
    ]) {
      users.create({
        id,
        username,
        usernameNormalized: username,
        displayName: username,
        passwordHash: "test-only-hash",
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      });
    }
    const insert = database.$client.prepare(
      "INSERT INTO watchlists (id, user_id, name, sort_order, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    insert.run(
      LIST_A,
      USER_A,
      "기본 관심종목",
      0,
      1,
      NOW.toISOString(),
      NOW.toISOString(),
    );
    insert.run(
      LIST_B,
      USER_B,
      "기본 관심종목",
      0,
      1,
      NOW.toISOString(),
      NOW.toISOString(),
    );
    service = new WatchlistService(
      new UserOwnedDataRepository(database),
      createMockMarketService(),
      {
        now: () => NOW,
        createId: () => "00000000-0000-4000-8000-000000000003",
      },
    );
  });

  afterEach(() => {
    closeDatabase(database);
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  it("creates, lists, updates, and deletes owner-scoped non-default lists", () => {
    const created = service.create(USER_A, {
      name: "  미국 주식  ",
      sortOrder: 2,
    });
    expect(created).toMatchObject({
      id: "00000000-0000-4000-8000-000000000003",
      name: "미국 주식",
      sortOrder: 2,
      isDefault: false,
    });
    expect(service.list(USER_A).map(({ id }) => id)).toEqual([
      LIST_A,
      created.id,
    ]);
    expect(
      service.update(USER_A, created.id, { name: "미국 장기", sortOrder: 1 }),
    ).toMatchObject({ name: "미국 장기", sortOrder: 1 });
    service.delete(USER_A, created.id);
    expect(service.list(USER_A).map(({ id }) => id)).toEqual([LIST_A]);
  });

  it("canonicalizes supported symbols and rejects duplicate or unsupported items", async () => {
    const added = await service.addItem(USER_A, LIST_A, {
      symbol: " aapl ",
      marketCountry: "us",
    });
    expect(added.items).toEqual([
      expect.objectContaining({
        symbol: "AAPL",
        marketCountry: "US",
        sortOrder: 0,
      }),
    ]);
    await expect(
      service.addItem(USER_A, LIST_A, {
        symbol: "AAPL",
        marketCountry: "US",
      }),
    ).rejects.toMatchObject({
      name: "WatchlistConflictError",
      reason: "DUPLICATE_ITEM",
    });
    await expect(
      service.addItem(USER_A, LIST_A, {
        symbol: "005930",
        marketCountry: "US",
      }),
    ).rejects.toBeInstanceOf(WatchlistNotFoundError);
    await expect(
      service.addItem(USER_A, LIST_A, {
        symbol: "missing",
        marketCountry: "KR",
      }),
    ).rejects.toBeInstanceOf(WatchlistNotFoundError);
  });

  it("keeps deterministic item order and removes exactly one owner item", async () => {
    await service.addItem(USER_A, LIST_A, {
      symbol: "AAPL",
      marketCountry: "US",
    });
    await service.addItem(USER_A, LIST_A, {
      symbol: "005930",
      marketCountry: "KR",
    });
    expect(service.list(USER_A)[0]?.items.map(({ symbol }) => symbol)).toEqual([
      "AAPL",
      "005930",
    ]);
    service.deleteItem(USER_A, LIST_A, "US", "aapl");
    expect(service.list(USER_A)[0]?.items.map(({ symbol }) => symbol)).toEqual([
      "005930",
    ]);
    expect(service.list(USER_B)[0]?.items).toEqual([]);
  });

  it("treats another user's IDs as not found and cannot delete the default list", async () => {
    expect(() => service.update(USER_A, LIST_B, { name: "위조" })).toThrow(
      WatchlistNotFoundError,
    );
    expect(() => service.delete(USER_A, LIST_B)).toThrow(
      WatchlistNotFoundError,
    );
    await expect(
      service.addItem(USER_A, LIST_B, {
        symbol: "AAPL",
        marketCountry: "US",
      }),
    ).rejects.toBeInstanceOf(WatchlistNotFoundError);
    expect(() => service.deleteItem(USER_A, LIST_B, "US", "AAPL")).toThrow(
      WatchlistNotFoundError,
    );
    expect(() => service.delete(USER_A, LIST_A)).toThrow(
      WatchlistConflictError,
    );
  });

  it("rejects unknown fields, wrong types, forged userId, and oversized names", () => {
    for (const input of [
      { name: "valid", userId: USER_B },
      { name: 1 },
      { name: "x".repeat(41) },
      { name: "" },
    ]) {
      expect(() => service.create(USER_A, input)).toThrow(
        WatchlistValidationError,
      );
    }
    expect(service.list(USER_B)).toHaveLength(1);
  });

  it("rolls back failed writes and uses no external network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(() =>
      service.create("usr_missing", { name: "고아 목록" }),
    ).toThrow(WatchlistPersistenceError);
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM watchlists")
        .get(),
    ).toEqual({ count: 2 });
    await service.addItem(USER_A, LIST_A, {
      symbol: "005930",
      marketCountry: "KR",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
