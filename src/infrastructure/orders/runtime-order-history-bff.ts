import "server-only";

import { loadServerEnvironment } from "../config/server-environment";
import { createServerLogger } from "../logging/server-logger";
import { getRuntimeAccountSelectionService } from "../account/runtime-account-selection";
import { getRuntimeOrderHistoryProvider } from "./runtime-order-history-provider";

let logger: ReturnType<typeof createServerLogger> | undefined;

export function getRuntimeOrderHistoryBffDependencies() {
  logger ??= createServerLogger(loadServerEnvironment());
  return {
    provider: getRuntimeOrderHistoryProvider,
    selection: getRuntimeAccountSelectionService(),
    log(event: string, context: Record<string, unknown>) {
      logger?.info(event, { context });
    },
  };
}
