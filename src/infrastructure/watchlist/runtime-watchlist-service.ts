import { WatchlistService } from "../../application/watchlist/watchlist-service";
import { UserOwnedDataRepository } from "../database/user-owned-data-repository";
import { getRuntimeDatabase } from "../database/runtime-database";
import { createMockMarketService } from "../market/mock-market-service";

let runtimeWatchlistService: WatchlistService | undefined;

export function getRuntimeWatchlistService(): WatchlistService {
  if (!runtimeWatchlistService) {
    runtimeWatchlistService = new WatchlistService(
      new UserOwnedDataRepository(getRuntimeDatabase()),
      createMockMarketService(),
    );
  }
  return runtimeWatchlistService;
}
