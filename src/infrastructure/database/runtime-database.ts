import { loadServerEnvironment } from "../config/server-environment";
import { applyMigrations, openDatabase, type AppDatabase } from "./database";

let runtimeDatabase: AppDatabase | undefined;

export function getRuntimeDatabase(): AppDatabase {
  if (!runtimeDatabase) {
    runtimeDatabase = openDatabase(loadServerEnvironment().databasePath);
    applyMigrations(runtimeDatabase);
  }

  return runtimeDatabase;
}
