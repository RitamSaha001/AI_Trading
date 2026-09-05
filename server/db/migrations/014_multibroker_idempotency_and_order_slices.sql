-- ============================================================================
-- Migration 014: Multi-Broker Idempotency & Sliced Order Tracking
-- Compatible with PostgreSQL (Production) and SQLite (Development/Testing)
-- ============================================================================

-- 1. Support sliced order venue tracking (child venue order IDs)
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS venue_order_ids TEXT;

-- 2. Multi-broker composite idempotency index
CREATE UNIQUE INDEX IF NOT EXISTS idx_exchange_orders_user_broker_idemp ON exchange_orders(user_id, broker, idempotency_key);
