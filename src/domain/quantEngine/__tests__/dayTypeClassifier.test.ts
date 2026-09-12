import { describe, it, expect } from 'vitest';
import { classifyMarketDayType } from '../dayTypeClassifier';
import { FleetMacroBreadthResult } from '../macroRegimeEngine';

describe('Market Day-Type Classifier', () => {
  it('classifies a Bull Trend Day when breadth is overwhelmingly positive', () => {
    const bullMetrics: FleetMacroBreadthResult = {
      totalAssetsEvaluated: 100,
      assetsAboveVwapCount: 72,
      breadthAboveVwapPct: 72,
      advancingAssetsCount: 70,
      decliningAssetsCount: 25,
      advanceDeclineRatio: 2.8,
      fleetMeanChangePct: 0.85,
      directionalPermission: 'BOTH',
      macroRegime: 'BULL_MOMENTUM',
      convictionAdjustment: 8,
      rationale: 'Bullish market expansion',
    };

    const classification = classifyMarketDayType(bullMetrics, Date.UTC(2026, 8, 1, 4, 30)); // 10:00 AM IST
    expect(classification.dayType).toBe('BULL_TREND_DAY');
    expect(classification.favoredStrategies).toContain('Hurst Trend Rider');
    expect(classification.favoredStrategies).toContain('Candle Price Action');
    expect(classification.targetProfitAtrMultiplier).toBeGreaterThanOrEqual(2.0);
  });

  it('classifies a Bear Trend / Liquidation Day when breadth is deeply collapsed', () => {
    const bearMetrics: FleetMacroBreadthResult = {
      totalAssetsEvaluated: 100,
      assetsAboveVwapCount: 20,
      breadthAboveVwapPct: 20,
      advancingAssetsCount: 15,
      decliningAssetsCount: 80,
      advanceDeclineRatio: 0.3,
      fleetMeanChangePct: -1.2,
      directionalPermission: 'SHORT_ONLY',
      macroRegime: 'BEAR_MOMENTUM',
      convictionAdjustment: -10,
      rationale: 'Severe macro bear distribution',
    };

    const classification = classifyMarketDayType(bearMetrics, Date.UTC(2026, 8, 1, 4, 30)); // 10:00 AM IST
    expect(classification.dayType).toBe('BEAR_TREND_DAY');
    expect(classification.restrictedStrategies).toContain('Hurst Trend Rider');
  });

  it('classifies Range-Bound Equilibrium when fleet is balanced around VWAP', () => {
    const rangeMetrics: FleetMacroBreadthResult = {
      totalAssetsEvaluated: 100,
      assetsAboveVwapCount: 48,
      breadthAboveVwapPct: 48,
      advancingAssetsCount: 45,
      decliningAssetsCount: 43,
      advanceDeclineRatio: 1.05,
      fleetMeanChangePct: 0.02,
      directionalPermission: 'BOTH',
      macroRegime: 'CHOPPY_EQUILIBRIUM',
      convictionAdjustment: 0,
      rationale: 'Balanced equilibrium',
    };

    const classification = classifyMarketDayType(rangeMetrics, Date.UTC(2026, 8, 1, 5, 30)); // 11:00 AM IST
    expect(classification.dayType).toBe('RANGE_BOUND_EQUILIBRIUM');
    expect(classification.favoredStrategies).toContain('VWAP Band Mean Reversion');
  });
});
