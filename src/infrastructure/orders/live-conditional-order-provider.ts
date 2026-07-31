import "server-only";

import type { ConditionalOrderHistoryProvider } from "../../application/orders/conditional-order-provider";
import { encodeConditionalOrderIdPathSegment } from "../../application/orders/conditional-order-id";
import type {
  AccountScopedReadonlyTossClient,
  TossQuery,
} from "../toss/readonly-http-client";
import { TossHttpClientError } from "../toss/readonly-http-client";
import { ConditionalOrderProviderError } from "../../application/orders/conditional-order-provider";
import {
  decodeConditionalOrderDetail,
  decodeConditionalOrderPage,
} from "./conditional-order-page-decoder";

export function createLiveConditionalOrderProvider(
  client: AccountScopedReadonlyTossClient,
): ConditionalOrderHistoryProvider {
  async function safe<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof TossHttpClientError)) throw error;
      if (error.code === "TOSS_GET_RATE_LIMITED") {
        throw new ConditionalOrderProviderError(
          "UPSTREAM_RATE_LIMITED",
          error.retryable,
          error.retryAfterMs === undefined
            ? undefined
            : Math.floor(error.retryAfterMs / 1_000),
        );
      }
      if (error.code === "TOSS_GET_AUTHENTICATION_FAILED") {
        throw new ConditionalOrderProviderError("UPSTREAM_AUTH_FAILED");
      }
      if (error.code === "TOSS_GET_TIMEOUT") {
        throw new ConditionalOrderProviderError("UPSTREAM_TIMEOUT", true);
      }
      if (
        error.code === "TOSS_GET_NETWORK_FAILURE" ||
        error.code === "TOSS_GET_ABORTED"
      ) {
        throw new ConditionalOrderProviderError(
          "UPSTREAM_UNAVAILABLE",
          error.retryable,
        );
      }
      throw new ConditionalOrderProviderError(
        "UPSTREAM_UNKNOWN_ERROR",
        error.retryable,
      );
    }
  }
  return Object.freeze({
    async getConditionalOrders(accountSeq, input) {
      const query: TossQuery = Object.freeze({
        status: input.status,
        ...(input.symbol === undefined ? {} : { symbol: input.symbol }),
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        limit: String(input.limit),
      });
      const response = await safe(() =>
        client.getAccountScoped({
          path: "/api/v1/conditional-orders",
          operation: "getConditionalOrders",
          accountSeq,
          query,
        }),
      );
      return decodeConditionalOrderPage(response.data);
    },
    async getConditionalOrder(accountSeq, conditionalOrderId) {
      const encoded = encodeConditionalOrderIdPathSegment(conditionalOrderId);
      const response = await safe(() =>
        client.getAccountScoped({
          path: `/api/v1/conditional-orders/${encoded}`,
          operation: "getConditionalOrder",
          accountSeq,
        }),
      );
      return decodeConditionalOrderDetail(response.data);
    },
  });
}
