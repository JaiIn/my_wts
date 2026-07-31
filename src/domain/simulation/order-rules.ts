import { z } from "zod";

import {
  decodeDecimalString,
  decimalFromString,
  decimalStringSchema,
  type DecimalString,
} from "../common/decimal";
import {
  OrderSizingValidationError,
  validateOrderSizing,
  type AmountOrderSizing,
  type QuantityOrderSizing,
} from "./order-sizing";

export const SIMULATION_TIME_IN_FORCE = ["DAY", "CLS"] as const;

export type SimulationTimeInForce = (typeof SIMULATION_TIME_IN_FORCE)[number];

export type OrderRuleValidationIssue = Readonly<{
  field: "input" | "timeInForce" | "price" | "quantity" | "session";
  code:
    | "UNKNOWN_FIELD"
    | "TIME_IN_FORCE_INVALID"
    | "TIME_IN_FORCE_NOT_ALLOWED"
    | "CLS_NOT_SUPPORTED"
    | "LIMIT_PRICE_REQUIRED"
    | "LIMIT_PRICE_INVALID"
    | "MARKET_PRICE_NOT_ALLOWED"
    | "KR_PRICE_NOT_INTEGER"
    | "KR_TICK_SIZE_MISMATCH"
    | "US_PRICE_SCALE_EXCEEDED"
    | "FRACTIONAL_QUANTITY_NOT_ALLOWED"
    | "FRACTIONAL_QUANTITY_SCALE_EXCEEDED"
    | "REGULAR_SESSION_REQUIRED"
    | "TRUSTED_CONTEXT_INVALID";
}>;

export class OrderRuleValidationError extends Error {
  readonly code = "SIMULATION_INPUT_INVALID";
  readonly stack = undefined;

  constructor(readonly issues: readonly OrderRuleValidationIssue[]) {
    super("ORDER_RULE_VALIDATION_FAILED");
    this.name = "OrderRuleValidationError";
    this.issues = Object.freeze(
      issues.map((issue) => Object.freeze({ ...issue })),
    );
  }
}

export type TrustedOrderValidationContext = Readonly<{
  isRegularSession: boolean;
}>;

export type ValidatedQuantitySimulationOrder = Readonly<
  QuantityOrderSizing & {
    timeInForce: SimulationTimeInForce;
    price?: DecimalString;
  }
>;

export type ValidatedAmountSimulationOrder = AmountOrderSizing;

export type ValidatedSimulationOrder =
  ValidatedQuantitySimulationOrder | ValidatedAmountSimulationOrder;

const executionRuleInputSchema = z
  .object({
    marketCountry: z.unknown(),
    side: z.unknown(),
    orderType: z.unknown(),
    quantity: z.unknown().optional(),
    orderAmount: z.unknown().optional(),
    timeInForce: z.unknown().optional(),
    price: z.unknown().optional(),
  })
  .strict();

const trustedContextSchema = z
  .object({
    isRegularSession: z.boolean(),
  })
  .strict();

const priceSchema = z
  .string()
  .max(30)
  .regex(/^\d+(?:\.\d+)?$/)
  .pipe(decimalStringSchema)
  .refine((value) => decimalFromString(value).gt(0));

function decimalScale(value: DecimalString): number {
  const decimalPoint = value.indexOf(".");
  return decimalPoint === -1 ? 0 : value.length - decimalPoint - 1;
}

function krTickSize(price: DecimalString): DecimalString {
  const value = decimalFromString(price);
  if (value.lt(2_000)) return decodeDecimalString("1");
  if (value.lt(5_000)) return decodeDecimalString("5");
  if (value.lt(20_000)) return decodeDecimalString("10");
  if (value.lt(50_000)) return decodeDecimalString("50");
  if (value.lt(200_000)) return decodeDecimalString("100");
  if (value.lt(500_000)) return decodeDecimalString("500");
  return decodeDecimalString("1000");
}

function parseInput(input: unknown): z.infer<typeof executionRuleInputSchema> {
  const parsed = executionRuleInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderRuleValidationError([
      { field: "input", code: "UNKNOWN_FIELD" },
    ]);
  }
  return parsed.data;
}

function parseContext(input: unknown): TrustedOrderValidationContext {
  const parsed = trustedContextSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderRuleValidationError([
      { field: "session", code: "TRUSTED_CONTEXT_INVALID" },
    ]);
  }
  return Object.freeze({ ...parsed.data });
}

function parseTimeInForce(input: unknown): SimulationTimeInForce | undefined {
  if (input === undefined) return undefined;
  const parsed = z.enum(SIMULATION_TIME_IN_FORCE).safeParse(input);
  if (!parsed.success) {
    throw new OrderRuleValidationError([
      { field: "timeInForce", code: "TIME_IN_FORCE_INVALID" },
    ]);
  }
  return parsed.data;
}

function parsePrice(input: unknown): DecimalString {
  const parsed = priceSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderRuleValidationError([
      { field: "price", code: "LIMIT_PRICE_INVALID" },
    ]);
  }
  return parsed.data;
}

function validateLimitPrice(
  sizing: QuantityOrderSizing,
  rawPrice: unknown,
): DecimalString {
  if (rawPrice === undefined) {
    throw new OrderRuleValidationError([
      { field: "price", code: "LIMIT_PRICE_REQUIRED" },
    ]);
  }
  const price = parsePrice(rawPrice);

  if (sizing.marketCountry === "KR") {
    if (price.includes(".")) {
      throw new OrderRuleValidationError([
        { field: "price", code: "KR_PRICE_NOT_INTEGER" },
      ]);
    }
    if (!decimalFromString(price).mod(krTickSize(price)).isZero()) {
      throw new OrderRuleValidationError([
        { field: "price", code: "KR_TICK_SIZE_MISMATCH" },
      ]);
    }
    return price;
  }

  const permittedScale = decimalFromString(price).lt(1) ? 4 : 2;
  if (decimalScale(price) > permittedScale) {
    throw new OrderRuleValidationError([
      { field: "price", code: "US_PRICE_SCALE_EXCEEDED" },
    ]);
  }
  return price;
}

function validateFractionalQuantity(
  sizing: QuantityOrderSizing,
  context: TrustedOrderValidationContext,
): void {
  if (!sizing.quantity.includes(".")) return;

  if (
    sizing.marketCountry !== "US" ||
    sizing.side !== "SELL" ||
    sizing.orderType !== "MARKET"
  ) {
    throw new OrderRuleValidationError([
      { field: "quantity", code: "FRACTIONAL_QUANTITY_NOT_ALLOWED" },
    ]);
  }
  if (decimalScale(sizing.quantity) > 6) {
    throw new OrderRuleValidationError([
      { field: "quantity", code: "FRACTIONAL_QUANTITY_SCALE_EXCEEDED" },
    ]);
  }
  if (!context.isRegularSession) {
    throw new OrderRuleValidationError([
      { field: "session", code: "REGULAR_SESSION_REQUIRED" },
    ]);
  }
}

function validateAmountOrder(
  sizing: AmountOrderSizing,
  input: z.infer<typeof executionRuleInputSchema>,
  context: TrustedOrderValidationContext,
): ValidatedAmountSimulationOrder {
  if (input.timeInForce !== undefined) {
    throw new OrderRuleValidationError([
      { field: "timeInForce", code: "TIME_IN_FORCE_NOT_ALLOWED" },
    ]);
  }
  if (input.price !== undefined) {
    throw new OrderRuleValidationError([
      { field: "price", code: "MARKET_PRICE_NOT_ALLOWED" },
    ]);
  }
  if (!context.isRegularSession) {
    throw new OrderRuleValidationError([
      { field: "session", code: "REGULAR_SESSION_REQUIRED" },
    ]);
  }
  return Object.freeze({ ...sizing });
}

export function validateOrderExecutionRules(
  input: unknown,
  trustedContext: TrustedOrderValidationContext,
): ValidatedSimulationOrder {
  const parsed = parseInput(input);
  const context = parseContext(trustedContext);
  const sizing = validateOrderSizing({
    marketCountry: parsed.marketCountry,
    side: parsed.side,
    orderType: parsed.orderType,
    quantity: parsed.quantity,
    orderAmount: parsed.orderAmount,
  });

  if (sizing.mode === "AMOUNT") {
    return validateAmountOrder(sizing, parsed, context);
  }

  const timeInForce = parseTimeInForce(parsed.timeInForce) ?? "DAY";
  if (
    timeInForce === "CLS" &&
    (sizing.marketCountry !== "US" || sizing.orderType !== "LIMIT")
  ) {
    throw new OrderRuleValidationError([
      { field: "timeInForce", code: "CLS_NOT_SUPPORTED" },
    ]);
  }

  validateFractionalQuantity(sizing, context);

  if (sizing.orderType === "MARKET") {
    if (parsed.price !== undefined) {
      throw new OrderRuleValidationError([
        { field: "price", code: "MARKET_PRICE_NOT_ALLOWED" },
      ]);
    }
    return Object.freeze({ ...sizing, timeInForce });
  }

  return Object.freeze({
    ...sizing,
    timeInForce,
    price: validateLimitPrice(sizing, parsed.price),
  });
}

export { OrderSizingValidationError };
