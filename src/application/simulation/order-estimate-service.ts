import Decimal from "decimal.js";
import { z } from "zod";

import {
  decodeDecimalString,
  type DecimalString,
} from "../../domain/common/decimal";
import {
  OrderEstimateCalculationError,
  cashDirectionFor,
  simulationCurrencyFor,
  type OrderEstimateErrorCode,
  type OrderEstimateErrorField,
  type OrderEstimateResult,
  type SimulationCommissionRule,
  type SimulationCurrency,
  type TrustedOrderEstimateContext,
} from "../../domain/simulation/order-estimate";
import {
  validateOrderExecutionRules,
  type ValidatedSimulationOrder,
} from "../../domain/simulation/order-rules";

const ExactDecimal = Decimal.clone({
  precision: 120,
  toExpNeg: -1_000_000_000,
  toExpPos: 1_000_000_000,
});

const PLAIN_DECIMAL = /^\d+(?:\.\d+)?$/;
const MAX_DECIMAL_INPUT_LENGTH = 30;
const MAX_DECIMAL_OUTPUT_LENGTH = 30;

const normalizedQuantitySchema = z
  .object({
    mode: z.literal("QUANTITY"),
    marketCountry: z.enum(["KR", "US"]),
    side: z.enum(["BUY", "SELL"]),
    orderType: z.enum(["LIMIT", "MARKET"]),
    quantity: z.string(),
    timeInForce: z.enum(["DAY", "CLS"]),
    price: z.string().optional(),
  })
  .strict();

const normalizedAmountSchema = z
  .object({
    mode: z.literal("AMOUNT"),
    marketCountry: z.literal("US"),
    side: z.enum(["BUY", "SELL"]),
    orderType: z.literal("MARKET"),
    orderAmount: z.string(),
  })
  .strict();

const normalizedOrderSchema = z.discriminatedUnion("mode", [
  normalizedQuantitySchema,
  normalizedAmountSchema,
]);

const contextSchema = z
  .object({
    calculationDateKst: z.iso.date(),
    commissionRules: z.array(z.unknown()),
    referencePrice: z.string().nullable().optional(),
    referencePriceCurrency: z.string().nullable().optional(),
    referencePriceAsOf: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict();

const commissionRuleSchema = z
  .object({
    marketCountry: z.string().min(1).max(40),
    commissionRate: z.string(),
    startDate: z.iso.date().nullable().optional(),
    endDate: z.iso.date().nullable().optional(),
  })
  .strict();

function fail(
  field: OrderEstimateErrorField,
  code: OrderEstimateErrorCode,
): never {
  throw new OrderEstimateCalculationError([{ field, code }]);
}

function positiveInputDecimal(
  value: unknown,
  field: OrderEstimateErrorField,
  code: OrderEstimateErrorCode,
): InstanceType<typeof ExactDecimal> {
  if (
    typeof value !== "string" ||
    value.length > MAX_DECIMAL_INPUT_LENGTH ||
    !PLAIN_DECIMAL.test(value)
  ) {
    return fail(field, code);
  }
  try {
    const decimal = new ExactDecimal(value);
    if (!decimal.isFinite() || !decimal.gt(0)) return fail(field, code);
    return decimal;
  } catch {
    return fail(field, code);
  }
}

function commissionRateDecimal(
  value: unknown,
): InstanceType<typeof ExactDecimal> {
  if (
    typeof value !== "string" ||
    value.length > MAX_DECIMAL_INPUT_LENGTH ||
    !PLAIN_DECIMAL.test(value)
  ) {
    return fail("commissionRate", "COMMISSION_RATE_INVALID");
  }
  try {
    const decimal = new ExactDecimal(value);
    if (!decimal.isFinite() || decimal.lt(0)) {
      return fail("commissionRate", "COMMISSION_RATE_INVALID");
    }
    return decimal;
  } catch {
    return fail("commissionRate", "COMMISSION_RATE_INVALID");
  }
}

function canonicalResultDecimal(
  value: InstanceType<typeof ExactDecimal>,
): DecimalString {
  if (!value.isFinite() || value.lt(0)) {
    return fail("result", "CALCULATION_RESULT_INVALID");
  }
  const result = value.toFixed();
  if (
    !PLAIN_DECIMAL.test(result) ||
    result.length > MAX_DECIMAL_OUTPUT_LENGTH
  ) {
    return fail("result", "CALCULATION_RESULT_TOO_LARGE");
  }
  return decodeDecimalString(result);
}

function normalizedOrder(input: unknown): ValidatedSimulationOrder {
  const parsed = normalizedOrderSchema.safeParse(input);
  if (!parsed.success) return fail("order", "INVALID_NORMALIZED_ORDER");

  const orderInput =
    parsed.data.mode === "AMOUNT"
      ? {
          marketCountry: parsed.data.marketCountry,
          side: parsed.data.side,
          orderType: parsed.data.orderType,
          orderAmount: parsed.data.orderAmount,
        }
      : {
          marketCountry: parsed.data.marketCountry,
          side: parsed.data.side,
          orderType: parsed.data.orderType,
          quantity: parsed.data.quantity,
          timeInForce: parsed.data.timeInForce,
          ...(parsed.data.price === undefined
            ? {}
            : { price: parsed.data.price }),
        };
  try {
    return validateOrderExecutionRules(orderInput, {
      isRegularSession: true,
    });
  } catch {
    return fail("order", "INVALID_NORMALIZED_ORDER");
  }
}

function parsedContext(input: unknown): {
  calculationDateKst: string;
  commissionRules: readonly SimulationCommissionRule[];
  referencePrice?: string | null;
  referencePriceCurrency?: string | null;
  referencePriceAsOf?: string | null;
} {
  const parsed = contextSchema.safeParse(input);
  if (!parsed.success) {
    return fail("calculationDateKst", "CALCULATION_CONTEXT_INVALID");
  }

  const rules = parsed.data.commissionRules.map((rule) => {
    const decoded = commissionRuleSchema.safeParse(rule);
    if (!decoded.success) {
      const rateIssue = decoded.error.issues.some(
        (issue) => issue.path[0] === "commissionRate",
      );
      return fail(
        rateIssue ? "commissionRate" : "commissionRules",
        rateIssue ? "COMMISSION_RATE_INVALID" : "CALCULATION_CONTEXT_INVALID",
      );
    }
    commissionRateDecimal(decoded.data.commissionRate);
    if (
      decoded.data.startDate !== undefined &&
      decoded.data.startDate !== null &&
      decoded.data.endDate !== undefined &&
      decoded.data.endDate !== null &&
      decoded.data.startDate > decoded.data.endDate
    ) {
      return fail("commissionRules", "CALCULATION_CONTEXT_INVALID");
    }
    return Object.freeze({ ...decoded.data });
  });

  return {
    ...parsed.data,
    commissionRules: Object.freeze(rules),
  };
}

function applicableCommissionRate(
  marketCountry: "KR" | "US",
  calculationDateKst: string,
  rules: readonly SimulationCommissionRule[],
): InstanceType<typeof ExactDecimal> {
  const applicable = rules.filter(
    (rule) =>
      rule.marketCountry === marketCountry &&
      (rule.startDate == null || rule.startDate <= calculationDateKst) &&
      (rule.endDate == null || calculationDateKst <= rule.endDate),
  );
  if (applicable.length === 0) {
    return fail("commissionRules", "COMMISSION_RULE_NOT_FOUND");
  }
  if (applicable.length > 1) {
    return fail("commissionRules", "COMMISSION_RULE_AMBIGUOUS");
  }
  return commissionRateDecimal(applicable[0]?.commissionRate);
}

function calculationInputs(
  order: ValidatedSimulationOrder,
  context: ReturnType<typeof parsedContext>,
  currency: SimulationCurrency,
): {
  calculationPrice: InstanceType<typeof ExactDecimal> | null;
  referencePriceAsOf: string | null;
  gross: InstanceType<typeof ExactDecimal>;
} {
  if (order.mode === "AMOUNT") {
    return {
      calculationPrice: null,
      referencePriceAsOf: null,
      gross: positiveInputDecimal(
        order.orderAmount,
        "order",
        "INVALID_NORMALIZED_ORDER",
      ),
    };
  }

  const quantity = positiveInputDecimal(
    order.quantity,
    "order",
    "INVALID_NORMALIZED_ORDER",
  );
  if (order.orderType === "LIMIT") {
    if (order.price === undefined) {
      return fail("order", "INVALID_NORMALIZED_ORDER");
    }
    const price = positiveInputDecimal(
      order.price,
      "order",
      "INVALID_NORMALIZED_ORDER",
    );
    return {
      calculationPrice: price,
      referencePriceAsOf: null,
      gross: price.mul(quantity),
    };
  }

  if (context.referencePrice == null) {
    return fail("referencePrice", "REFERENCE_PRICE_REQUIRED");
  }
  const price = positiveInputDecimal(
    context.referencePrice,
    "referencePrice",
    "REFERENCE_PRICE_INVALID",
  );
  if (context.referencePriceCurrency !== currency) {
    return fail("referencePriceCurrency", "REFERENCE_PRICE_CURRENCY_MISMATCH");
  }
  if (context.referencePriceAsOf == null) {
    return fail("referencePriceAsOf", "REFERENCE_PRICE_INVALID");
  }
  return {
    calculationPrice: price,
    referencePriceAsOf: context.referencePriceAsOf,
    gross: price.mul(quantity),
  };
}

export function calculateOrderEstimate(
  normalizedInput: ValidatedSimulationOrder,
  trustedContext: TrustedOrderEstimateContext,
): OrderEstimateResult {
  const order = normalizedOrder(normalizedInput);
  const context = parsedContext(trustedContext);
  const currency = simulationCurrencyFor(order.marketCountry);
  const inputs = calculationInputs(order, context, currency);
  const commissionRate = applicableCommissionRate(
    order.marketCountry,
    context.calculationDateKst,
    context.commissionRules,
  );
  const commission = inputs.gross.mul(commissionRate).div(100);
  const cash =
    order.side === "BUY"
      ? inputs.gross.add(commission)
      : inputs.gross.sub(commission);

  if (order.side === "SELL" && commission.gt(inputs.gross)) {
    return fail("result", "CALCULATION_RESULT_INVALID");
  }

  return Object.freeze({
    kind: "SIMULATION_ONLY",
    submitted: false,
    persisted: false,
    currency,
    sizingMode: order.mode,
    estimatedOrderAmount: canonicalResultDecimal(inputs.gross),
    estimatedCommission: canonicalResultDecimal(commission),
    estimatedCashAmount: canonicalResultDecimal(cash),
    cashDirection: cashDirectionFor(order.side),
    taxIncluded: false,
    fxApplied: false,
    calculationPrice:
      inputs.calculationPrice === null
        ? null
        : canonicalResultDecimal(inputs.calculationPrice),
    referencePriceAsOf: inputs.referencePriceAsOf,
  });
}
