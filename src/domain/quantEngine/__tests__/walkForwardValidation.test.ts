import { describe, expect, it } from 'vitest';
import {
  BACKTEST_WARMUP_BARS,
  createWalkForwardWindows,
  LogisticRegressionModel,
  runWalkForwardValidation,
} from '../backtestHarness';

describe('Walk-Forward Research Gate', () => {
  it('creates chronological, non-overlapping out-of-sample windows', () => {
    const windows = createWalkForwardWindows(480, 160, 80);

    expect(windows).toHaveLength(4);
    expect(windows[0]).toMatchObject({ trainingStartBar: 0, trainingEndBarExclusive: 160, testStartBar: 160, testEndBarExclusive: 240 });
    expect(windows[1].trainingStartBar).toBe(80);
    expect(windows[1].testStartBar).toBe(windows[0].testEndBarExclusive);
    expect(windows.every((window) => window.trainingEndBarExclusive === window.testStartBar)).toBe(true);
  });

  it('refuses promotion when the data cannot support the requested number of folds', () => {
    const candles = Array.from({ length: BACKTEST_WARMUP_BARS + 20 }, (_, index) => ({
      time: index * 300_000,
      open: 100 + index,
      high: 101 + index,
      low: 99 + index,
      close: 100 + index,
      volume: 50_000,
    }));
    const report = runWalkForwardValidation(candles, 'insufficient-data', {
      trainingBars: 80,
      testBars: 60,
      minimumPassingFolds: 1,
    });

    expect(report.folds).toHaveLength(0);
    expect(report.isPromotable).toBe(false);
    expect(report.rejectionReasons[0]).toContain('Only 0 chronological folds');
  });

  it('keeps regularized empirical probabilities bounded on a small sample', () => {
    const model = new LogisticRegressionModel();
    model.fit(Array.from({ length: 12 }, (_, index) => ({
      features: {
        hurst: 0.5 + index * 0.01,
        volumeSurgeRatio: 1 + index * 0.05,
        isSqueezeRelease: index % 2 === 0,
        relativeStrengthPct: index,
        alphaConvictionIndex: 55 + index,
        atrPriceRatio: 0.02,
      },
      won: index % 3 === 0 ? 0 : 1,
    })));

    const probability = model.predict({
      hurst: 0.62,
      volumeSurgeRatio: 1.4,
      isSqueezeRelease: true,
      relativeStrengthPct: 2,
      alphaConvictionIndex: 72,
      atrPriceRatio: 0.02,
    });

    expect(model.isFitted).toBe(true);
    expect(model.weights.every(Number.isFinite)).toBe(true);
    expect(probability).toBeGreaterThanOrEqual(0.3);
    expect(probability).toBeLessThanOrEqual(0.78);
  });
});
