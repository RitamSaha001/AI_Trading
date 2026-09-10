-- ============================================================================
-- Migration 018: Autonomous Quant Pilot Server Daemon State & Durable Logs
-- Persists autonomous pilot configurations, fleet telemetry, client heartbeats,
-- and execution logs for seamless dual-mode (Browser Cockpit + Cloud Daemon) execution.
-- Compatible with PostgreSQL (Production) and SQLite (Development/Testing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS autonomous_pilot_state (
  user_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  execution_mode TEXT NOT NULL DEFAULT 'full_autonomous',
  profile TEXT NOT NULL DEFAULT 'conservative',
  daily_starting_value REAL NOT NULL DEFAULT 50000.0,
  risk_per_trade_pct REAL NOT NULL DEFAULT 0.012,
  circuit_breaker_tripped INTEGER NOT NULL DEFAULT 0,
  circuit_breaker_reason TEXT,
  last_client_heartbeat_at BIGINT NOT NULL DEFAULT 0,
  last_server_run_at BIGINT NOT NULL DEFAULT 0,
  execution_mode_status TEXT NOT NULL DEFAULT 'CLOUD_HEADLESS',
  fleet_state_json TEXT,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS autonomous_pilot_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  asset TEXT NOT NULL,
  action TEXT NOT NULL,
  strategy TEXT NOT NULL,
  detail TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  execution_source TEXT NOT NULL DEFAULT 'cloud_daemon',
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pilot_logs_user_time
  ON autonomous_pilot_logs(user_id, timestamp DESC);
