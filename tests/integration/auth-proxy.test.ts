import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { SessionAuthenticationError } from "../../src/application/auth/session-service";
import { createAuthProxy } from "../../proxy";

const VALID_TOKEN = Buffer.alloc(32, 4).toString("base64url");

function proxyRequest(path: string, token?: string): NextRequest {
  return new NextRequest(`http://127.0.0.1:3000${path}`, {
    headers: token ? { Cookie: `my_wts_session=${token}` } : undefined,
  });
}

describe("auth proxy", () => {
  it("redirects an unauthenticated protected route with an encoded internal next", () => {
    const handler = createAuthProxy({
      authenticate: () => {
        throw new SessionAuthenticationError("AUTH_REQUIRED");
      },
    });
    const response = handler(proxyRequest("/orders?status=OPEN"));
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.origin).toBe("http://127.0.0.1:3000");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/orders?status=OPEN");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("allows a protected route only after server session validation", () => {
    const authenticate = vi.fn(() => ({
      id: "usr_test",
      username: "Local.User",
      displayName: "로컬 사용자",
    }));
    const handler = createAuthProxy({ authenticate });
    const response = handler(proxyRequest("/portfolio", VALID_TOKEN));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(authenticate).toHaveBeenCalledWith(VALID_TOKEN);
  });

  it("redirects unauthenticated /market access to the safe login destination", () => {
    const handler = createAuthProxy({
      authenticate: () => {
        throw new SessionAuthenticationError("AUTH_REQUIRED");
      },
    });
    const response = handler(proxyRequest("/market"));
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/market");
  });

  it("redirects an authenticated root request to the market screen", () => {
    const handler = createAuthProxy({
      authenticate: () => ({
        id: "usr_test",
        username: "Local.User",
        displayName: "로컬 사용자",
      }),
    });
    const response = handler(proxyRequest("/", VALID_TOKEN));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3000/market",
    );
  });

  it.each([
    "/login",
    "/signup",
    "/api/v1/auth/login",
    "/api/v1/auth/signup",
    "/api/v1/auth/session",
    "/_next/static/app.js",
    "/favicon.ico",
  ])("does not create a redirect loop for %s", (path) => {
    const authenticate = vi.fn();
    const handler = createAuthProxy({ authenticate });
    const response = handler(proxyRequest(path));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(authenticate).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBeNull();
  });

  it("never places a presented token in a redirect URL", () => {
    const handler = createAuthProxy({
      authenticate: () => {
        throw new SessionAuthenticationError("AUTH_REQUIRED");
      },
    });
    const response = handler(proxyRequest("/settings", VALID_TOKEN));

    expect(response.headers.get("location")).not.toContain(VALID_TOKEN);
  });
});
