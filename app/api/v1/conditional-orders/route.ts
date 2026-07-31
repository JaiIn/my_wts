import { randomUUID } from "node:crypto";

import { buildConditionalOrderHistoryBffHandler } from "../../../../src/application/orders/conditional-order-route";
import { getRuntimeConditionalOrderBffDependencies } from "../../../../src/infrastructure/orders/runtime-conditional-order-bff";

export const runtime = "nodejs";

export const GET = buildConditionalOrderHistoryBffHandler({
  ...getRuntimeConditionalOrderBffDependencies(),
  createRequestId: randomUUID,
  now: () => new Date(),
});
