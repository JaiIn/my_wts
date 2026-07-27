import { describe, expect, it } from "vitest";

import {
  LoginRateLimitedError,
  MemoryLoginAttemptLimiter,
} from "../../src/application/auth/login-attempt-limiter";

describe("MemoryLoginAttemptLimiter", () => {
  it("allows five failures and limits the next attempt for fifteen minutes", async () => {
    let now = new Date("2026-07-27T00:00:00.000Z");
    const limiter = new MemoryLoginAttemptLimiter({ now: () => now });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await limiter.run("local.user", async (state) => {
        state.assertAllowed();
        state.recordFailure();
      });
    }

    await expect(
      limiter.run("local.user", async (state) => state.assertAllowed()),
    ).rejects.toMatchObject({
      retryAfterSeconds: 900,
    });

    now = new Date("2026-07-27T00:14:59.999Z");
    await expect(
      limiter.run("local.user", async (state) => state.assertAllowed()),
    ).rejects.toBeInstanceOf(LoginRateLimitedError);

    now = new Date("2026-07-27T00:15:00.000Z");
    await expect(
      limiter.run("local.user", async (state) => state.assertAllowed()),
    ).resolves.toBeUndefined();
  });

  it("clears the failure bucket after a successful attempt", async () => {
    const limiter = new MemoryLoginAttemptLimiter();

    await limiter.run("local.user", async (state) => {
      state.assertAllowed();
      state.recordFailure();
    });
    await limiter.run("local.user", async (state) => {
      state.assertAllowed();
      state.clear();
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await limiter.run("local.user", async (state) => {
        state.assertAllowed();
        state.recordFailure();
      });
    }
    await expect(
      limiter.run("local.user", async (state) => state.assertAllowed()),
    ).rejects.toBeInstanceOf(LoginRateLimitedError);
  });

  it("serializes concurrent failures so the limit cannot be bypassed", async () => {
    const limiter = new MemoryLoginAttemptLimiter();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        limiter.run("local.user", async (state) => {
          state.assertAllowed();
          await Promise.resolve();
          state.recordFailure();
          return "recorded";
        }),
      ),
    );

    expect(
      results.filter(
        (result) =>
          result.status === "fulfilled" && result.value === "recorded",
      ),
    ).toHaveLength(5);
    expect(
      results.filter(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof LoginRateLimitedError,
      ),
    ).toHaveLength(1);
  });

  it("keeps normalized usernames in independent buckets", async () => {
    const limiter = new MemoryLoginAttemptLimiter();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await limiter.run("first.user", async (state) => {
        state.assertAllowed();
        state.recordFailure();
      });
    }

    await expect(
      limiter.run("second.user", async (state) => state.assertAllowed()),
    ).resolves.toBeUndefined();
  });
});
