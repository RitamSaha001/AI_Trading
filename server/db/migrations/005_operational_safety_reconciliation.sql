-- ============================================================================
-- Migration 005: Operational Safety, Reconciliation & Durable Circuit Breakers
-- Compatible with PostgreSQL (Production) and SQLite (Development/Testing)
-- ============================================================================

-- 1. Circuit Breakers table (persisted & shared across multi-instance nodes)
CREATE TABLE IF NOT EXISTS circuit_breakers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL, -- 'GLOBAL' | 'ACCOUNT' | 'SYMBOL'
  scope_id TEXT NOT NULL DEFAULT '*',
  state TEXT NOT NULL DEFAULT 'CLOSED', -- 'CLOSED' | 'OPEN' | 'HALF_OPEN'
  opened_at BIGINT,
  reason TEXT,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  recovery_condition TEXT,
  updated_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_circuit_breakers_unique ON circuit_breakers(name, scope, scope_id);

-- 2. Operational Kill Switches table
CREATE TABLE IF NOT EXISTS operational_kill_switches (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL, -- 'GLOBAL' | 'ACCOUNT' | 'SYMBOL'
  target TEXT NOT NULL DEFAULT '*',
  is_frozen BOOLEAN NOT NULL DEFAULT 1,
  freeze_reason TEXT NOT NULL,
  frozen_by TEXT NOT NULL,
  frozen_at BIGINT NOT NULL,
  unfrozen_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_operational_kill_switches ON operational_kill_switches(scope, target, is_frozen);

-- 3. Extend reconciliation_mismatches with action tracking
ALTER TABLE reconciliation_mismatches ADD COLUMN IF NOT EXISTS action_taken TEXT DEFAULT 'NONE';
ALTER TABLE reconciliation_mismatches ADD COLUMN IF NOT EXISTS action_status TEXT DEFAULT 'PENDING';

-- 4. Exchange Sync State (Clock offset, rate limit usage, health per account/venue)
CREATE TABLE IF NOT EXISTS exchange_sync_state (
  account_id TEXT PRIMARY KEY,
  server_time_offset_ms BIGINT NOT NULL DEFAULT 0,
  last_sync_at BIGINT NOT NULL DEFAULT 0,
  rest_health TEXT NOT NULL DEFAULT 'HEALTHY',
  ws_health TEXT NOT NULL DEFAULT 'HEALTHY',
  rate_limit_used_1m INTEGER NOT NULL DEFAULT 0,
  rate_limit_reset_at BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL
);
