import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey().notNull(),
    username: text("username").notNull(),
    usernameNormalized: text("username_normalized").notNull().unique(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "users_username_length",
      sql`length(${table.username}) BETWEEN 3 AND 32`,
    ),
    check(
      "users_display_name_length",
      sql`length(${table.displayName}) BETWEEN 1 AND 40`,
    ),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey().notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    selectedAccountRef: text("selected_account_ref"),
    createdAt: text("created_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    index("idx_sessions_user").on(table.userId),
    index("idx_sessions_expiry").on(table.expiresAt),
  ],
);

export const appSettings = sqliteTable(
  "app_settings",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueJson: text("value_json").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.key] }),
    check(
      "app_settings_key",
      sql`${table.key} IN ('theme', 'default_market_country', 'chart_interval', 'ranking_count', 'polling_enabled')`,
    ),
    check("app_settings_value_json", sql`json_valid(${table.valueJson})`),
  ],
);

export const watchlists = sqliteTable(
  "watchlists",
  {
    id: text("id").primaryKey().notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull(),
    isDefault: integer("is_default").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "watchlists_name_length",
      sql`length(${table.name}) BETWEEN 1 AND 40`,
    ),
    check("watchlists_sort_order", sql`${table.sortOrder} >= 0`),
    check("watchlists_is_default", sql`${table.isDefault} IN (0, 1)`),
    uniqueIndex("idx_watchlists_one_default")
      .on(table.userId)
      .where(sql`${table.isDefault} = 1`),
    index("idx_watchlists_user_order").on(table.userId, table.sortOrder),
  ],
);

export const watchlistItems = sqliteTable(
  "watchlist_items",
  {
    watchlistId: text("watchlist_id")
      .notNull()
      .references(() => watchlists.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    marketCountry: text("market_country").notNull(),
    sortOrder: integer("sort_order").notNull(),
    addedAt: text("added_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.watchlistId, table.symbol, table.marketCountry],
    }),
    check(
      "watchlist_items_market",
      sql`${table.marketCountry} IN ('KR', 'US')`,
    ),
    check("watchlist_items_sort_order", sql`${table.sortOrder} >= 0`),
    index("idx_watchlist_items_order").on(table.watchlistId, table.sortOrder),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userIdHash: text("user_id_hash"),
    occurredAt: text("occurred_at").notNull(),
    requestId: text("request_id").notNull(),
    category: text("category").notNull(),
    operation: text("operation").notNull(),
    outcome: text("outcome").notNull(),
    httpStatus: integer("http_status"),
    upstreamRequestId: text("upstream_request_id"),
    entityHash: text("entity_hash"),
    durationMs: integer("duration_ms"),
    metadataJson: text("metadata_json").notNull().default("{}"),
  },
  (table) => [
    check(
      "audit_events_duration",
      sql`${table.durationMs} IS NULL OR ${table.durationMs} >= 0`,
    ),
    check("audit_events_metadata_json", sql`json_valid(${table.metadataJson})`),
    index("idx_audit_events_occurred").on(sql`${table.occurredAt} DESC`),
  ],
);

export const databaseSchema = {
  users,
  sessions,
  appSettings,
  watchlists,
  watchlistItems,
  auditEvents,
};

export type UserRecord = typeof users.$inferSelect;
export type NewUserRecord = typeof users.$inferInsert;
export type SessionRecord = typeof sessions.$inferSelect;
export type NewSessionRecord = typeof sessions.$inferInsert;
