import { Writable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { parseServerEnvironment } from "../../src/infrastructure/config/environment";
import { createStructuredLogger } from "../../src/infrastructure/logging/server-logger";
import {
  createReadonlyTossClient,
  type TimeoutScheduler,
  type TossHttpTransport,
  type TossHttpTransportResponse,
} from "../../src/infrastructure/toss/readonly-http-client";
import {
  createTokenManager,
  type OAuthTransport,
  type TokenManager,
} from "../../src/infrastructure/toss/token-manager";

const FIRST_TOKEN = ["fixture", "readonly", "first"].join("-");
const SECOND_TOKEN = ["fixture", "readonly", "second"].join("-");
const CLIENT_ID = ["fixture", "client", "0303"].join("-");
const CLIENT_SECRET = ["fixture", "credential", "0303"].join("-");

function environment(timeoutMs = 8_000) {
  return parseServerEnvironment({
    ALLOW_LIVE_TOSS_API: "true",
    ["TOSS_CLIENT_ID"]: CLIENT_ID,
    ["TOSS_CLIENT_SECRET"]: CLIENT_SECRET,
    REQUEST_TIMEOUT_GET_MS: String(timeoutMs),
  });
}

function jsonResponse(
  status: number,
  body: unknown = { result: {} },
  headers: Record<string, string> = {},
): TossHttpTransportResponse {
  return {
    status,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}

function rotatingTokenManager(tokens = [FIRST_TOKEN, SECOND_TOKEN]) {
  let index = 0;
  const invalidate = vi.fn((expected?: string) => {
    if (expected === undefined || expected === tokens[index]) index += 1;
  });
  const manager: TokenManager = {
    withAccessToken: async (consumer) => consumer(tokens[index]),
    invalidate,
  };
  return { manager, invalidate };
}

class ManualScheduler implements TimeoutScheduler {
  readonly entries: Array<{
    callback: () => void;
    delayMs: number;
    cancelled: boolean;
  }> = [];

  schedule(callback: () => void, delayMs: number): unknown {
    const entry = { callback, delayMs, cancelled: false };
    this.entries.push(entry);
    return entry;
  }

  cancel(handle: unknown): void {
    (handle as (typeof this.entries)[number]).cancelled = true;
  }

  fire(index = 0) {
    this.entries[index].callback();
  }
}

async function waitForScheduledTimer(scheduler: ManualScheduler) {
  for (let index = 0; index < 10 && scheduler.entries.length === 0; index++) {
    await Promise.resolve();
  }
  expect(scheduler.entries).toHaveLength(1);
}

describe("readonly Toss HTTP resilience", () => {
  it("times out through AbortController and always clears the timer", async () => {
    const scheduler = new ManualScheduler();
    const send = vi.fn<TossHttpTransport["send"]>(
      (request) =>
        new Promise((_, reject) => {
          request.signal.addEventListener("abort", () =>
            reject(new Error("fixture aborted transport")),
          );
        }),
    );
    const { manager } = rotatingTokenManager();
    const client = createReadonlyTossClient({
      environment: environment(1234),
      tokenManager: manager,
      transport: { send },
      scheduler,
    });

    const result = client.get({
      path: "/api/v1/prices",
      operation: "getPrices",
    });
    await waitForScheduledTimer(scheduler);
    expect(scheduler.entries[0].delayMs).toBe(1234);
    scheduler.fire();

    await expect(result).rejects.toMatchObject({
      code: "TOSS_GET_TIMEOUT",
      retryable: true,
    });
    expect(scheduler.entries[0].cancelled).toBe(true);
    expect(send.mock.calls[0][0].signal.aborted).toBe(true);
  });

  it("distinguishes caller abort and does not start an already-aborted request", async () => {
    const scheduler = new ManualScheduler();
    const controller = new AbortController();
    const send = vi.fn<TossHttpTransport["send"]>(
      (request) =>
        new Promise((_, reject) => {
          request.signal.addEventListener("abort", () =>
            reject(new Error("fixture caller abort")),
          );
        }),
    );
    const { manager } = rotatingTokenManager();
    const client = createReadonlyTossClient({
      environment: environment(),
      tokenManager: manager,
      transport: { send },
      scheduler,
    });

    const result = client.get({
      path: "/api/v1/prices",
      operation: "getPrices",
      signal: controller.signal,
    });
    await waitForScheduledTimer(scheduler);
    controller.abort();
    await expect(result).rejects.toMatchObject({
      code: "TOSS_GET_ABORTED",
      retryable: false,
    });
    expect(scheduler.entries[0].cancelled).toBe(true);

    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expect(
      client.get({
        path: "/api/v1/prices",
        operation: "getPrices",
        signal: alreadyAborted.signal,
      }),
    ).rejects.toMatchObject({ code: "TOSS_GET_ABORTED" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(scheduler.entries).toHaveLength(1);
  });

  it("maps ordinary transport rejection to a safe network error", async () => {
    const { manager } = rotatingTokenManager();
    const client = createReadonlyTossClient({
      environment: environment(),
      tokenManager: manager,
      transport: {
        send: async () => {
          throw new Error("fixture network internals");
        },
      },
    });

    let error: unknown;
    try {
      await client.get({
        path: "/api/v1/prices",
        operation: "getPrices",
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      code: "TOSS_GET_NETWORK_FAILURE",
      retryable: true,
    });
    expect(String(error)).not.toContain("network internals");
    expect((error as Error).stack).toBeUndefined();
  });

  it("invalidates the first token and retries a 401 exactly once with a new token", async () => {
    const requests: string[] = [];
    const { manager, invalidate } = rotatingTokenManager();
    const client = createReadonlyTossClient({
      environment: environment(),
      tokenManager: manager,
      transport: {
        send: async (request) => {
          requests.push(request.headers.authorization);
          return requests.length === 1
            ? jsonResponse(401, { error: {} })
            : jsonResponse(200, { result: { ok: true } });
        },
      },
    });

    await expect(
      client.get({
        path: "/api/v1/prices",
        operation: "getPrices",
      }),
    ).resolves.toMatchObject({ data: { result: { ok: true } } });
    expect(requests).toHaveLength(2);
    expect(requests[0]).not.toBe(requests[1]);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith(FIRST_TOKEN);
  });

  it("fails after a second 401 without a third request", async () => {
    const { manager, invalidate } = rotatingTokenManager();
    const send = vi.fn<TossHttpTransport["send"]>(async () =>
      jsonResponse(401, { error: {} }, { "x-request-id": "fixture-401" }),
    );
    const client = createReadonlyTossClient({
      environment: environment(),
      tokenManager: manager,
      transport: { send },
    });

    await expect(
      client.get({
        path: "/api/v1/prices",
        operation: "getPrices",
      }),
    ).rejects.toMatchObject({
      code: "TOSS_GET_AUTHENTICATION_FAILED",
      status: 401,
      retryable: false,
      requestId: "fixture-401",
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it.each([400, 403, 404, 409, 500])(
    "does not invalidate tokens for HTTP %s",
    async (status) => {
      const { manager, invalidate } = rotatingTokenManager();
      const send = vi.fn<TossHttpTransport["send"]>(async () =>
        jsonResponse(status),
      );
      const client = createReadonlyTossClient({
        environment: environment(),
        tokenManager: manager,
        transport: { send },
      });

      await expect(
        client.get({
          path: "/api/v1/prices",
          operation: "getPrices",
        }),
      ).rejects.toMatchObject({
        code: "TOSS_GET_HTTP_ERROR",
        status,
      });
      expect(invalidate).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledTimes(1);
    },
  );

  it("preserves TokenManager single-flight across concurrent 401 responses", async () => {
    let issued = 0;
    const issueToken = vi.fn<OAuthTransport["issueToken"]>(async () => {
      issued += 1;
      return {
        status: 200,
        body: JSON.stringify({
          access_token: issued === 1 ? FIRST_TOKEN : SECOND_TOKEN,
          token_type: "Bearer",
          expires_in: 120,
        }),
      };
    });
    const manager = createTokenManager({
      environment: environment(),
      transport: { issueToken },
      clock: () => 0,
    });
    const firstTokenRequests: Array<() => void> = [];
    const send = vi.fn<TossHttpTransport["send"]>(async (request) =>
      request.headers.authorization.endsWith(FIRST_TOKEN)
        ? new Promise((resolve) => {
            firstTokenRequests.push(() =>
              resolve(jsonResponse(401, { error: {} })),
            );
          })
        : jsonResponse(200),
    );
    const client = createReadonlyTossClient({
      environment: environment(),
      tokenManager: manager,
      transport: { send },
    });

    const first = client.get({
      path: "/api/v1/prices",
      operation: "getPrices",
    });
    const second = client.get({
      path: "/api/v1/stocks",
      operation: "getStocks",
    });
    for (let index = 0; index < 10 && firstTokenRequests.length < 2; index++) {
      await Promise.resolve();
    }
    expect(firstTokenRequests).toHaveLength(2);
    firstTokenRequests[0]();
    await Promise.resolve();
    firstTokenRequests[1]();

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(issueToken).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["5", 5_000, true],
    [undefined, undefined, false],
    ["invalid", undefined, false],
    ["-1", undefined, false],
    ["Wed, 21 Oct 2015 07:28:00 GMT", undefined, false],
    [String(Number.MAX_SAFE_INTEGER), undefined, false],
  ])(
    "fails closed on 429 Retry-After %s without automatic retry",
    async (retryAfter, expectedMs, retryable) => {
      const { manager, invalidate } = rotatingTokenManager();
      const send = vi.fn<TossHttpTransport["send"]>(async () =>
        jsonResponse(
          429,
          { error: { detail: "fixture raw upstream detail" } },
          retryAfter === undefined ? {} : { "retry-after": retryAfter },
        ),
      );
      const client = createReadonlyTossClient({
        environment: environment(),
        tokenManager: manager,
        transport: { send },
      });

      let error: unknown;
      try {
        await client.get({
          path: "/api/v1/prices",
          operation: "getPrices",
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({
        code: "TOSS_GET_RATE_LIMITED",
        status: 429,
        retryable,
      });
      expect((error as { retryAfterMs?: number }).retryAfterMs).toBe(
        expectedMs,
      );
      expect(JSON.stringify(error)).not.toContain("raw upstream detail");
      expect(send).toHaveBeenCalledTimes(1);
      expect(invalidate).not.toHaveBeenCalled();
    },
  );

  it("logs safe metadata without URL, query, credentials, or token substrings", async () => {
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
      knownSecrets: [CLIENT_ID, CLIENT_SECRET, FIRST_TOKEN],
      clock: () => new Date("2026-07-28T09:00:00.000Z"),
    });
    const { manager } = rotatingTokenManager();
    const client = createReadonlyTossClient({
      environment: environment(),
      tokenManager: manager,
      transport: { send: async () => jsonResponse(200) },
      logger,
      clock: () => 0,
    });

    await client.get({
      path: "/api/v1/prices",
      operation: "getPrices",
      query: { symbols: "fixture-query-marker" },
    });
    const output = chunks.join("");
    expect(output).toContain("toss.get.request.started");
    expect(output).toContain("toss.get.request.succeeded");
    expect(output).not.toContain("fixture-query-marker");
    expect(output).not.toContain(CLIENT_ID);
    expect(output).not.toContain(CLIENT_SECRET);
    expect(output).not.toContain(FIRST_TOKEN);
    expect(output).not.toContain("Bearer");
  });

  it("continues the GET flow when the structured logger cannot prepare a record", async () => {
    const logger = createStructuredLogger({
      level: "info",
      clock() {
        throw new Error("fixture logger failure");
      },
    });
    const { manager } = rotatingTokenManager();
    const client = createReadonlyTossClient({
      environment: environment(),
      tokenManager: manager,
      transport: { send: async () => jsonResponse(200) },
      logger,
    });

    await expect(
      client.get({
        path: "/api/v1/prices",
        operation: "getPrices",
      }),
    ).resolves.toMatchObject({ status: 200 });
  });
});
