import { randomUUID } from "node:crypto";

import { createMarketBffHandler } from "../../../../../src/application/market/stock-price-route";
import { getRuntimeMarketBffDependencies } from "../../../../../src/infrastructure/market/runtime-market-bff";

export const runtime = "nodejs";

export const GET = createMarketBffHandler("getStocks", {
  ...getRuntimeMarketBffDependencies(),
  createRequestId: randomUUID,
  now: () => new Date(),
});
