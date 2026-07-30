import "server-only";

import type { ServerEnvironment } from "../config/environment";
import type { StructuredLogger } from "../logging/server-logger";
import type { TokenManager } from "./token-manager";

const OFFICIAL_TOSS_ORIGIN = "https://openapi.tossinvest.com";
const MAX_RESPONSE_BYTES = 1_048_576;
const AUTHORIZATION_HEADER = "authorization";
const CONTENT_TYPE_HEADER = "content-type";
const REQUEST_ID_HEADER = "x-request-id";
const RETRY_AFTER_HEADER = "retry-after";
const ACCOUNT_HEADER = "x-tossinvest-account";

const EXACT_READONLY_PATHS = new Set([
  "/api/v1/orderbook",
  "/api/v1/prices",
  "/api/v1/trades",
  "/api/v1/price-limits",
  "/api/v1/candles",
  "/api/v1/stocks",
  "/api/v1/exchange-rate",
  "/api/v1/market-calendar/KR",
  "/api/v1/market-calendar/US",
  "/api/v1/rankings",
  "/api/v1/market-indicators/prices",
  "/api/v1/accounts",
  "/api/v1/holdings",
  "/api/v1/orders",
  "/api/v1/conditional-orders",
  "/api/v1/buying-power",
  "/api/v1/sellable-quantity",
  "/api/v1/commissions",
]);

const DYNAMIC_READONLY_PATHS = [
  /^\/api\/v1\/stocks\/[A-Za-z0-9._~-]+\/warnings$/,
  /^\/api\/v1\/market-indicators\/[A-Za-z0-9._~-]+\/candles$/,
  /^\/api\/v1\/market-indicators\/[A-Za-z0-9._~-]+\/investor-trading$/,
  /^\/api\/v1\/orders\/[A-Za-z0-9._~-]+$/,
  /^\/api\/v1\/conditional-orders\/[A-Za-z0-9._~-]+$/,
];

export type TossQuery = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

export type TossResponseType = "json" | "text";

export type TossGetRequest = Readonly<{
  method?: "GET";
  path: string;
  operation: string;
  query?: TossQuery;
  responseType?: TossResponseType;
  signal?: AbortSignal;
  headers?: Readonly<Record<string, string>>;
}>;

export type TossAccountScopedGetRequest = Readonly<{
  path: "/api/v1/holdings";
  operation: "getHoldings";
  accountSeq: number;
  query?: TossQuery;
  responseType?: TossResponseType;
  signal?: AbortSignal;
}>;

export type TossHttpTransportRequest = Readonly<{
  method: "GET";
  url: string;
  headers: Readonly<Record<string, string>>;
  signal: AbortSignal;
}>;

export type TossHttpTransportResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string | undefined>>;
  body: string;
}>;

export type TossHttpTransport = Readonly<{
  send(request: TossHttpTransportRequest): Promise<TossHttpTransportResponse>;
}>;

export type TimeoutScheduler = Readonly<{
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}>;

export type TossHttpResult<T> = Readonly<{
  status: number;
  data: T;
  requestId?: string;
}>;

export type TossHttpErrorCode =
  | "TOSS_GET_METHOD_REQUIRED"
  | "TOSS_GET_PATH_NOT_ALLOWED"
  | "TOSS_GET_HEADER_NOT_ALLOWED"
  | "TOSS_GET_QUERY_INVALID"
  | "TOSS_GET_ABORTED"
  | "TOSS_GET_TIMEOUT"
  | "TOSS_GET_NETWORK_FAILURE"
  | "TOSS_GET_AUTHENTICATION_FAILED"
  | "TOSS_GET_RATE_LIMITED"
  | "TOSS_GET_RESPONSE_TOO_LARGE"
  | "TOSS_GET_MALFORMED_JSON"
  | "TOSS_GET_UNEXPECTED_CONTENT_TYPE"
  | "TOSS_GET_HTTP_ERROR";

const ERROR_MESSAGES: Readonly<Record<TossHttpErrorCode, string>> =
  Object.freeze({
    TOSS_GET_METHOD_REQUIRED:
      "Only approved read-only GET requests are allowed.",
    TOSS_GET_PATH_NOT_ALLOWED: "The requested Toss path is not allowed.",
    TOSS_GET_HEADER_NOT_ALLOWED: "Caller-provided headers are not allowed.",
    TOSS_GET_QUERY_INVALID: "The Toss query is invalid.",
    TOSS_GET_ABORTED: "The Toss request was cancelled.",
    TOSS_GET_TIMEOUT: "The Toss request timed out.",
    TOSS_GET_NETWORK_FAILURE: "The Toss network request failed.",
    TOSS_GET_AUTHENTICATION_FAILED: "Toss authentication failed.",
    TOSS_GET_RATE_LIMITED: "The Toss request was rate limited.",
    TOSS_GET_RESPONSE_TOO_LARGE: "The Toss response was too large.",
    TOSS_GET_MALFORMED_JSON: "The Toss response was not valid JSON.",
    TOSS_GET_UNEXPECTED_CONTENT_TYPE:
      "The Toss response content type was not supported.",
    TOSS_GET_HTTP_ERROR: "The Toss request failed.",
  });

export class TossHttpClientError extends Error {
  constructor(
    readonly code: TossHttpErrorCode,
    readonly retryable: boolean,
    readonly operation?: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
    readonly requestId?: string,
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = "TossHttpClientError";
    this.stack = undefined;
  }
}

type ReadonlyTossClientOptions = Readonly<{
  environment: ServerEnvironment;
  tokenManager: TokenManager;
  transport: TossHttpTransport;
  logger?: StructuredLogger;
  clock?: () => number;
  scheduler?: TimeoutScheduler;
}>;

export type ReadonlyTossClient = Readonly<{
  get<T = unknown>(request: TossGetRequest): Promise<TossHttpResult<T>>;
}>;

export type AccountScopedReadonlyTossClient = ReadonlyTossClient &
  Readonly<{
  getAccountScoped<T = unknown>(
    request: TossAccountScopedGetRequest,
  ): Promise<TossHttpResult<T>>;
  }>;

function defaultScheduler(): TimeoutScheduler {
  return Object.freeze({
    schedule(callback, delayMs) {
      return setTimeout(callback, delayMs);
    },
    cancel(handle) {
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
  });
}

function safeDuration(startedAt: number, finishedAt: number): number {
  return Math.max(0, finishedAt - startedAt);
}

function safeOperation(operation: string): string {
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(operation)) {
    throw new TossHttpClientError(
      "TOSS_GET_PATH_NOT_ALLOWED",
      false,
      undefined,
    );
  }
  return operation;
}

function safePath(path: string): string {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("%") ||
    path.includes("?") ||
    path.includes("#") ||
    path.includes("\0") ||
    path.split("/").some((segment) => segment === "." || segment === "..") ||
    path.includes("//")
  ) {
    throw new TossHttpClientError("TOSS_GET_PATH_NOT_ALLOWED", false);
  }

  const allowed =
    EXACT_READONLY_PATHS.has(path) ||
    DYNAMIC_READONLY_PATHS.some((pattern) => pattern.test(path));
  if (!allowed) {
    throw new TossHttpClientError("TOSS_GET_PATH_NOT_ALLOWED", false);
  }
  return path;
}

function appendQuery(url: URL, query: TossQuery | undefined): void {
  if (!query) return;
  for (const [key, rawValue] of Object.entries(query)) {
    if (!/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(key)) {
      throw new TossHttpClientError("TOSS_GET_QUERY_INVALID", false);
    }
    if (rawValue === undefined) continue;
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    if (values.length === 0) {
      throw new TossHttpClientError("TOSS_GET_QUERY_INVALID", false);
    }
    for (const value of values) {
      if (typeof value !== "string") {
        throw new TossHttpClientError("TOSS_GET_QUERY_INVALID", false);
      }
      url.searchParams.append(key, value);
    }
  }
}

function createSafeUrl(
  environment: ServerEnvironment,
  path: string,
  query: TossQuery | undefined,
): string {
  if (environment.tossApiBaseUrl !== OFFICIAL_TOSS_ORIGIN) {
    throw new TossHttpClientError("TOSS_GET_PATH_NOT_ALLOWED", false);
  }
  const url = new URL(safePath(path), `${OFFICIAL_TOSS_ORIGIN}/`);
  if (url.origin !== OFFICIAL_TOSS_ORIGIN || url.pathname !== path) {
    throw new TossHttpClientError("TOSS_GET_PATH_NOT_ALLOWED", false);
  }
  appendQuery(url, query);
  return url.toString();
}

function headerValue(
  headers: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name,
  );
  return entry?.[1];
}

function safeRequestId(
  headers: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const requestId = headerValue(headers, REQUEST_ID_HEADER);
  return requestId && /^[A-Za-z0-9._-]{1,128}$/.test(requestId)
    ? requestId
    : undefined;
}

function parseRetryAfterMs(
  headers: Readonly<Record<string, string | undefined>>,
): number | undefined {
  const value = headerValue(headers, RETRY_AFTER_HEADER);
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  const seconds = Number(value);
  const milliseconds = seconds * 1_000;
  return Number.isSafeInteger(seconds) &&
    Number.isSafeInteger(milliseconds) &&
    seconds >= 0
    ? milliseconds
    : undefined;
}

function validateRequest(request: TossGetRequest): {
  operation: string;
  path: string;
} {
  if (
    (request as { method?: string }).method !== undefined &&
    (request as { method?: string }).method !== "GET"
  ) {
    throw new TossHttpClientError("TOSS_GET_METHOD_REQUIRED", false);
  }
  if (
    request.headers !== undefined &&
    Object.keys(request.headers).length > 0
  ) {
    throw new TossHttpClientError("TOSS_GET_HEADER_NOT_ALLOWED", false);
  }
  return {
    operation: safeOperation(request.operation),
    path: safePath(request.path),
  };
}

function decodeSuccess<T>(
  response: TossHttpTransportResponse,
  responseType: TossResponseType,
  operation: string,
): TossHttpResult<T> {
  const requestId = safeRequestId(response.headers);
  if (Buffer.byteLength(response.body, "utf8") > MAX_RESPONSE_BYTES) {
    throw new TossHttpClientError(
      "TOSS_GET_RESPONSE_TOO_LARGE",
      false,
      operation,
      response.status,
      undefined,
      requestId,
    );
  }

  if (responseType === "text") {
    return Object.freeze({
      status: response.status,
      data: response.body as T,
      requestId,
    });
  }

  const contentType = headerValue(response.headers, CONTENT_TYPE_HEADER);
  if (
    !contentType ||
    !/^(application\/json|application\/[^;]+\+json)(?:;|$)/i.test(contentType)
  ) {
    throw new TossHttpClientError(
      "TOSS_GET_UNEXPECTED_CONTENT_TYPE",
      false,
      operation,
      response.status,
      undefined,
      requestId,
    );
  }
  try {
    return Object.freeze({
      status: response.status,
      data: JSON.parse(response.body) as T,
      requestId,
    });
  } catch {
    throw new TossHttpClientError(
      "TOSS_GET_MALFORMED_JSON",
      false,
      operation,
      response.status,
      undefined,
      requestId,
    );
  }
}

function decodeResponse<T>(
  response: TossHttpTransportResponse,
  responseType: TossResponseType,
  operation: string,
): TossHttpResult<T> {
  const requestId = safeRequestId(response.headers);
  if (response.status === 429) {
    const retryAfterMs = parseRetryAfterMs(response.headers);
    throw new TossHttpClientError(
      "TOSS_GET_RATE_LIMITED",
      retryAfterMs !== undefined,
      operation,
      response.status,
      retryAfterMs,
      requestId,
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw new TossHttpClientError(
      "TOSS_GET_HTTP_ERROR",
      response.status >= 500,
      operation,
      response.status,
      undefined,
      requestId,
    );
  }
  return decodeSuccess<T>(response, responseType, operation);
}

export function createReadonlyTossClient(
  options: ReadonlyTossClientOptions,
): AccountScopedReadonlyTossClient {
  const clock = options.clock ?? Date.now;
  const scheduler = options.scheduler ?? defaultScheduler();

  async function send(
    url: string,
    accessToken: string,
    callerSignal: AbortSignal | undefined,
    operation: string,
    accountSeq?: number,
  ): Promise<TossHttpTransportResponse> {
    if (callerSignal?.aborted) {
      throw new TossHttpClientError("TOSS_GET_ABORTED", false, operation);
    }

    const controller = new AbortController();
    let timedOut = false;
    let callerAborted = false;
    const onCallerAbort = () => {
      callerAborted = true;
      controller.abort();
    };
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
    const timeoutHandle = scheduler.schedule(() => {
      timedOut = true;
      controller.abort();
    }, options.environment.requestTimeoutGetMs);

    try {
      const headers: Record<string, string> = {
        accept: "application/json",
      };
      headers[AUTHORIZATION_HEADER] = `Bearer ${accessToken}`;
      if (accountSeq !== undefined) {
        headers[ACCOUNT_HEADER] = String(accountSeq);
      }
      return await options.transport.send({
        method: "GET",
        url,
        headers: Object.freeze(headers),
        signal: controller.signal,
      });
    } catch {
      if (timedOut) {
        throw new TossHttpClientError("TOSS_GET_TIMEOUT", true, operation);
      }
      if (callerAborted || callerSignal?.aborted) {
        throw new TossHttpClientError("TOSS_GET_ABORTED", false, operation);
      }
      throw new TossHttpClientError(
        "TOSS_GET_NETWORK_FAILURE",
        true,
        operation,
      );
    } finally {
      scheduler.cancel(timeoutHandle);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  }

  async function execute<T>(
    request: TossGetRequest,
    accountSeq?: number,
  ): Promise<TossHttpResult<T>> {
    const { operation, path } = validateRequest(request);
    const url = createSafeUrl(options.environment, path, request.query);
    const responseType = request.responseType ?? "json";
    const startedAt = clock();
    let attempt = 1;
    options.logger?.info("toss.get.request.started", {
      operation,
      method: "GET",
      context: { attempt },
    });

    try {
      let firstAccessToken: string | undefined;
      let response = await options.tokenManager.withAccessToken(
        async (accessToken) => {
          firstAccessToken = accessToken;
          return send(url, accessToken, request.signal, operation, accountSeq);
        },
      );

      if (response.status === 401) {
        options.tokenManager.invalidate(firstAccessToken);
        attempt = 2;
        options.logger?.warn("toss.get.request.retry", {
          operation,
          method: "GET",
          status: 401,
          durationMs: safeDuration(startedAt, clock()),
          context: { attempt, reason: "authentication" },
        });
        response = await options.tokenManager.withAccessToken((accessToken) =>
          send(url, accessToken, request.signal, operation, accountSeq),
        );
        if (response.status === 401) {
          throw new TossHttpClientError(
            "TOSS_GET_AUTHENTICATION_FAILED",
            false,
            operation,
            401,
            undefined,
            safeRequestId(response.headers),
          );
        }
      }

      const result = decodeResponse<T>(response, responseType, operation);
      options.logger?.info("toss.get.request.succeeded", {
        operation,
        method: "GET",
        status: response.status,
        durationMs: safeDuration(startedAt, clock()),
        context: { attempt },
      });
      return result;
    } catch (error) {
      const safeError =
        error instanceof TossHttpClientError
          ? error
          : new TossHttpClientError(
              "TOSS_GET_NETWORK_FAILURE",
              true,
              operation,
            );
      options.logger?.warn("toss.get.request.failed", {
        operation,
        method: "GET",
        status: safeError.status,
        durationMs: safeDuration(startedAt, clock()),
        errorCode: safeError.code,
        context: {
          attempt,
          retryable: safeError.retryable,
          retryAfterMs: safeError.retryAfterMs,
        },
      });
      throw safeError;
    }
  }

  async function get<T>(request: TossGetRequest): Promise<TossHttpResult<T>> {
    return execute<T>(request);
  }

  async function getAccountScoped<T>(
    request: TossAccountScopedGetRequest,
  ): Promise<TossHttpResult<T>> {
    if (!Number.isSafeInteger(request.accountSeq) || request.accountSeq <= 0) {
      throw new TossHttpClientError(
        "TOSS_GET_HEADER_NOT_ALLOWED",
        false,
        request.operation,
      );
    }
    return execute<T>(request, request.accountSeq);
  }

  return Object.freeze({ get, getAccountScoped });
}
