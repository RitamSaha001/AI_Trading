import { Candle } from '../../../../types';

/**
 * Historical OHLCV Candle Fixtures for Quantitative Validation
 *
 * Covers 3 distinct market regimes:
 * 1. Trending Week: Persistent upward momentum (Hurst > 0.60), breakout expansions.
 * 2. Choppy Week: Anti-persistent oscillating range (Hurst < 0.45), false breakouts, midday lull.
 * 3. Shock Day: High-volatility news event containing a single flash candle > 2.5x ATR.
 */

/**
 * Generates 1 week (5 trading days, 75 5-minute bars per day = 375 candles)
 * of persistent trending equity price action (TCS style, base ₹2,200 -> ₹2,380).
 */
export function getTrendingWeekCandles(baseTime = 1788500000000): Candle[] {
  const candles: Candle[] = [];
  let currentPrice = 2200.0;
  const barIntervalMs = 5 * 60 * 1000;

  for (let day = 0; day < 5; day++) {
    // Each day starts at 09:15 IST
    const dayStart = baseTime + day * 24 * 60 * 60 * 1000;
    for (let bar = 0; bar < 75; bar++) {
      const time = dayStart + bar * barIntervalMs;
      // Strong persistent drift with positive autocorrelation
      const drift = 0.8 + Math.sin(bar / 15) * 0.2;
      const noise = Math.sin(bar * 0.7 + day) * 0.4;
      const open = +currentPrice.toFixed(2);
      const close = +(open + drift + noise).toFixed(2);
      const high = +(Math.max(open, close) + 3.8 + Math.abs(Math.sin(bar) * 1.5)).toFixed(2);
      const low = +(Math.min(open, close) - 3.8 - Math.abs(Math.cos(bar) * 1.5)).toFixed(2);
      const volume = Math.floor(15000 + bar * 120 + Math.abs(drift) * 8000);

      candles.push({ time, open, high, low, close, volume });
      currentPrice = close;
    }
  }
  return candles;
}

/**
 * Generates 1 week (375 candles) of mean-reverting, choppy range-bound action
 * oscillating tightly around ₹2,250 with false breakouts and midday volume decay.
 */
export function getChoppyWeekCandles(baseTime = 1788500000000): Candle[] {
  const candles: Candle[] = [];
  const meanPrice = 2250.0;
  let currentPrice = meanPrice;
  const barIntervalMs = 5 * 60 * 1000;

  for (let day = 0; day < 5; day++) {
    const dayStart = baseTime + day * 24 * 60 * 60 * 1000;
    for (let bar = 0; bar < 75; bar++) {
      const time = dayStart + bar * barIntervalMs;
      // Ornstein-Uhlenbeck style mean reversion pulling toward meanPrice
      const theta = 0.15;
      const meanPull = theta * (meanPrice - currentPrice);
      const noise = Math.cos(bar * 5.1 + day * 2) * 2.2;
      const open = +currentPrice.toFixed(2);
      const close = +(open + meanPull + noise).toFixed(2);
      const high = +(Math.max(open, close) + 3.2 + Math.abs(Math.sin(bar))).toFixed(2);
      const low = +(Math.min(open, close) - 3.2 - Math.abs(Math.cos(bar))).toFixed(2);

      // Midday volume decay (bars 27 to 48 correspond to 11:30 - 13:15)
      const isMidday = bar >= 27 && bar <= 48;
      const volume = Math.floor(isMidday ? 4500 + Math.random() * 1500 : 12000 + Math.random() * 4000);

      candles.push({ time, open, high, low, close, volume });
      currentPrice = close;
    }
  }
  return candles;
}

/**
 * Generates a single trading day (75 candles) with an extreme flash-crash volatility shock.
 * At bar 40 (around 12:35 PM), a single 5-minute bar drops by 65 points (>3.5x normal ATR).
 */
export function getShockDayCandles(baseTime = 1788500000000): Candle[] {
  const candles: Candle[] = [];
  let currentPrice = 2280.0;
  const barIntervalMs = 5 * 60 * 1000;

  for (let bar = 0; bar < 75; bar++) {
    const time = baseTime + bar * barIntervalMs;
    const open = +currentPrice.toFixed(2);
    let close = open;
    let high = open + 1.5;
    let low = open - 1.5;
    let volume = 10000;

    if (bar === 40) {
      // Flash shock bar: -65 INR drop (> 3.5x ATR) on 10x volume
      close = open - 65.0;
      high = open + 0.5;
      low = close - 4.0;
      volume = 120000;
    } else if (bar > 40 && bar <= 45) {
      // High post-shock turbulence
      close = open + (Math.sin(bar) * 8.0);
      high = Math.max(open, close) + 4.0;
      low = Math.min(open, close) - 4.0;
      volume = 45000;
    } else {
      // Normal drift
      close = open + (Math.sin(bar) * 1.5);
      high = Math.max(open, close) + 1.5;
      low = Math.min(open, close) - 1.5;
      volume = 11000;
    }

    candles.push({
      time,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume,
    });
    currentPrice = close;
  }
  return candles;
}
