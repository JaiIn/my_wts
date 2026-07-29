import { describe, expect, it } from "vitest";

import {
  createOAuthClientCredentialsForm,
  decodeOAuthResponse,
  OAUTH_FORM_CONTENT_TYPE,
  OAuthFormError,
} from "../../src/integrations/toss/oauth";

describe("Toss OAuth contract", () => {
  it("encodes the exact client credentials form without exposing credentials on the form object", () => {
    const form = createOAuthClientCredentialsForm({
      clientId: "fixture id+한글",
      clientSecret: "fixture&secret=% value",
    });
    let body = "";
    form.submit((encodedBody) => {
      body = encodedBody;
    });

    expect(form.contentType).toBe(OAUTH_FORM_CONTENT_TYPE);
    expect([...new URLSearchParams(body).entries()]).toEqual([
      ["grant_type", "client_credentials"],
      ["client_id", "fixture id+한글"],
      ["client_secret", "fixture&secret=% value"],
    ]);
    expect(JSON.stringify(form)).not.toContain("fixture");
  });

  it("rejects missing and blank credentials with safe errors", () => {
    for (const credentials of [
      {},
      { clientId: " " },
      { clientId: "fixture-client", clientSecret: "" },
    ]) {
      expect(() => createOAuthClientCredentialsForm(credentials)).toThrow(
        OAuthFormError,
      );
    }
    expect(() =>
      createOAuthClientCredentialsForm({
        clientId: "fixture-client",
        clientSecret: " ",
      }),
    ).toThrowError("OAUTH_FORM_INVALID");
  });

  it("decodes a success response, preserves the token, and converts seconds safely", () => {
    const decoded = decodeOAuthResponse(
      200,
      JSON.stringify({
        access_token: "<fixture-access-value>",
        token_type: "Bearer",
        expires_in: 3600,
        additional_upstream_field: "ignored",
      }),
    );

    expect(decoded).toEqual({
      ok: true,
      token: {
        accessToken: "<fixture-access-value>",
        tokenType: "Bearer",
        expiresInSeconds: 3600,
        expiresInMs: 3_600_000,
      },
    });
  });

  it("maps OAuth and HTTP failures to safe categories without raw descriptions", () => {
    expect(
      decodeOAuthResponse(
        401,
        JSON.stringify({
          error: "invalid_client",
          error_description: "fixture upstream detail",
        }),
      ),
    ).toEqual({
      ok: false,
      error: {
        code: "OAUTH_INVALID_CLIENT",
        category: "CLIENT_AUTHENTICATION",
        retryable: false,
        status: 401,
      },
    });
    expect(
      decodeOAuthResponse(429, JSON.stringify({ error: "invalid_request" })),
    ).toMatchObject({
      ok: false,
      error: { category: "RATE_LIMIT", retryable: true, status: 429 },
    });
  });

  it.each([
    [200, "not-json", "MALFORMED_JSON"],
    [200, JSON.stringify({}), "INVALID_SCHEMA"],
    [
      200,
      JSON.stringify({
        access_token: "",
        token_type: "Bearer",
        expires_in: 1,
      }),
      "INVALID_SCHEMA",
    ],
    [
      200,
      JSON.stringify({
        access_token: "<fixture>",
        token_type: "bearer",
        expires_in: 1,
      }),
      "INVALID_SCHEMA",
    ],
    [
      200,
      JSON.stringify({
        access_token: "<fixture>",
        token_type: "Bearer",
        expires_in: 0,
      }),
      "INVALID_SCHEMA",
    ],
    [
      200,
      JSON.stringify({
        access_token: "<fixture>",
        token_type: "Bearer",
        expires_in: Number.MAX_SAFE_INTEGER,
      }),
      "INVALID_SCHEMA",
    ],
  ])("rejects malformed OAuth response %#", (status, body, reason) => {
    expect(() => decodeOAuthResponse(status as number, body as string)).toThrow(
      expect.objectContaining({ reason }),
    );
  });
});
