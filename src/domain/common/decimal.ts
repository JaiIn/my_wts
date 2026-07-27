import Decimal from "decimal.js";
import { z } from "zod";

const ContractDecimal = Decimal.clone({ precision: 40 });

const DECIMAL_STRING_PATTERN =
  /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export const decimalStringSchema = z
  .string()
  .refine((value) => value.trim() === value, "INVALID_DECIMAL_STRING")
  .regex(DECIMAL_STRING_PATTERN, "INVALID_DECIMAL_STRING")
  .refine((value) => {
    try {
      return new Decimal(value).isFinite();
    } catch {
      return false;
    }
  }, "INVALID_DECIMAL_STRING")
  .brand<"DecimalString">();

export type DecimalString = z.infer<typeof decimalStringSchema>;

export function decodeDecimalString(input: unknown): DecimalString {
  return decimalStringSchema.parse(input);
}

export function decimalFromString(value: DecimalString): Decimal {
  return new ContractDecimal(value);
}
