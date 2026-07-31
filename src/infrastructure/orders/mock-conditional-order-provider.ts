import { createHash } from "node:crypto";

import {
  cloneConditionalOrder,
  cloneConditionalOrderPage,
  ConditionalOrderProviderError,
  type ConditionalOrderHistoryProvider,
} from "../../application/orders/conditional-order-provider";
import type {
  ConditionalOrderHistoryGroup,
  ConditionalOrderHistoryQuery,
} from "../../domain/orders/conditional-order-history";
import {
  MOCK_CONDITIONAL_ACCOUNT_101,
  MOCK_CONDITIONAL_ACCOUNT_202,
  MOCK_EMPTY_CONDITIONAL_HISTORY,
} from "./mock-conditional-order-fixtures";
import { decodeConditionalOrderDetail } from "./conditional-order-page-decoder";
import { decodeReadonlyConditionalOrder } from "./readonly-conditional-order-decoder";

export type MockConditionalOrderSource = Readonly<
  Record<
    ConditionalOrderHistoryGroup,
    Readonly<{ result: Readonly<{ conditionalOrders: readonly unknown[] }> }>
  >
>;

const DEFAULT_SOURCES = new Map<number, MockConditionalOrderSource>([
  [101, MOCK_CONDITIONAL_ACCOUNT_101],
  [202, MOCK_CONDITIONAL_ACCOUNT_202],
  [303, MOCK_EMPTY_CONDITIONAL_HISTORY],
]);

type CursorRecord = Readonly<{ signature: string; offset: number }>;

function signature(
  accountSeq: number,
  query: ConditionalOrderHistoryQuery,
): string {
  return JSON.stringify([
    accountSeq,
    query.status,
    query.symbol ?? null,
    query.limit,
  ]);
}

function cursorToken(value: string, offset: number): string {
  return `conditional_${createHash("sha256")
    .update(`${value}:${offset}`)
    .digest("base64url")
    .slice(0, 32)}`;
}

export function createMockConditionalOrderProvider(
  sources: ReadonlyMap<number, MockConditionalOrderSource> = DEFAULT_SOURCES,
  detailOverrides: ReadonlyMap<string, unknown> = new Map(),
): ConditionalOrderHistoryProvider {
  const cursors = new Map<string, CursorRecord>();
  return Object.freeze({
    async getConditionalOrders(accountSeq, query) {
      const source = sources.get(accountSeq) ?? MOCK_EMPTY_CONDITIONAL_HISTORY;
      const decoded = source[query.status].result.conditionalOrders.map(
        decodeReadonlyConditionalOrder,
      );
      const filtered =
        query.symbol === undefined
          ? decoded
          : decoded.filter((item) => item.symbol === query.symbol);
      const querySignature = signature(accountSeq, query);
      let offset = 0;
      if (query.cursor !== undefined) {
        const cursor = cursors.get(query.cursor);
        if (!cursor || cursor.signature !== querySignature) {
          throw new ConditionalOrderProviderError("INVALID_CURSOR");
        }
        offset = cursor.offset;
      }
      const conditionalOrders = filtered.slice(offset, offset + query.limit);
      const nextOffset = offset + conditionalOrders.length;
      const hasNext = nextOffset < filtered.length;
      const nextCursor = hasNext
        ? cursorToken(querySignature, nextOffset)
        : null;
      if (nextCursor !== null) {
        cursors.set(
          nextCursor,
          Object.freeze({ signature: querySignature, offset: nextOffset }),
        );
      }
      return cloneConditionalOrderPage({
        conditionalOrders,
        nextCursor,
        hasNext,
      });
    },
    async getConditionalOrder(accountSeq, conditionalOrderId) {
      const override = detailOverrides.get(
        `${accountSeq}:${conditionalOrderId}`,
      );
      if (override !== undefined) {
        return decodeConditionalOrderDetail(override);
      }
      const source = sources.get(accountSeq) ?? MOCK_EMPTY_CONDITIONAL_HISTORY;
      for (const group of ["OPEN", "CLOSED"] as const) {
        const match = source[group].result.conditionalOrders
          .map(decodeReadonlyConditionalOrder)
          .find(
            (candidate) => candidate.conditionalOrderId === conditionalOrderId,
          );
        if (match) return cloneConditionalOrder(match);
      }
      throw new ConditionalOrderProviderError("CONDITIONAL_ORDER_NOT_FOUND");
    },
  });
}
