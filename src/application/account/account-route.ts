import { type NextRequest, NextResponse } from "next/server";

import {
  SessionAuthenticationError,
  SessionPersistenceError,
} from "../auth/session-service";
import {
  AccountProviderError,
  type AccountProvider,
} from "./account-provider";
import {
  AccountContractError,
  maskAccountNo,
  type Account,
  type PublicAccount,
} from "../../domain/account/account";
import { TossEnvelopeDecodeError } from "../../integrations/toss/envelope";
import { TossHttpClientError } from "../../infrastructure/toss/readonly-http-client";

const SESSION_COOKIE_NAME = "my_wts_session";
const LOOPBACK_HOST = "127.0.0.1:3000";

export class AccountRequestValidationError extends Error {
  readonly code = "VALIDATION_FAILED";

  constructor() {
    super("ACCOUNT_REQUEST_VALIDATION_FAILED");
    this.name = "AccountRequestValidationError";
  }
}

export class AccountRouteForbiddenError extends Error {
  constructor() {
    super("ACCOUNT_ROUTE_FORBIDDEN");
    this.name = "AccountRouteForbiddenError";
  }
}

export type AccountAuthenticationContext = Readonly<{
  userId: string;
  sessionScope: string;
}>;

export type AccountBffDependencies = Readonly<{
  provider(): {
    implementation: AccountProvider;
    name: "live" | "mock";
  };
  authenticator: {
    authenticate(token: unknown): AccountAuthenticationContext;
  };
  registry: {
    reconcile(
      sessionScope: string,
      accounts: readonly Account[],
    ): ReadonlyMap<number, string>;
  };
  createRequestId(): string;
  now(): Date;
  log?(event: string, context: Record<string, unknown>): void;
}>;

function validateRequest(request: NextRequest): void {
  const query = request.url.split("?", 2)[1]?.split("#", 1)[0] ?? "";
  if (
    /%(?![0-9A-Fa-f]{2})/.test(query) ||
    [...request.nextUrl.searchParams.keys()].length > 0
  ) {
    throw new AccountRequestValidationError();
  }
}

function publicAccounts(
  accounts: readonly Account[],
  references: ReadonlyMap<number, string>,
): readonly PublicAccount[] {
  return Object.freeze(
    accounts.map((account) => {
      const accountRef = references.get(account.accountSeq);
      if (!accountRef) {
        throw new AccountContractError("INVALID_ACCOUNT_REFERENCE");
      }
      return Object.freeze({
        accountRef,
        maskedAccountNo: maskAccountNo(account.accountNo),
        accountType: account.accountType,
        selected: false as const,
      });
    }),
  );
}

type SafeError = Readonly<{
  status: number;
  code: string;
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
}>;

function mapHttpError(error: TossHttpClientError): SafeError {
  if (error.code === "TOSS_GET_AUTHENTICATION_FAILED") {
    return {
      status: 502,
      code: "TOSS_AUTH_FAILED",
      message: "외부 인증을 확인할 수 없습니다.",
      retryable: false,
    };
  }
  if (error.code === "TOSS_GET_RATE_LIMITED") {
    return {
      status: 429,
      code: "UPSTREAM_RATE_LIMITED",
      message: "잠시 후 다시 시도해 주세요.",
      retryable: error.retryable,
      retryAfterSeconds:
        error.retryAfterMs === undefined
          ? undefined
          : Math.floor(error.retryAfterMs / 1_000),
    };
  }
  if (error.code === "TOSS_GET_TIMEOUT") {
    return {
      status: 504,
      code: "UPSTREAM_TIMEOUT",
      message: "외부 조회 시간이 초과되었습니다.",
      retryable: true,
    };
  }
  if (error.code === "TOSS_GET_NETWORK_FAILURE") {
    return {
      status: 503,
      code: "UPSTREAM_UNAVAILABLE",
      message: "외부 조회 서비스를 사용할 수 없습니다.",
      retryable: true,
    };
  }
  return {
    status: 502,
    code: "UPSTREAM_UNKNOWN_ERROR",
    message: "외부 조회 응답을 처리할 수 없습니다.",
    retryable: false,
  };
}

function safeError(error: unknown): SafeError {
  if (error instanceof AccountRouteForbiddenError) {
    return {
      status: 403,
      code: "UPSTREAM_FORBIDDEN",
      message: "허용되지 않은 요청입니다.",
      retryable: false,
    };
  }
  if (error instanceof AccountRequestValidationError) {
    return {
      status: 400,
      code: error.code,
      message: "입력값을 확인해 주세요.",
      retryable: false,
    };
  }
  if (error instanceof SessionAuthenticationError) {
    return {
      status: 401,
      code: error.code,
      message:
        error.code === "SESSION_EXPIRED"
          ? "세션이 만료되었습니다."
          : "로그인이 필요합니다.",
      retryable: false,
    };
  }
  if (error instanceof TossHttpClientError) return mapHttpError(error);
  if (error instanceof AccountProviderError) {
    const status =
      error.code === "UPSTREAM_RATE_LIMITED"
        ? 429
        : error.code === "UPSTREAM_TIMEOUT"
          ? 504
          : error.code === "UPSTREAM_UNAVAILABLE"
            ? 503
            : 502;
    return {
      status,
      code: error.code,
      message:
        status === 429
          ? "잠시 후 다시 시도해 주세요."
          : "계좌 목록을 조회할 수 없습니다.",
      retryable: error.retryable,
    };
  }
  if (
    error instanceof TossEnvelopeDecodeError ||
    error instanceof AccountContractError
  ) {
    return {
      status: 502,
      code: "UPSTREAM_INVALID_RESPONSE",
      message: "계좌 목록 응답을 처리할 수 없습니다.",
      retryable: false,
    };
  }
  if (error instanceof SessionPersistenceError) {
    return {
      status: 500,
      code: "DATABASE_ERROR",
      message: "요청을 처리할 수 없습니다.",
      retryable: false,
    };
  }
  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "요청을 처리할 수 없습니다.",
    retryable: false,
  };
}

export function accountErrorResponse(
  requestId: string,
  error: unknown,
): NextResponse {
  const mapped = safeError(error);
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
  };
  if (mapped.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(mapped.retryAfterSeconds);
  }
  return NextResponse.json(
    {
      error: {
        requestId,
        code: mapped.code,
        message: mapped.message,
        retryable: mapped.retryable,
        details: {},
      },
    },
    { status: mapped.status, headers },
  );
}

export function createAccountBffHandler(dependencies: AccountBffDependencies) {
  return async function GET(request: NextRequest): Promise<NextResponse> {
    const requestId = dependencies.createRequestId();
    const startedAt = dependencies.now().getTime();
    let providerName: "live" | "mock" | undefined;
    try {
      const host = request.headers.get("host") ?? request.nextUrl.host;
      if (host !== LOOPBACK_HOST) throw new AccountRouteForbiddenError();
      validateRequest(request);
      const authentication = dependencies.authenticator.authenticate(
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
      );
      const provider = dependencies.provider();
      providerName = provider.name;
      const accounts = await provider.implementation.getAccounts();
      const references = dependencies.registry.reconcile(
        `${authentication.userId}:${authentication.sessionScope}`,
        accounts,
      );
      const data = { accounts: publicAccounts(accounts, references) };
      dependencies.log?.("account.bff.succeeded", {
        requestId,
        operation: "getAccounts",
        status: 200,
        provider: providerName,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
      });
      return NextResponse.json(
        {
          data,
          meta: {
            requestId,
            fetchedAt: dependencies.now().toISOString(),
            stale: false,
          },
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "X-Request-Id": requestId,
          },
        },
      );
    } catch (error) {
      const response = accountErrorResponse(requestId, error);
      dependencies.log?.("account.bff.failed", {
        requestId,
        operation: "getAccounts",
        status: response.status,
        provider: providerName,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
      });
      return response;
    }
  };
}
