import { describe, expect, it } from "vitest";

import { KNOWN_ORDER_STATUSES } from "../../src/domain/orders/readonly-order";
import {
  MOCK_FILLED_ORDER,
  MOCK_MALFORMED_DECIMAL_ORDER,
  MOCK_MALFORMED_SETTLEMENT_ORDER,
  MOCK_MALFORMED_TIMESTAMP_ORDER,
  MOCK_MARKET_AMOUNT_ORDER,
  MOCK_ORDERS_BY_KNOWN_STATUS,
} from "../../src/infrastructure/orders/mock-order-history-fixtures";
import {
  decodeReadonlyOrder,
  decodeReadonlyOrderEnvelope,
  ReadonlyOrderDecodeError,
} from "../../src/infrastructure/orders/readonly-order-decoder";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function pendingFixture(): Record<string, unknown> {
  return clone(MOCK_ORDERS_BY_KNOWN_STATUS[0]) as Record<string, unknown>;
}

describe("readonly Toss order decoder", () => {
  it.each(KNOWN_ORDER_STATUSES)(
    "decodes known status %s without inventing a transition",
    (status) => {
      const source = MOCK_ORDERS_BY_KNOWN_STATUS.find(
        (order) => order.status === status,
      );
      const decoded = decodeReadonlyOrder(source);

      expect(decoded.status).toMatchObject({
        code: status,
        kind: status,
      });
      expect(decoded.execution.filledQuantity).toBe(
        source?.execution.filledQuantity,
      );
    },
  );

  it.each([
    "PARTIAL_FILLED",
    "CANCELED",
    "REJECTED",
    "REPLACED",
    "CANCEL_REJECTED",
    "REPLACE_REJECTED",
  ])("preserves partial execution for %s", (status) => {
    const source = MOCK_ORDERS_BY_KNOWN_STATUS.find(
      (order) => order.status === status,
    );
    expect(decodeReadonlyOrder(source).execution).toMatchObject({
      filledQuantity: "2.500001",
      averageFilledPrice: "12345.6001",
      commission: "0",
      tax: "0",
    });
  });

  it("preserves unknown status and does not treat OPEN/CLOSED as order states", () => {
    for (const code of ["FUTURE_STATUS", "OPEN", "CLOSED"]) {
      const decoded = decodeReadonlyOrder({
        ...pendingFixture(),
        status: code,
      });
      expect(decoded.status).toEqual({
        code,
        kind: "UNKNOWN",
        label: "알 수 없는 주문 상태",
      });
    }
  });

  it("keeps unknown orderType, timeInForce, and currency forward-compatible", () => {
    const decoded = decodeReadonlyOrder({
      ...MOCK_MARKET_AMOUNT_ORDER,
      orderType: "FUTURE_ORDER_TYPE",
    });
    expect(decoded).toMatchObject({
      orderType: "FUTURE_ORDER_TYPE",
      timeInForce: "FUTURE_TIF",
      currency: "FUTURE_CURRENCY",
      price: null,
      quantity: "0.000001",
      orderAmount: "999999999999999999999999.99999",
    });
    expect(decoded).not.toHaveProperty("futureWireField");
  });

  it("decodes a MARKET amount-based order without deriving execution values", () => {
    const decoded = decodeReadonlyOrder(MOCK_MARKET_AMOUNT_ORDER);
    expect(decoded).toMatchObject({
      orderType: "MARKET",
      price: null,
      orderAmount: "999999999999999999999999.99999",
      execution: {
        filledQuantity: "0",
        averageFilledPrice: null,
        filledAmount: null,
      },
    });
  });

  it("preserves large, fractional, zero, nullable, date, and offset values", () => {
    const decoded = decodeReadonlyOrder(MOCK_FILLED_ORDER);
    expect(decoded.quantity).toBe("9007199254740993.000000000001");
    expect(decoded.execution).toEqual({
      filledQuantity: "9007199254740993.000000000001",
      averageFilledPrice: "0.000000000001",
      filledAmount: "9007199254.740993000000000001",
      commission: "0",
      tax: "0",
      filledAt: "2026-01-22T09:31:00+09:00",
      settlementDate: "2026-01-24",
    });
    expect(decoded.orderedAt.endsWith("+09:00")).toBe(true);
    expect(decoded.execution).not.toHaveProperty("futureExecutionField");
  });

  it("preserves symbol casing and non-KST timestamp offsets verbatim", () => {
    const decoded = decodeReadonlyOrder({
      ...pendingFixture(),
      symbol: "TsTx",
      orderedAt: "2026-07-31T09:30:00-04:00",
      canceledAt: "2026-07-31T10:30:00-04:00",
      execution: {
        ...(pendingFixture().execution as Record<string, unknown>),
        filledAt: "2026-07-31T09:31:00-04:00",
      },
    });
    expect(decoded.symbol).toBe("TsTx");
    expect(decoded.orderedAt).toBe("2026-07-31T09:30:00-04:00");
    expect(decoded.canceledAt).toBe("2026-07-31T10:30:00-04:00");
    expect(decoded.execution.filledAt).toBe("2026-07-31T09:31:00-04:00");
  });

  it("preserves required nullable execution fields without cross-field assumptions", () => {
    const decoded = decodeReadonlyOrder(MOCK_ORDERS_BY_KNOWN_STATUS[0]);
    expect(decoded.execution).toEqual({
      filledQuantity: "0",
      averageFilledPrice: null,
      filledAmount: null,
      commission: null,
      tax: null,
      filledAt: null,
      settlementDate: null,
    });
  });

  it("preserves the optional-versus-null Order contract", () => {
    const input = pendingFixture();
    delete input.price;
    delete input.orderAmount;
    delete input.canceledAt;
    const omitted = decodeReadonlyOrder(input);
    expect(omitted).not.toHaveProperty("price");
    expect(omitted).not.toHaveProperty("orderAmount");
    expect(omitted).not.toHaveProperty("canceledAt");

    const nullable = decodeReadonlyOrder(MOCK_MARKET_AMOUNT_ORDER);
    expect(nullable).toHaveProperty("price", null);
  });

  it("reuses the common Toss envelope decoder", () => {
    const decoded = decodeReadonlyOrderEnvelope({
      result: MOCK_FILLED_ORDER,
      futureEnvelopeField: true,
    });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.result.status.kind).toBe("FILLED");
      expect(decoded.result).not.toHaveProperty("futureWireField");
    }
  });

  it.each([
    ["invalid decimal", MOCK_MALFORMED_DECIMAL_ORDER, "quantity"],
    ["invalid date-time", MOCK_MALFORMED_TIMESTAMP_ORDER, "orderedAt"],
    [
      "invalid settlement date",
      MOCK_MALFORMED_SETTLEMENT_ORDER,
      "execution.settlementDate",
    ],
    [
      "missing required field",
      (() => {
        const value = pendingFixture();
        delete value.execution;
        return value;
      })(),
      "execution",
    ],
    ["wrong primitive type", { ...pendingFixture(), quantity: 10 }, "quantity"],
    [
      "malformed execution",
      { ...pendingFixture(), execution: [] },
      "execution",
    ],
    [
      "missing execution field",
      {
        ...pendingFixture(),
        execution: {
          ...(pendingFixture().execution as Record<string, unknown>),
          settlementDate: undefined,
        },
      },
      "execution.settlementDate",
    ],
    ["negative quantity", { ...pendingFixture(), quantity: "-1" }, "quantity"],
    [
      "decimal over 30 characters",
      { ...pendingFixture(), quantity: "1234567890123456789012345678901" },
      "quantity",
    ],
    ["unknown side", { ...pendingFixture(), side: "FUTURE_SIDE" }, "side"],
    ["empty order id", { ...pendingFixture(), orderId: "" }, "orderId"],
  ])("rejects %s with a safe field-only error", (_name, input, fieldPath) => {
    let thrown: unknown;
    try {
      decodeReadonlyOrder(input);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ReadonlyOrderDecodeError);
    expect(thrown).toMatchObject({
      code: "INVALID_ORDER",
      fieldPath,
      expectedCategory: "ORDER_SCHEMA",
      message: "READONLY_ORDER_DECODE_FAILED",
      stack: undefined,
    });
  });

  it("does not expose malformed upstream content in decoder errors", () => {
    const sensitiveMarker = ["fixture", "private", "order", "value"].join("-");
    const input = {
      ...pendingFixture(),
      quantity: sensitiveMarker,
      orderId: sensitiveMarker,
      symbol: sensitiveMarker,
    };

    try {
      decodeReadonlyOrder(input);
      throw new Error("Expected decoding to fail.");
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(sensitiveMarker);
      expect(String(error)).not.toContain(sensitiveMarker);
    }
  });

  it("isolates and freezes decoded output without mutating the frozen fixture", () => {
    const before = JSON.stringify(MOCK_FILLED_ORDER);
    const decoded = decodeReadonlyOrder(MOCK_FILLED_ORDER);

    expect(Object.isFrozen(MOCK_FILLED_ORDER)).toBe(true);
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded.status)).toBe(true);
    expect(Object.isFrozen(decoded.execution)).toBe(true);
    expect(() => {
      (decoded as { symbol: string }).symbol = "CHANGED";
    }).toThrow(TypeError);
    expect(JSON.stringify(MOCK_FILLED_ORDER)).toBe(before);
  });

  it("does not include mutation request-only fields in the readonly domain", () => {
    const decoded = decodeReadonlyOrder({
      ...pendingFixture(),
      clientOrderId: "fixture-client-order",
      confirmHighValueOrder: true,
      requestBody: { quantity: "999" },
    });

    expect(Object.keys(decoded).sort()).toEqual(
      [
        "canceledAt",
        "currency",
        "execution",
        "orderAmount",
        "orderId",
        "orderType",
        "orderedAt",
        "price",
        "quantity",
        "side",
        "status",
        "symbol",
        "timeInForce",
      ].sort(),
    );
  });

  it("returns fresh immutable domain objects for repeated decoding", () => {
    const first = decodeReadonlyOrder(MOCK_FILLED_ORDER);
    const second = decodeReadonlyOrder(MOCK_FILLED_ORDER);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.execution).not.toBe(second.execution);
  });
});
