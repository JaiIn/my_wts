import { z } from "zod";

export const DEFAULT_WATCHLIST_NAME = "기본 관심종목";

export const watchlistIdSchema = z.uuid();

export const watchlistRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(40),
  sortOrder: z.number().int().min(0).optional(),
});

export const watchlistItemRequestSchema = z.strictObject({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9._-]+$/)
    .transform((value) => value.toUpperCase()),
  marketCountry: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.enum(["KR", "US"])),
});

export type MarketCountry = "KR" | "US";

export type WatchlistItem = {
  symbol: string;
  marketCountry: MarketCountry;
  sortOrder: number;
  addedAt: string;
};

export type Watchlist = {
  id: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  items: readonly WatchlistItem[];
};
