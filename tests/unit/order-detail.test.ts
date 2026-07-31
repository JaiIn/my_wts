import { describe, expect, it, vi } from "vitest";

import {
  decodeOrderIdPathSegment,
  encodeOrderIdPathSegment,
  OrderIdValidationError,
} from "../../src/application/orders/order-id";
import { OrderHistoryProviderError } from "../../src/application/orders/order-history-provider";
import { createLiveOrderHistoryProvider } from "../../src/infrastructure/orders/live-order-history-provider";
import {
  MOCK_MALFORMED_DECIMAL_ORDER,
  MOCK_ORDER_HISTORY_ACCOUNT_101,
} from "../../src/infrastructure/orders/mock-order-history-fixtures";
import { createMockOrderHistoryProvider } from "../../src/infrastructure/orders/mock-order-history-provider";
import type { AccountScopedReadonlyTossClient } from "../../src/infrastructure/toss/readonly-http-client";
import { createOrderTimeline } from "../../src/ui/orders/order-timeline";
import {
  orderDetailQueryKey,
  orderListQueryKey,
} from "../../src/ui/orders/order-query-policy";

describe("readonly order detail", () => {
  it("validates and encodes an opaque order id", () => {
    expect(decodeOrderIdPathSegment("opaque_Order-123")).toBe(
      "opaque_Order-123",
    );
    expect(encodeOrderIdPathSegment("opaque_Order-123")).toBe(
      "opaque_Order-123",
    );
  });

  it.each([
    "",
    " ",
    ".",
    "..",
    "../order",
    "order/id",
    String.raw`order\id`,
    "https://example.invalid/order",
    "//example.invalid/order",
    "%2Forders",
    "%252Forders",
    "%2e%2e",
    "order%00id",
    "order%20id",
    "x".repeat(129),
  ])("rejects order id path bypass: %s", (value) => {
    expect(() => decodeOrderIdPathSegment(value)).toThrow(
      OrderIdValidationError,
    );
  });

  it("keeps list and detail fixtures consistent per account", async () => {
    const provider = createMockOrderHistoryProvider();
    const list = await provider.getOrders(101, {
      status: "CLOSED",
      limit: 100,
    });
    for (const listed of list.orders) {
      const detail = await provider.getOrder(101, listed.orderId);
      expect(detail).toEqual(listed);
      expect(detail.execution.filledQuantity).toBe(
        listed.execution.filledQuantity,
      );
    }
  });

  it("does not disclose a different account order", async () => {
    const provider = createMockOrderHistoryProvider();
    const foreignId = (
      await provider.getOrders(101, { status: "OPEN", limit: 20 })
    ).orders[0]!.orderId;
    await expect(provider.getOrder(202, foreignId)).rejects.toMatchObject({
      code: "ORDER_NOT_FOUND",
    });
    await expect(provider.getOrder(202, "missing-order")).rejects.toEqual(
      new OrderHistoryProviderError("ORDER_NOT_FOUND"),
    );
  });

  it("rejects malformed detail overrides without leaking the fixture", async () => {
    const provider = createMockOrderHistoryProvider(
      new Map([[101, MOCK_ORDER_HISTORY_ACCOUNT_101]]),
      new Map([
        ["101:malformed-detail", { result: MOCK_MALFORMED_DECIMAL_ORDER }],
      ]),
    );
    await expect(provider.getOrder(101, "malformed-detail")).rejects.toThrow();
  });

  it("uses the exact account-scoped GET detail path in the live adapter", async () => {
    const detail = (
      MOCK_ORDER_HISTORY_ACCOUNT_101.OPEN as {
        result: { orders: readonly unknown[] };
      }
    ).result.orders[0];
    const getAccountScoped = vi.fn().mockResolvedValue({
      status: 200,
      data: { result: detail },
    });
    const provider = createLiveOrderHistoryProvider({
      getAccountScoped,
    } as unknown as AccountScopedReadonlyTossClient);
    await provider.getOrder(101, "opaque_Order-123");
    expect(getAccountScoped).toHaveBeenCalledWith({
      path: "/api/v1/orders/opaque_Order-123",
      operation: "getOrder",
      accountSeq: 101,
    });
  });

  it("creates a deterministic timeline only from provided events", async () => {
    const order = await createMockOrderHistoryProvider().getOrder(
      101,
      "fixture-order-5",
    );
    const timeline = createOrderTimeline({
      ...order,
      orderedAt: "2026-01-01T09:31:00+09:00",
      canceledAt: "2026-01-01T09:31:00+09:00",
      execution: {
        ...order.execution,
        filledAt: "2026-01-01T09:31:00+09:00",
      },
    });
    expect(timeline.map((event) => event.type)).toEqual([
      "ORDERED",
      "FILLED",
      "CANCELED",
    ]);
    expect(timeline).toHaveLength(3);
  });

  it("isolates list/detail cache keys by account, group, filter, and order", () => {
    const first = orderListQueryKey("acct_first", "CLOSED", {
      symbol: "AAPL",
      limit: 20,
    });
    expect(first).not.toEqual(
      orderListQueryKey("acct_second", "CLOSED", {
        symbol: "AAPL",
        limit: 20,
      }),
    );
    expect(first).not.toEqual(
      orderListQueryKey("acct_first", "OPEN", {
        symbol: "AAPL",
        limit: 20,
      }),
    );
    expect(first).not.toEqual(
      orderListQueryKey("acct_first", "CLOSED", {
        symbol: "005930",
        limit: 20,
      }),
    );
    expect(orderDetailQueryKey("acct_first", "one")).not.toEqual(
      orderDetailQueryKey("acct_first", "two"),
    );
  });
});
