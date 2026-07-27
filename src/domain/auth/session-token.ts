import { createHash } from "node:crypto";

const SESSION_TOKEN_BYTES = 32;

export function hashCanonicalSessionToken(token: unknown): string | undefined {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return undefined;
  }

  const decoded = Buffer.from(token, "base64url");
  if (
    decoded.length !== SESSION_TOKEN_BYTES ||
    decoded.toString("base64url") !== token
  ) {
    return undefined;
  }

  return createHash("sha256").update(token).digest("hex");
}
