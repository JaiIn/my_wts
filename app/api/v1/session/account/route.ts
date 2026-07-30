import { randomUUID } from "node:crypto";

import { createAccountSelectionHandlers } from "../../../../../src/application/account/account-selection-route";
import { getRuntimeAccountSelectionService } from "../../../../../src/infrastructure/account/runtime-account-selection";

export const runtime = "nodejs";

const handlers = createAccountSelectionHandlers(
  getRuntimeAccountSelectionService(),
  randomUUID,
);

export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
