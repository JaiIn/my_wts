import { z } from "zod";

import { decimalStringSchema } from "../../domain/common/decimal";

const MAX_DECIMAL_LENGTH = 30;
const MAX_CODE_LENGTH = 128;

const nonNegativeDecimalSchema = decimalStringSchema
  .refine(
    (value) => value.length <= MAX_DECIMAL_LENGTH,
    "DECIMAL_LENGTH_EXCEEDED",
  )
  .refine((value) => /^\d+(?:\.\d+)?$/.test(value), "INVALID_DECIMAL_FORMAT");

const forwardCompatibleCodeSchema = z.string().min(1).max(MAX_CODE_LENGTH);

export const tossConditionalOrderConditionSchema = z.looseObject({
  type: forwardCompatibleCodeSchema,
  status: forwardCompatibleCodeSchema,
  triggerPrice: nonNegativeDecimalSchema.nullable().optional(),
  targetProfitRate: nonNegativeDecimalSchema.nullable().optional(),
  orderPrice: nonNegativeDecimalSchema.nullable().optional(),
  triggeredOrderId: z.string().min(1).nullable().optional(),
});

export const tossConditionalOrderDetailResponseSchema = z
  .looseObject({
    conditionalOrderId: z.string().min(1),
    type: forwardCompatibleCodeSchema,
    status: forwardCompatibleCodeSchema,
    symbol: z
      .string()
      .min(1)
      .max(32)
      .regex(/^[A-Za-z0-9.-]+$/),
    market: forwardCompatibleCodeSchema,
    quantity: nonNegativeDecimalSchema,
    orderType: forwardCompatibleCodeSchema,
    expireDate: z.iso.date().optional(),
    first: tossConditionalOrderConditionSchema,
    second: tossConditionalOrderConditionSchema.nullable().optional(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .refine(
    (value) => value.status !== "HOLDING" && value.status !== "CANCELED",
    { path: ["status"], message: "LEG_STATUS_NOT_ALLOWED_FOR_GROUP" },
  );

export const tossPaginatedConditionalOrderResponseSchema = z.looseObject({
  conditionalOrders: z.array(tossConditionalOrderDetailResponseSchema),
  nextCursor: z.string().nullable().optional(),
  hasNext: z.boolean(),
});

export type TossConditionalOrderConditionDto = z.infer<
  typeof tossConditionalOrderConditionSchema
>;
export type TossConditionalOrderDetailResponseDto = z.infer<
  typeof tossConditionalOrderDetailResponseSchema
>;
