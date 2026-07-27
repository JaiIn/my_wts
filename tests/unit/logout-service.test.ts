import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  LogoutAuthenticationError,
  type LogoutPersistence,
  LogoutService,
} from "../../src/application/auth/logout-service";

const VALID_TOKEN = Buffer.alloc(32, 5).toString("base64url");

describe("LogoutService", () => {
  it("hashes the canonical token and deletes only the matching session", () => {
    let receivedTokenHash: string | undefined;
    const persistence: LogoutPersistence = {
      deleteSessionByTokenHash(tokenHash) {
        receivedTokenHash = tokenHash;
        return true;
      },
    };

    new LogoutService(persistence).logout(VALID_TOKEN);

    expect(receivedTokenHash).toBe(
      createHash("sha256").update(VALID_TOKEN).digest("hex"),
    );
    expect(receivedTokenHash).not.toBe(VALID_TOKEN);
  });

  it.each([
    ["missing", undefined],
    ["wrong type", 123],
    ["invalid alphabet", "*".repeat(43)],
    ["wrong length", "A".repeat(42)],
  ])("rejects a %s token before persistence", (_case, token) => {
    const deleteSession = vi.fn(() => true);
    const service = new LogoutService({
      deleteSessionByTokenHash: deleteSession,
    });

    expect(() => service.logout(token)).toThrowError(LogoutAuthenticationError);
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("rejects an already absent session", () => {
    const service = new LogoutService({
      deleteSessionByTokenHash: () => false,
    });

    expect(() => service.logout(VALID_TOKEN)).toThrowError(
      LogoutAuthenticationError,
    );
  });
});
