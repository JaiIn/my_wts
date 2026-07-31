import { randomUUID } from "node:crypto";

import { createOrderDetailBffHandler } from "../../../../../src/application/orders/order-detail-route";
import { getRuntimeOrderHistoryBffDependencies } from "../../../../../src/infrastructure/orders/runtime-order-history-bff";

export const runtime = "nodejs";

export const GET = createOrderDetailBffHandler({
  ...getRuntimeOrderHistoryBffDependencies(),
  createRequestId: randomUUID,
  now: () => new Date(),
});
