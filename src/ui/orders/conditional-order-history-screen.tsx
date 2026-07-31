"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AccountBffError, getAccounts } from "../account/account-bff-client";
import {
  getConditionalOrderHistory,
  type BffConditionalOrder,
} from "./conditional-order-bff-client";
import {
  CONDITIONAL_ORDER_HISTORY_TTL_MS,
  conditionalOrderListQueryKey,
  shouldRetryConditionalOrderQuery,
} from "./conditional-order-query-policy";

type Group = "OPEN" | "CLOSED";

function retryAccounts(failureCount: number, error: Error): boolean {
  return (
    failureCount < 1 &&
    error instanceof AccountBffError &&
    error.retryable &&
    ![400, 401, 403, 404, 409, 429].includes(error.status)
  );
}

function summary(order: BffConditionalOrder): string {
  const first = `${order.first.type.label} · ${order.first.status.label}`;
  if (order.second === undefined || order.second === null) return first;
  return `${first} / ${order.second.type.label} · ${order.second.status.label}`;
}

function unique(
  pages: readonly { conditionalOrders: readonly BffConditionalOrder[] }[],
) {
  const values = new Map<string, BffConditionalOrder>();
  for (const page of pages) {
    for (const item of page.conditionalOrders) {
      if (!values.has(item.conditionalOrderId)) {
        values.set(item.conditionalOrderId, item);
      }
    }
  }
  return [...values.values()];
}

function HistoryTable({
  conditionalOrders,
}: {
  conditionalOrders: readonly BffConditionalOrder[];
}) {
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-sm">
        <caption className="sr-only">읽기 전용 조건주문 내역</caption>
        <thead>
          <tr className="border-b border-slate-300">
            {[
              "타입",
              "상태",
              "종목",
              "수량",
              "호가유형",
              "만료일",
              "조건 요약",
              "등록 시각",
              "상세",
            ].map((heading) => (
              <th key={heading} scope="col" className="px-3 py-2">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {conditionalOrders.map((order) => (
            <tr
              key={order.conditionalOrderId}
              className="border-b border-slate-200 bg-white"
            >
              <td className="px-3 py-3">
                <span className="block font-semibold">{order.type.label}</span>
                <span className="font-mono text-xs">{order.type.code}</span>
              </td>
              <td className="px-3 py-3">
                <span className="block font-semibold">
                  {order.status.label}
                </span>
                <span className="font-mono text-xs">{order.status.code}</span>
              </td>
              <th scope="row" className="px-3 py-3 font-mono">
                {order.symbol}
              </th>
              <td className="px-3 py-3 font-mono">{order.quantity}</td>
              <td className="px-3 py-3">{order.orderType}</td>
              <td className="px-3 py-3">{order.expireDate ?? "미제공"}</td>
              <td className="px-3 py-3">{summary(order)}</td>
              <td className="whitespace-nowrap px-3 py-3 font-mono">
                {order.createdAt}
              </td>
              <td className="px-3 py-3">
                <Link
                  className="font-semibold text-blue-800 underline"
                  href={`/conditional-orders/${encodeURIComponent(
                    order.conditionalOrderId,
                  )}`}
                >
                  상세 보기
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ConditionalOrderHistoryScreen({
  liveReadEnabled = false,
}: Readonly<{ liveReadEnabled?: boolean }>) {
  const [group, setGroup] = useState<Group>("OPEN");
  const [symbolDraft, setSymbolDraft] = useState("");
  const [symbol, setSymbol] = useState<string | undefined>();
  const [filterError, setFilterError] = useState(false);
  const limit = 20;
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: ({ signal }) => getAccounts(signal),
    retry: retryAccounts,
    staleTime: 0,
  });
  const selected = accounts.data?.find((account) => account.selected);
  const history = useInfiniteQuery({
    queryKey: conditionalOrderListQueryKey(
      selected?.accountRef,
      group,
      symbol,
      limit,
    ),
    queryFn: ({ pageParam, signal }) =>
      getConditionalOrderHistory(
        {
          status: group,
          ...(symbol === undefined ? {} : { symbol }),
          ...(pageParam === null ? {} : { cursor: pageParam }),
          limit,
        },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasNext ? lastPage.nextCursor : undefined,
    enabled: selected !== undefined,
    retry: shouldRetryConditionalOrderQuery,
    staleTime: CONDITIONAL_ORDER_HISTORY_TTL_MS,
    refetchOnWindowFocus: false,
  });
  const orders = useMemo(
    () => unique(history.data?.pages ?? []),
    [history.data?.pages],
  );

  function applyFilter() {
    const candidate = symbolDraft.trim().toUpperCase();
    if (candidate !== "" && !/^[A-Za-z0-9.-]{1,32}$/.test(candidate)) {
      setFilterError(true);
      return;
    }
    setSymbol(candidate === "" ? undefined : candidate);
    setFilterError(false);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950 sm:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <p className="text-sm font-semibold tracking-wide text-blue-700">
          MY WTS · CONDITIONAL HISTORY
        </p>
        <h1 className="mt-2 text-3xl font-bold">조건주문 내역</h1>
        <div
          role="status"
          className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm"
        >
          <p className="font-semibold">
            {liveReadEnabled ? "Toss Open API 조회 데이터" : "MOCK DATA"}
          </p>
          <p className="mt-1">
            조건주문 내역 조회 전용입니다. 다른 채널에서 등록된 조건주문도
            표시될 수 있습니다. 이 앱은 조건을 감시하거나 주문을 실행하지 않으며
            생성·수정·취소 기능이 없습니다.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="조건주문 내역 그룹"
          className="mt-6 flex gap-2"
        >
          {(["OPEN", "CLOSED"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={group === item}
              className="rounded-lg border px-4 py-2 font-semibold aria-selected:border-blue-700 aria-selected:bg-blue-50"
              onClick={() => {
                setGroup(item);
                setFilterError(false);
              }}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
          <label className="text-sm">
            종목 코드
            <input
              className="mt-1 block rounded border px-3 py-2"
              value={symbolDraft}
              onChange={(event) => setSymbolDraft(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="rounded-lg border border-blue-700 px-4 py-2 font-semibold text-blue-800"
            onClick={applyFilter}
          >
            조회 조건 적용
          </button>
          {filterError ? (
            <p role="alert" className="w-full text-sm text-red-700">
              종목 코드를 확인해 주세요.
            </p>
          ) : null}
        </div>

        <section
          aria-labelledby="conditional-result-title"
          className="mt-6 rounded-2xl border border-slate-200 bg-slate-100 p-5"
        >
          <h2 id="conditional-result-title" className="text-xl font-semibold">
            {group} 조건주문
          </h2>
          {accounts.isPending ? (
            <p role="status" className="mt-5">
              계좌 선택 상태를 확인하는 중입니다.
            </p>
          ) : accounts.isError ? (
            <p role="alert" className="mt-5">
              계좌 선택 상태를 확인할 수 없습니다.
            </p>
          ) : !selected ? (
            <div role="status" className="mt-5 rounded-xl bg-white p-4">
              <p className="font-semibold">선택된 계좌가 없습니다.</p>
              <p className="mt-1 text-sm">
                계좌가 하나여도 자동으로 선택하지 않습니다.
              </p>
              <Link
                href="/settings"
                className="mt-3 inline-flex font-semibold text-blue-800 underline"
              >
                설정에서 계좌 선택
              </Link>
            </div>
          ) : history.isPending ? (
            <p role="status" className="mt-5">
              조건주문 내역을 불러오는 중입니다.
            </p>
          ) : history.isError ? (
            <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4">
              조건주문 내역을 안전하게 불러오지 못했습니다.
            </p>
          ) : orders.length === 0 ? (
            <p role="status" className="mt-5 rounded-xl bg-white p-4">
              조건에 맞는 조건주문 내역이 없습니다.
            </p>
          ) : (
            <>
              <HistoryTable conditionalOrders={orders} />
              {history.hasNextPage ? (
                <button
                  type="button"
                  className="mt-5 rounded-lg border bg-white px-4 py-2 font-semibold disabled:opacity-60"
                  disabled={history.isFetchingNextPage}
                  onClick={() => void history.fetchNextPage()}
                >
                  {history.isFetchingNextPage ? "불러오는 중" : "더 보기"}
                </button>
              ) : null}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
