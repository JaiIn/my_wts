import { type NextRequest } from "next/server";

import { createMarketDetailBffHandler } from "../../../../../../../src/application/market/market-detail-route";
import { getRuntimeMarketDetailBffDependencies } from "../../../../../../../src/infrastructure/market/runtime-market-bff";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ symbol: string }> };
const handler = createMarketDetailBffHandler("getWarnings", {
  ...getRuntimeMarketDetailBffDependencies(),
  createRequestId: randomUUID,
  now: () => new Date(),
});

export async function GET(request: NextRequest, context: RouteContext) {
  const { symbol } = await context.params;
  return handler(request, symbol);
}
import { randomUUID } from "node:crypto";
