import { describe, expect, it, vi } from "vitest";

import {
  MARKET_SCREEN_REFERENCE_TIME,
  marketStatusAt,
} from "../../src/application/market/market-screen";
import { MarketDataNotFoundError } from "../../src/application/market/market-service";
import {
  MOCK_PRICES_TOSS_ENVELOPE,
  MOCK_STOCKS_TOSS_ENVELOPE,
} from "../../src/infrastructure/market/mock-market-fixtures";
import {
  MOCK_EXCHANGE_RATE_TOSS_ENVELOPE,
  MOCK_KR_CALENDAR_TOSS_ENVELOPE,
  MOCK_US_CALENDAR_TOSS_ENVELOPE,
} from "../../src/infrastructure/market/mock-reference-fixtures";
import { createMockMarketService } from "../../src/infrastructure/market/mock-market-service";
import { decodeTossEnvelope } from "../../src/integrations/toss/envelope";
import {
  tossExchangeRateResponseSchema,
  tossKrMarketCalendarResponseSchema,
  tossUsMarketCalendarResponseSchema,
} from "../../src/integrations/toss/market-schemas";

const baseFixtures = {
  stocksEnvelope: MOCK_STOCKS_TOSS_ENVELOPE,
  pricesEnvelope: MOCK_PRICES_TOSS_ENVELOPE,
};

describe("market calendar and exchange-rate mock contracts", () => {
  it("decodes the exact KR, US, and exchange-rate Toss envelopes", () => {
    expect(
      decodeTossEnvelope(
        MOCK_KR_CALENDAR_TOSS_ENVELOPE,
        tossKrMarketCalendarResponseSchema,
      ).ok,
    ).toBe(true);
    expect(
      decodeTossEnvelope(
        MOCK_US_CALENDAR_TOSS_ENVELOPE,
        tossUsMarketCalendarResponseSchema,
      ).ok,
    ).toBe(true);
    expect(
      decodeTossEnvelope(
        MOCK_EXCHANGE_RATE_TOSS_ENVELOPE,
        tossExchangeRateResponseSchema,
      ).ok,
    ).toBe(true);
  });

  it("keeps deterministic business dates, KST display, and US DST boundaries", async () => {
    const service = createMockMarketService();
    const kr = await service.getMarketCalendar({
      country: "KR",
      date: "2025-03-10",
    });
    const us = await service.getMarketCalendar({
      country: "US",
      date: "2025-03-10",
    });

    expect(kr).toMatchObject({
      marketTimeZone: "Asia/Seoul",
      displayTimeZone: "Asia/Seoul",
      today: { date: "2025-03-10" },
    });
    expect(us).toMatchObject({
      marketTimeZone: "America/New_York",
      displayTimeZone: "Asia/Seoul",
      previousBusinessDay: { date: "2025-03-07" },
      today: { date: "2025-03-10" },
      nextBusinessDay: { date: "2025-03-11" },
    });
    const previousRegular = us.previousBusinessDay.sessions.find(
      ({ kind }) => kind === "regular",
    )!;
    const currentRegular = us.today.sessions.find(
      ({ kind }) => kind === "regular",
    )!;
    expect(previousRegular.startTime).toContain("23:30:00+09:00");
    expect(currentRegular.startTime).toContain("22:30:00+09:00");
    expect(marketStatusAt(us, Date.parse(MARKET_SCREEN_REFERENCE_TIME))).toBe(
      "regular",
    );
  });

  it("uses inclusive start and exclusive end session boundaries", async () => {
    const calendar = await createMockMarketService().getMarketCalendar({
      country: "KR",
      date: "2025-03-10",
    });
    const regular = calendar.today.sessions.find(
      ({ kind }) => kind === "regular",
    )!;

    expect(marketStatusAt(calendar, Date.parse(regular.startTime) - 1)).toBe(
      "pre",
    );
    expect(marketStatusAt(calendar, Date.parse(regular.startTime))).toBe(
      "regular",
    );
    expect(marketStatusAt(calendar, Date.parse(regular.endTime))).toBe("after");
    expect(
      marketStatusAt(
        calendar,
        Date.parse(calendar.today.sessions.at(-1)!.endTime),
      ),
    ).toBe("closed");
  });

  it.each([
    { caseName: "holiday", date: "2025-03-10", nextDate: "2025-03-11" },
    { caseName: "weekend", date: "2025-03-09", nextDate: "2025-03-10" },
  ])(
    "represents a deterministic $caseName with no sessions",
    async ({ date, nextDate }) => {
      const service = createMockMarketService({
        ...baseFixtures,
        calendarEnvelopes: {
          KR: {
            result: {
              today: { date, integrated: null },
              previousBusinessDay: {
                date: "2025-03-07",
                integrated: {
                  regularMarket: {
                    startTime: "2025-03-07T09:00:00+09:00",
                    endTime: "2025-03-07T15:30:00+09:00",
                  },
                },
              },
              nextBusinessDay: {
                date: nextDate,
                integrated: {
                  regularMarket: {
                    startTime: `${nextDate}T09:00:00+09:00`,
                    endTime: `${nextDate}T15:30:00+09:00`,
                  },
                },
              },
            },
          },
        },
      });

      const calendar = await service.getMarketCalendar({
        country: "KR",
        date,
      });
      expect(calendar.today.sessions).toEqual([]);
      expect(
        marketStatusAt(calendar, Date.parse(MARKET_SCREEN_REFERENCE_TIME)),
      ).toBe("closed");
    },
  );

  it("preserves long exchange-rate decimals and clones returned fixtures", async () => {
    const service = createMockMarketService();
    const first = await service.getExchangeRate({
      baseCurrency: "USD",
      quoteCurrency: "KRW",
      dateTime: MARKET_SCREEN_REFERENCE_TIME,
    });
    expect(first.rate).toBe("1375.123456789012345678");
    expect(first.baseCurrency).toBe("USD");
    expect(first.quoteCurrency).toBe("KRW");

    first.rate = "1" as typeof first.rate;
    const second = await service.getExchangeRate({
      baseCurrency: "USD",
      quoteCurrency: "KRW",
    });
    expect(second.rate).toBe("1375.123456789012345678");
  });

  it("safely rejects same, unsupported, zero, negative, and malformed rates", async () => {
    const service = createMockMarketService();
    await expect(
      service.getExchangeRate({
        baseCurrency: "KRW",
        quoteCurrency: "KRW",
      }),
    ).rejects.toBeInstanceOf(MarketDataNotFoundError);
    await expect(
      service.getExchangeRate({ baseCurrency: "XTS", quoteCurrency: "KRW" }),
    ).rejects.toBeInstanceOf(MarketDataNotFoundError);

    for (const rate of ["0", "-1", "not-a-decimal"]) {
      const malformed = createMockMarketService({
        ...baseFixtures,
        exchangeRateEnvelopes: {
          "USD:KRW": {
            result: {
              ...MOCK_EXCHANGE_RATE_TOSS_ENVELOPE.result,
              rate,
            },
          },
        },
      });
      await expect(
        malformed.getExchangeRate({
          baseCurrency: "USD",
          quoteCurrency: "KRW",
        }),
      ).rejects.toMatchObject({ reason: "INVALID_RESULT" });
    }
  });

  it("rejects reversed sessions, duplicate business dates, and bad validity windows", async () => {
    const reversed = structuredClone(MOCK_KR_CALENDAR_TOSS_ENVELOPE);
    reversed.result.today.integrated!.regularMarket!.endTime =
      "2025-03-10T08:59:59+09:00";
    const duplicate = structuredClone(MOCK_KR_CALENDAR_TOSS_ENVELOPE);
    duplicate.result.nextBusinessDay.date = duplicate.result.today.date;

    for (const envelope of [reversed, duplicate]) {
      const service = createMockMarketService({
        ...baseFixtures,
        calendarEnvelopes: { KR: envelope },
      });
      await expect(
        service.getMarketCalendar({
          country: "KR",
          date: "2025-03-10",
        }),
      ).rejects.toMatchObject({ reason: "INVALID_RESULT" });
    }

    const badRateWindow = structuredClone(MOCK_EXCHANGE_RATE_TOSS_ENVELOPE);
    badRateWindow.result.validUntil = badRateWindow.result.validFrom;
    const service = createMockMarketService({
      ...baseFixtures,
      exchangeRateEnvelopes: { "USD:KRW": badRateWindow },
    });
    await expect(
      service.getExchangeRate({
        baseCurrency: "USD",
        quoteCurrency: "KRW",
      }),
    ).rejects.toMatchObject({ reason: "INVALID_RESULT" });
  });

  it("never calls fetch or depends on the operating-system clock", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const nowSpy = vi.spyOn(Date, "now");
    const service = createMockMarketService();

    await service.getMarketCalendar({ country: "US", date: "2025-03-10" });
    await service.getExchangeRate({
      baseCurrency: "USD",
      quoteCurrency: "KRW",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(nowSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    nowSpy.mockRestore();
  });
});
