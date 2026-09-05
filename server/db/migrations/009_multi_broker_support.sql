-- ============================================================================
-- Migration 009: Multi-Broker Execution & Credential Architecture
-- Compatible with PostgreSQL (Production) and SQLite (Development/Testing)
-- ============================================================================

-- 1. Extend exchange_orders with broker attribution
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS broker TEXT DEFAULT 'binance';
CREATE INDEX IF NOT EXISTS idx_exchange_orders_broker ON exchange_orders(broker);

-- 2. Extend exchange_fills with broker attribution
ALTER TABLE exchange_fills ADD COLUMN IF NOT EXISTS broker TEXT DEFAULT 'binance';
CREATE INDEX IF NOT EXISTS idx_exchange_fills_broker ON exchange_fills(broker);

-- 3. Multi-Broker Credentials Storage (Encrypted at Rest with AES-256-GCM)
CREATE TABLE IF NOT EXISTS broker_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broker TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  auth_type TEXT NOT NULL DEFAULT 'oauth2',
  api_key_encrypted TEXT,
  api_secret_encrypted TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at BIGINT,
  account_id TEXT,
  account_name TEXT,
  can_trade BOOLEAN NOT NULL DEFAULT 1,
  can_withdraw BOOLEAN NOT NULL DEFAULT 0,
  is_safe BOOLEAN NOT NULL DEFAULT 1,
  last_sync_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(user_id, broker, environment)
);
CREATE INDEX IF NOT EXISTS idx_broker_credentials_user ON broker_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_broker_credentials_user_broker ON broker_credentials(user_id, broker);
