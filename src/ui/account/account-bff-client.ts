"use client";

export type BffAccount = Readonly<{
  accountRef: string;
  maskedAccountNo: string;
  accountType: string;
  selected: false;
}>;

export class AccountBffError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly requestId?: string,
  ) {
    super("ACCOUNT_BFF_REQUEST_FAILED");
    this.name = "AccountBffError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeAccount(value: unknown): BffAccount {
  if (!isRecord(value)) {
    throw new AccountBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  const keys = Object.keys(value);
  if (
    keys.some(
      (key) =>
        !["accountRef", "maskedAccountNo", "accountType", "selected"].includes(
          key,
        ),
    ) ||
    typeof value.accountRef !== "string" ||
    value.accountRef.length < 16 ||
    value.accountRef.length > 128 ||
    typeof value.maskedAccountNo !== "string" ||
    !/^\*{7}\d{4}$/.test(value.maskedAccountNo) ||
    typeof value.accountType !== "string" ||
    value.accountType.length < 1 ||
    value.accountType.length > 128 ||
    value.selected !== false
  ) {
    throw new AccountBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return Object.freeze({
    accountRef: value.accountRef,
    maskedAccountNo: value.maskedAccountNo,
    accountType: value.accountType,
    selected: false,
  });
}

export async function getAccounts(signal?: AbortSignal): Promise<
  readonly BffAccount[]
> {
  const response = await fetch("/api/v1/accounts", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  let body: unknown;
  try {
    if (
      !response.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      throw new Error("INVALID_CONTENT_TYPE");
    }
    body = await response.json();
  } catch {
    throw new AccountBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  if (!isRecord(body)) {
    throw new AccountBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  if (!response.ok) {
    const error = isRecord(body.error) ? body.error : {};
    throw new AccountBffError(
      typeof error.code === "string" ? error.code : "BFF_REQUEST_FAILED",
      response.status,
      error.retryable === true,
      typeof error.requestId === "string" ? error.requestId : undefined,
    );
  }
  const data = isRecord(body.data) ? body.data : undefined;
  if (!data || !Array.isArray(data.accounts)) {
    throw new AccountBffError("INVALID_BFF_RESPONSE", 502, false);
  }
  return Object.freeze(data.accounts.map(decodeAccount));
}
