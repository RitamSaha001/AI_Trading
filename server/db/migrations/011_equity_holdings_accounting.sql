-- ============================================================================
-- Migration 011: Multi-Asset Ledger Accounting (Equity Holdings & Multi-Broker Taxonomy)
-- Compatible with PostgreSQL (Production) and SQLite (Development/Testing)
-- ============================================================================

-- Document and establish equity_holdings and asset_holdings as first-class account types.
-- ledger_accounts already uses account_type TEXT NOT NULL.
-- This migration adds performance indices for asset and currency queries across account types.

CREATE INDEX IF NOT EXISTS idx_ledger_accounts_asset_type ON ledger_accounts(account_type, asset_or_currency);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_ref_type ON ledger_entries(reference_type, currency_or_asset);
