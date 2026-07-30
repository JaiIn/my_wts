import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("account read-only and browser boundary", () => {
  it("keeps server account implementation outside browser modules", () => {
    const browserSources = [
      read("src/ui/account/account-bff-client.ts"),
      read("src/ui/account/account-settings-panel.tsx"),
    ].join("\n");
    expect(browserSources).not.toMatch(
      /accountSeq|account-ref-registry|live-account-provider|runtime-account-provider|readonly-http-client|TokenManager|server-environment|process\.env|Authorization|Cookie|TOSS_CLIENT|openapi\.tossinvest\.com/i,
    );
    expect(browserSources).not.toMatch(/\baccountNo\b/);
  });

  it("uses only the same-origin account BFF from the browser", () => {
    const client = read("src/ui/account/account-bff-client.ts");
    expect(client).toContain('fetch("/api/v1/accounts"');
    expect(client).toContain('method: "GET"');
    expect(client).toContain('credentials: "same-origin"');
    expect(client).not.toMatch(/https?:\/\//);
    expect(client).not.toMatch(/POST|PUT|PATCH|DELETE/);
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

  it("does not expose selection, holdings, orders, or mutation routes", () => {
    const route = read("app/api/v1/accounts/route.ts");
    const panel = read("src/ui/account/account-settings-panel.tsx");
    expect(route).toContain("export const GET");
    expect(route).not.toMatch(/POST|PUT|PATCH|DELETE/);
    expect(panel).not.toMatch(/선택하기|selectedAccount|createOrder|modifyOrder|cancelOrder/);
    expect(panel).not.toMatch(/매수|매도|정정|취소/);
  });

  it("keeps accountRef registry process-only and avoids persistence APIs", () => {
    const registry = read(
      "src/infrastructure/account/account-ref-registry.ts",
    );
    expect(registry).toContain('import "server-only"');
    expect(registry).toContain("randomBytes");
    expect(registry).not.toMatch(
      /sqlite|database|localStorage|sessionStorage|writeFile|appendFile|cookie|logger/i,
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
