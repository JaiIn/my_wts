"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { loginInputSchema } from "../../domain/auth/validation";

type FieldErrors = Partial<Record<"password" | "username", string>>;

const VALIDATION_MESSAGES: Record<string, string> = {
  USERNAME_TOO_SHORT: "사용자명은 3자 이상이어야 합니다.",
  USERNAME_TOO_LONG: "사용자명은 32자 이하여야 합니다.",
  USERNAME_INVALID_CHARACTERS:
    "사용자명에는 영문, 숫자, 마침표, 밑줄, 하이픈만 사용할 수 있습니다.",
  PASSWORD_TOO_SHORT: "비밀번호는 10자 이상이어야 합니다.",
  PASSWORD_TOO_LONG: "비밀번호는 128자 이하여야 합니다.",
};

function formValues(form: HTMLFormElement) {
  const data = new FormData(form);
  const credentialValue = data.get("password");
  return {
    username: data.get("username"),
    ["password"]: credentialValue,
  };
}

type LoginFormProps = {
  destination: string;
};

export function LoginForm({ destination }: LoginFormProps) {
  const router = useRouter();
  const submissionLocked = useRef(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLocked.current) {
      return;
    }

    const validation = loginInputSchema.safeParse(
      formValues(event.currentTarget),
    );
    if (!validation.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of validation.error.issues) {
        const field = issue.path[0] as keyof FieldErrors | undefined;
        if (field && !nextErrors[field]) {
          nextErrors[field] =
            VALIDATION_MESSAGES[issue.message] ?? "입력값을 확인해 주세요.";
        }
      }
      setFieldErrors(nextErrors);
      setServerError(undefined);
      return;
    }

    submissionLocked.current = true;
    setIsSubmitting(true);
    setFieldErrors({});
    setServerError(undefined);

    try {
      const { password, username } = validation.data;
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const responseBody = (await response.json().catch(() => null)) as {
          error?: { code?: string; message?: string };
        } | null;
        setServerError(
          responseBody?.error?.code === "INVALID_CREDENTIALS"
            ? "사용자명 또는 비밀번호를 확인해 주세요."
            : (responseBody?.error?.message ?? "요청을 처리할 수 없습니다."),
        );
        return;
      }

      router.replace(destination);
      router.refresh();
    } catch {
      setServerError("요청을 처리할 수 없습니다.");
    } finally {
      submissionLocked.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-5" noValidate onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <label
          className="text-sm font-medium text-slate-800"
          htmlFor="username"
        >
          사용자명
        </label>
        <input
          aria-describedby={fieldErrors.username ? "username-error" : undefined}
          aria-invalid={Boolean(fieldErrors.username)}
          autoComplete="username"
          className="h-11 rounded-lg border border-slate-300 px-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          disabled={isSubmitting}
          id="username"
          name="username"
          required
        />
        {fieldErrors.username ? (
          <p className="text-sm text-red-700" id="username-error">
            {fieldErrors.username}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label
          className="text-sm font-medium text-slate-800"
          htmlFor="password"
        >
          비밀번호
        </label>
        <input
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
          aria-invalid={Boolean(fieldErrors.password)}
          autoComplete="current-password"
          className="h-11 rounded-lg border border-slate-300 px-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          disabled={isSubmitting}
          id="password"
          name="password"
          required
          type="password"
        />
        {fieldErrors.password ? (
          <p className="text-sm text-red-700" id="password-error">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      {serverError ? (
        <p
          aria-live="polite"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {serverError}
        </p>
      ) : null}

      <button
        className="h-11 rounded-lg bg-blue-700 px-4 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "로그인 처리 중…" : "로그인"}
      </button>

      <p className="text-center text-sm text-slate-600">
        계정이 없나요?{" "}
        <Link
          className="font-semibold text-blue-700 hover:underline"
          href="/signup"
        >
          회원가입
        </Link>
      </p>
    </form>
  );
}
