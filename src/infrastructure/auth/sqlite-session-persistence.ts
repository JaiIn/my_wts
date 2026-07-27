import {
  type SessionPersistence,
  SessionPersistenceError,
  type SessionRecordForAuthentication,
  type SessionUser,
} from "../../application/auth/session-service";
import type { AppDatabase } from "../database/database";
import { SessionRepository } from "../database/session-repository";
import { UserRepository } from "../database/user-repository";

export class SqliteSessionPersistence implements SessionPersistence {
  constructor(private readonly database: AppDatabase) {}

  findSessionByTokenHash(
    tokenHash: string,
  ): SessionRecordForAuthentication | undefined {
    try {
      const session = new SessionRepository(this.database).findByTokenHash(
        tokenHash,
      );
      return session
        ? {
            userId: session.userId,
            lastSeenAt: session.lastSeenAt,
            expiresAt: session.expiresAt,
          }
        : undefined;
    } catch {
      throw new SessionPersistenceError();
    }
  }

  findUserById(userId: string): SessionUser | undefined {
    try {
      const user = new UserRepository(this.database).findById(userId);
      return user
        ? {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
          }
        : undefined;
    } catch {
      throw new SessionPersistenceError();
    }
  }
}
