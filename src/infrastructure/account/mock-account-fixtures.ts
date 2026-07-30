function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const MOCK_EMPTY_ACCOUNTS_ENVELOPE = deepFreeze({ result: [] });

export const MOCK_SINGLE_ACCOUNT_ENVELOPE = deepFreeze({
  result: [
    {
      accountNo: "00000001234",
      accountSeq: 101,
      accountType: "BROKERAGE",
    },
  ],
});

export const MOCK_MULTIPLE_ACCOUNTS_ENVELOPE = deepFreeze({
  result: [
    {
      accountNo: "00000001234",
      accountSeq: 101,
      accountType: "BROKERAGE",
    },
    {
      accountNo: "00000005678",
      accountSeq: 202,
      accountType: "PENSION_SAVINGS",
    },
    {
      accountNo: "00000009012",
      accountSeq: 303,
      accountType: "FUTURE_ACCOUNT_TYPE",
    },
  ],
});

export const MOCK_MALFORMED_ACCOUNT_NO_ENVELOPE = deepFreeze({
  result: [
    {
      accountNo: "TEST-NOT-AN-ACCOUNT",
      accountSeq: 404,
      accountType: "BROKERAGE",
    },
  ],
});

export const MOCK_MALFORMED_ACCOUNT_SEQ_ENVELOPE = deepFreeze({
  result: [
    {
      accountNo: "00000004321",
      accountSeq: 0,
      accountType: "BROKERAGE",
    },
  ],
});

export const MOCK_ACCOUNT_ERROR_ENVELOPE = deepFreeze({
  error: {
    requestId: "mock-account-error",
    code: "service-unavailable",
    message: "Synthetic account provider failure.",
    data: {},
  },
});
