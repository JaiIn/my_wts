import { describe, expect, it } from "vitest";
import { z } from "zod";

import { decimalStringSchema } from "../../src/domain/common/decimal";
import {
  decodeTossEnvelope,
  TossEnvelopeDecodeError,
} from "../../src/integrations/toss/envelope";

const quoteSchema = z.looseObject({
  symbol: z.string(),
  price: decimalStringSchema,
});

describe("Toss envelope decoder", () => {
  it("decodes a success envelope with its endpoint result schema", () => {
    expect(
      decodeTossEnvelope(
        {
          result: {
            symbol: "005930",
            price: "81234.50",
            futureField: true,
          },
          futureEnvelopeField: "kept-compatible",
        },
        quoteSchema,
      ),
    ).toEqual({
      ok: true,
      result: {
        symbol: "005930",
        price: "81234.50",
        futureField: true,
      },
    });
  });

  it("preserves unknown error codes, empty messages, data, and extra fields", () => {
    expect(
      decodeTossEnvelope(
        {
          error: {
            requestId: "upstream-request-id",
            code: "future-error-code",
            message: "",
            data: { market: "US", retryHint: 3 },
            futureErrorField: true,
          },
          futureEnvelopeField: true,
        },
        quoteSchema,
      ),
    ).toEqual({
      ok: false,
      error: {
        requestId: "upstream-request-id",
        code: "future-error-code",
        message: "",
        data: { market: "US", retryHint: 3 },
      },
    });
  });

  it.each([
    null,
    [],
    {},
    { result: {}, error: {} },
    {
      error: { requestId: "", code: "invalid-request", message: "", data: {} },
    },
    {
      error: {
        requestId: "request-id",
        code: "",
        message: "",
        data: {},
      },
    },
    {
      error: {
        requestId: "request-id",
        code: "invalid-request",
        message: 1,
        data: {},
      },
    },
  ])("rejects a malformed or ambiguous envelope", (input) => {
    expect(() => decodeTossEnvelope(input, quoteSchema)).toThrow(
      TossEnvelopeDecodeError,
    );
  });

  it("rejects a result that violates its endpoint schema", () => {
    let thrown: unknown;
    try {
      decodeTossEnvelope(
        { result: { symbol: "005930", price: 81234.5 } },
        quoteSchema,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TossEnvelopeDecodeError);
    expect(thrown).toMatchObject({
      message: "TOSS_ENVELOPE_DECODE_FAILED",
      reason: "INVALID_RESULT",
    });
  });

  it("does not include malformed upstream content in the thrown error", () => {
    const sensitiveUpstreamValue = ["not", "-", "for", "-", "logs"].join("");

    try {
      decodeTossEnvelope(
        { result: { symbol: "005930", price: sensitiveUpstreamValue } },
        quoteSchema,
      );
      throw new Error("Expected decoding to fail.");
    } catch (error) {
      expect(String(error)).not.toContain(sensitiveUpstreamValue);
    }
  });
});
