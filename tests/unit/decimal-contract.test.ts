import { describe, expect, it } from "vitest";

import {
  decodeDecimalString,
  decimalFromString,
} from "../../src/domain/common/decimal";

describe("decimal string contract", () => {
  it.each(["0", "-0.001", "+12.50", ".75", "9007199254740993.01", "1.25e-7"])(
    "preserves valid decimal text: %s",
    (input) => {
      expect(decodeDecimalString(input)).toBe(input);
    },
  );

  it.each([
    1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "",
    " 1.2",
    "1.2 ",
    "Infinity",
    "NaN",
    "0x10",
    "1,000",
    null,
    undefined,
  ])("rejects non-decimal input without coercion: %j", (input) => {
    expect(() => decodeDecimalString(input)).toThrow();
  });

  it("keeps precision beyond the JavaScript number boundary", () => {
    const value = decodeDecimalString("9007199254740993.01");

    expect(decimalFromString(value).plus("0.99").toFixed(2)).toBe(
      "9007199254740994.00",
    );
  });
});
