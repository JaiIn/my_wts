const REDACTED = "[REDACTED]";
const CIRCULAR = "[Circular]";
const UNSERIALIZABLE = "[Unserializable]";
const MAX_DEPTH = 24;

const EXACT_SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "setcookie",
  "clientsecret",
  "accesstoken",
  "refreshtoken",
  "sessiontoken",
  "sessiontokenhash",
  "token",
  "tokenhash",
  "apikey",
  "apisecret",
  "oauthpayload",
  "accountno",
  "accountseq",
  "rawrequestbody",
  "rawresponsebody",
]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return (
    EXACT_SENSITIVE_KEYS.has(normalized) ||
    normalized.includes("password") ||
    normalized.includes("clientsecret") ||
    normalized.includes("accesstoken") ||
    normalized.includes("refreshtoken") ||
    normalized.includes("sessiontoken") ||
    normalized.includes("authorization") ||
    normalized.endsWith("cookie") ||
    normalized.includes("apikey") ||
    normalized.includes("apisecret") ||
    normalized.includes("oauthpayload") ||
    normalized.includes("accountseq") ||
    normalized.includes("accountno")
  );
}

function redactString(value: string, knownSecrets: readonly string[]): string {
  let redacted = value
    .replaceAll(/(Bearer\s+)[^\s,;]+/gi, `$1${REDACTED}`)
    .replaceAll(/(my_wts_session=)[^;\s]+/gi, `$1${REDACTED}`)
    .replaceAll(
      /((?:client[_ -]?secret|access[_ -]?token|refresh[_ -]?token|api[_ -]?key|api[_ -]?secret)\s*[=:]\s*)[^\s,;]+/gi,
      `$1${REDACTED}`,
    );
  for (const secret of knownSecrets) {
    if (secret.length > 0) {
      redacted = redacted.replaceAll(secret, REDACTED);
    }
  }
  return redacted;
}

function redactValue(
  value: unknown,
  knownSecrets: readonly string[],
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (depth > MAX_DEPTH) return UNSERIALIZABLE;
  if (value === undefined) return "[Undefined]";
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return redactString(value, knownSecrets);
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return "[Function]";
  if (typeof value !== "object") return String(value);

  if (seen.has(value)) return CIRCULAR;
  seen.add(value);

  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? "Invalid Date" : value.toISOString();
  }
  if (value instanceof Error) {
    const error: Record<string, unknown> = {
      name: value.name,
      message: redactString(value.message, knownSecrets),
    };
    if ("cause" in value && value.cause !== undefined) {
      error.cause = redactValue(value.cause, knownSecrets, seen, depth + 1);
    }
    return error;
  }
  if (
    value.constructor?.name === "Decimal" &&
    typeof (value as { toString?: unknown }).toString === "function"
  ) {
    try {
      return redactString(String(value), knownSecrets);
    } catch {
      return UNSERIALIZABLE;
    }
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      redactValue(item, knownSecrets, seen, depth + 1),
    );
  }
  if (value instanceof Map) {
    return [...value.entries()].map(([key, item]) => [
      redactValue(key, knownSecrets, seen, depth + 1),
      redactValue(item, knownSecrets, seen, depth + 1),
    ]);
  }
  if (value instanceof Set) {
    return [...value].map((item) =>
      redactValue(item, knownSecrets, seen, depth + 1),
    );
  }

  const redacted: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") continue;
    if (isSensitiveKey(key)) {
      redacted[key] = REDACTED;
      continue;
    }
    const safeKey = redactString(key, knownSecrets);
    try {
      redacted[safeKey] = redactValue(
        Reflect.get(value, key),
        knownSecrets,
        seen,
        depth + 1,
      );
    } catch {
      redacted[safeKey] = UNSERIALIZABLE;
    }
  }
  return redacted;
}

export function redactSensitiveData(
  value: unknown,
  knownSecrets: readonly string[] = [],
): unknown {
  return redactValue(
    value,
    knownSecrets.filter((secret) => secret.length > 0),
    new WeakSet(),
    0,
  );
}

export function safeSerialize(
  value: unknown,
  knownSecrets: readonly string[] = [],
): string {
  try {
    return JSON.stringify(redactSensitiveData(value, knownSecrets));
  } catch {
    return JSON.stringify(UNSERIALIZABLE);
  }
}
