"use client";

export const ACCOUNT_QUERY_TTL = Object.freeze({
  accounts: 0,
  holdings: 5_000,
  buyingPower: 0,
  sellableQuantity: 0,
  commissions: 3_600_000,
});

export const ACCOUNT_SCOPED_QUERY_KEYS = Object.freeze([
  "holdings",
  "order-info",
] as const);
