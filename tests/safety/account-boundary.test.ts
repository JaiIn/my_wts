import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("account read-only and browser boundary", () => {
  it("keeps server account implementation outside browser modules", () => {
    const browserSources = [
      read("src/ui/account/account-bff-client.ts"),
      read("src/ui/account/account-settings-panel.tsx"),
      read("src/ui/account/holdings-bff-client.ts"),
      read("src/ui/account/portfolio-panel.tsx"),
      read("src/ui/account/order-info-bff-client.ts"),
      read("src/ui/account/order-info-panel.tsx"),
    ].join("\n");
    expect(browserSources).not.toMatch(
      /accountSeq|account-ref-registry|live-account-provider|runtime-account-provider|readonly-http-client|TokenManager|server-environment|process\.env|Authorization|Cookie|TOSS_CLIENT|openapi\.tossinvest\.com/i,
    );
    expect(browserSources).not.toMatch(/\baccountNo\b/);
  });

  it("keeps order information GET-only without order execution UI", () => {
    const client = read("src/ui/account/order-info-bff-client.ts");
    const panel = read("src/ui/account/order-info-panel.tsx");
    const provider = read(
      "src/infrastructure/account/live-order-info-provider.ts",
    );
    expect(client).toMatch(/order-info\/buying-power/);
    expect(client).toMatch(/order-info\/sellable-quantity/);
    expect(client).toMatch(/order-info\/commissions/);
    expect(client).toContain('method: "GET"');
    expect(client).not.toMatch(/accountSeq|accountRef|accountNo|https?:\/\//);
    expect(provider).toContain("getAccountScoped");
    expect(provider).not.toMatch(/createOrder|modifyOrder|cancelOrder/);
    expect(panel).not.toMatch(/type="submit"|<form|useMutation|매수 버튼|매도 버튼/);
  });

  it("keeps holdings account scope server-only and read-only", () => {
    const client = read("src/ui/account/holdings-bff-client.ts");
    const adapter = read(
      "src/infrastructure/account/live-holdings-provider.ts",
    );
    const http = read("src/infrastructure/toss/readonly-http-client.ts");
    const route = read("app/api/v1/portfolio/holdings/route.ts");
    expect(client).toContain('fetch("/api/v1/portfolio/holdings"');
    expect(client).toContain('method: "GET"');
    expect(client).not.toMatch(/accountRef|accountSeq|accountNo|https?:\/\//);
    expect(adapter).toContain('path: "/api/v1/holdings"');
    expect(adapter).toContain("getAccountScoped");
    expect(http).toContain('const ACCOUNT_HEADER = "x-tossinvest-account"');
    expect(route).toContain("export const GET");
    expect([adapter, route].join("\n")).not.toMatch(
      /createOrder|modifyOrder|cancelOrder|POST|PUT|PATCH|DELETE/,
    );
  });

  it("uses only same-origin account list and selection BFFs from the browser", () => {
    const client = read("src/ui/account/account-bff-client.ts");
    expect(client).toContain('fetch("/api/v1/accounts"');
    expect(client).toContain('fetch("/api/v1/session/account"');
    expect(client).toContain('method: "GET"');
    expect(client).toContain('method: "PUT"');
    expect(client).toContain('method: "DELETE"');
    expect(client).toContain('credentials: "same-origin"');
    expect(client).not.toMatch(/https?:\/\//);
    expect(client).not.toMatch(/POST|PATCH|localStorage|sessionStorage/);
  });

  it("uses GET /api/v1/accounts without an account header upstream", () => {
    const provider = read(
      "src/infrastructure/account/live-account-provider.ts",
    );
    expect(provider).toContain('path: "/api/v1/accounts"');
    expect(provider).toContain('operation: "getAccounts"');
    expect(provider).not.toMatch(
      /X-Tossinvest-Account|accountNo\s*:|accountSeq\s*:/,
    );
  });

  it("exposes only local selection without account reads or Toss mutations", () => {
    const route = read("app/api/v1/accounts/route.ts");
    const selectionRoute = read("app/api/v1/session/account/route.ts");
    const panel = read("src/ui/account/account-settings-panel.tsx");
    expect(route).toContain("export const GET");
    expect(route).not.toMatch(/POST|PUT|PATCH|DELETE/);
    expect(selectionRoute).toContain("export const PUT");
    expect(selectionRoute).toContain("export const DELETE");
    expect(selectionRoute).not.toMatch(
      /holdings|buying-power|X-Tossinvest-Account/,
    );
    expect(panel).not.toMatch(/createOrder|modifyOrder|cancelOrder/);
    expect(panel).not.toMatch(/매수|매도|주문 정정|주문 취소/);
  });

  it("keeps accountRef registry process-only and avoids persistence APIs", () => {
    const registry = read("src/infrastructure/account/account-ref-registry.ts");
    expect(registry).toContain('import "server-only"');
    expect(registry).toContain("randomBytes");
    expect(registry).not.toMatch(
      /sqlite|database|localStorage|sessionStorage|writeFile|appendFile|cookie|logger/i,
    );
  });

  it("stores only accountRef in the SQLite session and never browser storage or cookies", () => {
    const service = read(
      "src/application/account/account-selection-service.ts",
    );
    const persistence = read(
      "src/infrastructure/account/sqlite-account-selection-persistence.ts",
    );
    const client = read("src/ui/account/account-bff-client.ts");
    expect(service).toContain('import "server-only"');
    expect(persistence).toContain('import "server-only"');
    expect(persistence).toContain("updateSelectedAccountRef");
    expect([service, persistence, client].join("\n")).not.toMatch(
      /accountNo|localStorage|sessionStorage|document\.cookie|Set-Cookie|X-Tossinvest-Account/,
    );
  });

  it("does not add an account sequence or real-order environment flag", () => {
    const environment = [
      read(".env.example"),
      read("src/infrastructure/config/environment.ts"),
    ].join("\n");
    expect(environment).not.toMatch(
      /ACCOUNT_SEQ|ALLOW_LIVE_ORDER|ENABLE_REAL_ORDER|NEXT_PUBLIC_TOSS_CLIENT|NEXT_PUBLIC_TOSS_ACCESS_TOKEN/,
    );
  });
});
