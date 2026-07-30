import { describe, expect, it, vi } from "vitest";

import { maskAccountNo } from "../../src/domain/account/account";
import { decodeTossEnvelope } from "../../src/integrations/toss/envelope";
import { tossAccountListSchema } from "../../src/integrations/toss/account-schemas";
import { AccountRefRegistry } from "../../src/infrastructure/account/account-ref-registry";
import { createLiveAccountProvider } from "../../src/infrastructure/account/live-account-provider";
import {
  MOCK_EMPTY_ACCOUNTS_ENVELOPE,
  MOCK_MALFORMED_ACCOUNT_NO_ENVELOPE,
  MOCK_MALFORMED_ACCOUNT_SEQ_ENVELOPE,
  MOCK_MULTIPLE_ACCOUNTS_ENVELOPE,
  MOCK_SINGLE_ACCOUNT_ENVELOPE,
} from "../../src/infrastructure/account/mock-account-fixtures";
import { createMockAccountProvider } from "../../src/infrastructure/account/mock-account-provider";
import { selectAccountProvider } from "../../src/infrastructure/account/runtime-account-provider";
import { parseServerEnvironment } from "../../src/infrastructure/config/environment";
import type { ReadonlyTossClient } from "../../src/infrastructure/toss/readonly-http-client";

describe("Toss account decoder and providers", () => {
  it.each([
    ["empty", MOCK_EMPTY_ACCOUNTS_ENVELOPE, 0],
    ["single", MOCK_SINGLE_ACCOUNT_ENVELOPE, 1],
    ["multiple", MOCK_MULTIPLE_ACCOUNTS_ENVELOPE, 3],
  ])("decodes %s account arrays", (_label, fixture, count) => {
    const decoded = decodeTossEnvelope(fixture, tossAccountListSchema);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.result).toHaveLength(count);
  });

  it("preserves known and forward-compatible account types", async () => {
    const accounts = await createMockAccountProvider().getAccounts();
    expect(accounts.map(({ accountType }) => accountType)).toEqual([
      "BROKERAGE",
      "PENSION_SAVINGS",
      "FUTURE_ACCOUNT_TYPE",
    ]);
  });

  it.each([
    MOCK_MALFORMED_ACCOUNT_NO_ENVELOPE,
    MOCK_MALFORMED_ACCOUNT_SEQ_ENVELOPE,
    { result: [{ accountNo: "00000001234", accountSeq: 1.5, accountType: "BROKERAGE" }] },
    { result: [{ accountNo: "00000001234", accountSeq: Number.MAX_SAFE_INTEGER + 1, accountType: "BROKERAGE" }] },
  ])("rejects malformed account contracts", (fixture) => {
    expect(() => decodeTossEnvelope(fixture, tossAccountListSchema)).toThrow(
      "TOSS_ENVELOPE_DECODE_FAILED",
    );
  });

  it("isolates fixture and returned account mutation", async () => {
    const provider = createMockAccountProvider();
    const first = await provider.getAccounts();
    expect(() => {
      (first as unknown as { accountType: string }[])[0].accountType =
        "MUTATED";
    }).toThrow();
    const second = await provider.getAccounts();
    expect(second[0].accountType).toBe("BROKERAGE");
    expect(Object.isFrozen(MOCK_MULTIPLE_ACCOUNTS_ENVELOPE)).toBe(true);
  });

  it("maps only GET /api/v1/accounts without an account header", async () => {
    const get = vi.fn(async () => ({
      status: 200,
      data: MOCK_SINGLE_ACCOUNT_ENVELOPE,
    }));
    const client: ReadonlyTossClient = {
      get: get as unknown as ReadonlyTossClient["get"],
    };
    const accounts = await createLiveAccountProvider(client).getAccounts();
    expect(accounts).toEqual([
      {
        accountNo: "00000001234",
        accountSeq: 101,
        accountType: "BROKERAGE",
      },
    ]);
    expect(get).toHaveBeenCalledWith({
      path: "/api/v1/accounts",
      operation: "getAccounts",
    });
    expect(JSON.stringify(get.mock.calls)).not.toMatch(
      /X-Tossinvest-Account|authorization/i,
    );
  });

  it("does not construct the live provider while live access is disabled", () => {
    const live = vi.fn();
    const selection = selectAccountProvider(
      parseServerEnvironment({ ALLOW_LIVE_TOSS_API: "false" }),
      { mock: createMockAccountProvider(), live },
    );
    expect(selection.name).toBe("mock");
    expect(live).not.toHaveBeenCalled();
  });
});

describe("account masking and process-memory references", () => {
  it("uses a fixed mask and exposes only the final four digits", () => {
    expect(maskAccountNo("00000001234")).toBe("*******1234");
    expect(() => maskAccountNo("1234")).toThrow("ACCOUNT_CONTRACT_ERROR");
    expect(() => maskAccountNo("00000-01234")).toThrow(
      "ACCOUNT_CONTRACT_ERROR",
    );
  });

  it("keeps opaque references stable per session and isolated across scopes", () => {
    let index = 0;
    const registry = new AccountRefRegistry(
      () => `acct_fixture_reference_${++index}`,
    );
    const accounts = [
      {
        accountNo: "00000001234",
        accountSeq: 101,
        accountType: "BROKERAGE",
      },
    ];
    const first = registry.reconcile("user-a:session-a", accounts).get(101);
    const repeated = registry
      .reconcile("user-a:session-a", accounts)
      .get(101);
    const otherSession = registry
      .reconcile("user-a:session-b", accounts)
      .get(101);
    const otherUser = registry
      .reconcile("user-b:session-c", accounts)
      .get(101);

    expect(first).toBe(repeated);
    expect(new Set([first, otherSession, otherUser]).size).toBe(3);
    expect(first).not.toContain("101");
    expect(registry.resolve("user-a:session-b", first!)).toBeUndefined();
    expect(registry.resolve("user-a:session-a", first!)).toBe(101);
  });

  it("removes stale account mappings without changing retained references", () => {
    let index = 0;
    const registry = new AccountRefRegistry(
      () => `acct_fixture_cleanup_${++index}`,
    );
    const original = registry.reconcile("scope", [
      { accountNo: "00000001234", accountSeq: 101, accountType: "BROKERAGE" },
      { accountNo: "00000005678", accountSeq: 202, accountType: "BROKERAGE" },
    ]);
    const reconciled = registry.reconcile("scope", [
      { accountNo: "00000001234", accountSeq: 101, accountType: "BROKERAGE" },
    ]);
    expect(reconciled.get(101)).toBe(original.get(101));
    expect(registry.resolve("scope", original.get(202)!)).toBeUndefined();
  });

  it("rejects duplicate sequence values and non-opaque references", () => {
    const duplicate = [
      { accountNo: "00000001234", accountSeq: 101, accountType: "BROKERAGE" },
      { accountNo: "00000005678", accountSeq: 101, accountType: "BROKERAGE" },
    ];
    expect(() =>
      new AccountRefRegistry(() => "acct_valid_reference_value").reconcile(
        "scope",
        duplicate,
      ),
    ).toThrow("ACCOUNT_CONTRACT_ERROR");
    expect(() =>
      new AccountRefRegistry(() => "101").reconcile("scope", [duplicate[0]]),
    ).toThrow("ACCOUNT_CONTRACT_ERROR");
  });
});
