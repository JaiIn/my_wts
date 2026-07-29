import { describe, expect, it, vi } from "vitest";

import { parseServerEnvironment } from "../../src/infrastructure/config/environment";
import {
  createReadonlyTossClient,
  type TossHttpTransport,
} from "../../src/infrastructure/toss/readonly-http-client";
import type { TokenManager } from "../../src/infrastructure/toss/token-manager";

const FIXTURE_TOKEN = ["fixture", "readonly", "value"].join("-");

function environment() {
  return parseServerEnvironment({
    ALLOW_LIVE_TOSS_API: "true",
    ["TOSS_CLIENT_ID"]: ["fixture", "client"].join("-"),
    ["TOSS_CLIENT_SECRET"]: ["fixture", "credential"].join("-"),
  });
}

function tokenManager(): TokenManager {
  return {
    withAccessToken: async (consumer) => consumer(FIXTURE_TOKEN),
    invalidate: vi.fn(),
  };
}

function createClient(transport: TossHttpTransport) {
  return createReadonlyTossClient({
    environment: environment(),
    tokenManager: tokenManager(),
    transport,
  });
}

describe("readonly Toss HTTP contract", () => {
  it("performs an approved GET with exact query encoding and internal headers", async () => {
    const send = vi.fn<TossHttpTransport["send"]>(async () => ({
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Request-Id": "fixture-request-0303",
      },
      body: JSON.stringify({ result: { ok: true } }),
    }));
    const client = createClient({ send });

    const result = await client.get({
      path: "/api/v1/prices",
      operation: "getPrices",
      query: {
        symbols: ["005930", "A+PL", "한 글"],
        cursor: "",
        omitted: undefined,
      },
    });

    expect(result).toEqual({
      status: 200,
      data: { result: { ok: true } },
      requestId: "fixture-request-0303",
    });
    expect(send).toHaveBeenCalledTimes(1);
    const request = send.mock.calls[0][0];
    expect(request.method).toBe("GET");
    expect(request.url).toBe(
      "https://openapi.tossinvest.com/api/v1/prices?symbols=005930&symbols=A%2BPL&symbols=%ED%95%9C+%EA%B8%80&cursor=",
    );
    expect(request.headers.accept).toBe("application/json");
    expect(request.headers.authorization).toMatch(/^Bearer /);
  });

  it.each([
    ["POST", "/api/v1/prices"],
    ["PATCH", "/api/v1/prices"],
    ["DELETE", "/api/v1/orders/fixture"],
  ])("fails closed for mutation method %s", async (method, path) => {
    const send = vi.fn<TossHttpTransport["send"]>();
    const client = createClient({ send });

    await expect(
      client.get({
        method,
        path,
        operation: "fixtureMutation",
      } as never),
    ).rejects.toMatchObject({ code: "TOSS_GET_METHOD_REQUIRED" });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    "https://openapi.tossinvest.com/api/v1/prices",
    "//example.invalid/api/v1/prices",
    "/api/v1/../oauth2/token",
    "/api/v1/%2e%2e/oauth2/token",
    "/api\\v1\\prices",
    "/api/v1/orders/fixture/modify",
    "/oauth2/token",
    "/api/v1/not-approved",
  ])("rejects origin and path bypass input: %s", async (path) => {
    const send = vi.fn<TossHttpTransport["send"]>();
    const client = createClient({ send });

    await expect(
      client.get({ path, operation: "getFixture" }),
    ).rejects.toMatchObject({ code: "TOSS_GET_PATH_NOT_ALLOWED" });
    expect(send).not.toHaveBeenCalled();
  });

  it("accepts only frozen exact and parameterized GET endpoints", async () => {
    const send = vi.fn<TossHttpTransport["send"]>(async () => ({
      status: 200,
      headers: { "content-type": "application/json" },
      body: "{}",
    }));
    const client = createClient({ send });

    for (const path of [
      "/api/v1/stocks/005930/warnings",
      "/api/v1/market-indicators/KOSPI/candles",
      "/api/v1/orders/order_fixture",
      "/api/v1/conditional-orders/conditional_fixture",
      "/api/v1/accounts",
      "/api/v1/commissions",
    ]) {
      await expect(
        client.get({ path, operation: "getFixture" }),
      ).resolves.toMatchObject({ status: 200 });
    }
    expect(send).toHaveBeenCalledTimes(6);
  });

  it("rejects every caller-provided header before acquiring a token", async () => {
    const send = vi.fn<TossHttpTransport["send"]>();
    let tokenRequested = false;
    const withAccessToken: TokenManager["withAccessToken"] = async (
      consumer,
    ) => {
      tokenRequested = true;
      return consumer(FIXTURE_TOKEN);
    };
    const client = createReadonlyTossClient({
      environment: environment(),
      tokenManager: {
        withAccessToken,
        invalidate: vi.fn(),
      },
      transport: { send },
    });

    for (const headerName of ["Authorization", "Cookie", "Host", "Accept"]) {
      await expect(
        client.get({
          path: "/api/v1/prices",
          operation: "getPrices",
          headers: { [headerName]: "fixture override" },
        }),
      ).rejects.toMatchObject({ code: "TOSS_GET_HEADER_NOT_ALLOWED" });
    }
    expect(tokenRequested).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("distinguishes text from JSON and rejects malformed response contracts", async () => {
    const responses = [
      {
        status: 200,
        headers: { "content-type": "text/plain" },
        body: "fixture text",
      },
      {
        status: 200,
        headers: { "content-type": "text/html" },
        body: "<fixture>",
      },
      {
        status: 200,
        headers: { "content-type": "application/json" },
        body: "{malformed",
      },
    ];
    const client = createClient({
      send: async () => responses.shift()!,
    });

    await expect(
      client.get<string>({
        path: "/api/v1/prices",
        operation: "getPrices",
        responseType: "text",
      }),
    ).resolves.toMatchObject({ data: "fixture text" });
    await expect(
      client.get({
        path: "/api/v1/prices",
        operation: "getPrices",
      }),
    ).rejects.toMatchObject({
      code: "TOSS_GET_UNEXPECTED_CONTENT_TYPE",
      status: 200,
    });
    await expect(
      client.get({
        path: "/api/v1/prices",
        operation: "getPrices",
      }),
    ).rejects.toMatchObject({
      code: "TOSS_GET_MALFORMED_JSON",
      status: 200,
    });
  });

  it("rejects unsafe query shapes and oversized responses", async () => {
    const send = vi.fn<TossHttpTransport["send"]>(async () => ({
      status: 200,
      headers: { "content-type": "application/json" },
      body: `"${"x".repeat(1_048_577)}"`,
    }));
    const client = createClient({ send });

    await expect(
      client.get({
        path: "/api/v1/prices",
        operation: "getPrices",
        query: { symbols: [] },
      }),
    ).rejects.toMatchObject({ code: "TOSS_GET_QUERY_INVALID" });
    await expect(
      client.get({
        path: "/api/v1/prices",
        operation: "getPrices",
      }),
    ).rejects.toMatchObject({ code: "TOSS_GET_RESPONSE_TOO_LARGE" });
  });
});
