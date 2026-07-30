import "server-only";

import { loadServerEnvironment } from "../config/server-environment";
import { createServerLogger } from "../logging/server-logger";
import { getRuntimeAccountSelectionService } from "./runtime-account-selection";
import { getRuntimeHoldingsProvider } from "./runtime-holdings-provider";

let logger: ReturnType<typeof createServerLogger> | undefined;

export function getRuntimeHoldingsBffDependencies() {
  logger ??= createServerLogger(loadServerEnvironment());
  return {
    provider: getRuntimeHoldingsProvider,
    selection: getRuntimeAccountSelectionService(),
    log(event: string, context: Record<string, unknown>) {
      logger?.info(event, { context });
    },
  };
}
