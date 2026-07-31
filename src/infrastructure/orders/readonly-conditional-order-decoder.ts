import type {
  ConditionalCode,
  ConditionalOrderLeg,
  ReadonlyConditionalOrder,
} from "../../domain/orders/conditional-order";
import {
  KNOWN_CONDITIONAL_GROUP_STATUSES,
  KNOWN_CONDITIONAL_LEG_STATUSES,
  KNOWN_CONDITIONAL_ORDER_TYPES,
  KNOWN_CONDITION_TYPES,
} from "../../domain/orders/conditional-order";
import {
  decodeTossEnvelope,
  type TossEnvelope,
} from "../../integrations/toss/envelope";
import {
  tossConditionalOrderDetailResponseSchema,
  type TossConditionalOrderConditionDto,
  type TossConditionalOrderDetailResponseDto,
} from "../../integrations/toss/conditional-order-history-schemas";

const LABELS: Readonly<Record<string, string>> = Object.freeze({
  SINGLE: "단일 조건",
  OCO: "OCO",
  OTO: "OTO",
  WATCHING: "감시 중",
  HOLDING: "대기 중",
  PAUSED: "일시중지",
  ORDERING: "주문 생성 중",
  ORDERED: "주문 생성됨",
  COMPLETED: "완료",
  EXPIRED: "만료",
  CANCELED: "취소됨",
  STOP: "가격 조건",
  PROFIT_RATE: "수익률 조건",
});

export class ReadonlyConditionalOrderDecodeError extends Error {
  readonly stack = undefined;

  constructor(
    readonly code: "INVALID_CONDITIONAL_ORDER",
    readonly fieldPath: string,
    readonly expectedCategory: "CONDITIONAL_ORDER_SCHEMA",
  ) {
    super("READONLY_CONDITIONAL_ORDER_DECODE_FAILED");
    this.name = "ReadonlyConditionalOrderDecodeError";
  }
}

function code<T extends string>(
  value: string,
  known: readonly T[],
): ConditionalCode<T> {
  return Object.freeze({
    code: value,
    kind: known.includes(value as T) ? (value as T) : "UNKNOWN",
    label: LABELS[value] ?? "알 수 없는 값",
  });
}

function leg(value: TossConditionalOrderConditionDto): ConditionalOrderLeg {
  return Object.freeze({
    type: code(value.type, KNOWN_CONDITION_TYPES),
    status: code(value.status, KNOWN_CONDITIONAL_LEG_STATUSES),
    ...(value.triggerPrice === undefined
      ? {}
      : { triggerPrice: value.triggerPrice }),
    ...(value.targetProfitRate === undefined
      ? {}
      : { targetProfitRate: value.targetProfitRate }),
    ...(value.orderPrice === undefined ? {} : { orderPrice: value.orderPrice }),
    ...(value.triggeredOrderId === undefined
      ? {}
      : { triggeredOrderId: value.triggeredOrderId }),
  });
}

function map(
  value: TossConditionalOrderDetailResponseDto,
): ReadonlyConditionalOrder {
  return Object.freeze({
    conditionalOrderId: value.conditionalOrderId,
    type: code(value.type, KNOWN_CONDITIONAL_ORDER_TYPES),
    status: code(value.status, KNOWN_CONDITIONAL_GROUP_STATUSES),
    symbol: value.symbol,
    market: value.market,
    quantity: value.quantity,
    orderType: value.orderType,
    ...(value.expireDate === undefined ? {} : { expireDate: value.expireDate }),
    first: leg(value.first),
    ...(value.second === undefined
      ? {}
      : { second: value.second === null ? null : leg(value.second) }),
    createdAt: value.createdAt,
  });
}

export function decodeReadonlyConditionalOrder(
  input: unknown,
): ReadonlyConditionalOrder {
  const decoded = tossConditionalOrderDetailResponseSchema.safeParse(input);
  if (!decoded.success) {
    const issue = decoded.error.issues[0];
    throw new ReadonlyConditionalOrderDecodeError(
      "INVALID_CONDITIONAL_ORDER",
      issue?.path.length ? issue.path.map(String).join(".") : "$",
      "CONDITIONAL_ORDER_SCHEMA",
    );
  }
  return map(decoded.data);
}

export function decodeReadonlyConditionalOrderEnvelope(
  input: unknown,
): TossEnvelope<ReadonlyConditionalOrder> {
  const envelope = decodeTossEnvelope(
    input,
    tossConditionalOrderDetailResponseSchema,
  );
  if (!envelope.ok) return envelope;
  return { ok: true, result: map(envelope.result) };
}
