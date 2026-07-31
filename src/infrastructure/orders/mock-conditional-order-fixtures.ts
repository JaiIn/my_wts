function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function leg(
  type: string,
  status: string,
  index: number,
  triggeredOrderId: string | null = null,
) {
  return {
    type,
    status,
    triggerPrice: type === "STOP" ? `${1000 + index}.0001` : null,
    targetProfitRate: type === "PROFIT_RATE" ? `${index}.500001` : null,
    orderPrice: index % 3 === 0 ? null : `${999 + index}.0001`,
    triggeredOrderId,
  };
}

function conditionalOrder(
  conditionalOrderId: string,
  type: string,
  status: string,
  index: number,
  options: {
    second?: unknown;
    expireDate?: string;
    market?: string;
    orderType?: string;
    symbol?: string;
  } = {},
) {
  return {
    conditionalOrderId,
    type,
    status,
    symbol: options.symbol ?? (index % 2 === 0 ? "000001" : "TSTX"),
    market: options.market ?? (index % 2 === 0 ? "KR" : "US"),
    quantity:
      index === 7
        ? "999999999999999999999999.99999"
        : index === 6
          ? "0"
          : `10.${String(index).padStart(6, "0")}`,
    orderType: options.orderType ?? (index % 3 === 0 ? "MARKET" : "LIMIT"),
    ...(options.expireDate === undefined
      ? {}
      : { expireDate: options.expireDate }),
    first: leg(
      index % 2 === 0 ? "STOP" : "PROFIT_RATE",
      status === "COMPLETED" ? "COMPLETED" : "WATCHING",
      index,
      status === "COMPLETED" ? `fixture-order-${index}` : null,
    ),
    ...(Object.hasOwn(options, "second") ? { second: options.second } : {}),
    createdAt: `2026-02-${String(index + 1).padStart(2, "0")}T09:00:00+09:00`,
  };
}

const SINGLE = conditionalOrder(
  "fixture-conditional-single",
  "SINGLE",
  "WATCHING",
  1,
  { second: null },
);
const OCO = conditionalOrder("fixture-conditional-oco", "OCO", "PAUSED", 2, {
  expireDate: "2026-12-31",
  second: leg("STOP", "HOLDING", 12),
});
const OTO = conditionalOrder("fixture-conditional-oto", "OTO", "ORDERING", 3, {
  expireDate: "2026-11-30",
  second: leg("PROFIT_RATE", "WATCHING", 13),
});
const ORDERED = conditionalOrder(
  "fixture-conditional-ordered",
  "FUTURE_TYPE",
  "ORDERED",
  4,
  {
    market: "FUTURE_MARKET",
    orderType: "FUTURE_ORDER_TYPE",
    second: null,
  },
);
const COMPLETED = conditionalOrder(
  "fixture-conditional-completed",
  "OCO",
  "COMPLETED",
  5,
  {
    expireDate: "2026-10-31",
    second: leg("STOP", "CANCELED", 15),
  },
);
const EXPIRED = conditionalOrder(
  "fixture-conditional-expired",
  "SINGLE",
  "EXPIRED",
  6,
);
const UNKNOWN = conditionalOrder(
  "fixture-conditional-unknown",
  "OTO",
  "FUTURE_GROUP_STATUS",
  7,
  {
    second: leg("FUTURE_CONDITION", "FUTURE_LEG_STATUS", 17),
  },
);

export const MOCK_CONDITIONAL_ACCOUNT_101 = deepFreeze({
  OPEN: { result: { conditionalOrders: [SINGLE, OCO, OTO, ORDERED] } },
  CLOSED: {
    result: { conditionalOrders: [COMPLETED, EXPIRED, UNKNOWN, SINGLE] },
  },
});

export const MOCK_CONDITIONAL_ACCOUNT_202 = deepFreeze({
  OPEN: {
    result: {
      conditionalOrders: [
        conditionalOrder(
          "fixture-conditional-account-202",
          "SINGLE",
          "WATCHING",
          8,
          { symbol: "ACCTB", second: null },
        ),
      ],
    },
  },
  CLOSED: { result: { conditionalOrders: [] } },
});

export const MOCK_EMPTY_CONDITIONAL_HISTORY = deepFreeze({
  OPEN: { result: { conditionalOrders: [] } },
  CLOSED: { result: { conditionalOrders: [] } },
});

export const MOCK_MALFORMED_CONDITIONAL_PAGE = deepFreeze({
  result: {
    conditionalOrders: [
      {
        ...SINGLE,
        quantity: "not-a-decimal",
      },
    ],
    nextCursor: null,
    hasNext: false,
  },
});

export const MOCK_CONDITIONAL_PROVIDER_ERROR = deepFreeze({
  error: {
    requestId: "mock-conditional-safe-error",
    code: "service-unavailable",
    message: "Synthetic conditional history failure.",
    data: {},
  },
});
