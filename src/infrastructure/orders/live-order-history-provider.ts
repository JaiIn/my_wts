import "server-only";

import type { OrderHistoryProvider } from "../../application/orders/order-history-provider";
import { encodeOrderIdPathSegment } from "../../application/orders/order-id";
import type { TossQuery } from "../toss/readonly-http-client";
import type { AccountScopedReadonlyTossClient } from "../toss/readonly-http-client";
import { decodeOrderHistoryPage } from "./order-history-page-decoder";
import { decodeOrderDetail } from "./order-history-page-decoder";

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
    async getOrder(accountSeq, orderId) {
      const encodedOrderId = encodeOrderIdPathSegment(orderId);
      const response = await client.getAccountScoped({
        path: `/api/v1/orders/${encodedOrderId}`,
        operation: "getOrder",
        accountSeq,
      });
      return decodeOrderDetail(response.data);
    },
  });
}
