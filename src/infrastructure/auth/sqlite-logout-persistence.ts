import {
  type LogoutPersistence,
  LogoutPersistenceError,
} from "../../application/auth/logout-service";
import type { AppDatabase } from "../database/database";
import { SessionRepository } from "../database/session-repository";

export class SqliteLogoutPersistence implements LogoutPersistence {
  constructor(private readonly database: AppDatabase) {}

  deleteSessionByTokenHash(tokenHash: string): boolean {
    try {
      return new SessionRepository(this.database).deleteByTokenHash(tokenHash);
    } catch {
      throw new LogoutPersistenceError();
    }
  }
}
