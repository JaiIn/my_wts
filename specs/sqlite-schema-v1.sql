PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL CHECK (length(username) BETWEEN 3 AND 32),
  username_normalized TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 40),
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  selected_account_ref TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE app_settings (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL CHECK (
    key IN (
      'theme',
      'default_market_country',
      'chart_interval',
      'ranking_count',
      'polling_enabled'
    )
  ),
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE watchlists (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_watchlists_one_default
  ON watchlists(user_id)
  WHERE is_default = 1;

CREATE TABLE watchlist_items (
  watchlist_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  market_country TEXT NOT NULL CHECK (market_country IN ('KR', 'US')),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  added_at TEXT NOT NULL,
  PRIMARY KEY (watchlist_id, symbol, market_country),
  FOREIGN KEY (watchlist_id) REFERENCES watchlists(id) ON DELETE CASCADE
);

CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id_hash TEXT,
  occurred_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  category TEXT NOT NULL,
  operation TEXT NOT NULL,
  outcome TEXT NOT NULL,
  http_status INTEGER,
  upstream_request_id TEXT,
  entity_hash TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json))
);

CREATE INDEX idx_sessions_user
  ON sessions(user_id);

CREATE INDEX idx_sessions_expiry
  ON sessions(expires_at);

CREATE INDEX idx_watchlists_user_order
  ON watchlists(user_id, sort_order);

CREATE INDEX idx_watchlist_items_order
  ON watchlist_items(watchlist_id, sort_order);

CREATE INDEX idx_audit_events_occurred
  ON audit_events(occurred_at DESC);

