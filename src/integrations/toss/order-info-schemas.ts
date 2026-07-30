import { z } from "zod";

import { decimalStringSchema } from "../../domain/common/decimal";

const nonNegativeDecimalSchema = decimalStringSchema.refine(
  (value) => !value.startsWith("-"),
  "NEGATIVE_DECIMAL_NOT_ALLOWED",
);
const forwardCompatibleEnumSchema = z.string().min(1).max(128);

export const tossBuyingPowerResponseSchema = z.looseObject({
  currency: forwardCompatibleEnumSchema,
  cashBuyingPower: nonNegativeDecimalSchema,
});

export const tossSellableQuantityResponseSchema = z.looseObject({
  sellableQuantity: nonNegativeDecimalSchema,
});

export const tossCommissionSchema = z.looseObject({
  marketCountry: forwardCompatibleEnumSchema,
  commissionRate: nonNegativeDecimalSchema,
  startDate: z.iso.date().nullable().optional(),
  endDate: z.iso.date().nullable().optional(),
});

export const tossCommissionListSchema = z.array(tossCommissionSchema);

export type TossBuyingPowerResponse = z.infer<
  typeof tossBuyingPowerResponseSchema
>;
export type TossSellableQuantityResponse = z.infer<
  typeof tossSellableQuantityResponseSchema
>;
export type TossCommission = z.infer<typeof tossCommissionSchema>;
