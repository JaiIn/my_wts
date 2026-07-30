import type { Account } from "../../domain/account/account";

export type AccountProvider = Readonly<{
  getAccounts(): Promise<readonly Account[]>;
}>;

export class AccountProviderError extends Error {
  constructor(
    readonly code:
      | "UPSTREAM_AUTH_FAILED"
      | "UPSTREAM_RATE_LIMITED"
      | "UPSTREAM_TIMEOUT"
      | "UPSTREAM_UNAVAILABLE"
      | "UPSTREAM_INVALID_RESPONSE"
      | "UPSTREAM_UNKNOWN_ERROR",
    readonly retryable = false,
  ) {
    super("ACCOUNT_PROVIDER_ERROR");
    this.name = "AccountProviderError";
  }
}

export function cloneAccounts(accounts: readonly Account[]): readonly Account[] {
  return Object.freeze(accounts.map((account) => Object.freeze({ ...account })));
}
