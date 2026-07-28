import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");

describe("server-only boundary", () => {
  it("poisons client imports for the environment loader and logger", () => {
    for (const path of [
      "src/infrastructure/config/server-environment.ts",
      "src/infrastructure/logging/server-logger.ts",
      "src/infrastructure/toss/token-manager.ts",
      "src/infrastructure/toss/readonly-http-client.ts",
      "src/infrastructure/toss/runtime-readonly-client.ts",
      "src/infrastructure/market/live-stock-price-provider.ts",
      "src/infrastructure/market/live-market-detail-provider.ts",
      "src/infrastructure/market/runtime-stock-price-provider.ts",
      "src/infrastructure/market/runtime-market-detail-provider.ts",
      "src/infrastructure/market/runtime-market-bff.ts",
    ]) {
      expect(readFileSync(resolve(projectRoot, path), "utf8")).toMatch(
        /^import "server-only";/m,
      );
    }

    const require = createRequire(import.meta.url);
    expect(() => require("server-only")).toThrow(
      /cannot be imported from a Client Component/i,
    );
  });

  it("does not expose server configuration through public prefixes or client modules", () => {
    const environmentSource = readFileSync(
      resolve(projectRoot, "src/infrastructure/config/environment.ts"),
      "utf8",
    );
    expect(environmentSource).not.toMatch(/NEXT_PUBLIC_|VITE_/);

    const clientSources = [
      "src/ui/auth/login-form.tsx",
      "src/ui/auth/signup-form.tsx",
      "src/ui/market/market-screen.tsx",
      "src/ui/market/candle-chart.tsx",
    ].map((path) => readFileSync(resolve(projectRoot, path), "utf8"));
    expect(clientSources.join("\n")).not.toMatch(
      /server-environment|server-logger|TOSS_CLIENT|process\.env/,
    );
  });

  it("keeps OAuth tokens in process memory and behind the injected transport", () => {
    const tokenManagerSource = readFileSync(
      resolve(projectRoot, "src/infrastructure/toss/token-manager.ts"),
      "utf8",
    );

    expect(tokenManagerSource).not.toMatch(
      /\b(fetch|localStorage|sessionStorage|writeFile|sqlite|database)\b/,
    );
    expect(tokenManagerSource).toMatch(/OAuthTransport/);
    expect(tokenManagerSource).toMatch(/withAccessToken/);
  });

  it("keeps the readonly Toss client server-only, transport-injected, and mutation-free", () => {
    const clientSource = readFileSync(
      resolve(projectRoot, "src/infrastructure/toss/readonly-http-client.ts"),
      "utf8",
    );

    expect(clientSource).not.toMatch(
      /\b(fetch|https?\.request|localStorage|sessionStorage|writeFile|sqlite|database)\b/,
    );
    expect(clientSource).not.toMatch(
      /createOrder|modifyOrder|cancelOrder|createConditionalOrder|modifyConditionalOrder|cancelConditionalOrder/,
    );
    expect(clientSource).toMatch(/method: "GET"/);
    expect(clientSource).toMatch(/TossHttpTransport/);
  });

  it("keeps market BFF runtime composition server-only and mutation-free", () => {
    const sources = [
      "src/infrastructure/market/live-stock-price-provider.ts",
      "src/infrastructure/market/live-market-detail-provider.ts",
      "src/infrastructure/market/runtime-stock-price-provider.ts",
      "src/infrastructure/market/runtime-market-detail-provider.ts",
      "src/infrastructure/toss/runtime-readonly-client.ts",
      "app/api/v1/market/stocks/route.ts",
      "app/api/v1/market/prices/route.ts",
      "app/api/v1/market/stocks/[symbol]/warnings/route.ts",
      "app/api/v1/market/orderbook/route.ts",
      "app/api/v1/market/trades/route.ts",
    ]
      .map((path) => readFileSync(resolve(projectRoot, path), "utf8"))
      .join("\n");

    expect(sources).not.toMatch(
      /createOrder|modifyOrder|cancelOrder|createConditionalOrder|modifyConditionalOrder|cancelConditionalOrder/,
    );
    expect(sources).not.toMatch(/accountSeq|accountNo/);
    expect(sources).not.toMatch(/method:\s*["'](?:PATCH|PUT|DELETE)["']/);
    expect(sources).toContain("/api/v1/orderbook");
    expect(sources).toContain("/api/v1/trades");
    expect(sources).toContain("/warnings");
    expect(sources).not.toMatch(
      /\/api\/v1\/(?:candles|exchange-rate|market-calendar)/,
    );
  });
});
