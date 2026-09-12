import { Candle } from '../../types';

export interface ScalpSignalResult {
  isScalpSignal: boolean;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  rationale: string;
}

/**
 * Adaptive Intraday Momentum Scalper.
 * Detects explosive micro-burst momentum impulses for quick 0.8-1.1 ATR captures.
 */
export function evaluateMomentumScalp(
  candles: Candle[] | undefined,
  currentPrice: number,
  vwap: number,
  atr: number,
  hurst: number,
  nowTimestamp: number
): ScalpSignalResult {
  if (!candles || candles.length < 10 || atr <= 0) {
    return {
      isScalpSignal: false,
      direction: 'LONG',
      entryPrice: 0,
      stopLossPrice: 0,
      takeProfitPrice: 0,
      rationale: 'Insufficient data for scalp evaluation.',
    };
  }

  const d = new Date(nowTimestamp + 3600000 * 5.5);
  const istMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();

  // Active during morning expansion (09:30 - 11:00) and afternoon expansion (13:30 - 14:15)
  const isMorningScalpWindow = istMinutes >= 570 && istMinutes <= 660;
  const isAfternoonScalpWindow = istMinutes >= 810 && istMinutes <= 855;

  if (!isMorningScalpWindow && !isAfternoonScalpWindow) {
    return {
      isScalpSignal: false,
      direction: 'LONG',
      entryPrice: 0,
      stopLossPrice: 0,
      takeProfitPrice: 0,
      rationale: 'Outside active scalping momentum window.',
    };
  }

  if (hurst < 0.55) {
    return {
      isScalpSignal: false,
      direction: 'LONG',
      entryPrice: 0,
      stopLossPrice: 0,
      takeProfitPrice: 0,
      rationale: 'Scalper requires persistent trending regime (Hurst >= 0.55).',
    };
  }

  const last3 = candles.slice(-3);
  const vol1 = last3[0]?.volume || 1;
  const vol2 = last3[1]?.volume || 1;
  const vol3 = last3[2]?.volume || 1;
  const isVolumeExpanding = vol3 >= vol2 && vol2 >= vol1 * 0.9;

  // Bullish Scalp: 3 green bars + expanding volume + price above VWAP
  const is3Green = last3.every((c) => c && c.close >= c.open);
  if (is3Green && isVolumeExpanding && vwap > 0 && currentPrice >= vwap) {
    const stopLossPrice = currentPrice - atr * 0.60;
    const takeProfitPrice = currentPrice + atr * 1.00;
    return {
      isScalpSignal: true,
      direction: 'LONG',
      entryPrice: currentPrice,
      stopLossPrice,
      takeProfitPrice,
      rationale: `Momentum Scalp Long: 3 consecutive expanding green bars with rising volume above VWAP (₹${vwap.toFixed(2)}). Tight 0.60 ATR stop.`,
    };
  }

  // Bearish Scalp: 3 red bars + expanding volume + price below VWAP
  const is3Red = last3.every((c) => c && c.close <= c.open);
  if (is3Red && isVolumeExpanding && vwap > 0 && currentPrice < vwap) {
    const stopLossPrice = currentPrice + atr * 0.60;
    const takeProfitPrice = currentPrice - atr * 1.00;
    return {
      isScalpSignal: true,
      direction: 'SHORT',
      entryPrice: currentPrice,
      stopLossPrice,
      takeProfitPrice,
      rationale: `Momentum Scalp Short: 3 consecutive expanding red bars with rising volume below VWAP (₹${vwap.toFixed(2)}). Tight 0.60 ATR stop.`,
    };
  }

  return {
    isScalpSignal: false,
    direction: 'LONG',
    entryPrice: 0,
    stopLossPrice: 0,
    takeProfitPrice: 0,
    rationale: 'No scalp momentum impulse.',
  };
}
