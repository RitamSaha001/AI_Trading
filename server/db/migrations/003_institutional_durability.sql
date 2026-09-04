-- ============================================================================
-- Migration 003: Multi-Instance Worker Coordination & Durability Leases
-- ============================================================================

CREATE TABLE IF NOT EXISTS worker_leases (
  worker_name TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  acquired_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_worker_leases_expires ON worker_leases(expires_at);

-- Partial and composite indexes for high-throughput order recovery sweeps and user lookups
CREATE INDEX IF NOT EXISTS idx_exchange_orders_user_status ON exchange_orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_exchange_orders_non_terminal ON exchange_orders(status) WHERE status IN ('SUBMITTING', 'UNKNOWN', 'RECONCILING', 'CANCEL_REQUESTED', 'PARTIALLY_FILLED', 'OPEN');
