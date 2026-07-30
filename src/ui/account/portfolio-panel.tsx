"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { AccountBffError, getAccounts } from "./account-bff-client";
import { ACCOUNT_QUERY_TTL } from "./account-query-policy";
import {
  getHoldings,
  HoldingsBffError,
  type BffHolding,
} from "./holdings-bff-client";
import { OrderInfoPanel } from "./order-info-panel";

function shouldRetry(failureCount: number, error: Error): boolean {
  const typed =
    error instanceof AccountBffError || error instanceof HoldingsBffError;
  return (
    failureCount < 1 &&
    typed &&
    error.retryable &&
    ![400, 401, 403, 404, 409, 429].includes(error.status)
  );
}

function HoldingsTable({ items }: { items: readonly BffHolding[] }) {
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-sm">
        <caption className="sr-only">선택 계좌 보유자산 목록</caption>
        <thead>
          <tr className="border-b border-slate-300">
            <th scope="col" className="px-3 py-2">
              종목
            </th>
            <th scope="col" className="px-3 py-2">
              시장·통화
            </th>
            <th scope="col" className="px-3 py-2">
              수량
            </th>
            <th scope="col" className="px-3 py-2">
              현재가
            </th>
            <th scope="col" className="px-3 py-2">
              평균매입가
            </th>
            <th scope="col" className="px-3 py-2">
              평가액
            </th>
            <th scope="col" className="px-3 py-2">
              손익
            </th>
            <th scope="col" className="px-3 py-2">
              일간손익
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={`${item.marketCountry}:${item.symbol}`}
              className="border-b border-slate-200 bg-white"
            >
              <th scope="row" className="whitespace-nowrap px-3 py-3">
                <span className="block font-semibold">{item.name}</span>
                <span className="font-mono text-xs text-slate-600">
                  {item.symbol}
                </span>
              </th>
              <td className="whitespace-nowrap px-3 py-3">
                {item.marketCountry} · {item.currency}
              </td>
              <td className="whitespace-nowrap px-3 py-3 font-mono">
                {item.quantity}
              </td>
              <td className="whitespace-nowrap px-3 py-3 font-mono">
                {item.lastPrice}
              </td>
              <td className="whitespace-nowrap px-3 py-3 font-mono">
                {item.averagePurchasePrice}
              </td>
              <td className="whitespace-nowrap px-3 py-3 font-mono">
                {item.marketValue.amount}
              </td>
              <td className="whitespace-nowrap px-3 py-3 font-mono">
                {item.profitLoss.amount} ({item.profitLoss.rate})
              </td>
              <td className="whitespace-nowrap px-3 py-3 font-mono">
                {item.dailyProfitLoss.amount} ({item.dailyProfitLoss.rate})
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PortfolioPanel({
  liveReadEnabled = false,
}: Readonly<{ liveReadEnabled?: boolean }>) {
  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: ({ signal }) => getAccounts(signal),
    retry: shouldRetry,
    staleTime: ACCOUNT_QUERY_TTL.accounts,
  });
  const selectedAccount = accountsQuery.data?.find(
    (account) => account.selected,
  );
  const holdingsQuery = useQuery({
    queryKey: ["holdings", selectedAccount?.accountRef ?? "unselected"],
    queryFn: ({ signal }) => getHoldings(signal),
    enabled: selectedAccount !== undefined,
    retry: shouldRetry,
    staleTime: ACCOUNT_QUERY_TTL.holdings,
    refetchOnWindowFocus: false,
  });

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950 sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <p className="text-sm font-semibold tracking-wide text-blue-700">
          MY WTS · PORTFOLIO
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">보유자산</h1>
        <p className="mt-3 text-sm text-slate-600">
          선택한 계좌의 읽기 전용 보유자산입니다. 주문 기능은 제공하지 않습니다.
        </p>
        <div
          role="status"
          className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950"
        >
          <p className="font-semibold">
            {liveReadEnabled ? "Toss Open API 조회 데이터" : "MOCK DATA"}
          </p>
          <p className="mt-1">
            {liveReadEnabled
              ? "읽기 전용 참고 데이터입니다. 실제 주문 기능은 제공하지 않습니다."
              : "결정론적 테스트 데이터입니다. 실제 Toss 조회나 주문 기능은 실행하지 않습니다."}
          </p>
        </div>

        <section
          aria-labelledby="holdings-title"
          className="mt-8 rounded-2xl border border-slate-200 bg-slate-100 p-5"
        >
          <h2 id="holdings-title" className="text-xl font-semibold">
            보유 종목
          </h2>
          {accountsQuery.isPending ? (
            <p role="status" className="mt-5 text-sm text-slate-600">
              계좌 선택 상태를 확인하는 중입니다.
            </p>
          ) : accountsQuery.isError ? (
            <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4">
              계좌 선택 상태를 확인할 수 없습니다.
            </p>
          ) : !selectedAccount ? (
            <div role="status" className="mt-5 rounded-xl bg-white p-4">
              <p className="font-semibold">선택된 계좌가 없습니다.</p>
              <p className="mt-1 text-sm text-slate-600">
                계좌가 하나여도 자동으로 선택하지 않습니다.
              </p>
              <Link
                href="/settings"
                className="mt-3 inline-flex rounded-lg border border-blue-700 px-3 py-2 text-sm font-semibold text-blue-800"
              >
                설정에서 계좌 선택
              </Link>
            </div>
          ) : holdingsQuery.isPending ? (
            <p role="status" className="mt-5 text-sm text-slate-600">
              보유자산을 불러오는 중입니다.
            </p>
          ) : holdingsQuery.isError ? (
            <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4">
              <p className="font-semibold">보유자산을 불러오지 못했습니다.</p>
              <button
                type="button"
                className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold"
                disabled={holdingsQuery.isFetching}
                onClick={() => void holdingsQuery.refetch()}
              >
                다시 조회
              </button>
            </div>
          ) : holdingsQuery.data.items.length === 0 ? (
            <div role="status" className="mt-5 rounded-xl bg-white p-4">
              <p className="font-semibold">보유 종목이 없습니다.</p>
              <p className="mt-1 text-sm text-slate-600">
                빈 보유자산은 정상 조회 결과입니다.
              </p>
            </div>
          ) : (
            <>
              {holdingsQuery.isFetching ? (
                <p role="status" className="mt-4 text-xs text-slate-600">
                  최신 정보를 확인하는 중입니다.
                </p>
              ) : null}
              <HoldingsTable items={holdingsQuery.data.items} />
            </>
          )}
        </section>
        <OrderInfoPanel selectedAccountRef={selectedAccount?.accountRef} />
      </div>
    </main>
  );
}
