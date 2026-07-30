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
    withAccessToken: async (consumer) =>
      consumer("fixture-holdings-token"),
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
});
