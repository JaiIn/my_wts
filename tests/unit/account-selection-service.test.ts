import { describe, expect, it, vi } from "vitest";

import {
  AccountReferenceInvalidError,
  AccountSelectionService,
  type AccountSelectionPersistence,
} from "../../src/application/account/account-selection-service";
import { AccountRefRegistry } from "../../src/infrastructure/account/account-ref-registry";
import { hashCanonicalSessionToken } from "../../src/domain/auth/session-token";

const TOKEN_A = Buffer.alloc(32, 71).toString("base64url");
const TOKEN_B = Buffer.alloc(32, 72).toString("base64url");
const USER_ID = "usr_selection";
const ACCOUNT = {
  accountNo: "00000001234",
  accountSeq: 101,
  accountType: "BROKERAGE",
} as const;

function fixture(token = TOKEN_A) {
  const values = new Map<string, string | null>([
    [hashCanonicalSessionToken(TOKEN_A)!, null],
    [hashCanonicalSessionToken(TOKEN_B)!, null],
  ]);
  const persistence: AccountSelectionPersistence = {
    findSelection(tokenHash) {
      return values.get(tokenHash);
    },
    updateSelection(tokenHash, _userId, accountRef) {
      if (!values.has(tokenHash)) return false;
      values.set(tokenHash, accountRef);
      return true;
    },
  };
  let referenceIndex = 0;
  const registry = new AccountRefRegistry(() =>
    `acct_selection_reference_${++referenceIndex}`.padEnd(32, "0"),
  );
  const service = new AccountSelectionService(
    {
      authenticate: () => ({
        id: USER_ID,
        username: "user",
        displayName: "User",
      }),
    },
    persistence,
    registry,
  );
  const context = service.authenticate(token);
  const accountRef = registry
    .reconcile(context.sessionScope, [ACCOUNT])
    .get(ACCOUNT.accountSeq)!;
  return { service, registry, persistence, values, context, accountRef };
}

describe("account selection service", () => {
  it("selects, reselects idempotently, changes, and clears current session only", () => {
    const { service, values, accountRef } = fixture();
    service.select(TOKEN_A, accountRef);
    expect(service.resolveCurrent(service.authenticate(TOKEN_A))).toEqual({
      accountRef,
      accountSeq: 101,
    });
    service.select(TOKEN_A, accountRef);
    expect(values.get(hashCanonicalSessionToken(TOKEN_B)!)).toBeNull();
    service.clear(TOKEN_A);
    expect(service.resolveCurrent(service.authenticate(TOKEN_A))).toBeNull();
  });

  it("rejects arbitrary, stale, other-user, and other-session references uniformly", () => {
    const { service, registry, accountRef } = fixture();
    const otherContext = service.authenticate(TOKEN_B);
    registry.reconcile(otherContext.sessionScope, [ACCOUNT]);
    for (const candidate of [
      "invalid ref",
      "acct_unknown_reference_000000000",
      accountRef,
    ]) {
      expect(() => service.select(TOKEN_B, candidate)).toThrow(
        AccountReferenceInvalidError,
      );
    }
    const otherUserService = new AccountSelectionService(
      {
        authenticate: () => ({
          id: "usr_other",
          username: "other",
          displayName: "Other",
        }),
      },
      {
        findSelection: vi.fn(() => null),
        updateSelection: vi.fn(() => true),
      },
      registry,
    );
    expect(() => otherUserService.select(TOKEN_A, accountRef)).toThrow(
      AccountReferenceInvalidError,
    );
  });

  it("clears a stale DB reference after a process restart without losing authentication", () => {
    const { service, values, accountRef, context } = fixture();
    service.select(TOKEN_A, accountRef);
    const restarted = new AccountSelectionService(
      {
        authenticate: () => ({
          id: USER_ID,
          username: "user",
          displayName: "User",
        }),
      },
      {
        findSelection: vi.fn(() =>
          values.get(hashCanonicalSessionToken(TOKEN_A)!),
        ),
        updateSelection: vi.fn((_tokenHash, _userId, value) => {
          values.set(hashCanonicalSessionToken(TOKEN_A)!, value);
          return true;
        }),
      },
      new AccountRefRegistry(),
    );
    expect(restarted.resolveCurrent(context)).toBeNull();
    expect(values.get(hashCanonicalSessionToken(TOKEN_A)!)).toBeNull();
  });

  it("uses opaque references that do not reveal the account sequence", () => {
    const { accountRef } = fixture();
    expect(accountRef).not.toContain(String(ACCOUNT.accountSeq));
    expect(accountRef).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
  });
});
