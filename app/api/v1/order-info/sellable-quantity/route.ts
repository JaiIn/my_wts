import { randomUUID } from "node:crypto";

import { createOrderInfoBffHandler } from "../../../../../src/application/account/order-info-route";
import { getRuntimeOrderInfoBffDependencies } from "../../../../../src/infrastructure/account/runtime-order-info-bff";

export const runtime = "nodejs";

export const GET = createOrderInfoBffHandler("getSellableQuantity", {
  ...getRuntimeOrderInfoBffDependencies(),
  createRequestId: randomUUID,
  now: () => new Date(),
});
