function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function dailyTimestamp(index: number): string {
  return new Date(Date.UTC(2025, 0, 31 - index, 0, 0, 0)).toISOString();
}

function buildDailyCandles(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const open = 72000 - index * 10;
    const close = open + (index % 2 === 0 ? 5 : -5);
    return {
      timestamp: dailyTimestamp(index),
      openPrice: String(open),
      highPrice: String(open + 20),
      lowPrice: String(open - 20),
      closePrice: String(close),
      volume: index === 0 ? "9007199254740993" : String(1000000 + index),
      currency: "KRW",
    };
  });
}

// Synthetic, deterministic test data. These values are never refreshed from a
// live market source and must not be treated as current quotes.
export const MOCK_STOCKS_TOSS_ENVELOPE = deepFreeze({
  result: [
    {
      symbol: "005930",
      name: "테스트 코리아",
      englishName: "TEST KOREA",
      isinCode: "KR7005930003",
      market: "KOSPI",
      securityType: "STOCK",
      isCommonShare: true,
      status: "ACTIVE",
      currency: "KRW",
      listDate: "2000-01-03",
      delistDate: null,
      sharesOutstanding: "5919637922",
      leverageFactor: null,
      koreanMarketDetail: {
        liquidationTrading: false,
        nxtSupported: true,
        krxTradingSuspended: false,
        nxtTradingSuspended: false,
      },
    },
    {
      symbol: "AAPL",
      name: "테스트 유에스",
      englishName: "TEST US",
      isinCode: "US0378331005",
      market: "NASDAQ",
      securityType: "STOCK",
      isCommonShare: true,
      status: "ACTIVE",
      currency: "USD",
      listDate: "2000-01-04",
      delistDate: null,
      sharesOutstanding: "9007199254740993",
      leverageFactor: null,
      koreanMarketDetail: null,
    },
    {
      symbol: "FWD1",
      name: "미래 계약 테스트",
      englishName: "FORWARD COMPATIBILITY TEST",
      isinCode: "ZZ0000000001",
      market: "FUTURE_MARKET",
      securityType: "FUTURE_SECURITY_TYPE",
      isCommonShare: false,
      status: "FUTURE_STATUS",
      currency: "XTS",
      listDate: null,
      delistDate: null,
      sharesOutstanding: "90071992547409931234567890",
      leverageFactor: "1.25",
      koreanMarketDetail: null,
    },
    {
      symbol: "EMPTY1",
      name: "가격 미제공 테스트",
      englishName: "NO PRICE TEST",
      isinCode: "ZZ0000000002",
      market: "FUTURE_MARKET",
      securityType: "FUTURE_SECURITY_TYPE",
      isCommonShare: false,
      status: "FUTURE_STATUS",
      currency: "XTS",
      listDate: null,
      delistDate: null,
      sharesOutstanding: "1000",
      leverageFactor: null,
      koreanMarketDetail: null,
    },
    {
      symbol: "ERR1",
      name: "경고 오류 테스트",
      englishName: "WARNING ERROR TEST",
      isinCode: "ZZ0000000003",
      market: "FUTURE_MARKET",
      securityType: "FUTURE_SECURITY_TYPE",
      isCommonShare: false,
      status: "FUTURE_STATUS",
      currency: "XTS",
      listDate: null,
      delistDate: null,
      sharesOutstanding: "2000",
      leverageFactor: null,
      koreanMarketDetail: null,
    },
  ],
});

export const MOCK_PRICES_TOSS_ENVELOPE = deepFreeze({
  result: [
    {
      symbol: "005930",
      timestamp: "2025-01-02T09:30:00.000+09:00",
      lastPrice: "72000",
      currency: "KRW",
    },
    {
      symbol: "AAPL",
      timestamp: "2025-01-02T22:30:00.000+09:00",
      lastPrice: "185.70",
      currency: "USD",
    },
    {
      symbol: "FWD1",
      timestamp: null,
      lastPrice: "9007199254740993.123456789",
      currency: "XTS",
    },
    {
      symbol: "ERR1",
      timestamp: "2025-01-02T12:00:00.000+09:00",
      lastPrice: "123.45",
      currency: "XTS",
    },
  ],
});

export const MOCK_WARNINGS_TOSS_ENVELOPES = deepFreeze({
  "005930": {
    result: [
      {
        warningType: "VI_STATIC",
        exchange: "KRX",
        startDate: "2025-01-02",
        endDate: null,
      },
      {
        warningType: "OVERHEATED",
        exchange: "KRX",
        startDate: "2025-01-01",
        endDate: "2025-01-31",
      },
    ],
  },
  AAPL: { result: [] },
  FWD1: {
    result: [
      {
        warningType: "FUTURE_WARNING",
        exchange: null,
        startDate: "2025-01-03",
        endDate: null,
      },
      {
        warningType: "INVESTMENT_RISK",
        exchange: null,
        startDate: "2025-01-02",
        endDate: null,
      },
      {
        warningType: "FUTURE_WARNING",
        exchange: null,
        startDate: "2025-01-01",
        endDate: null,
      },
    ],
  },
  EMPTY1: { result: [] },
  ERR1: {
    error: {
      requestId: "mock-warning-request",
      code: "internal-error",
      message: "Mock warning lookup failed.",
      data: {},
    },
  },
});

export const MOCK_ORDERBOOK_TOSS_ENVELOPES = deepFreeze({
  "005930": {
    result: {
      timestamp: "2025-01-02T09:30:00.000+09:00",
      currency: "KRW",
      asks: [
        { price: "72100", volume: "9007199254740993" },
        { price: "72200", volume: "3400" },
        { price: "72300", volume: "1200" },
      ],
      bids: [
        { price: "72000", volume: "5200" },
        { price: "71900", volume: "4100" },
        { price: "71800", volume: "2700" },
      ],
    },
  },
  AAPL: {
    result: {
      timestamp: "2025-01-02T22:30:00.000+09:00",
      currency: "USD",
      asks: [
        { price: "185.70", volume: "410" },
        { price: "185.75", volume: "250" },
      ],
      bids: [
        { price: "185.65", volume: "180" },
        { price: "185.60", volume: "320" },
      ],
    },
  },
  FWD1: {
    result: {
      timestamp: null,
      currency: "XTS",
      asks: [
        {
          price: "9007199254740993.223456789",
          volume: "90071992547409931234567890",
        },
      ],
      bids: [
        {
          price: "9007199254740993.023456789",
          volume: "90071992547409931234567889",
        },
      ],
    },
  },
  EMPTY1: {
    result: {
      timestamp: null,
      currency: "XTS",
      asks: [],
      bids: [],
    },
  },
  ERR1: {
    error: {
      requestId: "mock-orderbook-request",
      code: "internal-error",
      message: "Mock orderbook lookup failed.",
      data: {},
    },
  },
});

export const MOCK_TRADES_TOSS_ENVELOPES = deepFreeze({
  "005930": {
    result: [
      {
        price: "72000",
        volume: "120",
        timestamp: "2025-01-02T09:30:42.000+09:00",
        currency: "KRW",
      },
      {
        price: "71900",
        volume: "50",
        timestamp: "2025-01-02T09:30:41.500+09:00",
        currency: "KRW",
      },
      {
        price: "72000",
        volume: "9007199254740993",
        timestamp: "2025-01-02T09:30:40.800+09:00",
        currency: "KRW",
      },
    ],
  },
  AAPL: {
    result: [
      {
        price: "185.70",
        volume: "15",
        timestamp: "2025-01-02T22:30:42.100+09:00",
        currency: "USD",
      },
      {
        price: "185.75",
        volume: "8",
        timestamp: "2025-01-02T22:30:41.700+09:00",
        currency: "USD",
      },
    ],
  },
  FWD1: { result: [] },
  EMPTY1: {
    result: [
      {
        price: "100.00",
        volume: "1",
        timestamp: "2025-01-02T12:00:00.000+09:00",
        currency: "XTS",
      },
    ],
  },
  ERR1: {
    error: {
      requestId: "mock-trades-request",
      code: "internal-error",
      message: "Mock trades lookup failed.",
      data: {},
    },
  },
});

export const MOCK_CANDLE_TOSS_DATASETS = deepFreeze([
  {
    symbol: "005930",
    interval: "1d",
    candles: buildDailyCandles(201),
  },
  {
    symbol: "005930",
    interval: "1m",
    candles: [
      {
        timestamp: "2025-01-31T09:02:00.000+09:00",
        openPrice: "72010",
        highPrice: "72030",
        lowPrice: "72000",
        closePrice: "72020",
        volume: "1500",
        currency: "KRW",
      },
      {
        timestamp: "2025-01-31T09:01:00.000+09:00",
        openPrice: "72000",
        highPrice: "72020",
        lowPrice: "71990",
        closePrice: "72010",
        volume: "1200",
        currency: "KRW",
      },
      {
        timestamp: "2025-01-31T09:00:00.000+09:00",
        openPrice: "71990",
        highPrice: "72010",
        lowPrice: "71980",
        closePrice: "72000",
        volume: "1000",
        currency: "KRW",
      },
    ],
  },
  {
    symbol: "AAPL",
    interval: "1d",
    candles: [
      {
        timestamp: "2025-01-31T09:30:00.000-05:00",
        openPrice: "185.70",
        highPrice: "185.70",
        lowPrice: "185.70",
        closePrice: "185.70",
        volume: "1",
        currency: "USD",
      },
    ],
  },
  {
    symbol: "AAPL",
    interval: "1m",
    candles: [
      {
        timestamp: "2025-01-31T09:31:00.000-05:00",
        openPrice: "185.7001",
        highPrice: "185.7002",
        lowPrice: "185.7000",
        closePrice: "185.70015",
        volume: "8",
        currency: "USD",
      },
      {
        timestamp: "2025-01-31T09:30:00.000-05:00",
        openPrice: "185.7000",
        highPrice: "185.7001",
        lowPrice: "185.6999",
        closePrice: "185.7001",
        volume: "5",
        currency: "USD",
      },
    ],
  },
  {
    symbol: "FWD1",
    interval: "1d",
    candles: [
      {
        timestamp: "2025-01-31T00:00:00.000Z",
        openPrice: "9007199254740993.123456780",
        highPrice: "9007199254740993.123456790",
        lowPrice: "9007199254740993.123456770",
        closePrice: "9007199254740993.123456785",
        volume: "90071992547409931234567890",
        currency: "XTS",
      },
      {
        timestamp: "2025-01-30T00:00:00.000Z",
        openPrice: "9007199254740993.123456775",
        highPrice: "9007199254740993.123456785",
        lowPrice: "9007199254740993.123456765",
        closePrice: "9007199254740993.123456780",
        volume: "90071992547409931234567889",
        currency: "XTS",
      },
    ],
  },
  { symbol: "FWD1", interval: "1m", candles: [] },
  { symbol: "EMPTY1", interval: "1d", candles: [] },
  { symbol: "EMPTY1", interval: "1m", candles: [] },
] as const);

export const MOCK_CANDLE_ERROR_TOSS_ENVELOPES = deepFreeze({
  "ERR1:1d": {
    error: {
      requestId: "mock-candle-request",
      code: "internal-error",
      message: "Mock candle lookup failed.",
      data: {},
    },
  },
  "ERR1:1m": {
    error: {
      requestId: "mock-candle-request",
      code: "internal-error",
      message: "Mock candle lookup failed.",
      data: {},
    },
  },
});
