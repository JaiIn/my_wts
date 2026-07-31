import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

const browserFiles = [
  "src/ui/orders/conditional-order-bff-client.ts",
  "src/ui/orders/conditional-order-query-policy.ts",
  "src/ui/orders/conditional-order-history-screen.tsx",
  "src/ui/orders/conditional-order-detail-screen.tsx",
] as const;

const productionFiles = [
  ...browserFiles,
  "src/application/orders/conditional-order-detail-route.ts",
  "src/application/orders/conditional-order-id.ts",
  "src/application/orders/conditional-order-provider.ts",
  "src/application/orders/conditional-order-query.ts",
  "src/application/orders/conditional-order-route.ts",
  "src/infrastructure/orders/live-conditional-order-provider.ts",
  "src/infrastructure/orders/mock-conditional-order-provider.ts",
  "src/infrastructure/orders/runtime-conditional-order-provider.ts",
  "app/api/v1/conditional-orders/route.ts",
  "app/api/v1/conditional-orders/[conditionalOrderId]/route.ts",
] as const;

describe("conditional order history readonly boundary", () => {
  it("keeps browser code on typed same-origin BFF reads", () => {
    const combined = browserFiles.map(source).join("\n");
    expect(combined).not.toMatch(
      /server-environment|runtime-conditional|readonly-http-client|TokenManager|process\.env|openapi\.tossinvest\.com|Authorization|X-Tossinvest-Account|accountSeq/i,
    );
    expect(combined).not.toMatch(/localStorage|sessionStorage|indexedDB/i);
    expect(combined).toContain("/api/v1/conditional-orders");
  });

  it("exports GET only from both conditional history route handlers", () => {
    for (const path of [
      "app/api/v1/conditional-orders/route.ts",
      "app/api/v1/conditional-orders/[conditionalOrderId]/route.ts",
    ]) {
      const value = source(path);
      expect(value).toMatch(/export const GET\b/);
      expect(value).not.toMatch(
        /export\s+(?:async\s+function|const)\s+(?:POST|PUT|PATCH|DELETE)\b/,
      );
    }
  });

  it("has no conditional mutation, monitor, scheduler, or trigger executor", () => {
    const combined = productionFiles.map(source).join("\n");
    expect(combined).not.toMatch(
      /\b(?:createConditionalOrder|modifyConditionalOrder|cancelConditionalOrder)\b/,
    );
    expect(combined).not.toMatch(
      /\b(?:setInterval|setTimeout|cron|scheduler|backgroundWorker|executeTrigger|monitorPrice)\s*\(/,
    );
    expect(combined).not.toMatch(
      /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/,
    );
  });

  it("contains no clickable conditional order action or submit form", () => {
    const combined = browserFiles.map(source).join("\n");
    expect(combined).not.toMatch(/onSubmit|type=["']submit["']/);
    expect(combined).not.toMatch(
      /onClick\s*=\s*\{[^}]*\b(?:register|modify|cancel|activate|pause|restart|trigger|submit)/i,
    );
  });
});
