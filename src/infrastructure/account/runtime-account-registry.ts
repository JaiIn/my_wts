import "server-only";

import { AccountRefRegistry } from "./account-ref-registry";

const runtimeAccountRefRegistry = new AccountRefRegistry();

export function getRuntimeAccountRefRegistry(): AccountRefRegistry {
  return runtimeAccountRefRegistry;
}
