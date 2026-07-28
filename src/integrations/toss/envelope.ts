import { z } from "zod";

export type TossSuccess<T> = {
  ok: true;
  result: T;
};

export type TossError = {
  ok: false;
  error: {
    requestId: string;
    code: string;
    message: string;
    data: Record<string, unknown>;
  };
};

export type TossEnvelope<T> = TossSuccess<T> | TossError;

const tossErrorEnvelopeSchema = z.looseObject({
  error: z.looseObject({
    requestId: z.string().min(1),
    code: z.string().min(1),
    message: z.string(),
    data: z.record(z.string(), z.unknown()),
  }),
});

const tossSuccessEnvelopeSchema = z.looseObject({
  result: z.unknown(),
});

export class TossEnvelopeDecodeError extends Error {
  constructor(
    readonly reason:
      "AMBIGUOUS_ENVELOPE" | "INVALID_ENVELOPE" | "INVALID_RESULT",
  ) {
    super("TOSS_ENVELOPE_DECODE_FAILED");
    this.name = "TossEnvelopeDecodeError";
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

export function decodeTossEnvelope<T>(
  input: unknown,
  resultSchema: z.ZodType<T>,
): TossEnvelope<T> {
  if (!isRecord(input)) {
    throw new TossEnvelopeDecodeError("INVALID_ENVELOPE");
  }

  const hasResult = Object.hasOwn(input, "result");
  const hasError = Object.hasOwn(input, "error");
  if (hasResult && hasError) {
    throw new TossEnvelopeDecodeError("AMBIGUOUS_ENVELOPE");
  }

  if (hasError) {
    const decoded = tossErrorEnvelopeSchema.safeParse(input);
    if (!decoded.success) {
      throw new TossEnvelopeDecodeError("INVALID_ENVELOPE");
    }

    const { code, data, message, requestId } = decoded.data.error;
    return {
      ok: false,
      error: { requestId, code, message, data },
    };
  }

  if (hasResult) {
    const envelope = tossSuccessEnvelopeSchema.safeParse(input);
    if (!envelope.success) {
      throw new TossEnvelopeDecodeError("INVALID_ENVELOPE");
    }
    const result = resultSchema.safeParse(envelope.data.result);
    if (!result.success) {
      throw new TossEnvelopeDecodeError("INVALID_RESULT");
    }

    return { ok: true, result: result.data };
  }

  throw new TossEnvelopeDecodeError("INVALID_ENVELOPE");
}
