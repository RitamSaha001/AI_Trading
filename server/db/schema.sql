-- ============================================================================
-- Lumen Enterprise Real-Money Trading Platform Schema
-- Compatible with PostgreSQL (Production) and SQLite (Development/Testing)
-- ============================================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  photo_url TEXT,
  provider TEXT NOT NULL, -- 'google' | 'email'
  provider_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'TRADER',
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
  tier TEXT NOT NULL DEFAULT 'tier0_unverified', -- 'tier0_unverified' | 'tier1_basic' | 'tier2_verified'
  status TEXT NOT NULL DEFAULT 'unverified', -- 'unverified' | 'pending' | 'verified' | 'rejected'
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
  account_mode TEXT NOT NULL DEFAULT 'paper', -- 'paper' | 'exchange' | 'web3'
  is_emergency_frozen BOOLEAN NOT NULL DEFAULT 0,
  frozen_at BIGINT,
  freeze_reason TEXT,
  max_single_order_pct REAL NOT NULL DEFAULT 0.40, -- 40% cap
  max_asset_concentration_pct REAL NOT NULL DEFAULT 0.50, -- 50% cap
  min_cash_reserve_pct REAL NOT NULL DEFAULT 0.15, -- 15% reserve
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
  account_mode TEXT NOT NULL DEFAULT 'live', -- 'live' | 'paper'
  account_type TEXT NOT NULL, -- 'sovereign_cash' | 'trading_allocated' | 'crypto_holdings' | 'equity_holdings' | 'asset_holdings' | 'reserve_escrow' | 'fee_treasury' | 'realized_pnl'
  asset_or_currency TEXT NOT NULL, -- 'USD' | 'INR' | 'BTC' | 'ETH' | 'USDT' etc.
  balance_minor BIGINT NOT NULL DEFAULT 0, -- Minor units (cents/paise/satoshis/wei)
  reserved_minor BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(user_id, account_mode, account_type, asset_or_currency)
);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_user ON ledger_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_user_mode ON ledger_accounts(user_id, account_mode);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_asset_type ON ledger_accounts(account_type, asset_or_currency);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_ref_type ON ledger_entries(reference_type, currency_or_asset);

-- Double-Entry Ledger Immutable Journal Entries
CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  account_mode TEXT NOT NULL DEFAULT 'live', -- 'live' | 'paper'
  entry_type TEXT NOT NULL, -- 'debit' | 'credit'
  amount_minor BIGINT NOT NULL,
  balance_after_minor BIGINT NOT NULL,
  currency_or_asset TEXT NOT NULL,
  reference_type TEXT NOT NULL, -- 'deposit' | 'withdrawal' | 'allocation' | 'recall' | 'trade_fill' | 'fee' | 'realized_pnl' | 'adjustment' | 'reversal'
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
  currency TEXT NOT NULL, -- 'USD' | 'INR'
  method TEXT NOT NULL, -- 'card' | 'upi'
  provider TEXT NOT NULL, -- 'phonepe' | 'sandbox' | 'razorpay' | 'stripe' | 'internal'
  provider_order_id TEXT UNIQUE,
  status TEXT NOT NULL, -- 'CREATED' | 'INITIATING' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | 'UNKNOWN_PROVIDER_STATE' | 'REFUND_PENDING' | 'PARTIALLY_REFUNDED' | 'REFUNDED'
  idempotency_key TEXT UNIQUE NOT NULL,
  checkout_url TEXT,
  upi_intent_uri TEXT,
  refunded_amount_minor BIGINT NOT NULL DEFAULT 0,
  reserved_refund_amount_minor BIGINT NOT NULL DEFAULT 0,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_provider ON payment_orders(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status_created ON payment_orders(status, created_at);

-- Payment Transactions
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  payment_order_id TEXT NOT NULL REFERENCES payment_orders(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  provider_payment_id TEXT UNIQUE,
  amount_minor BIGINT NOT NULL,
  currency TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pending' | 'succeeded' | 'failed' | 'pending_manual_settlement'
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_payment_id_unique ON payments(provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_utr_unique ON payments(utr) WHERE utr IS NOT NULL;

-- Webhook Ingestion Records (Replay & Deduplication Protection)
CREATE TABLE IF NOT EXISTS payment_webhooks (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL, -- 'received' | 'verified' | 'processing' | 'processed' | 'failed_retryable' | 'failed_permanent' | 'ignored'
  error TEXT,
  raw_headers TEXT,
  raw_body TEXT,
  received_at BIGINT,
  verified_at BIGINT,
  processing_started_at BIGINT,
  processing_attempt INTEGER NOT NULL DEFAULT 0,
  worker_id TEXT,
  lease_expires_at BIGINT,
  next_retry_at BIGINT,
  failed_at BIGINT,
  processed_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhooks_event ON payment_webhooks(event_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_webhooks_provider_event_unique ON payment_webhooks(provider, event_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_lease ON payment_webhooks(status, lease_expires_at);

-- Durable DB-Backed Passwordless Email Challenges
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

-- Payment Attempts (Append-Only Financial History)
CREATE TABLE IF NOT EXISTS payment_attempts (
  id TEXT PRIMARY KEY,
  payment_order_id TEXT NOT NULL REFERENCES payment_orders(id) ON DELETE RESTRICT,
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

-- Payment Settlements (Append-Only Financial History)
CREATE TABLE IF NOT EXISTS payment_settlements (
  id TEXT PRIMARY KEY,
  payment_order_id TEXT NOT NULL REFERENCES payment_orders(id) ON DELETE RESTRICT,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_settlements_order_unique ON payment_settlements(payment_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_settlements_payment_unique ON payment_settlements(payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_settlements_ext_unique ON payment_settlements(external_settlement_id) WHERE external_settlement_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_settlements_ledger_tx_unique ON payment_settlements(ledger_transaction_id) WHERE ledger_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_settlements_order ON payment_settlements(payment_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_settlements_payment ON payment_settlements(payment_id);

-- Payment Refunds (Append-Only Financial History)
CREATE TABLE IF NOT EXISTS payment_refunds (
  id TEXT PRIMARY KEY,
  payment_order_id TEXT NOT NULL REFERENCES payment_orders(id) ON DELETE RESTRICT,
  payment_id TEXT REFERENCES payments(id) ON DELETE RESTRICT,
  provider_refund_id TEXT UNIQUE,
  amount_minor BIGINT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL, -- 'INITIATING' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUND_UNKNOWN'
  reason TEXT NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  ledger_transaction_id TEXT,
  initiated_by TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_order ON payment_refunds(payment_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_status_order ON payment_refunds(status, payment_order_id);

-- Foreign Exchange Quotes
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

-- Exchange Accounts (Encrypted Credentials At Rest)
CREATE TABLE IF NOT EXISTS exchange_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exchange TEXT NOT NULL DEFAULT 'binance',
  environment TEXT NOT NULL DEFAULT 'testnet', -- 'testnet' | 'mainnet'
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
  side TEXT NOT NULL, -- 'BUY' | 'SELL'
  type TEXT NOT NULL, -- 'LIMIT' | 'MARKET' | 'STOP_LOSS_LIMIT'
  status TEXT NOT NULL, -- 'CREATED' | 'VALIDATING' | 'RISK_APPROVED' | 'SUBMITTING' | 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'CANCELED' | 'REJECTED' | 'EXPIRED' | 'UNKNOWN' | 'RECONCILING' | 'RECONCILED' | 'FAILED'
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
  orig_qty_exact TEXT,
  executed_qty_exact TEXT DEFAULT '0',
  price_exact TEXT,
  avg_price_exact TEXT DEFAULT '0',
  cumulative_quote_exact TEXT DEFAULT '0',
  notional_exact TEXT,
  fee_exact TEXT DEFAULT '0',
  fee_asset TEXT,
  estimated_fee_exact TEXT DEFAULT '0',
  actual_commission_exact TEXT,
  actual_commission_asset TEXT,
  commission_status TEXT NOT NULL DEFAULT 'ESTIMATED',
  executed_notional_exact TEXT DEFAULT '0',
  reserved_cash_minor BIGINT NOT NULL DEFAULT 0,
  reserved_qty_minor BIGINT NOT NULL DEFAULT 0,
  broker TEXT DEFAULT 'binance',
  idempotency_key TEXT UNIQUE NOT NULL,
  reject_reason TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exchange_orders_broker ON exchange_orders(broker);
CREATE INDEX IF NOT EXISTS idx_exchange_orders_client_id ON exchange_orders(client_order_id);
CREATE INDEX IF NOT EXISTS idx_exchange_orders_user ON exchange_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_exchange_orders_status ON exchange_orders(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exchange_orders_user_idemp ON exchange_orders(user_id, idempotency_key);

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

-- Individual Fills for Partial Fills Accounting
CREATE TABLE IF NOT EXISTS exchange_fills (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES exchange_orders(id) ON DELETE CASCADE,
  exchange_trade_id TEXT NOT NULL,
  canonical_fill_key TEXT UNIQUE,
  symbol TEXT NOT NULL,
  price REAL NOT NULL,
  qty REAL NOT NULL,
  commission REAL NOT NULL,
  commission_asset TEXT NOT NULL,
  quote_qty REAL NOT NULL,
  price_exact TEXT,
  qty_exact TEXT,
  commission_exact TEXT,
  quote_qty_exact TEXT,
  commission_status TEXT NOT NULL DEFAULT 'AUTHORITATIVE',
  ledger_processed BOOLEAN NOT NULL DEFAULT 0,
  ledger_transaction_id TEXT,
  broker TEXT DEFAULT 'binance',
  executed_at BIGINT NOT NULL,
  UNIQUE(order_id, exchange_trade_id)
);
CREATE INDEX IF NOT EXISTS idx_exchange_fills_order ON exchange_fills(order_id);
CREATE INDEX IF NOT EXISTS idx_exchange_fills_processed ON exchange_fills(ledger_processed);
CREATE INDEX IF NOT EXISTS idx_exchange_fills_broker ON exchange_fills(broker);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exchange_fills_canonical_key ON exchange_fills(canonical_fill_key);

-- Multi-Broker Credentials Storage (Encrypted at Rest with AES-256-GCM)
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

-- Anti-CSRF Server-Side OAuth State Management
CREATE TABLE IF NOT EXISTS broker_oauth_states (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broker TEXT NOT NULL,
  redirect_uri TEXT,
  expires_at BIGINT NOT NULL,
  consumed_at BIGINT DEFAULT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_broker_oauth_states_user_broker ON broker_oauth_states(user_id, broker);
CREATE INDEX IF NOT EXISTS idx_broker_oauth_states_lookup ON broker_oauth_states(id, user_id, broker);

-- Double-Entry Settlement Idempotency & Financial Events
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

-- Authoritative Position Projections with Cost Basis & Realized P&L
CREATE TABLE IF NOT EXISTS authoritative_positions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_mode TEXT NOT NULL DEFAULT 'live', -- 'live' | 'paper'
  asset TEXT NOT NULL,
  total_quantity_minor BIGINT NOT NULL DEFAULT 0, -- 1e8 satoshis
  reserved_quantity_minor BIGINT NOT NULL DEFAULT 0,
  cost_basis_minor BIGINT NOT NULL DEFAULT 0, -- Total cash cost in cents (volume-weighted)
  realized_pnl_minor BIGINT NOT NULL DEFAULT 0, -- Cumulative realized P&L in cents
  total_fees_minor BIGINT NOT NULL DEFAULT 0, -- Cumulative fees paid in cents
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
  status TEXT NOT NULL, -- 'SUCCESS' | 'MISMATCH_DETECTED' | 'FAILED'
  orders_checked INTEGER NOT NULL DEFAULT 0,
  balances_checked INTEGER NOT NULL DEFAULT 0,
  mismatches_found INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reconciliation_mismatches (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES reconciliation_runs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  entity_type TEXT NOT NULL, -- 'BALANCE' | 'ORDER' | 'POSITION'
  entity_id TEXT NOT NULL,
  severity TEXT NOT NULL, -- 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  local_state TEXT NOT NULL,
  exchange_state TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT 0,
  resolved_at BIGINT,
  action_taken TEXT DEFAULT 'NONE',
  action_status TEXT DEFAULT 'PENDING',
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
  result TEXT NOT NULL, -- 'SUCCESS' | 'FAILURE' | 'BLOCKED'
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

-- Durable Circuit Breakers
CREATE TABLE IF NOT EXISTS circuit_breakers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL, -- 'GLOBAL' | 'ACCOUNT' | 'SYMBOL'
  scope_id TEXT NOT NULL DEFAULT '*',
  state TEXT NOT NULL DEFAULT 'CLOSED', -- 'CLOSED' | 'OPEN' | 'HALF_OPEN'
  opened_at BIGINT,
  reason TEXT,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  recovery_condition TEXT,
  updated_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_circuit_breakers_unique ON circuit_breakers(name, scope, scope_id);

-- Operational Kill Switches
CREATE TABLE IF NOT EXISTS operational_kill_switches (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL, -- 'GLOBAL' | 'ACCOUNT' | 'SYMBOL'
  target TEXT NOT NULL DEFAULT '*',
  is_frozen BOOLEAN NOT NULL DEFAULT 1,
  freeze_reason TEXT NOT NULL,
  frozen_by TEXT NOT NULL,
  frozen_at BIGINT NOT NULL,
  unfrozen_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_operational_kill_switches ON operational_kill_switches(scope, target, is_frozen);

-- Exchange Sync State
CREATE TABLE IF NOT EXISTS exchange_sync_state (
  account_id TEXT PRIMARY KEY,
  server_time_offset_ms BIGINT NOT NULL DEFAULT 0,
  last_sync_at BIGINT NOT NULL DEFAULT 0,
  rest_health TEXT NOT NULL DEFAULT 'HEALTHY',
  ws_health TEXT NOT NULL DEFAULT 'HEALTHY',
  rate_limit_used_1m INTEGER NOT NULL DEFAULT 0,
  rate_limit_reset_at BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL
);

-- Live Order Confirmations (Two-Step Human Confirmation)
CREATE TABLE IF NOT EXISTS live_order_confirmations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broker TEXT NOT NULL,
  symbol TEXT NOT NULL,
  instrument_key TEXT NOT NULL,
  exchange TEXT NOT NULL,
  side TEXT NOT NULL,
  order_type TEXT NOT NULL,
  quantity REAL NOT NULL,
  price REAL,
  trigger_price REAL,
  product TEXT NOT NULL,
  validity TEXT NOT NULL DEFAULT 'DAY',
  disclosed_quantity INTEGER,
  slice BOOLEAN NOT NULL DEFAULT 0,
  estimated_notional REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  order_hash TEXT NOT NULL,
  risk_snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  client_order_id TEXT UNIQUE NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  consumed_at BIGINT,
  rejection_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_live_confirmations_user ON live_order_confirmations(user_id);
CREATE INDEX IF NOT EXISTS idx_live_confirmations_lookup ON live_order_confirmations(id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_live_confirmations_client_order ON live_order_confirmations(client_order_id);

-- Durable Emergency System State
CREATE TABLE IF NOT EXISTS emergency_system_state (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'TRADING_NORMAL',
  reason TEXT,
  initiated_by TEXT,
  metadata TEXT,
  updated_at BIGINT NOT NULL
);

-- Controlled Panic Square-Off Run Audit
CREATE TABLE IF NOT EXISTS panic_squareoff_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  broker TEXT NOT NULL,
  status TEXT NOT NULL,
  cancelled_orders_count INTEGER NOT NULL DEFAULT 0,
  positions_evaluated_count INTEGER NOT NULL DEFAULT 0,
  close_orders_submitted_count INTEGER NOT NULL DEFAULT 0,
  errors TEXT,
  reconciliation_result TEXT,
  started_at BIGINT NOT NULL,
  completed_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_panic_squareoff_user ON panic_squareoff_runs(user_id);
