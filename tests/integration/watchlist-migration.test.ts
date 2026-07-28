import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyMigrations,
  closeDatabase,
  openDatabase,
} from "../../src/infrastructure/database/database";

const NOW = "2026-07-27T00:00:00.000Z";

describe("watchlist migration", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  function temporaryDirectory(prefix: string) {
    const directory = mkdtempSync(join(tmpdir(), prefix));
    temporaryDirectories.push(directory);
    return directory;
  }

  function baselineMigrationsFolder() {
    const directory = temporaryDirectory("my-wts-migration-baseline-");
    const meta = join(directory, "meta");
    mkdirSync(meta);
    cpSync(resolve("drizzle/0000_initial.sql"), join(directory, "0000_initial.sql"));
    writeFileSync(
      join(meta, "_journal.json"),
      JSON.stringify({
        version: "7",
        dialect: "sqlite",
        entries: [
          {
            idx: 0,
            version: "6",
            when: 1785117175068,
            tag: "0000_initial",
            breakpoints: true,
          },
        ],
      }),
    );
    return directory;
  }

  it("reproduces the full migration chain on an empty database", () => {
    const directory = temporaryDirectory("my-wts-migration-empty-");
    const database = openDatabase(join(directory, "empty.sqlite3"));
    try {
      applyMigrations(database);
      const migrations = database.$client
        .prepare("SELECT COUNT(*) AS count FROM __drizzle_migrations")
        .get() as { count: number };
      const watchlists = database.$client
        .prepare("SELECT COUNT(*) AS count FROM watchlists")
        .get() as { count: number };
      expect(migrations.count).toBe(2);
      expect(watchlists.count).toBe(0);
    } finally {
      closeDatabase(database);
    }
  });

  it("upgrades a 0000 database without losing users or sessions and is idempotent", () => {
    const directory = temporaryDirectory("my-wts-migration-upgrade-");
    const database = openDatabase(join(directory, "upgrade.sqlite3"));
    try {
      applyMigrations(database, baselineMigrationsFolder());
      database.$client
        .prepare(
          "INSERT INTO users (id, username, username_normalized, display_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run("usr_existing", "Existing", "existing", "Existing", "hash", NOW, NOW);
      database.$client
        .prepare(
          "INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          "ses_existing",
          "usr_existing",
          "existing-token-hash",
          NOW,
          NOW,
          "2026-08-03T00:00:00.000Z",
        );

      applyMigrations(database);
      applyMigrations(database);

      const defaultLists = database.$client
        .prepare(
          "SELECT id, name, is_default FROM watchlists WHERE user_id = ? ORDER BY sort_order, id",
        )
        .all("usr_existing") as {
        id: string;
        name: string;
        is_default: number;
      }[];
      expect(defaultLists).toEqual([
        {
          id: expect.stringMatching(
            /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
          ),
          name: "기본 관심종목",
          is_default: 1,
        },
      ]);
      expect(
        database.$client
          .prepare("SELECT user_id FROM sessions WHERE id = ?")
          .get("ses_existing"),
      ).toEqual({ user_id: "usr_existing" });
    } finally {
      closeDatabase(database);
    }
  });

  it("enforces one default, item uniqueness, foreign keys, and cascade", () => {
    const directory = temporaryDirectory("my-wts-migration-constraints-");
    const database = openDatabase(join(directory, "constraints.sqlite3"));
    try {
      applyMigrations(database);
      database.$client
        .prepare(
          "INSERT INTO users (id, username, username_normalized, display_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run("usr_owner", "Owner", "owner", "Owner", "hash", NOW, NOW);
      const insertList = database.$client.prepare(
        "INSERT INTO watchlists (id, user_id, name, sort_order, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      insertList.run(
        "00000000-0000-4000-8000-000000000001",
        "usr_owner",
        "기본 관심종목",
        0,
        1,
        NOW,
        NOW,
      );
      expect(() =>
        insertList.run(
          "00000000-0000-4000-8000-000000000002",
          "usr_owner",
          "또 다른 기본",
          1,
          1,
          NOW,
          NOW,
        ),
      ).toThrow();

      const insertItem = database.$client.prepare(
        "INSERT INTO watchlist_items (watchlist_id, symbol, market_country, sort_order, added_at) VALUES (?, ?, ?, ?, ?)",
      );
      insertItem.run(
        "00000000-0000-4000-8000-000000000001",
        "005930",
        "KR",
        0,
        NOW,
      );
      expect(() =>
        insertItem.run(
          "00000000-0000-4000-8000-000000000001",
          "005930",
          "KR",
          1,
          NOW,
        ),
      ).toThrow();
      expect(() =>
        insertItem.run(
          "00000000-0000-4000-8000-000000009999",
          "AAPL",
          "US",
          0,
          NOW,
        ),
      ).toThrow();

      database.$client.prepare("DELETE FROM users WHERE id = ?").run("usr_owner");
      expect(
        database.$client
          .prepare("SELECT COUNT(*) AS count FROM watchlists")
          .get(),
      ).toEqual({ count: 0 });
      expect(
        database.$client
          .prepare("SELECT COUNT(*) AS count FROM watchlist_items")
          .get(),
      ).toEqual({ count: 0 });
    } finally {
      closeDatabase(database);
    }
  });
});
