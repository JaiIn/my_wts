"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  getBuyingPower,
  getCommissions,
  getSellableQuantity,
  OrderInfoBffError,
} from "./order-info-bff-client";
import { ACCOUNT_QUERY_TTL } from "./account-query-policy";

function retry(failureCount: number, error: Error): boolean {
  return (
    failureCount < 1 &&
    error instanceof OrderInfoBffError &&
    error.retryable &&
    ![400, 401, 403, 404, 409, 429].includes(error.status)
  );
}

function QueryState({
  pending,
  error,
  children,
}: {
  pending: boolean;
  error: boolean;
  children: React.ReactNode;
}) {
  if (pending) return <p role="status">조회 중입니다.</p>;
  if (error) return <p role="alert">조회 정보를 불러올 수 없습니다.</p>;
  return children;
}

export function OrderInfoPanel({
  selectedAccountRef,
}: {
  selectedAccountRef?: string;
}) {
  const [currency, setCurrency] = useState<"KRW" | "USD">("KRW");
  const [draftSymbol, setDraftSymbol] = useState("");
  const [symbol, setSymbol] = useState<string>();
  const enabled = selectedAccountRef !== undefined;
  const buyingPower = useQuery({
    queryKey: ["order-info", "buying-power", selectedAccountRef, currency],
    queryFn: ({ signal }) => getBuyingPower(currency, signal),
    enabled,
    retry,
    staleTime: ACCOUNT_QUERY_TTL.buyingPower,
    refetchOnWindowFocus: false,
  });
  const sellable = useQuery({
    queryKey: ["order-info", "sellable-quantity", selectedAccountRef, symbol],
    queryFn: ({ signal }) => getSellableQuantity(symbol!, signal),
    enabled: enabled && symbol !== undefined,
    retry,
    staleTime: ACCOUNT_QUERY_TTL.sellableQuantity,
    refetchOnWindowFocus: false,
  });
  const commissions = useQuery({
    queryKey: ["order-info", "commissions", selectedAccountRef],
    queryFn: ({ signal }) => getCommissions(signal),
    enabled,
    retry,
    staleTime: ACCOUNT_QUERY_TTL.commissions,
    refetchOnWindowFocus: false,
  });

  if (!enabled) return null;
  return (
    <section
      aria-labelledby="order-info-title"
      className="mt-8 rounded-2xl border border-slate-200 bg-slate-100 p-5"
    >
      <h2 id="order-info-title" className="text-xl font-semibold">
        주문 전 조회 정보
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        조회용 참고 정보이며 표시 값은 주문을 실행하지 않습니다. 실제 주문
        기능은 없습니다.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <article className="rounded-xl bg-white p-4">
          <h3 className="font-semibold">현금 기반 주문 가능 금액</h3>
          <label className="mt-3 block text-sm">
            통화
            <select
              value={currency}
              onChange={(event) =>
                setCurrency(event.target.value as "KRW" | "USD")
              }
              className="ml-2 rounded border px-2 py-1"
            >
              <option value="KRW">KRW</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <QueryState
            pending={buyingPower.isPending}
            error={buyingPower.isError}
          >
            <p className="mt-3 font-mono">
              {buyingPower.data?.cashBuyingPower} {buyingPower.data?.currency}
            </p>
          </QueryState>
        </article>

        <article className="rounded-xl bg-white p-4">
          <h3 className="font-semibold">매도 가능 수량 조회</h3>
          <label className="mt-3 block text-sm">
            종목 코드
            <input
              value={draftSymbol}
              onChange={(event) => setDraftSymbol(event.target.value)}
              className="mt-1 block w-full rounded border px-2 py-1"
            />
          </label>
          <button
            type="button"
            className="mt-2 rounded border border-blue-700 px-3 py-1 text-sm font-semibold"
            onClick={() => {
              const canonical = draftSymbol.trim().toUpperCase();
              setSymbol(
                /^[A-Za-z0-9.-]{1,32}$/.test(canonical) ? canonical : undefined,
              );
            }}
          >
            조회
          </button>
          {!symbol ? (
            <p role="status" className="mt-3 text-sm text-slate-600">
              조회할 종목 코드를 입력해 주세요.
            </p>
          ) : (
            <QueryState pending={sellable.isPending} error={sellable.isError}>
              <p className="mt-3 font-mono">
                {sellable.data?.symbol}: {sellable.data?.sellableQuantity}
              </p>
            </QueryState>
          )}
        </article>

        <article className="rounded-xl bg-white p-4">
          <h3 className="font-semibold">시장별 수수료율</h3>
          <QueryState
            pending={commissions.isPending}
            error={commissions.isError}
          >
            {commissions.data?.length === 0 ? (
              <p role="status" className="mt-3">
                지원 정보가 없습니다.
              </p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {commissions.data?.map((commission) => (
                  <li
                    key={`${commission.marketCountry}:${commission.startDate ?? ""}`}
                  >
                    <span>{commission.marketCountry}</span>{" "}
                    <span className="font-mono">
                      {commission.commissionRate}%
                    </span>
                    <span className="block text-xs text-slate-600">
                      {commission.startDate ?? "시작일 미제공"} –{" "}
                      {commission.endDate ?? "종료일 미제공"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </article>
      </div>
    </section>
  );
}
