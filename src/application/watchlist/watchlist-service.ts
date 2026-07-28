import { randomUUID } from "node:crypto";

import type { MarketStock } from "../../domain/market/market";
import {
  type MarketCountry,
  type Watchlist,
  type WatchlistItem,
  watchlistIdSchema,
  watchlistItemRequestSchema,
  watchlistRequestSchema,
} from "../../domain/watchlist/watchlist";

export interface WatchlistPersistence {
  list(authenticatedUserId: string): Watchlist[];
  create(
    authenticatedUserId: string,
    input: {
      id: string;
      name: string;
      sortOrder?: number;
      now: string;
    },
  ): Watchlist;
  update(
    authenticatedUserId: string,
    watchlistId: string,
    input: { name: string; sortOrder?: number; now: string },
  ): Watchlist | undefined;
  delete(
    authenticatedUserId: string,
    watchlistId: string,
  ): "deleted" | "default" | "not-found";
  addItem(
    authenticatedUserId: string,
    watchlistId: string,
    input: {
      symbol: string;
      marketCountry: MarketCountry;
      now: string;
    },
  ): "added" | "duplicate" | "not-found";
  deleteItem(
    authenticatedUserId: string,
    watchlistId: string,
    symbol: string,
    marketCountry: MarketCountry,
  ): boolean;
}

export interface WatchlistMarketCatalog {
  listStocks(): Promise<readonly MarketStock[]>;
}

export class WatchlistValidationError extends Error {
  constructor(readonly fields: string[]) {
    super("VALIDATION_FAILED");
    this.name = "WatchlistValidationError";
  }
}

export class WatchlistNotFoundError extends Error {
  constructor() {
    super("NOT_FOUND");
    this.name = "WatchlistNotFoundError";
  }
}

export class WatchlistConflictError extends Error {
  constructor(readonly reason: "DEFAULT_WATCHLIST" | "DUPLICATE_ITEM") {
    super("CONFLICT");
    this.name = "WatchlistConflictError";
  }
}

export class WatchlistPersistenceError extends Error {
  constructor() {
    super("DATABASE_ERROR");
    this.name = "WatchlistPersistenceError";
  }
}

type WatchlistServiceOptions = {
  now?: () => Date;
  createId?: () => string;
};

function validationFields(error: {
  issues: readonly { path: PropertyKey[] }[];
}): string[] {
  return [
    ...new Set(
      error.issues.map((issue) => issue.path[0]?.toString() ?? "request"),
    ),
  ].sort();
}

function countryForStock(stock: MarketStock): MarketCountry | undefined {
  if (["KOSPI", "KOSDAQ", "KRX"].includes(stock.market)) return "KR";
  if (["NASDAQ", "NYSE", "AMEX"].includes(stock.market)) return "US";
  return undefined;
}

export class WatchlistService {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly persistence: WatchlistPersistence,
    private readonly marketCatalog: WatchlistMarketCatalog,
    options: WatchlistServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  list(authenticatedUserId: string): Watchlist[] {
    try {
      return this.persistence.list(authenticatedUserId);
    } catch {
      throw new WatchlistPersistenceError();
    }
  }

  create(authenticatedUserId: string, input: unknown): Watchlist {
    const parsed = watchlistRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new WatchlistValidationError(validationFields(parsed.error));
    }
    try {
      return this.persistence.create(authenticatedUserId, {
        id: this.createId(),
        ...parsed.data,
        now: this.now().toISOString(),
      });
    } catch (error) {
      if (error instanceof WatchlistConflictError) throw error;
      throw new WatchlistPersistenceError();
    }
  }

  update(
    authenticatedUserId: string,
    watchlistId: unknown,
    input: unknown,
  ): Watchlist {
    const parsedId = watchlistIdSchema.safeParse(watchlistId);
    const parsed = watchlistRequestSchema.safeParse(input);
    if (!parsedId.success || !parsed.success) {
      throw new WatchlistValidationError([
        ...(!parsedId.success ? ["watchlistId"] : []),
        ...(parsed.success ? [] : validationFields(parsed.error)),
      ]);
    }
    try {
      const updated = this.persistence.update(
        authenticatedUserId,
        parsedId.data,
        { ...parsed.data, now: this.now().toISOString() },
      );
      if (!updated) throw new WatchlistNotFoundError();
      return updated;
    } catch (error) {
      if (error instanceof WatchlistNotFoundError) throw error;
      throw new WatchlistPersistenceError();
    }
  }

  delete(authenticatedUserId: string, watchlistId: unknown): void {
    const parsedId = watchlistIdSchema.safeParse(watchlistId);
    if (!parsedId.success) {
      throw new WatchlistValidationError(["watchlistId"]);
    }
    try {
      const result = this.persistence.delete(authenticatedUserId, parsedId.data);
      if (result === "not-found") throw new WatchlistNotFoundError();
      if (result === "default") {
        throw new WatchlistConflictError("DEFAULT_WATCHLIST");
      }
    } catch (error) {
      if (
        error instanceof WatchlistNotFoundError ||
        error instanceof WatchlistConflictError
      ) {
        throw error;
      }
      throw new WatchlistPersistenceError();
    }
  }

  async addItem(
    authenticatedUserId: string,
    watchlistId: unknown,
    input: unknown,
  ): Promise<Watchlist> {
    const parsedId = watchlistIdSchema.safeParse(watchlistId);
    const parsed = watchlistItemRequestSchema.safeParse(input);
    if (!parsedId.success || !parsed.success) {
      throw new WatchlistValidationError([
        ...(!parsedId.success ? ["watchlistId"] : []),
        ...(parsed.success ? [] : validationFields(parsed.error)),
      ]);
    }

    const stocks = await this.marketCatalog.listStocks();
    const exists = stocks.some(
      (stock) =>
        stock.symbol.toUpperCase() === parsed.data.symbol &&
        countryForStock(stock) === parsed.data.marketCountry,
    );
    if (!exists) throw new WatchlistNotFoundError();

    try {
      const result = this.persistence.addItem(
        authenticatedUserId,
        parsedId.data,
        { ...parsed.data, now: this.now().toISOString() },
      );
      if (result === "not-found") throw new WatchlistNotFoundError();
      if (result === "duplicate") {
        throw new WatchlistConflictError("DUPLICATE_ITEM");
      }
      return this.findOwned(authenticatedUserId, parsedId.data);
    } catch (error) {
      if (
        error instanceof WatchlistNotFoundError ||
        error instanceof WatchlistConflictError
      ) {
        throw error;
      }
      throw new WatchlistPersistenceError();
    }
  }

  deleteItem(
    authenticatedUserId: string,
    watchlistId: unknown,
    country: unknown,
    symbol: unknown,
  ): void {
    const parsedId = watchlistIdSchema.safeParse(watchlistId);
    const parsed = watchlistItemRequestSchema.safeParse({
      symbol,
      marketCountry: country,
    });
    if (!parsedId.success || !parsed.success) {
      throw new WatchlistValidationError([
        ...(!parsedId.success ? ["watchlistId"] : []),
        ...(parsed.success ? [] : validationFields(parsed.error)),
      ]);
    }
    try {
      const deleted = this.persistence.deleteItem(
        authenticatedUserId,
        parsedId.data,
        parsed.data.symbol,
        parsed.data.marketCountry,
      );
      if (!deleted) throw new WatchlistNotFoundError();
    } catch (error) {
      if (error instanceof WatchlistNotFoundError) throw error;
      throw new WatchlistPersistenceError();
    }
  }

  private findOwned(
    authenticatedUserId: string,
    watchlistId: string,
  ): Watchlist {
    const watchlist = this.persistence
      .list(authenticatedUserId)
      .find(({ id }) => id === watchlistId);
    if (!watchlist) throw new WatchlistNotFoundError();
    return watchlist;
  }
}

export type { Watchlist, WatchlistItem };
