import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const specification = readFileSync(
  resolve(import.meta.dirname, "../../specs/my-wts-bff-openapi.yaml"),
  "utf8",
);

function schemaSection(name: string, nextName: string): string {
  const start = specification.indexOf(`    ${name}:`);
  const end = specification.indexOf(`    ${nextName}:`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return specification.slice(start, end);
}

describe("order simulation BFF schema", () => {
  it("uses exclusive quantity and amount request variants", () => {
    const request = schemaSection(
      "OrderSimulationRequest",
      "QuantityOrderSimulationRequest",
    );
    expect(request).toContain("oneOf:");
    expect(request).toContain(
      '$ref: "#/components/schemas/QuantityOrderSimulationRequest"',
    );
    expect(request).toContain(
      '$ref: "#/components/schemas/AmountOrderSimulationRequest"',
    );
  });

  it("allows optional DAY/CLS only in quantity requests", () => {
    const limit = schemaSection(
      "LimitQuantityOrderSimulationRequest",
      "MarketQuantityOrderSimulationRequest",
    );
    const market = schemaSection(
      "MarketQuantityOrderSimulationRequest",
      "AmountOrderSimulationRequest",
    );
    const amount = schemaSection(
      "AmountOrderSimulationRequest",
      "ConditionalSimulationRequest",
    );

    expect(limit).toContain(
      "timeInForce: { type: string, enum: [DAY, CLS], default: DAY }",
    );
    expect(market).toContain(
      "timeInForce: { type: string, const: DAY, default: DAY }",
    );
    expect(amount).not.toContain("timeInForce");
  });

  it("keeps amount requests strict, positive, US MARKET-compatible BUY/SELL shapes", () => {
    const amount = schemaSection(
      "AmountOrderSimulationRequest",
      "ConditionalSimulationRequest",
    );
    expect(amount).toContain("additionalProperties: false");
    expect(amount).toContain(
      "required: [symbol, side, orderType, orderAmount]",
    );
    expect(amount).toContain("side: { type: string, enum: [BUY, SELL] }");
    expect(amount).toContain("orderType: { type: string, const: MARKET }");
    expect(amount).toContain("orderAmount:");
    expect(amount).not.toMatch(/^\s+(?:quantity|price|timeInForce):/m);
  });

  it("defines the exact calculation result without success or persistence identifiers", () => {
    const response = schemaSection(
      "OrderSimulationResponse",
      "CalculatedDecimal",
    );
    for (const field of [
      "kind",
      "currency",
      "sizingMode",
      "estimatedOrderAmount",
      "estimatedCommission",
      "estimatedCashAmount",
      "cashDirection",
      "taxIncluded",
      "fxApplied",
      "calculationPrice",
      "referencePriceAsOf",
      "submitted",
      "persisted",
    ]) {
      expect(response).toContain(field);
    }
    expect(response).toContain("taxIncluded: { type: boolean, const: false }");
    expect(response).toContain("fxApplied: { type: boolean, const: false }");
    expect(response).toContain("submitted: { type: boolean, const: false }");
    expect(response).toContain("persisted: { type: boolean, const: false }");
    expect(response).not.toMatch(
      /\b(?:orderId|conditionalOrderId|clientOrderId|previewId|executionId)\b/,
    );
  });

  it("does not add trusted calculation context or Toss mutation operations", () => {
    const request = specification.slice(
      specification.indexOf("    OrderSimulationRequest:"),
      specification.indexOf("    ConditionalSimulationRequest:"),
    );
    for (const field of [
      "isRegularSession",
      "referencePrice",
      "referencePriceCurrency",
      "referencePriceAsOf",
      "calculationDateKst",
      "commissionRules",
      "exchangeRate",
    ]) {
      expect(request).not.toContain(field);
    }
    expect(specification).not.toContain("operationId: createOrder");
    expect(specification).not.toContain("operationId: modifyOrder");
    expect(specification).not.toContain("operationId: cancelOrder");
  });
});
