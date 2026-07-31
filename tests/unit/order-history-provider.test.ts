import { describe, expect, it, vi } from "vitest";

import { OrderHistoryProviderError } from "../../src/application/orders/order-history-provider";
import type { OrderHistoryQuery } from "../../src/domain/orders/order-history";
import { createLiveOrderHistoryProvider } from "../../src/infrastructure/orders/live-order-history-provider";
import {
  MOCK_EMPTY_ORDER_HISTORY,
  MOCK_MALFORMED_ORDER_HISTORY_PAGE,
  MOCK_ORDER_HISTORY_ACCOUNT_101,
  MOCK_ORDER_HISTORY_ACCOUNT_202,
  MOCK_ORDER_HISTORY_ERROR,
} from "../../src/infrastructure/orders/mock-order-history-fixtures";
import {
  createMockOrderHistoryProvider,
  type MockOrderHistorySource,
} from "../../src/infrastructure/orders/mock-order-history-provider";
import type { AccountScopedReadonlyTossClient } from "../../src/infrastructure/toss/readonly-http-client";

const OPEN: OrderHistoryQuery = Object.freeze({
  status: "OPEN",
  limit: 20,
});
const CLOSED: OrderHistoryQuery = Object.freeze({
  status: "CLOSED",
  limit: 2,
});

describe("order history providers", () => {
  it("returns all matching OPEN orders and ignores cursor and limit", async () => {
    const page = await createMockOrderHistoryProvider().getOrders(101, {
      status: "OPEN",
      cursor: "ignored-by-open-contract",
      limit: 1,
    });
    expect(page.orders).toHaveLength(5);
    expect(page.nextCursor).toBeNull();
    expect(page.hasNext).toBe(false);
    expect(page.orders.some((order) => order.status.kind === "UNKNOWN")).toBe(
      true,
    );
  });

  it("filters symbols and inclusive Asia/Seoul calendar dates", async () => {
    const provider = createMockOrderHistoryProvider();
    const page = await provider.getOrders(202, {
      ...OPEN,
      symbol: "ACCTB",
      from: "2026-02-01",
      to: "2026-02-01",
    });
    expect(page.orders).toHaveLength(1);
    expect(page.orders[0]!.orderedAt).toBe("2026-01-31T23:30:00-05:00");
    expect(
      await provider.getOrders(202, {
        ...OPEN,
        from: "2026-02-02",
      }),
    ).toMatchObject({ orders: [] });
  });

  it("paginates CLOSED orders without duplication or omission", async () => {
    const provider = createMockOrderHistoryProvider();
    const orderIds: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await provider.getOrders(101, {
        ...CLOSED,
        ...(cursor === undefined ? {} : { cursor }),
      });
      orderIds.push(...page.orders.map((order) => order.orderId));
      cursor = page.nextCursor ?? undefined;
      expect(page.hasNext).toBe(page.nextCursor !== null);
    } while (cursor !== undefined);
    expect(orderIds).toHaveLength(8);
    expect(new Set(orderIds)).toHaveLength(8);
  });

  it("binds opaque cursors to account and filter conditions", async () => {
    const provider = createMockOrderHistoryProvider();
    const first = await provider.getOrders(101, CLOSED);
    expect(first.nextCursor).toMatch(/^mock_cursor_/);
    await expect(
      provider.getOrders(202, { ...CLOSED, cursor: first.nextCursor! }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    await expect(
      provider.getOrders(101, {
        ...CLOSED,
        symbol: "TSTX",
        cursor: first.nextCursor!,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });

  it("supports deterministic empty accounts and isolates returned data", async () => {
    const provider = createMockOrderHistoryProvider();
    expect(await provider.getOrders(303, OPEN)).toMatchObject({ orders: [] });
    const first = await provider.getOrders(101, OPEN);
    expect(() => {
      (first.orders as unknown as unknown[]).push({});
    }).toThrow();
    expect((await provider.getOrders(101, OPEN)).orders).toHaveLength(5);
  });

  it("rejects upstream error and malformed page fixtures", async () => {
    const errorSources = new Map<number, MockOrderHistorySource>([
      [
        404,
        {
          OPEN: MOCK_ORDER_HISTORY_ERROR,
          CLOSED: MOCK_ORDER_HISTORY_ERROR,
        },
      ],
      [
        405,
        {
          OPEN: MOCK_MALFORMED_ORDER_HISTORY_PAGE,
          CLOSED: MOCK_MALFORMED_ORDER_HISTORY_PAGE,
        },
      ],
    ]);
    const provider = createMockOrderHistoryProvider(errorSources);
    await expect(provider.getOrders(404, OPEN)).rejects.toBeInstanceOf(
      OrderHistoryProviderError,
    );
    await expect(provider.getOrders(405, OPEN)).rejects.toThrow();
  });

  it("maps only approved query fields through the live account-scoped GET", async () => {
    const getAccountScoped = vi.fn().mockResolvedValue({
      data: MOCK_EMPTY_ORDER_HISTORY.CLOSED,
      status: 200,
      headers: {},
    });
    const provider = createLiveOrderHistoryProvider({
      getAccountScoped,
    } as unknown as AccountScopedReadonlyTossClient);
    await provider.getOrders(101, {
      status: "CLOSED",
      symbol: "AAPL",
      from: "2026-01-01",
      to: "2026-01-31",
      cursor: "opaque+cursor=",
      limit: 7,
    });
    expect(getAccountScoped).toHaveBeenCalledWith({
      path: "/api/v1/orders",
      operation: "getOrders",
      accountSeq: 101,
      query: {
        status: "CLOSED",
        symbol: "AAPL",
        from: "2026-01-01",
        to: "2026-01-31",
        cursor: "opaque+cursor=",
        limit: "7",
      },
    });
  });

  it("keeps fixture sources deeply frozen", () => {
    expect(Object.isFrozen(MOCK_ORDER_HISTORY_ACCOUNT_101)).toBe(true);
    expect(Object.isFrozen(MOCK_ORDER_HISTORY_ACCOUNT_202)).toBe(true);
  });
});
