import { Candle } from '../../types';

export interface VWAPBands {
  vwap: number;
  stdDev: number;
  upperBand1: number; // +1.0 std dev
  upperBand2: number; // +2.0 std dev
  lowerBand1: number; // -1.0 std dev
  lowerBand2: number; // -2.0 std dev
  zScore: number;     // Standard score: (Price - VWAP) / stdDev
  bandwidthPct: number;
}

export interface VWAPMeanReversionResult {
  isSignal: boolean;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  zScore: number;
  convictionBonus: number;
  limitPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  takeProfit2Price: number;
  rationale: string;
}

/**
 * Calculates session VWAP and dynamic +/- 1.0 and 2.0 standard deviation bands.
 */
export function calculateVWAPBands(candles: Candle[] | undefined, currentPrice: number): VWAPBands {
  if (!candles || candles.length === 0) {
    return {
      vwap: currentPrice,
      stdDev: 0,
      upperBand1: currentPrice,
      upperBand2: currentPrice,
      lowerBand1: currentPrice,
      lowerBand2: currentPrice,
      zScore: 0,
      bandwidthPct: 0,
    };
  }

  let cumulativePv = 0;
  let cumulativeVol = 0;

  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativePv += typicalPrice * c.volume;
    cumulativeVol += c.volume;
  }

  const vwap = cumulativeVol > 0 ? cumulativePv / cumulativeVol : currentPrice;

  // Calculate volume-weighted variance
  let cumulativeWeightedSqDiff = 0;
  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const diff = typicalPrice - vwap;
    cumulativeWeightedSqDiff += c.volume * (diff * diff);
  }

  const variance = cumulativeVol > 0 ? cumulativeWeightedSqDiff / cumulativeVol : 0;
  const stdDev = Math.max(0.01, Math.sqrt(variance));

  const upperBand1 = +(vwap + 1.0 * stdDev).toFixed(2);
  const upperBand2 = +(vwap + 2.0 * stdDev).toFixed(2);
  const lowerBand1 = +(vwap - 1.0 * stdDev).toFixed(2);
  const lowerBand2 = +(vwap - 2.0 * stdDev).toFixed(2);

  const zScore = +((currentPrice - vwap) / stdDev).toFixed(2);
  const bandwidthPct = +(((upperBand2 - lowerBand2) / vwap) * 100).toFixed(2);

  return {
    vwap: +vwap.toFixed(2),
    stdDev: +stdDev.toFixed(2),
    upperBand1,
    upperBand2,
    lowerBand1,
    lowerBand2,
    zScore,
    bandwidthPct,
  };
}

/**
 * Evaluates statistical mean reversion opportunities when price is stretched to extreme VWAP bands.
 * Especially powerful on range-bound and consolidation days.
 */
export function evaluateVWAPMeanReversion(
  candles: Candle[] | undefined,
  currentPrice: number,
  atr: number,
  nowTimestamp: number
): VWAPMeanReversionResult {
  const defaultRes: VWAPMeanReversionResult = {
    isSignal: false,
    direction: 'NEUTRAL',
    zScore: 0,
    convictionBonus: 0,
    limitPrice: currentPrice,
    stopLossPrice: 0,
    takeProfitPrice: 0,
    takeProfit2Price: 0,
    rationale: 'Price within normal VWAP equilibrium channel.',
  };

  // Ensure at least 45 minutes of intraday session data has formed so VWAP & standard deviation bands are statistically mature
  if (!candles || candles.length < 45) return defaultRes;

  const bands = calculateVWAPBands(candles, currentPrice);
  const n = candles.length;
  const curr = candles[n - 1];

  // Oversold Reversion: Price stretched below Lower Band 1.6 to 2.0 sigma (Z <= -1.60)
  // Reversal confirmation: current candle closed above open or tested lower band and bounced
  const isOversold = bands.zScore <= -1.60 && currentPrice <= bands.lowerBand1;
  const isAbsorbingBounce = curr.close >= curr.open || curr.close >= (curr.low + (curr.high - curr.low) * 0.4);

  if (isOversold && isAbsorbingBounce) {
    const sl = Math.min(curr.low - atr * 0.15, currentPrice - atr * 0.70);
    // Target 1 is mean reversion to VWAP; Target 2 is upper band 1
    const tp1 = Math.max(currentPrice + atr * 1.0, bands.vwap * 0.999);
    const tp2 = Math.max(tp1 + atr * 0.8, bands.upperBand1);

    const bonus = bands.zScore <= -2.0 ? 12 : 8;

    return {
      isSignal: true,
      direction: 'LONG',
      zScore: bands.zScore,
      convictionBonus: bonus,
      limitPrice: currentPrice,
      stopLossPrice: +sl.toFixed(2),
      takeProfitPrice: +tp1.toFixed(2),
      takeProfit2Price: +tp2.toFixed(2),
      rationale: `VWAP Band Oversold Mean-Reversion (Z=${bands.zScore}): Price stretched to -${Math.abs(bands.zScore)}σ lower band (₹${bands.lowerBand2.toFixed(2)}). Mean reversion toward VWAP (₹${bands.vwap.toFixed(2)}) indicated.`,
    };
  }

  return defaultRes;
}
