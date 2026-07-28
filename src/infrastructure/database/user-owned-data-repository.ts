import { and, asc, eq, max } from "drizzle-orm";

import type {
  Watchlist,
  WatchlistPersistence,
} from "../../application/watchlist/watchlist-service";
import type { MarketCountry } from "../../domain/watchlist/watchlist";
import type { AppDatabase } from "./database";
import {
  appSettings,
  type AppSettingRecord,
  type WatchlistItemRecord,
  type WatchlistRecord,
  watchlistItems,
  watchlists,
} from "./schema";

export class UserOwnedDataRepository implements WatchlistPersistence {
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
      .orderBy(asc(watchlists.sortOrder), asc(watchlists.id))
      .all();
  }

  list(authenticatedUserId: string): Watchlist[] {
    return this.findWatchlists(authenticatedUserId).map((watchlist) => ({
      id: watchlist.id,
      name: watchlist.name,
      sortOrder: watchlist.sortOrder,
      isDefault: watchlist.isDefault === 1,
      createdAt: watchlist.createdAt,
      updatedAt: watchlist.updatedAt,
      items: this.findWatchlistItems(authenticatedUserId, watchlist.id).map(
        ({ symbol, marketCountry, sortOrder, addedAt }) => ({
          symbol,
          marketCountry: marketCountry as MarketCountry,
          sortOrder,
          addedAt,
        }),
      ),
    }));
  }

  create(
    authenticatedUserId: string,
    input: { id: string; name: string; sortOrder?: number; now: string },
  ): Watchlist {
    return this.database.transaction((transaction) => {
      const nextSortOrder =
        input.sortOrder ??
        ((transaction
          .select({ value: max(watchlists.sortOrder) })
          .from(watchlists)
          .where(eq(watchlists.userId, authenticatedUserId))
          .get()?.value ?? -1) + 1);
      transaction
        .insert(watchlists)
        .values({
          id: input.id,
          userId: authenticatedUserId,
          name: input.name,
          sortOrder: nextSortOrder,
          isDefault: 0,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .run();
      return {
        id: input.id,
        name: input.name,
        sortOrder: nextSortOrder,
        isDefault: false,
        createdAt: input.now,
        updatedAt: input.now,
        items: [],
      };
    });
  }

  update(
    authenticatedUserId: string,
    watchlistId: string,
    input: { name: string; sortOrder?: number; now: string },
  ): Watchlist | undefined {
    return this.database.transaction((transaction) => {
      const owned = transaction
        .select()
        .from(watchlists)
        .where(
          and(
            eq(watchlists.id, watchlistId),
            eq(watchlists.userId, authenticatedUserId),
          ),
        )
        .get();
      if (!owned) return undefined;
      transaction
        .update(watchlists)
        .set({
          name: input.name,
          sortOrder: input.sortOrder ?? owned.sortOrder,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(watchlists.id, watchlistId),
            eq(watchlists.userId, authenticatedUserId),
          ),
        )
        .run();
      const items = transaction
        .select()
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, watchlistId))
        .orderBy(
          asc(watchlistItems.sortOrder),
          asc(watchlistItems.symbol),
          asc(watchlistItems.marketCountry),
        )
        .all();
      return {
        id: owned.id,
        name: input.name,
        sortOrder: input.sortOrder ?? owned.sortOrder,
        isDefault: owned.isDefault === 1,
        createdAt: owned.createdAt,
        updatedAt: input.now,
        items: items.map(({ symbol, marketCountry, sortOrder, addedAt }) => ({
          symbol,
          marketCountry: marketCountry as MarketCountry,
          sortOrder,
          addedAt,
        })),
      };
    });
  }

  delete(
    authenticatedUserId: string,
    watchlistId: string,
  ): "deleted" | "default" | "not-found" {
    return this.database.transaction((transaction) => {
      const owned = transaction
        .select({ isDefault: watchlists.isDefault })
        .from(watchlists)
        .where(
          and(
            eq(watchlists.id, watchlistId),
            eq(watchlists.userId, authenticatedUserId),
          ),
        )
        .get();
      if (!owned) return "not-found";
      if (owned.isDefault === 1) return "default";
      transaction
        .delete(watchlists)
        .where(
          and(
            eq(watchlists.id, watchlistId),
            eq(watchlists.userId, authenticatedUserId),
          ),
        )
        .run();
      return "deleted";
    });
  }

  addItem(
    authenticatedUserId: string,
    watchlistId: string,
    input: {
      symbol: string;
      marketCountry: MarketCountry;
      now: string;
    },
  ): "added" | "duplicate" | "not-found" {
    return this.database.transaction((transaction) => {
      const owned = transaction
        .select({ id: watchlists.id })
        .from(watchlists)
        .where(
          and(
            eq(watchlists.id, watchlistId),
            eq(watchlists.userId, authenticatedUserId),
          ),
        )
        .get();
      if (!owned) return "not-found";
      const duplicate = transaction
        .select({ symbol: watchlistItems.symbol })
        .from(watchlistItems)
        .where(
          and(
            eq(watchlistItems.watchlistId, watchlistId),
            eq(watchlistItems.symbol, input.symbol),
            eq(watchlistItems.marketCountry, input.marketCountry),
          ),
        )
        .get();
      if (duplicate) return "duplicate";
      const sortOrder =
        (transaction
          .select({ value: max(watchlistItems.sortOrder) })
          .from(watchlistItems)
          .where(eq(watchlistItems.watchlistId, watchlistId))
          .get()?.value ?? -1) + 1;
      transaction
        .insert(watchlistItems)
        .values({
          watchlistId,
          symbol: input.symbol,
          marketCountry: input.marketCountry,
          sortOrder,
          addedAt: input.now,
        })
        .run();
      return "added";
    });
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
      .orderBy(
        asc(watchlistItems.sortOrder),
        asc(watchlistItems.symbol),
        asc(watchlistItems.marketCountry),
      )
      .all();
  }

  deleteWatchlistItem(
    authenticatedUserId: string,
    watchlistId: string,
    symbol: string,
    marketCountry: string,
  ): boolean {
    return this.deleteItem(
      authenticatedUserId,
      watchlistId,
      symbol,
      marketCountry as MarketCountry,
    );
  }

  deleteItem(
    authenticatedUserId: string,
    watchlistId: string,
    symbol: string,
    marketCountry: MarketCountry,
  ): boolean {
    return this.database.transaction((transaction) => {
      const ownedWatchlist = transaction
        .select({ id: watchlists.id })
        .from(watchlists)
        .where(
          and(
            eq(watchlists.id, watchlistId),
            eq(watchlists.userId, authenticatedUserId),
          ),
        )
        .get();
      if (!ownedWatchlist) return false;
      return (
        transaction
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
    });
  }
}
