import type { BffOrder } from "./order-history-bff-client";

export type OrderTimelineEvent = Readonly<{
  type: "ORDERED" | "FILLED" | "CANCELED";
  label: string;
  timestamp: string;
}>;

const EVENT_ORDER = Object.freeze({
  ORDERED: 0,
  FILLED: 1,
  CANCELED: 2,
});

export function createOrderTimeline(
  order: BffOrder,
): readonly OrderTimelineEvent[] {
  const events: OrderTimelineEvent[] = [
    Object.freeze({
      type: "ORDERED",
      label: "주문 접수",
      timestamp: order.orderedAt,
    }),
  ];
  if (order.execution.filledAt !== null) {
    events.push(
      Object.freeze({
        type: "FILLED",
        label: "체결 기록",
        timestamp: order.execution.filledAt,
      }),
    );
  }
  if (order.canceledAt !== undefined && order.canceledAt !== null) {
    events.push(
      Object.freeze({
        type: "CANCELED",
        label: "취소 기록",
        timestamp: order.canceledAt,
      }),
    );
  }
  return Object.freeze(
    events.sort((left, right) => {
      const instant = Date.parse(left.timestamp) - Date.parse(right.timestamp);
      return instant === 0
        ? EVENT_ORDER[left.type] - EVENT_ORDER[right.type]
        : instant;
    }),
  );
}
