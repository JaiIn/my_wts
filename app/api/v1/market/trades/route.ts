import { createMarketDetailBffHandler } from "../../../../../src/application/market/market-detail-route";
import { getRuntimeMarketDetailBffDependencies } from "../../../../../src/infrastructure/market/runtime-market-bff";

export const runtime = "nodejs";

export const GET = createMarketDetailBffHandler("getTrades", {
  ...getRuntimeMarketDetailBffDependencies(),
  createRequestId: randomUUID,
  now: () => new Date(),
});
import { randomUUID } from "node:crypto";
