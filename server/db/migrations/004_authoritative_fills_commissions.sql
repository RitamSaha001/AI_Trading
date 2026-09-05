-- ============================================================================
-- Migration 004: Authoritative Fills, Commissions & Settlement Idempotency
-- Compatible with PostgreSQL (Production) and SQLite (Development/Testing)
-- ============================================================================

-- Exact columns for exchange_orders
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS estimated_fee_exact TEXT DEFAULT '0';
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS actual_commission_exact TEXT;
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS actual_commission_asset TEXT;
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS commission_status TEXT DEFAULT 'ESTIMATED';
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS executed_notional_exact TEXT DEFAULT '0';

-- Canonical fill key and commission status for exchange_fills
ALTER TABLE exchange_fills ADD COLUMN IF NOT EXISTS canonical_fill_key TEXT;
ALTER TABLE exchange_fills ADD COLUMN IF NOT EXISTS commission_status TEXT DEFAULT 'AUTHORITATIVE';

-- Unique constraint index for canonical fill identity (prevents duplicate fills at DB level)
CREATE UNIQUE INDEX IF NOT EXISTS idx_exchange_fills_canonical_key ON exchange_fills(canonical_fill_key);

-- Independent ledger settlement idempotency table
CREATE TABLE IF NOT EXISTS accounting_events (
  event_id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  account_mode TEXT NOT NULL DEFAULT 'live',
  event_type TEXT NOT NULL,
  fill_id TEXT,
  order_id TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounting_events_tx ON accounting_events(transaction_id);
CREATE INDEX IF NOT EXISTS idx_accounting_events_fill ON accounting_events(fill_id);
