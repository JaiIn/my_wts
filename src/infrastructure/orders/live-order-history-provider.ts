import "server-only";

import type { OrderHistoryProvider } from "../../application/orders/order-history-provider";
import type { TossQuery } from "../toss/readonly-http-client";
import type { AccountScopedReadonlyTossClient } from "../toss/readonly-http-client";
import { decodeOrderHistoryPage } from "./order-history-page-decoder";

export function createLiveOrderHistoryProvider(
  client: AccountScopedReadonlyTossClient,
): OrderHistoryProvider {
  return Object.freeze({
    async getOrders(accountSeq, input) {
      const query: TossQuery = Object.freeze({
        status: input.status,
        ...(input.symbol === undefined ? {} : { symbol: input.symbol }),
        ...(input.from === undefined ? {} : { from: input.from }),
        ...(input.to === undefined ? {} : { to: input.to }),
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        limit: String(input.limit),
      });
      const response = await client.getAccountScoped({
        path: "/api/v1/orders",
        operation: "getOrders",
        accountSeq,
        query,
      });
      return decodeOrderHistoryPage(response.data, input.status);
    },
  });
}
