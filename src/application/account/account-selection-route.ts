import { type NextRequest, NextResponse } from "next/server";

import {
  SessionAuthenticationError,
  SessionPersistenceError,
} from "../auth/session-service";
import {
  AccountReferenceInvalidError,
  AccountSelectionPersistenceError,
  type AccountSelectionService,
} from "./account-selection-service";

const SESSION_COOKIE_NAME = "my_wts_session";
const LOOPBACK_HOST = "127.0.0.1:3000";
const LOOPBACK_ORIGIN = "http://127.0.0.1:3000";
const MAX_JSON_BODY_BYTES = 4 * 1024;

export class AccountSelectionValidationError extends Error {
  constructor() {
    super("VALIDATION_FAILED");
    this.name = "AccountSelectionValidationError";
  }
}

export class AccountSelectionForbiddenError extends Error {
  constructor() {
    super("FORBIDDEN");
    this.name = "AccountSelectionForbiddenError";
  }
}

function validateBoundary(request: NextRequest): void {
  if (
    (request.headers.get("host") ?? request.nextUrl.host) !== LOOPBACK_HOST ||
    request.headers.get("origin") !== LOOPBACK_ORIGIN
  ) {
    throw new AccountSelectionForbiddenError();
  }
  const rawQuery = request.url.split("?", 2)[1]?.split("#", 1)[0] ?? "";
  if (
    /%(?![0-9A-Fa-f]{2})/.test(rawQuery) ||
    [...request.nextUrl.searchParams.keys()].length > 0
  ) {
    throw new AccountSelectionValidationError();
  }
}

async function readSelectionBody(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";")[0];
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    contentType?.trim().toLowerCase() !== "application/json" ||
    (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES)
  ) {
    throw new AccountSelectionValidationError();
  }
  const text = await request.text();
  if (
    new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES ||
    text.length === 0
  ) {
    throw new AccountSelectionValidationError();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AccountSelectionValidationError();
  }
}

function parseAccountRef(body: unknown): unknown {
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !Object.hasOwn(body, "accountRef") ||
    typeof (body as { accountRef?: unknown }).accountRef !== "string"
  ) {
    throw new AccountSelectionValidationError();
  }
  return (body as { accountRef?: unknown }).accountRef;
}

async function rejectDeleteBody(request: NextRequest): Promise<void> {
  const text = await request.text();
  if (text.length > 0) throw new AccountSelectionValidationError();
}

function emptySuccess(requestId: string): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}

function errorResponse(requestId: string, error: unknown): NextResponse {
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "요청을 처리할 수 없습니다.";
  if (error instanceof AccountSelectionForbiddenError) {
    status = 403;
    code = "FORBIDDEN";
    message = "허용되지 않은 요청입니다.";
  } else if (error instanceof AccountSelectionValidationError) {
    status = 400;
    code = "VALIDATION_FAILED";
    message = "입력값을 확인해 주세요.";
  } else if (error instanceof SessionAuthenticationError) {
    status = 401;
    code = error.code;
    message =
      error.code === "SESSION_EXPIRED"
        ? "세션이 만료되었습니다."
        : "로그인이 필요합니다.";
  } else if (error instanceof AccountReferenceInvalidError) {
    status = 409;
    code = error.code;
    message = "계좌 목록을 다시 확인한 뒤 선택해 주세요.";
  } else if (
    error instanceof AccountSelectionPersistenceError ||
    error instanceof SessionPersistenceError
  ) {
    code = "DATABASE_ERROR";
  }
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
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      },
    },
  );
}

export function createAccountSelectionHandlers(
  service: Pick<AccountSelectionService, "select" | "clear">,
  createRequestId: () => string,
) {
  return {
    async PUT(request: NextRequest): Promise<NextResponse> {
      const requestId = createRequestId();
      try {
        validateBoundary(request);
        const accountRef = parseAccountRef(await readSelectionBody(request));
        service.select(
          request.cookies.get(SESSION_COOKIE_NAME)?.value,
          accountRef,
        );
        return emptySuccess(requestId);
      } catch (error) {
        return errorResponse(requestId, error);
      }
    },
    async DELETE(request: NextRequest): Promise<NextResponse> {
      const requestId = createRequestId();
      try {
        validateBoundary(request);
        await rejectDeleteBody(request);
        service.clear(request.cookies.get(SESSION_COOKIE_NAME)?.value);
        return emptySuccess(requestId);
      } catch (error) {
        return errorResponse(requestId, error);
      }
    },
  };
}
