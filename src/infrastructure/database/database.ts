import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { databaseSchema } from "./schema";

function createDrizzleDatabase(databasePath: string) {
  return drizzle(databasePath, { schema: databaseSchema });
}

export type AppDatabase = ReturnType<typeof createDrizzleDatabase>;

export function openDatabase(databasePath: string): AppDatabase {
  const resolvedPath =
    databasePath === ":memory:" ? databasePath : resolve(databasePath);

  if (resolvedPath !== ":memory:") {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  }

  const database = createDrizzleDatabase(resolvedPath);
  database.$client.pragma("foreign_keys = ON");
  return database;
}

export function applyMigrations(
  database: AppDatabase,
  migrationsFolder = resolve("drizzle"),
): void {
  migrate(database, { migrationsFolder });
}

export function closeDatabase(database: AppDatabase): void {
  database.$client.close();
}
