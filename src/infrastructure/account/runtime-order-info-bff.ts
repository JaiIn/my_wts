import "server-only";

import { loadServerEnvironment } from "../config/server-environment";
import { createServerLogger } from "../logging/server-logger";
import { getRuntimeAccountSelectionService } from "./runtime-account-selection";
import { getRuntimeOrderInfoProvider } from "./runtime-order-info-provider";

let logger: ReturnType<typeof createServerLogger> | undefined;

export function getRuntimeOrderInfoBffDependencies() {
  logger ??= createServerLogger(loadServerEnvironment());
  return {
    provider: getRuntimeOrderInfoProvider,
    selection: getRuntimeAccountSelectionService(),
    log(event: string, context: Record<string, unknown>) {
      logger?.info(event, { context });
    },
  };
}
