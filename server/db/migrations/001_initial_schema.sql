-- ============================================================================
-- Migration 001: Initial Platform Schema
-- Compatible with PostgreSQL (Production) and SQLite (Development/Testing)
-- ============================================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  photo_url TEXT,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Active Server-Side Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  device_info TEXT,
  ip_address TEXT,
  expires_at BIGINT NOT NULL,
  revoked_at BIGINT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- KYC & Compliance Records
CREATE TABLE IF NOT EXISTS kyc_records (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'tier0_unverified',
  status TEXT NOT NULL DEFAULT 'unverified',
  pan_masked TEXT,
  phone_masked TEXT,
  country TEXT NOT NULL DEFAULT 'IN',
  verified_at BIGINT,
  document_reference TEXT,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kyc_user_id ON kyc_records(user_id);

-- Account Risk & Operational Limits
CREATE TABLE IF NOT EXISTS account_limits (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_mode TEXT NOT NULL DEFAULT 'paper',
  is_emergency_frozen BOOLEAN NOT NULL DEFAULT 0,
  frozen_at BIGINT,
  freeze_reason TEXT,
  max_single_order_pct REAL NOT NULL DEFAULT 0.40,
  max_asset_concentration_pct REAL NOT NULL DEFAULT 0.50,
  min_cash_reserve_pct REAL NOT NULL DEFAULT 0.15,
  max_daily_loss_usd REAL NOT NULL DEFAULT 2500.0,
  daily_deposit_limit_usd REAL NOT NULL DEFAULT 25000.0,
  daily_withdraw_limit_usd REAL NOT NULL DEFAULT 10000.0,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_limits_user_id ON account_limits(user_id);

-- Double-Entry Ledger Accounts
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_mode TEXT NOT NULL DEFAULT 'live',
  account_type TEXT NOT NULL,
  asset_or_currency TEXT NOT NULL,
  balance_minor BIGINT NOT NULL DEFAULT 0,
  reserved_minor BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(user_id, account_mode, account_type, asset_or_currency)
);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_user ON ledger_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_user_mode ON ledger_accounts(user_id, account_mode);

-- Double-Entry Ledger Immutable Journal Entries
CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  account_mode TEXT NOT NULL DEFAULT 'live',
  entry_type TEXT NOT NULL,
  amount_minor BIGINT NOT NULL,
  balance_after_minor BIGINT NOT NULL,
  currency_or_asset TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  idempotency_key TEXT,
  order_id TEXT,
  fill_id TEXT,
  description TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_user ON ledger_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_user_mode ON ledger_entries(user_id, account_mode);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_idemp ON ledger_entries(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_order_id ON ledger_entries(order_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_fill_id ON ledger_entries(fill_id);

-- Payment Orders (Card & UPI)
CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount_minor BIGINT NOT NULL,
  currency TEXT NOT NULL,
  method TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_order_id TEXT UNIQUE,
  status TEXT NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_provider ON payment_orders(provider_order_id);

-- Payment Transactions
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  payment_order_id TEXT NOT NULL REFERENCES payment_orders(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  provider_payment_id TEXT UNIQUE,
  amount_minor BIGINT NOT NULL,
  currency TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  card_last4 TEXT,
  card_brand TEXT,
  upi_vpa TEXT,
  utr TEXT,
  settlement_reference TEXT,
  cleared_at BIGINT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(payment_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_utr ON payments(utr);

-- Webhook Ingestion Records
CREATE TABLE IF NOT EXISTS payment_webhooks (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT UNIQUE NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  processed_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhooks_event ON payment_webhooks(event_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhooks_provider_event ON payment_webhooks(provider, event_id);

-- Exchange Accounts (Encrypted Credentials At Rest)
CREATE TABLE IF NOT EXISTS exchange_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exchange TEXT NOT NULL DEFAULT 'binance',
  environment TEXT NOT NULL DEFAULT 'testnet',
  api_key_encrypted TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  iv TEXT NOT NULL,
  tag TEXT NOT NULL,
  can_trade BOOLEAN NOT NULL DEFAULT 1,
  can_withdraw BOOLEAN NOT NULL DEFAULT 0,
  can_deposit BOOLEAN NOT NULL DEFAULT 1,
  is_safe BOOLEAN NOT NULL DEFAULT 1,
  security_badge TEXT NOT NULL DEFAULT 'RESTRICTED_SAFE',
  last_sync_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exchange_accounts_user ON exchange_accounts(user_id);

-- Server-Authoritative Exchange Orders
CREATE TABLE IF NOT EXISTS exchange_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_order_id TEXT UNIQUE NOT NULL,
  exchange_order_id TEXT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  orig_qty REAL NOT NULL,
  executed_qty REAL NOT NULL DEFAULT 0.0,
  price REAL NOT NULL,
  avg_price REAL NOT NULL DEFAULT 0.0,
  cumulative_quote_qty REAL NOT NULL DEFAULT 0.0,
  quote_asset TEXT NOT NULL,
  notional REAL NOT NULL,
  fee REAL NOT NULL DEFAULT 0.0,
  reserved_cash REAL NOT NULL DEFAULT 0.0,
  reserved_qty REAL NOT NULL DEFAULT 0.0,
  idempotency_key TEXT UNIQUE NOT NULL,
  reject_reason TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exchange_orders_client_id ON exchange_orders(client_order_id);
CREATE INDEX IF NOT EXISTS idx_exchange_orders_user ON exchange_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_exchange_orders_status ON exchange_orders(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exchange_orders_user_idemp ON exchange_orders(user_id, idempotency_key);

-- Individual Fills for Partial Fills Accounting
CREATE TABLE IF NOT EXISTS exchange_fills (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES exchange_orders(id) ON DELETE CASCADE,
  exchange_trade_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  price REAL NOT NULL,
  qty REAL NOT NULL,
  commission REAL NOT NULL,
  commission_asset TEXT NOT NULL,
  quote_qty REAL NOT NULL,
  ledger_processed BOOLEAN NOT NULL DEFAULT 0,
  ledger_transaction_id TEXT,
  executed_at BIGINT NOT NULL,
  UNIQUE(order_id, exchange_trade_id)
);
CREATE INDEX IF NOT EXISTS idx_exchange_fills_order ON exchange_fills(order_id);
CREATE INDEX IF NOT EXISTS idx_exchange_fills_processed ON exchange_fills(ledger_processed);

-- Authoritative Position Projections with Cost Basis & Realized P&L
CREATE TABLE IF NOT EXISTS authoritative_positions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_mode TEXT NOT NULL DEFAULT 'live',
  asset TEXT NOT NULL,
  total_quantity_minor BIGINT NOT NULL DEFAULT 0,
  reserved_quantity_minor BIGINT NOT NULL DEFAULT 0,
  cost_basis_minor BIGINT NOT NULL DEFAULT 0,
  realized_pnl_minor BIGINT NOT NULL DEFAULT 0,
  total_fees_minor BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(user_id, account_mode, asset)
);
CREATE INDEX IF NOT EXISTS idx_authoritative_positions_user ON authoritative_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_authoritative_positions_user_mode ON authoritative_positions(user_id, account_mode);

-- Reconciliation Runs & Mismatches
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id TEXT PRIMARY KEY,
  ran_at BIGINT NOT NULL,
  status TEXT NOT NULL,
  orders_checked INTEGER NOT NULL DEFAULT 0,
  balances_checked INTEGER NOT NULL DEFAULT 0,
  mismatches_found INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reconciliation_mismatches (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES reconciliation_runs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  local_state TEXT NOT NULL,
  exchange_state TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT 0,
  resolved_at BIGINT,
  notes TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mismatches_user ON reconciliation_mismatches(user_id);

-- Append-Only Institutional Audit Event Ledger
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  event_id TEXT UNIQUE NOT NULL,
  user_id TEXT,
  timestamp BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT,
  actor TEXT NOT NULL,
  before_state TEXT,
  after_state TEXT,
  external_id TEXT,
  metadata TEXT,
  result TEXT NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_ts ON audit_events(timestamp);

-- Server Idempotency Storage
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  user_id TEXT,
  endpoint TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_body TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);
