import { describe, expect, it } from "vitest";

import {
  OrderRuleValidationError,
  validateOrderExecutionRules,
} from "../../src/domain/simulation/order-rules";
import { OrderSizingValidationError } from "../../src/domain/simulation/order-sizing";

const REGULAR = Object.freeze({ isRegularSession: true });
const OUTSIDE_REGULAR = Object.freeze({ isRegularSession: false });

describe("simulation order execution rules", () => {
  it("defaults omitted quantity timeInForce to DAY", () => {
    expect(
      validateOrderExecutionRules(
        {
          marketCountry: "KR",
          side: "BUY",
          orderType: "LIMIT",
          quantity: "10",
          price: "70000",
        },
        REGULAR,
      ),
    ).toMatchObject({ mode: "QUANTITY", timeInForce: "DAY" });
  });

  it.each([
    ["KR", "BUY", "LIMIT"],
    ["KR", "BUY", "MARKET"],
    ["KR", "SELL", "LIMIT"],
    ["KR", "SELL", "MARKET"],
    ["US", "BUY", "LIMIT"],
    ["US", "BUY", "MARKET"],
    ["US", "SELL", "LIMIT"],
    ["US", "SELL", "MARKET"],
  ] as const)(
    "accepts explicit DAY for %s %s %s",
    (marketCountry, side, orderType) => {
      const input = {
        marketCountry,
        side,
        orderType,
        quantity: "10",
        timeInForce: "DAY",
        ...(orderType === "LIMIT"
          ? { price: marketCountry === "KR" ? "70000" : "10.25" }
          : {}),
      };
      expect(validateOrderExecutionRules(input, REGULAR)).toMatchObject({
        timeInForce: "DAY",
      });
    },
  );

  it("accepts CLS only for US LIMIT quantity orders", () => {
    expect(
      validateOrderExecutionRules(
        {
          marketCountry: "US",
          side: "BUY",
          orderType: "LIMIT",
          timeInForce: "CLS",
          quantity: "3",
          price: "10.25",
        },
        OUTSIDE_REGULAR,
      ),
    ).toMatchObject({ timeInForce: "CLS" });

    for (const input of [
      {
        marketCountry: "KR",
        side: "BUY",
        orderType: "LIMIT",
        timeInForce: "CLS",
        quantity: "3",
        price: "70000",
      },
      {
        marketCountry: "US",
        side: "SELL",
        orderType: "MARKET",
        timeInForce: "CLS",
        quantity: "3",
      },
    ]) {
      expectRuleCodes(input, REGULAR, ["CLS_NOT_SUPPORTED"]);
    }
  });

  it.each(["day", " DAY", "OPG", "", 1] as const)(
    "rejects unsupported or non-canonical TIF: %j",
    (timeInForce) => {
      expectRuleCodes(
        {
          marketCountry: "US",
          side: "BUY",
          orderType: "MARKET",
          timeInForce,
          quantity: "1",
        },
        REGULAR,
        ["TIME_IN_FORCE_INVALID"],
      );
    },
  );

  it("requires LIMIT price and forbids MARKET price", () => {
    expectRuleCodes(
      {
        marketCountry: "US",
        side: "BUY",
        orderType: "LIMIT",
        quantity: "1",
      },
      REGULAR,
      ["LIMIT_PRICE_REQUIRED"],
    );
    expectRuleCodes(
      {
        marketCountry: "US",
        side: "BUY",
        orderType: "MARKET",
        quantity: "1",
        price: "10",
      },
      REGULAR,
      ["MARKET_PRICE_NOT_ALLOWED"],
    );
  });

  it.each([
    ["1", "1"],
    ["1999", "1"],
    ["2000", "5"],
    ["4995", "5"],
    ["5000", "10"],
    ["19990", "10"],
    ["20000", "50"],
    ["49950", "50"],
    ["50000", "100"],
    ["199900", "100"],
    ["200000", "500"],
    ["499500", "500"],
    ["500000", "1000"],
    ["999999999999999999999999999000", "1000"],
  ] as const)(
    "accepts KR tick boundary price %s with tick %s",
    (price, expectedTick) => {
      expect(expectedTick).toMatch(/^\d+$/);
      expect(
        validateOrderExecutionRules(
          {
            marketCountry: "KR",
            side: "BUY",
            orderType: "LIMIT",
            quantity: "1",
            price,
          },
          REGULAR,
        ),
      ).toMatchObject({ price });
    },
  );

  it.each([
    "4999",
    "19999",
    "49999",
    "199999",
    "499999",
    "2001",
    "5001",
    "20001",
    "50001",
    "200001",
    "500001",
  ])("rejects KR price off the active tick: %s", (price) => {
    expectRuleCodes(
      {
        marketCountry: "KR",
        side: "BUY",
        orderType: "LIMIT",
        quantity: "1",
        price,
      },
      REGULAR,
      ["KR_TICK_SIZE_MISMATCH"],
    );
  });

  it("uses the upper band tick at every KR boundary", () => {
    for (const price of [
      "1999",
      "2000",
      "5000",
      "20000",
      "50000",
      "200000",
      "500000",
    ]) {
      expect(
        validateOrderExecutionRules(
          {
            marketCountry: "KR",
            side: "SELL",
            orderType: "LIMIT",
            quantity: "2",
            price,
          },
          REGULAR,
        ),
      ).toMatchObject({ price });
    }
  });

  it.each(["2000.0", "1.5"])(
    "rejects non-lexical-integer KR price: %s",
    (price) => {
      expectRuleCodes(
        {
          marketCountry: "KR",
          side: "BUY",
          orderType: "LIMIT",
          quantity: "1",
          price,
        },
        REGULAR,
        ["KR_PRICE_NOT_INTEGER"],
      );
    },
  );

  it.each([
    ["0.0001", true],
    ["0.9999", true],
    ["0.9990", true],
    ["0.00001", false],
    ["0.99999", false],
    ["1", true],
    ["1.20", true],
    ["999999999999999999999999999.99", true],
    ["1.001", false],
  ] as const)(
    "validates US price scale without rounding: %s",
    (price, valid) => {
      const input = {
        marketCountry: "US",
        side: "BUY",
        orderType: "LIMIT",
        quantity: "1",
        price,
      };
      if (valid) {
        expect(validateOrderExecutionRules(input, REGULAR)).toMatchObject({
          price,
        });
      } else {
        expectRuleCodes(input, REGULAR, ["US_PRICE_SCALE_EXCEEDED"]);
      }
    },
  );

  it.each([
    ["BUY", "1"],
    ["SELL", "1"],
  ] as const)("accepts US integer quantity for %s", (side, quantity) => {
    expect(
      validateOrderExecutionRules(
        {
          marketCountry: "US",
          side,
          orderType: "MARKET",
          quantity,
        },
        OUTSIDE_REGULAR,
      ),
    ).toMatchObject({ quantity });
  });

  it("accepts scale-6 US fractional MARKET SELL only during regular session", () => {
    expect(
      validateOrderExecutionRules(
        {
          marketCountry: "US",
          side: "SELL",
          orderType: "MARKET",
          quantity: "0.000001",
        },
        REGULAR,
      ),
    ).toMatchObject({ quantity: "0.000001", timeInForce: "DAY" });
  });

  it("rejects disallowed US fractional side and order type", () => {
    expectRuleCodes(
      {
        marketCountry: "US",
        side: "BUY",
        orderType: "MARKET",
        quantity: "0.5",
      },
      REGULAR,
      ["FRACTIONAL_QUANTITY_NOT_ALLOWED"],
    );
    expectRuleCodes(
      {
        marketCountry: "US",
        side: "SELL",
        orderType: "LIMIT",
        quantity: "0.5",
        price: "10",
      },
      REGULAR,
      ["FRACTIONAL_QUANTITY_NOT_ALLOWED"],
    );
  });

  it("rejects fractional scale above 6 and outside regular session", () => {
    const input = {
      marketCountry: "US",
      side: "SELL",
      orderType: "MARKET",
      quantity: "0.0000001",
    };
    expectRuleCodes(input, REGULAR, ["FRACTIONAL_QUANTITY_SCALE_EXCEEDED"]);
    expectRuleCodes({ ...input, quantity: "0.5" }, OUTSIDE_REGULAR, [
      "REGULAR_SESSION_REQUIRED",
    ]);
  });

  it.each(["BUY", "SELL"] as const)(
    "accepts US MARKET amount %s only in regular session without TIF",
    (side) => {
      const result = validateOrderExecutionRules(
        {
          marketCountry: "US",
          side,
          orderType: "MARKET",
          orderAmount: "100.50",
        },
        REGULAR,
      );
      expect(result).toEqual({
        mode: "AMOUNT",
        marketCountry: "US",
        side,
        orderType: "MARKET",
        orderAmount: "100.50",
      });
      expect(result).not.toHaveProperty("timeInForce");
    },
  );

  it("rejects amount order outside regular session", () => {
    expectRuleCodes(
      {
        marketCountry: "US",
        side: "SELL",
        orderType: "MARKET",
        orderAmount: "10",
      },
      OUTSIDE_REGULAR,
      ["REGULAR_SESSION_REQUIRED"],
    );
  });

  it("rejects amount TIF, price, quantity, and LIMIT combinations", () => {
    expectRuleCodes(
      {
        marketCountry: "US",
        side: "BUY",
        orderType: "MARKET",
        orderAmount: "10",
        timeInForce: "DAY",
      },
      REGULAR,
      ["TIME_IN_FORCE_NOT_ALLOWED"],
    );
    expectRuleCodes(
      {
        marketCountry: "US",
        side: "BUY",
        orderType: "MARKET",
        orderAmount: "10",
        price: "1",
      },
      REGULAR,
      ["MARKET_PRICE_NOT_ALLOWED"],
    );
    expectSizingCodes(
      {
        marketCountry: "US",
        side: "BUY",
        orderType: "MARKET",
        orderAmount: "10",
        quantity: "1",
      },
      [
        "QUANTITY_AND_AMOUNT_MUTUALLY_EXCLUSIVE",
        "QUANTITY_AND_AMOUNT_MUTUALLY_EXCLUSIVE",
      ],
    );
    expectSizingCodes(
      {
        marketCountry: "US",
        side: "BUY",
        orderType: "LIMIT",
        orderAmount: "10",
        price: "1",
      },
      ["AMOUNT_ORDER_REQUIRES_MARKET"],
    );
  });

  it.each([
    ["0", "LIMIT_PRICE_INVALID"],
    ["-1", "LIMIT_PRICE_INVALID"],
    ["+1", "LIMIT_PRICE_INVALID"],
    ["1e2", "LIMIT_PRICE_INVALID"],
    ["NaN", "LIMIT_PRICE_INVALID"],
    ["Infinity", "LIMIT_PRICE_INVALID"],
  ] as const)("rejects malformed price %j", (price, code) => {
    expectRuleCodes(
      {
        marketCountry: "US",
        side: "BUY",
        orderType: "LIMIT",
        quantity: "1",
        price,
      },
      REGULAR,
      [code],
    );
  });

  it("keeps trusted session context outside the request payload", () => {
    expectRuleCodes(
      {
        marketCountry: "US",
        side: "SELL",
        orderType: "MARKET",
        quantity: "0.5",
        isRegularSession: true,
      },
      REGULAR,
      ["UNKNOWN_FIELD"],
    );
    expectRuleCodes(
      {
        marketCountry: "US",
        side: "SELL",
        orderType: "MARKET",
        quantity: "0.5",
      },
      { isRegularSession: true, source: "request" } as never,
      ["TRUSTED_CONTEXT_INVALID"],
    );
  });

  it("returns immutable data isolated from input and context mutation", () => {
    const input = {
      marketCountry: "US",
      side: "SELL",
      orderType: "MARKET",
      quantity: "0.5",
    };
    const context = { isRegularSession: true };
    const result = validateOrderExecutionRules(input, context);

    input.quantity = "0.7";
    context.isRegularSession = false;

    expect(result).toMatchObject({ quantity: "0.5" });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("returns safe rule errors without payload values", () => {
    let caught: unknown;
    try {
      validateOrderExecutionRules(
        {
          marketCountry: "US",
          side: "BUY",
          orderType: "LIMIT",
          quantity: "1",
          price: "1234567890123456789012345678901",
        },
        REGULAR,
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OrderRuleValidationError);
    expect(caught).toMatchObject({
      code: "SIMULATION_INPUT_INVALID",
      message: "ORDER_RULE_VALIDATION_FAILED",
      stack: undefined,
    });
    expect(JSON.stringify(caught)).not.toContain(
      "1234567890123456789012345678901",
    );
  });
});

function expectRuleCodes(
  input: unknown,
  context: { isRegularSession: boolean },
  codes: string[],
): void {
  try {
    validateOrderExecutionRules(input, context);
    throw new Error("expected rule validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(OrderRuleValidationError);
    expect(
      (error as OrderRuleValidationError).issues.map(({ code }) => code),
    ).toEqual(codes);
  }
}

function expectSizingCodes(input: unknown, codes: string[]): void {
  try {
    validateOrderExecutionRules(input, REGULAR);
    throw new Error("expected sizing validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(OrderSizingValidationError);
    expect(
      (error as OrderSizingValidationError).issues.map(({ code }) => code),
    ).toEqual(codes);
  }
}
