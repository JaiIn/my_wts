import { describe, expect, it } from "vitest";

import {
  isProtectedPagePath,
  safeProtectedDestination,
} from "../../src/application/auth/protected-routes";

describe("protected page paths", () => {
  it.each([
    "/",
    "/market",
    "/market/005930",
    "/rankings",
    "/indicators",
    "/portfolio",
    "/orders/order-1",
    "/trade/005930",
    "/conditional-orders/item-1",
    "/conditional-simulator",
    "/settings",
    "/diagnostics",
  ])("protects %s", (pathname) => {
    expect(isProtectedPagePath(pathname)).toBe(true);
  });

  it.each([
    "/login",
    "/signup",
    "/api/v1/auth/session",
    "/_next/static/app.js",
    "/favicon.ico",
    "/marketplace",
  ])("leaves %s outside the protected page matcher", (pathname) => {
    expect(isProtectedPagePath(pathname)).toBe(false);
  });

  it("preserves only explicit internal protected destinations", () => {
    expect(safeProtectedDestination("/orders", "?status=OPEN")).toBe(
      "/orders?status=OPEN",
    );
    expect(safeProtectedDestination("//example.com", "")).toBe("/");
    expect(safeProtectedDestination("/\\example.com", "")).toBe("/");
    expect(safeProtectedDestination("/login", "")).toBe("/");
    expect(safeProtectedDestination("https://example.com", "")).toBe("/");
  });
});
