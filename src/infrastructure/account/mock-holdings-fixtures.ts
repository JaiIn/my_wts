function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const EMPTY_OVERVIEW = {
  totalPurchaseAmount: { krw: "0", usd: null },
  marketValue: {
    amount: { krw: "0", usd: null },
    amountAfterCost: { krw: "0", usd: null },
  },
  profitLoss: {
    amount: { krw: "0", usd: null },
    amountAfterCost: { krw: "0", usd: null },
    rate: "0",
    rateAfterCost: "0",
  },
  dailyProfitLoss: {
    amount: { krw: "0", usd: null },
    rate: "0",
  },
  items: [],
};

export const MOCK_HOLDINGS_ACCOUNT_101_ENVELOPE = deepFreeze({
  result: {
    totalPurchaseAmount: { krw: "6500000", usd: "1553.000000000000000001" },
    marketValue: {
      amount: { krw: "7200000", usd: "1785.000000000000000001" },
      amountAfterCost: { krw: "7050000", usd: "1771.430000000000000001" },
    },
    profitLoss: {
      amount: { krw: "700000", usd: "232.000000000000000001" },
      amountAfterCost: { krw: "550000", usd: "218.430000000000000001" },
      rate: "0.1179",
      rateAfterCost: "0.0983",
    },
    dailyProfitLoss: {
      amount: { krw: "100000", usd: "-0.000000000000000001" },
      rate: "0.0141",
    },
    items: [
      {
        symbol: "005930",
        name: "테스트 삼성전자",
        marketCountry: "KR",
        currency: "KRW",
        quantity: "9007199254740993",
        lastPrice: "72000",
        averagePurchasePrice: "65000",
        marketValue: {
          purchaseAmount: "6500000",
          amount: "7200000",
          amountAfterCost: "7050000",
        },
        profitLoss: {
          amount: "700000",
          amountAfterCost: "550000",
          rate: "0.1077",
          rateAfterCost: "0.0846",
        },
        dailyProfitLoss: { amount: "100000", rate: "0.0141" },
        cost: { commission: "14400", tax: "135600" },
      },
      {
        symbol: "AAPL",
        name: "Test Apple",
        marketCountry: "US",
        currency: "USD",
        quantity: "0.000000000000000001",
        lastPrice: "178.500000000000000001",
        averagePurchasePrice: "155.300000000000000001",
        marketValue: {
          purchaseAmount: "1553.000000000000000001",
          amount: "1785.000000000000000001",
          amountAfterCost: "1771.430000000000000001",
        },
        profitLoss: {
          amount: "232.000000000000000001",
          amountAfterCost: "218.430000000000000001",
          rate: "0.1494",
          rateAfterCost: "0.1406",
        },
        dailyProfitLoss: {
          amount: "-0.000000000000000001",
          rate: "-0.000000000000000001",
        },
        cost: { commission: "3.57", tax: null },
      },
    ],
  },
});

export const MOCK_EMPTY_HOLDINGS_ENVELOPE = deepFreeze({
  result: EMPTY_OVERVIEW,
});

export const MOCK_UNKNOWN_HOLDINGS_ENVELOPE = deepFreeze({
  result: {
    ...EMPTY_OVERVIEW,
    items: [
      {
        symbol: "TESTX",
        name: "테스트 확장 시장 종목",
        marketCountry: "FUTURE_MARKET",
        currency: "FUTURE_CURRENCY",
        quantity: "1",
        lastPrice: "0.000000000000000001",
        averagePurchasePrice: "0.000000000000000001",
        marketValue: {
          purchaseAmount: "0.000000000000000001",
          amount: "0.000000000000000001",
          amountAfterCost: "0.000000000000000001",
        },
        profitLoss: {
          amount: "0",
          amountAfterCost: "0",
          rate: "0",
          rateAfterCost: "0",
        },
        dailyProfitLoss: { amount: "0", rate: "0" },
        cost: { commission: "0", tax: null },
      },
    ],
  },
});

export const MOCK_MALFORMED_HOLDINGS_ENVELOPE = deepFreeze({
  result: {
    ...EMPTY_OVERVIEW,
    items: [
      {
        symbol: "BAD",
        name: "Malformed",
        marketCountry: "KR",
        currency: "KRW",
        quantity: "-1",
      },
    ],
  },
});

export const MOCK_HOLDINGS_ERROR_ENVELOPE = deepFreeze({
  error: {
    requestId: "mock-holdings-error",
    code: "service-unavailable",
    message: "Synthetic holdings provider failure.",
    data: {},
  },
});
