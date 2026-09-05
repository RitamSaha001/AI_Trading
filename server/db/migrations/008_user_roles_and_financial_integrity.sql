-- ============================================================================
-- Migration 008: Role-Based Authorization, Semantic Webhook Timestamps,
-- Durable Email Challenges & Strict Settlement Identity Constraints
-- Compatible with PostgreSQL (Production) and SQLite (Development/Testing)
-- ============================================================================

-- 1. Explicit Role-Based Authorization on Users
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'TRADER';
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. Semantic Webhook Lifecycle Timestamps
ALTER TABLE payment_webhooks ADD COLUMN IF NOT EXISTS received_at BIGINT;
ALTER TABLE payment_webhooks ADD COLUMN IF NOT EXISTS verified_at BIGINT;
ALTER TABLE payment_webhooks ADD COLUMN IF NOT EXISTS failed_at BIGINT;

-- 3. Durable DB-Backed Passwordless Email Challenges (Multi-Instance & Restart Safe)
CREATE TABLE IF NOT EXISTS auth_email_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts_left INTEGER NOT NULL DEFAULT 5,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  verified_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_email ON auth_email_challenges(email, expires_at);

-- 4. Enforce Settlement External Identity Uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_settlements_ext_unique ON payment_settlements(external_settlement_id) WHERE external_settlement_id IS NOT NULL;

-- 5. Enforce Settlement Ledger Transaction Uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_settlements_ledger_tx_unique ON payment_settlements(ledger_transaction_id) WHERE ledger_transaction_id IS NOT NULL;
