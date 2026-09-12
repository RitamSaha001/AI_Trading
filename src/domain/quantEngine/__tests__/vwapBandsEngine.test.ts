import { describe, it, expect } from 'vitest';
import {
  calculateVWAPBands,
  evaluateVWAPMeanReversion,
} from '../vwapBandsEngine';
import { Candle } from '../../../types';

describe('VWAP Bands & Statistical Mean Reversion Engine', () => {
  it('computes VWAP, standard deviations, and +/- 1σ / 2σ bands accurately', () => {
    const candles: Candle[] = [
      { time: 1, open: 100, high: 102, low: 99, close: 101, volume: 1000 },
      { time: 2, open: 101, high: 103, low: 100, close: 102, volume: 2000 },
      { time: 3, open: 102, high: 104, low: 101, close: 103, volume: 1500 },
      { time: 4, open: 103, high: 105, low: 102, close: 104, volume: 3000 },
    ];

    const bands = calculateVWAPBands(candles, 104);
    expect(bands.vwap).toBeGreaterThan(100);
    expect(bands.vwap).toBeLessThan(104);
    expect(bands.stdDev).toBeGreaterThan(0);
    expect(bands.upperBand1).toBeGreaterThan(bands.vwap);
    expect(bands.upperBand2).toBeGreaterThan(bands.upperBand1);
    expect(bands.lowerBand1).toBeLessThan(bands.vwap);
    expect(bands.lowerBand2).toBeLessThan(bands.lowerBand1);
    expect(bands.zScore).toBeGreaterThan(0); // Price 104 is above VWAP
  });

  it('triggers an oversold mean reversion buy when price reaches lower band 2 with absorption', () => {
    // Construct 50 candles centered around 1000 with typical variance
    const candles: Candle[] = [];
    for (let i = 0; i < 50; i++) {
      candles.push({
        time: i,
        open: 1000 + (i % 2 === 0 ? 5 : -5),
        high: 1008,
        low: 992,
        close: 1000,
        volume: 2000,
      });
    }

    // Add extended drop down to 975 (well below -2 sigma) with bounce
    candles.push({
      time: 51,
      open: 978,
      high: 981,
      low: 975,
      close: 980,
      volume: 3500,
    });

    const res = evaluateVWAPMeanReversion(candles, 980, 8, 1700000000000);
    expect(res.isSignal).toBe(true);
    expect(res.direction).toBe('LONG');
    expect(res.zScore).toBeLessThan(-1.4);
    expect(res.stopLossPrice).toBeLessThan(980);
    expect(res.takeProfitPrice).toBeGreaterThan(980);
    expect(res.rationale).toContain('Mean-Reversion');
  });
});
