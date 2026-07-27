import { type NextRequest, NextResponse } from "next/server";

import {
  isProtectedPagePath,
  safeProtectedDestination,
} from "./src/application/auth/protected-routes";
import type { SessionUser } from "./src/application/auth/session-service";
import { authenticateRuntimeSession } from "./src/infrastructure/auth/runtime-session-service";

const SESSION_COOKIE_NAME = "my_wts_session";
const LOOPBACK_ORIGIN = "http://127.0.0.1:3000";

type SessionServiceContract = {
  authenticate(token: unknown): SessionUser;
};

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function loginRedirect(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", LOOPBACK_ORIGIN);
  loginUrl.searchParams.set(
    "next",
    safeProtectedDestination(request.nextUrl.pathname, request.nextUrl.search),
  );
  return noStore(NextResponse.redirect(loginUrl));
}

export function createAuthProxy(service: SessionServiceContract) {
  return function authProxy(request: NextRequest): NextResponse {
    if (!isProtectedPagePath(request.nextUrl.pathname)) {
      return NextResponse.next();
    }

    try {
      service.authenticate(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    } catch {
      return loginRedirect(request);
    }

    if (request.nextUrl.pathname === "/") {
      return noStore(
        NextResponse.redirect(new URL("/market", LOOPBACK_ORIGIN)),
      );
    }

    return noStore(NextResponse.next());
  };
}

export const proxy = createAuthProxy({
  authenticate: authenticateRuntimeSession,
});

export const config = {
  matcher: [
    "/",
    "/market/:path*",
    "/rankings/:path*",
    "/indicators/:path*",
    "/portfolio/:path*",
    "/orders/:path*",
    "/trade/:path*",
    "/conditional-orders/:path*",
    "/conditional-simulator/:path*",
    "/settings/:path*",
    "/diagnostics/:path*",
  ],
};
