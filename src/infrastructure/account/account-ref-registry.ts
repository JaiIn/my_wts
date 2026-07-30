import "server-only";

import { randomBytes } from "node:crypto";

import {
  AccountContractError,
  isCanonicalAccountRef,
  type Account,
} from "../../domain/account/account";

type AccountReferenceRecord = Readonly<{
  accountRef: string;
  accountSeq: number;
}>;

type AccountReferenceFactory = () => string;

function createOpaqueReference(): string {
  return `acct_${randomBytes(24).toString("base64url")}`;
}

export class AccountRefRegistry {
  private readonly scopes = new Map<
    string,
    Map<number, AccountReferenceRecord>
  >();

  constructor(
    private readonly createReference: AccountReferenceFactory = createOpaqueReference,
  ) {}

  reconcile(
    sessionScope: string,
    accounts: readonly Account[],
  ): ReadonlyMap<number, string> {
    if (!sessionScope) {
      throw new AccountContractError("INVALID_ACCOUNT_REFERENCE");
    }
    const accountSequences = new Set<number>();
    for (const account of accounts) {
      if (
        !Number.isSafeInteger(account.accountSeq) ||
        account.accountSeq < 1 ||
        accountSequences.has(account.accountSeq)
      ) {
        throw new AccountContractError("INVALID_ACCOUNT_SEQUENCE");
      }
      accountSequences.add(account.accountSeq);
    }

    const records =
      this.scopes.get(sessionScope) ??
      new Map<number, AccountReferenceRecord>();
    for (const accountSeq of records.keys()) {
      if (!accountSequences.has(accountSeq)) records.delete(accountSeq);
    }
    for (const accountSeq of accountSequences) {
      if (!records.has(accountSeq)) {
        const accountRef = this.createReference();
        if (
          !isCanonicalAccountRef(accountRef) ||
          String(accountSeq) === accountRef ||
          records.values().some((record) => record.accountRef === accountRef)
        ) {
          throw new AccountContractError("INVALID_ACCOUNT_REFERENCE");
        }
        records.set(accountSeq, Object.freeze({ accountRef, accountSeq }));
      }
    }
    this.scopes.set(sessionScope, records);
    return new Map(
      [...records].map(([accountSeq, record]) => [
        accountSeq,
        record.accountRef,
      ]),
    );
  }

  resolve(sessionScope: string, accountRef: string): number | undefined {
    if (!isCanonicalAccountRef(accountRef)) return undefined;
    for (const record of this.scopes.get(sessionScope)?.values() ?? []) {
      if (record.accountRef === accountRef) return record.accountSeq;
    }
    return undefined;
  }

  clear(sessionScope: string): void {
    this.scopes.delete(sessionScope);
  }
}
