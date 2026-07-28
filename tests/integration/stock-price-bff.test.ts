import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginService } from "../../src/application/auth/login-service";
import { SessionService } from "../../src/application/auth/session-service";
import { createMarketBffHandler } from "../../src/application/market/stock-price-route";
import { hashPassword } from "../../src/domain/auth/password";
import { SqliteLoginPersistence } from "../../src/infrastructure/auth/sqlite-login-persistence";
import { SqliteSessionPersistence } from "../../src/infrastructure/auth/sqlite-session-persistence";
import {
  applyMigrations,
  closeDatabase,
  openDatabase,
  type AppDatabase,
} from "../../src/infrastructure/database/database";
import { UserRepository } from "../../src/infrastructure/database/user-repository";
import { createMockMarketService } from "../../src/infrastructure/market/mock-market-service";
import { createMockStockPriceProvider } from "../../src/application/market/stock-price-provider";

const NOW = new Date("2026-07-28T04:00:00.000Z");
const REQUEST_ID = "00000000-0000-4000-8000-000000000304";

describe("stock and price BFF session integration", () => {
  let temporaryDirectory: string;
  let database: AppDatabase;
  let sessionService: SessionService;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "my-wts-market-bff-"));
    database = openDatabase(join(temporaryDirectory, "test.sqlite3"));
    applyMigrations(database);
    sessionService = new SessionService(
      new SqliteSessionPersistence(database),
      { now: () => new Date("2026-07-28T05:00:00.000Z") },
    );
  });

  afterEach(() => {
    closeDatabase(database);
    rmSync(temporaryDirectory, { force: true, recursive: true });
    vi.restoreAllMocks();
  });

  it("serves deterministic mock data only after persisted session validation", async () => {
    const firstToken = await createUserAndSession("first", 11);
    const secondToken = await createUserAndSession("second", 12);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const handler = createHandler();

    for (const token of [firstToken, secondToken]) {
      const response = await handler(request(token));
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(body.data).toEqual([
        expect.objectContaining({
          symbol: "AAPL",
          lastPrice: "185.70",
          currency: "USD",
        }),
      ]);
      expect(JSON.stringify(body)).not.toMatch(
        /passwordHash|sessionToken|Authorization|accountSeq|accountNo/i,
      );
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks missing, modified, and expired sessions before provider access", async () => {
    const token = await createUserAndSession("expired", 13);
    const provider = createMockStockPriceProvider(createMockMarketService());
    const getPrices = vi.fn(provider.getPrices);
    const handler = createMarketBffHandler("getPrices", {
      provider: () => ({
        name: "mock",
        implementation: { getStocks: provider.getStocks, getPrices },
      }),
      authenticator: sessionService,
      createRequestId: () => REQUEST_ID,
      now: () => NOW,
    });

    for (const candidate of [
      undefined,
      `${token.slice(0, -1)}A`,
      Buffer.alloc(32, 99).toString("base64url"),
    ]) {
      const response = await handler(request(candidate));
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("AUTH_REQUIRED");
    }

    database.$client
      .prepare("UPDATE sessions SET expires_at = ?")
      .run("2026-07-28T04:59:59.000Z");
    const expired = await handler(request(token));
    expect(expired.status).toBe(401);
    expect((await expired.json()).error.code).toBe("SESSION_EXPIRED");
    expect(getPrices).not.toHaveBeenCalled();
  });

  function createHandler() {
    const provider = createMockStockPriceProvider(createMockMarketService());
    return createMarketBffHandler("getPrices", {
      provider: () => ({ name: "mock", implementation: provider }),
      authenticator: sessionService,
      createRequestId: () => REQUEST_ID,
      now: () => NOW,
    });
  }

  function request(token?: string) {
    return new NextRequest(
      "http://127.0.0.1:3000/api/v1/market/prices?symbols=AAPL",
      {
        headers: {
          Host: "127.0.0.1:3000",
          ...(token ? { Cookie: `my_wts_session=${token}` } : {}),
        },
      },
    );
  }

  async function createUserAndSession(label: string, tokenByte: number) {
    const username = `market.${label}`;
    new UserRepository(database).create({
      id: `usr_market_${label}`,
      username,
      usernameNormalized: username,
      displayName: `Market ${label}`,
      passwordHash: await hashPassword("x".repeat(10)),
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    const token = Buffer.alloc(32, tokenByte).toString("base64url");
    const result = await new LoginService(
      new SqliteLoginPersistence(database),
      {
        now: () => NOW,
        createId: () => `session-${label}`,
        createToken: () => token,
      },
    ).login({ username, password: "x".repeat(10) });
    return result.session.token;
  }
});
