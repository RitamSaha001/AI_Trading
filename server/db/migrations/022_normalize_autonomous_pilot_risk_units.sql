-- ============================================================================
-- Migration 022: Normalize Pilot Risk Percentage Units
-- Repairs the historical 0.012 fallback; profile risk is stored in percentage
-- points (for example 0.75 means 0.75%), not as a decimal fraction.
-- ============================================================================

UPDATE autonomous_pilot_state
SET risk_per_trade_pct = 0.75
WHERE risk_per_trade_pct = 0.012;
