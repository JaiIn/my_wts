export const KNOWN_ACCOUNT_TYPES = [
  "BROKERAGE",
  "OVERSEAS_DERIVATIVES",
  "PENSION_SAVINGS",
  "RESHORING_INVESTMENT",
] as const;

export type KnownAccountType = (typeof KNOWN_ACCOUNT_TYPES)[number];

export type Account = Readonly<{
  accountNo: string;
  accountSeq: number;
  accountType: string;
}>;

export type PublicAccount = Readonly<{
  accountRef: string;
  maskedAccountNo: string;
  accountType: string;
  selected: boolean;
}>;

export function isKnownAccountType(value: string): value is KnownAccountType {
  return KNOWN_ACCOUNT_TYPES.includes(value as KnownAccountType);
}

export function isCanonicalAccountRef(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

export function maskAccountNo(accountNo: string): string {
  if (!/^\d{11}$/.test(accountNo)) {
    throw new AccountContractError("INVALID_ACCOUNT_NO");
  }
  return `*******${accountNo.slice(-4)}`;
}

export class AccountContractError extends Error {
  constructor(
    readonly code:
      | "INVALID_ACCOUNT_NO"
      | "INVALID_ACCOUNT_SEQUENCE"
      | "INVALID_ACCOUNT_REFERENCE",
  ) {
    super("ACCOUNT_CONTRACT_ERROR");
    this.name = "AccountContractError";
  }
}
