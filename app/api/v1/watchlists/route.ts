import { randomUUID } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import {
  authenticateWatchlistRequest,
  readWatchlistJson,
  type WatchlistAuthenticator,
  watchlistErrorResponse,
  watchlistSuccess,
} from "../../../../src/application/watchlist/watchlist-route";
import type { WatchlistService } from "../../../../src/application/watchlist/watchlist-service";
import { authenticateRuntimeSession } from "../../../../src/infrastructure/auth/runtime-session-service";
import { getRuntimeWatchlistService } from "../../../../src/infrastructure/watchlist/runtime-watchlist-service";

export function createWatchlistsHandlers(
  service: Pick<WatchlistService, "create" | "list">,
  authenticator: WatchlistAuthenticator,
  createRequestId: () => string = randomUUID,
) {
  return {
    async GET(request: NextRequest): Promise<NextResponse> {
      const requestId = createRequestId();
      try {
        const user = authenticateWatchlistRequest(
          request,
          authenticator,
          false,
        );
        return watchlistSuccess(requestId, {
          watchlists: service.list(user.id),
        });
      } catch (error) {
        return watchlistErrorResponse(requestId, error);
      }
    },
    async POST(request: NextRequest): Promise<NextResponse> {
      const requestId = createRequestId();
      try {
        const user = authenticateWatchlistRequest(
          request,
          authenticator,
          true,
        );
        const watchlist = service.create(
          user.id,
          await readWatchlistJson(request),
        );
        return watchlistSuccess(requestId, { watchlist }, 201);
      } catch (error) {
        return watchlistErrorResponse(requestId, error);
      }
    },
  };
}

const handlers = createWatchlistsHandlers(
  getRuntimeWatchlistService(),
  { authenticate: authenticateRuntimeSession },
);

export const GET = handlers.GET;
export const POST = handlers.POST;
