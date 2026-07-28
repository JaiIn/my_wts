import { z } from "zod";

export const OAUTH_TOKEN_PATH = "/oauth2/token";
export const OAUTH_FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";
const ACCESS_TOKEN_FIELD = "access_token" as const;

export type OAuthCredentials = Readonly<{
  clientId: string;
  clientSecret: string;
}>;

export type OAuthForm = Readonly<{
  contentType: typeof OAUTH_FORM_CONTENT_TYPE;
  submit<T>(sender: (encodedBody: string) => T): T;
}>;

export type OAuthToken = Readonly<{
  accessToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
  expiresInMs: number;
}>;

export type OAuthFailureCategory =
  | "CLIENT_REQUEST"
  | "CLIENT_AUTHENTICATION"
  | "ACCESS_DENIED"
  | "RATE_LIMIT"
  | "UPSTREAM";

export type OAuthFailure = Readonly<{
  code: string;
  category: OAuthFailureCategory;
  retryable: boolean;
  status: number;
}>;

export type OAuthDecodeResult =
  | Readonly<{ ok: true; token: OAuthToken }>
  | Readonly<{ ok: false; error: OAuthFailure }>;

export class OAuthFormError extends Error {
  readonly code = "OAUTH_FORM_INVALID";

  constructor(readonly field: "client_id" | "client_secret") {
    super("OAUTH_FORM_INVALID");
    this.name = "OAuthFormError";
  }
}

export class OAuthDecodeError extends Error {
  readonly code = "OAUTH_RESPONSE_INVALID";

  constructor(readonly reason: "MALFORMED_JSON" | "INVALID_SCHEMA") {
    super("OAUTH_RESPONSE_INVALID");
    this.name = "OAuthDecodeError";
  }
}

const tokenResponseSchema = z.looseObject({
  [ACCESS_TOKEN_FIELD]: z.string().trim().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive().safe(),
});

const oauthErrorSchema = z.looseObject({
  error: z.enum([
    "invalid_request",
    "invalid_client",
    "invalid_grant",
    "unauthorized_client",
    "unsupported_grant_type",
    "access_denied",
  ]),
  error_description: z.string().optional(),
  error_uri: z.url().optional(),
});

function requireCredential(
  value: string | undefined,
  field: "client_id" | "client_secret",
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OAuthFormError(field);
  }
  return value;
}

export function createOAuthClientCredentialsForm(
  credentials: Partial<OAuthCredentials>,
): OAuthForm {
  const clientId = requireCredential(credentials.clientId, "client_id");
  const clientSecret = requireCredential(
    credentials.clientSecret,
    "client_secret",
  );
  const parameters = new URLSearchParams();
  parameters.set("grant_type", "client_credentials");
  parameters.set("client_id", clientId);
  parameters.set("client_secret", clientSecret);
  const encodedBody = parameters.toString();

  return Object.freeze({
    contentType: OAUTH_FORM_CONTENT_TYPE,
    submit<T>(sender: (body: string) => T): T {
      return sender(encodedBody);
    },
  });
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new OAuthDecodeError("MALFORMED_JSON");
  }
}

function classifyOAuthFailure(status: number, code: string): OAuthFailure {
  if (status === 429) {
    return Object.freeze({
      code: "OAUTH_RATE_LIMITED",
      category: "RATE_LIMIT",
      retryable: true,
      status,
    });
  }
  if (status >= 500) {
    return Object.freeze({
      code: "OAUTH_UPSTREAM_FAILURE",
      category: "UPSTREAM",
      retryable: true,
      status,
    });
  }

  const category: OAuthFailureCategory =
    code === "invalid_client" || code === "unauthorized_client"
      ? "CLIENT_AUTHENTICATION"
      : code === "access_denied"
        ? "ACCESS_DENIED"
        : "CLIENT_REQUEST";
  return Object.freeze({
    code: `OAUTH_${code.toUpperCase()}`,
    category,
    retryable: false,
    status,
  });
}

export function decodeOAuthResponse(
  status: number,
  body: string,
): OAuthDecodeResult {
  const parsed = parseJson(body);

  if (status >= 200 && status < 300) {
    const result = tokenResponseSchema.safeParse(parsed);
    if (!result.success) {
      throw new OAuthDecodeError("INVALID_SCHEMA");
    }
    const expiresInMs = result.data.expires_in * 1_000;
    if (!Number.isSafeInteger(expiresInMs)) {
      throw new OAuthDecodeError("INVALID_SCHEMA");
    }
    return Object.freeze({
      ok: true as const,
      token: Object.freeze({
        accessToken: result.data[ACCESS_TOKEN_FIELD],
        tokenType: result.data.token_type,
        expiresInSeconds: result.data.expires_in,
        expiresInMs,
      }),
    });
  }

  const result = oauthErrorSchema.safeParse(parsed);
  if (!result.success) {
    throw new OAuthDecodeError("INVALID_SCHEMA");
  }
  return Object.freeze({
    ok: false as const,
    error: classifyOAuthFailure(status, result.data.error),
  });
}
