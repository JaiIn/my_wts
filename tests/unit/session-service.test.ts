import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SessionAuthenticationError,
  type SessionPersistence,
  SessionService,
} from "../../src/application/auth/session-service";

const NOW = new Date("2026-07-27T12:00:00.000Z");
const VALID_TOKEN = Buffer.alloc(32, 1).toString("base64url");

describe("SessionService", () => {
  let persistence: SessionPersistence;
  let receivedTokenHash: string | undefined;

  beforeEach(() => {
    receivedTokenHash = undefined;
    persistence = {
      findSessionByTokenHash(tokenHash) {
        receivedTokenHash = tokenHash;
        return {
          userId: "usr_test",
          lastSeenAt: "2026-07-27T11:00:00.000Z",
          expiresAt: "2026-08-03T00:00:00.000Z",
        };
      },
      findUserById() {
        return {
          id: "usr_test",
          username: "Local.User",
          displayName: "로컬 사용자",
        };
      },
    };
  });

  it("hashes a valid opaque token and returns only the safe user", () => {
    const service = new SessionService(persistence, { now: () => NOW });

    expect(service.authenticate(VALID_TOKEN)).toEqual({
      id: "usr_test",
      username: "Local.User",
      displayName: "로컬 사용자",
    });
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
  ])("rejects a %s token before database lookup", (_case, token) => {
    const findSession = vi.spyOn(persistence, "findSessionByTokenHash");
    const service = new SessionService(persistence, { now: () => NOW });

    expect(() => service.authenticate(token)).toThrowError(
      expect.objectContaining({ code: "AUTH_REQUIRED" }),
    );
    expect(findSession).not.toHaveBeenCalled();
  });

  it("rejects a token that has no persisted session", () => {
    persistence.findSessionByTokenHash = () => undefined;
    const service = new SessionService(persistence, { now: () => NOW });

    expect(() => service.authenticate(VALID_TOKEN)).toThrowError(
      expect.objectContaining({ code: "AUTH_REQUIRED" }),
    );
  });

  it.each([
    ["absolute expiry", "2026-07-27T11:00:00.000Z", "2026-07-27T12:00:00.000Z"],
    ["idle expiry", "2026-07-27T00:00:00.000Z", "2026-08-03T00:00:00.000Z"],
    ["invalid stored date", "invalid", "2026-08-03T00:00:00.000Z"],
  ])("rejects %s", (_case, lastSeenAt, expiresAt) => {
    persistence.findSessionByTokenHash = () => ({
      userId: "usr_test",
      lastSeenAt,
      expiresAt,
    });
    const service = new SessionService(persistence, { now: () => NOW });

    expect(() => service.authenticate(VALID_TOKEN)).toThrowError(
      expect.objectContaining({ code: "SESSION_EXPIRED" }),
    );
  });

  it("rejects an orphaned session without returning internal identifiers", () => {
    persistence.findUserById = () => undefined;
    const service = new SessionService(persistence, { now: () => NOW });

    try {
      service.authenticate(VALID_TOKEN);
      throw new Error("Expected authentication to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(SessionAuthenticationError);
      expect(error).toMatchObject({ code: "AUTH_REQUIRED" });
      expect(JSON.stringify(error)).not.toContain("usr_test");
    }
  });
});
