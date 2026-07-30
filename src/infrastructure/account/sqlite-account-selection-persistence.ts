import "server-only";

import type { AccountSelectionPersistence } from "../../application/account/account-selection-service";
import type { AppDatabase } from "../database/database";
import { SessionRepository } from "../database/session-repository";

export class SqliteAccountSelectionPersistence implements AccountSelectionPersistence {
  constructor(private readonly database: AppDatabase) {}

  findSelection(tokenHash: string, userId: string): string | null | undefined {
    const session = new SessionRepository(this.database).findByTokenHash(
      tokenHash,
    );
    if (!session || session.userId !== userId) return undefined;
    return session.selectedAccountRef;
  }

  updateSelection(
    tokenHash: string,
    userId: string,
    accountRef: string | null,
  ): boolean {
    return new SessionRepository(this.database).updateSelectedAccountRef(
      tokenHash,
      userId,
      accountRef,
    );
  }
}
