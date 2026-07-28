import { Writable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { parseServerEnvironment } from "../../src/infrastructure/config/environment";
import { createStructuredLogger } from "../../src/infrastructure/logging/server-logger";
import {
  createTokenManager,
  type OAuthTransport,
  type OAuthTransportRequest,
} from "../../src/infrastructure/toss/token-manager";

const CLIENT_ID = ["fixture", "oauth", "client"].join("-");
const CLIENT_SECRET = ["fixture", "oauth", "credential"].join("-");
const TOKEN_ONE = ["fixture", "oauth", "token", "one"].join("-");
const TOKEN_TWO = ["fixture", "oauth", "token", "two"].join("-");

function liveEnvironment() {
  return parseServerEnvironment({
    ALLOW_LIVE_TOSS_API: "true",
    ["TOSS_CLIENT_ID"]: CLIENT_ID,
    ["TOSS_CLIENT_SECRET"]: CLIENT_SECRET,
  });
}

function success(token: string, expiresIn = 120) {
  return {
    status: 200,
    body: JSON.stringify({
      access_token: token,
      token_type: "Bearer",
      expires_in: expiresIn,
    }),
  };
}

describe("server-only TokenManager", () => {
  it("reuses a valid token and refreshes at the frozen 60 second safety window", async () => {
    let now = 1_000_000;
    const issueToken = vi
      .fn<OAuthTransport["issueToken"]>()
      .mockResolvedValueOnce(success(TOKEN_ONE))
      .mockResolvedValueOnce(success(TOKEN_TWO));
    const manager = createTokenManager({
      environment: liveEnvironment(),
      transport: { issueToken },
      clock: () => now,
    });
    const consume = (token: string) => token;

    await expect(manager.withAccessToken(consume)).resolves.toBe(TOKEN_ONE);
    now += 59_999;
    await expect(manager.withAccessToken(consume)).resolves.toBe(TOKEN_ONE);
    now += 1;
    await expect(manager.withAccessToken(consume)).resolves.toBe(TOKEN_TWO);
    expect(issueToken).toHaveBeenCalledTimes(2);
  });

  it("sends the exact safe transport contract and supports invalidation", async () => {
    const requests: OAuthTransportRequest[] = [];
    const transport: OAuthTransport = {
      async issueToken(request) {
        requests.push(request);
        return success(requests.length === 1 ? TOKEN_ONE : TOKEN_TWO);
      },
    };
    const manager = createTokenManager({
      environment: liveEnvironment(),
      transport,
      clock: () => 0,
    });

    await manager.withAccessToken(() => undefined);
    manager.invalidate();
    await manager.withAccessToken(() => undefined);

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/oauth2/token",
      contentType: "application/x-www-form-urlencoded",
    });
    expect(new URLSearchParams(requests[0].body).get("grant_type")).toBe(
      "client_credentials",
    );
  });

  it("single-flights concurrent requests and gives every waiter the same token", async () => {
    let resolveResponse!: (value: ReturnType<typeof success>) => void;
    const issueToken = vi.fn(
      () =>
        new Promise<ReturnType<typeof success>>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const manager = createTokenManager({
      environment: liveEnvironment(),
      transport: { issueToken },
      clock: () => 0,
    });

    const first = manager.withAccessToken((token) => token);
    const second = manager.withAccessToken((token) => token);
    const third = manager.withAccessToken((token) => token);
    resolveResponse(success(TOKEN_ONE));

    await expect(Promise.all([first, second, third])).resolves.toEqual([
      TOKEN_ONE,
      TOKEN_ONE,
      TOKEN_ONE,
    ]);
    expect(issueToken).toHaveBeenCalledTimes(1);
  });

  it("shares a safe failure, clears in-flight state, and allows a later retry", async () => {
    let rejectResponse!: (reason: Error) => void;
    const issueToken = vi
      .fn<OAuthTransport["issueToken"]>()
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectResponse = reject;
          }),
      )
      .mockResolvedValueOnce(success(TOKEN_TWO));
    const manager = createTokenManager({
      environment: liveEnvironment(),
      transport: { issueToken },
      clock: () => 0,
    });
    const first = manager.withAccessToken((token) => token);
    const second = manager.withAccessToken((token) => token);
    rejectResponse(new Error("fixture transport details"));

    const failures = await Promise.allSettled([first, second]);
    expect(failures.every((failure) => failure.status === "rejected")).toBe(
      true,
    );
    for (const failure of failures) {
      if (failure.status === "rejected") {
        expect(failure.reason).toEqual(
          expect.objectContaining({
            code: "OAUTH_REQUEST_FAILED",
            category: "TRANSPORT",
            retryable: true,
          }),
        );
        expect(String(failure.reason)).not.toContain("transport details");
      }
    }
    await expect(manager.withAccessToken((token) => token)).resolves.toBe(
      TOKEN_TWO,
    );
    expect(issueToken).toHaveBeenCalledTimes(2);
  });

  it("converts OAuth and malformed responses to typed errors without retaining raw bodies", async () => {
    const responses = [
      {
        status: 401,
        body: JSON.stringify({
          error: "invalid_client",
          error_description: "fixture confidential upstream description",
        }),
      },
      {
        status: 200,
        body: "fixture malformed response body",
      },
    ];
    const manager = createTokenManager({
      environment: liveEnvironment(),
      transport: {
        issueToken: async () => responses.shift()!,
      },
      clock: () => 0,
    });

    await expect(
      manager.withAccessToken((token) => token),
    ).rejects.toMatchObject({
      code: "OAUTH_REQUEST_FAILED",
      category: "CLIENT_AUTHENTICATION",
      retryable: false,
      status: 401,
    });
    await expect(
      manager.withAccessToken((token) => token),
    ).rejects.toMatchObject({
      code: "OAUTH_RESPONSE_INVALID",
      category: "TRANSPORT",
      retryable: true,
    });
  });

  it("fails closed while live access is disabled without calling transport", async () => {
    const issueToken = vi.fn<OAuthTransport["issueToken"]>();
    const manager = createTokenManager({
      environment: parseServerEnvironment({ ALLOW_LIVE_TOSS_API: "false" }),
      transport: { issueToken },
    });

    await expect(manager.withAccessToken((token) => token)).rejects.toEqual(
      expect.objectContaining({
        code: "LIVE_TOSS_API_DISABLED",
        category: "CONFIGURATION",
      }),
    );
    expect(issueToken).not.toHaveBeenCalled();
  });

  it("logs only safe lifecycle metadata and never persists credential or token values", async () => {
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
      knownSecrets: [CLIENT_ID, CLIENT_SECRET, TOKEN_ONE],
      clock: () => new Date("2026-07-28T08:00:00.000Z"),
    });
    const manager = createTokenManager({
      environment: liveEnvironment(),
      transport: { issueToken: async () => success(TOKEN_ONE) },
      logger,
      clock: () => Date.parse("2026-07-28T08:00:00.000Z"),
    });

    await manager.withAccessToken(() => undefined);
    const output = chunks.join("");
    expect(output).toContain("toss.oauth.request.started");
    expect(output).toContain("toss.oauth.request.succeeded");
    expect(output).not.toContain(CLIENT_ID);
    expect(output).not.toContain(CLIENT_SECRET);
    expect(output).not.toContain(TOKEN_ONE);
  });
});
