import { createHash } from "node:crypto";

import {
  cloneOrderHistoryPage,
  OrderHistoryProviderError,
  type OrderHistoryProvider,
} from "../../application/orders/order-history-provider";
import type {
  OrderHistoryGroup,
  OrderHistoryQuery,
} from "../../domain/orders/order-history";
import type { ReadonlyOrder } from "../../domain/orders/readonly-order";
import {
  MOCK_EMPTY_ORDER_HISTORY,
  MOCK_ORDER_HISTORY_ACCOUNT_101,
  MOCK_ORDER_HISTORY_ACCOUNT_202,
} from "./mock-order-history-fixtures";
import { decodeOrderHistoryPage } from "./order-history-page-decoder";
import { decodeOrderDetail } from "./order-history-page-decoder";

export type MockOrderHistorySource = Readonly<
  Record<OrderHistoryGroup, unknown>
>;

const DEFAULT_SOURCES = new Map<number, MockOrderHistorySource>([
  [101, MOCK_ORDER_HISTORY_ACCOUNT_101],
  [202, MOCK_ORDER_HISTORY_ACCOUNT_202],
  [303, MOCK_EMPTY_ORDER_HISTORY],
]);

const KST_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

type CursorRecord = Readonly<{
  signature: string;
  offset: number;
}>;

function kstDate(timestamp: string): string {
  const parts = Object.fromEntries(
    KST_DATE_FORMATTER.formatToParts(new Date(timestamp))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function matches(order: ReadonlyOrder, query: OrderHistoryQuery): boolean {
  if (query.symbol !== undefined && order.symbol !== query.symbol) {
    return false;
  }
  const date = kstDate(order.orderedAt);
  return (
    (query.from === undefined || date >= query.from) &&
    (query.to === undefined || date <= query.to)
  );
}

function querySignature(accountSeq: number, query: OrderHistoryQuery): string {
  return JSON.stringify([
    accountSeq,
    query.status,
    query.symbol ?? null,
    query.from ?? null,
    query.to ?? null,
    query.limit,
  ]);
}

function cursorToken(signature: string, offset: number): string {
  return `mock_cursor_${createHash("sha256")
    .update(`${signature}:${offset}`)
    .digest("base64url")
    .slice(0, 32)}`;
}

export function createMockOrderHistoryProvider(
  sources: ReadonlyMap<number, MockOrderHistorySource> = DEFAULT_SOURCES,
  detailOverrides: ReadonlyMap<string, unknown> = new Map(),
): OrderHistoryProvider {
  const cursors = new Map<string, CursorRecord>();
  return Object.freeze({
    async getOrders(accountSeq, query) {
      const source = sources.get(accountSeq) ?? MOCK_EMPTY_ORDER_HISTORY;
      const page = decodeOrderHistoryPage(source[query.status], query.status);
      const filtered = page.orders.filter((order) => matches(order, query));
      if (query.status === "OPEN") {
        return cloneOrderHistoryPage({
          orders: filtered,
          nextCursor: null,
          hasNext: false,
        });
      }

      const signature = querySignature(accountSeq, query);
      let offset = 0;
      if (query.cursor !== undefined) {
        const record = cursors.get(query.cursor);
        if (!record || record.signature !== signature) {
          throw new OrderHistoryProviderError("INVALID_CURSOR");
        }
        offset = record.offset;
      }
      const orders = filtered.slice(offset, offset + query.limit);
      const nextOffset = offset + orders.length;
      const hasNext = nextOffset < filtered.length;
      const nextCursor = hasNext ? cursorToken(signature, nextOffset) : null;
      if (nextCursor !== null) {
        cursors.set(
          nextCursor,
          Object.freeze({ signature, offset: nextOffset }),
        );
      }
      return cloneOrderHistoryPage({ orders, nextCursor, hasNext });
    },
    async getOrder(accountSeq, orderId) {
      const override = detailOverrides.get(`${accountSeq}:${orderId}`);
      if (override !== undefined) {
        return decodeOrderDetail(override);
      }
      const source = sources.get(accountSeq) ?? MOCK_EMPTY_ORDER_HISTORY;
      for (const group of ["OPEN", "CLOSED"] as const) {
        const page = decodeOrderHistoryPage(source[group], group);
        const order = page.orders.find(
          (candidate) => candidate.orderId === orderId,
        );
        if (order) {
          return cloneOrderHistoryPage({
            orders: [order],
            nextCursor: null,
            hasNext: false,
          }).orders[0]!;
        }
      }
      throw new OrderHistoryProviderError("ORDER_NOT_FOUND");
    },
  });
}
