import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginService } from "../../src/application/auth/login-service";
import { SessionService } from "../../src/application/auth/session-service";
import { createMockMarketDetailProvider } from "../../src/application/market/market-detail-provider";
import { createMarketDetailBffHandler } from "../../src/application/market/market-detail-route";
import { MarketDataSourceError } from "../../src/application/market/market-service";
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

const NOW = new Date("2026-07-28T04:00:00.000Z");
const REQUEST_ID = "00000000-0000-4000-8000-000000000305";

describe("market detail BFF session integration", () => {
  let temporaryDirectory: string;
  let database: AppDatabase;
  let sessionService: SessionService;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "my-wts-detail-bff-"));
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

  it("serves all three mock BFFs for isolated persisted user sessions", async () => {
    const firstToken = await createUserAndSession("first", 21);
    const secondToken = await createUserAndSession("second", 22);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    for (const token of [firstToken, secondToken]) {
      const warnings = await detailHandler("getWarnings")(
        request("/api/v1/market/stocks/FWD1/warnings", token),
        "FWD1",
      );
      const orderbook = await detailHandler("getOrderbook")(
        request("/api/v1/market/orderbook?symbol=005930", token),
      );
      const trades = await detailHandler("getTrades")(
        request("/api/v1/market/trades?symbol=005930&count=2", token),
      );

      expect(warnings.status).toBe(200);
      expect((await warnings.json()).data).toHaveLength(2);
      expect(orderbook.status).toBe(200);
      expect((await orderbook.json()).data.asks[0]).toEqual({
        price: "72100",
        volume: "9007199254740993",
      });
      expect(trades.status).toBe(200);
      expect((await trades.json()).data).toHaveLength(2);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks missing, modified, and expired sessions before provider access", async () => {
    const token = await createUserAndSession("expired", 23);
    const delegate = createMockMarketDetailProvider(createMockMarketService());
    const getWarnings = vi.fn(delegate.getWarnings);
    const handler = detailHandler("getWarnings", {
      ...delegate,
      getWarnings,
    });

    for (const candidate of [
      undefined,
      `${token.slice(0, -1)}A`,
      Buffer.alloc(32, 99).toString("base64url"),
    ]) {
      const response = await handler(
        request("/api/v1/market/stocks/AAPL/warnings", candidate),
        "AAPL",
      );
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("AUTH_REQUIRED");
    }

    database.$client
      .prepare("UPDATE sessions SET expires_at = ?")
      .run("2026-07-28T04:59:59.000Z");
    const expired = await handler(
      request("/api/v1/market/stocks/AAPL/warnings", token),
      "AAPL",
    );
    expect(expired.status).toBe(401);
    expect((await expired.json()).error.code).toBe("SESSION_EXPIRED");
    expect(getWarnings).not.toHaveBeenCalled();
  });

  it("keeps widget failures independent", async () => {
    const token = await createUserAndSession("partial", 24);
    const delegate = createMockMarketDetailProvider(createMockMarketService());
    const failingOrderbook = detailHandler("getOrderbook", {
      ...delegate,
      getOrderbook: async () => {
        throw new MarketDataSourceError("UPSTREAM_UNAVAILABLE", true);
      },
    });
    const trades = detailHandler("getTrades", delegate);

    const failed = await failingOrderbook(
      request("/api/v1/market/orderbook?symbol=AAPL", token),
    );
    const succeeded = await trades(
      request("/api/v1/market/trades?symbol=AAPL", token),
    );
    expect(failed.status).toBe(503);
    expect((await failed.json()).error.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(succeeded.status).toBe(200);
    expect((await succeeded.json()).data).toHaveLength(2);
  });

  function detailHandler(
    operation: "getOrderbook" | "getTrades" | "getWarnings",
    provider = createMockMarketDetailProvider(createMockMarketService()),
  ) {
    return createMarketDetailBffHandler(operation, {
      provider: () => ({ name: "mock", implementation: provider }),
      authenticator: sessionService,
      createRequestId: () => REQUEST_ID,
      now: () => NOW,
    });
  }

  function request(path: string, token?: string) {
    return new NextRequest(`http://127.0.0.1:3000${path}`, {
      headers: {
        Host: "127.0.0.1:3000",
        ...(token ? { Cookie: `my_wts_session=${token}` } : {}),
      },
    });
  }

  async function createUserAndSession(label: string, tokenByte: number) {
    const username = `detail.${label}`;
    new UserRepository(database).create({
      id: `usr_detail_${label}`,
      username,
      usernameNormalized: username,
      displayName: `Detail ${label}`,
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
