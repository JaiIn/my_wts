"use client";

import { useQuery } from "@tanstack/react-query";

import { isKnownAccountType } from "../../domain/account/account";
import {
  AccountBffError,
  getAccounts,
  type BffAccount,
} from "./account-bff-client";

const ACCOUNT_TYPE_LABELS = {
  BROKERAGE: "종합매매",
  OVERSEAS_DERIVATIVES: "해외파생",
  PENSION_SAVINGS: "연금저축",
  RESHORING_INVESTMENT: "RIA",
} as const;

function accountTypeLabel(accountType: string): string {
  return isKnownAccountType(accountType)
    ? ACCOUNT_TYPE_LABELS[accountType]
    : "기타 계좌 유형";
}

function AccountList({ accounts }: { accounts: readonly BffAccount[] }) {
  return (
    <ul aria-label="Toss 계좌 목록" className="mt-5 grid gap-3">
      {accounts.map((account) => (
        <li
          key={account.accountRef}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <p className="font-semibold">{accountTypeLabel(account.accountType)}</p>
          <p className="mt-1 font-mono text-sm" data-testid="masked-account-no">
            {account.maskedAccountNo}
          </p>
          {!isKnownAccountType(account.accountType) ? (
            <p className="mt-2 text-xs text-slate-500">
              지원 범위가 확장된 계좌 유형입니다.
            </p>
          ) : null}
          <p className="mt-2 text-xs text-slate-500">선택되지 않음</p>
        </li>
      ))}
    </ul>
  );
}

export function AccountSettingsPanel({
  liveReadEnabled,
}: Readonly<{ liveReadEnabled: boolean }>) {
  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: ({ signal }) => getAccounts(signal),
    retry(failureCount, error) {
      return (
        failureCount < 1 &&
        error instanceof AccountBffError &&
        error.retryable &&
        ![400, 401, 403, 404, 429].includes(error.status)
      );
    },
    staleTime: 0,
  });

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-sm font-semibold tracking-wide text-blue-700">
          MY WTS · SETTINGS
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">설정</h1>
        <section
          aria-labelledby="account-list-title"
          className="mt-8 rounded-2xl border border-slate-200 bg-slate-100 p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="account-list-title" className="text-xl font-semibold">
                Toss 계좌 연결 상태
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                계좌번호는 끝 4자리만 표시합니다. 이 단계에서는 계좌를
                선택하거나 주문에 사용하지 않습니다.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              {liveReadEnabled ? "Toss Open API · 조회 전용" : "MOCK DATA"}
            </span>
          </div>

          {accountsQuery.isPending ? (
            <p role="status" className="mt-5 text-sm text-slate-600">
              계좌 목록을 불러오는 중입니다.
            </p>
          ) : accountsQuery.isError ? (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4"
            >
              <p className="font-semibold">계좌 목록을 불러오지 못했습니다.</p>
              <p className="mt-1 text-sm">
                잠시 후 이 목록만 다시 확인해 주세요.
              </p>
            </div>
          ) : accountsQuery.data.length === 0 ? (
            <div
              role="status"
              className="mt-5 rounded-xl border border-slate-200 bg-white p-4"
            >
              <p className="font-semibold">표시할 계좌가 없습니다.</p>
              <p className="mt-1 text-sm text-slate-600">
                계좌가 연결되면 마스킹된 목록이 여기에 표시됩니다.
              </p>
            </div>
          ) : (
            <AccountList accounts={accountsQuery.data} />
          )}

          <button
            type="button"
            className="mt-5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
            disabled={accountsQuery.isFetching}
            onClick={() => void accountsQuery.refetch()}
          >
            {accountsQuery.isFetching ? "조회 중" : "목록 새로고침"}
          </button>
        </section>
      </div>
    </main>
  );
}
