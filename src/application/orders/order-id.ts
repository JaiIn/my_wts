const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export class OrderIdValidationError extends Error {
  readonly code = "VALIDATION_FAILED";
  readonly stack = undefined;

  constructor() {
    super("ORDER_ID_VALIDATION_FAILED");
    this.name = "OrderIdValidationError";
  }
}

export function decodeOrderIdPathSegment(rawValue: unknown): string {
  if (
    typeof rawValue !== "string" ||
    rawValue.length < 1 ||
    rawValue.length > 384 ||
    /[\u0000-\u0020\u007f\\/#?]/.test(rawValue) ||
    /%(?![0-9A-Fa-f]{2})/.test(rawValue)
  ) {
    throw new OrderIdValidationError();
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawValue);
  } catch {
    throw new OrderIdValidationError();
  }
  if (!ORDER_ID_PATTERN.test(decoded) || decoded === "." || decoded === "..") {
    throw new OrderIdValidationError();
  }
  return decoded;
}

export function encodeOrderIdPathSegment(orderId: string): string {
  const canonical = decodeOrderIdPathSegment(orderId);
  return encodeURIComponent(canonical);
}
