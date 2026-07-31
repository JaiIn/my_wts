import { z } from "zod";

import { decimalStringSchema } from "../../domain/common/decimal";

const MAX_DECIMAL_LENGTH = 30;
const MAX_FORWARD_COMPATIBLE_ENUM_LENGTH = 128;

const nonNegativeOrderDecimalSchema = decimalStringSchema
  .refine(
    (value) => value.length <= MAX_DECIMAL_LENGTH,
    "DECIMAL_LENGTH_EXCEEDED",
  )
  .refine((value) => !value.startsWith("-"), "NEGATIVE_DECIMAL_NOT_ALLOWED");

const forwardCompatibleEnumSchema = z
  .string()
  .min(1)
  .max(MAX_FORWARD_COMPATIBLE_ENUM_LENGTH);

export const tossOrderStatusSchema = forwardCompatibleEnumSchema;

export const tossOrderExecutionSchema = z.looseObject({
  filledQuantity: nonNegativeOrderDecimalSchema,
  averageFilledPrice: nonNegativeOrderDecimalSchema.nullable(),
  filledAmount: nonNegativeOrderDecimalSchema.nullable(),
  commission: nonNegativeOrderDecimalSchema.nullable(),
  tax: nonNegativeOrderDecimalSchema.nullable(),
  filledAt: z.iso.datetime({ offset: true }).nullable(),
  settlementDate: z.iso.date().nullable(),
});

export const tossOrderSchema = z.looseObject({
  orderId: z.string().min(1),
  symbol: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9._-]+$/),
  side: z.enum(["BUY", "SELL"]),
  orderType: forwardCompatibleEnumSchema,
  timeInForce: forwardCompatibleEnumSchema,
  status: tossOrderStatusSchema,
  price: nonNegativeOrderDecimalSchema.nullable().optional(),
  quantity: nonNegativeOrderDecimalSchema,
  orderAmount: nonNegativeOrderDecimalSchema.nullable().optional(),
  currency: forwardCompatibleEnumSchema,
  orderedAt: z.iso.datetime({ offset: true }),
  canceledAt: z.iso.datetime({ offset: true }).nullable().optional(),
  execution: tossOrderExecutionSchema,
});

export const tossPaginatedOrderResponseSchema = z.looseObject({
  orders: z.array(tossOrderSchema),
  nextCursor: z.string().nullable(),
  hasNext: z.boolean(),
});

export type TossOrderDto = z.infer<typeof tossOrderSchema>;
export type TossOrderExecutionDto = z.infer<typeof tossOrderExecutionSchema>;
export type TossPaginatedOrderResponseDto = z.infer<
  typeof tossPaginatedOrderResponseSchema
>;
