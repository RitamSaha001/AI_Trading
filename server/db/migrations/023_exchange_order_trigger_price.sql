-- ==========================================================================
-- Migration 023: Persist stop trigger prices on broker order records
-- ==========================================================================

ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS trigger_price REAL;
