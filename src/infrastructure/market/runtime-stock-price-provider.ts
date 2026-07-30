import "server-only";

import type { ServerEnvironment } from "../config/environment";
import { loadServerEnvironment } from "../config/server-environment";
import { getRuntimeReadonlyTossClient } from "../toss/runtime-readonly-client";
import {
  createMockStockPriceProvider,
  type StockPriceProvider,
} from "../../application/market/stock-price-provider";
import { createMockMarketService } from "./mock-market-service";
import { createLiveStockPriceProvider } from "./live-stock-price-provider";

export type StockPriceProviderSelection = Readonly<{
  implementation: StockPriceProvider;
  name: "live" | "mock";
}>;

type FetchFunction = typeof globalThis.fetch;

export function selectStockPriceProvider(
  environment: ServerEnvironment,
  dependencies: {
    mock: StockPriceProvider;
    live(): StockPriceProvider;
  },
): StockPriceProviderSelection {
  return environment.toss.mode === "live"
    ? Object.freeze({ implementation: dependencies.live(), name: "live" })
    : Object.freeze({ implementation: dependencies.mock, name: "mock" });
}

function createRuntimeLiveProvider(
  environment: ServerEnvironment,
  fetchImplementation: FetchFunction,
): StockPriceProvider {
  return createLiveStockPriceProvider(
    getRuntimeReadonlyTossClient(environment, fetchImplementation),
  );
}

let runtimeSelection: StockPriceProviderSelection | undefined;

export function getRuntimeStockPriceProvider(): StockPriceProviderSelection {
  runtimeSelection ??= selectStockPriceProvider(loadServerEnvironment(), {
    mock: createMockStockPriceProvider(createMockMarketService()),
    live: () =>
      createRuntimeLiveProvider(loadServerEnvironment(), globalThis.fetch),
  });
  return runtimeSelection;
}
