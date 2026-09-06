-- ============================================================================
-- Migration 016: Canonical Order Identity & Foreign Key Alignment
-- Adds client_order_id column to exchange_fills for dual indexing without
-- violating the foreign key constraint on exchange_orders(id).
-- Compatible with PostgreSQL (Production) and SQLite (Development/Testing)
-- ============================================================================

ALTER TABLE exchange_fills ADD COLUMN IF NOT EXISTS client_order_id TEXT;

CREATE INDEX IF NOT EXISTS idx_exchange_fills_client_order
  ON exchange_fills(client_order_id);
