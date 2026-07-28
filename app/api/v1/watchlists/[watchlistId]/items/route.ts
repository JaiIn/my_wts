import { randomUUID } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import {
  authenticateWatchlistRequest,
  readWatchlistJson,
  type WatchlistAuthenticator,
  watchlistErrorResponse,
  watchlistSuccess,
} from "../../../../../../src/application/watchlist/watchlist-route";
import type { WatchlistService } from "../../../../../../src/application/watchlist/watchlist-service";
import { authenticateRuntimeSession } from "../../../../../../src/infrastructure/auth/runtime-session-service";
import { getRuntimeWatchlistService } from "../../../../../../src/infrastructure/watchlist/runtime-watchlist-service";

type RouteContext = { params: Promise<{ watchlistId: string }> };

export function createWatchlistItemHandler(
  service: Pick<WatchlistService, "addItem">,
  authenticator: WatchlistAuthenticator,
  createRequestId: () => string = randomUUID,
) {
  return async function POST(
    request: NextRequest,
    context: RouteContext,
  ): Promise<NextResponse> {
    const requestId = createRequestId();
    try {
      const user = authenticateWatchlistRequest(request, authenticator, true);
      const { watchlistId } = await context.params;
      const watchlist = await service.addItem(
        user.id,
        watchlistId,
        await readWatchlistJson(request),
      );
      return watchlistSuccess(requestId, { watchlist }, 201);
    } catch (error) {
      return watchlistErrorResponse(requestId, error);
    }
  };
}

export const POST = createWatchlistItemHandler(
  getRuntimeWatchlistService(),
  { authenticate: authenticateRuntimeSession },
);
