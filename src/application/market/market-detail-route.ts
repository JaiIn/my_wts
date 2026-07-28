import { type NextRequest, type NextResponse } from "next/server";

import type { SessionUser } from "../auth/session-service";
import {
  type MarketDetailProvider,
  toOrderbookResponse,
  toStockWarningResponse,
  toTradeResponse,
} from "./market-detail-provider";
import { MarketRequestValidationError } from "./stock-price-provider";
import {
  MarketRouteForbiddenError,
  marketErrorResponse,
  marketSuccessResponse,
} from "./stock-price-route";

const SESSION_COOKIE_NAME = "my_wts_session";
const LOOPBACK_HOST = "127.0.0.1:3000";
const SYMBOL_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;
const TRADE_COUNT_PATTERN = /^(?:[1-9]|[1-4][0-9]|50)$/;

type MarketDetailOperation = "getOrderbook" | "getTrades" | "getWarnings";

export type MarketDetailBffDependencies = Readonly<{
  provider(): {
    implementation: MarketDetailProvider;
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

function canonicalSymbol(value: unknown): string {
  if (typeof value !== "string")
    throw new MarketRequestValidationError("symbol");
  const symbol = value.trim().toUpperCase();
  if (symbol === "." || symbol === ".." || !SYMBOL_PATTERN.test(symbol))
    throw new MarketRequestValidationError("symbol");
  return symbol;
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

export function parseDetailRequest(
  operation: MarketDetailOperation,
  request: NextRequest,
  pathSymbol?: unknown,
): Readonly<{ symbol: string; count: number }> {
  if (operation === "getWarnings") {
    assertAllowedQuery(request, []);
    const rawPath = request.url.split("?", 1)[0] ?? "";
    if (
      /%2f|%5c/i.test(rawPath) ||
      rawPath.includes("\\") ||
      rawPath.includes("..")
    ) {
      throw new MarketRequestValidationError("symbol");
    }
    return Object.freeze({ symbol: canonicalSymbol(pathSymbol), count: 20 });
  }

  const allowed = operation === "getTrades" ? ["symbol", "count"] : ["symbol"];
  assertAllowedQuery(request, allowed);
  const symbolValues = request.nextUrl.searchParams.getAll("symbol");
  if (symbolValues.length !== 1)
    throw new MarketRequestValidationError("symbol");
  const symbol = canonicalSymbol(symbolValues[0]);

  if (operation === "getOrderbook") {
    return Object.freeze({ symbol, count: 20 });
  }

  const countValues = request.nextUrl.searchParams.getAll("count");
  if (countValues.length > 1) throw new MarketRequestValidationError("count");
  const rawCount = countValues[0];
  if (rawCount !== undefined && !TRADE_COUNT_PATTERN.test(rawCount)) {
    throw new MarketRequestValidationError("count");
  }
  return Object.freeze({
    symbol,
    count: rawCount === undefined ? 20 : Number(rawCount),
  });
}

export function createMarketDetailBffHandler(
  operation: MarketDetailOperation,
  dependencies: MarketDetailBffDependencies,
) {
  return async function GET(
    request: NextRequest,
    pathSymbol?: unknown,
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
      const input = parseDetailRequest(operation, request, pathSymbol);
      const provider = dependencies.provider();
      providerName = provider.name;
      const data =
        operation === "getWarnings"
          ? (await provider.implementation.getWarnings(input.symbol)).map(
              toStockWarningResponse,
            )
          : operation === "getOrderbook"
            ? toOrderbookResponse(
                await provider.implementation.getOrderbook(input.symbol),
              )
            : (
                await provider.implementation.getTrades(
                  input.symbol,
                  input.count,
                )
              ).map(toTradeResponse);

      dependencies.log?.("market.detail.bff.succeeded", {
        requestId,
        operation,
        status: 200,
        durationMs: Math.max(0, dependencies.now().getTime() - startedAt),
        provider: providerName,
      });
      return marketSuccessResponse(requestId, data, dependencies.now());
    } catch (error) {
      const response = marketErrorResponse(requestId, error);
      dependencies.log?.("market.detail.bff.failed", {
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
