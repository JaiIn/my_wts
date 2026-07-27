import { randomUUID } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import {
  LogoutAuthenticationError,
  LogoutPersistenceError,
} from "../../../../../src/application/auth/logout-service";
import { getRuntimeLogoutService } from "../../../../../src/infrastructure/auth/runtime-logout-service";

const SESSION_COOKIE_NAME = "my_wts_session";
const LOOPBACK_HOST = "127.0.0.1:3000";
const LOOPBACK_ORIGIN = "http://127.0.0.1:3000";

type LogoutServiceContract = {
  logout(token: unknown): void;
};

type ErrorCode =
  | "AUTH_REQUIRED"
  | "DATABASE_ERROR"
  | "FORBIDDEN"
  | "INTERNAL_ERROR"
  | "VALIDATION_FAILED";

function errorResponse(
  requestId: string,
  status: number,
  code: ErrorCode,
  message: string,
): NextResponse {
  return NextResponse.json(
    {
      error: {
        requestId,
        code,
        message,
        retryable: false,
        details: {},
      },
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  return response;
}

function hasAllowedOrigin(request: NextRequest): boolean {
  return (
    (request.headers.get("host") ?? request.nextUrl.host) === LOOPBACK_HOST &&
    request.headers.get("origin") === LOOPBACK_ORIGIN
  );
}

export function createLogoutHandler(
  service: LogoutServiceContract,
  createRequestId: () => string = randomUUID,
) {
  return async function POST(request: NextRequest): Promise<NextResponse> {
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

    try {
      service.logout(request.cookies.get(SESSION_COOKIE_NAME)?.value);
      return clearSessionCookie(
        new NextResponse(null, {
          status: 204,
          headers: { "Cache-Control": "no-store" },
        }),
      );
    } catch (error) {
      if (error instanceof LogoutAuthenticationError) {
        return clearSessionCookie(
          errorResponse(
            requestId,
            401,
            "AUTH_REQUIRED",
            "로그인이 필요합니다.",
          ),
        );
      }
      if (error instanceof LogoutPersistenceError) {
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

export const POST = createLogoutHandler({
  logout: (token) => getRuntimeLogoutService().logout(token),
});
