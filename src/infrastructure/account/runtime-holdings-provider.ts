import "server-only";

import type { HoldingsProvider } from "../../application/account/holdings-provider";
import type { ServerEnvironment } from "../config/environment";
import { loadServerEnvironment } from "../config/server-environment";
import { getRuntimeReadonlyTossClient } from "../toss/runtime-readonly-client";
import { createLiveHoldingsProvider } from "./live-holdings-provider";
import { createMockHoldingsProvider } from "./mock-holdings-provider";

export type HoldingsProviderSelection = Readonly<{
  implementation: HoldingsProvider;
  name: "live" | "mock";
}>;

export function selectHoldingsProvider(
  environment: ServerEnvironment,
  dependencies: { mock: HoldingsProvider; live(): HoldingsProvider },
): HoldingsProviderSelection {
  return environment.toss.mode === "live"
    ? Object.freeze({ implementation: dependencies.live(), name: "live" })
    : Object.freeze({ implementation: dependencies.mock, name: "mock" });
}

let runtimeSelection: HoldingsProviderSelection | undefined;

export function getRuntimeHoldingsProvider(): HoldingsProviderSelection {
  const environment = loadServerEnvironment();
  runtimeSelection ??= selectHoldingsProvider(environment, {
    mock: createMockHoldingsProvider(),
    live: () =>
      createLiveHoldingsProvider(
        getRuntimeReadonlyTossClient(environment, globalThis.fetch),
      ),
  });
  return runtimeSelection;
}
