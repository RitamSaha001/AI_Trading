import { Candle } from '../../types';
import * as thresholds from './config/thresholds';

export interface ShortSignalResult {
  isShortSignal: boolean;
  strategyName: 'ORB Breakdown' | 'VWAP Rejection Short' | 'Bearish Breakdown';
  limitPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  takeProfit2Price: number;
  rationale: string;
}

/**
 * Evaluates Opening Range Breakdown (ORB Breakdown) for intraday shorting.
 * Initial balance: 09:15-09:30 IST.
 * Execution window: 09:30-10:45 IST.
 */
export function evaluateORBBreakdown(
  candles: Candle[] | undefined,
  currentPrice: number,
  vwap: number,
  atr: number,
  volumeSurgeRatio: number,
  nowTimestamp: number
): ShortSignalResult {
  if (!candles || candles.length < thresholds.ORB_INITIAL_BALANCE_MINUTES) {
    return {
      isShortSignal: false,
      strategyName: 'ORB Breakdown',
      limitPrice: 0,
      stopLossPrice: 0,
      takeProfitPrice: 0,
      takeProfit2Price: 0,
      rationale: 'Insufficient intraday candles for ORB initial balance.',
    };
  }

  const d = new Date(nowTimestamp + 3600000 * 5.5);
  const istMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  const sessionMinute = istMinutes - (9 * 60 + 15);

  // Active from 09:30 to 10:45 IST (minutes 15 to 90)
  if (sessionMinute < thresholds.ORB_INITIAL_BALANCE_MINUTES || sessionMinute > 90) {
    return {
      isShortSignal: false,
      strategyName: 'ORB Breakdown',
      limitPrice: 0,
      stopLossPrice: 0,
      takeProfitPrice: 0,
      takeProfit2Price: 0,
      rationale: 'Outside active ORB execution window (09:30-10:45 IST).',
    };
  }

  const initialBars = candles.slice(0, thresholds.ORB_INITIAL_BALANCE_MINUTES);
  let orbHigh = -Infinity;
  let orbLow = Infinity;
  for (const bar of initialBars) {
    if (bar.high > orbHigh) orbHigh = bar.high;
    if (bar.low < orbLow) orbLow = bar.low;
  }

  if (orbLow <= 0 || !Number.isFinite(orbLow)) {
    return {
      isShortSignal: false,
      strategyName: 'ORB Breakdown',
      limitPrice: 0,
      stopLossPrice: 0,
      takeProfitPrice: 0,
      takeProfit2Price: 0,
      rationale: 'Invalid ORB initial balance levels.',
    };
  }

  // Clean breakdown: Price breaks below ORB low, is beneath VWAP, and backed by volume surge
  const isBreakdown =
    currentPrice < orbLow &&
    (vwap > 0 ? currentPrice <= vwap * 1.001 : true) &&
    volumeSurgeRatio >= thresholds.ORB_MIN_VOLUME_SURGE;

  if (!isBreakdown) {
    return {
      isShortSignal: false,
      strategyName: 'ORB Breakdown',
      limitPrice: 0,
      stopLossPrice: 0,
      takeProfitPrice: 0,
      takeProfit2Price: 0,
      rationale: 'No ORB breakdown confirmation.',
    };
  }

  const orbMid = (orbHigh + orbLow) / 2;
  const tightStop = vwap > 0 ? Math.min(vwap * 1.002, orbMid) : orbMid;
  const safeStop = Math.min(currentPrice + atr * 1.0, Math.max(currentPrice + atr * 0.25, tightStop));

  const target1 = currentPrice - atr * 1.4;
  const target2 = currentPrice - atr * 2.2;

  return {
    isShortSignal: true,
    strategyName: 'ORB Breakdown',
    limitPrice: currentPrice,
    stopLossPrice: safeStop,
    takeProfitPrice: target1,
    takeProfit2Price: target2,
    rationale: `ORB 15m Breakdown (Low: ₹${orbLow.toFixed(2)}, Vol: ${volumeSurgeRatio.toFixed(2)}x): Asymmetric short entry below initial balance with tight VWAP anchor stop.`,
  };
}

/**
 * Evaluates Institutional VWAP Rejection Short entries on downtrending equities.
 */
export function evaluateVWAPRejectionShort(
  candles: Candle[] | undefined,
  currentPrice: number,
  vwap: number,
  atr: number,
  hurst: number,
  nowTimestamp: number
): ShortSignalResult {
  if (!candles || candles.length < 20 || vwap <= 0 || atr <= 0) {
    return {
      isShortSignal: false,
      strategyName: 'VWAP Rejection Short',
      limitPrice: 0,
      stopLossPrice: 0,
      takeProfitPrice: 0,
      takeProfit2Price: 0,
      rationale: 'Insufficient data for VWAP rejection analysis.',
    };
  }

  const d = new Date(nowTimestamp + 3600000 * 5.5);
  const istMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (istMinutes < 9 * 60 + 45 || istMinutes > 13 * 60 + 45) {
    return {
      isShortSignal: false,
      strategyName: 'VWAP Rejection Short',
      limitPrice: 0,
      stopLossPrice: 0,
      takeProfitPrice: 0,
      takeProfit2Price: 0,
      rationale: 'Outside VWAP rejection timing window.',
    };
  }

  if (hurst < 0.53) {
    return {
      isShortSignal: false,
      strategyName: 'VWAP Rejection Short',
      limitPrice: 0,
      stopLossPrice: 0,
      takeProfitPrice: 0,
      takeProfit2Price: 0,
      rationale: `Hurst exponent (${hurst.toFixed(2)}) indicates mean-reverting regime.`,
    };
  }

  // Price testing VWAP from below within [-0.40, +0.35] ATR
  const vwapDistAtr = (currentPrice - vwap) / atr;
  if (vwapDistAtr < -0.40 || vwapDistAtr > 0.35) {
    return {
      isShortSignal: false,
      strategyName: 'VWAP Rejection Short',
      limitPrice: 0,
      stopLossPrice: 0,
      takeProfitPrice: 0,
      takeProfit2Price: 0,
      rationale: `Price is not testing VWAP resistance (distance: ${vwapDistAtr.toFixed(2)} ATR).`,
    };
  }

  const latest = candles[candles.length - 1];
  const isBearishRejection = latest.close <= latest.open || (latest.high - latest.close) > (latest.close - latest.low);
  if (!isBearishRejection) {
    return {
      isShortSignal: false,
      strategyName: 'VWAP Rejection Short',
      limitPrice: 0,
      stopLossPrice: 0,
      takeProfitPrice: 0,
      takeProfit2Price: 0,
      rationale: 'Awaiting bearish rejection confirmation candle at VWAP.',
    };
  }

  const tightStop = vwap + atr * 0.30;
  const target1 = currentPrice - atr * 1.30;
  const target2 = currentPrice - atr * 2.00;

  return {
    isShortSignal: true,
    strategyName: 'VWAP Rejection Short',
    limitPrice: currentPrice,
    stopLossPrice: tightStop,
    takeProfitPrice: target1,
    takeProfit2Price: target2,
    rationale: `Institutional VWAP Rejection (Hurst: ${hurst.toFixed(2)}): Bearish rollover from VWAP resistance (₹${vwap.toFixed(2)}) with tight 0.30 ATR invalidation.`,
  };
}
