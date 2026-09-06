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

export interface DynamicProfitRatchetResult {
  ratchetedStopPrice: number;
  stageName: 'INITIAL_RISK' | 'STEPPED_BREAKEVEN' | 'LOCKED_PROFIT_T1' | 'CORE_TARGET_T2' | 'CHANDELIER_RUNNER';
  isRatcheted: boolean;
  gainAtrMultiples: number;
}

/**
 * Computes stepped trailing stop-loss levels to guarantee winning trades never round-trip to a loss:
 * - At >= +0.8 ATR: Move stop to Breakeven + Tick (100% risk-free trade).
 * - At >= +1.5 ATR: Lock in +0.5 ATR profit.
 * - At >= +2.2 ATR: Lock in +1.2 ATR core profit.
 */
export function calculateDynamicProfitRatchet(
  entryPrice: number,
  currentPrice: number,
  atr: number,
  currentStopPrice: number,
  tickSize: number = 0.05
): DynamicProfitRatchetResult {
  const profitDistance = currentPrice - entryPrice;
  const safeAtr = Math.max(0.01, atr);
  const gainAtrMultiples = +(profitDistance / safeAtr).toFixed(2);

  let ratchetedStop = currentStopPrice;
  let stageName: DynamicProfitRatchetResult['stageName'] = 'INITIAL_RISK';

  // Level 3: Core target reached (+2.2 ATR) -> Ratchet stop to +1.2 ATR
  if (gainAtrMultiples >= 2.2) {
    const t2Lock = entryPrice + safeAtr * 1.2;
    ratchetedStop = Math.max(ratchetedStop, t2Lock);
    stageName = 'CORE_TARGET_T2';
  }
  // Level 2: Target 1 reached (+1.5 ATR) -> Ratchet stop to +0.5 ATR (banked gain)
  else if (gainAtrMultiples >= 1.5) {
    const t1Lock = entryPrice + safeAtr * 0.5;
    ratchetedStop = Math.max(ratchetedStop, t1Lock);
    stageName = 'LOCKED_PROFIT_T1';
  }
  // Level 1: Initial expansion (+0.8 ATR) -> Stepped Breakeven (Entry + 1 tick)
  else if (gainAtrMultiples >= 0.8) {
    const breakeven = entryPrice + tickSize;
    ratchetedStop = Math.max(ratchetedStop, breakeven);
    stageName = 'STEPPED_BREAKEVEN';
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
  reason: string;
}

/**
 * Classifies Indian Market (NSE) intraday session phases to eliminate low-volume whipsaws.
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
      reason: 'Weekend - Indian exchange closed',
    };
  }

  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  const preOpen = 9 * 60;          // 09:00
  const openTime = 9 * 60 + 15;     // 09:15
  const openNoiseEnd = 9 * 60 + 25; // 09:25 (first 10 min high volatility auction)
  const morningEnd = 11 * 60 + 30;  // 11:30
  const middayEnd = 13 * 60 + 15;   // 13:15
  const afternoonEnd = 15 * 60;     // 15:00 (intraday cut-off)
  const closeTime = 15 * 60 + 30;   // 15:30

  if (timeInMinutes < preOpen) {
    return {
      phase: 'PRE_OPEN',
      allowsNewEntries: false,
      convictionThresholdDelta: 999,
      minVolumeSurgeRequired: 2.0,
      reason: 'Market pre-open: No orders permitted.',
    };
  }
  if (timeInMinutes < openTime) {
    return {
      phase: 'PRE_OPEN',
      allowsNewEntries: false,
      convictionThresholdDelta: 999,
      minVolumeSurgeRequired: 2.0,
      reason: 'NSE Call Auction / Pre-market price discovery session.',
    };
  }
  if (timeInMinutes < openNoiseEnd) {
    return {
      phase: 'OPENING_VOLATILITY',
      allowsNewEntries: true,
      convictionThresholdDelta: +8, // Require 8 points higher conviction score to avoid fake opening gaps
      minVolumeSurgeRequired: 1.5,
      reason: 'Opening volatility window (09:15-09:25): Strict volume & score filtering active.',
    };
  }
  if (timeInMinutes < morningEnd) {
    return {
      phase: 'MORNING_EXPANSION',
      allowsNewEntries: true,
      convictionThresholdDelta: 0,
      minVolumeSurgeRequired: 1.15,
      reason: 'Prime morning institutional expansion window (09:25-11:30).',
    };
  }
  if (timeInMinutes < middayEnd) {
    return {
      phase: 'MIDDAY_CONSOLIDATION',
      allowsNewEntries: true,
      convictionThresholdDelta: +6, // Raise threshold slightly to prevent buying flat lunch consolidation
      minVolumeSurgeRequired: 1.35, // Require genuine volume surge to justify entering at midday
      reason: 'European pre-open / Midday consolidation (11:30-13:15): High false breakout rate.',
    };
  }
  if (timeInMinutes < afternoonEnd) {
    return {
      phase: 'AFTERNOON_EXPANSION',
      allowsNewEntries: true,
      convictionThresholdDelta: 0,
      minVolumeSurgeRequired: 1.20,
      reason: 'Afternoon continuation & expansion window (13:15-15:00).',
    };
  }
  if (timeInMinutes < closeTime) {
    return {
      phase: 'CLOSING_SQUAREOFF',
      allowsNewEntries: false,
      convictionThresholdDelta: 999,
      minVolumeSurgeRequired: 2.0,
      reason: 'Intraday squaring and closing run (15:00-15:30): No new positions permitted.',
    };
  }
  return {
    phase: 'POST_CLOSE',
    allowsNewEntries: false,
    convictionThresholdDelta: 999,
    minVolumeSurgeRequired: 2.0,
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
 * to avoid chasing market ask and eliminate slippage.
 */
export function calculateSmartLimitPrice(
  currentPrice: number,
  vwap: number,
  atr: number,
  tickSize: number = 0.05
): number {
  if (currentPrice <= 0) return 0;
  // If price is extended well above VWAP, place limit at modest pullback discount (0.10% - 0.20% below LTP)
  // but no lower than VWAP. If price is near VWAP, place at current tick.
  const pullbackBuffer = Math.min(atr * 0.15, currentPrice * 0.002);
  const targetPrice = Math.max(vwap, currentPrice - pullbackBuffer);
  // Align to tick size
  return +(Math.round(targetPrice / tickSize) * tickSize).toFixed(2);
}

