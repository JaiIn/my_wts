import { randomUUID } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import {
  SessionAuthenticationError,
  SessionPersistenceError,
  type SessionUser,
} from "../../../../../src/application/auth/session-service";
import { getRuntimeSessionService } from "../../../../../src/infrastructure/auth/runtime-session-service";

const SESSION_COOKIE_NAME = "my_wts_session";
const LOOPBACK_HOST = "127.0.0.1:3000";

type SessionServiceContract = {
  authenticate(token: unknown): SessionUser;
};

type ErrorCode =
  | "AUTH_REQUIRED"
  | "DATABASE_ERROR"
  | "FORBIDDEN"
  | "INTERNAL_ERROR"
  | "SESSION_EXPIRED";

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

function hasAllowedHost(request: NextRequest): boolean {
  return (
    (request.headers.get("host") ?? request.nextUrl.host) === LOOPBACK_HOST
  );
}

export function createSessionHandler(
  service: SessionServiceContract,
  createRequestId: () => string = randomUUID,
  now: () => Date = () => new Date(),
) {
  return async function GET(request: NextRequest): Promise<NextResponse> {
    const requestId = createRequestId();
    if (!hasAllowedHost(request)) {
      return errorResponse(
        requestId,
        403,
        "FORBIDDEN",
        "허용되지 않은 요청입니다.",
      );
    }

    try {
      const user = service.authenticate(
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
      );
      return NextResponse.json(
        {
          data: { user },
          meta: {
            requestId,
            timestamp: now().toISOString(),
          },
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        },
      );
    } catch (error) {
      if (error instanceof SessionAuthenticationError) {
        return errorResponse(
          requestId,
          401,
          error.code,
          error.code === "SESSION_EXPIRED"
            ? "세션이 만료되었습니다."
            : "로그인이 필요합니다.",
        );
      }
      if (error instanceof SessionPersistenceError) {
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

export const GET = createSessionHandler({
  authenticate: (token) => getRuntimeSessionService().authenticate(token),
});
