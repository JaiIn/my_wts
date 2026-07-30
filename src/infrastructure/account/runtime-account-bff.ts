import "server-only";

import { hashCanonicalSessionToken } from "../../domain/auth/session-token";
import { authenticateRuntimeSession } from "../auth/runtime-session-service";
import { loadServerEnvironment } from "../config/server-environment";
import { createServerLogger } from "../logging/server-logger";
import { getRuntimeAccountRefRegistry } from "./runtime-account-registry";
import { getRuntimeAccountSelectionService } from "./runtime-account-selection";
import { getRuntimeAccountProvider } from "./runtime-account-provider";

let logger: ReturnType<typeof createServerLogger> | undefined;

export function getRuntimeAccountBffDependencies() {
  logger ??= createServerLogger(loadServerEnvironment());
  return {
    provider: getRuntimeAccountProvider,
    registry: getRuntimeAccountRefRegistry(),
    selection: getRuntimeAccountSelectionService(),
    authenticator: {
      authenticate(token: unknown) {
        const user = authenticateRuntimeSession(token);
        const sessionScope = hashCanonicalSessionToken(token);
        if (!sessionScope) {
          throw new Error("INVALID_AUTHENTICATED_SESSION_SCOPE");
        }
        return {
          userId: user.id,
          tokenHash: sessionScope,
          sessionScope: `${user.id}:${sessionScope}`,
        };
      },
    },
    log(event: string, context: Record<string, unknown>) {
      logger?.info(event, { context });
    },
  };
}
