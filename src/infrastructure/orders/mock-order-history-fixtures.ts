import { KNOWN_ORDER_STATUSES } from "../../domain/orders/readonly-order";

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const BASE_EXECUTION = {
  filledQuantity: "0",
  averageFilledPrice: null,
  filledAmount: null,
  commission: null,
  tax: null,
  filledAt: null,
  settlementDate: null,
};

function orderForStatus(status: string, index: number) {
  return {
    orderId: `fixture-order-${index}`,
    symbol: index % 2 === 0 ? "000001" : "TSTX",
    side: index % 2 === 0 ? "BUY" : "SELL",
    orderType: "LIMIT",
    timeInForce: "DAY",
    status,
    price: "12345.6789",
    quantity: "10",
    orderAmount: null,
    currency: index % 2 === 0 ? "KRW" : "USD",
    orderedAt: `2026-01-${String(index + 1).padStart(2, "0")}T09:30:00+09:00`,
    canceledAt: null,
    execution: {
      ...BASE_EXECUTION,
      ...(status === "PARTIAL_FILLED" ||
      status === "CANCELED" ||
      status === "REJECTED" ||
      status === "REPLACED" ||
      status === "CANCEL_REJECTED" ||
      status === "REPLACE_REJECTED"
        ? {
            filledQuantity: "2.500001",
            averageFilledPrice: "12345.6001",
            filledAmount: "30864.012345",
            commission: "0",
            tax: "0",
            filledAt: "2026-01-01T09:31:00+09:00",
          }
        : {}),
    },
  };
}

export const MOCK_ORDERS_BY_KNOWN_STATUS = deepFreeze(
  KNOWN_ORDER_STATUSES.map(orderForStatus),
);

export const MOCK_MARKET_AMOUNT_ORDER = deepFreeze({
  ...orderForStatus("PENDING", 20),
  orderId: "fixture-market-amount-order",
  symbol: "TSTX",
  side: "BUY",
  orderType: "MARKET",
  timeInForce: "FUTURE_TIF",
  status: "FUTURE_STATUS",
  price: null,
  quantity: "0.000001",
  orderAmount: "999999999999999999999999.99999",
  currency: "FUTURE_CURRENCY",
  futureWireField: "not-projected",
});

export const MOCK_FILLED_ORDER = deepFreeze({
  ...orderForStatus("FILLED", 21),
  orderId: "fixture-filled-order",
  quantity: "9007199254740993.000000000001",
  execution: {
    filledQuantity: "9007199254740993.000000000001",
    averageFilledPrice: "0.000000000001",
    filledAmount: "9007199254.740993000000000001",
    commission: "0",
    tax: "0",
    filledAt: "2026-01-22T09:31:00+09:00",
    settlementDate: "2026-01-24",
    futureExecutionField: "not-projected",
  },
});

export const MOCK_MALFORMED_DECIMAL_ORDER = deepFreeze({
  ...orderForStatus("PENDING", 22),
  quantity: "not-a-decimal",
});

export const MOCK_MALFORMED_TIMESTAMP_ORDER = deepFreeze({
  ...orderForStatus("PENDING", 23),
  orderedAt: "2026-02-30T09:30:00+09:00",
});

export const MOCK_MALFORMED_SETTLEMENT_ORDER = deepFreeze({
  ...orderForStatus("FILLED", 24),
  execution: {
    ...BASE_EXECUTION,
    settlementDate: "2026-02-30",
  },
});
