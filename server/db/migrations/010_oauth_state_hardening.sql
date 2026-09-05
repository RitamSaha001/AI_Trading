-- ============================================================================
-- Migration 010: OAuth State Hardening & Anti-CSRF Replay Defense
-- Compatible with PostgreSQL (Production) and SQLite (Development/Testing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS broker_oauth_states (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broker TEXT NOT NULL,
  redirect_uri TEXT,
  expires_at BIGINT NOT NULL,
  consumed_at BIGINT DEFAULT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_broker_oauth_states_user_broker ON broker_oauth_states(user_id, broker);
CREATE INDEX IF NOT EXISTS idx_broker_oauth_states_lookup ON broker_oauth_states(id, user_id, broker);
