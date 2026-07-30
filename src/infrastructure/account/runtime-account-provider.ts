import "server-only";

import type { AccountProvider } from "../../application/account/account-provider";
import type { ServerEnvironment } from "../config/environment";
import { loadServerEnvironment } from "../config/server-environment";
import { getRuntimeReadonlyTossClient } from "../toss/runtime-readonly-client";
import { createLiveAccountProvider } from "./live-account-provider";
import { createMockAccountProvider } from "./mock-account-provider";

export type AccountProviderSelection = Readonly<{
  implementation: AccountProvider;
  name: "live" | "mock";
}>;

export function selectAccountProvider(
  environment: ServerEnvironment,
  dependencies: {
    mock: AccountProvider;
    live(): AccountProvider;
  },
): AccountProviderSelection {
  return environment.toss.mode === "live"
    ? Object.freeze({ implementation: dependencies.live(), name: "live" })
    : Object.freeze({ implementation: dependencies.mock, name: "mock" });
}

let runtimeSelection: AccountProviderSelection | undefined;

export function getRuntimeAccountProvider(): AccountProviderSelection {
  const environment = loadServerEnvironment();
  runtimeSelection ??= selectAccountProvider(environment, {
    mock: createMockAccountProvider(),
    live: () =>
      createLiveAccountProvider(
        getRuntimeReadonlyTossClient(environment, globalThis.fetch),
      ),
  });
  return runtimeSelection;
}
