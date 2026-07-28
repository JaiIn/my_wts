import { cookies } from "next/headers";

import type { Watchlist } from "../../../src/domain/watchlist/watchlist";
import {
  failedMarketScreen,
  loadMarketScreen,
} from "../../../src/application/market/market-screen";
import { createMockMarketService } from "../../../src/infrastructure/market/mock-market-service";
import { authenticateRuntimeSession } from "../../../src/infrastructure/auth/runtime-session-service";
import { getRuntimeWatchlistService } from "../../../src/infrastructure/watchlist/runtime-watchlist-service";
import { MarketScreen } from "../../../src/ui/market/market-screen";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  let screenData;
  try {
    screenData = await loadMarketScreen(createMockMarketService());
  } catch (error) {
    screenData = failedMarketScreen(error);
  }

  let watchlists: Watchlist[] = [];
  try {
    const cookieStore = await cookies();
    const user = authenticateRuntimeSession(
      cookieStore.get("my_wts_session")?.value,
    );
    watchlists = getRuntimeWatchlistService().list(user.id);
  } catch {
    watchlists = [];
  }

  return <MarketScreen {...screenData} watchlists={watchlists} />;
}
