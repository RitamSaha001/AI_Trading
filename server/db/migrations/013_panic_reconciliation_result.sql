-- ============================================================================
-- Migration 013: Panic Square-Off Authoritative Reconciliation Audit
-- Compatible with PostgreSQL (Production) and SQLite (Development/Testing)
-- ============================================================================

ALTER TABLE panic_squareoff_runs ADD COLUMN IF NOT EXISTS reconciliation_result TEXT;
