const DEFAULT_LOGIN_DESTINATION = "/market";

export function resolveLoginDestination(next: string | undefined): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\")
  ) {
    return DEFAULT_LOGIN_DESTINATION;
  }

  return next;
}
