import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("market browser network boundary", () => {
  it("removes direct server service and repository access from the market page", () => {
    const page = readFileSync(
      resolve(root, "app/(dashboard)/market/page.tsx"),
      "utf8",
    );
    expect(page).not.toMatch(
      /MockMarketService|createMockMarketService|loadMarketScreen|runtime-watchlist|repository|cookies\(|process\.env/,
    );
    expect(page).toContain("MarketScreenBff");
    expect(page).toContain("MarketQueryProvider");
  });

  it("keeps browser market code on typed relative BFF paths", () => {
    const sources = [
      "src/ui/market/market-bff-client.ts",
      "src/ui/market/market-query.ts",
      "src/ui/market/market-query-provider.tsx",
      "src/ui/market/market-screen-bff.tsx",
      "src/ui/market/market-screen.tsx",
    ]
      .map((path) => readFileSync(resolve(root, path), "utf8"))
      .join("\n");

    expect(sources).not.toMatch(
      /openapi\.tossinvest\.com|TokenManager|readonly-http-client|server-environment|process\.env|Authorization|Bearer|accountSeq|accountNo|MockMarketService|mock-market-fixtures|mock-market-service|sqlite|repository/,
    );
    expect(sources).not.toMatch(
      /createOrder|modifyOrder|cancelOrder|createConditionalOrder|modifyConditionalOrder|cancelConditionalOrder/,
    );
    const marketTransport = readFileSync(
      resolve(root, "src/ui/market/market-bff-client.ts"),
      "utf8",
    );
    expect(marketTransport).not.toMatch(
      /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/,
    );
    for (const path of [
      "/api/v1/market/stocks",
      "/api/v1/market/prices",
      "/api/v1/market/orderbook",
      "/api/v1/market/trades",
      "/api/v1/market/candles",
      "/api/v1/market/calendars/",
      "/api/v1/market/exchange-rate",
    ]) {
      expect(sources).toContain(path);
    }
  });
});
