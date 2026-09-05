-- ============================================================================
-- Migration 006: Production Payments, Durable Settlement, Refunds & FX Quoting
-- Compatible with PostgreSQL (Production) and SQLite (Development/Testing)
-- ============================================================================

-- 1. Payment Attempts table: Tracks every external attempt made with payment providers
CREATE TABLE IF NOT EXISTS payment_attempts (
  id TEXT PRIMARY KEY,
  payment_order_id TEXT NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_order_id TEXT,
  request_payload TEXT,
  response_payload TEXT,
  status TEXT NOT NULL, -- 'INITIATING' | 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'UNKNOWN'
  error_code TEXT,
  error_message TEXT,
  started_at BIGINT NOT NULL,
  completed_at BIGINT,
  created_at BIGINT,
  updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_order ON payment_attempts(payment_order_id);

-- 2. Payment Settlements table: Immutable authoritative record of ledger credits from external payments
CREATE TABLE IF NOT EXISTS payment_settlements (
  id TEXT PRIMARY KEY,
  payment_order_id TEXT NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  settlement_source TEXT NOT NULL, -- 'WEBHOOK' | 'STATUS_POLL' | 'RECONCILIATION_SWEEP' | 'MANUAL_BANK_RECONCILIATION'
  external_settlement_id TEXT,
  amount_minor BIGINT NOT NULL,
  currency TEXT NOT NULL,
  fx_quote_id TEXT,
  settled_amount_minor BIGINT NOT NULL,
  settled_currency TEXT NOT NULL,
  ledger_transaction_id TEXT,
  settled_at BIGINT NOT NULL,
  created_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_payment_settlements_order ON payment_settlements(payment_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_settlements_payment ON payment_settlements(payment_id);

-- 3. Payment Refunds table: Authoritative refund tracking linked to double-entry ledger debits
CREATE TABLE IF NOT EXISTS payment_refunds (
  id TEXT PRIMARY KEY,
  payment_order_id TEXT NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
  payment_id TEXT REFERENCES payments(id) ON DELETE CASCADE,
  provider_refund_id TEXT UNIQUE,
  amount_minor BIGINT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL, -- 'INITIATING' | 'PENDING' | 'SUCCESS' | 'FAILED'
  reason TEXT NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  ledger_transaction_id TEXT,
  initiated_by TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_order ON payment_refunds(payment_order_id);

-- 4. Foreign Exchange Quotes table: Authoritative institutional/oracle exchange rate persistence
CREATE TABLE IF NOT EXISTS fx_quotes (
  id TEXT PRIMARY KEY,
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate_minor BIGINT NOT NULL, -- Scaled by 1e8 for precise integer arithmetic
  rate_decimals INTEGER NOT NULL DEFAULT 8,
  effective_rate TEXT NOT NULL,
  source TEXT NOT NULL, -- 'ORACLE_FEED' | 'BANK_RATE' | 'PAPER_SIMULATION'
  valid_from BIGINT NOT NULL,
  valid_until BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fx_quotes_pair ON fx_quotes(base_currency, quote_currency, valid_until);

-- 5. Extend payment_orders with hosted checkout and refund tracking columns
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS checkout_url TEXT;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS upi_intent_uri TEXT;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS refunded_amount_minor BIGINT NOT NULL DEFAULT 0;

-- 6. Extend payment_webhooks for full wire body & header auditing
ALTER TABLE payment_webhooks ADD COLUMN IF NOT EXISTS raw_headers TEXT;
ALTER TABLE payment_webhooks ADD COLUMN IF NOT EXISTS raw_body TEXT;

-- 7. Optimized query indexes
CREATE INDEX IF NOT EXISTS idx_payment_orders_status_created ON payment_orders(status, created_at);
