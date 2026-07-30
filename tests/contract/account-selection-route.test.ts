import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { AccountReferenceInvalidError } from "../../src/application/account/account-selection-service";
import { createAccountSelectionHandlers } from "../../src/application/account/account-selection-route";
import { SessionAuthenticationError } from "../../src/application/auth/session-service";

const SESSION = Buffer.alloc(32, 73).toString("base64url");
const ACCOUNT_REF = "acct_contract_selection_00000001";
const REQUEST_ID = "00000000-0000-4000-8000-000000000503";

function request(
  method: "PUT" | "DELETE",
  options: {
    body?: string;
    contentType?: string;
    host?: string;
    origin?: string;
    path?: string;
    authenticated?: boolean;
  } = {},
) {
  return new NextRequest(
    `http://127.0.0.1:3000${options.path ?? "/api/v1/session/account"}`,
    {
      method,
      headers: {
        Host: options.host ?? "127.0.0.1:3000",
        Origin: options.origin ?? "http://127.0.0.1:3000",
        ...(options.contentType ? { "Content-Type": options.contentType } : {}),
        ...(options.authenticated === false
          ? {}
          : { Cookie: `my_wts_session=${SESSION}` }),
      },
      body: options.body,
    },
  );
}

describe("PUT/DELETE /api/v1/session/account contract", () => {
  it("returns 204 and no-store for explicit selection and idempotent clear", async () => {
    const service = { select: vi.fn(), clear: vi.fn() };
    const handlers = createAccountSelectionHandlers(
      service as never,
      () => REQUEST_ID,
    );
    const put = await handlers.PUT(
      request("PUT", {
        contentType: "application/json",
        body: JSON.stringify({ accountRef: ACCOUNT_REF }),
      }),
    );
    const remove = await handlers.DELETE(request("DELETE"));
    expect(put.status).toBe(204);
    expect(remove.status).toBe(204);
    expect(put.headers.get("cache-control")).toBe("no-store");
    expect(put.headers.get("x-request-id")).toBe(REQUEST_ID);
    expect(await put.text()).toBe("");
    expect(service.select).toHaveBeenCalledWith(SESSION, ACCOUNT_REF);
    expect(service.clear).toHaveBeenCalledWith(SESSION);
  });

  it.each([
    {
      body: { accountRef: ACCOUNT_REF, extra: true },
      label: "unknown field",
    },
    { body: {}, label: "missing field" },
    { body: { accountRef: 1 }, label: "wrong type" },
  ])("rejects strict JSON: $label", async ({ body }) => {
    const service = { select: vi.fn(), clear: vi.fn() };
    const handlers = createAccountSelectionHandlers(
      service as never,
      () => REQUEST_ID,
    );
    const response = await handlers.PUT(
      request("PUT", {
        contentType: "application/json",
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
    expect(service.select).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON, content type, query, Host, Origin, and DELETE body", async () => {
    const service = { select: vi.fn(), clear: vi.fn() };
    const handlers = createAccountSelectionHandlers(
      service as never,
      () => REQUEST_ID,
    );
    const cases = [
      handlers.PUT(
        request("PUT", { contentType: "application/json", body: "{" }),
      ),
      handlers.PUT(request("PUT", { contentType: "text/plain", body: "{}" })),
      handlers.PUT(
        request("PUT", {
          path: "/api/v1/session/account?x=1",
          contentType: "application/json",
          body: JSON.stringify({ accountRef: ACCOUNT_REF }),
        }),
      ),
      handlers.PUT(
        request("PUT", {
          host: "example.invalid",
          contentType: "application/json",
          body: JSON.stringify({ accountRef: ACCOUNT_REF }),
        }),
      ),
      handlers.PUT(
        request("PUT", {
          origin: "https://example.invalid",
          contentType: "application/json",
          body: JSON.stringify({ accountRef: ACCOUNT_REF }),
        }),
      ),
      handlers.DELETE(request("DELETE", { body: "{}" })),
    ];
    const responses = await Promise.all(cases);
    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400, 403, 403, 400,
    ]);
    expect(service.select).not.toHaveBeenCalled();
    expect(service.clear).not.toHaveBeenCalled();
  });

  it("uses the same safe 409 for arbitrary, stale, and cross-session references", async () => {
    const handlers = createAccountSelectionHandlers(
      {
        select() {
          throw new AccountReferenceInvalidError();
        },
        clear: vi.fn(),
      } as never,
      () => REQUEST_ID,
    );
    const response = await handlers.PUT(
      request("PUT", {
        contentType: "application/json",
        body: JSON.stringify({ accountRef: ACCOUNT_REF }),
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.error.code).toBe("ACCOUNT_REF_INVALID");
    expect(JSON.stringify(body)).not.toMatch(
      /accountSeq|accountNo|cookie|token|sqlite|stack/i,
    );
  });

  it("requires an authenticated SQLite session", async () => {
    const handlers = createAccountSelectionHandlers(
      {
        select() {
          throw new SessionAuthenticationError("AUTH_REQUIRED");
        },
        clear() {
          throw new SessionAuthenticationError("AUTH_REQUIRED");
        },
      } as never,
      () => REQUEST_ID,
    );
    const response = await handlers.PUT(
      request("PUT", {
        authenticated: false,
        contentType: "application/json",
        body: JSON.stringify({ accountRef: ACCOUNT_REF }),
      }),
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("AUTH_REQUIRED");
  });
});
