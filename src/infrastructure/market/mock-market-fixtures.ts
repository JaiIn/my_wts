function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
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
  ],
});
