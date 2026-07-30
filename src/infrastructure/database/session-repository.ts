import { and, eq, lte, or } from "drizzle-orm";

import type { AppDatabase } from "./database";
import { type NewSessionRecord, type SessionRecord, sessions } from "./schema";

type SessionDatabase = Pick<
  AppDatabase,
  "delete" | "insert" | "select" | "update"
>;

export class SessionRepository {
  constructor(private readonly database: SessionDatabase) {}

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

  updateLastSeenAt(tokenHash: string, lastSeenAt: string): boolean {
    return (
      this.database
        .update(sessions)
        .set({ lastSeenAt })
        .where(eq(sessions.tokenHash, tokenHash))
        .run().changes > 0
    );
  }

  updateSelectedAccountRef(
    tokenHash: string,
    userId: string,
    selectedAccountRef: string | null,
  ): boolean {
    return (
      this.database
        .update(sessions)
        .set({ selectedAccountRef })
        .where(
          and(eq(sessions.tokenHash, tokenHash), eq(sessions.userId, userId)),
        )
        .run().changes > 0
    );
  }

  deleteExpired(expiresAt: string, idleCutoff: string): number {
    return this.database
      .delete(sessions)
      .where(
        or(
          lte(sessions.expiresAt, expiresAt),
          lte(sessions.lastSeenAt, idleCutoff),
        ),
      )
      .run().changes;
  }
}
