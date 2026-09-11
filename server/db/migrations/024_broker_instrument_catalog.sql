-- ============================================================================
-- Migration 024: Broker-Native Instrument Catalog
-- ============================================================================

CREATE TABLE IF NOT EXISTS broker_instruments (
  broker TEXT NOT NULL,
  instrument_key TEXT NOT NULL,
  trading_symbol TEXT NOT NULL,
  display_name TEXT,
  exchange TEXT NOT NULL,
  segment TEXT NOT NULL,
  instrument_type TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  instrument_token TEXT,
  isin TEXT,
  tick_size TEXT,
  lot_size INTEGER,
  min_quantity TEXT,
  max_quantity TEXT,
  expiry TEXT,
  strike TEXT,
  option_type TEXT,
  active BOOLEAN NOT NULL DEFAULT 1,
  execution_eligible BOOLEAN NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  source_version TEXT,
  imported_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (broker, instrument_key)
);

CREATE INDEX IF NOT EXISTS idx_broker_instruments_lookup ON broker_instruments(broker, trading_symbol, active);
CREATE INDEX IF NOT EXISTS idx_broker_instruments_segment ON broker_instruments(broker, exchange, segment, active);
