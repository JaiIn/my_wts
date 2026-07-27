import { eq } from "drizzle-orm";

import type { AppDatabase } from "./database";
import { type NewSessionRecord, type SessionRecord, sessions } from "./schema";

export class SessionRepository {
  constructor(private readonly database: AppDatabase) {}

  create(session: NewSessionRecord): SessionRecord {
    return this.database.insert(sessions).values(session).returning().get();
  }

  findByTokenHash(tokenHash: string): SessionRecord | undefined {
    return this.database
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .get();
  }

  deleteByTokenHash(tokenHash: string): boolean {
    return (
      this.database
        .delete(sessions)
        .where(eq(sessions.tokenHash, tokenHash))
        .run().changes > 0
    );
  }
}
