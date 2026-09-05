-- ============================================================================
-- Migration 015: Sliced Child Venue Orders & Authoritative Parent Aggregation
-- Compatible with PostgreSQL (Production) and SQLite (Development/Testing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exchange_order_children (
  id TEXT PRIMARY KEY,
  parent_client_order_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  broker TEXT NOT NULL DEFAULT 'upstox',
  venue_order_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  order_type TEXT NOT NULL,
  price REAL,
  quantity REAL NOT NULL,
  filled_quantity REAL NOT NULL DEFAULT 0,
  remaining_quantity REAL NOT NULL DEFAULT 0,
  average_price REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN',
  raw_response TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exchange_order_children_parent
  ON exchange_order_children(parent_client_order_id);

CREATE INDEX IF NOT EXISTS idx_exchange_order_children_venue
  ON exchange_order_children(venue_order_id);

CREATE INDEX IF NOT EXISTS idx_exchange_order_children_user
  ON exchange_order_children(user_id);
