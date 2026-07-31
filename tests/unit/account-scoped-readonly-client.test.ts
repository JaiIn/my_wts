import { describe, expect, it, vi } from "vitest";

import { parseServerEnvironment } from "../../src/infrastructure/config/environment";
import {
  createReadonlyTossClient,
  type TossHttpTransport,
} from "../../src/infrastructure/toss/readonly-http-client";
import type { TokenManager } from "../../src/infrastructure/toss/token-manager";

function client(send: TossHttpTransport["send"]) {
  const clientId = ["fixture", "holdings", "client"].join("-");
  const clientSecret = ["fixture", "holdings", "credential"].join("-");
  const tokenManager: TokenManager = {
    withAccessToken: async (consumer) => consumer("fixture-holdings-token"),
    invalidate: vi.fn(),
  };
  return createReadonlyTossClient({
    environment: parseServerEnvironment({
      ALLOW_LIVE_TOSS_API: "true",
      ["TOSS_CLIENT_ID"]: clientId,
      ["TOSS_CLIENT_SECRET"]: clientSecret,
      REQUEST_TIMEOUT_GET_MS: "1000",
    }),
    tokenManager,
    transport: { send },
  });
}

describe("account-scoped readonly client", () => {
  it("internally creates the account header only for holdings", async () => {
    const send = vi.fn<TossHttpTransport["send"]>().mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ result: {} }),
    });
    await client(send).getAccountScoped({
      path: "/api/v1/holdings",
      operation: "getHoldings",
      accountSeq: 101,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].method).toBe("GET");
    expect(send.mock.calls[0]![0].headers["x-tossinvest-account"]).toBe("101");
  });

  it("allows only the account-scoped GET order history operation", async () => {
    const send = vi.fn<TossHttpTransport["send"]>().mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ result: { orders: [] } }),
    });
    await client(send).getAccountScoped({
      path: "/api/v1/orders",
      operation: "getOrders",
      accountSeq: 101,
      query: {
        status: "CLOSED",
        cursor: "opaque+cursor=",
        limit: "20",
      },
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({
      method: "GET",
      url: expect.stringContaining("/api/v1/orders?"),
      headers: expect.objectContaining({
        "x-tossinvest-account": "101",
      }),
    });
  });

  it("allows an encoded-safe order detail GET and rejects mutation-like paths", async () => {
    const send = vi.fn<TossHttpTransport["send"]>().mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ result: {} }),
    });
    await client(send).getAccountScoped({
      path: "/api/v1/orders/opaque_Order-123",
      operation: "getOrder",
      accountSeq: 101,
    });
    expect(send.mock.calls[0]![0]).toMatchObject({
      method: "GET",
      url: expect.stringMatching(/\/api\/v1\/orders\/opaque_Order-123$/),
    });

    const blocked = vi.fn<TossHttpTransport["send"]>();
    await expect(
      client(blocked).getAccountScoped({
        path: "/api/v1/orders/opaque/modify",
        operation: "getOrder",
        accountSeq: 101,
      } as never),
    ).rejects.toMatchObject({ code: "TOSS_GET_PATH_NOT_ALLOWED" });
    expect(blocked).not.toHaveBeenCalled();
  });

  it("allows only conditional history GET list/detail paths", async () => {
    const send = vi.fn<TossHttpTransport["send"]>().mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ result: {} }),
    });
    const readonly = client(send);
    await readonly.getAccountScoped({
      path: "/api/v1/conditional-orders",
      operation: "getConditionalOrders",
      accountSeq: 101,
      query: { status: "OPEN", limit: "20" },
    });
    await readonly.getAccountScoped({
      path: "/api/v1/conditional-orders/opaque_Conditional-123",
      operation: "getConditionalOrder",
      accountSeq: 101,
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0]).toMatchObject({
      method: "GET",
      url: expect.stringMatching(
        /\/api\/v1\/conditional-orders\/opaque_Conditional-123$/,
      ),
    });

    for (const path of [
      "/api/v1/conditional-orders/opaque/modify",
      "/api/v1/conditional-orders/opaque/cancel",
      "/api/v1/conditional-orders/%2Fencoded",
    ]) {
      const blocked = vi.fn<TossHttpTransport["send"]>();
      await expect(
        client(blocked).getAccountScoped({
          path,
          operation: "getConditionalOrder",
          accountSeq: 101,
        } as never),
      ).rejects.toMatchObject({ code: "TOSS_GET_PATH_NOT_ALLOWED" });
      expect(blocked).not.toHaveBeenCalled();
    }
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid account scope before transport: %s",
    async (accountSeq) => {
      const send = vi.fn<TossHttpTransport["send"]>();
      await expect(
        client(send).getAccountScoped({
          path: "/api/v1/holdings",
          operation: "getHoldings",
          accountSeq,
        }),
      ).rejects.toMatchObject({ code: "TOSS_GET_HEADER_NOT_ALLOWED" });
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("rejects mismatched account-scoped operation and path before transport", async () => {
    const send = vi.fn<TossHttpTransport["send"]>();
    await expect(
      client(send).getAccountScoped({
        path: "/api/v1/commissions",
        operation: "getBuyingPower",
        accountSeq: 101,
      } as never),
    ).rejects.toMatchObject({ code: "TOSS_GET_PATH_NOT_ALLOWED" });
    expect(send).not.toHaveBeenCalled();
  });
});
