"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { AccountBffError, getAccounts } from "../account/account-bff-client";
import { getOrderDetail } from "./order-history-bff-client";
import {
  ORDER_HISTORY_TTL_MS,
  orderDetailQueryKey,
  shouldRetryOrderQuery,
} from "./order-query-policy";
import { createOrderTimeline } from "./order-timeline";

function retryAccounts(failureCount: number, error: Error): boolean {
  return (
    failureCount < 1 &&
    error instanceof AccountBffError &&
    error.retryable &&
    ![400, 401, 403, 404, 409, 429].includes(error.status)
  );
}

function value(input: string | null | undefined): string {
  return input === null || input === undefined ? "미제공" : input;
}

function Field({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="rounded-lg bg-white p-3">
      <dt className="text-xs font-semibold text-slate-600">{label}</dt>
      <dd className="mt-1 break-all font-mono text-sm">{children}</dd>
    </div>
  );
}

export function OrderDetailScreen({
  orderId,
  liveReadEnabled = false,
}: Readonly<{ orderId: string; liveReadEnabled?: boolean }>) {
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: ({ signal }) => getAccounts(signal),
    retry: retryAccounts,
    staleTime: 0,
  });
  const selected = accounts.data?.find((account) => account.selected);
  const detail = useQuery({
    queryKey: orderDetailQueryKey(selected?.accountRef, orderId),
    queryFn: ({ signal }) => getOrderDetail(orderId, signal),
    enabled: selected !== undefined,
    retry: shouldRetryOrderQuery,
    staleTime: ORDER_HISTORY_TTL_MS,
    refetchOnWindowFocus: false,
  });
  const order = detail.data;
  const timeline = order ? createOrderTimeline(order) : [];

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950 sm:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <Link href="/orders" className="font-semibold text-blue-800 underline">
          주문 내역으로 돌아가기
        </Link>
        <h1 className="mt-4 text-3xl font-bold">일반 주문 상세</h1>
        <div
          role="status"
          className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm"
        >
          <p className="font-semibold">
            {liveReadEnabled ? "Toss Open API 조회 데이터" : "MOCK DATA"}
          </p>
          <p className="mt-1">
            조회 전용 상세입니다. 이 앱에는 실제 주문 생성·정정·취소 기능이
            없습니다. 다른 채널에서 생성된 주문도 표시될 수 있습니다.
          </p>
        </div>

        {accounts.isPending ? (
          <p role="status" className="mt-6">
            계좌 선택 상태를 확인하는 중입니다.
          </p>
        ) : accounts.isError ? (
          <p role="alert" className="mt-6">
            계좌 선택 상태를 확인할 수 없습니다.
          </p>
        ) : !selected ? (
          <div role="status" className="mt-6 rounded-xl bg-white p-4">
            <p className="font-semibold">선택된 계좌가 없습니다.</p>
            <Link
              href="/settings"
              className="mt-3 inline-flex font-semibold text-blue-800 underline"
            >
              설정에서 계좌 선택
            </Link>
          </div>
        ) : detail.isPending ? (
          <p role="status" className="mt-6">
            주문 상세를 불러오는 중입니다.
          </p>
        ) : detail.isError ? (
          <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4">
            주문 상세를 찾지 못했거나 안전하게 불러올 수 없습니다.
          </p>
        ) : order ? (
          <>
            <section
              aria-labelledby="order-info-title"
              className="mt-6 rounded-2xl bg-slate-100 p-5"
            >
              <h2 id="order-info-title" className="text-xl font-semibold">
                주문 정보
              </h2>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="종목">{order.symbol}</Field>
                <Field label="구분">{order.side}</Field>
                <Field label="상태">
                  {order.status.label} · {order.status.code}
                </Field>
                <Field label="주문 유형">{order.orderType}</Field>
                <Field label="유효 조건">{order.timeInForce}</Field>
                <Field label="수량">{order.quantity}</Field>
                <Field label="가격">{value(order.price)}</Field>
                <Field label="금액">{value(order.orderAmount)}</Field>
                <Field label="통화">{order.currency}</Field>
                <Field label="접수 시각">{order.orderedAt}</Field>
                <Field label="취소 시각">{value(order.canceledAt)}</Field>
              </dl>
            </section>

            <section
              aria-labelledby="execution-title"
              className="mt-6 rounded-2xl bg-slate-100 p-5"
            >
              <h2 id="execution-title" className="text-xl font-semibold">
                체결 상세
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                상태와 관계없이 제공된 부분 체결 수량을 그대로 표시합니다. 0과
                미제공 값은 구분됩니다.
              </p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="체결 수량">
                  {order.execution.filledQuantity}
                </Field>
                <Field label="평균 체결가">
                  {value(order.execution.averageFilledPrice)}
                </Field>
                <Field label="체결 금액">
                  {value(order.execution.filledAmount)}
                </Field>
                <Field label="수수료">
                  {value(order.execution.commission)}
                </Field>
                <Field label="세금">{value(order.execution.tax)}</Field>
                <Field label="체결 시각">
                  {value(order.execution.filledAt)}
                </Field>
                <Field label="결제 예정일">
                  {value(order.execution.settlementDate)}
                </Field>
              </dl>
            </section>

            <section
              aria-labelledby="timeline-title"
              className="mt-6 rounded-2xl bg-slate-100 p-5"
            >
              <h2 id="timeline-title" className="text-xl font-semibold">
                상태 타임라인
              </h2>
              <p className="mt-2 text-sm">
                현재 상태: {order.status.label} · {order.status.code}
              </p>
              <ol className="mt-4 grid gap-3">
                {timeline.map((event) => (
                  <li
                    key={`${event.type}:${event.timestamp}`}
                    className="rounded-lg bg-white p-3"
                  >
                    <span className="font-semibold">{event.label}</span>
                    <time className="ml-3 font-mono text-sm">
                      {event.timestamp}
                    </time>
                  </li>
                ))}
              </ol>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
