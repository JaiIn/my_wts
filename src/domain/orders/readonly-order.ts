import type { DecimalString } from "../common/decimal";

export const KNOWN_ORDER_STATUSES = [
  "PENDING",
  "PENDING_CANCEL",
  "PENDING_REPLACE",
  "PARTIAL_FILLED",
  "FILLED",
  "CANCELED",
  "REJECTED",
  "CANCEL_REJECTED",
  "REPLACE_REJECTED",
  "REPLACED",
] as const;

export type KnownOrderStatus = (typeof KNOWN_ORDER_STATUSES)[number];

export type ReadonlyOrderStatus = Readonly<{
  code: string;
  kind: KnownOrderStatus | "UNKNOWN";
  label: string;
}>;

export type OrderExecutionDetail = Readonly<{
  filledQuantity: DecimalString;
  averageFilledPrice: DecimalString | null;
  filledAmount: DecimalString | null;
  commission: DecimalString | null;
  tax: DecimalString | null;
  filledAt: string | null;
  settlementDate: string | null;
}>;

export type ReadonlyOrder = Readonly<{
  orderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  orderType: string;
  timeInForce: string;
  status: ReadonlyOrderStatus;
  price?: DecimalString | null;
  quantity: DecimalString;
  orderAmount?: DecimalString | null;
  currency: string;
  orderedAt: string;
  canceledAt?: string | null;
  execution: OrderExecutionDetail;
}>;

export function isKnownOrderStatus(value: string): value is KnownOrderStatus {
  return KNOWN_ORDER_STATUSES.includes(value as KnownOrderStatus);
}
