import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  SignupPersistenceError,
  type SignupResult,
  SignupValidationError,
} from "../../../../../src/application/auth/signup-service";
import { getRuntimeSignupService } from "../../../../../src/infrastructure/auth/runtime-signup-service";
import { UsernameAlreadyExistsError } from "../../../../../src/infrastructure/database/user-repository";

const SESSION_COOKIE_NAME = "my_wts_session";

type SignupServiceContract = {
  signup(input: unknown): Promise<SignupResult>;
};

type ErrorCode =
  | "DATABASE_ERROR"
  | "INTERNAL_ERROR"
  | "USERNAME_ALREADY_EXISTS"
  | "VALIDATION_FAILED";

function errorResponse(
  requestId: string,
  status: number,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json(
    {
      error: {
        requestId,
        code,
        message,
        retryable: false,
        details,
      },
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export function createSignupHandler(
  service: SignupServiceContract,
  createRequestId: () => string = randomUUID,
) {
  return async function POST(request: Request): Promise<NextResponse> {
    const requestId = createRequestId();
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
      const result = await service.signup(body);
      const response = NextResponse.json(
        {
          data: { user: result.user },
          meta: { requestId },
        },
        {
          status: 201,
          headers: { "Cache-Control": "no-store" },
        },
      );

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
      if (error instanceof SignupValidationError) {
        return errorResponse(
          requestId,
          400,
          "VALIDATION_FAILED",
          "입력값을 확인해 주세요.",
          { fields: error.fields },
        );
      }
      if (error instanceof UsernameAlreadyExistsError) {
        return errorResponse(
          requestId,
          409,
          "USERNAME_ALREADY_EXISTS",
          "이미 사용 중인 사용자명입니다.",
        );
      }
      if (error instanceof SignupPersistenceError) {
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

export const POST = createSignupHandler({
  signup: (input) => getRuntimeSignupService().signup(input),
});
