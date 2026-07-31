import { randomUUID } from "node:crypto";

import { buildConditionalOrderDetailBffHandler } from "../../../../../src/application/orders/conditional-order-detail-route";
import { getRuntimeConditionalOrderBffDependencies } from "../../../../../src/infrastructure/orders/runtime-conditional-order-bff";

export const runtime = "nodejs";

export const GET = buildConditionalOrderDetailBffHandler({
  ...getRuntimeConditionalOrderBffDependencies(),
  createRequestId: randomUUID,
  now: () => new Date(),
});
