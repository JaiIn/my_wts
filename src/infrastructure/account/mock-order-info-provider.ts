import {
  cloneBuyingPower,
  cloneCommissions,
  cloneSellableQuantity,
  OrderInfoProviderError,
  type OrderInfoProvider,
} from "../../application/account/order-info-provider";
import type {
  BuyingPower,
  Commission,
  SellableQuantity,
} from "../../domain/account/order-info";
import { decodeTossEnvelope } from "../../integrations/toss/envelope";
import {
  tossBuyingPowerResponseSchema,
  tossCommissionListSchema,
  tossSellableQuantityResponseSchema,
} from "../../integrations/toss/order-info-schemas";
import {
  MOCK_BUYING_POWER,
  MOCK_COMMISSIONS,
  MOCK_SELLABLE_QUANTITY,
} from "./mock-order-info-fixtures";

function providerError(): OrderInfoProviderError {
  return new OrderInfoProviderError("UPSTREAM_UNAVAILABLE", true);
}

export function createMockOrderInfoProvider(): OrderInfoProvider {
  return Object.freeze({
    async getBuyingPower(accountSeq, currency) {
      const byAccount = MOCK_BUYING_POWER[
        accountSeq as keyof typeof MOCK_BUYING_POWER
      ];
      const envelope = byAccount?.[currency];
      if (!envelope) throw providerError();
      const decoded = decodeTossEnvelope(
        envelope,
        tossBuyingPowerResponseSchema,
      );
      if (!decoded.ok) throw providerError();
      return cloneBuyingPower(decoded.result as BuyingPower);
    },
    async getSellableQuantity(accountSeq, symbol) {
      const byAccount = MOCK_SELLABLE_QUANTITY[
        accountSeq as keyof typeof MOCK_SELLABLE_QUANTITY
      ];
      const envelope = byAccount?.[symbol as keyof typeof byAccount];
      if (!envelope) {
        return Object.freeze({
          symbol,
          sellableQuantity: "0",
        }) as SellableQuantity;
      }
      const decoded = decodeTossEnvelope(
        envelope,
        tossSellableQuantityResponseSchema,
      );
      if (!decoded.ok) throw providerError();
      return cloneSellableQuantity({
        symbol,
        sellableQuantity: decoded.result.sellableQuantity,
      });
    },
    async getCommissions(accountSeq) {
      const envelope =
        MOCK_COMMISSIONS[accountSeq as keyof typeof MOCK_COMMISSIONS];
      if (!envelope) throw providerError();
      const decoded = decodeTossEnvelope(envelope, tossCommissionListSchema);
      if (!decoded.ok) throw providerError();
      return cloneCommissions(decoded.result as readonly Commission[]);
    },
  });
}
