import "server-only";

import {
  AccountProviderError,
  cloneAccounts,
  type AccountProvider,
} from "../../application/account/account-provider";
import type { Account } from "../../domain/account/account";
import {
  tossAccountListSchema,
  type TossAccount,
} from "../../integrations/toss/account-schemas";
import { decodeTossEnvelope } from "../../integrations/toss/envelope";
import type { ReadonlyTossClient } from "../toss/readonly-http-client";

function toAccount(account: TossAccount): Account {
  return Object.freeze({ ...account });
}

function upstreamError(code: string): AccountProviderError {
  if (code === "rate-limit-exceeded") {
    return new AccountProviderError("UPSTREAM_RATE_LIMITED", true);
  }
  if (code === "unauthorized") {
    return new AccountProviderError("UPSTREAM_AUTH_FAILED");
  }
  return new AccountProviderError("UPSTREAM_UNKNOWN_ERROR");
}

export function createLiveAccountProvider(
  client: ReadonlyTossClient,
): AccountProvider {
  return Object.freeze({
    async getAccounts() {
      const response = await client.get({
        path: "/api/v1/accounts",
        operation: "getAccounts",
      });
      const envelope = decodeTossEnvelope(
        response.data,
        tossAccountListSchema,
      );
      if (!envelope.ok) throw upstreamError(envelope.error.code);
      return cloneAccounts(envelope.result.map(toAccount));
    },
  });
}
