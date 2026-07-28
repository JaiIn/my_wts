import { type NextRequest, type NextResponse } from "next/server";
import { z } from "zod";

import type { SessionUser } from "../auth/session-service";
import {
  type CalendarRequest,
  type CandleRequest,
  type ExchangeRateRequest,
  type MarketReferenceProvider,
} from "./market-reference-provider";
import { MarketRequestValidationError } from "./stock-price-provider";
import {
  MarketRouteForbiddenError,
  marketErrorResponse,
  marketSuccessResponse,
} from "./stock-price-route";

const SESSION_COOKIE_NAME = "my_wts_session";
const LOOPBACK_HOST = "127.0.0.1:3000";
const SYMBOL_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;
const CANDLE_COUNT_PATTERN = /^(?:[1-9]|[1-9][0-9]|1[0-9]{2}|200)$/;
const ISO_DATE_TIME = z.iso.datetime({ offset: true });

type MarketReferenceOperation =
  "getCalendar" | "getCandles" | "getExchangeRate";

type ParsedReferenceRequest =
  | Readonly<{ operation: "getCalendar"; input: CalendarRequest }>
  | Readonly<{ operation: "getCandles"; input: CandleRequest }>
  | Readonly<{ operation: "getExchangeRate"; input: ExchangeRateRequest }>;

export type MarketReferenceBffDependencies = Readonly<{
  provider(): {
    implementation: MarketReferenceProvider;
    name: "live" | "mock";
  };
  authenticator: Readonly<{ authenticate(token: unknown): SessionUser }>;
  createRequestId(): string;
  now(): Date;
  log?(event: string, context: Record<string, unknown>): void;
}>;

function hasMalformedPercentEncoding(url: string): boolean {
  return /%(?![0-9A-Fa-f]{2})/.test(url);
}

function assertAllowedQuery(
  request: NextRequest,
  allowed: readonly string[],
): void {
  if (hasMalformedPercentEncoding(request.url)) {
    throw new MarketRequestValidationError("query");
  }
  const allowedKeys = new Set(allowed);
  for (const key of request.nextUrl.searchParams.keys()) {
    if (
      !allowedKeys.has(key) ||
      request.nextUrl.searchParams.getAll(key).length !== 1
    ) {
      throw new MarketRequestValidationError("query");
    }
  }
}

function requiredQuery(request: NextRequest, name: string): string {
  const values = request.nextUrl.searchParams.getAll(name);
  if (values.length !== 1 || values[0] === "") {
    throw new MarketRequestValidationError(name);
  }
  return values[0]!;
}

function optionalQuery(request: NextRequest, name: string): string | undefined {
  const values = request.nextUrl.searchParams.getAll(name);
  if (values.length > 1 || (values.length === 1 && values[0] === "")) {
    throw new MarketRequestValidationError(name);
  }
  return values[0];
}

function canonicalSymbol(value: string): string {
  const symbol = value.trim().toUpperCase();
  if (symbol === "." || symbol === ".." || !SYMBOL_PATTERN.test(symbol)) {
    throw new MarketRequestValidationError("symbol");
  }
  return symbol;
}

function strictDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new MarketRequestValidationError("date");
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new MarketRequestValidationError("date");
  }
  return value;
}

function strictDateTime(value: string, field: string): string {
  if (!ISO_DATE_TIME.safeParse(value).success) {
    throw new MarketRequestValidationError(field);
  }
  return value;
}

export function parseMarketReferenceRequest(
  operation: MarketReferenceOperation,
  request: NextRequest,
  pathCountry?: unknown,
): ParsedReferenceRequest {
  if (operation === "getCandles") {
    assertAllowedQuery(request, [
      "symbol",
      "interval",
      "count",
      "before",
      "adjusted",
    ]);
    const symbol = canonicalSymbol(requiredQuery(request, "symbol"));
    const interval = requiredQuery(request, "interval");
    if (interval !== "1m" && interval !== "1d") {
      throw new MarketRequestValidationError("interval");
    }
    const countValue = optionalQuery(request, "count");
    if (countValue !== undefined && !CANDLE_COUNT_PATTERN.test(countValue)) {
      throw new MarketRequestValidationError("count");
    }
    const beforeValue = optionalQuery(request, "before");
    const adjustedValue = optionalQuery(request, "adjusted");
    if (
      adjustedValue !== undefined &&
      adjustedValue !== "true" &&
      adjustedValue !== "false"
    ) {
      throw new MarketRequestValidationError("adjusted");
    }
    return Object.freeze({
      operation,
      input: Object.freeze({
        symbol,
        interval,
        count: countValue === undefined ? 100 : Number(countValue),
        ...(beforeValue === undefined
          ? {}
          : { before: strictDateTime(beforeValue, "before") }),
        adjusted: adjustedValue === undefined ? true : adjustedValue === "true",
      }),
    });
  }

  if (operation === "getCalendar") {
    assertAllowedQuery(request, ["date"]);
    const rawPath = request.url.split("?", 1)[0] ?? "";
    if (
      /%2f|%5c/i.test(rawPath) ||
      rawPath.includes("\\") ||
      rawPath.includes("..") ||
      (pathCountry !== "KR" && pathCountry !== "US")
    ) {
      throw new MarketRequestValidationError("country");
    }
    return Object.freeze({
      operation,
      input: Object.freeze({
        country: pathCountry,
        date: strictDate(requiredQuery(request, "date")),
      }),
    });
  }

  assertAllowedQuery(request, ["baseCurrency", "quoteCurrency", "dateTime"]);
  const baseCurrency = requiredQuery(request, "baseCurrency");
  const quoteCurrency = requiredQuery(request, "quoteCurrency");
  if (
    (baseCurrency !== "KRW" && baseCurrency !== "USD") ||
    (quoteCurrency !== "KRW" && quoteCurrency !== "USD")
  ) {
    throw new MarketRequestValidationError("currency");
  }
  const dateTime = optionalQuery(request, "dateTime");
  return Object.freeze({
    operation,
    input: Object.freeze({
      baseCurrency,
      quoteCurrency,
      ...(dateTime === undefined
        ? {}
        : { dateTime: strictDateTime(dateTime, "dateTime") }),
    }),
  });
}

export function createMarketReferenceBffHandler(
  operation: MarketReferenceOperation,
  dependencies: MarketReferenceBffDependencies,
) {
  return async function GET(
    request: NextRequest,
    pathCountry?: unknown,
  ): Promise<NextResponse> {
    const requestId = dependencies.createRequestId();
    const startedAt = dependencies.now().getTime();
    let providerName: "live" | "mock" | undefined;
    try {
      const host = request.headers.get("host") ?? request.nextUrl.host;
      if (host !== LOOPBACK_HOST) throw new MarketRouteForbiddenError();
      dependencies.authenticator.authenticate(
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
      );
      const parsed = parseMarketReferenceRequest(
        operation,
        request,
        pathCountry,
      );
      const provider = dependencies.provider();
      providerName = provider.name;
      const data =
        parsed.operation === "getCandles"
          ? await provider.implementation.getCandles(parsed.input)
          : parsed.operation === "getCalendar"
            ? await provider.implementation.getCalendar(parsed.input)
            : await provider.implementation.getExchangeRate(parsed.input);

      dependencies.log?.("market.reference.bff.succeeded", {
        requestId,
        operation,
        status: 200,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
        provider: providerName,
      });
      return marketSuccessResponse(requestId, data, dependencies.now());
    } catch (error) {
      const response = marketErrorResponse(requestId, error);
      dependencies.log?.("market.reference.bff.failed", {
        requestId,
        operation,
        status: response.status,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
        provider: providerName,
      });
      return response;
    }
  };
}
