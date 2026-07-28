import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SessionAuthenticationError } from "../../src/application/auth/session-service";
import { WatchlistService } from "../../src/application/watchlist/watchlist-service";
import {
  applyMigrations,
  closeDatabase,
  openDatabase,
  type AppDatabase,
} from "../../src/infrastructure/database/database";
import { UserOwnedDataRepository } from "../../src/infrastructure/database/user-owned-data-repository";
import { UserRepository } from "../../src/infrastructure/database/user-repository";
import { createMockMarketService } from "../../src/infrastructure/market/mock-market-service";
import { createWatchlistsHandlers } from "../../app/api/v1/watchlists/route";
import { createWatchlistHandlers } from "../../app/api/v1/watchlists/[watchlistId]/route";
import { createWatchlistItemHandler } from "../../app/api/v1/watchlists/[watchlistId]/items/route";
import { createWatchlistItemDeleteHandler } from "../../app/api/v1/watchlists/[watchlistId]/items/[country]/[symbol]/route";

const USER_A = "usr_route_a";
const USER_B = "usr_route_b";
const LIST_A = "00000000-0000-4000-8000-000000000011";
const LIST_B = "00000000-0000-4000-8000-000000000012";
const CREATED_LIST = "00000000-0000-4000-8000-000000000013";
const REQUEST_ID = "00000000-0000-4000-8000-000000000099";
const ORIGIN = "http://127.0.0.1:3000";
const NOW = new Date("2026-07-28T00:00:00.000Z");

function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    origin?: string;
    contentType?: string;
  } = {},
) {
  const headers = new Headers({
    host: "127.0.0.1:3000",
    cookie: "my_wts_session=<route-session>",
  });
  if (options.origin !== undefined) headers.set("origin", options.origin);
  if (options.body !== undefined) {
    headers.set("content-type", options.contentType ?? "application/json");
  }
  return new NextRequest(`${ORIGIN}${path}`, {
    method: options.method ?? "GET",
    headers,
    body:
      options.body === undefined
        ? undefined
        : typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body),
  });
}

const authenticator = {
  authenticate() {
    return { id: USER_A, username: "route.a", displayName: "Route A" };
  },
};

describe("watchlist BFF routes", () => {
  let temporaryDirectory: string;
  let database: AppDatabase;
  let service: WatchlistService;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "my-wts-watchlist-route-"));
    database = openDatabase(join(temporaryDirectory, "test.sqlite3"));
    applyMigrations(database);
    const users = new UserRepository(database);
    for (const [id, username] of [
      [USER_A, "route.a"],
      [USER_B, "route.b"],
    ]) {
      users.create({
        id,
        username,
        usernameNormalized: username,
        displayName: username,
        passwordHash: "test-only-hash",
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      });
    }
    const insert = database.$client.prepare(
      "INSERT INTO watchlists (id, user_id, name, sort_order, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    insert.run(
      LIST_A,
      USER_A,
      "기본 관심종목",
      0,
      1,
      NOW.toISOString(),
      NOW.toISOString(),
    );
    insert.run(
      LIST_B,
      USER_B,
      "기본 관심종목",
      0,
      1,
      NOW.toISOString(),
      NOW.toISOString(),
    );
    service = new WatchlistService(
      new UserOwnedDataRepository(database),
      createMockMarketService(),
      { now: () => NOW, createId: () => CREATED_LIST },
    );
  });

  afterEach(() => {
    closeDatabase(database);
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  it("lists only the authenticated user's data with no-store", async () => {
    const handlers = createWatchlistsHandlers(
      service,
      authenticator,
      () => REQUEST_ID,
    );
    const response = await handlers.GET(request("/api/v1/watchlists"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data.watchlists).toEqual([
      expect.objectContaining({ id: LIST_A, isDefault: true, items: [] }),
    ]);
    expect(JSON.stringify(body)).not.toMatch(
      /password|session|token|sql|sqlite|stack|usr_route_b/i,
    );
  });

  it("creates, updates, and deletes a non-default list through frozen methods", async () => {
    const collection = createWatchlistsHandlers(
      service,
      authenticator,
      () => REQUEST_ID,
    );
    const member = createWatchlistHandlers(
      service,
      authenticator,
      () => REQUEST_ID,
    );
    const created = await collection.POST(
      request("/api/v1/watchlists", {
        method: "POST",
        origin: ORIGIN,
        body: { name: "미국 주식", sortOrder: 2 },
      }),
    );
    expect(created.status).toBe(201);
    expect((await created.json()).data.watchlist.id).toBe(CREATED_LIST);

    const updated = await member.PATCH(
      request(`/api/v1/watchlists/${CREATED_LIST}`, {
        method: "PATCH",
        origin: ORIGIN,
        body: { name: "미국 장기", sortOrder: 1 },
      }),
      { params: Promise.resolve({ watchlistId: CREATED_LIST }) },
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).data.watchlist).toMatchObject({
      name: "미국 장기",
      sortOrder: 1,
    });

    const deleted = await member.DELETE(
      request(`/api/v1/watchlists/${CREATED_LIST}`, {
        method: "DELETE",
        origin: ORIGIN,
      }),
      { params: Promise.resolve({ watchlistId: CREATED_LIST }) },
    );
    expect(deleted.status).toBe(204);
    expect(service.list(USER_A).map(({ id }) => id)).toEqual([LIST_A]);
  });

  it("adds, conflicts, and deletes a canonical owner item", async () => {
    const add = createWatchlistItemHandler(
      service,
      authenticator,
      () => REQUEST_ID,
    );
    const remove = createWatchlistItemDeleteHandler(
      service,
      authenticator,
      () => REQUEST_ID,
    );
    const added = await add(
      request(`/api/v1/watchlists/${LIST_A}/items`, {
        method: "POST",
        origin: ORIGIN,
        body: { symbol: " aapl ", marketCountry: "us" },
      }),
      { params: Promise.resolve({ watchlistId: LIST_A }) },
    );
    expect(added.status).toBe(201);
    expect((await added.json()).data.watchlist.items).toEqual([
      expect.objectContaining({ symbol: "AAPL", marketCountry: "US" }),
    ]);

    const duplicate = await add(
      request(`/api/v1/watchlists/${LIST_A}/items`, {
        method: "POST",
        origin: ORIGIN,
        body: { symbol: "AAPL", marketCountry: "US" },
      }),
      { params: Promise.resolve({ watchlistId: LIST_A }) },
    );
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error.code).toBe("CONFLICT");

    const removed = await remove(
      request(`/api/v1/watchlists/${LIST_A}/items/US/AAPL`, {
        method: "DELETE",
        origin: ORIGIN,
      }),
      {
        params: Promise.resolve({
          watchlistId: LIST_A,
          country: "US",
          symbol: "AAPL",
        }),
      },
    );
    expect(removed.status).toBe(204);
    expect(service.list(USER_A)[0]?.items).toEqual([]);
  });

  it("rejects unauthenticated, cross-origin, malformed, unknown, and oversized input", async () => {
    const unauthenticated = createWatchlistsHandlers(
      service,
      {
        authenticate() {
          throw new SessionAuthenticationError("AUTH_REQUIRED");
        },
      },
      () => REQUEST_ID,
    );
    expect(
      (await unauthenticated.GET(request("/api/v1/watchlists"))).status,
    ).toBe(401);

    const handlers = createWatchlistsHandlers(
      service,
      authenticator,
      () => REQUEST_ID,
    );
    expect(
      (
        await handlers.POST(
          request("/api/v1/watchlists", {
            method: "POST",
            origin: "https://evil.example",
            body: { name: "evil" },
          }),
        )
      ).status,
    ).toBe(403);

    for (const body of [
      "{",
      { name: "valid", userId: USER_B },
      { name: 1 },
      { name: "x".repeat(65 * 1024) },
    ]) {
      const response = await handlers.POST(
        request("/api/v1/watchlists", {
          method: "POST",
          origin: ORIGIN,
          body,
        }),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
    }
  });

  it("returns the same 404 for missing and foreign watchlists and protects default deletion", async () => {
    const member = createWatchlistHandlers(
      service,
      authenticator,
      () => REQUEST_ID,
    );
    for (const id of [LIST_B, "00000000-0000-4000-8000-000000000099"]) {
      const response = await member.PATCH(
        request(`/api/v1/watchlists/${id}`, {
          method: "PATCH",
          origin: ORIGIN,
          body: { name: "위조" },
        }),
        { params: Promise.resolve({ watchlistId: id }) },
      );
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("NOT_FOUND");
    }
    const defaultDelete = await member.DELETE(
      request(`/api/v1/watchlists/${LIST_A}`, {
        method: "DELETE",
        origin: ORIGIN,
      }),
      { params: Promise.resolve({ watchlistId: LIST_A }) },
    );
    expect(defaultDelete.status).toBe(409);
  });

  it("maps internal failures to a safe 500 response", async () => {
    const handlers = createWatchlistsHandlers(
      {
        list() {
          throw new Error(
            "C:\\private\\watchlist.sqlite3 SQL token secret stack",
          );
        },
        create() {
          throw new Error("not used");
        },
      },
      authenticator,
      () => REQUEST_ID,
    );
    const response = await handlers.GET(request("/api/v1/watchlists"));
    const serialized = JSON.stringify(await response.json());
    expect(response.status).toBe(500);
    expect(serialized).not.toMatch(/private|sqlite|sql|token|secret|stack/i);
  });
});
