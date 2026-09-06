-- ============================================================================
-- Migration 017: Persistent Order-to-Trade Ratio (OTR) Event Tracking
-- Records order lifecycle operations (PLACE, MODIFY, CANCEL, FILL) for
-- sliding-window regulatory OTR limits across server restarts and cluster nodes.
-- Compatible with PostgreSQL (Production) and SQLite (Development/Testing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS otr_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'PLACE' | 'MODIFY' | 'CANCEL' | 'FILL'
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_otr_events_user_symbol_time
  ON otr_events(user_id, symbol, created_at);
