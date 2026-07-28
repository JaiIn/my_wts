import { type NextRequest, NextResponse } from "next/server";

import {
  SessionAuthenticationError,
  type SessionUser,
} from "../auth/session-service";
import {
  WatchlistConflictError,
  WatchlistNotFoundError,
  WatchlistPersistenceError,
  WatchlistValidationError,
} from "./watchlist-service";

export const SESSION_COOKIE_NAME = "my_wts_session";
const LOOPBACK_HOST = "127.0.0.1:3000";
const LOOPBACK_ORIGIN = "http://127.0.0.1:3000";
const MAX_JSON_BODY_BYTES = 64 * 1024;

export type WatchlistAuthenticator = {
  authenticate(token: unknown): SessionUser;
};

export function authenticateWatchlistRequest(
  request: NextRequest,
  authenticator: WatchlistAuthenticator,
  stateChanging: boolean,
): SessionUser {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  if (
    host !== LOOPBACK_HOST ||
    (stateChanging && request.headers.get("origin") !== LOOPBACK_ORIGIN)
  ) {
    throw new WatchlistRouteForbiddenError();
  }
  return authenticator.authenticate(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
}

export async function readWatchlistJson(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";")[0];
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    contentType?.trim().toLowerCase() !== "application/json" ||
    (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES)
  ) {
    throw new WatchlistValidationError(["request"]);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) {
    throw new WatchlistValidationError(["request"]);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new WatchlistValidationError(["request"]);
  }
}

export class WatchlistRouteForbiddenError extends Error {
  constructor() {
    super("FORBIDDEN");
    this.name = "WatchlistRouteForbiddenError";
  }
}

export function watchlistSuccess(
  requestId: string,
  data: Record<string, unknown>,
  status = 200,
  now: () => Date = () => new Date(),
): NextResponse {
  return NextResponse.json(
    {
      data,
      meta: { requestId, fetchedAt: now().toISOString(), stale: false },
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function watchlistErrorResponse(
  requestId: string,
  error: unknown,
): NextResponse {
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "요청을 처리할 수 없습니다.";
  let details: Record<string, unknown> = {};

  if (error instanceof WatchlistRouteForbiddenError) {
    status = 403;
    code = "FORBIDDEN";
    message = "허용되지 않은 요청입니다.";
  } else if (error instanceof SessionAuthenticationError) {
    status = 401;
    code = "AUTH_REQUIRED";
    message = "로그인이 필요합니다.";
  } else if (error instanceof WatchlistValidationError) {
    status = 400;
    code = "VALIDATION_FAILED";
    message = "입력값을 확인해 주세요.";
    details = { fields: error.fields };
  } else if (error instanceof WatchlistNotFoundError) {
    status = 404;
    code = "NOT_FOUND";
    message = "대상을 찾을 수 없습니다.";
  } else if (error instanceof WatchlistConflictError) {
    status = 409;
    code = "CONFLICT";
    message =
      error.reason === "DUPLICATE_ITEM"
        ? "이미 관심종목에 추가되어 있습니다."
        : "기본 관심종목 목록은 삭제할 수 없습니다.";
  } else if (error instanceof WatchlistPersistenceError) {
    code = "DATABASE_ERROR";
  }

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
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
