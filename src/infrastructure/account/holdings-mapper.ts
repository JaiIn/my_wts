import { decimalFromString } from "../../domain/common/decimal";
import type {
  HoldingsItem,
  HoldingsOverview,
} from "../../domain/account/holdings";
import { TossEnvelopeDecodeError } from "../../integrations/toss/envelope";
import type { TossHoldingsOverview } from "../../integrations/toss/holdings-schemas";

function compareItems(left: HoldingsItem, right: HoldingsItem): number {
  const country = left.marketCountry.localeCompare(right.marketCountry, "en");
  if (country !== 0) return country;
  return left.symbol.localeCompare(right.symbol, "en");
}

export function toHoldingsOverview(
  value: TossHoldingsOverview,
): HoldingsOverview {
  const items = value.items
    .map((item) => structuredClone(item) as HoldingsItem)
    .sort(compareItems);
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.marketCountry}:${item.symbol}`;
    if (seen.has(key)) throw new TossEnvelopeDecodeError("INVALID_RESULT");
    seen.add(key);
    if (
      decimalFromString(item.quantity).isNegative() ||
      decimalFromString(item.lastPrice).isNegative() ||
      decimalFromString(item.averagePurchasePrice).isNegative()
    ) {
      throw new TossEnvelopeDecodeError("INVALID_RESULT");
    }
  }
  return Object.freeze({
    ...structuredClone(value),
    items: Object.freeze(items),
  }) as HoldingsOverview;
}
