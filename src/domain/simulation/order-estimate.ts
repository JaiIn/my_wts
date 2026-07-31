import type { DecimalString } from "../common/decimal";
import type {
  SimulationMarketCountry,
  SimulationOrderSide,
} from "./order-sizing";

export const SIMULATION_CURRENCIES = ["KRW", "USD"] as const;

export type SimulationCurrency = (typeof SIMULATION_CURRENCIES)[number];

export type SimulationCommissionRule = Readonly<{
  marketCountry: string;
  commissionRate: string;
  startDate?: string | null;
  endDate?: string | null;
}>;

export type TrustedOrderEstimateContext = Readonly<{
  calculationDateKst: string;
  commissionRules: readonly SimulationCommissionRule[];
  referencePrice?: string | null;
  referencePriceCurrency?: string | null;
  referencePriceAsOf?: string | null;
}>;

export type OrderEstimateResult = Readonly<{
  kind: "SIMULATION_ONLY";
  submitted: false;
  persisted: false;
  currency: SimulationCurrency;
  sizingMode: "QUANTITY" | "AMOUNT";
  estimatedOrderAmount: DecimalString;
  estimatedCommission: DecimalString;
  estimatedCashAmount: DecimalString;
  cashDirection: "OUTFLOW" | "INFLOW";
  taxIncluded: false;
  fxApplied: false;
  calculationPrice: DecimalString | null;
  referencePriceAsOf: string | null;
}>;

export type OrderEstimateErrorCode =
  | "INVALID_NORMALIZED_ORDER"
  | "REFERENCE_PRICE_REQUIRED"
  | "REFERENCE_PRICE_INVALID"
  | "REFERENCE_PRICE_CURRENCY_MISMATCH"
  | "COMMISSION_RULE_NOT_FOUND"
  | "COMMISSION_RULE_AMBIGUOUS"
  | "COMMISSION_RATE_INVALID"
  | "CALCULATION_CONTEXT_INVALID"
  | "CALCULATION_RESULT_TOO_LARGE"
  | "CALCULATION_RESULT_INVALID";

export type OrderEstimateErrorField =
  | "order"
  | "referencePrice"
  | "referencePriceCurrency"
  | "referencePriceAsOf"
  | "calculationDateKst"
  | "commissionRules"
  | "commissionRate"
  | "currency"
  | "result";

export type OrderEstimateIssue = Readonly<{
  field: OrderEstimateErrorField;
  code: OrderEstimateErrorCode;
}>;

export class OrderEstimateCalculationError extends Error {
  readonly code = "SIMULATION_CALCULATION_FAILED";
  readonly stack = undefined;

  constructor(readonly issues: readonly OrderEstimateIssue[]) {
    super("ORDER_ESTIMATE_CALCULATION_FAILED");
    this.name = "OrderEstimateCalculationError";
    this.issues = Object.freeze(
      issues.map((issue) => Object.freeze({ ...issue })),
    );
  }
}

export function simulationCurrencyFor(
  marketCountry: SimulationMarketCountry,
): SimulationCurrency {
  return marketCountry === "KR" ? "KRW" : "USD";
}

export function cashDirectionFor(
  side: SimulationOrderSide,
): "OUTFLOW" | "INFLOW" {
  return side === "BUY" ? "OUTFLOW" : "INFLOW";
}
