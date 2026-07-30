import "server-only";

import { hashCanonicalSessionToken } from "../../domain/auth/session-token";
import { isCanonicalAccountRef } from "../../domain/account/account";
import type { SessionUser } from "../auth/session-service";
import { SessionAuthenticationError } from "../auth/session-service";

export type AccountSelectionContext = Readonly<{
  userId: string;
  tokenHash: string;
  sessionScope: string;
}>;

export type SelectedAccountResolution = Readonly<{
  accountRef: string;
  accountSeq: number;
}>;

export interface AccountSelectionPersistence {
  findSelection(tokenHash: string, userId: string): string | null | undefined;
  updateSelection(
    tokenHash: string,
    userId: string,
    accountRef: string | null,
  ): boolean;
}

export interface AccountSelectionRegistry {
  resolve(sessionScope: string, accountRef: string): number | undefined;
}

export class AccountReferenceInvalidError extends Error {
  readonly code = "ACCOUNT_REF_INVALID";

  constructor() {
    super("ACCOUNT_REF_INVALID");
    this.name = "AccountReferenceInvalidError";
  }
}

export class AccountSelectionPersistenceError extends Error {
  readonly code = "DATABASE_ERROR";

  constructor() {
    super("DATABASE_ERROR");
    this.name = "AccountSelectionPersistenceError";
  }
}

export class AccountSelectionService {
  constructor(
    private readonly authenticator: {
      authenticate(token: unknown): SessionUser;
    },
    private readonly persistence: AccountSelectionPersistence,
    private readonly registry: AccountSelectionRegistry,
  ) {}

  authenticate(token: unknown): AccountSelectionContext {
    const user = this.authenticator.authenticate(token);
    const tokenHash = hashCanonicalSessionToken(token);
    if (!tokenHash) throw new SessionAuthenticationError("AUTH_REQUIRED");
    return Object.freeze({
      userId: user.id,
      tokenHash,
      sessionScope: `${user.id}:${tokenHash}`,
    });
  }

  select(token: unknown, accountRef: unknown): void {
    const context = this.authenticate(token);
    if (
      !isCanonicalAccountRef(accountRef) ||
      this.registry.resolve(context.sessionScope, accountRef) === undefined
    ) {
      throw new AccountReferenceInvalidError();
    }
    this.persist(context, accountRef);
  }

  clear(token: unknown): void {
    this.persist(this.authenticate(token), null);
  }

  resolveCurrent(
    context: AccountSelectionContext,
  ): SelectedAccountResolution | null {
    let selectedAccountRef: string | null | undefined;
    try {
      selectedAccountRef = this.persistence.findSelection(
        context.tokenHash,
        context.userId,
      );
    } catch {
      throw new AccountSelectionPersistenceError();
    }
    if (selectedAccountRef === undefined) {
      throw new SessionAuthenticationError("AUTH_REQUIRED");
    }
    if (selectedAccountRef === null) return null;
    const accountSeq = this.registry.resolve(
      context.sessionScope,
      selectedAccountRef,
    );
    if (accountSeq !== undefined) {
      return Object.freeze({
        accountRef: selectedAccountRef,
        accountSeq,
      });
    }
    this.persist(context, null);
    return null;
  }

  private persist(
    context: AccountSelectionContext,
    accountRef: string | null,
  ): void {
    try {
      if (
        !this.persistence.updateSelection(
          context.tokenHash,
          context.userId,
          accountRef,
        )
      ) {
        throw new SessionAuthenticationError("AUTH_REQUIRED");
      }
    } catch (error) {
      if (error instanceof SessionAuthenticationError) throw error;
      throw new AccountSelectionPersistenceError();
    }
  }
}
