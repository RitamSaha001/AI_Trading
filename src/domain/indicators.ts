import { Candle } from '../types';

export function returns(h: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < h.length; i++) {
    if (h[i - 1] > 0) {
      r.push((h[i] - h[i - 1]) / h[i - 1]);
    }
  }
  return r;
}

export function stdev(v: number[]): number {
  if (!v || v.length < 2) return 0;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const variance = v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

export function sma(v: number[], p: number): number | null {
  if (!v || v.length < p || p <= 0) return null;
  const slice = v.slice(-p);
  return slice.reduce((a, b) => a + b, 0) / p;
}

export function ema(v: number[], p: number): number | null {
  if (!v || v.length < p || p <= 0) return null;
  const k = 2 / (p + 1);
  let currentEma = v.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < v.length; i++) {
    currentEma = v[i] * k + currentEma * (1 - k);
  }
  return currentEma;
}

export function bollingerBands(
  v: number[],
  p = 20,
  mult = 2
): { upper: number; middle: number; lower: number; bandwidth: number } | null {
  if (!v || v.length < p || p <= 0) return null;
  const slice = v.slice(-p);
  const mid = slice.reduce((a, b) => a + b, 0) / p;
  const variance = slice.reduce((a, b) => a + (b - mid) ** 2, 0) / p;
  const dev = Math.sqrt(Math.max(0, variance));
  return {
    upper: mid + dev * mult,
    middle: mid,
    lower: mid - dev * mult,
    bandwidth: mid > 0 ? ((dev * mult * 2) / mid) * 100 : 0,
  };
}

export function rsi(v: number[], p = 14): number {
  if (!v || v.length < p + 1) return 50;
  let gain = 0;
  let loss = 0;

  for (let i = v.length - p; i < v.length; i++) {
    const diff = v[i] - v[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }

  const avgGain = gain / p;
  const avgLoss = loss / p;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function macd(
  v: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): { macdLine: number; signalLine: number; histogram: number } | null {
  if (!v || v.length < slow + signalPeriod) return null;
  const fastEma = ema(v, fast);
  const slowEma = ema(v, slow);
  if (fastEma === null || slowEma === null) return null;
  const macdLine = fastEma - slowEma;

  // Approximate signal line across recent MACD differentials
  const recentDiffs: number[] = [];
  for (let i = signalPeriod; i >= 0; i--) {
    const sub = v.slice(0, v.length - i);
    const f = ema(sub, fast);
    const s = ema(sub, slow);
    if (f !== null && s !== null) {
      recentDiffs.push(f - s);
    }
  }

  const signalLine = recentDiffs.length >= signalPeriod ? ema(recentDiffs, signalPeriod) ?? macdLine : macdLine;
  const histogram = macdLine - signalLine;

  return { macdLine, signalLine, histogram };
}

export function atr(candles: Candle[], p = 14): number | null {
  if (!candles || candles.length < p + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trs.push(tr);
  }
  return sma(trs, p);
}

export interface TechnicalIndicators {
  s10: number | null;
  s30: number | null;
  ema20: number | null;
  rsi: number;
  vol: number;
  chg: number;
  score: number; // Asset-specific momentum signal score (-3 to +3)
  signalLabel: 'Strong Sell' | 'Bearish' | 'Neutral' | 'Bullish' | 'Strong Buy';
  bb: { upper: number; middle: number; lower: number; bandwidth: number } | null;
  macd: { macdLine: number; signalLine: number; histogram: number } | null;
}

/**
 * Computes transparent, math-grounded technical indicators for a given price series.
 */
export function indicators(h: number[], candles?: Candle[]): TechnicalIndicators {
  if (!h || h.length < 5) {
    return {
      s10: null,
      s30: null,
      ema20: null,
      rsi: 50,
      vol: 0.02,
      chg: 0,
      score: 0,
      signalLabel: 'Neutral',
      bb: null,
      macd: null,
    };
  }

  const s10 = sma(h, 10);
  const s30 = sma(h, 30);
  const ema20 = ema(h, 20);
  const rr = rsi(h, 14);
  const vol = stdev(returns(h.slice(-20)));
  const base = h[Math.max(0, h.length - 25)];
  const chg = base ? ((h[h.length - 1] - base) / base) * 100 : 0;
  const bb = bollingerBands(h, 20);
  const macdVal = macd(h);

  let score = 0;
  // 1. Moving average trend
  if (s10 != null && s30 != null) {
    if (s10 > s30 * 1.002) score += 1;
    else if (s10 < s30 * 0.998) score -= 1;
  }

  // 2. RSI momentum
  if (rr > 62) score += 1;
  else if (rr < 38) score -= 1;

  // 3. Bollinger Band mean-reversion
  if (bb && h.length > 0) {
    const lastP = h[h.length - 1];
    if (lastP < bb.lower) score += 1; // Oversold candidate
    else if (lastP > bb.upper) score -= 1; // Overbought candidate
  }

  let signalLabel: TechnicalIndicators['signalLabel'] = 'Neutral';
  if (score >= 2) signalLabel = 'Strong Buy';
  else if (score === 1) signalLabel = 'Bullish';
  else if (score === -1) signalLabel = 'Bearish';
  else if (score <= -2) signalLabel = 'Strong Sell';

  return {
    s10,
    s30,
    ema20,
    rsi: rr,
    vol,
    chg,
    score,
    signalLabel,
    bb,
    macd: macdVal,
  };
}
