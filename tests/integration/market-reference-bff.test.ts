import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginService } from "../../src/application/auth/login-service";
import { SessionService } from "../../src/application/auth/session-service";
import { createMockMarketReferenceProvider } from "../../src/application/market/market-reference-provider";
import { createMarketReferenceBffHandler } from "../../src/application/market/market-reference-route";
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
const REQUEST_ID = "00000000-0000-4000-8000-000000000306";

describe("market reference BFF session integration", () => {
  let temporaryDirectory: string;
  let database: AppDatabase;
  let sessions: SessionService;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "my-wts-reference-bff-"));
    database = openDatabase(join(temporaryDirectory, "test.sqlite3"));
    applyMigrations(database);
    sessions = new SessionService(new SqliteSessionPersistence(database), {
      now: () => new Date("2026-07-28T05:00:00.000Z"),
    });
  });

  afterEach(() => {
    closeDatabase(database);
    rmSync(temporaryDirectory, { force: true, recursive: true });
    vi.restoreAllMocks();
  });

  it("serves all reference BFFs from deterministic mock data without fetch", async () => {
    const token = await createUserAndSession();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const first = await referenceHandler("getCandles")(
      request(
        "/api/v1/market/candles?symbol=005930&interval=1d&count=100",
        token,
      ),
    );
    const firstData = (await first.json()).data;
    const second = await referenceHandler("getCandles")(
      request(
        `/api/v1/market/candles?symbol=005930&interval=1d&count=100&before=${encodeURIComponent(firstData.nextBefore)}`,
        token,
      ),
    );
    const kr = await referenceHandler("getCalendar")(
      request("/api/v1/market/calendars/KR?date=2025-03-10", token),
      "KR",
    );
    const us = await referenceHandler("getCalendar")(
      request("/api/v1/market/calendars/US?date=2025-03-10", token),
      "US",
    );
    const exchange = await referenceHandler("getExchangeRate")(
      request(
        "/api/v1/market/exchange-rate?baseCurrency=USD&quoteCurrency=KRW",
        token,
      ),
    );

    expect(first.status).toBe(200);
    expect(firstData.candles).toHaveLength(100);
    expect((await second.json()).data.candles[0].timestamp).toBe(
      firstData.nextBefore,
    );
    expect((await kr.json()).data.today.date).toBe("2025-03-10");
    expect((await us.json()).data.today.regularMarket.startTime).toBe(
      "2025-03-10T22:30:00+09:00",
    );
    expect((await exchange.json()).data).toMatchObject({
      baseCurrency: "USD",
      quoteCurrency: "KRW",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks absent, modified, and expired sessions before provider access", async () => {
    const token = await createUserAndSession();
    const provider = createMockMarketReferenceProvider(
      createMockMarketService(),
    );
    const getCandles = vi.fn(provider.getCandles);
    const route = referenceHandler("getCandles", {
      ...provider,
      getCandles,
    });

    for (const candidate of [undefined, `${token.slice(0, -1)}A`]) {
      const response = await route(
        request("/api/v1/market/candles?symbol=AAPL&interval=1d", candidate),
      );
      expect(response.status).toBe(401);
    }
    database.$client
      .prepare("UPDATE sessions SET expires_at = ?")
      .run("2026-07-28T04:59:59.000Z");
    const expired = await route(
      request("/api/v1/market/candles?symbol=AAPL&interval=1d", token),
    );
    expect(expired.status).toBe(401);
    expect(getCandles).not.toHaveBeenCalled();
  });

  it("keeps reference widget failures independent", async () => {
    const token = await createUserAndSession();
    const provider = createMockMarketReferenceProvider(
      createMockMarketService(),
    );
    const failed = await referenceHandler("getCalendar", {
      ...provider,
      getCalendar: async () => {
        throw new MarketDataSourceError("UPSTREAM_UNAVAILABLE", true);
      },
    })(request("/api/v1/market/calendars/KR?date=2025-03-10", token), "KR");
    const succeeded = await referenceHandler(
      "getExchangeRate",
      provider,
    )(
      request(
        "/api/v1/market/exchange-rate?baseCurrency=USD&quoteCurrency=KRW",
        token,
      ),
    );
    expect(failed.status).toBe(503);
    expect(succeeded.status).toBe(200);
  });

  function referenceHandler(
    operation: "getCalendar" | "getCandles" | "getExchangeRate",
    provider = createMockMarketReferenceProvider(createMockMarketService()),
  ) {
    return createMarketReferenceBffHandler(operation, {
      provider: () => ({ name: "mock", implementation: provider }),
      authenticator: sessions,
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

  async function createUserAndSession() {
    const username = "reference.user";
    new UserRepository(database).create({
      id: "usr_reference",
      username,
      usernameNormalized: username,
      displayName: "Reference",
      passwordHash: await hashPassword("x".repeat(10)),
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    const token = Buffer.alloc(32, 26).toString("base64url");
    const result = await new LoginService(
      new SqliteLoginPersistence(database),
      {
        now: () => NOW,
        createId: () => "session-reference",
        createToken: () => token,
      },
    ).login({ username, password: "x".repeat(10) });
    return result.session.token;
  }
});
