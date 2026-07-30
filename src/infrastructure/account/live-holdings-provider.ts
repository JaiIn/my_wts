import "server-only";

import {
  cloneHoldings,
  HoldingsProviderError,
  type HoldingsProvider,
} from "../../application/account/holdings-provider";
import {
  decodeTossEnvelope,
  TossEnvelopeDecodeError,
} from "../../integrations/toss/envelope";
import { tossHoldingsOverviewSchema } from "../../integrations/toss/holdings-schemas";
import type { AccountScopedReadonlyTossClient } from "../toss/readonly-http-client";
import { toHoldingsOverview } from "./holdings-mapper";

function canonicalSymbol(symbol: string | undefined): string | undefined {
  if (symbol === undefined) return undefined;
  const canonical = symbol.trim().toUpperCase();
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(canonical)) {
    throw new TossEnvelopeDecodeError("INVALID_RESULT");
  }
  return canonical;
}

function upstreamError(code: string): HoldingsProviderError {
  if (code === "rate-limit-exceeded") {
    return new HoldingsProviderError("UPSTREAM_RATE_LIMITED", true);
  }
  if (code === "unauthorized") {
    return new HoldingsProviderError("UPSTREAM_AUTH_FAILED");
  }
  return new HoldingsProviderError("UPSTREAM_UNKNOWN_ERROR");
}

export function createLiveHoldingsProvider(
  client: AccountScopedReadonlyTossClient,
): HoldingsProvider {
  return Object.freeze({
    async getHoldings(accountSeq, symbol) {
      const canonical = canonicalSymbol(symbol);
      const response = await client.getAccountScoped({
        path: "/api/v1/holdings",
        operation: "getHoldings",
        accountSeq,
        query: canonical ? { symbol: canonical } : undefined,
      });
      const envelope = decodeTossEnvelope(
        response.data,
        tossHoldingsOverviewSchema,
      );
      if (!envelope.ok) throw upstreamError(envelope.error.code);
      return cloneHoldings(toHoldingsOverview(envelope.result));
    },
  });
}
