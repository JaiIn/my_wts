import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

describe("simulation order safety boundary", () => {
  const production = [
    source("src/domain/simulation/order-sizing.ts"),
    source("src/domain/simulation/order-rules.ts"),
  ].join("\n");

  it("keeps validation pure and free of runtime, persistence, and credential access", () => {
    expect(production).not.toMatch(
      /fetch\s*\(|https?:\/\/|process\.env|TOSS_CLIENT|Authorization|TokenManager|accountSeq|localStorage|sessionStorage|indexedDB/i,
    );
    expect(production).not.toMatch(
      /\b(?:database|repository|insert|update|delete|persist|scheduler|worker|setInterval)\b/i,
    );
  });

  it("contains no order mutation operation or transport", () => {
    expect(production).not.toMatch(
      /\b(?:createOrder|modifyOrder|cancelOrder|createConditionalOrder|modifyConditionalOrder|cancelConditionalOrder)\b/,
    );
    expect(production).not.toMatch(
      /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']|\/api\/v1\/orders/,
    );
  });

  it("does not accept regular-session trust as request data", () => {
    const rules = source("src/domain/simulation/order-rules.ts");
    const requestSchema = rules.slice(
      rules.indexOf("const executionRuleInputSchema"),
      rules.indexOf("const trustedContextSchema"),
    );
    expect(requestSchema).not.toContain("isRegularSession");
    expect(rules).toContain("trustedContextSchema");
  });
});
