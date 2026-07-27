import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "./database";
import {
  appSettings,
  type AppSettingRecord,
  type WatchlistItemRecord,
  type WatchlistRecord,
  watchlistItems,
  watchlists,
} from "./schema";

export class UserOwnedDataRepository {
  constructor(private readonly database: AppDatabase) {}

  findSettings(authenticatedUserId: string): AppSettingRecord[] {
    return this.database
      .select()
      .from(appSettings)
      .where(eq(appSettings.userId, authenticatedUserId))
      .all();
  }

  updateSetting(
    authenticatedUserId: string,
    key: string,
    valueJson: string,
    updatedAt: string,
  ): boolean {
    return (
      this.database
        .update(appSettings)
        .set({ valueJson, updatedAt })
        .where(
          and(
            eq(appSettings.userId, authenticatedUserId),
            eq(appSettings.key, key),
          ),
        )
        .run().changes > 0
    );
  }

  deleteSetting(authenticatedUserId: string, key: string): boolean {
    return (
      this.database
        .delete(appSettings)
        .where(
          and(
            eq(appSettings.userId, authenticatedUserId),
            eq(appSettings.key, key),
          ),
        )
        .run().changes > 0
    );
  }

  findWatchlists(authenticatedUserId: string): WatchlistRecord[] {
    return this.database
      .select()
      .from(watchlists)
      .where(eq(watchlists.userId, authenticatedUserId))
      .all();
  }

  renameWatchlist(
    authenticatedUserId: string,
    watchlistId: string,
    name: string,
    updatedAt: string,
  ): boolean {
    return (
      this.database
        .update(watchlists)
        .set({ name, updatedAt })
        .where(
          and(
            eq(watchlists.id, watchlistId),
            eq(watchlists.userId, authenticatedUserId),
          ),
        )
        .run().changes > 0
    );
  }

  deleteWatchlist(authenticatedUserId: string, watchlistId: string): boolean {
    return (
      this.database
        .delete(watchlists)
        .where(
          and(
            eq(watchlists.id, watchlistId),
            eq(watchlists.userId, authenticatedUserId),
          ),
        )
        .run().changes > 0
    );
  }

  findWatchlistItems(
    authenticatedUserId: string,
    watchlistId: string,
  ): WatchlistItemRecord[] {
    return this.database
      .select({
        watchlistId: watchlistItems.watchlistId,
        symbol: watchlistItems.symbol,
        marketCountry: watchlistItems.marketCountry,
        sortOrder: watchlistItems.sortOrder,
        addedAt: watchlistItems.addedAt,
      })
      .from(watchlistItems)
      .innerJoin(watchlists, eq(watchlistItems.watchlistId, watchlists.id))
      .where(
        and(
          eq(watchlists.userId, authenticatedUserId),
          eq(watchlistItems.watchlistId, watchlistId),
        ),
      )
      .all();
  }

  deleteWatchlistItem(
    authenticatedUserId: string,
    watchlistId: string,
    symbol: string,
    marketCountry: string,
  ): boolean {
    const ownedWatchlist = this.database
      .select({ id: watchlists.id })
      .from(watchlists)
      .where(
        and(
          eq(watchlists.id, watchlistId),
          eq(watchlists.userId, authenticatedUserId),
        ),
      )
      .get();
    if (!ownedWatchlist) {
      return false;
    }

    return (
      this.database
        .delete(watchlistItems)
        .where(
          and(
            eq(watchlistItems.watchlistId, watchlistId),
            eq(watchlistItems.symbol, symbol),
            eq(watchlistItems.marketCountry, marketCountry),
          ),
        )
        .run().changes > 0
    );
  }
}
