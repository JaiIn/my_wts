import type { NextRequest } from "next/server";

import type { ConditionalOrderHistoryQuery } from "../../domain/orders/conditional-order-history";

const ALLOWED_QUERY = new Set(["status", "symbol", "cursor", "limit"]);
const SYMBOL_PATTERN = /^[A-Za-z0-9.-]{1,32}$/;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const LIMIT_PATTERN = /^(?:[1-9]|[1-9]\d|100)$/;

export class ConditionalOrderValidationError extends Error {
  readonly code = "VALIDATION_FAILED";
  readonly stack = undefined;

  constructor() {
    super("CONDITIONAL_ORDER_REQUEST_VALIDATION_FAILED");
    this.name = "ConditionalOrderValidationError";
  }
}

function value(
  request: NextRequest,
  name: string,
  required = false,
): string | undefined {
  const values = request.nextUrl.searchParams.getAll(name);
  if (values.length > 1) throw new ConditionalOrderValidationError();
  if (values.length === 0) {
    if (required) throw new ConditionalOrderValidationError();
    return undefined;
  }
  const result = values[0]!;
  if (result.trim() === "") throw new ConditionalOrderValidationError();
  return result;
}

export function parseConditionalOrderHistoryQuery(
  request: NextRequest,
): ConditionalOrderHistoryQuery {
  const rawQuery = request.url.split("?", 2)[1]?.split("#", 1)[0] ?? "";
  if (
    /%(?![0-9A-Fa-f]{2})/.test(rawQuery) ||
    request.headers.has("content-length") ||
    request.headers.has("transfer-encoding")
  ) {
    throw new ConditionalOrderValidationError();
  }
  for (const key of request.nextUrl.searchParams.keys()) {
    if (
      !ALLOWED_QUERY.has(key) ||
      request.nextUrl.searchParams.getAll(key).length !== 1
    ) {
      throw new ConditionalOrderValidationError();
    }
  }
  const status = value(request, "status", true);
  if (status !== "OPEN" && status !== "CLOSED") {
    throw new ConditionalOrderValidationError();
  }
  const rawSymbol = value(request, "symbol");
  const symbol = rawSymbol?.trim().toUpperCase();
  if (symbol !== undefined && !SYMBOL_PATTERN.test(symbol)) {
    throw new ConditionalOrderValidationError();
  }
  const cursor = value(request, "cursor");
  if (cursor !== undefined && !CURSOR_PATTERN.test(cursor)) {
    throw new ConditionalOrderValidationError();
  }
  const rawLimit = value(request, "limit");
  if (rawLimit !== undefined && !LIMIT_PATTERN.test(rawLimit)) {
    throw new ConditionalOrderValidationError();
  }
  return Object.freeze({
    status,
    ...(symbol === undefined ? {} : { symbol }),
    ...(cursor === undefined ? {} : { cursor }),
    limit: rawLimit === undefined ? 20 : Number(rawLimit),
  });
}
