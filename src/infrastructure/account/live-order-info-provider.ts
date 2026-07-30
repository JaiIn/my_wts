import "server-only";

import {
  cloneBuyingPower,
  cloneCommissions,
  cloneSellableQuantity,
  OrderInfoProviderError,
  type OrderInfoProvider,
} from "../../application/account/order-info-provider";
import type { Commission } from "../../domain/account/order-info";
import {
  decodeTossEnvelope,
  TossEnvelopeDecodeError,
} from "../../integrations/toss/envelope";
import {
  tossBuyingPowerResponseSchema,
  tossCommissionListSchema,
  tossSellableQuantityResponseSchema,
} from "../../integrations/toss/order-info-schemas";
import type { AccountScopedReadonlyTossClient } from "../toss/readonly-http-client";

function upstreamError(code: string): OrderInfoProviderError {
  if (code === "rate-limit-exceeded") {
    return new OrderInfoProviderError("UPSTREAM_RATE_LIMITED", true);
  }
  if (code === "unauthorized") {
    return new OrderInfoProviderError("UPSTREAM_AUTH_FAILED");
  }
  return new OrderInfoProviderError("UPSTREAM_UNKNOWN_ERROR");
}

function canonicalSymbol(symbol: string): string {
  const canonical = symbol.trim().toUpperCase();
  if (!/^[A-Za-z0-9.-]{1,32}$/.test(canonical)) {
    throw new TossEnvelopeDecodeError("INVALID_RESULT");
  }
  return canonical;
}

function normalizeCommissions(
  commissions: readonly Commission[],
): readonly Commission[] {
  for (const commission of commissions) {
    if (
      commission.startDate &&
      commission.endDate &&
      commission.startDate > commission.endDate
    ) {
      throw new TossEnvelopeDecodeError("INVALID_RESULT");
    }
  }
  return cloneCommissions(
    [...commissions].sort((left, right) => {
      const country = left.marketCountry.localeCompare(
        right.marketCountry,
        "en",
      );
      if (country !== 0) return country;
      return (left.startDate ?? "").localeCompare(
        right.startDate ?? "",
        "en",
      );
    }),
  );
}

export function createLiveOrderInfoProvider(
  client: AccountScopedReadonlyTossClient,
): OrderInfoProvider {
  return Object.freeze({
    async getBuyingPower(accountSeq, currency) {
      const response = await client.getAccountScoped({
        path: "/api/v1/buying-power",
        operation: "getBuyingPower",
        accountSeq,
        query: { currency },
      });
      const envelope = decodeTossEnvelope(
        response.data,
        tossBuyingPowerResponseSchema,
      );
      if (!envelope.ok) throw upstreamError(envelope.error.code);
      if (envelope.result.currency !== currency) {
        throw new TossEnvelopeDecodeError("INVALID_RESULT");
      }
      return cloneBuyingPower(envelope.result);
    },
    async getSellableQuantity(accountSeq, symbol) {
      const canonical = canonicalSymbol(symbol);
      const response = await client.getAccountScoped({
        path: "/api/v1/sellable-quantity",
        operation: "getSellableQuantity",
        accountSeq,
        query: { symbol: canonical },
      });
      const envelope = decodeTossEnvelope(
        response.data,
        tossSellableQuantityResponseSchema,
      );
      if (!envelope.ok) throw upstreamError(envelope.error.code);
      return cloneSellableQuantity({
        symbol: canonical,
        sellableQuantity: envelope.result.sellableQuantity,
      });
    },
    async getCommissions(accountSeq) {
      const response = await client.getAccountScoped({
        path: "/api/v1/commissions",
        operation: "getCommissions",
        accountSeq,
      });
      const envelope = decodeTossEnvelope(
        response.data,
        tossCommissionListSchema,
      );
      if (!envelope.ok) throw upstreamError(envelope.error.code);
      return normalizeCommissions(envelope.result);
    },
  });
}
