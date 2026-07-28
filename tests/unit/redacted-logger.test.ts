import { Writable } from "node:stream";

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  redactSensitiveData,
  safeSerialize,
} from "../../src/infrastructure/logging/redaction";
import { createStructuredLogger } from "../../src/infrastructure/logging/server-logger";

const MARKER = "fixture-sensitive-marker";

describe("redacted structured logger", () => {
  it("redacts sensitive keys across case, separators, objects, and arrays", () => {
    const input = {
      password: "<fixture-password>",
      PasswordConfirmation: "<fixture-confirmation>",
      password_hash: "<fixture-hash>",
      nested: {
        clientSecret: "<fixture-client-secret>",
        access_token: "<fixture-access>",
        refreshToken: "<fixture-refresh>",
        API_KEY: "<fixture-api-key>",
        OAuthPayload: { subject: "<fixture-subject>" },
        accountSeq: "<fixture-account>",
      },
      headers: {
        Authorization: "Bearer <fixture-bearer>",
        Cookie: "my_wts_session=<fixture-cookie>",
        "Set-Cookie": "my_wts_session=<fixture-set-cookie>",
      },
      values: [
        { sessionToken: "<fixture-session>" },
        { tokenHash: "<fixture-hash>" },
      ],
    };

    const serialized = safeSerialize(input);
    expect(serialized).not.toMatch(
      /fixture-(password|confirmation|hash|client-secret|access|refresh|api-key|subject|account|bearer|cookie|set-cookie|session)/,
    );
    expect(serialized.match(/\[REDACTED\]/g)?.length).toBeGreaterThan(10);
  });

  it("redacts known secret values even when embedded in otherwise safe text", () => {
    const serialized = safeSerialize(
      {
        message: `prefix-${MARKER}-suffix`,
        [`key-${MARKER}`]: "safe value",
        authorizationText: "Bearer <fixture-bearer-value>",
        cookieText: "my_wts_session=<fixture-cookie-value>; Path=/",
      },
      [MARKER],
    );

    expect(serialized).not.toContain(MARKER);
    expect(serialized).not.toContain("fixture-bearer-value");
    expect(serialized).not.toContain("fixture-cookie-value");
  });

  it("serializes Error causes without stack and handles circular, BigInt, Decimal, and undefined", () => {
    const root: Record<string, unknown> = {
      amount: new Decimal("9007199254740993.123456789"),
      count: BigInt("9007199254740993"),
      missing: undefined,
    };
    root.self = root;
    root.error = new Error(`failed with ${MARKER}`, {
      cause: new Error(`caused by ${MARKER}`),
    });

    const serialized = safeSerialize(root, [MARKER]);
    expect(serialized).toContain("9007199254740993.123456789");
    expect(serialized).toContain("9007199254740993");
    expect(serialized).toContain("[Circular]");
    expect(serialized).toContain("[Undefined]");
    expect(serialized).not.toContain(MARKER);
    expect(serialized).not.toContain("stack");
  });

  it("does not mutate input and tolerates throwing getters", () => {
    const nested = { safe: "value", password: "<fixture-password>" };
    const input = { nested } as Record<string, unknown>;
    Object.defineProperty(input, "broken", {
      enumerable: true,
      get() {
        throw new Error("getter failed");
      },
    });

    const redacted = redactSensitiveData(input) as Record<string, unknown>;
    expect(input.nested).toBe(nested);
    expect(nested.password).toBe("<fixture-password>");
    expect(redacted.broken).toBe("[Unserializable]");
  });

  it("writes the frozen structured fields and redacted context", () => {
    const chunks: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const logger = createStructuredLogger({
      level: "info",
      destination,
      knownSecrets: [MARKER],
      clock: () => new Date("2026-07-28T05:00:00.000Z"),
    });

    logger.info("market.fixture.loaded", {
      requestId: "00000000-0000-4000-8000-000000000301",
      operation: "market.fixture",
      routeTemplate: "/api/v1/stocks",
      method: "GET",
      status: 200,
      durationMs: 12,
      context: {
        note: `contains ${MARKER}`,
        sessionToken: "<fixture-token>",
      },
    });

    const record = JSON.parse(chunks.join("")) as Record<string, unknown>;
    expect(record).toMatchObject({
      level: "info",
      timestamp: "2026-07-28T05:00:00.000Z",
      event: "market.fixture.loaded",
      requestId: "00000000-0000-4000-8000-000000000301",
      operation: "market.fixture",
      routeTemplate: "/api/v1/stocks",
      method: "GET",
      status: 200,
      durationMs: 12,
    });
    expect(JSON.stringify(record)).not.toContain(MARKER);
    expect(JSON.stringify(record)).not.toContain("fixture-token");
  });

  it("does not throw when logger preparation itself fails", () => {
    const logger = createStructuredLogger({
      level: "info",
      clock() {
        throw new Error("clock unavailable");
      },
    });

    expect(() => logger.info("logger.failure.fixture")).not.toThrow();
  });
});
