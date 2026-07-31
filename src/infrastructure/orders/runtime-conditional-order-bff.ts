import "server-only";

import { getRuntimeAccountSelectionService } from "../account/runtime-account-selection";
import { loadServerEnvironment } from "../config/server-environment";
import { createServerLogger } from "../logging/server-logger";
import { getRuntimeConditionalOrderProvider } from "./runtime-conditional-order-provider";

let logger: ReturnType<typeof createServerLogger> | undefined;

export function getRuntimeConditionalOrderBffDependencies() {
  logger ??= createServerLogger(loadServerEnvironment());
  return {
    provider: getRuntimeConditionalOrderProvider,
    selection: getRuntimeAccountSelectionService(),
    log(event: string, context: Record<string, unknown>) {
      logger?.info(event, { context });
    },
  };
}
