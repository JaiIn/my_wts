import { z } from "zod";

import {
  decimalFromString,
  decimalStringSchema,
  type DecimalString,
} from "../common/decimal";

export const SIMULATION_MARKET_COUNTRIES = ["KR", "US"] as const;
export const SIMULATION_ORDER_SIDES = ["BUY", "SELL"] as const;
export const SIMULATION_ORDER_TYPES = ["LIMIT", "MARKET"] as const;

export type SimulationMarketCountry =
  (typeof SIMULATION_MARKET_COUNTRIES)[number];
export type SimulationOrderSide = (typeof SIMULATION_ORDER_SIDES)[number];
export type SimulationOrderType = (typeof SIMULATION_ORDER_TYPES)[number];

export type OrderSizingValidationIssue = Readonly<{
  field:
    | "input"
    | "marketCountry"
    | "side"
    | "orderType"
    | "quantity"
    | "orderAmount";
  code:
    | "UNKNOWN_FIELD"
    | "INVALID_MARKET_COUNTRY"
    | "INVALID_SIDE"
    | "INVALID_ORDER_TYPE"
    | "INVALID_QUANTITY"
    | "INVALID_ORDER_AMOUNT"
    | "QUANTITY_OR_AMOUNT_REQUIRED"
    | "QUANTITY_AND_AMOUNT_MUTUALLY_EXCLUSIVE"
    | "KR_QUANTITY_MUST_BE_INTEGER"
    | "KR_AMOUNT_ORDER_UNSUPPORTED"
    | "AMOUNT_ORDER_REQUIRES_MARKET";
}>;

export class OrderSizingValidationError extends Error {
  readonly code = "SIMULATION_INPUT_INVALID";
  readonly stack = undefined;

  constructor(readonly issues: readonly OrderSizingValidationIssue[]) {
    super("ORDER_SIZING_VALIDATION_FAILED");
    this.name = "OrderSizingValidationError";
    this.issues = Object.freeze(
      issues.map((issue) => Object.freeze({ ...issue })),
    );
  }
}

export type QuantityOrderSizing = Readonly<{
  mode: "QUANTITY";
  marketCountry: SimulationMarketCountry;
  side: SimulationOrderSide;
  orderType: SimulationOrderType;
  quantity: DecimalString;
}>;

export type AmountOrderSizing = Readonly<{
  mode: "AMOUNT";
  marketCountry: "US";
  side: SimulationOrderSide;
  orderType: "MARKET";
  orderAmount: DecimalString;
}>;

export type OrderSizing = QuantityOrderSizing | AmountOrderSizing;

const simulationDecimalSchema = z
  .string()
  .max(30, "DECIMAL_TOO_LONG")
  .regex(/^\d+(?:\.\d+)?$/, "INVALID_DECIMAL")
  .pipe(decimalStringSchema)
  .refine((value) => decimalFromString(value).gt(0), "DECIMAL_NOT_POSITIVE");

const orderSizingInputSchema = z
  .object({
    marketCountry: z.enum(SIMULATION_MARKET_COUNTRIES),
    side: z.enum(SIMULATION_ORDER_SIDES),
    orderType: z.enum(SIMULATION_ORDER_TYPES),
    quantity: simulationDecimalSchema.optional(),
    orderAmount: simulationDecimalSchema.optional(),
  })
  .strict();

type ParsedOrderSizingInput = z.infer<typeof orderSizingInputSchema>;

function issueForPath(path: PropertyKey[]): OrderSizingValidationIssue {
  const field = path[0];
  if (field === "marketCountry") {
    return { field, code: "INVALID_MARKET_COUNTRY" };
  }
  if (field === "side") {
    return { field, code: "INVALID_SIDE" };
  }
  if (field === "orderType") {
    return { field, code: "INVALID_ORDER_TYPE" };
  }
  if (field === "orderAmount") {
    return { field, code: "INVALID_ORDER_AMOUNT" };
  }
  if (field === "quantity") {
    return { field, code: "INVALID_QUANTITY" };
  }
  return { field: "input", code: "UNKNOWN_FIELD" };
}

function parsedInput(input: unknown): ParsedOrderSizingInput {
  const parsed = orderSizingInputSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issueForPath(issue.path));
    throw new OrderSizingValidationError([
      ...new Map(
        issues.map((issue) => [`${issue.field}:${issue.code}`, issue]),
      ).values(),
    ]);
  }
  return parsed.data;
}

export function validateOrderSizing(input: unknown): OrderSizing {
  const parsed = parsedInput(input);
  const hasQuantity = parsed.quantity !== undefined;
  const hasOrderAmount = parsed.orderAmount !== undefined;

  if (!hasQuantity && !hasOrderAmount) {
    throw new OrderSizingValidationError([
      { field: "quantity", code: "QUANTITY_OR_AMOUNT_REQUIRED" },
      { field: "orderAmount", code: "QUANTITY_OR_AMOUNT_REQUIRED" },
    ]);
  }

  if (hasQuantity && hasOrderAmount) {
    throw new OrderSizingValidationError([
      {
        field: "quantity",
        code: "QUANTITY_AND_AMOUNT_MUTUALLY_EXCLUSIVE",
      },
      {
        field: "orderAmount",
        code: "QUANTITY_AND_AMOUNT_MUTUALLY_EXCLUSIVE",
      },
    ]);
  }

  if (parsed.quantity !== undefined) {
    if (
      parsed.marketCountry === "KR" &&
      !decimalFromString(parsed.quantity).isInteger()
    ) {
      throw new OrderSizingValidationError([
        { field: "quantity", code: "KR_QUANTITY_MUST_BE_INTEGER" },
      ]);
    }

    return Object.freeze({
      mode: "QUANTITY",
      marketCountry: parsed.marketCountry,
      side: parsed.side,
      orderType: parsed.orderType,
      quantity: parsed.quantity,
    });
  }

  if (parsed.orderAmount === undefined) {
    throw new OrderSizingValidationError([
      { field: "orderAmount", code: "QUANTITY_OR_AMOUNT_REQUIRED" },
    ]);
  }

  if (parsed.marketCountry !== "US") {
    throw new OrderSizingValidationError([
      { field: "orderAmount", code: "KR_AMOUNT_ORDER_UNSUPPORTED" },
    ]);
  }

  if (parsed.orderType !== "MARKET") {
    throw new OrderSizingValidationError([
      { field: "orderType", code: "AMOUNT_ORDER_REQUIRES_MARKET" },
    ]);
  }

  return Object.freeze({
    mode: "AMOUNT",
    marketCountry: parsed.marketCountry,
    side: parsed.side,
    orderType: parsed.orderType,
    orderAmount: parsed.orderAmount,
  });
}
