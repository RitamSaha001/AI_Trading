-- ============================================================================
-- Migration 002: Exact Precision Financial Columns & Order Reservations
-- ============================================================================

-- Authoritative exact decimal columns for exchange orders
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS orig_qty_exact TEXT;
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS executed_qty_exact TEXT DEFAULT '0';
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS price_exact TEXT;
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS avg_price_exact TEXT DEFAULT '0';
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS cumulative_quote_exact TEXT DEFAULT '0';
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS notional_exact TEXT;
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS fee_exact TEXT DEFAULT '0';
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS fee_asset TEXT;
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS reserved_cash_minor BIGINT DEFAULT 0;
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS reserved_qty_minor BIGINT DEFAULT 0;

-- Authoritative exact decimal columns for exchange fills
ALTER TABLE exchange_fills ADD COLUMN IF NOT EXISTS price_exact TEXT;
ALTER TABLE exchange_fills ADD COLUMN IF NOT EXISTS qty_exact TEXT;
ALTER TABLE exchange_fills ADD COLUMN IF NOT EXISTS commission_exact TEXT;
ALTER TABLE exchange_fills ADD COLUMN IF NOT EXISTS quote_qty_exact TEXT;

-- Authoritative Order Reservations (Atomic & Invariant Protected)
CREATE TABLE IF NOT EXISTS order_reservations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  account_mode TEXT NOT NULL DEFAULT 'live',
  asset_or_currency TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PARTIALLY_CONSUMED', 'CONSUMED', 'RELEASED')),
  consumed_minor BIGINT NOT NULL DEFAULT 0 CHECK (consumed_minor >= 0),
  released_minor BIGINT NOT NULL DEFAULT 0 CHECK (released_minor >= 0),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(order_id, account_id),
  CHECK (consumed_minor + released_minor <= amount_minor)
);
CREATE INDEX IF NOT EXISTS idx_order_reservations_order ON order_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_order_reservations_user ON order_reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_order_reservations_status ON order_reservations(status);
