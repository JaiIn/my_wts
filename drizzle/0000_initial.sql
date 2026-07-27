PRAGMA foreign_keys = ON;
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "app_settings_key" CHECK("app_settings"."key" IN ('theme', 'default_market_country', 'chart_interval', 'ranking_count', 'polling_enabled')),
	CONSTRAINT "app_settings_value_json" CHECK(json_valid("app_settings"."value_json"))
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id_hash` text,
	`occurred_at` text NOT NULL,
	`request_id` text NOT NULL,
	`category` text NOT NULL,
	`operation` text NOT NULL,
	`outcome` text NOT NULL,
	`http_status` integer,
	`upstream_request_id` text,
	`entity_hash` text,
	`duration_ms` integer,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	CONSTRAINT "audit_events_duration" CHECK("audit_events"."duration_ms" IS NULL OR "audit_events"."duration_ms" >= 0),
	CONSTRAINT "audit_events_metadata_json" CHECK(json_valid("audit_events"."metadata_json"))
);
--> statement-breakpoint
CREATE INDEX `idx_audit_events_occurred` ON `audit_events` ("occurred_at" DESC);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`selected_account_ref` text,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expiry` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`username_normalized` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "users_username_length" CHECK(length("users"."username") BETWEEN 3 AND 32),
	CONSTRAINT "users_display_name_length" CHECK(length("users"."display_name") BETWEEN 1 AND 40)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_normalized_unique` ON `users` (`username_normalized`);--> statement-breakpoint
CREATE TABLE `watchlist_items` (
	`watchlist_id` text NOT NULL,
	`symbol` text NOT NULL,
	`market_country` text NOT NULL,
	`sort_order` integer NOT NULL,
	`added_at` text NOT NULL,
	PRIMARY KEY(`watchlist_id`, `symbol`, `market_country`),
	FOREIGN KEY (`watchlist_id`) REFERENCES `watchlists`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "watchlist_items_market" CHECK("watchlist_items"."market_country" IN ('KR', 'US')),
	CONSTRAINT "watchlist_items_sort_order" CHECK("watchlist_items"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_watchlist_items_order` ON `watchlist_items` (`watchlist_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `watchlists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "watchlists_name_length" CHECK(length("watchlists"."name") BETWEEN 1 AND 40),
	CONSTRAINT "watchlists_sort_order" CHECK("watchlists"."sort_order" >= 0),
	CONSTRAINT "watchlists_is_default" CHECK("watchlists"."is_default" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_watchlists_one_default` ON `watchlists` (`user_id`) WHERE "watchlists"."is_default" = 1;--> statement-breakpoint
CREATE INDEX `idx_watchlists_user_order` ON `watchlists` (`user_id`,`sort_order`);
