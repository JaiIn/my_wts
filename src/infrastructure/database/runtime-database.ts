import { applyMigrations, openDatabase, type AppDatabase } from "./database";

let runtimeDatabase: AppDatabase | undefined;

export function getRuntimeDatabase(): AppDatabase {
  if (!runtimeDatabase) {
    runtimeDatabase = openDatabase(
      process.env.DATABASE_PATH ?? "./data/my_wts.sqlite3",
    );
    applyMigrations(runtimeDatabase);
  }

  return runtimeDatabase;
}
