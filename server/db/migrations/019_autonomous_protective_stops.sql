-- ============================================================================
-- Migration 019: Autonomous Entry / Protective Stop Linkage
-- ============================================================================

ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS product TEXT;
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS order_role TEXT NOT NULL DEFAULT 'STANDARD';
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS parent_client_order_id TEXT;
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS protective_stop_price REAL;

CREATE INDEX IF NOT EXISTS idx_exchange_orders_parent_client_order
  ON exchange_orders(parent_client_order_id);

CREATE INDEX IF NOT EXISTS idx_exchange_orders_role_status
  ON exchange_orders(order_role, status);
