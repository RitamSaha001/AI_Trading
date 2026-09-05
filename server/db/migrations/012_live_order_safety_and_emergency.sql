-- ============================================================================
-- Migration 012: Live Order Safety, Human Confirmation & Emergency Panic State
-- Compatible with PostgreSQL (Production) and SQLite (Development/Testing)
-- ============================================================================

-- 1. Two-Step Human Confirmation System for Live Orders
CREATE TABLE IF NOT EXISTS live_order_confirmations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broker TEXT NOT NULL,
  symbol TEXT NOT NULL,
  instrument_key TEXT NOT NULL,
  exchange TEXT NOT NULL,
  side TEXT NOT NULL,
  order_type TEXT NOT NULL,
  quantity REAL NOT NULL,
  price REAL,
  trigger_price REAL,
  product TEXT NOT NULL,
  validity TEXT NOT NULL DEFAULT 'DAY',
  disclosed_quantity INTEGER,
  slice BOOLEAN NOT NULL DEFAULT 0,
  estimated_notional REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  order_hash TEXT NOT NULL,
  risk_snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  client_order_id TEXT UNIQUE NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  consumed_at BIGINT,
  rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_live_confirmations_user ON live_order_confirmations(user_id);
CREATE INDEX IF NOT EXISTS idx_live_confirmations_lookup ON live_order_confirmations(id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_live_confirmations_client_order ON live_order_confirmations(client_order_id);

-- 2. Durable Emergency Execution State
CREATE TABLE IF NOT EXISTS emergency_system_state (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'TRADING_NORMAL',
  reason TEXT,
  initiated_by TEXT,
  metadata TEXT,
  updated_at BIGINT NOT NULL
);

-- Insert singleton current state if not exists
INSERT INTO emergency_system_state (id, state, reason, initiated_by, updated_at)
VALUES ('current', 'TRADING_NORMAL', 'System initialization', 'system', 0)
ON CONFLICT (id) DO NOTHING;

-- 3. Controlled Panic Square-Off Run Audit
CREATE TABLE IF NOT EXISTS panic_squareoff_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  broker TEXT NOT NULL,
  status TEXT NOT NULL,
  cancelled_orders_count INTEGER NOT NULL DEFAULT 0,
  positions_evaluated_count INTEGER NOT NULL DEFAULT 0,
  close_orders_submitted_count INTEGER NOT NULL DEFAULT 0,
  errors TEXT,
  started_at BIGINT NOT NULL,
  completed_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_panic_squareoff_user ON panic_squareoff_runs(user_id);
