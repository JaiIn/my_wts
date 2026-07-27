import type { AppDatabase } from "../database/database";
import { SessionRepository } from "../database/session-repository";

const SESSION_IDLE_LIFETIME_MS = 12 * 60 * 60 * 1_000;
const SESSION_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1_000;

export class SessionMaintenance {
  private lastCleanupAt: number | undefined;

  constructor(private readonly database: AppDatabase) {}

  run(now: Date): number {
    const nowTimestamp = now.getTime();
    if (
      this.lastCleanupAt !== undefined &&
      nowTimestamp - this.lastCleanupAt < SESSION_CLEANUP_INTERVAL_MS
    ) {
      return 0;
    }

    const idleCutoff = new Date(
      nowTimestamp - SESSION_IDLE_LIFETIME_MS,
    ).toISOString();
    const deleted = new SessionRepository(this.database).deleteExpired(
      now.toISOString(),
      idleCutoff,
    );
    this.lastCleanupAt = nowTimestamp;
    return deleted;
  }
}
