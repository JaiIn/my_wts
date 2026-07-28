import "server-only";

import type { ServerEnvironment } from "../config/environment";
import type { StructuredLogger } from "../logging/server-logger";
import {
  createOAuthClientCredentialsForm,
  decodeOAuthResponse,
  OAUTH_TOKEN_PATH,
  type OAuthFailure,
} from "../../integrations/toss/oauth";

const TOKEN_EXPIRY_LEEWAY_MS = 60_000;

export type OAuthTransportRequest = Readonly<{
  method: "POST";
  path: typeof OAUTH_TOKEN_PATH;
  contentType: "application/x-www-form-urlencoded";
  body: string;
}>;

export type OAuthTransportResponse = Readonly<{
  status: number;
  body: string;
}>;

export type OAuthTransport = Readonly<{
  issueToken(request: OAuthTransportRequest): Promise<OAuthTransportResponse>;
}>;

export class TokenManagerError extends Error {
  constructor(
    readonly code:
      | "LIVE_TOSS_API_DISABLED"
      | "OAUTH_REQUEST_FAILED"
      | "OAUTH_RESPONSE_INVALID",
    readonly category: OAuthFailure["category"] | "CONFIGURATION" | "TRANSPORT",
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(code);
    this.name = "TokenManagerError";
  }
}

type TokenManagerOptions = Readonly<{
  environment: ServerEnvironment;
  transport: OAuthTransport;
  logger?: StructuredLogger;
  clock?: () => number;
}>;

export type TokenManager = Readonly<{
  withAccessToken<T>(
    consumer: (accessToken: string) => T | Promise<T>,
  ): Promise<T>;
  invalidate(): void;
}>;

type CachedToken = Readonly<{
  accessToken: string;
  expiresAt: number;
}>;

function safeDuration(startedAt: number, finishedAt: number): number {
  return Math.max(0, finishedAt - startedAt);
}

export function createTokenManager(options: TokenManagerOptions): TokenManager {
  const clock = options.clock ?? Date.now;
  let cachedToken: CachedToken | undefined;
  let inFlight: Promise<CachedToken> | undefined;

  async function issueToken(): Promise<CachedToken> {
    if (options.environment.toss.mode !== "live") {
      throw new TokenManagerError(
        "LIVE_TOSS_API_DISABLED",
        "CONFIGURATION",
        false,
      );
    }

    const startedAt = clock();
    options.logger?.info("toss.oauth.request.started", {
      operation: "issueOAuth2Token",
      method: "POST",
      routeTemplate: OAUTH_TOKEN_PATH,
    });

    try {
      const form = createOAuthClientCredentialsForm({
        clientId: options.environment.toss.clientId,
        clientSecret: options.environment.toss.clientSecret,
      });
      const response = await form.submit((body) =>
        options.transport.issueToken({
          method: "POST",
          path: OAUTH_TOKEN_PATH,
          contentType: form.contentType,
          body,
        }),
      );
      const decoded = decodeOAuthResponse(response.status, response.body);
      if (!decoded.ok) {
        throw new TokenManagerError(
          "OAUTH_REQUEST_FAILED",
          decoded.error.category,
          decoded.error.retryable,
          decoded.error.status,
        );
      }

      const issuedAt = clock();
      const token = Object.freeze({
        accessToken: decoded.token.accessToken,
        expiresAt: issuedAt + decoded.token.expiresInMs,
      });
      options.logger?.info("toss.oauth.request.succeeded", {
        operation: "issueOAuth2Token",
        method: "POST",
        routeTemplate: OAUTH_TOKEN_PATH,
        status: response.status,
        durationMs: safeDuration(startedAt, issuedAt),
        context: { expiresAt: new Date(token.expiresAt).toISOString() },
      });
      return token;
    } catch (error) {
      const safeError =
        error instanceof TokenManagerError
          ? error
          : new TokenManagerError(
              error instanceof Error &&
                "code" in error &&
                error.code === "OAUTH_RESPONSE_INVALID"
                ? "OAUTH_RESPONSE_INVALID"
                : "OAUTH_REQUEST_FAILED",
              "TRANSPORT",
              true,
            );
      options.logger?.warn("toss.oauth.request.failed", {
        operation: "issueOAuth2Token",
        method: "POST",
        routeTemplate: OAUTH_TOKEN_PATH,
        status: safeError.status,
        durationMs: safeDuration(startedAt, clock()),
        errorCode: safeError.code,
        context: {
          category: safeError.category,
          retryable: safeError.retryable,
        },
      });
      throw safeError;
    }
  }

  async function getToken(): Promise<CachedToken> {
    const now = clock();
    if (cachedToken && now < cachedToken.expiresAt - TOKEN_EXPIRY_LEEWAY_MS) {
      return cachedToken;
    }

    inFlight ??= issueToken()
      .then((token) => {
        cachedToken = token;
        return token;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  }

  return Object.freeze({
    async withAccessToken<T>(
      consumer: (accessToken: string) => T | Promise<T>,
    ): Promise<T> {
      return consumer((await getToken()).accessToken);
    },
    invalidate() {
      cachedToken = undefined;
    },
  });
}
