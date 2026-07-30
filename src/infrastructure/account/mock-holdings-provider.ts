import {
  cloneHoldings,
  HoldingsProviderError,
  type HoldingsProvider,
} from "../../application/account/holdings-provider";
import { decodeTossEnvelope } from "../../integrations/toss/envelope";
import { tossHoldingsOverviewSchema } from "../../integrations/toss/holdings-schemas";
import { toHoldingsOverview } from "./holdings-mapper";
import {
  MOCK_EMPTY_HOLDINGS_ENVELOPE,
  MOCK_HOLDINGS_ACCOUNT_101_ENVELOPE,
  MOCK_HOLDINGS_ERROR_ENVELOPE,
  MOCK_UNKNOWN_HOLDINGS_ENVELOPE,
} from "./mock-holdings-fixtures";

const ENVELOPES = new Map<number, unknown>([
  [101, MOCK_HOLDINGS_ACCOUNT_101_ENVELOPE],
  [202, MOCK_EMPTY_HOLDINGS_ENVELOPE],
  [303, MOCK_UNKNOWN_HOLDINGS_ENVELOPE],
  [404, MOCK_HOLDINGS_ERROR_ENVELOPE],
]);

export function createMockHoldingsProvider(
  envelopes: ReadonlyMap<number, unknown> = ENVELOPES,
): HoldingsProvider {
  return Object.freeze({
    async getHoldings(accountSeq, symbol) {
      const envelope = envelopes.get(accountSeq) ?? MOCK_EMPTY_HOLDINGS_ENVELOPE;
      const decoded = decodeTossEnvelope(envelope, tossHoldingsOverviewSchema);
      if (!decoded.ok) {
        throw new HoldingsProviderError("UPSTREAM_UNAVAILABLE", true);
      }
      const holdings = toHoldingsOverview(decoded.result);
      if (!symbol) return cloneHoldings(holdings);
      const canonical = symbol.trim().toUpperCase();
      return cloneHoldings({
        ...holdings,
        items: holdings.items.filter((item) => item.symbol === canonical),
      });
    },
  });
}
