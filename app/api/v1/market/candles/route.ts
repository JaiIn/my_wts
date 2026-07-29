import { randomUUID } from "node:crypto";

import { createMarketReferenceBffHandler } from "../../../../../src/application/market/market-reference-route";
import { getRuntimeMarketReferenceBffDependencies } from "../../../../../src/infrastructure/market/runtime-market-bff";

export const runtime = "nodejs";

export const GET = createMarketReferenceBffHandler("getCandles", {
  ...getRuntimeMarketReferenceBffDependencies(),
  createRequestId: randomUUID,
  now: () => new Date(),
});
