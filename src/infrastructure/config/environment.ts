const OFFICIAL_TOSS_API_BASE_URL = "https://openapi.tossinvest.com";
const DEFAULT_DATABASE_PATH = "./data/my_wts.sqlite3";
const DEFAULT_LOG_PATH = "./logs/my_wts.log";
const DEFAULT_REQUEST_TIMEOUT_GET_MS = 8_000;

export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export type ServerEnvironment = Readonly<{
  tossApiBaseUrl: typeof OFFICIAL_TOSS_API_BASE_URL;
  toss:
    | Readonly<{ mode: "disabled" }>
    | Readonly<{ mode: "live"; clientId: string; clientSecret: string }>;
  localBindHost: "127.0.0.1";
  localPort: number;
  databasePath: string;
  logLevel: LogLevel;
  logPath: string;
  requestTimeoutGetMs: number;
}>;

export type PublicServerEnvironment = Readonly<{
  tossApiBaseUrl: typeof OFFICIAL_TOSS_API_BASE_URL;
  allowLiveTossApi: boolean;
}>;

export class ServerEnvironmentError extends Error {
  readonly code = "INVALID_SERVER_ENVIRONMENT";
  readonly variableName: string;

  constructor(variableName: string, reason: string) {
    super(`${variableName}: ${reason}`);
    this.name = "ServerEnvironmentError";
    this.variableName = variableName;
  }
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function configuredValue(
  source: EnvironmentSource,
  variableName: string,
  fallback: string,
): string {
  const rawValue = source[variableName];
  if (rawValue === undefined) return fallback;
  const value = rawValue.trim();
  if (!value) {
    throw new ServerEnvironmentError(variableName, "must not be blank");
  }
  return value;
}

function parseBoolean(
  source: EnvironmentSource,
  variableName: string,
  fallback: boolean,
): boolean {
  const rawValue = source[variableName];
  if (rawValue === undefined) return fallback;
  const value = rawValue.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ServerEnvironmentError(variableName, "must be true or false");
}

function parsePositiveInteger(
  source: EnvironmentSource,
  variableName: string,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const value = configuredValue(source, variableName, String(fallback));
  if (!/^\d+$/.test(value)) {
    throw new ServerEnvironmentError(
      variableName,
      "must be a positive integer",
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new ServerEnvironmentError(
      variableName,
      "must be a positive integer in the supported range",
    );
  }
  return parsed;
}

function parseTossApiBaseUrl(
  source: EnvironmentSource,
): typeof OFFICIAL_TOSS_API_BASE_URL {
  const variableName = "TOSS_API_BASE_URL";
  const value = configuredValue(
    source,
    variableName,
    OFFICIAL_TOSS_API_BASE_URL,
  );
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ServerEnvironmentError(variableName, "must be a valid URL");
  }
  if (
    parsed.origin !== OFFICIAL_TOSS_API_BASE_URL ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new ServerEnvironmentError(
      variableName,
      "must match the approved Toss API origin",
    );
  }
  return OFFICIAL_TOSS_API_BASE_URL;
}

function parseCredential(
  source: EnvironmentSource,
  variableName: "TOSS_CLIENT_ID" | "TOSS_CLIENT_SECRET",
): string {
  const value = source[variableName]?.trim();
  if (!value) {
    throw new ServerEnvironmentError(
      variableName,
      "is required when live Toss API access is enabled",
    );
  }
  if (
    value.length > 512 ||
    !/^[\u0021-\u007e]+$/.test(value) ||
    value.includes("<") ||
    value.includes(">")
  ) {
    throw new ServerEnvironmentError(
      variableName,
      "has an invalid credential format",
    );
  }
  return value;
}

function parseLogLevel(source: EnvironmentSource): LogLevel {
  const variableName = "LOG_LEVEL";
  const value = configuredValue(source, variableName, "info").toLowerCase();
  if (!LOG_LEVELS.includes(value as LogLevel)) {
    throw new ServerEnvironmentError(
      variableName,
      `must be one of ${LOG_LEVELS.join(", ")}`,
    );
  }
  return value as LogLevel;
}

export function parseServerEnvironment(
  source: EnvironmentSource,
): ServerEnvironment {
  const allowLiveTossApi = parseBoolean(source, "ALLOW_LIVE_TOSS_API", false);
  const localBindHost = configuredValue(source, "LOCAL_BIND_HOST", "127.0.0.1");
  if (localBindHost !== "127.0.0.1") {
    throw new ServerEnvironmentError("LOCAL_BIND_HOST", "must be 127.0.0.1");
  }
  const toss = allowLiveTossApi
    ? Object.freeze({
        mode: "live" as const,
        clientId: parseCredential(source, "TOSS_CLIENT_ID"),
        clientSecret: parseCredential(source, "TOSS_CLIENT_SECRET"),
      })
    : Object.freeze({ mode: "disabled" as const });

  return Object.freeze({
    tossApiBaseUrl: parseTossApiBaseUrl(source),
    toss,
    localBindHost,
    localPort: parsePositiveInteger(source, "LOCAL_PORT", 3_000, 65_535),
    databasePath: configuredValue(
      source,
      "DATABASE_PATH",
      DEFAULT_DATABASE_PATH,
    ),
    logLevel: parseLogLevel(source),
    logPath: configuredValue(source, "LOG_PATH", DEFAULT_LOG_PATH),
    requestTimeoutGetMs: parsePositiveInteger(
      source,
      "REQUEST_TIMEOUT_GET_MS",
      DEFAULT_REQUEST_TIMEOUT_GET_MS,
    ),
  });
}

export function projectPublicServerEnvironment(
  environment: ServerEnvironment,
): PublicServerEnvironment {
  return Object.freeze({
    tossApiBaseUrl: environment.tossApiBaseUrl,
    allowLiveTossApi: environment.toss.mode === "live",
  });
}
