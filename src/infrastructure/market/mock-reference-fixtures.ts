function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

const krSessions = (date: string) => ({
  preMarket: {
    startTime: `${date}T08:00:00+09:00`,
    singlePriceAuctionStartTime: `${date}T08:50:00+09:00`,
    endTime: `${date}T09:00:00+09:00`,
  },
  regularMarket: {
    startTime: `${date}T09:00:00+09:00`,
    singlePriceAuctionStartTime: `${date}T15:20:00+09:00`,
    endTime: `${date}T15:30:00+09:00`,
  },
  afterMarket: {
    startTime: `${date}T15:30:00+09:00`,
    singlePriceAuctionEndTime: `${date}T15:40:00+09:00`,
    endTime: `${date}T20:00:00+09:00`,
  },
});

// Synthetic fixed fixtures. Dates are test scenarios, not a current holiday
// calendar and the rates are not executable or live market values.
export const MOCK_KR_CALENDAR_TOSS_ENVELOPE = deepFreeze({
  result: {
    today: { date: "2025-03-10", integrated: krSessions("2025-03-10") },
    previousBusinessDay: {
      date: "2025-03-07",
      integrated: krSessions("2025-03-07"),
    },
    nextBusinessDay: {
      date: "2025-03-11",
      integrated: krSessions("2025-03-11"),
    },
  },
});

const usSessions = (
  date: string,
  regularStart: string,
  regularEnd: string,
) => ({
  dayMarket: {
    startTime: `${date}T09:00:00+09:00`,
    endTime: `${date}T16:50:00+09:00`,
  },
  preMarket: {
    startTime: `${date}T17:00:00+09:00`,
    endTime: regularStart,
  },
  regularMarket: { startTime: regularStart, endTime: regularEnd },
  afterMarket: {
    startTime: regularEnd,
    endTime: regularEnd
      .replace("05:00:00", "07:00:00")
      .replace("06:00:00", "08:00:00"),
  },
});

export const MOCK_US_CALENDAR_TOSS_ENVELOPE = deepFreeze({
  result: {
    today: {
      date: "2025-03-10",
      ...usSessions(
        "2025-03-10",
        "2025-03-10T22:30:00+09:00",
        "2025-03-11T05:00:00+09:00",
      ),
    },
    previousBusinessDay: {
      date: "2025-03-07",
      ...usSessions(
        "2025-03-07",
        "2025-03-07T23:30:00+09:00",
        "2025-03-08T06:00:00+09:00",
      ),
    },
    nextBusinessDay: {
      date: "2025-03-11",
      ...usSessions(
        "2025-03-11",
        "2025-03-11T22:30:00+09:00",
        "2025-03-12T05:00:00+09:00",
      ),
    },
  },
});

export const MOCK_EXCHANGE_RATE_TOSS_ENVELOPE = deepFreeze({
  result: {
    baseCurrency: "USD",
    quoteCurrency: "KRW",
    rate: "1375.123456789012345678",
    midRate: "1374.987654321098765432",
    basisPoint: "0.987654321",
    rateChangeType: "UP",
    validFrom: "2025-03-10T22:59:00+09:00",
    validUntil: "2025-03-10T23:00:00+09:00",
  },
});

export const MOCK_REFERENCE_CLOCK = "2025-03-10T23:00:00+09:00";
