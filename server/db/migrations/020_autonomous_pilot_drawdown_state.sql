-- ============================================================================
-- Migration 020: Durable Autonomous Pilot Drawdown State
-- Keeps the intraday high-water mark and drawdown tier across worker cycles.
-- ============================================================================

ALTER TABLE autonomous_pilot_state ADD COLUMN peak_portfolio_value REAL NOT NULL DEFAULT 0;
ALTER TABLE autonomous_pilot_state ADD COLUMN daily_drawdown_pct REAL NOT NULL DEFAULT 0;
ALTER TABLE autonomous_pilot_state ADD COLUMN circuit_breaker_tier TEXT NOT NULL DEFAULT 'NORMAL';
