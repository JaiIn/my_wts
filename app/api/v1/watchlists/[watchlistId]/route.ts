import { randomUUID } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import {
  authenticateWatchlistRequest,
  readWatchlistJson,
  type WatchlistAuthenticator,
  watchlistErrorResponse,
  watchlistSuccess,
} from "../../../../../src/application/watchlist/watchlist-route";
import type { WatchlistService } from "../../../../../src/application/watchlist/watchlist-service";
import { authenticateRuntimeSession } from "../../../../../src/infrastructure/auth/runtime-session-service";
import { getRuntimeWatchlistService } from "../../../../../src/infrastructure/watchlist/runtime-watchlist-service";

type RouteContext = { params: Promise<{ watchlistId: string }> };

export function createWatchlistHandlers(
  service: Pick<WatchlistService, "delete" | "update">,
  authenticator: WatchlistAuthenticator,
  createRequestId: () => string = randomUUID,
) {
  return {
    async PATCH(
      request: NextRequest,
      context: RouteContext,
    ): Promise<NextResponse> {
      const requestId = createRequestId();
      try {
        const user = authenticateWatchlistRequest(
          request,
          authenticator,
          true,
        );
        const { watchlistId } = await context.params;
        const watchlist = service.update(
          user.id,
          watchlistId,
          await readWatchlistJson(request),
        );
        return watchlistSuccess(requestId, { watchlist });
      } catch (error) {
        return watchlistErrorResponse(requestId, error);
      }
    },
    async DELETE(
      request: NextRequest,
      context: RouteContext,
    ): Promise<NextResponse> {
      const requestId = createRequestId();
      try {
        const user = authenticateWatchlistRequest(
          request,
          authenticator,
          true,
        );
        const { watchlistId } = await context.params;
        service.delete(user.id, watchlistId);
        return new NextResponse(null, {
          status: 204,
          headers: { "Cache-Control": "no-store" },
        });
      } catch (error) {
        return watchlistErrorResponse(requestId, error);
      }
    },
  };
}

const handlers = createWatchlistHandlers(
  getRuntimeWatchlistService(),
  { authenticate: authenticateRuntimeSession },
);

export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
