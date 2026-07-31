import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("readonly order history UI boundary", () => {
  it("keeps browser order modules on same-origin BFFs without server secrets", () => {
    const client = [
      source("src/ui/orders/order-history-bff-client.ts"),
      source("src/ui/orders/order-history-screen.tsx"),
      source("src/ui/orders/order-detail-screen.tsx"),
    ].join("\n");
    expect(client).not.toMatch(
      /accountSeq|X-Tossinvest-Account|TokenManager|readonly-http-client|server-environment|process\.env|TOSS_CLIENT|Authorization|openapi\.tossinvest\.com/i,
    );
    expect(client).not.toMatch(/https?:\/\//);
    expect(client).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
    expect(client).not.toMatch(/\buseMutation\b/);
    expect(client).toContain("fetch(`/api/v1/orders?");
    expect(client).toContain("`/api/v1/orders/${");
  });

  it("exports GET only from list and detail order Route Handlers", () => {
    for (const path of [
      "app/api/v1/orders/route.ts",
      "app/api/v1/orders/[orderId]/route.ts",
    ]) {
      const route = source(path);
      expect(route).toMatch(/export const GET/);
      expect(route).not.toMatch(/export const (?:POST|PUT|PATCH|DELETE)\b/);
    }
  });

  it("has no order action handler or mutation transport in production order modules", () => {
    const production = [
      source("src/application/orders/order-detail-route.ts"),
      source("src/infrastructure/orders/live-order-history-provider.ts"),
      source("src/ui/orders/order-history-screen.tsx"),
      source("src/ui/orders/order-detail-screen.tsx"),
    ].join("\n");
    expect(production).not.toMatch(
      /\b(?:createOrder|modifyOrder|cancelOrder|createConditionalOrder|modifyConditionalOrder|cancelConditionalOrder)\b/,
    );
    expect(production).not.toMatch(
      /(?:submit|send|execute)(?:Order|Trade)|orderAction|actionMenu/i,
    );
  });
});
