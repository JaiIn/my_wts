import type { DecimalString } from "../common/decimal";

export const KNOWN_CONDITIONAL_ORDER_TYPES = ["SINGLE", "OCO", "OTO"] as const;
export const KNOWN_CONDITIONAL_GROUP_STATUSES = [
  "WATCHING",
  "PAUSED",
  "ORDERING",
  "ORDERED",
  "COMPLETED",
  "EXPIRED",
] as const;
export const KNOWN_CONDITIONAL_LEG_STATUSES = [
  "WATCHING",
  "HOLDING",
  "PAUSED",
  "ORDERING",
  "ORDERED",
  "COMPLETED",
  "EXPIRED",
  "CANCELED",
] as const;
export const KNOWN_CONDITION_TYPES = ["STOP", "PROFIT_RATE"] as const;

export type ConditionalCode<T extends string> = Readonly<{
  code: string;
  kind: T | "UNKNOWN";
  label: string;
}>;

export type ConditionalOrderLeg = Readonly<{
  type: ConditionalCode<(typeof KNOWN_CONDITION_TYPES)[number]>;
  status: ConditionalCode<(typeof KNOWN_CONDITIONAL_LEG_STATUSES)[number]>;
  triggerPrice?: DecimalString | null;
  targetProfitRate?: DecimalString | null;
  orderPrice?: DecimalString | null;
  triggeredOrderId?: string | null;
}>;

export type ReadonlyConditionalOrder = Readonly<{
  conditionalOrderId: string;
  type: ConditionalCode<(typeof KNOWN_CONDITIONAL_ORDER_TYPES)[number]>;
  status: ConditionalCode<(typeof KNOWN_CONDITIONAL_GROUP_STATUSES)[number]>;
  symbol: string;
  market: string;
  quantity: DecimalString;
  orderType: string;
  expireDate?: string;
  first: ConditionalOrderLeg;
  second?: ConditionalOrderLeg | null;
  createdAt: string;
}>;
