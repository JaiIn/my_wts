import "server-only";

import type { ConditionalOrderHistoryProvider } from "../../application/orders/conditional-order-provider";
import type { ServerEnvironment } from "../config/environment";
import { loadServerEnvironment } from "../config/server-environment";
import { getRuntimeReadonlyTossClient } from "../toss/runtime-readonly-client";
import { createLiveConditionalOrderProvider } from "./live-conditional-order-provider";
import { createMockConditionalOrderProvider } from "./mock-conditional-order-provider";

export type ConditionalOrderProviderSelection = Readonly<{
  implementation: ConditionalOrderHistoryProvider;
  name: "live" | "mock";
}>;

export function selectConditionalOrderProvider(
  environment: ServerEnvironment,
  dependencies: {
    mock: ConditionalOrderHistoryProvider;
    live(): ConditionalOrderHistoryProvider;
  },
): ConditionalOrderProviderSelection {
  return environment.toss.mode === "live"
    ? Object.freeze({ implementation: dependencies.live(), name: "live" })
    : Object.freeze({ implementation: dependencies.mock, name: "mock" });
}

let runtimeSelection: ConditionalOrderProviderSelection | undefined;

export function getRuntimeConditionalOrderProvider(): ConditionalOrderProviderSelection {
  const environment = loadServerEnvironment();
  runtimeSelection ??= selectConditionalOrderProvider(environment, {
    mock: createMockConditionalOrderProvider(),
    live: () =>
      createLiveConditionalOrderProvider(
        getRuntimeReadonlyTossClient(environment, globalThis.fetch),
      ),
  });
  return runtimeSelection;
}
