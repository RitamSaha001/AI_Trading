-- ============================================================================
-- Migration 021: Autonomous Pilot Daily Risk Session Boundary
-- Resets intraday risk references exactly once per India trading date.
-- ============================================================================

ALTER TABLE autonomous_pilot_state ADD COLUMN risk_session_date TEXT;
