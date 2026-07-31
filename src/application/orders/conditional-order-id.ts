const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export class ConditionalOrderIdValidationError extends Error {
  readonly stack = undefined;

  constructor() {
    super("CONDITIONAL_ORDER_ID_VALIDATION_FAILED");
    this.name = "ConditionalOrderIdValidationError";
  }
}

export function decodeConditionalOrderIdPathSegment(raw: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw new ConditionalOrderIdValidationError();
  }
  if (
    raw !== decoded ||
    !SAFE_ID.test(decoded) ||
    decoded === "." ||
    decoded === ".." ||
    /[/\\\s\u0000-\u001f\u007f]/.test(decoded) ||
    /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(decoded)
  ) {
    throw new ConditionalOrderIdValidationError();
  }
  return decoded;
}

export function encodeConditionalOrderIdPathSegment(value: string): string {
  const canonical = decodeConditionalOrderIdPathSegment(value);
  return encodeURIComponent(canonical);
}
