import { describe, it, expect } from 'vitest';
import { sma, ema, rsi, bollingerBands, indicators } from './indicators';

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

  it('produces composite technical indicator payload', () => {
    const series = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const ind = indicators(series);

    expect(ind.rsi).toBeGreaterThanOrEqual(0);
    expect(ind.rsi).toBeLessThanOrEqual(100);
    expect(ind.vol).toBeGreaterThanOrEqual(0);
    expect(['Strong Sell', 'Bearish', 'Neutral', 'Bullish', 'Strong Buy']).toContain(ind.signalLabel);
  });
});
