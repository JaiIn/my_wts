import type { Metadata } from "next";

import { LoginForm } from "../../src/ui/auth/login-form";
import { resolveLoginDestination } from "../../src/ui/auth/login-path";

export const metadata: Metadata = {
  title: "로그인 | my_wts",
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const parameters = await searchParams;
  const requestedNext =
    typeof parameters.next === "string" ? parameters.next : undefined;
  const destination = resolveLoginDestination(requestedNext);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <section
        aria-labelledby="login-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="mb-7">
          <p className="mb-2 text-sm font-semibold text-blue-700">my_wts</p>
          <h1
            className="text-2xl font-bold tracking-tight text-slate-950"
            id="login-title"
          >
            로컬 계정 로그인
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            이 기기에 만든 로컬 계정으로 로그인하세요.
          </p>
        </div>
        <LoginForm destination={destination} />
      </section>
    </main>
  );
}
