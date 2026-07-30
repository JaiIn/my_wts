import "server-only";

import type { MarketDetailProvider } from "../../application/market/market-detail-provider";
import { createMockMarketDetailProvider } from "../../application/market/market-detail-provider";
import type { ServerEnvironment } from "../config/environment";
import { loadServerEnvironment } from "../config/server-environment";
import { getRuntimeReadonlyTossClient } from "../toss/runtime-readonly-client";
import { createLiveMarketDetailProvider } from "./live-market-detail-provider";
import { createMockMarketService } from "./mock-market-service";

export type MarketDetailProviderSelection = Readonly<{
  implementation: MarketDetailProvider;
  name: "live" | "mock";
}>;

export function selectMarketDetailProvider(
  environment: ServerEnvironment,
  dependencies: {
    mock: MarketDetailProvider;
    live(): MarketDetailProvider;
  },
): MarketDetailProviderSelection {
  return environment.toss.mode === "live"
    ? Object.freeze({ implementation: dependencies.live(), name: "live" })
    : Object.freeze({ implementation: dependencies.mock, name: "mock" });
}

let runtimeSelection: MarketDetailProviderSelection | undefined;

export function getRuntimeMarketDetailProvider(): MarketDetailProviderSelection {
  runtimeSelection ??= selectMarketDetailProvider(loadServerEnvironment(), {
    mock: createMockMarketDetailProvider(createMockMarketService()),
    live: () =>
      createLiveMarketDetailProvider(
        getRuntimeReadonlyTossClient(loadServerEnvironment(), globalThis.fetch),
      ),
  });
  return runtimeSelection;
}
