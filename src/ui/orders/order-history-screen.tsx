"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

import { AccountBffError, getAccounts } from "../account/account-bff-client";
import type { BffOrder } from "./order-history-bff-client";
import {
  getOrderHistory,
  OrderHistoryBffError,
  type OrderHistoryInput,
} from "./order-history-bff-client";
import {
  ORDER_HISTORY_TTL_MS,
  orderListQueryKey,
  shouldRetryOrderQuery,
} from "./order-query-policy";

type OrderGroup = "OPEN" | "CLOSED";
type FilterState = Readonly<{
  symbol?: string;
  from?: string;
  to?: string;
  limit: number;
}>;

const EMPTY_FILTER: FilterState = Object.freeze({ limit: 20 });

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

export function parseOrderFilterDraft(input: {
  symbol: string;
  from: string;
  to: string;
  limit: string;
}): FilterState {
  const symbol = input.symbol.trim().toUpperCase();
  const from = input.from.trim();
  const to = input.to.trim();
  const limit = Number(input.limit);
  if (
    (symbol !== "" && !/^[A-Za-z0-9._-]{1,32}$/.test(symbol)) ||
    (from !== "" && !validDate(from)) ||
    (to !== "" && !validDate(to)) ||
    (from !== "" && to !== "" && from > to) ||
    !/^(?:[1-9]|[1-9]\d|100)$/.test(input.limit) ||
    !Number.isInteger(limit)
  ) {
    throw new OrderHistoryBffError("VALIDATION_FAILED", 400, false);
  }
  return Object.freeze({
    ...(symbol === "" ? {} : { symbol }),
    ...(from === "" ? {} : { from }),
    ...(to === "" ? {} : { to }),
    limit,
  });
}

function uniqueOrders(pages: readonly { orders: readonly BffOrder[] }[]) {
  const byId = new Map<string, BffOrder>();
  for (const page of pages) {
    for (const order of page.orders) {
      if (!byId.has(order.orderId)) byId.set(order.orderId, order);
    }
  }
  return [...byId.values()];
}

function displayNullable(value: string | null | undefined): string {
  return value === null || value === undefined ? "미제공" : value;
}

function OrdersTable({ orders }: { orders: readonly BffOrder[] }) {
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-sm">
        <caption className="sr-only">읽기 전용 일반 주문 내역</caption>
        <thead>
          <tr className="border-b border-slate-300">
            {[
              "상태",
              "구분",
              "종목",
              "수량",
              "체결 수량",
              "가격",
              "통화",
              "접수 시각",
              "상세",
            ].map((heading) => (
              <th key={heading} scope="col" className="px-3 py-2">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr
              key={order.orderId}
              className="border-b border-slate-200 bg-white"
            >
              <td className="whitespace-nowrap px-3 py-3">
                <span className="block font-semibold">
                  {order.status.label}
                </span>
                <span className="font-mono text-xs text-slate-600">
                  {order.status.code}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-3">
                {order.side === "BUY" ? "BUY · 매수 방향" : "SELL · 매도 방향"}
              </td>
              <th scope="row" className="px-3 py-3 font-mono">
                {order.symbol}
              </th>
              <td className="px-3 py-3 font-mono">{order.quantity}</td>
              <td className="px-3 py-3 font-mono">
                {order.execution.filledQuantity}
              </td>
              <td className="px-3 py-3 font-mono">
                {displayNullable(order.price)}
              </td>
              <td className="px-3 py-3">{order.currency}</td>
              <td className="whitespace-nowrap px-3 py-3 font-mono">
                {order.orderedAt}
              </td>
              <td className="px-3 py-3">
                <Link
                  className="whitespace-nowrap font-semibold text-blue-800 underline"
                  href={`/orders/${encodeURIComponent(order.orderId)}`}
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

function retryAccounts(failureCount: number, error: Error): boolean {
  return (
    failureCount < 1 &&
    error instanceof AccountBffError &&
    error.retryable &&
    ![400, 401, 403, 404, 409, 429].includes(error.status)
  );
}

export function OrderHistoryScreen({
  liveReadEnabled = false,
}: Readonly<{ liveReadEnabled?: boolean }>) {
  const [group, setGroup] = useState<OrderGroup>("OPEN");
  const [symbol, setSymbol] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState("20");
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [filterError, setFilterError] = useState(false);
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: ({ signal }) => getAccounts(signal),
    retry: retryAccounts,
    staleTime: 0,
  });
  const selected = accounts.data?.find((account) => account.selected);
  const history = useInfiniteQuery({
    queryKey: orderListQueryKey(selected?.accountRef, group, filter),
    queryFn: ({ pageParam, signal }) => {
      const input: OrderHistoryInput = {
        status: group,
        ...(filter.symbol === undefined ? {} : { symbol: filter.symbol }),
        ...(filter.from === undefined ? {} : { from: filter.from }),
        ...(filter.to === undefined ? {} : { to: filter.to }),
        ...(group === "CLOSED" && pageParam !== null
          ? { cursor: pageParam }
          : {}),
        ...(group === "CLOSED" ? { limit: filter.limit } : {}),
      };
      return getOrderHistory(input, signal);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      group === "CLOSED" && lastPage.hasNext ? lastPage.nextCursor : undefined,
    enabled: selected !== undefined,
    retry: shouldRetryOrderQuery,
    staleTime: ORDER_HISTORY_TTL_MS,
    refetchOnWindowFocus: false,
  });
  const orders = useMemo(
    () => uniqueOrders(history.data?.pages ?? []),
    [history.data?.pages],
  );

  function submitFilter(event: FormEvent) {
    event.preventDefault();
    try {
      setFilter(parseOrderFilterDraft({ symbol, from, to, limit }));
      setFilterError(false);
    } catch {
      setFilterError(true);
    }
  }

  function changeGroup(next: OrderGroup) {
    setGroup(next);
    setFilterError(false);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950 sm:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <p className="text-sm font-semibold tracking-wide text-blue-700">
          MY WTS · ORDER HISTORY
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          일반 주문 내역
        </h1>
        <div
          role="status"
          className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm"
        >
          <p className="font-semibold">
            {liveReadEnabled ? "Toss Open API 조회 데이터" : "MOCK DATA"}
          </p>
          <p className="mt-1">
            주문내역 조회 전용입니다. 이 앱에서는 실제 주문을 생성·정정·취소할
            수 없습니다. 다른 채널에서 생성된 주문도 표시될 수 있습니다.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="주문 내역 그룹"
          className="mt-6 flex gap-2"
        >
          {(["OPEN", "CLOSED"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={group === item}
              className="rounded-lg border px-4 py-2 font-semibold aria-selected:border-blue-700 aria-selected:bg-blue-50"
              onClick={() => changeGroup(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <form
          className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-5"
          onSubmit={submitFilter}
        >
          <label className="text-sm">
            종목 코드
            <input
              className="mt-1 block w-full rounded border px-2 py-2"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
            />
          </label>
          <label className="text-sm">
            시작일
            <input
              type="date"
              className="mt-1 block w-full rounded border px-2 py-2"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="text-sm">
            종료일
            <input
              type="date"
              className="mt-1 block w-full rounded border px-2 py-2"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <label className="text-sm">
            CLOSED 페이지 크기
            <select
              className="mt-1 block w-full rounded border px-2 py-2"
              value={limit}
              disabled={group === "OPEN"}
              onChange={(event) => setLimit(event.target.value)}
            >
              {[20, 50, 100].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="self-end rounded-lg border border-blue-700 px-4 py-2 font-semibold text-blue-800"
          >
            조회 조건 적용
          </button>
          <p className="text-xs text-slate-600 md:col-span-5">
            시작일과 종료일은 Asia/Seoul 달력 날짜 기준이며 양 끝 날짜를
            포함합니다.
          </p>
          {filterError ? (
            <p role="alert" className="text-sm text-red-700 md:col-span-5">
              조회 조건을 확인해 주세요.
            </p>
          ) : null}
        </form>

        <section
          aria-labelledby="orders-result-title"
          className="mt-6 rounded-2xl border border-slate-200 bg-slate-100 p-5"
        >
          <h2 id="orders-result-title" className="text-xl font-semibold">
            {group} 주문
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
              주문 내역을 불러오는 중입니다.
            </p>
          ) : history.isError ? (
            <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4">
              주문 내역을 안전하게 불러오지 못했습니다.
            </p>
          ) : orders.length === 0 ? (
            <p role="status" className="mt-5 rounded-xl bg-white p-4">
              조건에 맞는 주문 내역이 없습니다.
            </p>
          ) : (
            <>
              <OrdersTable orders={orders} />
              {group === "CLOSED" && history.hasNextPage ? (
                <button
                  type="button"
                  className="mt-5 rounded-lg border border-slate-400 bg-white px-4 py-2 font-semibold disabled:opacity-60"
                  disabled={history.isFetchingNextPage || !history.hasNextPage}
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
