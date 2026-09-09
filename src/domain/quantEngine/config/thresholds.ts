/**
 * Institutional Quant Engine Thresholds & Parameters
 *
 * Centralizes all numeric thresholds, time windows, and mathematical multipliers
 * across all 10 quantitative trading scenarios and statutory clearing rules.
 *
 * Ground Rule: NEVER inline magic numbers in logic files; import and use these constants
 * so they can be systematically swept in walk-forward backtests.
 */

// ============================================================================
// SCENARIO 1: Statutory Transaction Cost (TCA) & Friction Hurdle
// ============================================================================
/** Minimum ratio of expected gross target profit to total roundtrip friction required to enter a trade */
export const MIN_FRICTION_PROFIT_MULTIPLE = 3.0;

/** Upstox flat brokerage cap per executed order (INR) */
export const BROKERAGE_FLAT_INR = 20.0;
/** Upstox variable brokerage percentage (0.05%) */
export const BROKERAGE_PCT = 0.0005;

/** Securities Transaction Tax (STT) for delivery buy side (0.10%) */
export const STT_DELIVERY_BUY_PCT = 0.001;
/** Securities Transaction Tax (STT) for delivery sell side (0.10%) */
export const STT_DELIVERY_SELL_PCT = 0.001;
/** Securities Transaction Tax (STT) for intraday equity sell side (0.025%) */
export const STT_INTRADAY_SELL_PCT = 0.00025;

/** NSE Exchange Transaction Charge (0.00297%) */
export const EXCHANGE_TXN_CHARGE_PCT = 0.0000297;
/** SEBI Turnover Charge (₹10 per crore = 0.0001%) */
export const SEBI_TURNOVER_CHARGE_PCT = 0.000001;

/** State Stamp Duty on delivery buy side (0.015%) */
export const STAMP_DUTY_DELIVERY_BUY_PCT = 0.00015;
/** State Stamp Duty on intraday buy side (0.003%) */
export const STAMP_DUTY_INTRADAY_BUY_PCT = 0.00003;

/** Goods and Services Tax (GST) applied to (Brokerage + Exchange + SEBI) (18.0%) */
export const GST_PCT = 0.18;

/** Authoritative NSE equity tick size (INR) */
export const NSE_TICK_SIZE_INR = 0.05;

// ============================================================================
// SCENARIO 2: Volatility-Adjusted Multi-Stage Profit Ratchet
// ============================================================================
/** Level 0.5 Micro-Shield trigger: gain threshold in ATR multiples (+0.30 ATR) */
export const RATCHET_STAGE_0_5_ATR = 0.30;
/** Level 1 trigger: initial expansion gain in ATR multiples (+0.70 ATR) */
export const RATCHET_STAGE_1_ATR = 0.70;
/** Level 2 trigger: Tranche 1 harvest in ATR multiples (+1.40 ATR) */
export const RATCHET_STAGE_2_ATR = 1.40;
/** Level 3 trigger: Core target T2 in ATR multiples (+2.00 ATR) */
export const RATCHET_STAGE_3_ATR = 2.00;

/** Locked gain for Level 1 stop: Entry + (0.25 * ATR) */
export const RATCHET_LOCK_1_ATR = 0.25;
/** Locked gain for Level 2 stop: Entry + (0.60 * ATR) */
export const RATCHET_LOCK_2_ATR = 0.60;
/** Locked gain for Level 3 stop: Entry + (1.25 * ATR) */
export const RATCHET_LOCK_3_ATR = 1.25;

// ============================================================================
// SCENARIOS 3, 4, 5: Session Timing Quality & Market Windows (IST minutes from midnight)
// ============================================================================
/** Market Pre-open start (09:00 IST) */
export const SESSION_PRE_OPEN_MIN = 9 * 60;
/** Market Continuous Trading Open (09:15 IST) */
export const SESSION_OPEN_MIN = 9 * 60 + 15;
/** Opening High-Volatility Auction Window End (09:30 IST) */
export const SESSION_OPENING_NOISE_END_MIN = 9 * 60 + 30;
/** Morning Institutional Expansion Window End (11:30 IST) */
export const SESSION_MORNING_END_MIN = 11 * 60 + 30;
/** Midday Consolidation / European Pre-Open Window End (13:15 IST) */
export const SESSION_MIDDAY_END_MIN = 13 * 60 + 15;
/** Intraday Entry Curfew: No new position entries permitted after this time (14:00 IST) */
export const SESSION_INTRADAY_ENTRY_CURFEW_MIN = 14 * 60;
/** Late-Day Liquidation & Unwinding Window Start (14:15 IST) */
export const SESSION_LATE_DAY_LIQUIDATION_START_MIN = 14 * 60 + 15;
/** Intraday Hard Cutoff for MIS auto-square-off (15:05 IST - safely before broker RMS penalty window) */
export const SESSION_INTRADAY_CUTOFF_MIN = 15 * 60 + 5;
/** Official Market Close (15:30 IST) */
export const SESSION_CLOSE_MIN = 15 * 60 + 30;

/** Additional conviction score points required during opening noise (09:15-09:30) */
export const OPENING_CONVICTION_DELTA = 8;
/** Minimum volume surge multiplier required during opening window */
export const OPENING_MIN_VOLUME_SURGE = 1.50;
/** ATR threshold to classify an opening gap as an exhaustion trap */
export const EXHAUSTION_GAP_ATR_THRESHOLD = 1.50;
/** RSI threshold indicating exhaustion gap */
export const EXHAUSTION_GAP_RSI_THRESHOLD = 75;

/** Additional conviction score points required during midday consolidation (11:30-13:15) */
export const MIDDAY_CONVICTION_DELTA = 6;
/** Minimum volume surge multiplier required to justify midday breakout */
export const MIDDAY_MIN_VOLUME_SURGE = 1.35;

/** Late-day trailing stop compression buffer for profitable trades (HWM - 0.35 ATR to lock gains) */
export const LATE_DAY_PROFIT_STOP_COMPRESSION_ATR = 0.35;
/** Late-day stop compression ceiling for flat/underwater trades (Entry - 0.40 ATR to cut slight loss early) */
export const LATE_DAY_LOSS_STOP_COMPRESSION_ATR = 0.40;

// ============================================================================
// SCENARIO 6: Volatility Shock & Flash Gap Dampener
// ============================================================================
/** Single candle ATR multiple that triggers a volatility shock freeze (2.5x ATR) */
export const VOLATILITY_SHOCK_ATR_MULTIPLE = 2.50;
/** Trading freeze cooldown duration after a volatility shock (10 minutes in ms) */
export const VOLATILITY_SHOCK_COOLDOWN_MS = 10 * 60 * 1000;

// ============================================================================
// SCENARIO 7: Stagnant Capital / Dead Trade Expiration
// ============================================================================
/** Maximum duration to hold a stagnant position before initiating time stop (90 minutes in ms) */
export const STAGNANT_TRADE_MAX_DURATION_MS = 90 * 60 * 1000;
/** Maximum price oscillation range in ATR defining a stagnant position (+/- 0.25 ATR) */
export const STAGNANT_TRADE_PRICE_RANGE_ATR = 0.25;
/** Volume ratio relative to 20-period average below which trade is deemed volume-faded */
export const STAGNANT_TRADE_MAX_VOLUME_RATIO = 0.80;

// ============================================================================
// SCENARIO 8: Sector Exposure, Beta Gating & Correlation Gate
// ============================================================================
/** Maximum portfolio exposure permitted in any single economic sector (35.0%) */
export const MAX_SECTOR_ALLOCATION_PCT = 35.0;
/** Maximum portfolio exposure permitted in any single asset (25.0%) */
export const MAX_SINGLE_ASSET_ALLOCATION_PCT = 25.0;
/** Maximum rolling correlation permitted between an asset and existing portfolio (0.75) */
export const MAX_PORTFOLIO_CORRELATION_THRESHOLD = 0.75;
/** Lookback periods for calculating rolling asset correlation */
export const CORRELATION_LOOKBACK_BARS = 30;

// ============================================================================
// SCENARIO 9: Multi-Tranche Asymmetric Scaling & Chandelier Runner Exit
// ============================================================================
/** Fraction of position harvested at Tranche 1 (33%) */
export const TRANCHE_1_HARVEST_FRACTION = 0.33;
/** Fraction of remaining position harvested at Tranche 2 (50%) */
export const TRANCHE_2_HARVEST_FRACTION = 0.50;
/** Lookback period for Chandelier Exit */
export const CHANDELIER_PERIODS = 22;
/** ATR multiplier for Chandelier trailing stop (1.8x ATR) */
export const CHANDELIER_ATR_MULTIPLIER = 1.80;

// ============================================================================
// SCENARIO 10: Half-Kelly Volatility-Adaptive Capital Sizing
// ============================================================================
/** Half-Kelly fraction applied to full Kelly formula (0.5) */
export const HALF_KELLY_FRACTION = 0.50;
/** Maximum allowable Kelly size multiplier clamp */
export const MAX_KELLY_SIZE_MULTIPLIER = 1.25;
/** Minimum allowable Kelly size multiplier clamp */
export const MIN_KELLY_SIZE_MULTIPLIER = 0.25;
/** ATR as a percentage of price threshold triggering volatility dampening (4.5%) */
export const VOLATILITY_DAMPENER_ATR_PRICE_RATIO = 0.045;
/** Win-rate penalty subtracted when volatility dampener is active (-6.0%) */
export const VOLATILITY_DAMPENER_WIN_RATE_PENALTY = 0.06;

// ============================================================================
// REGIME & STATISTICAL ARBITRAGE CUTOFFS
// ============================================================================
/** Hurst exponent lower band for anti-persistent mean reversion (H < 0.45) */
export const HURST_MEAN_REVERTING_THRESHOLD = 0.45;
/** Hurst exponent upper band for persistent trend momentum (H > 0.55) */
export const HURST_TRENDING_THRESHOLD = 0.55;
/** Hurst exponent cutoff for super-trend runner expansion (H >= 0.62) */
export const HURST_SUPER_TREND_THRESHOLD = 0.62;

/** Ornstein-Uhlenbeck Z-score threshold for extreme mean-reverting entry (|Z| >= 1.8) */
export const OU_EXTREME_ZSCORE_THRESHOLD = 1.80;
