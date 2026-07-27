import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  InvalidCredentialsError,
  LoginPersistenceError,
  type LoginResult,
  LoginValidationError,
} from "../../../../../src/application/auth/login-service";
import { LoginRateLimitedError } from "../../../../../src/application/auth/login-attempt-limiter";
import { getRuntimeLoginService } from "../../../../../src/infrastructure/auth/runtime-login-service";

const SESSION_COOKIE_NAME = "my_wts_session";
const LOOPBACK_ORIGIN = "http://127.0.0.1:3000";
const LOOPBACK_HOST = "127.0.0.1:3000";

type LoginServiceContract = {
  login(input: unknown): Promise<LoginResult>;
};

type ErrorCode =
  | "DATABASE_ERROR"
  | "FORBIDDEN"
  | "INTERNAL_ERROR"
  | "AUTH_RATE_LIMITED"
  | "INVALID_CREDENTIALS"
  | "VALIDATION_FAILED";

function errorResponse(
  requestId: string,
  status: number,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
  options: {
    retryable?: boolean;
    retryAfterSeconds?: number;
  } = {},
): NextResponse {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (options.retryAfterSeconds !== undefined) {
    headers.set("Retry-After", options.retryAfterSeconds.toString());
  }

  return NextResponse.json(
    {
      error: {
        requestId,
        code,
        message,
        retryable: options.retryable ?? false,
        details,
      },
    },
    {
      status,
      headers,
    },
  );
}

function hasAllowedOrigin(request: Request): boolean {
  return (
    (request.headers.get("host") ?? new URL(request.url).host) ===
      LOOPBACK_HOST && request.headers.get("origin") === LOOPBACK_ORIGIN
  );
}

export function createLoginHandler(
  service: LoginServiceContract,
  createRequestId: () => string = randomUUID,
) {
  return async function POST(request: Request): Promise<NextResponse> {
    const requestId = createRequestId();

    if (!hasAllowedOrigin(request)) {
      return errorResponse(
        requestId,
        403,
        "FORBIDDEN",
        "허용되지 않은 요청입니다.",
      );
    }

    const contentType = request.headers.get("content-type")?.split(";")[0];
    if (contentType?.trim().toLowerCase() !== "application/json") {
      return errorResponse(
        requestId,
        400,
        "VALIDATION_FAILED",
        "입력값을 확인해 주세요.",
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(
        requestId,
        400,
        "VALIDATION_FAILED",
        "입력값을 확인해 주세요.",
      );
    }

    try {
      const result = await service.login(body);
      const response = new NextResponse(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
      response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: result.session.token,
        httpOnly: true,
        sameSite: "strict",
        secure: false,
        path: "/",
        expires: result.session.expiresAt,
      });
      return response;
    } catch (error) {
      if (error instanceof LoginValidationError) {
        return errorResponse(
          requestId,
          400,
          "VALIDATION_FAILED",
          "입력값을 확인해 주세요.",
          { fields: error.fields },
        );
      }
      if (error instanceof InvalidCredentialsError) {
        return errorResponse(
          requestId,
          401,
          "INVALID_CREDENTIALS",
          "사용자명 또는 비밀번호를 확인해 주세요.",
        );
      }
      if (error instanceof LoginRateLimitedError) {
        return errorResponse(
          requestId,
          429,
          "AUTH_RATE_LIMITED",
          "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
          {},
          {
            retryable: true,
            retryAfterSeconds: error.retryAfterSeconds,
          },
        );
      }
      if (error instanceof LoginPersistenceError) {
        return errorResponse(
          requestId,
          500,
          "DATABASE_ERROR",
          "요청을 처리할 수 없습니다.",
        );
      }
      return errorResponse(
        requestId,
        500,
        "INTERNAL_ERROR",
        "요청을 처리할 수 없습니다.",
      );
    }
  };
}

export const POST = createLoginHandler({
  login: (input) => getRuntimeLoginService().login(input),
});
