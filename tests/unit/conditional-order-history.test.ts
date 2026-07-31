import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import {
  ConditionalOrderIdValidationError,
  decodeConditionalOrderIdPathSegment,
} from "../../src/application/orders/conditional-order-id";
import { ConditionalOrderProviderError } from "../../src/application/orders/conditional-order-provider";
import {
  ConditionalOrderValidationError,
  parseConditionalOrderHistoryQuery,
} from "../../src/application/orders/conditional-order-query";
import {
  KNOWN_CONDITIONAL_GROUP_STATUSES,
  KNOWN_CONDITIONAL_LEG_STATUSES,
  KNOWN_CONDITIONAL_ORDER_TYPES,
} from "../../src/domain/orders/conditional-order";
import { createLiveConditionalOrderProvider } from "../../src/infrastructure/orders/live-conditional-order-provider";
import {
  MOCK_CONDITIONAL_ACCOUNT_101,
  MOCK_MALFORMED_CONDITIONAL_PAGE,
} from "../../src/infrastructure/orders/mock-conditional-order-fixtures";
import { createMockConditionalOrderProvider } from "../../src/infrastructure/orders/mock-conditional-order-provider";
import {
  decodeConditionalOrderDetail,
  decodeConditionalOrderPage,
} from "../../src/infrastructure/orders/conditional-order-page-decoder";
import { decodeReadonlyConditionalOrder } from "../../src/infrastructure/orders/readonly-conditional-order-decoder";
import type { AccountScopedReadonlyTossClient } from "../../src/infrastructure/toss/readonly-http-client";
import {
  CONDITIONAL_ORDER_HISTORY_TTL_MS,
  conditionalOrderDetailQueryKey,
  conditionalOrderListQueryKey,
} from "../../src/ui/orders/conditional-order-query-policy";

function request(query: string) {
  return new NextRequest(
    `http://127.0.0.1:3000/api/v1/conditional-orders${query}`,
    { headers: { Host: "127.0.0.1:3000" } },
  );
}

const openWire = (
  MOCK_CONDITIONAL_ACCOUNT_101.OPEN as {
    result: { conditionalOrders: readonly Record<string, unknown>[] };
  }
).result.conditionalOrders;
const closedWire = (
  MOCK_CONDITIONAL_ACCOUNT_101.CLOSED as {
    result: { conditionalOrders: readonly Record<string, unknown>[] };
  }
).result.conditionalOrders;

describe("conditional order readonly contracts", () => {
  it("decodes SINGLE/OCO/OTO and all known group statuses", () => {
    const values = [...openWire, ...closedWire];
    expect(
      new Set(
        values
          .map((value) => decodeReadonlyConditionalOrder(value).type.kind)
          .filter((value) => value !== "UNKNOWN"),
      ),
    ).toEqual(new Set(KNOWN_CONDITIONAL_ORDER_TYPES));
    expect(
      new Set(
        values
          .map((value) => decodeReadonlyConditionalOrder(value).status.kind)
          .filter((value) => value !== "UNKNOWN"),
      ),
    ).toEqual(new Set(KNOWN_CONDITIONAL_GROUP_STATUSES));
  });

  it("keeps group and leg status domains separate", () => {
    for (const status of KNOWN_CONDITIONAL_LEG_STATUSES) {
      const decoded = decodeReadonlyConditionalOrder({
        ...openWire[0],
        first: { type: "STOP", status },
      });
      expect(decoded.first.status.kind).toBe(status);
    }
    for (const invalidGroupStatus of ["HOLDING", "CANCELED"]) {
      expect(() =>
        decodeReadonlyConditionalOrder({
          ...openWire[0],
          status: invalidGroupStatus,
        }),
      ).toThrow();
    }
  });

  it("preserves unknown values without projecting extra fields", () => {
    const decoded = decodeReadonlyConditionalOrder({
      ...closedWire[2],
      upstreamSecret: "not-projected",
      first: {
        ...(closedWire[2]!.first as Record<string, unknown>),
        type: "FUTURE_CONDITION",
        futureField: "not-projected",
      },
    });
    expect(decoded.status.kind).toBe("UNKNOWN");
    expect(decoded.first.type.kind).toBe("UNKNOWN");
    expect(decoded).not.toHaveProperty("upstreamSecret");
    expect(decoded.first).not.toHaveProperty("futureField");
  });

  it("preserves absent, null, zero, fractional, and large values", () => {
    const absent = decodeReadonlyConditionalOrder({
      ...openWire[0],
      second: undefined,
      first: { type: "STOP", status: "WATCHING" },
    });
    expect(absent).not.toHaveProperty("expireDate");
    expect(absent).not.toHaveProperty("second");
    expect(absent.first).not.toHaveProperty("triggerPrice");

    const nullable = decodeReadonlyConditionalOrder(openWire[0]);
    expect(nullable.second).toBeNull();
    expect(nullable.first.triggerPrice).toBeNull();
    expect(nullable.quantity).toBe("10.000001");
    expect(decodeReadonlyConditionalOrder(closedWire[1]).quantity).toBe("0");
    expect(decodeReadonlyConditionalOrder(closedWire[2]).quantity).toBe(
      "999999999999999999999999.99999",
    );
  });

  it.each([
    [{ ...openWire[0], quantity: "1e3" }, "quantity"],
    [{ ...openWire[0], quantity: "-1" }, "quantity"],
    [{ ...openWire[0], expireDate: "2026-02-30" }, "expireDate"],
    [{ ...openWire[0], createdAt: "2026-02-30T09:00:00+09:00" }, "createdAt"],
    [{ ...openWire[0], first: { type: "STOP" } }, "first"],
  ])("rejects malformed DTO without exposing it", (value, field) => {
    try {
      decodeReadonlyConditionalOrder(value);
      throw new Error("EXPECTED_FAILURE");
    } catch (error) {
      expect(error).toMatchObject({
        fieldPath: expect.stringContaining(field),
      });
      expect(JSON.stringify(error)).not.toContain("fixture-conditional");
    }
  });

  it("decodes detail and page envelopes with pagination invariant", () => {
    const detail = decodeConditionalOrderDetail({ result: openWire[1] });
    expect(detail.type.kind).toBe("OCO");
    const page = decodeConditionalOrderPage({
      result: {
        conditionalOrders: openWire.slice(0, 2),
        nextCursor: "opaque_cursor",
        hasNext: true,
      },
    });
    expect(page.conditionalOrders).toHaveLength(2);
    expect(() =>
      decodeConditionalOrderPage({
        result: {
          conditionalOrders: [],
          nextCursor: null,
          hasNext: true,
        },
      }),
    ).toThrow();
    expect(() =>
      decodeConditionalOrderPage(MOCK_MALFORMED_CONDITIONAL_PAGE),
    ).toThrow();
  });

  it("parses strict OPEN/CLOSED queries and preserves opaque cursor", () => {
    expect(
      parseConditionalOrderHistoryQuery(
        request("?status=CLOSED&symbol=aapl&cursor=opaque_cursor-1&limit=100"),
      ),
    ).toEqual({
      status: "CLOSED",
      symbol: "AAPL",
      cursor: "opaque_cursor-1",
      limit: 100,
    });
    for (const query of [
      "",
      "?status=WATCHING",
      "?status=OPEN&status=CLOSED",
      "?status=OPEN&unknown=1",
      "?status=OPEN&cursor=",
      "?status=OPEN&cursor=a%2Fb",
      "?status=OPEN&limit=0",
      "?status=OPEN&limit=1e2",
      "?status=OPEN&symbol=a,b",
    ]) {
      expect(() => parseConditionalOrderHistoryQuery(request(query))).toThrow(
        ConditionalOrderValidationError,
      );
    }
  });

  it.each([
    "",
    ".",
    "..",
    "../id",
    "id/value",
    String.raw`id\value`,
    "%2Fvalue",
    "%252Fvalue",
    "https://example.invalid/id",
    "//example.invalid/id",
    "x".repeat(129),
  ])("rejects unsafe conditional id %s", (value) => {
    expect(() => decodeConditionalOrderIdPathSegment(value)).toThrow(
      ConditionalOrderIdValidationError,
    );
  });

  it("paginates both groups and isolates cursors by account/filter", async () => {
    const provider = createMockConditionalOrderProvider();
    for (const status of ["OPEN", "CLOSED"] as const) {
      const first = await provider.getConditionalOrders(101, {
        status,
        limit: 2,
      });
      expect(first.hasNext).toBe(true);
      const second = await provider.getConditionalOrders(101, {
        status,
        limit: 2,
        cursor: first.nextCursor!,
      });
      expect(
        second.conditionalOrders.some((item) =>
          first.conditionalOrders.some(
            (candidate) =>
              candidate.conditionalOrderId === item.conditionalOrderId,
          ),
        ),
      ).toBe(false);
      await expect(
        provider.getConditionalOrders(202, {
          status,
          limit: 2,
          cursor: first.nextCursor!,
        }),
      ).rejects.toEqual(new ConditionalOrderProviderError("INVALID_CURSOR"));
    }
  });

  it("keeps list/detail consistent and isolates accounts and mutations", async () => {
    const provider = createMockConditionalOrderProvider();
    const list = await provider.getConditionalOrders(101, {
      status: "OPEN",
      limit: 100,
    });
    for (const item of list.conditionalOrders) {
      const detail = await provider.getConditionalOrder(
        101,
        item.conditionalOrderId,
      );
      expect(detail).toEqual(item);
    }
    await expect(
      provider.getConditionalOrder(
        202,
        list.conditionalOrders[0]!.conditionalOrderId,
      ),
    ).rejects.toMatchObject({ code: "CONDITIONAL_ORDER_NOT_FOUND" });
    const mutable = await provider.getConditionalOrders(101, {
      status: "OPEN",
      limit: 100,
    });
    expect(() => {
      (mutable.conditionalOrders as unknown[]).push({});
    }).toThrow();
  });

  it("uses only exact account-scoped GET paths in the live adapter", async () => {
    const getAccountScoped = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          result: {
            conditionalOrders: [],
            nextCursor: null,
            hasNext: false,
          },
        },
      })
      .mockResolvedValueOnce({ data: { result: openWire[0] } });
    const provider = createLiveConditionalOrderProvider({
      getAccountScoped,
    } as unknown as AccountScopedReadonlyTossClient);
    await provider.getConditionalOrders(101, {
      status: "OPEN",
      symbol: "TSTX",
      cursor: "opaque_cursor",
      limit: 20,
    });
    await provider.getConditionalOrder(101, "fixture-conditional-single");
    expect(getAccountScoped).toHaveBeenNthCalledWith(1, {
      path: "/api/v1/conditional-orders",
      operation: "getConditionalOrders",
      accountSeq: 101,
      query: {
        status: "OPEN",
        symbol: "TSTX",
        cursor: "opaque_cursor",
        limit: "20",
      },
    });
    expect(getAccountScoped).toHaveBeenNthCalledWith(2, {
      path: "/api/v1/conditional-orders/fixture-conditional-single",
      operation: "getConditionalOrder",
      accountSeq: 101,
    });
  });

  it("isolates 2-second query keys by account/group/filter/id", () => {
    expect(CONDITIONAL_ORDER_HISTORY_TTL_MS).toBe(2_000);
    expect(conditionalOrderListQueryKey("a", "OPEN", "TSTX", 20)).not.toEqual(
      conditionalOrderListQueryKey("b", "OPEN", "TSTX", 20),
    );
    expect(conditionalOrderListQueryKey("a", "OPEN", "TSTX", 20)).not.toEqual(
      conditionalOrderListQueryKey("a", "CLOSED", "TSTX", 20),
    );
    expect(conditionalOrderDetailQueryKey("a", "one")).not.toEqual(
      conditionalOrderDetailQueryKey("a", "two"),
    );
  });
});
