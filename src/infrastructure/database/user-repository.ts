import { eq } from "drizzle-orm";

import type { AppDatabase } from "./database";
import { type NewUserRecord, type UserRecord, users } from "./schema";

export class UsernameAlreadyExistsError extends Error {
  constructor() {
    super("USERNAME_ALREADY_EXISTS");
    this.name = "UsernameAlreadyExistsError";
  }
}

function isUsernameUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("users.username_normalized")
  );
}

export class UserRepository {
  constructor(private readonly database: AppDatabase) {}

  create(user: NewUserRecord): UserRecord {
    try {
      return this.database.insert(users).values(user).returning().get();
    } catch (error) {
      if (isUsernameUniqueConstraintError(error)) {
        throw new UsernameAlreadyExistsError();
      }
      throw error;
    }
  }

  findById(id: string): UserRecord | undefined {
    return this.database.select().from(users).where(eq(users.id, id)).get();
  }

  findByNormalizedUsername(usernameNormalized: string): UserRecord | undefined {
    return this.database
      .select()
      .from(users)
      .where(eq(users.usernameNormalized, usernameNormalized))
      .get();
  }
}
