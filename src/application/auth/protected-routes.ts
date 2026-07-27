const PROTECTED_PAGE_PREFIXES = [
  "/market",
  "/rankings",
  "/indicators",
  "/portfolio",
  "/orders",
  "/trade",
  "/conditional-orders",
  "/conditional-simulator",
  "/settings",
  "/diagnostics",
] as const;

export function isProtectedPagePath(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }

  return PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function safeProtectedDestination(
  pathname: string,
  search: string,
): string {
  if (
    !isProtectedPagePath(pathname) ||
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.includes("\\")
  ) {
    return "/";
  }

  return `${pathname}${search}`;
}
