import { Asset, Market, Candle } from '../../types';
import * as thresholds from './config/thresholds';
import {
  calculateHurstExponent,
  estimateOrnsteinUhlenbeck,
  runKalmanFilter,
} from './regimeDetectionEngine';

export interface FrictionBreakdown {
  turnover: number;
  brokerage: number;
  stt: number;
  exchangeTxnCharge: number;
  sebiTurnoverCharge: number;
  stampDuty: number;
  gst: number;
  totalRoundtripFriction: number;
  frictionPerShare: number;
  frictionPct: number;
}

export interface LiveMarketDataQualityResult {
  allowed: boolean;
  reason: string;
}

/**
 * Rejects unsuitable live inputs before any signal, sizing, or order logic runs.
 * It intentionally does not evaluate expected return: this is a data-integrity
 * boundary that prevents stale, synthetic, incomplete, or malformed feeds from
 * being treated as a tradable opportunity.
 */
export function evaluateLiveMarketDataQuality(
  market: Market,
  now: number = Date.now()
): LiveMarketDataQualityResult {
  if (market.isSynthetic) {
    return { allowed: false, reason: 'Synthetic market data cannot authorize a live entry.' };
  }
  if (!Number.isFinite(market.price) || market.price <= 0) {
    return { allowed: false, reason: 'Live market snapshot has an invalid price.' };
  }
  if (market.history.length < thresholds.MIN_ENTRY_HISTORY_POINTS) {
    return {
      allowed: false,
      reason: `Insufficient price history (${market.history.length}/${thresholds.MIN_ENTRY_HISTORY_POINTS}) for a live entry.`,
    };
  }
  if (market.candles.length < thresholds.MIN_ENTRY_CANDLE_COUNT) {
    return {
      allowed: false,
      reason: `Insufficient OHLCV candles (${market.candles.length}/${thresholds.MIN_ENTRY_CANDLE_COUNT}) for a live entry.`,
    };
  }
  if (market.lastUpdated > 0 && now >= market.lastUpdated && now - market.lastUpdated > thresholds.MAX_LIVE_MARKET_DATA_AGE_MS) {
    return {
      allowed: false,
      reason: `Market snapshot is ${(now - market.lastUpdated) / 1000}s old; live-entry limit is ${thresholds.MAX_LIVE_MARKET_DATA_AGE_MS / 1000}s.`,
    };
  }

  const recentCandles = market.candles.slice(-thresholds.MIN_ENTRY_CANDLE_COUNT);
  const hasInvalidCandle = recentCandles.some((candle) =>
    !Number.isFinite(candle.open) ||
    !Number.isFinite(candle.high) ||
    !Number.isFinite(candle.low) ||
    !Number.isFinite(candle.close) ||
    !Number.isFinite(candle.volume) ||
    candle.low > candle.high ||
    candle.volume < 0
  );
  if (hasInvalidCandle || market.history.some((price) => !Number.isFinite(price) || price <= 0)) {
    return { allowed: false, reason: 'Market snapshot contains malformed price or OHLCV observations.' };
  }

  return { allowed: true, reason: 'Live market data passes completeness, freshness, and integrity checks.' };
}

/**
 * Computes exact roundtrip transaction costs and statutory clearing friction on NSE.
 * Includes Upstox flat/percentage brokerage, STT, exchange charges, SEBI turnover,
 * state stamp duty, and 18% GST on service charges.
 */
export function calculateRoundtripFriction(
  price: number,
  quantity: number,
  isDelivery = true
): FrictionBreakdown {
  const safeQty = Math.max(1, quantity);
  const safePrice = Math.max(0.01, price);
  const turnover = safePrice * safeQty;

  // Upstox brokerage per executed order
  const buyBrokerage = isDelivery
    ? thresholds.BROKERAGE_FLAT_INR
    : Math.min(thresholds.BROKERAGE_FLAT_INR, turnover * thresholds.BROKERAGE_PCT);
  const sellBrokerage = isDelivery
    ? thresholds.BROKERAGE_FLAT_INR
    : Math.min(thresholds.BROKERAGE_FLAT_INR, turnover * thresholds.BROKERAGE_PCT);
  const brokerage = +(buyBrokerage + sellBrokerage).toFixed(2);

  // Securities Transaction Tax (STT)
  const stt = isDelivery
    ? +(turnover * thresholds.STT_DELIVERY_BUY_PCT + turnover * thresholds.STT_DELIVERY_SELL_PCT).toFixed(2)
    : +(turnover * thresholds.STT_INTRADAY_SELL_PCT).toFixed(2);

  // Exchange transaction charges (both legs)
  const exchangeTxnCharge = +(2 * turnover * thresholds.EXCHANGE_TXN_CHARGE_PCT).toFixed(2);

  // SEBI turnover charge (both legs)
  const sebiTurnoverCharge = +(2 * turnover * thresholds.SEBI_TURNOVER_CHARGE_PCT).toFixed(2);

  // State stamp duty (buy leg only)
  const stampDuty = isDelivery
    ? +(turnover * thresholds.STAMP_DUTY_DELIVERY_BUY_PCT).toFixed(2)
    : +(turnover * thresholds.STAMP_DUTY_INTRADAY_BUY_PCT).toFixed(2);

  // GST 18% on (brokerage + exchange + sebi)
  const gst = +(thresholds.GST_PCT * (brokerage + exchangeTxnCharge + sebiTurnoverCharge)).toFixed(2);

  const totalRoundtripFriction = +(brokerage + stt + exchangeTxnCharge + sebiTurnoverCharge + stampDuty + gst).toFixed(2);
  const frictionPerShare = +(totalRoundtripFriction / safeQty).toFixed(2);
  const frictionPct = +((totalRoundtripFriction / turnover) * 100).toFixed(2);

  return {
    turnover: +turnover.toFixed(2),
    brokerage,
    stt,
    exchangeTxnCharge,
    sebiTurnoverCharge,
    stampDuty,
    gst,
    totalRoundtripFriction,
    frictionPerShare,
    frictionPct,
  };
}

/**
 * Scenario 1: Pre-Trade Transaction Cost Analysis (TCA) Hurdle
 * Rejects any trade setup where expected target gross profit is less than 3x roundtrip friction.
 */
export function passesFrictionHurdle(
  expectedGrossProfit: number,
  totalRoundtripFriction: number,
  multiple: number = thresholds.MIN_FRICTION_PROFIT_MULTIPLE
): boolean {
  if (expectedGrossProfit <= 0 || totalRoundtripFriction <= 0) return false;
  return expectedGrossProfit >= multiple * totalRoundtripFriction;
}

/**
 * Computes a dynamic minimum net expected profit floor (INR) scaled to trade notional and friction:
 * dynamicFloor = Math.max(
 *   roundtripFriction * frictionMultiple,
 *   notional * notionalPct,
 *   baseFloor
 * )
 */
export function calculateDynamicNetProfitFloor(
  roundtripFriction: number,
  notional: number = 0,
  options?: {
    frictionMultiple?: number;
    notionalPct?: number;
    baseFloor?: number;
  }
): number {
  const frictionMultiple = options?.frictionMultiple ?? thresholds.MIN_NET_PROFIT_FRICTION_MULTIPLE;
  const notionalPct = options?.notionalPct ?? thresholds.MIN_NET_PROFIT_NOTIONAL_PCT;
  const baseFloor = options?.baseFloor ?? thresholds.BASE_NET_PROFIT_FLOOR_INR;

  const frictionComponent = Math.max(0, roundtripFriction || 0) * frictionMultiple;
  const notionalComponent = Math.max(0, notional || 0) * notionalPct;

  return Math.max(frictionComponent, notionalComponent, baseFloor);
}

/**
 * Validates that realistic near-term gain (capped at 1.25 ATR) clears all roundtrip
 * friction with at least the statutory/dynamic minimum net rupee profit floor.
 */
export function passesNetProfitFloor(
  realisticGrossProfit: number,
  totalRoundtripFriction: number,
  minNetProfitFloor: number = thresholds.MIN_NET_PROFIT_FLOOR_INR
): boolean {
  if (realisticGrossProfit <= 0 || totalRoundtripFriction <= 0) return false;
  return (realisticGrossProfit - totalRoundtripFriction) >= minNetProfitFloor;
}

export interface TTMSqueezeResult {
  squeezeState: 'SQUEEZE_ON' | 'SQUEEZE_OFF' | 'NO_SQUEEZE';
  momentum: number;
  momentumDirection: 'RISING_POSITIVE' | 'FALLING_POSITIVE' | 'FALLING_NEGATIVE' | 'RISING_NEGATIVE';
  bbUpper: number;
  bbLower: number;
  kcUpper: number;
  kcLower: number;
  bandwidth: number;
}

export interface HalfKellyResult {
  fullKelly: number;
  halfKelly: number;
  recommendedSizeMultiplier: number;
  edge: number;
  odds: number;
}

export interface SectorExposureSummary {
  sectorWeights: Record<string, number>;
  maxSector: string;
  maxSectorWeight: number;
  isOverweight: boolean;
  overweightSectors: string[];
}

// Official NSE Sector classification for Indian Bluechip Fleet
export const ASSET_SECTOR_MAP: Record<string, string> = {
  HDFCBANK: 'Banking',
  ICICIBANK: 'Banking',
  SBIN: 'Banking',
  TCS: 'IT',
  INFY: 'IT',
  RELIANCE: 'Energy',
  TATAMOTORS: 'Auto',
  LT: 'Infrastructure',
  ITC: 'FMCG',
  BHARTIARTL: 'Telecom',
  HAL: 'Defence',
  BEL: 'Defence',
  NTPC: 'Power',
  TATASTEEL: 'Metals',
  SUNPHARMA: 'Pharma',
};

// Maximum permitted portfolio allocation per single sector
export const MAX_SECTOR_ALLOCATION_PCT = thresholds.MAX_SECTOR_ALLOCATION_PCT;

/**
 * Computes TTM Volatility Squeeze using Bollinger Bands (20, 2.0) and Keltner Channels (20, 1.5).
 * Detects pre-breakout volatility compression and momentum direction.
 */
export function calculateTTMSqueeze(
  history: number[],
  length: number = 20,
  bbMultiplier: number = 2.0,
  kcMultiplier: number = 1.5
): TTMSqueezeResult {
  if (!history || history.length < length) {
    const defaultPrice = history && history.length > 0 ? history[history.length - 1] : 100;
    return {
      squeezeState: 'NO_SQUEEZE',
      momentum: 0,
      momentumDirection: 'RISING_POSITIVE',
      bbUpper: defaultPrice * 1.02,
      bbLower: defaultPrice * 0.98,
      kcUpper: defaultPrice * 1.03,
      kcLower: defaultPrice * 0.97,
      bandwidth: 0.04,
    };
  }

  const window = history.slice(-length);
  const currentPrice = window[window.length - 1];

  // 1. Simple Moving Average (SMA)
  const sma = window.reduce((sum, p) => sum + p, 0) / length;

  // 2. Standard Deviation
  const variance = window.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / length;
  const stdev = Math.sqrt(variance);

  // 3. Bollinger Bands (2.0 Stdev)
  const bbUpper = sma + bbMultiplier * stdev;
  const bbLower = sma - bbMultiplier * stdev;
  const bandwidth = (bbUpper - bbLower) / (sma || 1);

  // 4. Average True Range (ATR approximation across price series)
  let atrSum = 0;
  for (let i = 1; i < window.length; i++) {
    atrSum += Math.abs(window[i] - window[i - 1]);
  }
  const atr = Math.max(currentPrice * 0.0025, atrSum / (window.length - 1));

  // 5. Keltner Channels (1.5 ATR)
  const kcUpper = sma + kcMultiplier * atr;
  const kcLower = sma - kcMultiplier * atr;

  // Squeeze condition: Bollinger Bands completely inside Keltner Channels
  const isSqueezeActive = bbUpper < kcUpper && bbLower > kcLower;

  // Check previous period to detect squeeze release (expansion breakout)
  let prevSqueezeActive = false;
  if (history.length >= length + 1) {
    const prevWindow = history.slice(-length - 1, -1);
    const prevSma = prevWindow.reduce((sum, p) => sum + p, 0) / length;
    const prevVar = prevWindow.reduce((sum, p) => sum + Math.pow(p - prevSma, 2), 0) / length;
    const prevStdev = Math.sqrt(prevVar);
    const prevBbUpper = prevSma + bbMultiplier * prevStdev;
    const prevBbLower = prevSma - bbMultiplier * prevStdev;
    let prevAtrSum = 0;
    for (let i = 1; i < prevWindow.length; i++) {
      prevAtrSum += Math.abs(prevWindow[i] - prevWindow[i - 1]);
    }
    const prevAtr = Math.max(prevWindow[prevWindow.length - 1] * 0.0025, prevAtrSum / (prevWindow.length - 1));
    const prevKcUpper = prevSma + kcMultiplier * prevAtr;
    const prevKcLower = prevSma - kcMultiplier * prevAtr;
    prevSqueezeActive = prevBbUpper < prevKcUpper && prevBbLower > prevKcLower;
  }

  let squeezeState: 'SQUEEZE_ON' | 'SQUEEZE_OFF' | 'NO_SQUEEZE' = 'NO_SQUEEZE';
  if (isSqueezeActive) {
    squeezeState = 'SQUEEZE_ON';
  } else if (prevSqueezeActive && !isSqueezeActive) {
    squeezeState = 'SQUEEZE_OFF'; // Firing expansion breakout
  }

  // 6. Momentum Oscillator (Linear regression of detrended price: Price - (DonchianMid + SMA)/2)
  const minPrice = Math.min(...window);
  const maxPrice = Math.max(...window);
  const donchianMid = (minPrice + maxPrice) / 2;
  const baseline = (donchianMid + sma) / 2;
  const momentum = currentPrice - baseline;

  // Previous momentum to calculate direction
  const prevPrice = window[window.length - 2] ?? currentPrice;
  const prevMomentum = prevPrice - baseline;

  let momentumDirection: 'RISING_POSITIVE' | 'FALLING_POSITIVE' | 'FALLING_NEGATIVE' | 'RISING_NEGATIVE';
  if (momentum >= 0) {
    momentumDirection = momentum >= prevMomentum ? 'RISING_POSITIVE' : 'FALLING_POSITIVE';
  } else {
    momentumDirection = momentum <= prevMomentum ? 'FALLING_NEGATIVE' : 'RISING_NEGATIVE';
  }

  return {
    squeezeState,
    momentum: +momentum.toFixed(2),
    momentumDirection,
    bbUpper: +bbUpper.toFixed(2),
    bbLower: +bbLower.toFixed(2),
    kcUpper: +kcUpper.toFixed(2),
    kcLower: +kcLower.toFixed(2),
    bandwidth: +bandwidth.toFixed(4),
  };
}

/**
 * Convenience helper returning concise 'on' | 'off' | 'none' squeeze status.
 */
export function ttmSqueezeState(candlesOrPrices: Candle[] | number[]): 'on' | 'off' | 'none' {
  const prices = Array.isArray(candlesOrPrices) && candlesOrPrices.length > 0 && typeof (candlesOrPrices[0] as any) === 'object'
    ? (candlesOrPrices as Candle[]).map((c) => c.close)
    : (candlesOrPrices as number[]);
  const res = calculateTTMSqueeze(prices);
  if (res.squeezeState === 'SQUEEZE_ON') return 'on';
  if (res.squeezeState === 'SQUEEZE_OFF') return 'off';
  return 'none';
}

/**
 * Scenario 4: Ornstein-Uhlenbeck Mean-Reversion Signal
 * Computes mean-reverting velocity theta, equilibrium price mu, and standardized Z-score.
 */
export function ouMeanReversionSignal(candlesOrPrices: Candle[] | number[]): {
  theta: number;
  mu: number;
  zScore: number;
  isExtreme: boolean;
} {
  const prices = Array.isArray(candlesOrPrices) && candlesOrPrices.length > 0 && typeof (candlesOrPrices[0] as any) === 'object'
    ? (candlesOrPrices as Candle[]).map((c) => c.close)
    : (candlesOrPrices as number[]);
  const ou = estimateOrnsteinUhlenbeck(prices);
  const isExtreme = Math.abs(ou.currentZScore) >= thresholds.OU_EXTREME_ZSCORE_THRESHOLD;
  return {
    theta: +ou.theta.toFixed(4),
    mu: +ou.mu.toFixed(2),
    zScore: +ou.currentZScore.toFixed(2),
    isExtreme,
  };
}

/**
 * Computes the 1D recursive Kalman Filter Fair Value as an unbiased reference for smart limit pricing.
 */
export function kalmanFairValue(prices: number[]): number {
  if (!prices || prices.length === 0) return 0;
  const res = runKalmanFilter(prices);
  return +res.finalState.estimatedState.toFixed(2);
}

/**
 * Computes Hurst exponent from either candle arrays or raw close price streams.
 */
export function calculateHurstExponentFromCandles(candlesOrPrices: Candle[] | number[], window?: number) {
  const prices = Array.isArray(candlesOrPrices) && candlesOrPrices.length > 0 && typeof (candlesOrPrices[0] as any) === 'object'
    ? (candlesOrPrices as Candle[]).map((c) => c.close)
    : (candlesOrPrices as number[]);
  const slice = window && window > 0 ? prices.slice(-window) : prices;
  return calculateHurstExponent(slice);
}

/**
 * Scenario 8: Sector Beta Gate
 * Blocks long entries when the underlying sector index is trading below VWAP with lower lows.
 */
export function sectorBetaGate(
  asset: string,
  sectorIndexMarket?: Market,
  assetMarket?: Market
): { allowed: boolean; reason: string } {
  if (!sectorIndexMarket || !sectorIndexMarket.history || sectorIndexMarket.history.length < 5) {
    return { allowed: true, reason: 'Sector data neutral or unavailable; gate open.' };
  }

  const secPrices = sectorIndexMarket.history;
  const secCurrent = secPrices[secPrices.length - 1];
  const secMetrics = calculateVolumeMetrics(sectorIndexMarket.candles, secPrices);
  const secVwap = secMetrics.vwap;

  // Sector is below VWAP
  const isSectorBelowVwap = secCurrent < secVwap;

  // Sector making lower lows over the last 10 periods
  const recentSec = secPrices.slice(-10);
  const isSectorLowerLows = recentSec.length >= 5 && recentSec[recentSec.length - 1] < recentSec[0];

  const sectorName = getAssetSector(asset);
  if (isSectorBelowVwap && isSectorLowerLows) {
    return {
      allowed: false,
      reason: `Sector ${sectorName} is in breakdown (Price ₹${secCurrent.toFixed(2)} < VWAP ₹${secVwap.toFixed(2)} with lower lows). Long entries blocked to avoid fighting sector beta.`,
    };
  }

  return {
    allowed: true,
    reason: `Sector ${sectorName} healthy (Price ₹${secCurrent.toFixed(2)} relative to VWAP ₹${secVwap.toFixed(2)}).`,
  };
}

/**
 * Computes Half-Kelly Optimal Capital Sizing:
 * f* = (p * b - q) / b
 * where p = win rate, q = (1 - p), b = odds (reward:risk ratio).
 * Returns Half-Kelly multiplier clamped between minFraction and maxFraction.
 */
export function calculateHalfKellyFraction(
  winRate: number,
  rewardRiskRatio: number,
  maxFraction: number = thresholds.MAX_KELLY_SIZE_MULTIPLIER,
  minFraction: number = thresholds.MIN_KELLY_SIZE_MULTIPLIER,
  atrPriceRatio?: number
): HalfKellyResult {
  let effectiveWinRate = winRate;
  if (
    atrPriceRatio !== undefined &&
    atrPriceRatio > thresholds.VOLATILITY_DAMPENER_ATR_PRICE_RATIO
  ) {
    effectiveWinRate -= thresholds.VOLATILITY_DAMPENER_WIN_RATE_PENALTY;
  }

  const p = Math.max(0.01, Math.min(0.99, effectiveWinRate));
  const b = Math.max(0.1, rewardRiskRatio);
  const q = 1 - p;

  // Kelly formula: (p * b - q) / b = p - (q / b)
  const fullKelly = (p * b - q) / b;
  const halfKelly = fullKelly * thresholds.HALF_KELLY_FRACTION;

  // Clamped fractional sizing multiplier
  const recommendedSizeMultiplier = Math.max(
    minFraction,
    Math.min(maxFraction, +halfKelly.toFixed(3))
  );

  return {
    fullKelly: +fullKelly.toFixed(3),
    halfKelly: +halfKelly.toFixed(3),
    recommendedSizeMultiplier,
    edge: +(p * b - q).toFixed(3),
    odds: +b.toFixed(2),
  };
}

/**
 * Returns the official NSE sector of an asset.
 */
export function getAssetSector(asset: string): string {
  return ASSET_SECTOR_MAP[asset.toUpperCase()] || 'Other Equities';
}

/**
 * Evaluates sector concentration across current holdings and proposed allocation.
 * Enforces maximum 35% concentration per sector.
 */
export function calculateSectorAllocations(
  positions: Record<string, number>,
  markets: Record<string, Market | undefined>,
  totalPortfolioValue: number
): SectorExposureSummary {
  const sectorValues: Record<string, number> = {};

  for (const [symbol, qty] of Object.entries(positions)) {
    if (qty <= 0) continue;
    const price = markets[symbol]?.price || 0;
    const notional = qty * price;
    const sector = getAssetSector(symbol);
    sectorValues[sector] = (sectorValues[sector] || 0) + notional;
  }

  const safeTotal = Math.max(1, totalPortfolioValue);
  const sectorWeights: Record<string, number> = {};
  let maxSector = 'None';
  let maxSectorWeight = 0;
  const overweightSectors: string[] = [];

  for (const [sec, val] of Object.entries(sectorValues)) {
    const weight = +((val / safeTotal) * 100).toFixed(1);
    sectorWeights[sec] = weight;
    if (weight > maxSectorWeight) {
      maxSectorWeight = weight;
      maxSector = sec;
    }
    if (weight > MAX_SECTOR_ALLOCATION_PCT) {
      overweightSectors.push(sec);
    }
  }

  return {
    sectorWeights,
    maxSector,
    maxSectorWeight,
    isOverweight: overweightSectors.length > 0,
    overweightSectors,
  };
}

/**
 * Validates whether adding a new position notional would breach the sector limit.
 */
export function validateSectorExposureLimit(
  asset: string,
  proposedNotional: number,
  currentPositions: Record<string, number>,
  markets: Record<string, Market | undefined>,
  portfolioValue: number,
  maxAllowedSectorPct: number = MAX_SECTOR_ALLOCATION_PCT
): { allowed: boolean; projectedSectorPct: number; sector: string; reason?: string } {
  const sector = getAssetSector(asset);
  let currentSectorNotional = 0;

  for (const [sym, qty] of Object.entries(currentPositions)) {
    if (qty <= 0) continue;
    if (getAssetSector(sym) === sector) {
      const price = markets[sym]?.price || 0;
      currentSectorNotional += qty * price;
    }
  }

  const projectedNotional = currentSectorNotional + proposedNotional;
  const safeTotal = Math.max(1, portfolioValue);
  const projectedSectorPct = +((projectedNotional / safeTotal) * 100).toFixed(1);

  if (projectedSectorPct > maxAllowedSectorPct) {
    return {
      allowed: false,
      projectedSectorPct,
      sector,
      reason: `Sector concentration breach: Adding ₹${proposedNotional.toFixed(2)} to ${sector} would reach ${projectedSectorPct}%, exceeding the ${maxAllowedSectorPct}% sector ceiling.`,
    };
  }

  return {
    allowed: true,
    projectedSectorPct,
    sector,
  };
}

/**
 * Computes Chandelier Trailing Exit level:
 * Chandelier Exit = Highest High(period) - (atrMultiplier * ATR)
 */
export function calculateChandelierExit(
  history: number[],
  period: number = 22,
  atrMultiplier: number = thresholds.CHANDELIER_ATR_MULTIPLIER
): number {
  if (!history || history.length === 0) return 0;
  const window = history.slice(-Math.max(5, period));
  const highestHigh = Math.max(...window);

  let sumDiff = 0;
  for (let i = 1; i < window.length; i++) {
    sumDiff += Math.abs(window[i] - window[i - 1]);
  }
  const atr = Math.max(highestHigh * 0.008, sumDiff / Math.max(1, window.length - 1));

  return +(highestHigh - atrMultiplier * atr).toFixed(2);
}

/**
 * Computes Volume-Weighted Average Price (VWAP) and Volume Surge Ratio.
 */
export function calculateVolumeMetrics(
  candles: any[] | undefined,
  history: number[]
): {
  vwap: number;
  volumeSurgeRatio: number;
  hasInstitutionalVolume: boolean;
} {
  const currentPrice = history.length > 0 ? history[history.length - 1] : 100;

  if (!candles || candles.length === 0) {
    return {
      vwap: currentPrice,
      volumeSurgeRatio: 1.0,
      hasInstitutionalVolume: false,
    };
  }

  const validCandles = candles.filter((c) => c && typeof c.close === 'number' && typeof c.volume === 'number');
  if (validCandles.length === 0) {
    return {
      vwap: currentPrice,
      volumeSurgeRatio: 1.0,
      hasInstitutionalVolume: false,
    };
  }

  let totalTypicalVolume = 0;
  let totalVolume = 0;

  for (const c of validCandles) {
    const high = c.high ?? c.close;
    const low = c.low ?? c.close;
    const close = c.close;
    const typicalPrice = (high + low + close) / 3;
    const vol = Math.max(1, c.volume || 1);

    totalTypicalVolume += typicalPrice * vol;
    totalVolume += vol;
  }

  const vwap = totalVolume > 0 ? +(totalTypicalVolume / totalVolume).toFixed(2) : currentPrice;

  // Volume Surge: Compare last candle's volume to 20-period average
  const recentCandles = validCandles.slice(-20);
  const avgVol = recentCandles.reduce((s, c) => s + (c.volume || 0), 0) / Math.max(1, recentCandles.length);
  const lastVol = validCandles[validCandles.length - 1]?.volume || avgVol;
  const volumeSurgeRatio = avgVol > 0 ? +(lastVol / avgVol).toFixed(2) : 1.0;
  const hasInstitutionalVolume = volumeSurgeRatio >= 1.25 && currentPrice >= vwap;

  return {
    vwap,
    volumeSurgeRatio,
    hasInstitutionalVolume,
  };
}

export interface DynamicProfitRatchetResult {
  ratchetedStopPrice: number;
  stageName:
    | 'INITIAL_RISK'
    | 'FEE_BREAKEVEN_SHIELD'
    | 'STEPPED_BREAKEVEN'
    | 'LOCKED_PROFIT_T1'
    | 'CORE_TARGET_T2'
    | 'CHANDELIER_RUNNER';
  isRatcheted: boolean;
  gainAtrMultiples: number;
}

/**
 * Scenario 2: Volatility-Adjusted Multi-Stage Profit Ratchet
 * - Level 0.5 (+0.75 ATR): Fee-Breakeven Shield (Entry + Fees + 1 tick)
 * - Level 1 (+1.00 ATR): Stepped Profit Lock (Entry + 0.35 ATR)
 * - Level 2 (+1.40 ATR): Tranche 1 Harvest (Lock +0.75 ATR)
 * - Level 3 (+2.00 ATR): Core Target T2 (Lock +1.35 ATR)
 */
export function calculateDynamicProfitRatchet(
  entryPrice: number,
  currentPrice: number,
  atr: number,
  currentStopPrice: number,
  tickSize: number = thresholds.NSE_TICK_SIZE_INR,
  roundtripFrictionPerShare: number = 0,
  highWaterMark?: number
): DynamicProfitRatchetResult {
  const peakPrice = highWaterMark !== undefined ? Math.max(highWaterMark, currentPrice) : currentPrice;
  const profitDistance = peakPrice - entryPrice;
  const safeAtr = Math.max(0.01, atr);
  const gainAtrMultiples = +(profitDistance / safeAtr).toFixed(2);

  let ratchetedStop = currentStopPrice;
  let stageName: DynamicProfitRatchetResult['stageName'] = 'INITIAL_RISK';

  const feeBreakeven = entryPrice + roundtripFrictionPerShare + tickSize;

  // Level 3: Core target reached (+2.00 ATR) -> Ratchet stop to max(feeBreakeven, +1.35 ATR)
  if (gainAtrMultiples >= thresholds.RATCHET_STAGE_3_ATR) {
    const t2Lock = Math.max(feeBreakeven, entryPrice + safeAtr * thresholds.RATCHET_LOCK_3_ATR);
    if (currentPrice > t2Lock) {
      ratchetedStop = Math.max(ratchetedStop, t2Lock);
      stageName = 'CORE_TARGET_T2';
    }
  }
  // Level 2: Target 1 reached (+1.40 ATR) -> Ratchet stop to max(feeBreakeven, +0.75 ATR)
  else if (gainAtrMultiples >= thresholds.RATCHET_STAGE_2_ATR) {
    const t1Lock = Math.max(feeBreakeven, entryPrice + safeAtr * thresholds.RATCHET_LOCK_2_ATR);
    if (currentPrice > t1Lock) {
      ratchetedStop = Math.max(ratchetedStop, t1Lock);
      stageName = 'LOCKED_PROFIT_T1';
    }
  }
  // Level 1: Stepped Profit Lock (+1.00 ATR) -> Ratchet stop to max(feeBreakeven, +0.35 ATR)
  else if (gainAtrMultiples >= thresholds.RATCHET_STAGE_1_ATR) {
    const steppedLock = Math.max(feeBreakeven, entryPrice + safeAtr * thresholds.RATCHET_LOCK_1_ATR);
    if (currentPrice > steppedLock) {
      ratchetedStop = Math.max(ratchetedStop, steppedLock);
      stageName = 'STEPPED_BREAKEVEN';
    }
  }
  // Level 0.5: Fee-Breakeven Shield (+0.75 ATR) -> Stop to Entry + Net Friction + Net Gain Armor
  else if (gainAtrMultiples >= thresholds.RATCHET_STAGE_0_5_ATR) {
    const feeArmorStop = entryPrice + roundtripFrictionPerShare + tickSize + (roundtripFrictionPerShare > 0 ? thresholds.FEE_ARMOR_NET_GAIN_PER_SHARE : 0);
    const candidateStop = currentPrice > feeArmorStop ? feeArmorStop : feeBreakeven;
    // Maintain minimum breathing room (0.25 ATR) so early normal noise does not choke position
    if (currentPrice > candidateStop && (currentPrice - candidateStop) >= safeAtr * 0.25) {
      ratchetedStop = Math.max(ratchetedStop, candidateStop);
      stageName = 'FEE_BREAKEVEN_SHIELD';
    } else if (currentPrice > feeBreakeven && (currentPrice - feeBreakeven) >= safeAtr * 0.20) {
      ratchetedStop = Math.max(ratchetedStop, feeBreakeven);
      stageName = 'FEE_BREAKEVEN_SHIELD';
    }
  }

  // Align ratcheted stop to tick size
  const alignedStop = +(Math.round(ratchetedStop / tickSize) * tickSize).toFixed(2);
  const isRatcheted = alignedStop > currentStopPrice;

  return {
    ratchetedStopPrice: Math.max(currentStopPrice, alignedStop),
    stageName,
    isRatcheted,
    gainAtrMultiples,
  };
}

/**
 * Scenario 5: 14:15 Late-Day Stop Compression
 * Protects session high-water marks against the 14:15-15:15 retail MIS liquidation cascade.
 */
export function lateDayStopCompression(
  entryPrice: number,
  currentPrice: number,
  atr: number,
  highWaterMark: number,
  currentStopPrice: number,
  now: number = Date.now(),
  tickSize: number = thresholds.NSE_TICK_SIZE_INR,
  frictionPerShare: number = 0
): { compressedStopPrice: number; isCompressed: boolean; reason: string } {
  const timing = evaluateSessionTimingQuality(now);
  if (!timing.isLateDayLiquidationPhase) {
    return { compressedStopPrice: currentStopPrice, isCompressed: false, reason: 'Outside late-day liquidation window.' };
  }

  const safeAtr = Math.max(0.01, atr);
  let targetStop = currentStopPrice;
  let reason = '';

  if (currentPrice > entryPrice) {
    // In profit: compress stop to protect High-Water Mark - 0.35 ATR
    const profitLock = highWaterMark - safeAtr * thresholds.LATE_DAY_PROFIT_STOP_COMPRESSION_ATR;
    const feeBreakeven = entryPrice + frictionPerShare;
    // If high-water mark reached above fee breakeven, ensure stop preserves net profit above fees
    const candidateStop = (frictionPerShare > 0 && highWaterMark > feeBreakeven)
      ? Math.max(feeBreakeven, profitLock)
      : profitLock;
    targetStop = Math.max(currentStopPrice, candidateStop);
    reason = `Late-Day Profit Shield: Compressed stop to ₹${targetStop.toFixed(2)} (fee-shielded net profit) before 15:15 retail liquidation.`;
  } else {
    // Flat or slight loss: compress stop to Entry - 0.40 ATR
    const lossCeiling = entryPrice - safeAtr * thresholds.LATE_DAY_LOSS_STOP_COMPRESSION_ATR;
    targetStop = Math.max(currentStopPrice, lossCeiling);
    reason = `Late-Day Loss Defense: Compressed stop to ₹${targetStop.toFixed(2)} (Entry - 0.40 ATR) to eliminate overnight gap catastrophe.`;
  }

  const alignedStop = +(Math.round(targetStop / tickSize) * tickSize).toFixed(2);
  const isCompressed = alignedStop > currentStopPrice;

  return {
    compressedStopPrice: Math.max(currentStopPrice, alignedStop),
    isCompressed,
    reason,
  };
}

/**
 * Scenario 7: Stagnant Capital / 90-Minute Dead Trade Expiration
 */
export function deadTradeStagnancyExit(
  entryPrice: number,
  currentPrice: number,
  atr: number,
  elapsedMs: number,
  currentVolume: number = 0,
  avgVolume: number = 0
): { shouldExit: boolean; reason: string } {
  if (elapsedMs < thresholds.STAGNANT_TRADE_MAX_DURATION_MS) {
    return { shouldExit: false, reason: 'Trade duration within active execution window.' };
  }

  const safeAtr = Math.max(0.01, atr);
  const priceRangeAtr = Math.abs(currentPrice - entryPrice) / safeAtr;
  const isRangeStagnant = priceRangeAtr < thresholds.STAGNANT_TRADE_PRICE_RANGE_ATR;

  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 0.5;
  const isVolumeFading = volumeRatio < thresholds.STAGNANT_TRADE_MAX_VOLUME_RATIO;

  if (isRangeStagnant && isVolumeFading) {
    return {
      shouldExit: true,
      reason: `Dead Trade Stagnancy Exit: Position active for ${(elapsedMs / 60000).toFixed(0)} mins within +/-${priceRangeAtr.toFixed(2)} ATR with fading volume (${volumeRatio.toFixed(2)}x avg). Liquidating to free capital.`,
    };
  }

  return { shouldExit: false, reason: 'Active momentum or price expansion present.' };
}

/**
 * Scenario 6: Volatility Shock & Flash Gap Dampener
 */
export function volatilityShockFreeze(
  candle: Candle | undefined,
  atr: number,
  lastShockTimestamp: number,
  now: number = Date.now()
): { isFrozen: boolean; newShockDetected: boolean; cooldownRemainingMs: number } {
  const safeAtr = Math.max(0.01, atr);
  let newShockDetected = false;

  if (candle) {
    const candleRange = candle.high - candle.low;
    if (candleRange >= safeAtr * thresholds.VOLATILITY_SHOCK_ATR_MULTIPLE) {
      newShockDetected = true;
      lastShockTimestamp = now;
    }
  }

  const elapsedSinceShock = now - lastShockTimestamp;
  const isFrozen = elapsedSinceShock < thresholds.VOLATILITY_SHOCK_COOLDOWN_MS;
  const cooldownRemainingMs = Math.max(0, thresholds.VOLATILITY_SHOCK_COOLDOWN_MS - elapsedSinceShock);

  return {
    isFrozen,
    newShockDetected,
    cooldownRemainingMs,
  };
}

/**
 * Computes rolling Pearson correlation between two price series.
 */
export function calculateCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 5) return 0;
  const xSlice = x.slice(-n);
  const ySlice = y.slice(-n);

  const meanX = xSlice.reduce((a, b) => a + b, 0) / n;
  const meanY = ySlice.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - meanX;
    const dy = ySlice[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  return den > 1e-9 ? +(num / den).toFixed(3) : 0;
}

/**
 * Scenario 8: Portfolio Rolling Correlation Gate
 * Blocks entries that would cause portfolio correlation to exceed threshold.
 */
export function correlationGate(
  candidateAsset: string,
  candidateHistory: number[],
  currentHoldings: string[],
  markets: Record<string, Market | undefined>,
  threshold: number = thresholds.MAX_PORTFOLIO_CORRELATION_THRESHOLD
): { allowed: boolean; maxCorrelation: number; correlatedAsset: string; reason: string } {
  if (currentHoldings.length === 0 || candidateHistory.length < thresholds.CORRELATION_LOOKBACK_BARS) {
    return { allowed: true, maxCorrelation: 0, correlatedAsset: '', reason: 'No correlation conflict.' };
  }

  let maxCorr = -1;
  let maxAsset = '';

  for (const held of currentHoldings) {
    if (held === candidateAsset) continue;
    const heldHistory = markets[held]?.history || [];
    if (heldHistory.length < thresholds.CORRELATION_LOOKBACK_BARS) continue;

    const corr = calculateCorrelation(candidateHistory, heldHistory);
    if (corr > maxCorr) {
      maxCorr = corr;
      maxAsset = held;
    }
  }

  if (maxCorr >= threshold) {
    return {
      allowed: false,
      maxCorrelation: maxCorr,
      correlatedAsset: maxAsset,
      reason: `Correlation breach: ${candidateAsset} has ${(maxCorr * 100).toFixed(0)}% correlation with held ${maxAsset} (exceeds ${(threshold * 100).toFixed(0)}% ceiling). Entry blocked to prevent correlated drawdown.`,
    };
  }

  return {
    allowed: true,
    maxCorrelation: Math.max(0, maxCorr),
    correlatedAsset: maxAsset,
    reason: `Correlation within safe limits (Max: ${(Math.max(0, maxCorr) * 100).toFixed(0)}% with ${maxAsset || 'none'}).`,
  };
}

export type NseSessionPhase =
  | 'PRE_OPEN'
  | 'OPENING_VOLATILITY'
  | 'MORNING_EXPANSION'
  | 'MIDDAY_CONSOLIDATION'
  | 'AFTERNOON_EXPANSION'
  | 'CLOSING_SQUAREOFF'
  | 'POST_CLOSE';

export interface SessionTimingQuality {
  phase: NseSessionPhase;
  allowsNewEntries: boolean;
  convictionThresholdDelta: number; // e.g. +8 during opening noise or midday lull
  minVolumeSurgeRequired: number;  // e.g. 1.35x during midday lull
  isLateDayLiquidationPhase: boolean;
  isSessionCutoffPhase: boolean;
  reason: string;
}

/**
 * Classifies Indian Market (NSE) intraday session phases to eliminate low-volume whipsaws.
 * Enforces:
 * - 09:15-09:30 Opening volatility filtering (+8 conviction score, 1.5x volume surge)
 * - 11:30-13:15 Midday consolidation dampener (+6 conviction score, 1.35x volume surge)
 * - 14:00 Entry curfew (No new entries permitted after 14:00 IST)
 * - 14:15-15:15 Late-day liquidation window flag (triggers trailing stop compression)
 * - 15:15-15:30 Intraday session cutoff (triggers automatic MIS position square-off)
 */
export function evaluateSessionTimingQuality(now: number = Date.now()): SessionTimingQuality {
  const d = new Date(now);
  // IST is UTC + 5:30
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 3600000 * 5.5);

  const day = ist.getDay();
  if (day === 0 || day === 6) {
    return {
      phase: 'POST_CLOSE',
      allowsNewEntries: false,
      convictionThresholdDelta: 999,
      minVolumeSurgeRequired: 2.0,
      isLateDayLiquidationPhase: false,
      isSessionCutoffPhase: false,
      reason: 'Weekend - Indian exchange closed',
    };
  }

  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  const isLateDayLiquidationPhase =
    timeInMinutes >= thresholds.SESSION_LATE_DAY_LIQUIDATION_START_MIN &&
    timeInMinutes < thresholds.SESSION_INTRADAY_CUTOFF_MIN;

  const isSessionCutoffPhase =
    timeInMinutes >= thresholds.SESSION_INTRADAY_CUTOFF_MIN &&
    timeInMinutes < thresholds.SESSION_CLOSE_MIN;

  if (timeInMinutes < thresholds.SESSION_PRE_OPEN_MIN) {
    return {
      phase: 'PRE_OPEN',
      allowsNewEntries: false,
      convictionThresholdDelta: 999,
      minVolumeSurgeRequired: 2.0,
      isLateDayLiquidationPhase: false,
      isSessionCutoffPhase: false,
      reason: 'Market pre-open: No orders permitted.',
    };
  }
  if (timeInMinutes < thresholds.SESSION_OPEN_MIN) {
    return {
      phase: 'PRE_OPEN',
      allowsNewEntries: false,
      convictionThresholdDelta: 999,
      minVolumeSurgeRequired: 2.0,
      isLateDayLiquidationPhase: false,
      isSessionCutoffPhase: false,
      reason: 'NSE Call Auction / Pre-market price discovery session.',
    };
  }
  if (timeInMinutes < thresholds.SESSION_OPENING_NOISE_END_MIN) {
    return {
      phase: 'OPENING_VOLATILITY',
      allowsNewEntries: true,
      convictionThresholdDelta: thresholds.OPENING_CONVICTION_DELTA,
      minVolumeSurgeRequired: thresholds.OPENING_MIN_VOLUME_SURGE,
      isLateDayLiquidationPhase: false,
      isSessionCutoffPhase: false,
      reason: 'Opening volatility window (09:15-09:30): Strict volume & score filtering active.',
    };
  }
  if (timeInMinutes < thresholds.SESSION_MORNING_END_MIN) {
    return {
      phase: 'MORNING_EXPANSION',
      allowsNewEntries: true,
      convictionThresholdDelta: 0,
      minVolumeSurgeRequired: 1.15,
      isLateDayLiquidationPhase: false,
      isSessionCutoffPhase: false,
      reason: 'Prime morning institutional expansion window (09:30-11:30).',
    };
  }
  if (timeInMinutes < thresholds.SESSION_MIDDAY_END_MIN) {
    return {
      phase: 'MIDDAY_CONSOLIDATION',
      allowsNewEntries: true,
      convictionThresholdDelta: thresholds.MIDDAY_CONVICTION_DELTA,
      minVolumeSurgeRequired: thresholds.MIDDAY_MIN_VOLUME_SURGE,
      isLateDayLiquidationPhase: false,
      isSessionCutoffPhase: false,
      reason: 'European pre-open / Midday consolidation (11:30-13:15): High false breakout rate.',
    };
  }
  if (timeInMinutes < thresholds.SESSION_INTRADAY_ENTRY_CURFEW_MIN) {
    return {
      phase: 'AFTERNOON_EXPANSION',
      allowsNewEntries: true,
      convictionThresholdDelta: 0,
      minVolumeSurgeRequired: 1.20,
      isLateDayLiquidationPhase: false,
      isSessionCutoffPhase: false,
      reason: 'Afternoon continuation & expansion window (13:15-14:00).',
    };
  }
  if (timeInMinutes < thresholds.SESSION_CLOSE_MIN) {
    return {
      phase: 'CLOSING_SQUAREOFF',
      allowsNewEntries: false,
      convictionThresholdDelta: 999,
      minVolumeSurgeRequired: 2.0,
      isLateDayLiquidationPhase,
      isSessionCutoffPhase,
      reason: isSessionCutoffPhase
        ? '15:15 IST intraday session cutoff active. Automatic MIS position square-off engaged.'
        : 'Post-14:00 entry curfew active. No new positions permitted before market close.',
    };
  }
  return {
    phase: 'POST_CLOSE',
    allowsNewEntries: false,
    convictionThresholdDelta: 999,
    minVolumeSurgeRequired: 2.0,
    isLateDayLiquidationPhase: false,
    isSessionCutoffPhase: false,
    reason: 'Market closed.',
  };
}

export interface CandidateAlphaScore {
  asset: string;
  alphaConvictionIndex: number; // 0 to 100
  hurst: number;
  relativeStrengthPct: number;
  squeezeStatus: 'SQUEEZE_ON' | 'SQUEEZE_OFF' | 'NO_SQUEEZE';
  volumeSurgeRatio: number;
  isAboveVwap: boolean;
  hasInstitutionalVolume: boolean;
  sector: string;
  rank: number;
  breakdown: string;
}

/**
 * Computes Cross-Sectional Alpha Ranking across all fleet candidates.
 * Prioritizes high-conviction leaders (Hurst trend persistence, Squeeze release, Volume surge, Relative strength).
 */
export function calculateCrossSectionalAlphaRanking(
  candidates: Array<{
    asset: string;
    market: Market;
    hurst: number;
    squeezeStatus: 'SQUEEZE_ON' | 'SQUEEZE_OFF' | 'NO_SQUEEZE';
    volumeSurgeRatio: number;
    vwap: number;
    compositeScore?: number;
  }>
): CandidateAlphaScore[] {
  if (!candidates || candidates.length === 0) return [];

  // Compute average return across fleet to measure cross-sectional relative strength
  const assetReturns: Record<string, number> = {};
  let totalRet = 0;
  let count = 0;
  for (const c of candidates) {
    const history = c.market?.history || [];
    if (history.length >= 10) {
      const ret = (history[history.length - 1] - history[history.length - 10]) / history[history.length - 10];
      assetReturns[c.asset] = ret;
      totalRet += ret;
      count++;
    } else {
      assetReturns[c.asset] = 0;
    }
  }
  const avgFleetReturn = count > 0 ? totalRet / count : 0;

  const scored = candidates.map((c) => {
    const price = c.market?.price || 1;
    const isAboveVwap = price >= (c.vwap || price);
    const relStrength = (assetReturns[c.asset] || 0) - avgFleetReturn;
    const relativeStrengthPct = +(relStrength * 100).toFixed(2);

    // 1. Hurst score (0 to 25 points): H=0.5 is 10pts, H>=0.7 is 25pts
    const hurstPoints = Math.max(0, Math.min(25, (c.hurst - 0.45) * 80));

    // 2. Squeeze Release score (0 to 25 points): SQUEEZE_OFF gives 25pts, SQUEEZE_ON 15pts
    let squeezePoints = 5;
    if (c.squeezeStatus === 'SQUEEZE_OFF') squeezePoints = 25;
    else if (c.squeezeStatus === 'SQUEEZE_ON') squeezePoints = 15;

    // 3. Volume Surge score (0 to 20 points): 1.0x is 5pts, 2.0x is 20pts
    const volPoints = Math.max(0, Math.min(20, (c.volumeSurgeRatio - 0.8) * 16.6));

    // 4. Relative Strength vs Fleet (0 to 15 points): Leading the fleet adds edge
    const rsPoints = Math.max(0, Math.min(15, 7.5 + relativeStrengthPct * 3));

    // 5. VWAP & Base Quality Factor (0 to 15 points)
    const vwapPoints = isAboveVwap ? 15 : 5;

    const rawAci = hurstPoints + squeezePoints + volPoints + rsPoints + vwapPoints;
    const alphaConvictionIndex = Math.max(0, Math.min(100, Math.round(rawAci)));

    const sector = getAssetSector(c.asset);
    const hasInstitutionalVolume = c.volumeSurgeRatio >= 1.25 && isAboveVwap;

    return {
      asset: c.asset,
      alphaConvictionIndex,
      hurst: c.hurst,
      relativeStrengthPct,
      squeezeStatus: c.squeezeStatus,
      volumeSurgeRatio: c.volumeSurgeRatio,
      isAboveVwap,
      hasInstitutionalVolume,
      sector,
      rank: 0,
      breakdown: `ACI ${alphaConvictionIndex}/100 (Hurst:${hurstPoints.toFixed(0)}, Squeeze:${squeezePoints}, Vol:${volPoints.toFixed(0)}, RS:${rsPoints.toFixed(0)}, VWAP:${vwapPoints})`,
    };
  });

  // Rank descending by alpha conviction index
  scored.sort((a, b) => b.alphaConvictionIndex - a.alphaConvictionIndex);

  // Assign ranks
  scored.forEach((item, idx) => {
    item.rank = idx + 1;
  });

  return scored;
}

/**
 * Calculates optimal limit entry price anchoring to microstructure support (VWAP/EMA pullback)
 * to avoid chasing market ask, eliminate slippage, and optimize fill probability based on alpha conviction.
 */
export function calculateSmartLimitPrice(
  currentPrice: number,
  vwap: number,
  atr: number,
  tickSize: number = 0.05,
  alphaConviction?: number
): number {
  if (currentPrice <= 0) return 0;

  // Adaptive pullback buffer: In high-conviction momentum expansions (alphaConviction >= 80),
  // pullbacks are shallow. We bid 1-2 ticks below LTP to guarantee high fill probability without paying the full spread.
  // In moderate setups (< 80), we demand a deeper discount (0.10% - 0.20% or 15% of ATR) to ensure favorable risk/reward.
  const isHighConviction = alphaConviction !== undefined && alphaConviction >= 80;
  const pullbackBuffer = isHighConviction
    ? Math.max(tickSize, Math.min(atr * 0.05, currentPrice * 0.0008))
    : Math.min(atr * 0.15, currentPrice * 0.002);

  let targetPrice: number;

  if (currentPrice > vwap && vwap > 0) {
    if (isHighConviction) {
      // In high-conviction expansions, don't anchor down to distant VWAP which might never fill
      targetPrice = Math.min(currentPrice, currentPrice - pullbackBuffer);
    } else {
      // Extended above VWAP: anchor down towards VWAP, but never below VWAP or above currentPrice
      targetPrice = Math.min(currentPrice, Math.max(vwap, currentPrice - pullbackBuffer));
    }
  } else {
    // If price is at or below VWAP (oversold / discounted), set limit slightly below current price
    targetPrice = Math.max(tickSize, currentPrice - pullbackBuffer);
  }

  // Align to tick size and guarantee targetPrice never exceeds currentPrice
  const aligned = +(Math.round(targetPrice / tickSize) * tickSize).toFixed(2);
  return Math.min(currentPrice, aligned > 0 ? aligned : currentPrice);
}

export type MarketRegimeScenario = 'A_EXPANSION' | 'B_BREAKOUT' | 'C_CHOP' | 'D_VOL_SHOCK';

/**
 * Classifies an asset into one of 4 systematic market regimes:
 * - Scenario A: High-Momentum Expansion (Trending)
 * - Scenario B: Squeeze Breakout / Release
 * - Scenario C: Choppy / Sideways / Random Walk (No Edge)
 * - Scenario D: Volatility Shock / Gap Trap (Extreme Risk)
 */
export function classifyRegimeScenario(
  price: number,
  atr: number,
  hurst: number,
  squeezeStatus: 'SQUEEZE_ON' | 'SQUEEZE_OFF' | 'NO_SQUEEZE',
  volumeSurgeRatio: number,
  rsi: number = 50
): MarketRegimeScenario {
  // Scenario D: Volatility Shock / Gap Trap (ATR > 4.5% or extreme RSI)
  if (atr / price > 0.045 || rsi >= 75 || rsi <= 25) {
    return 'D_VOL_SHOCK';
  }
  // Scenario A: High-Momentum Persistent Trend
  if (hurst > 0.55 && volumeSurgeRatio >= 1.25) {
    return 'A_EXPANSION';
  }
  // Scenario B: Squeeze Release Momentum
  if (squeezeStatus === 'SQUEEZE_OFF' && hurst > 0.50) {
    return 'B_BREAKOUT';
  }
  // Scenario C: Choppy / Sideways / Anti-Persistent
  if (hurst <= 0.52 && volumeSurgeRatio < 1.15 && squeezeStatus !== 'SQUEEZE_OFF') {
    return 'C_CHOP';
  }
  return 'A_EXPANSION';
}

export interface CandidateForAllocation {
  asset: Asset;
  price: number;
  atr: number;
  sector: string;
  convictionScore: number;
  hurst: number;
  squeezeStatus: 'SQUEEZE_ON' | 'SQUEEZE_OFF' | 'NO_SQUEEZE';
  volumeSurgeRatio: number;
  realisticGrossProfit: number;
  roundtripFriction: number;
  realisticNetProfit: number;
  notional?: number;
  minNetProfitFloor?: number;
  history?: number[];
  regimeScenario?: MarketRegimeScenario;
}

export type DynamicAllocationMode = 'STAND_ASIDE' | 'MODE_40_1' | 'MODE_35_2';

export interface DynamicAllocationDecision {
  mode: DynamicAllocationMode;
  selectedCandidates: CandidateForAllocation[];
  maxPositions: number;
  assetAllocationPct: number;
  cashBufferPct: number;
  rationale: string;
  stepTriggered: number;
}

/**
 * Executes the 7-Step Sequential Decision Engine for conditions-based mode switching:
 * Step 1: Regime classifier says Scenario C (choppy) or D (vol shock) -> Stand aside (0 positions)
 * Step 2: Fewer than 2 candidate signals clear dynamic MIN_NET_PROFIT_FLOOR -> Force 40-1
 * Step 3 & 4: Is signal #2's conviction score >= 85% of signal #1's? If no -> Force 40-1
 * Step 5: Are #1 and #2 in different sectors (or rolling correlation < 0.50)? If no -> Force 40-1
 * Step 6: Does signal #2 clear elevated dynamic floor (1.5x)? If no -> Force 40-1
 * Post-Loss Dampener: If dayHasLoss is true -> Force 40-1
 * Step 7: All pass -> Mode 35-2 activates (35% per asset, 2 positions, 30% cash buffer)
 */
export function evaluateAllocationModeSwitch(
  candidates: CandidateForAllocation[],
  dayHasLoss: boolean = false
): DynamicAllocationDecision {
  if (!candidates || candidates.length === 0) {
    return {
      mode: 'STAND_ASIDE',
      selectedCandidates: [],
      maxPositions: 0,
      assetAllocationPct: 0,
      cashBufferPct: 100,
      rationale: 'Zero candidate setups available.',
      stepTriggered: 1,
    };
  }

  // Sort candidates descending by conviction score
  const sorted = [...candidates].sort((a, b) => b.convictionScore - a.convictionScore);

  // Step 1: Check regime scenario on top candidate
  const topCandidate = sorted[0];
  if (topCandidate.regimeScenario === 'C_CHOP' || topCandidate.regimeScenario === 'D_VOL_SHOCK') {
    return {
      mode: 'STAND_ASIDE',
      selectedCandidates: [],
      maxPositions: 0,
      assetAllocationPct: 0,
      cashBufferPct: 100,
      rationale: `Step 1: Top candidate ${topCandidate.asset} is in ${topCandidate.regimeScenario === 'C_CHOP' ? 'Scenario C (Choppy/Sideways)' : 'Scenario D (Volatility Shock)'}. Zero edge; standing aside in cash to avoid fee bleed.`,
      stepTriggered: 1,
    };
  }

  // Step 2: Candidates clearing dynamic MIN_NET_PROFIT_FLOOR
  const qualifying = sorted.filter((c) => {
    const floor =
      c.minNetProfitFloor ??
      (c.roundtripFriction > 0
        ? calculateDynamicNetProfitFloor(c.roundtripFriction, c.notional)
        : thresholds.MIN_NET_PROFIT_FLOOR_INR);
    return (
      c.realisticNetProfit >= floor &&
      c.regimeScenario !== 'C_CHOP' &&
      c.regimeScenario !== 'D_VOL_SHOCK'
    );
  });

  if (qualifying.length === 0) {
    const topFloor =
      sorted[0].minNetProfitFloor ??
      (sorted[0].roundtripFriction > 0
        ? calculateDynamicNetProfitFloor(sorted[0].roundtripFriction, sorted[0].notional)
        : thresholds.MIN_NET_PROFIT_FLOOR_INR);
    return {
      mode: 'STAND_ASIDE',
      selectedCandidates: [],
      maxPositions: 0,
      assetAllocationPct: 0,
      cashBufferPct: 100,
      rationale: `Step 2: No candidates cleared the dynamic net profit floor (₹${topFloor.toFixed(2)}). Standing aside in cash.`,
      stepTriggered: 2,
    };
  }

  if (qualifying.length < 2) {
    const topFloor =
      qualifying[0].minNetProfitFloor ??
      (qualifying[0].roundtripFriction > 0
        ? calculateDynamicNetProfitFloor(qualifying[0].roundtripFriction, qualifying[0].notional)
        : thresholds.MIN_NET_PROFIT_FLOOR_INR);
    return {
      mode: 'MODE_40_1',
      selectedCandidates: [qualifying[0]],
      maxPositions: 1,
      assetAllocationPct: thresholds.MODE_40_1_ASSET_ALLOCATION_PCT,
      cashBufferPct: 60,
      rationale: `Step 2: Fewer than 2 candidate signals clear dynamic net profit floor (₹${topFloor.toFixed(2)}). Only one qualifying idea exists; forcing Mode 40-1.`,
      stepTriggered: 2,
    };
  }

  const cand1 = qualifying[0];
  const cand2 = qualifying[1];

  // Step 4: Conviction Gap (Score #2 >= 85% of #1)
  const convictionRatio = cand1.convictionScore > 0 ? cand2.convictionScore / cand1.convictionScore : 0;
  if (convictionRatio < thresholds.CONVICTION_RATIO_MIN) {
    return {
      mode: 'MODE_40_1',
      selectedCandidates: [cand1],
      maxPositions: 1,
      assetAllocationPct: thresholds.MODE_40_1_ASSET_ALLOCATION_PCT,
      cashBufferPct: 60,
      rationale: `Step 4: Candidate #2 (${cand2.asset}) conviction score (${cand2.convictionScore}) is ${(convictionRatio * 100).toFixed(1)}% of #1 (${cand1.asset}: ${cand1.convictionScore}), below 85% threshold. Second idea not strong enough; forcing Mode 40-1.`,
      stepTriggered: 4,
    };
  }

  // Step 5: Uncorrelated Sectors (Different sectors AND rolling correlation < 0.50)
  const isSameSector = cand1.sector === cand2.sector;
  let correlation = 0;
  if (cand1.history && cand2.history && cand1.history.length >= 10 && cand2.history.length >= 10) {
    correlation = calculateCorrelation(cand1.history, cand2.history);
  }

  if (isSameSector || correlation >= thresholds.MAX_PAIRWISE_CORRELATION_MODE_B) {
    return {
      mode: 'MODE_40_1',
      selectedCandidates: [cand1],
      maxPositions: 1,
      assetAllocationPct: thresholds.MODE_40_1_ASSET_ALLOCATION_PCT,
      cashBufferPct: 60,
      rationale: `Step 5: Candidates #1 and #2 ${isSameSector ? `share the same sector (${cand1.sector})` : `have high pairwise correlation (${(correlation * 100).toFixed(0)}% >= 50%)`}. Forcing Mode 40-1 to avoid paying double fees for correlated risk.`,
      stepTriggered: 5,
    };
  }

  // Step 6: Elevated Profit Floor for #2 (Dynamic: >= 1.5x candidate #2 base floor)
  const cand2BaseFloor =
    cand2.minNetProfitFloor ??
    (cand2.roundtripFriction > 0
      ? calculateDynamicNetProfitFloor(cand2.roundtripFriction, cand2.notional)
      : thresholds.MIN_NET_PROFIT_FLOOR_INR);
  const cand2ElevatedFloor = Math.max(
    cand2BaseFloor * thresholds.ELEVATED_FLOOR_MULTIPLIER,
    thresholds.BASE_NET_PROFIT_FLOOR_INR * thresholds.ELEVATED_FLOOR_MULTIPLIER
  );

  if (cand2.realisticNetProfit < cand2ElevatedFloor) {
    return {
      mode: 'MODE_40_1',
      selectedCandidates: [cand1],
      maxPositions: 1,
      assetAllocationPct: thresholds.MODE_40_1_ASSET_ALLOCATION_PCT,
      cashBufferPct: 60,
      rationale: `Step 6: Candidate #2 (${cand2.asset}) net expected profit (₹${cand2.realisticNetProfit.toFixed(2)}) is below the elevated safety floor (₹${cand2ElevatedFloor.toFixed(2)}). Forcing Mode 40-1.`,
      stepTriggered: 6,
    };
  }

  // Global Guardrail: Post-Loss Dampener
  if (dayHasLoss) {
    return {
      mode: 'MODE_40_1',
      selectedCandidates: [cand1],
      maxPositions: 1,
      assetAllocationPct: thresholds.MODE_40_1_ASSET_ALLOCATION_PCT,
      cashBufferPct: 60,
      rationale: 'Post-Loss Dampener: A trade was stopped out earlier today. Mode 35-2 is disabled to prevent opening a second position while the day is in the red. Forcing Mode 40-1.',
      stepTriggered: 6,
    };
  }

  // Step 7: All 4 Checks Pass -> Mode 35-2 Activates
  return {
    mode: 'MODE_35_2',
    selectedCandidates: [cand1, cand2],
    maxPositions: 2,
    assetAllocationPct: thresholds.MODE_35_2_ASSET_ALLOCATION_PCT,
    cashBufferPct: 30,
    rationale: 'Step 7: All four conditions passed (>=2 qualifying ideas, conviction ratio >= 85%, uncorrelated sectors, elevated net profit >= ₹180). Activating dual-opportunity Mode 35-2 (35% each, 30% cash buffer).',
    stepTriggered: 7,
  };
}
