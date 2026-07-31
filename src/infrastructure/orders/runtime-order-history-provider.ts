import "server-only";

import type { OrderHistoryProvider } from "../../application/orders/order-history-provider";
import type { ServerEnvironment } from "../config/environment";
import { loadServerEnvironment } from "../config/server-environment";
import { getRuntimeReadonlyTossClient } from "../toss/runtime-readonly-client";
import { createLiveOrderHistoryProvider } from "./live-order-history-provider";
import { createMockOrderHistoryProvider } from "./mock-order-history-provider";

export type OrderHistoryProviderSelection = Readonly<{
  implementation: OrderHistoryProvider;
  name: "live" | "mock";
}>;

export function selectOrderHistoryProvider(
  environment: ServerEnvironment,
  dependencies: {
    mock: OrderHistoryProvider;
    live(): OrderHistoryProvider;
  },
): OrderHistoryProviderSelection {
  return environment.toss.mode === "live"
    ? Object.freeze({ implementation: dependencies.live(), name: "live" })
    : Object.freeze({ implementation: dependencies.mock, name: "mock" });
}

let runtimeSelection: OrderHistoryProviderSelection | undefined;

export function getRuntimeOrderHistoryProvider(): OrderHistoryProviderSelection {
  const environment = loadServerEnvironment();
  runtimeSelection ??= selectOrderHistoryProvider(environment, {
    mock: createMockOrderHistoryProvider(),
    live: () =>
      createLiveOrderHistoryProvider(
        getRuntimeReadonlyTossClient(environment, globalThis.fetch),
      ),
  });
  return runtimeSelection;
}
