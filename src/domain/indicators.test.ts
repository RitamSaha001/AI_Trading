import { describe, it, expect } from 'vitest';
import { sma, ema, rsi, bollingerBands, choppinessIndex, adx, indicators } from './indicators';
import { Candle } from '../types';

describe('Domain: Quantitative Indicators', () => {
  it('calculates Simple Moving Average (SMA) correctly', () => {
    const series = [10, 20, 30, 40, 50];
    expect(sma(series, 3)).toBe(40); // (30+40+50)/3 = 40
    expect(sma(series, 5)).toBe(30); // (10+20+30+40+50)/5 = 30
    expect(sma([], 5)).toBeNull();
  });

  it('calculates Exponential Moving Average (EMA) with recency weighting', () => {
    const series = [10, 10, 10, 10, 10, 20];
    const emaVal = ema(series, 5);
    // Because latest value is 20, EMA must be higher than SMA of the previous 5 (10)
    expect(emaVal).toBeGreaterThan(10);
  });

  it('calculates Relative Strength Index (RSI) bounded between 0 and 100', () => {
    // Strictly increasing series -> RSI should be high (>70)
    const bullSeries = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40];
    const rsiBull = rsi(bullSeries, 14);
    expect(rsiBull).toBeGreaterThan(70);
    expect(rsiBull).toBeLessThanOrEqual(100);

    // Strictly decreasing series -> RSI should be low (<30)
    const bearSeries = [40, 38, 36, 34, 32, 30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10];
    const rsiBear = rsi(bearSeries, 14);
    expect(rsiBear).toBeLessThan(30);
    expect(rsiBear).toBeGreaterThanOrEqual(0);
  });

  it('calculates Bollinger Bands with valid upper, middle, and lower bands', () => {
    const series = [100, 102, 98, 101, 103, 99, 100, 104, 97, 101];
    const bb = bollingerBands(series, 5, 2);

    expect(bb).not.toBeNull();
    expect(bb!.upper).toBeGreaterThan(bb!.middle);
    expect(bb!.lower).toBeLessThan(bb!.middle);
  });

  it('calculates Choppiness Index (CHOP) correctly distinguishing trending vs choppy markets', () => {
    // 1. Not enough candles -> null
    const fewCandles: Candle[] = Array.from({ length: 5 }, (_, i) => ({
      time: i * 60000,
      open: 100,
      high: 105,
      low: 95,
      close: 102,
      volume: 1000,
    }));
    expect(choppinessIndex(fewCandles, 14)).toBeNull();

    // 2. Strong trend: price moves aggressively in one direction with minimal sideways retracement
    const trendingCandles: Candle[] = Array.from({ length: 30 }, (_, i) => {
      const base = 100 + i * 5;
      return {
        time: i * 60000,
        open: base,
        high: base + 6,
        low: base - 1,
        close: base + 5,
        volume: 2000,
      };
    });
    const chopTrend = choppinessIndex(trendingCandles, 14);
    expect(chopTrend).not.toBeNull();
    // Strong trend CHOP should be low (< 45)
    expect(chopTrend!).toBeLessThan(50);

    // 3. Sideways choppy market: high intra-candle volatility within a tight oscillation band
    const choppyCandles: Candle[] = Array.from({ length: 30 }, (_, i) => {
      const base = 100 + (i % 2 === 0 ? 2 : -2);
      return {
        time: i * 60000,
        open: base,
        high: base + 8,
        low: base - 8,
        close: base + (i % 2 === 0 ? 1 : -1),
        volume: 1000,
      };
    });
    const chopNoise = choppinessIndex(choppyCandles, 14);
    expect(chopNoise).not.toBeNull();
    // Choppy noise CHOP should be elevated (> 55)
    expect(chopNoise!).toBeGreaterThan(55);
  });

  it('calculates Average Directional Index (ADX) and directional movements (+DI, -DI)', () => {
    // 1. Insufficient candles -> null
    const fewCandles: Candle[] = Array.from({ length: 8 }, (_, i) => ({
      time: i * 60000,
      open: 100,
      high: 102,
      low: 98,
      close: 101,
      volume: 1000,
    }));
    expect(adx(fewCandles, 14)).toBeNull();

    // 2. Strong bullish trend (40 candles)
    const strongTrendCandles: Candle[] = Array.from({ length: 45 }, (_, i) => {
      const base = 100 + i * 4;
      return {
        time: i * 60000,
        open: base,
        high: base + 5,
        low: base - 1,
        close: base + 4,
        volume: 2500,
      };
    });
    const adxResult = adx(strongTrendCandles, 14);
    expect(adxResult).not.toBeNull();
    expect(adxResult!.adx).toBeGreaterThan(20);
    expect(adxResult!.plusDI).toBeGreaterThan(adxResult!.minusDI);
  });

  it('produces composite technical indicator payload with CHOP and ADX integration', () => {
    const series = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const candles: Candle[] = series.map((p, i) => ({
      time: Date.now() - (50 - i) * 60000,
      open: p * 0.99,
      high: p * 1.02,
      low: p * 0.98,
      close: p,
      volume: 1500,
    }));

    const ind = indicators(series, candles);

    expect(ind.rsi).toBeGreaterThanOrEqual(0);
    expect(ind.rsi).toBeLessThanOrEqual(100);
    expect(ind.vol).toBeGreaterThanOrEqual(0);
    expect(ind.chopIndex).toBeDefined();
    expect(ind.adx).toBeDefined();
    expect(typeof ind.isChopBlocked).toBe('boolean');
    expect(['Strong Sell', 'Bearish', 'Neutral', 'Bullish', 'Strong Buy']).toContain(ind.signalLabel);
  });
});
