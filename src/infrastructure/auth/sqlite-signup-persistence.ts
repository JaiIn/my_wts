import {
  type SignupPersistence,
  SignupPersistenceError,
  type SignupPersistenceInput,
} from "../../application/auth/signup-service";
import type { AppDatabase } from "../database/database";
import { watchlists } from "../database/schema";
import { SessionRepository } from "../database/session-repository";
import {
  UserRepository,
  UsernameAlreadyExistsError,
} from "../database/user-repository";

export class SqliteSignupPersistence implements SignupPersistence {
  constructor(private readonly database: AppDatabase) {}

  create(input: SignupPersistenceInput): void {
    try {
      this.database.transaction((transaction) => {
        new UserRepository(transaction).create(input.user);
        transaction.insert(watchlists).values(input.watchlist).run();
        new SessionRepository(transaction).create(input.session);
      });
    } catch (error) {
      if (error instanceof UsernameAlreadyExistsError) {
        throw error;
      }
      throw new SignupPersistenceError();
    }
  }
}
