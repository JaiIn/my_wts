import { randomUUID } from "node:crypto";

import { createHoldingsBffHandler } from "../../../../../src/application/account/holdings-route";
import { getRuntimeHoldingsBffDependencies } from "../../../../../src/infrastructure/account/runtime-holdings-bff";

export const runtime = "nodejs";

export const GET = createHoldingsBffHandler({
  ...getRuntimeHoldingsBffDependencies(),
  createRequestId: randomUUID,
  now: () => new Date(),
});
