import type { AccountProvider } from "../../application/account/account-provider";
import {
  AccountProviderError,
  cloneAccounts,
} from "../../application/account/account-provider";
import type { Account } from "../../domain/account/account";
import {
  tossAccountListSchema,
  type TossAccount,
} from "../../integrations/toss/account-schemas";
import { decodeTossEnvelope } from "../../integrations/toss/envelope";
import { MOCK_MULTIPLE_ACCOUNTS_ENVELOPE } from "./mock-account-fixtures";

function toAccount(account: TossAccount): Account {
  return Object.freeze({ ...account });
}

export function createMockAccountProvider(
  envelope: unknown = MOCK_MULTIPLE_ACCOUNTS_ENVELOPE,
): AccountProvider {
  return Object.freeze({
    async getAccounts() {
      const decoded = decodeTossEnvelope(envelope, tossAccountListSchema);
      if (!decoded.ok) {
        throw new AccountProviderError("UPSTREAM_UNAVAILABLE", true);
      }
      return cloneAccounts(decoded.result.map(toAccount));
    },
  });
}
