import { Asset, Market } from '../../types';

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
};

// Maximum permitted portfolio allocation per single sector
export const MAX_SECTOR_ALLOCATION_PCT = 35.0;

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
  const atr = Math.max(currentPrice * 0.01, atrSum / (window.length - 1));

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
    const prevAtr = Math.max(prevWindow[prevWindow.length - 1] * 0.01, prevAtrSum / (prevWindow.length - 1));
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
 * Computes Half-Kelly Optimal Capital Sizing:
 * f* = (p * b - q) / b
 * where p = win rate, q = (1 - p), b = odds (reward:risk ratio).
 * Returns Half-Kelly multiplier clamped between minFraction and maxFraction.
 */
export function calculateHalfKellyFraction(
  winRate: number,
  rewardRiskRatio: number,
  maxFraction: number = 1.0,
  minFraction: number = 0.25
): HalfKellyResult {
  const p = Math.max(0.01, Math.min(0.99, winRate));
  const b = Math.max(0.1, rewardRiskRatio);
  const q = 1 - p;

  // Kelly formula: (p * b - q) / b = p - (q / b)
  const fullKelly = (p * b - q) / b;
  const halfKelly = fullKelly * 0.5;

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
  atrMultiplier: number = 2.0
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
