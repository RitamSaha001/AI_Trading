-- ============================================================================
-- Migration 007: Financial Integrity Hardening — Settlement Uniqueness,
-- Webhook Leases, Refund Reservation & Concurrency Constraints
-- Compatible with PostgreSQL (Production) and SQLite (Development/Testing)
-- ============================================================================

-- 1. Enforce strict settlement uniqueness: Exactly one settlement per payment order
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_settlements_order_unique ON payment_settlements(payment_order_id);

-- 2. Enforce payment record uniqueness: Exactly one settlement per payment record
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_settlements_payment_unique ON payment_settlements(payment_id);

-- 3. Enforce provider payment ID uniqueness in payments table (non-null entries)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_payment_id_unique ON payments(provider_payment_id) WHERE provider_payment_id IS NOT NULL;

-- 4. Enforce provider webhook event deduplication at DB level
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_webhooks_provider_event_unique ON payment_webhooks(provider, event_id);

-- 5. Enforce UTR uniqueness on payments (no double-submission or double-crediting of bank UTR)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_utr_unique ON payments(utr) WHERE utr IS NOT NULL;

-- 6. Add webhook processing lease fields for crashed worker recovery
ALTER TABLE payment_webhooks ADD COLUMN IF NOT EXISTS processing_started_at BIGINT;
ALTER TABLE payment_webhooks ADD COLUMN IF NOT EXISTS processing_attempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payment_webhooks ADD COLUMN IF NOT EXISTS worker_id TEXT;
ALTER TABLE payment_webhooks ADD COLUMN IF NOT EXISTS lease_expires_at BIGINT;
ALTER TABLE payment_webhooks ADD COLUMN IF NOT EXISTS next_retry_at BIGINT;

-- 7. Add refund capacity reservation tracking to payment_orders
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS reserved_refund_amount_minor BIGINT NOT NULL DEFAULT 0;

-- 8. Add indexes for worker lease claiming and recovery sweeps
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_lease ON payment_webhooks(status, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_status_order ON payment_refunds(status, payment_order_id);
