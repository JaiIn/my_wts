import "server-only";

import { AccountSelectionService } from "../../application/account/account-selection-service";
import { authenticateRuntimeSession } from "../auth/runtime-session-service";
import { getRuntimeDatabase } from "../database/runtime-database";
import { getRuntimeAccountRefRegistry } from "./runtime-account-registry";
import { SqliteAccountSelectionPersistence } from "./sqlite-account-selection-persistence";

let runtimeAccountSelectionService: AccountSelectionService | undefined;

export function getRuntimeAccountSelectionService(): AccountSelectionService {
  runtimeAccountSelectionService ??= new AccountSelectionService(
    { authenticate: authenticateRuntimeSession },
    new SqliteAccountSelectionPersistence(getRuntimeDatabase()),
    getRuntimeAccountRefRegistry(),
  );
  return runtimeAccountSelectionService;
}
