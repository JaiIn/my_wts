function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const MOCK_BUYING_POWER = deepFreeze({
  101: {
    KRW: { result: { currency: "KRW", cashBuyingPower: "9007199254740993" } },
    USD: {
      result: {
        currency: "USD",
        cashBuyingPower: "3500.500000000000000001",
      },
    },
  },
  202: {
    KRW: { result: { currency: "KRW", cashBuyingPower: "0" } },
    USD: { result: { currency: "USD", cashBuyingPower: "0" } },
  },
  303: {
    KRW: { result: { currency: "FUTURE_CURRENCY", cashBuyingPower: "0" } },
    USD: { result: { currency: "FUTURE_CURRENCY", cashBuyingPower: "0" } },
  },
});

export const MOCK_SELLABLE_QUANTITY = deepFreeze({
  101: {
    "005930": { result: { sellableQuantity: "100" } },
    AAPL: { result: { sellableQuantity: "5.500000000000000001" } },
  },
  202: {
    "005930": { result: { sellableQuantity: "0" } },
    AAPL: { result: { sellableQuantity: "0" } },
  },
  303: {
    "005930": { result: { sellableQuantity: "0" } },
    AAPL: { result: { sellableQuantity: "0" } },
  },
});

export const MOCK_COMMISSIONS = deepFreeze({
  101: {
    result: [
      {
        marketCountry: "KR",
        commissionRate: "0.015",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
      {
        marketCountry: "US",
        commissionRate: "0.100000000000000001",
        startDate: null,
        endDate: null,
      },
    ],
  },
  202: {
    result: [
      {
        marketCountry: "KR",
        commissionRate: "0",
        startDate: null,
        endDate: null,
      },
    ],
  },
  303: {
    result: [
      {
        marketCountry: "FUTURE_MARKET",
        commissionRate: "0",
        startDate: null,
        endDate: null,
      },
    ],
  },
});

export const MOCK_ORDER_INFO_ERROR = deepFreeze({
  error: {
    requestId: "mock-order-info-error",
    code: "service-unavailable",
    message: "Synthetic order information provider failure.",
    data: {},
  },
});

export const MOCK_MALFORMED_ORDER_INFO = deepFreeze({
  result: { currency: "KRW", cashBuyingPower: "-1" },
});
