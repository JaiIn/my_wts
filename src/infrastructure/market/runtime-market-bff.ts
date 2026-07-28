import "server-only";

import { createServerLogger } from "../logging/server-logger";
import { loadServerEnvironment } from "../config/server-environment";
import { authenticateRuntimeSession } from "../auth/runtime-session-service";
import { getRuntimeStockPriceProvider } from "./runtime-stock-price-provider";

let logger: ReturnType<typeof createServerLogger> | undefined;

export function getRuntimeMarketBffDependencies() {
  logger ??= createServerLogger(loadServerEnvironment());
  return {
    provider: getRuntimeStockPriceProvider,
    authenticator: { authenticate: authenticateRuntimeSession },
    log(event: string, context: Record<string, unknown>) {
      logger?.info(event, { context });
    },
  };
}
