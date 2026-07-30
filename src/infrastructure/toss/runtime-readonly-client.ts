import "server-only";

import type { ServerEnvironment } from "../config/environment";
import { createServerLogger } from "../logging/server-logger";
import {
  createReadonlyTossClient,
  type ReadonlyTossClient,
} from "./readonly-http-client";
import { createTokenManager } from "./token-manager";

type FetchFunction = typeof globalThis.fetch;
const RUNTIME_CLIENT_KEY = Symbol.for("my_wts.runtimeReadonlyTossClient");

type RuntimeGlobal = typeof globalThis & {
  [RUNTIME_CLIENT_KEY]?: ReadonlyTossClient;
};

export function createRuntimeReadonlyTossClient(
  environment: ServerEnvironment,
  fetchImplementation: FetchFunction,
): ReadonlyTossClient {
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
  return createReadonlyTossClient({
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
}

export function getRuntimeReadonlyTossClient(
  environment: ServerEnvironment,
  fetchImplementation: FetchFunction,
): ReadonlyTossClient {
  const runtimeGlobal = globalThis as RuntimeGlobal;
  runtimeGlobal[RUNTIME_CLIENT_KEY] ??= createRuntimeReadonlyTossClient(
    environment,
    fetchImplementation,
  );
  return runtimeGlobal[RUNTIME_CLIENT_KEY];
}
