import { describe, expect, it } from "vitest";

import {
  OrderSizingValidationError,
  validateOrderSizing,
} from "../../src/domain/simulation/order-sizing";

describe("order simulation sizing validator", () => {
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
    "accepts positive quantity sizing for %s %s %s",
    (marketCountry, side, orderType) => {
      expect(
        validateOrderSizing({
          marketCountry,
          side,
          orderType,
          quantity: "10",
        }),
      ).toEqual({
        mode: "QUANTITY",
        marketCountry,
        side,
        orderType,
        quantity: "10",
      });
    },
  );

  it.each(["BUY", "SELL"] as const)(
    "accepts US MARKET amount sizing for %s",
    (side) => {
      expect(
        validateOrderSizing({
          marketCountry: "US",
          side,
          orderType: "MARKET",
          orderAmount: "100.50",
        }),
      ).toEqual({
        mode: "AMOUNT",
        marketCountry: "US",
        side,
        orderType: "MARKET",
        orderAmount: "100.50",
      });
    },
  );

  it("preserves large and fractional US decimal text without number conversion", () => {
    const quantity = validateOrderSizing({
      marketCountry: "US",
      side: "SELL",
      orderType: "MARKET",
      quantity: "9007199254740993.000001",
    });
    const amount = validateOrderSizing({
      marketCountry: "US",
      side: "BUY",
      orderType: "MARKET",
      orderAmount: "9007199254740993.01",
    });

    expect(quantity).toMatchObject({ quantity: "9007199254740993.000001" });
    expect(amount).toMatchObject({ orderAmount: "9007199254740993.01" });
  });

  it("requires exactly one of quantity and orderAmount", () => {
    expectValidationCodes(
      {
        marketCountry: "KR",
        side: "BUY",
        orderType: "LIMIT",
      },
      ["QUANTITY_OR_AMOUNT_REQUIRED", "QUANTITY_OR_AMOUNT_REQUIRED"],
    );
    expectValidationCodes(
      {
        marketCountry: "US",
        side: "BUY",
        orderType: "MARKET",
        quantity: "1",
        orderAmount: "10",
      },
      [
        "QUANTITY_AND_AMOUNT_MUTUALLY_EXCLUSIVE",
        "QUANTITY_AND_AMOUNT_MUTUALLY_EXCLUSIVE",
      ],
    );
  });

  it.each(["BUY", "SELL"] as const)(
    "rejects KR amount sizing for %s",
    (side) => {
      expectValidationCodes(
        {
          marketCountry: "KR",
          side,
          orderType: "MARKET",
          orderAmount: "10000",
        },
        ["KR_AMOUNT_ORDER_UNSUPPORTED"],
      );
    },
  );

  it.each(["BUY", "SELL"] as const)(
    "rejects US LIMIT amount sizing for %s",
    (side) => {
      expectValidationCodes(
        {
          marketCountry: "US",
          side,
          orderType: "LIMIT",
          orderAmount: "100",
        },
        ["AMOUNT_ORDER_REQUIRES_MARKET"],
      );
    },
  );

  it("rejects non-lexical-integer KR quantity while leaving US fractional eligibility to MS-07.02", () => {
    for (const quantity of ["0.5", "10.0"]) {
      expectValidationCodes(
        {
          marketCountry: "KR",
          side: "SELL",
          orderType: "MARKET",
          quantity,
        },
        ["KR_QUANTITY_MUST_BE_INTEGER"],
      );
    }

    expect(
      validateOrderSizing({
        marketCountry: "US",
        side: "SELL",
        orderType: "MARKET",
        quantity: "0.5",
      }),
    ).toMatchObject({ mode: "QUANTITY", quantity: "0.5" });
  });

  it.each([
    ["quantity", "0"],
    ["quantity", "-1"],
    ["quantity", "+1"],
    ["quantity", ".5"],
    ["quantity", "1e2"],
    ["quantity", "NaN"],
    ["quantity", "Infinity"],
    ["quantity", 1],
    ["orderAmount", "0"],
    ["orderAmount", "-1"],
    ["orderAmount", "1,000"],
    ["orderAmount", " 10"],
    ["orderAmount", "1234567890123456789012345678901"],
  ] as const)(
    "rejects invalid %s value without coercion: %j",
    (field, value) => {
      expectValidationCodes(
        {
          marketCountry: "US",
          side: "BUY",
          orderType: "MARKET",
          [field]: value,
        },
        [field === "quantity" ? "INVALID_QUANTITY" : "INVALID_ORDER_AMOUNT"],
      );
    },
  );

  it.each([
    ["marketCountry", "JP", "INVALID_MARKET_COUNTRY"],
    ["side", "HOLD", "INVALID_SIDE"],
    ["orderType", "STOP", "INVALID_ORDER_TYPE"],
  ] as const)("rejects an unsupported %s", (field, value, code) => {
    expectValidationCodes(
      {
        marketCountry: "US",
        side: "BUY",
        orderType: "MARKET",
        quantity: "1",
        [field]: value,
      },
      [code],
    );
  });

  it("rejects unknown fields instead of accepting mutation request metadata", () => {
    expectValidationCodes(
      {
        marketCountry: "US",
        side: "BUY",
        orderType: "MARKET",
        quantity: "1",
        clientOrderId: "not-accepted",
      },
      ["UNKNOWN_FIELD"],
    );
  });

  it("returns frozen data and isolates it from input mutation", () => {
    const input = {
      marketCountry: "US",
      side: "BUY",
      orderType: "MARKET",
      orderAmount: "25.00",
    };
    const result = validateOrderSizing(input);

    input.orderAmount = "99.00";

    expect(result).toMatchObject({ orderAmount: "25.00" });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("returns sanitized errors without input values", () => {
    let caught: unknown;
    try {
      validateOrderSizing({
        marketCountry: "US",
        side: "BUY",
        orderType: "MARKET",
        quantity: "1234567890123456789012345678901",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(OrderSizingValidationError);
    expect(caught).toMatchObject({
      code: "SIMULATION_INPUT_INVALID",
      message: "ORDER_SIZING_VALIDATION_FAILED",
      stack: undefined,
    });
    expect(JSON.stringify(caught)).not.toContain(
      "1234567890123456789012345678901",
    );
  });
});

function expectValidationCodes(input: unknown, codes: string[]): void {
  try {
    validateOrderSizing(input);
    throw new Error("expected validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(OrderSizingValidationError);
    expect(
      (error as OrderSizingValidationError).issues.map(({ code }) => code),
    ).toEqual(codes);
  }
}
