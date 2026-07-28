import { randomUUID } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import {
  authenticateWatchlistRequest,
  type WatchlistAuthenticator,
  watchlistErrorResponse,
} from "../../../../../../../../src/application/watchlist/watchlist-route";
import type { WatchlistService } from "../../../../../../../../src/application/watchlist/watchlist-service";
import { authenticateRuntimeSession } from "../../../../../../../../src/infrastructure/auth/runtime-session-service";
import { getRuntimeWatchlistService } from "../../../../../../../../src/infrastructure/watchlist/runtime-watchlist-service";

type RouteContext = {
  params: Promise<{ watchlistId: string; country: string; symbol: string }>;
};

export function createWatchlistItemDeleteHandler(
  service: Pick<WatchlistService, "deleteItem">,
  authenticator: WatchlistAuthenticator,
  createRequestId: () => string = randomUUID,
) {
  return async function DELETE(
    request: NextRequest,
    context: RouteContext,
  ): Promise<NextResponse> {
    const requestId = createRequestId();
    try {
      const user = authenticateWatchlistRequest(request, authenticator, true);
      const { watchlistId, country, symbol } = await context.params;
      service.deleteItem(user.id, watchlistId, country, symbol);
      return new NextResponse(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      return watchlistErrorResponse(requestId, error);
    }
  };
}

export const DELETE = createWatchlistItemDeleteHandler(
  getRuntimeWatchlistService(),
  { authenticate: authenticateRuntimeSession },
);
