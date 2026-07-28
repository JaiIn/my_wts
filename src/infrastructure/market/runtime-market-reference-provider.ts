import "server-only";

import {
  createMockMarketReferenceProvider,
  type MarketReferenceProvider,
} from "../../application/market/market-reference-provider";
import type { ServerEnvironment } from "../config/environment";
import { loadServerEnvironment } from "../config/server-environment";
import { createRuntimeReadonlyTossClient } from "../toss/runtime-readonly-client";
import { createLiveMarketReferenceProvider } from "./live-market-reference-provider";
import { createMockMarketService } from "./mock-market-service";

export type MarketReferenceProviderSelection = Readonly<{
  implementation: MarketReferenceProvider;
  name: "live" | "mock";
}>;

export function selectMarketReferenceProvider(
  environment: ServerEnvironment,
  dependencies: {
    mock: MarketReferenceProvider;
    live(): MarketReferenceProvider;
  },
): MarketReferenceProviderSelection {
  return environment.toss.mode === "live"
    ? Object.freeze({ implementation: dependencies.live(), name: "live" })
    : Object.freeze({ implementation: dependencies.mock, name: "mock" });
}

let runtimeSelection: MarketReferenceProviderSelection | undefined;

export function getRuntimeMarketReferenceProvider(): MarketReferenceProviderSelection {
  runtimeSelection ??= selectMarketReferenceProvider(loadServerEnvironment(), {
    mock: createMockMarketReferenceProvider(createMockMarketService()),
    live: () =>
      createLiveMarketReferenceProvider(
        createRuntimeReadonlyTossClient(
          loadServerEnvironment(),
          globalThis.fetch,
        ),
      ),
  });
  return runtimeSelection;
}
