import type {
  KnownOrderStatus,
  ReadonlyOrder,
  ReadonlyOrderStatus,
} from "../../domain/orders/readonly-order";
import { isKnownOrderStatus } from "../../domain/orders/readonly-order";
import {
  decodeTossEnvelope,
  type TossEnvelope,
} from "../../integrations/toss/envelope";
import {
  tossOrderSchema,
  type TossOrderDto,
} from "../../integrations/toss/order-history-schemas";

const ORDER_STATUS_LABELS: Readonly<Record<KnownOrderStatus, string>> =
  Object.freeze({
    PENDING: "체결 대기",
    PENDING_CANCEL: "취소 대기",
    PENDING_REPLACE: "정정 대기",
    PARTIAL_FILLED: "부분 체결",
    FILLED: "체결 완료",
    CANCELED: "취소 완료",
    REJECTED: "거부",
    CANCEL_REJECTED: "취소 거부",
    REPLACE_REJECTED: "정정 거부",
    REPLACED: "정정 완료",
  });

export class ReadonlyOrderDecodeError extends Error {
  readonly stack = undefined;

  constructor(
    readonly code: "INVALID_ORDER",
    readonly fieldPath: string,
    readonly expectedCategory: "ORDER_SCHEMA",
  ) {
    super("READONLY_ORDER_DECODE_FAILED");
    this.name = "ReadonlyOrderDecodeError";
  }
}

function decodeStatus(code: string): ReadonlyOrderStatus {
  if (isKnownOrderStatus(code)) {
    return Object.freeze({
      code,
      kind: code,
      label: ORDER_STATUS_LABELS[code],
    });
  }
  return Object.freeze({
    code,
    kind: "UNKNOWN",
    label: "알 수 없는 주문 상태",
  });
}

function toReadonlyOrder(value: TossOrderDto): ReadonlyOrder {
  const execution = Object.freeze({
    filledQuantity: value.execution.filledQuantity,
    averageFilledPrice: value.execution.averageFilledPrice,
    filledAmount: value.execution.filledAmount,
    commission: value.execution.commission,
    tax: value.execution.tax,
    filledAt: value.execution.filledAt,
    settlementDate: value.execution.settlementDate,
  });

  return Object.freeze({
    orderId: value.orderId,
    symbol: value.symbol,
    side: value.side,
    orderType: value.orderType,
    timeInForce: value.timeInForce,
    status: decodeStatus(value.status),
    ...(value.price === undefined ? {} : { price: value.price }),
    quantity: value.quantity,
    ...(value.orderAmount === undefined
      ? {}
      : { orderAmount: value.orderAmount }),
    currency: value.currency,
    orderedAt: value.orderedAt,
    ...(value.canceledAt === undefined ? {} : { canceledAt: value.canceledAt }),
    execution,
  });
}

export function decodeReadonlyOrder(input: unknown): ReadonlyOrder {
  const decoded = tossOrderSchema.safeParse(input);
  if (!decoded.success) {
    const firstIssue = decoded.error.issues[0];
    const fieldPath =
      firstIssue === undefined || firstIssue.path.length === 0
        ? "$"
        : firstIssue.path.map(String).join(".");
    throw new ReadonlyOrderDecodeError(
      "INVALID_ORDER",
      fieldPath,
      "ORDER_SCHEMA",
    );
  }
  return toReadonlyOrder(decoded.data);
}

export function decodeReadonlyOrderEnvelope(
  input: unknown,
): TossEnvelope<ReadonlyOrder> {
  const envelope = decodeTossEnvelope(input, tossOrderSchema);
  if (!envelope.ok) return envelope;
  return { ok: true, result: toReadonlyOrder(envelope.result) };
}
