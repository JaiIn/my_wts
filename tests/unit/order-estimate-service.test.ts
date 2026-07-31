import { describe, expect, it } from "vitest";

import { calculateOrderEstimate } from "../../src/application/simulation/order-estimate-service";
import {
  OrderEstimateCalculationError,
  type TrustedOrderEstimateContext,
} from "../../src/domain/simulation/order-estimate";
import {
  validateOrderExecutionRules,
  type ValidatedSimulationOrder,
} from "../../src/domain/simulation/order-rules";

const REGULAR = Object.freeze({ isRegularSession: true });
const AS_OF = "2026-07-31T09:00:00+09:00";

function normalized(input: Record<string, unknown>): ValidatedSimulationOrder {
  return validateOrderExecutionRules(input, REGULAR);
}

function context(
  marketCountry: "KR" | "US",
  commissionRate = "0.015",
  overrides: Partial<TrustedOrderEstimateContext> = {},
): TrustedOrderEstimateContext {
  return Object.freeze({
    calculationDateKst: "2026-07-31",
    commissionRules: Object.freeze([
      Object.freeze({
        marketCountry,
        commissionRate,
        startDate: null,
        endDate: null,
      }),
    ]),
    ...overrides,
  });
}

function expectCode(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error("expected calculation failure");
  } catch (error) {
    expect(error).toBeInstanceOf(OrderEstimateCalculationError);
    expect((error as OrderEstimateCalculationError).issues).toEqual([
      expect.objectContaining({ code }),
    ]);
    expect(JSON.stringify(error)).not.toMatch(
      /005930|70000|account|credential|token/i,
    );
  }
}

describe("order estimate calculation service", () => {
  it.each([
    [
      "KR LIMIT BUY",
      normalized({
        marketCountry: "KR",
        side: "BUY",
        orderType: "LIMIT",
        quantity: "10",
        price: "70000",
      }),
      context("KR"),
      {
        currency: "KRW",
        sizingMode: "QUANTITY",
        estimatedOrderAmount: "700000",
        estimatedCommission: "105",
        estimatedCashAmount: "700105",
        cashDirection: "OUTFLOW",
        calculationPrice: "70000",
        referencePriceAsOf: null,
      },
    ],
    [
      "KR LIMIT SELL",
      normalized({
        marketCountry: "KR",
        side: "SELL",
        orderType: "LIMIT",
        quantity: "10",
        price: "70000",
      }),
      context("KR"),
      {
        currency: "KRW",
        sizingMode: "QUANTITY",
        estimatedOrderAmount: "700000",
        estimatedCommission: "105",
        estimatedCashAmount: "699895",
        cashDirection: "INFLOW",
        calculationPrice: "70000",
        referencePriceAsOf: null,
      },
    ],
    [
      "KR MARKET BUY",
      normalized({
        marketCountry: "KR",
        side: "BUY",
        orderType: "MARKET",
        quantity: "2",
      }),
      context("KR", "0.015", {
        referencePrice: "70000",
        referencePriceCurrency: "KRW",
        referencePriceAsOf: AS_OF,
      }),
      {
        currency: "KRW",
        sizingMode: "QUANTITY",
        estimatedOrderAmount: "140000",
        estimatedCommission: "21",
        estimatedCashAmount: "140021",
        cashDirection: "OUTFLOW",
        calculationPrice: "70000",
        referencePriceAsOf: AS_OF,
      },
    ],
    [
      "KR MARKET SELL",
      normalized({
        marketCountry: "KR",
        side: "SELL",
        orderType: "MARKET",
        quantity: "2",
      }),
      context("KR", "0.015", {
        referencePrice: "70000",
        referencePriceCurrency: "KRW",
        referencePriceAsOf: AS_OF,
      }),
      {
        currency: "KRW",
        sizingMode: "QUANTITY",
        estimatedOrderAmount: "140000",
        estimatedCommission: "21",
        estimatedCashAmount: "139979",
        cashDirection: "INFLOW",
        calculationPrice: "70000",
        referencePriceAsOf: AS_OF,
      },
    ],
    [
      "US LIMIT BUY",
      normalized({
        marketCountry: "US",
        side: "BUY",
        orderType: "LIMIT",
        quantity: "3",
        price: "10.25",
      }),
      context("US", "0.1"),
      {
        currency: "USD",
        sizingMode: "QUANTITY",
        estimatedOrderAmount: "30.75",
        estimatedCommission: "0.03075",
        estimatedCashAmount: "30.78075",
        cashDirection: "OUTFLOW",
        calculationPrice: "10.25",
        referencePriceAsOf: null,
      },
    ],
    [
      "US LIMIT SELL",
      normalized({
        marketCountry: "US",
        side: "SELL",
        orderType: "LIMIT",
        quantity: "3",
        price: "10.25",
      }),
      context("US", "0.1"),
      {
        currency: "USD",
        sizingMode: "QUANTITY",
        estimatedOrderAmount: "30.75",
        estimatedCommission: "0.03075",
        estimatedCashAmount: "30.71925",
        cashDirection: "INFLOW",
        calculationPrice: "10.25",
        referencePriceAsOf: null,
      },
    ],
    [
      "US MARKET integer BUY",
      normalized({
        marketCountry: "US",
        side: "BUY",
        orderType: "MARKET",
        quantity: "2",
      }),
      context("US", "0", {
        referencePrice: "10.25",
        referencePriceCurrency: "USD",
        referencePriceAsOf: AS_OF,
      }),
      {
        currency: "USD",
        sizingMode: "QUANTITY",
        estimatedOrderAmount: "20.5",
        estimatedCommission: "0",
        estimatedCashAmount: "20.5",
        cashDirection: "OUTFLOW",
        calculationPrice: "10.25",
        referencePriceAsOf: AS_OF,
      },
    ],
    [
      "US MARKET integer SELL",
      normalized({
        marketCountry: "US",
        side: "SELL",
        orderType: "MARKET",
        quantity: "2",
      }),
      context("US", "0.125", {
        referencePrice: "10.25",
        referencePriceCurrency: "USD",
        referencePriceAsOf: AS_OF,
      }),
      {
        currency: "USD",
        sizingMode: "QUANTITY",
        estimatedOrderAmount: "20.5",
        estimatedCommission: "0.025625",
        estimatedCashAmount: "20.474375",
        cashDirection: "INFLOW",
        calculationPrice: "10.25",
        referencePriceAsOf: AS_OF,
      },
    ],
    [
      "US fractional MARKET SELL",
      normalized({
        marketCountry: "US",
        side: "SELL",
        orderType: "MARKET",
        quantity: "0.123456",
      }),
      context("US", "0.1", {
        referencePrice: "0.1234",
        referencePriceCurrency: "USD",
        referencePriceAsOf: AS_OF,
      }),
      {
        currency: "USD",
        sizingMode: "QUANTITY",
        estimatedOrderAmount: "0.0152344704",
        estimatedCommission: "0.0000152344704",
        estimatedCashAmount: "0.0152192359296",
        cashDirection: "INFLOW",
        calculationPrice: "0.1234",
        referencePriceAsOf: AS_OF,
      },
    ],
    [
      "US amount BUY",
      normalized({
        marketCountry: "US",
        side: "BUY",
        orderType: "MARKET",
        orderAmount: "100.00",
      }),
      context("US", "0.1"),
      {
        currency: "USD",
        sizingMode: "AMOUNT",
        estimatedOrderAmount: "100",
        estimatedCommission: "0.1",
        estimatedCashAmount: "100.1",
        cashDirection: "OUTFLOW",
        calculationPrice: null,
        referencePriceAsOf: null,
      },
    ],
    [
      "US amount SELL",
      normalized({
        marketCountry: "US",
        side: "SELL",
        orderType: "MARKET",
        orderAmount: "100.00",
      }),
      context("US", "0.1"),
      {
        currency: "USD",
        sizingMode: "AMOUNT",
        estimatedOrderAmount: "100",
        estimatedCommission: "0.1",
        estimatedCashAmount: "99.9",
        cashDirection: "INFLOW",
        calculationPrice: null,
        referencePriceAsOf: null,
      },
    ],
  ] as const)(
    "calculates %s without rounding",
    (_name, order, ctx, expected) => {
      expect(calculateOrderEstimate(order, ctx)).toMatchObject(expected);
    },
  );

  it("selects commission rules with inclusive KST date bounds and null bounds", () => {
    const order = normalized({
      marketCountry: "KR",
      side: "BUY",
      orderType: "LIMIT",
      quantity: "1",
      price: "2000",
    });
    for (const [date, startDate, endDate] of [
      ["2026-01-01", "2026-01-01", "2026-12-31"],
      ["2026-12-31", "2026-01-01", "2026-12-31"],
      ["2026-01-01", null, "2026-01-01"],
      ["2026-12-31", "2026-12-31", null],
    ] as const) {
      expect(
        calculateOrderEstimate(order, {
          calculationDateKst: date,
          commissionRules: [
            {
              marketCountry: "KR",
              commissionRate: "0.015",
              startDate,
              endDate,
            },
          ],
        }).estimatedCommission,
      ).toBe("0.3");
    }
  });

  it("preserves long exact fractions and canonicalizes trailing zeroes", () => {
    const order = normalized({
      marketCountry: "US",
      side: "BUY",
      orderType: "LIMIT",
      quantity: "1",
      price: "0.1234",
    });
    expect(
      calculateOrderEstimate(order, context("US", "0.123456789"))
        .estimatedCommission,
    ).toBe("0.000152345677626");
  });

  it("calculates large decimals exactly without scientific notation", () => {
    const order = normalized({
      marketCountry: "US",
      side: "BUY",
      orderType: "LIMIT",
      quantity: "999999999",
      price: "999999999999",
    });
    const result = calculateOrderEstimate(order, context("US", "0"));
    expect(result.estimatedOrderAmount).toBe("999999998999000000001");
    expect(result.estimatedOrderAmount).not.toMatch(/[eE]/);
  });

  it("is deterministic and freezes the result without mutating input", () => {
    const order = normalized({
      marketCountry: "KR",
      side: "BUY",
      orderType: "LIMIT",
      quantity: "10",
      price: "70000",
    });
    const ctx = context("KR");
    const orderBefore = structuredClone(order);
    const contextBefore = structuredClone(ctx);
    const first = calculateOrderEstimate(order, ctx);
    const second = calculateOrderEstimate(order, ctx);

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(order).toEqual(orderBefore);
    expect(ctx).toEqual(contextBefore);
    expect(Object.keys(first)).not.toEqual(
      expect.arrayContaining(["orderId", "previewId", "executionId"]),
    );
    expect(first).toMatchObject({
      kind: "SIMULATION_ONLY",
      submitted: false,
      persisted: false,
      taxIncluded: false,
      fxApplied: false,
    });
  });

  it.each([
    ["missing", {}, "REFERENCE_PRICE_REQUIRED"],
    ["malformed", { referencePrice: "1e2" }, "REFERENCE_PRICE_INVALID"],
    ["zero", { referencePrice: "0" }, "REFERENCE_PRICE_INVALID"],
    ["negative", { referencePrice: "-1" }, "REFERENCE_PRICE_INVALID"],
  ] as const)("rejects %s MARKET reference price", (_name, overrides, code) => {
    const order = normalized({
      marketCountry: "US",
      side: "BUY",
      orderType: "MARKET",
      quantity: "1",
    });
    expectCode(
      () => calculateOrderEstimate(order, context("US", "0.1", overrides)),
      code,
    );
  });

  it("rejects missing reference timestamp and currency mismatch", () => {
    const order = normalized({
      marketCountry: "US",
      side: "BUY",
      orderType: "MARKET",
      quantity: "1",
    });
    expectCode(
      () =>
        calculateOrderEstimate(
          order,
          context("US", "0.1", {
            referencePrice: "10",
            referencePriceCurrency: "KRW",
            referencePriceAsOf: AS_OF,
          }),
        ),
      "REFERENCE_PRICE_CURRENCY_MISMATCH",
    );
    expectCode(
      () =>
        calculateOrderEstimate(
          order,
          context("US", "0.1", {
            referencePrice: "10",
            referencePriceCurrency: "USD",
          }),
        ),
      "REFERENCE_PRICE_INVALID",
    );
  });

  it("rejects absent, out-of-period, and ambiguous commission rules", () => {
    const order = normalized({
      marketCountry: "KR",
      side: "BUY",
      orderType: "LIMIT",
      quantity: "1",
      price: "2000",
    });
    expectCode(
      () =>
        calculateOrderEstimate(order, {
          calculationDateKst: "2026-07-31",
          commissionRules: [],
        }),
      "COMMISSION_RULE_NOT_FOUND",
    );
    expectCode(
      () =>
        calculateOrderEstimate(order, {
          calculationDateKst: "2026-07-31",
          commissionRules: [
            {
              marketCountry: "KR",
              commissionRate: "0.015",
              endDate: "2025-12-31",
            },
          ],
        }),
      "COMMISSION_RULE_NOT_FOUND",
    );
    expectCode(
      () =>
        calculateOrderEstimate(order, {
          calculationDateKst: "2026-07-31",
          commissionRules: [
            { marketCountry: "KR", commissionRate: "0.015" },
            { marketCountry: "KR", commissionRate: "0.02" },
          ],
        }),
      "COMMISSION_RULE_AMBIGUOUS",
    );
  });

  it.each(["-0.1", "1e-2", "NaN", "Infinity", ""])(
    "rejects malformed commission rate %s",
    (commissionRate) => {
      const order = normalized({
        marketCountry: "KR",
        side: "BUY",
        orderType: "LIMIT",
        quantity: "1",
        price: "2000",
      });
      expectCode(
        () => calculateOrderEstimate(order, context("KR", commissionRate)),
        "COMMISSION_RATE_INVALID",
      );
    },
  );

  it("rejects malformed trusted context and forged normalized orders", () => {
    const valid = normalized({
      marketCountry: "KR",
      side: "BUY",
      orderType: "LIMIT",
      quantity: "1",
      price: "2000",
    });
    expectCode(
      () =>
        calculateOrderEstimate(valid, {
          calculationDateKst: "2026-02-30",
          commissionRules: [],
        }),
      "CALCULATION_CONTEXT_INVALID",
    );
    expectCode(
      () =>
        calculateOrderEstimate(
          {
            ...valid,
            orderType: "MARKET",
            price: "2000",
          } as ValidatedSimulationOrder,
          context("KR"),
        ),
      "INVALID_NORMALIZED_ORDER",
    );
    expectCode(
      () =>
        calculateOrderEstimate(
          {
            ...valid,
            quantity: "1e2",
          } as ValidatedSimulationOrder,
          context("KR"),
        ),
      "INVALID_NORMALIZED_ORDER",
    );
    expectCode(
      () =>
        calculateOrderEstimate(
          {
            ...valid,
            marketCountry: "JP",
          } as unknown as ValidatedSimulationOrder,
          context("KR"),
        ),
      "INVALID_NORMALIZED_ORDER",
    );
  });

  it("rejects output longer than 30 characters without rounding", () => {
    const order = normalized({
      marketCountry: "US",
      side: "BUY",
      orderType: "LIMIT",
      quantity: "99999999999999999999",
      price: "99999999.99",
    });
    expectCode(
      () => calculateOrderEstimate(order, context("US", "0")),
      "CALCULATION_RESULT_TOO_LARGE",
    );
  });

  it("rejects SELL commission greater than gross", () => {
    const order = normalized({
      marketCountry: "US",
      side: "SELL",
      orderType: "LIMIT",
      quantity: "1",
      price: "1",
    });
    expectCode(
      () => calculateOrderEstimate(order, context("US", "101")),
      "CALCULATION_RESULT_INVALID",
    );
  });
});
