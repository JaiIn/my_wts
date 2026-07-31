import { randomUUID } from "node:crypto";

import { createOrderHistoryBffHandler } from "../../../../src/application/orders/order-history-route";
import { getRuntimeOrderHistoryBffDependencies } from "../../../../src/infrastructure/orders/runtime-order-history-bff";

export const runtime = "nodejs";

export const GET = createOrderHistoryBffHandler({
  ...getRuntimeOrderHistoryBffDependencies(),
  createRequestId: randomUUID,
  now: () => new Date(),
});
