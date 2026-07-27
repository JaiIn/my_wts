import type { Metadata } from "next";

import { SignupForm } from "../../src/ui/auth/signup-form";

export const metadata: Metadata = {
  title: "회원가입 | my_wts",
};

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <section
        aria-labelledby="signup-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="mb-7">
          <p className="mb-2 text-sm font-semibold text-blue-700">my_wts</p>
          <h1
            className="text-2xl font-bold tracking-tight text-slate-950"
            id="signup-title"
          >
            로컬 계정 만들기
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            이 계정은 이 기기의 로컬 WTS에서만 사용됩니다.
          </p>
        </div>
        <SignupForm />
      </section>
    </main>
  );
}
