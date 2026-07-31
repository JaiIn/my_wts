import type { NextRequest } from "next/server";
import { z } from "zod";

import type { OrderHistoryQuery } from "../../domain/orders/order-history";

const ALLOWED_QUERY = new Set([
  "status",
  "symbol",
  "from",
  "to",
  "cursor",
  "limit",
]);
const SYMBOL_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;
const LIMIT_PATTERN = /^(?:[1-9]|[1-9]\d|100)$/;
const ISO_DATE = z.iso.date();

export class OrderHistoryValidationError extends Error {
  readonly code = "VALIDATION_FAILED";
  readonly stack = undefined;

  constructor() {
    super("ORDER_HISTORY_REQUEST_VALIDATION_FAILED");
    this.name = "OrderHistoryValidationError";
  }
}

function value(
  request: NextRequest,
  name: string,
  required = false,
): string | undefined {
  const values = request.nextUrl.searchParams.getAll(name);
  if (values.length > 1) throw new OrderHistoryValidationError();
  if (values.length === 0) {
    if (required) throw new OrderHistoryValidationError();
    return undefined;
  }
  const result = values[0]!;
  if (result.trim() === "") throw new OrderHistoryValidationError();
  return result;
}

export function parseOrderHistoryQuery(
  request: NextRequest,
): OrderHistoryQuery {
  const rawQuery = request.url.split("?", 2)[1]?.split("#", 1)[0] ?? "";
  if (/%(?![0-9A-Fa-f]{2})/.test(rawQuery)) {
    throw new OrderHistoryValidationError();
  }
  if (
    request.headers.has("content-length") ||
    request.headers.has("transfer-encoding")
  ) {
    throw new OrderHistoryValidationError();
  }
  for (const key of request.nextUrl.searchParams.keys()) {
    if (
      !ALLOWED_QUERY.has(key) ||
      request.nextUrl.searchParams.getAll(key).length !== 1
    ) {
      throw new OrderHistoryValidationError();
    }
  }

  const status = value(request, "status", true);
  if (status !== "OPEN" && status !== "CLOSED") {
    throw new OrderHistoryValidationError();
  }
  const rawSymbol = value(request, "symbol");
  const symbol = rawSymbol?.trim().toUpperCase();
  if (
    symbol !== undefined &&
    (symbol === "." || symbol === ".." || !SYMBOL_PATTERN.test(symbol))
  ) {
    throw new OrderHistoryValidationError();
  }
  const from = value(request, "from");
  const to = value(request, "to");
  if (
    (from !== undefined && !ISO_DATE.safeParse(from).success) ||
    (to !== undefined && !ISO_DATE.safeParse(to).success) ||
    (from !== undefined && to !== undefined && from > to)
  ) {
    throw new OrderHistoryValidationError();
  }
  const cursor = value(request, "cursor");
  const rawLimit = value(request, "limit");
  if (rawLimit !== undefined && !LIMIT_PATTERN.test(rawLimit)) {
    throw new OrderHistoryValidationError();
  }

  return Object.freeze({
    status,
    ...(symbol === undefined ? {} : { symbol }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(cursor === undefined ? {} : { cursor }),
    limit: rawLimit === undefined ? 20 : Number(rawLimit),
  });
}
