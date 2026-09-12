import { describe, it, expect } from 'vitest';
import {
  extractCandleMicrostructure,
  calculateOrderFlowDelta,
  evaluateCandlePriceAction,
} from '../candlestickPatternEngine';
import { Candle } from '../../../types';

describe('Candlestick Pattern & Microstructure Engine', () => {
  it('extracts geometric microstructure correctly for a hammer / pinbar', () => {
    const candle: Candle = {
      time: 1700000000000,
      open: 100,
      high: 101,
      low: 95,
      close: 100.5,
      volume: 1000,
    };

    const micro = extractCandleMicrostructure(candle);
    expect(micro.range).toBe(6);
    expect(micro.body).toBe(0.5);
    expect(micro.lowerShadow).toBe(5); // 100 - 95
    expect(micro.lowerShadowRatio).toBeCloseTo(5 / 6, 2); // > 80% lower shadow
    expect(micro.isBullish).toBe(true);
  });

  it('calculates order flow delta and detects aggressive buying volume absorption', () => {
    // 5 bars where price closed near the highs with high volume
    const bullishBars: Candle[] = [
      { time: 1, open: 100, high: 102, low: 99.8, close: 101.8, volume: 5000 },
      { time: 2, open: 101.8, high: 103, low: 101.5, close: 102.9, volume: 6000 },
      { time: 3, open: 102.9, high: 104, low: 102.8, close: 103.8, volume: 5500 },
      { time: 4, open: 103.8, high: 105, low: 103.5, close: 104.9, volume: 7000 },
      { time: 5, open: 104.9, high: 106, low: 104.7, close: 105.8, volume: 6500 },
    ];

    const flow = calculateOrderFlowDelta(bullishBars, 5);
    expect(flow.deltaRatio).toBeGreaterThan(1.5);
    expect(flow.cumulativeDelta).toBeGreaterThan(0);
    expect(flow.flowInterpretation).toContain('Aggressive institutional buying absorption');
  });

  it('detects a high-conviction Bullish Pinbar Rejection at VWAP', () => {
    const vwap = 1000;
    const atr = 10;
    const now = 1700000000000;

    // Series of candles testing VWAP and printing a hammer
    const prefix: Candle[] = Array.from({ length: 20 }, (_, i) => ({
      time: i,
      open: 1005,
      high: 1008,
      low: 1002,
      close: 1005,
      volume: 2000,
    }));
    const candles: Candle[] = [
      ...prefix,
      { time: 21, open: 1008, high: 1010, low: 1005, close: 1006, volume: 2000 },
      { time: 22, open: 1006, high: 1007, low: 1003, close: 1004, volume: 1800 },
      { time: 23, open: 1004, high: 1005, low: 1001, close: 1002, volume: 2100 },
      { time: 24, open: 1002, high: 1003, low: 999, close: 1001, volume: 2400 },
      // Hammer bar: dipped to 995 (below VWAP), violently rejected, closed at 1001 near high
      { time: 25, open: 1000, high: 1001.5, low: 995, close: 1001.2, volume: 5000 },
    ];

    const res = evaluateCandlePriceAction(candles, 1001.2, vwap, atr, 2.0, now);
    expect(res.isActionSignal).toBe(true);
    expect(res.direction).toBe('LONG');
    expect(res.pattern).toBe('BULLISH_PINBAR');
    expect(res.stopLossPrice).toBeLessThan(1001.2);
    expect(res.takeProfitPrice).toBeGreaterThan(1001.2);
    expect(res.rationale).toContain('Bullish Pinbar Rejection at VWAP');
  });

  it('detects Bullish Engulfing with volume expansion', () => {
    const vwap = 500;
    const atr = 6;
    const now = 1700000000000;

    const prefix: Candle[] = Array.from({ length: 20 }, (_, i) => ({
      time: i,
      open: 502,
      high: 505,
      low: 500,
      close: 502,
      volume: 1500,
    }));
    const candles: Candle[] = [
      ...prefix,
      { time: 21, open: 505, high: 506, low: 502, close: 503, volume: 1500 },
      { time: 22, open: 503, high: 504, low: 501, close: 502, volume: 1600 },
      { time: 23, open: 502, high: 503, low: 500, close: 501, volume: 1400 },
      // Bear bar
      { time: 24, open: 502, high: 502.5, low: 498, close: 499, volume: 2000 },
      // Huge bull engulfing bar
      { time: 25, open: 498.5, high: 504, low: 498, close: 503.5, volume: 4500 },
    ];

    const res = evaluateCandlePriceAction(candles, 503.5, vwap, atr, 2.25, now);
    expect(res.isActionSignal).toBe(true);
    expect(res.direction).toBe('LONG');
    expect(res.pattern).toBe('BULLISH_ENGULFING');
    expect(res.rationale).toContain('Bullish Engulfing');
  });
});
