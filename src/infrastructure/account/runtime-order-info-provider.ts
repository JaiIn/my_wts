import "server-only";

import type { OrderInfoProvider } from "../../application/account/order-info-provider";
import type { ServerEnvironment } from "../config/environment";
import { loadServerEnvironment } from "../config/server-environment";
import { getRuntimeReadonlyTossClient } from "../toss/runtime-readonly-client";
import { createLiveOrderInfoProvider } from "./live-order-info-provider";
import { createMockOrderInfoProvider } from "./mock-order-info-provider";

export type OrderInfoProviderSelection = Readonly<{
  implementation: OrderInfoProvider;
  name: "live" | "mock";
}>;

export function selectOrderInfoProvider(
  environment: ServerEnvironment,
  dependencies: { mock: OrderInfoProvider; live(): OrderInfoProvider },
): OrderInfoProviderSelection {
  return environment.toss.mode === "live"
    ? Object.freeze({ implementation: dependencies.live(), name: "live" })
    : Object.freeze({ implementation: dependencies.mock, name: "mock" });
}

let runtimeSelection: OrderInfoProviderSelection | undefined;

export function getRuntimeOrderInfoProvider(): OrderInfoProviderSelection {
  const environment = loadServerEnvironment();
  runtimeSelection ??= selectOrderInfoProvider(environment, {
    mock: createMockOrderInfoProvider(),
    live: () =>
      createLiveOrderInfoProvider(
        getRuntimeReadonlyTossClient(environment, globalThis.fetch),
      ),
  });
  return runtimeSelection;
}
