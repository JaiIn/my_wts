import { randomUUID } from "node:crypto";

import { createAccountBffHandler } from "../../../../src/application/account/account-route";
import { getRuntimeAccountBffDependencies } from "../../../../src/infrastructure/account/runtime-account-bff";

export const runtime = "nodejs";

export const GET = createAccountBffHandler({
  ...getRuntimeAccountBffDependencies(),
  createRequestId: randomUUID,
  now: () => new Date(),
});
