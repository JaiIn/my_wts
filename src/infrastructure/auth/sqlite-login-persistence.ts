import {
  type LoginPersistence,
  LoginPersistenceError,
  type LoginSessionInput,
  type LoginUser,
} from "../../application/auth/login-service";
import type { AppDatabase } from "../database/database";
import { SessionRepository } from "../database/session-repository";
import { UserRepository } from "../database/user-repository";

export class SqliteLoginPersistence implements LoginPersistence {
  constructor(private readonly database: AppDatabase) {}

  findUserByNormalizedUsername(
    usernameNormalized: string,
  ): LoginUser | undefined {
    try {
      const user = new UserRepository(this.database).findByNormalizedUsername(
        usernameNormalized,
      );
      return user
        ? { id: user.id, passwordHash: user.passwordHash }
        : undefined;
    } catch {
      throw new LoginPersistenceError();
    }
  }

  createSession(session: LoginSessionInput): void {
    try {
      new SessionRepository(this.database).create(session);
    } catch {
      throw new LoginPersistenceError();
    }
  }
}
