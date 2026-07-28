import { randomUUID } from "node:crypto";

import { type NextRequest } from "next/server";

import { createMarketReferenceBffHandler } from "../../../../../../src/application/market/market-reference-route";
import { getRuntimeMarketReferenceBffDependencies } from "../../../../../../src/infrastructure/market/runtime-market-bff";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ country: string }> };
const handler = createMarketReferenceBffHandler("getCalendar", {
  ...getRuntimeMarketReferenceBffDependencies(),
  createRequestId: randomUUID,
  now: () => new Date(),
});

export async function GET(request: NextRequest, context: RouteContext) {
  const { country } = await context.params;
  return handler(request, country);
}
