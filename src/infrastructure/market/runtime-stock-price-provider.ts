import "server-only";

import type { ServerEnvironment } from "../config/environment";
import { loadServerEnvironment } from "../config/server-environment";
import { createServerLogger } from "../logging/server-logger";
import { createReadonlyTossClient } from "../toss/readonly-http-client";
import { createTokenManager } from "../toss/token-manager";
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
  const logger = createServerLogger(environment);
  const tokenManager = createTokenManager({
    environment,
    logger,
    transport: {
      async issueToken(request) {
        const response = await fetchImplementation(
          new URL(request.path, environment.tossApiBaseUrl),
          {
            method: request.method,
            headers: { "Content-Type": request.contentType },
            body: request.body,
          },
        );
        return { status: response.status, body: await response.text() };
      },
    },
  });
  const client = createReadonlyTossClient({
    environment,
    tokenManager,
    logger,
    transport: {
      async send(request) {
        const response = await fetchImplementation(request.url, {
          method: "GET",
          headers: request.headers,
          signal: request.signal,
        });
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: await response.text(),
        };
      },
    },
  });
  return createLiveStockPriceProvider(client);
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
