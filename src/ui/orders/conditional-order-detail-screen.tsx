"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { AccountBffError, getAccounts } from "../account/account-bff-client";
import {
  getConditionalOrderDetail,
  type BffConditionalLeg,
} from "./conditional-order-bff-client";
import {
  CONDITIONAL_ORDER_HISTORY_TTL_MS,
  conditionalOrderDetailQueryKey,
  shouldRetryConditionalOrderQuery,
} from "./conditional-order-query-policy";

function nullable(value: string | null | undefined): string {
  return value === null || value === undefined ? "미제공" : value;
}

function retryAccounts(failureCount: number, error: Error): boolean {
  return (
    failureCount < 1 &&
    error instanceof AccountBffError &&
    error.retryable &&
    ![400, 401, 403, 404, 409, 429].includes(error.status)
  );
}

function Leg({ title, value }: { title: string; value: BffConditionalLeg }) {
  return (
    <section className="rounded-xl border bg-white p-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-slate-600">조건 타입</dt>
          <dd>
            {value.type.label} · {value.type.code}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-slate-600">leg 상태</dt>
          <dd>
            {value.status.label} · {value.status.code}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-slate-600">트리거 가격</dt>
          <dd className="font-mono">{nullable(value.triggerPrice)}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-600">목표 수익률(%)</dt>
          <dd className="font-mono">{nullable(value.targetProfitRate)}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-600">주문 가격</dt>
          <dd className="font-mono">{nullable(value.orderPrice)}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-600">생성된 일반 주문</dt>
          <dd>
            {value.triggeredOrderId === null ||
            value.triggeredOrderId === undefined ? (
              "없음"
            ) : (
              <Link
                className="font-semibold text-blue-800 underline"
                href={`/orders/${encodeURIComponent(value.triggeredOrderId)}`}
              >
                일반 주문 상세 보기
              </Link>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function ConditionalOrderDetailScreen({
  conditionalOrderId,
  liveReadEnabled = false,
}: Readonly<{
  conditionalOrderId: string;
  liveReadEnabled?: boolean;
}>) {
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: ({ signal }) => getAccounts(signal),
    retry: retryAccounts,
    staleTime: 0,
  });
  const selected = accounts.data?.find((account) => account.selected);
  const detail = useQuery({
    queryKey: conditionalOrderDetailQueryKey(
      selected?.accountRef,
      conditionalOrderId,
    ),
    queryFn: ({ signal }) =>
      getConditionalOrderDetail(conditionalOrderId, signal),
    enabled: selected !== undefined,
    staleTime: CONDITIONAL_ORDER_HISTORY_TTL_MS,
    retry: shouldRetryConditionalOrderQuery,
    refetchOnWindowFocus: false,
  });

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/conditional-orders" className="text-blue-800 underline">
          조건주문 내역으로 돌아가기
        </Link>
        <h1 className="mt-4 text-3xl font-bold">조건주문 상세</h1>
        <div role="status" className="mt-4 rounded-xl border bg-blue-50 p-4">
          <p className="font-semibold">
            {liveReadEnabled ? "Toss Open API 조회 데이터" : "MOCK DATA"}
          </p>
          <p className="mt-1 text-sm">
            조건주문 내역 조회 전용입니다. 다른 채널에서 등록된 항목도 표시될 수
            있습니다. 이 앱은 조건 감시·주문 실행·생성·수정·취소를 하지
            않습니다.
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
          <div role="status" className="mt-6 rounded-xl border bg-white p-4">
            <p>선택된 계좌가 없습니다.</p>
            <Link href="/settings" className="text-blue-800 underline">
              설정에서 계좌 선택
            </Link>
          </div>
        ) : detail.isPending ? (
          <p role="status" className="mt-6">
            조건주문 상세를 불러오는 중입니다.
          </p>
        ) : detail.isError ? (
          <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4">
            조건주문 상세를 안전하게 불러오지 못했습니다.
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            <section className="rounded-xl border bg-white p-4">
              <h2 className="text-xl font-semibold">기본 정보</h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                {[
                  [
                    "타입",
                    `${detail.data.type.label} · ${detail.data.type.code}`,
                  ],
                  [
                    "그룹 상태",
                    `${detail.data.status.label} · ${detail.data.status.code}`,
                  ],
                  ["종목", detail.data.symbol],
                  ["시장", detail.data.market],
                  ["수량", detail.data.quantity],
                  ["호가유형", detail.data.orderType],
                  ["만료일", detail.data.expireDate ?? "미제공"],
                  ["등록 시각", detail.data.createdAt],
                ].map(([term, description]) => (
                  <div key={term}>
                    <dt className="text-sm text-slate-600">{term}</dt>
                    <dd className="font-mono">{description}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-sm text-slate-700">
                SINGLE은 한 조건, OCO는 두 조건 동시 감시 관계, OTO는 첫 조건
                이후 두 번째 조건 관계를 나타내는 조회값입니다. 이 화면이 감시나
                후속 동작을 수행하지 않습니다.
              </p>
            </section>
            <Leg title="첫 번째 조건" value={detail.data.first} />
            {detail.data.second === undefined ||
            detail.data.second === null ? null : (
              <Leg title="두 번째 조건" value={detail.data.second} />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
