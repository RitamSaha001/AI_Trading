import { describe, it, expect } from 'vitest';
import {
  calculateScenarioNumericIndex,
  formatScenarioId,
  evaluateStrategyMasterBrain,
  MasterBrainInputs,
} from '../strategyMasterBrain';
import { FleetMacroBreadthResult } from '../macroRegimeEngine';

describe('Autonomous Strategy Master Brain & 216+ Scenario Matrix', () => {
  const baseBreadth: FleetMacroBreadthResult = {
    totalAssetsEvaluated: 100,
    assetsAboveVwapCount: 65,
    breadthAboveVwapPct: 65,
    advancingAssetsCount: 60,
    decliningAssetsCount: 40,
    advanceDeclineRatio: 1.5,
    fleetMeanChangePct: 0.45,
    macroRegime: 'BULL_MOMENTUM',
    directionalPermission: 'LONG_ONLY',
    convictionAdjustment: 5,
    rationale: 'Healthy breadth',
  };

  it('correctly maps 216 distinct scenario permutations to SC-001 through SC-216', () => {
    // First index: SC-001 (T1, R1, A1, P1)
    const idx1 = calculateScenarioNumericIndex('T1_OPENING_DISCOVERY', 'R1_BULL_EXPANSION', 'A1_PERSISTENT_SUPER_TREND', 'P1_AT_EQUILIBRIUM');
    expect(idx1).toBe(1);
    expect(formatScenarioId(idx1)).toBe('SC-001');

    // Last index: SC-216 (T6, R4, A3, P3)
    const idxLast = calculateScenarioNumericIndex('T6_LATE_DAY', 'R4_VOLATILITY_SHOCK', 'A3_RANDOM_WALK_CHOP', 'P3_OVERSOLD_COMPRESSED');
    expect(idxLast).toBe(216);
    expect(formatScenarioId(idxLast)).toBe('SC-216');

    // Ensure all 216 indices are unique
    const set = new Set<number>();
    const phases = ['T1_OPENING_DISCOVERY', 'T2_MORNING_EXPANSION', 'T3_MID_MORNING', 'T4_MIDDAY_CHOP', 'T5_AFTERNOON_EXPANSION', 'T6_LATE_DAY'] as const;
    const regimes = ['R1_BULL_EXPANSION', 'R2_BEAR_DISTRIBUTION', 'R3_RANGE_EQUILIBRIUM', 'R4_VOLATILITY_SHOCK'] as const;
    const assets = ['A1_PERSISTENT_SUPER_TREND', 'A2_MEAN_REVERTING', 'A3_RANDOM_WALK_CHOP'] as const;
    const locs = ['P1_AT_EQUILIBRIUM', 'P2_OVERBOUGHT_EXTENDED', 'P3_OVERSOLD_COMPRESSED'] as const;

    for (const p of phases) {
      for (const r of regimes) {
        for (const a of assets) {
          for (const l of locs) {
            const idx = calculateScenarioNumericIndex(p, r, a, l);
            expect(idx).toBeGreaterThanOrEqual(1);
            expect(idx).toBeLessThanOrEqual(216);
            set.add(idx);
          }
        }
      }
    }
    expect(set.size).toBe(216);
  });

  it('enforces opening discovery curfew during 09:15 - 09:35 IST (SC-001 to SC-036)', () => {
    const inputs: MasterBrainInputs = {
      istMinutes: 9 * 60 + 25, // 09:25 AM
      marketPrice: 1000,
      dayOpenPrice: 990,
      vwap: 995,
      atr: 10,
      hurst: 0.65,
      squeezeStatus: 'SQUEEZE_OFF',
      ouZScore: 0.2,
      macroBreadth: baseBreadth,
      sectorRank: 1,
      sectorAvgChange: 1.2,
      sectorAdvanceRatio: 0.8,
    };

    const directive = evaluateStrategyMasterBrain(inputs);
    expect(directive.sessionPhase).toBe('T1_OPENING_DISCOVERY');
    expect(directive.actionPermission).toBe('BLOCKED_STAND_ASIDE');
    expect(directive.marginMultiplier).toBe(1.0);
    expect(directive.riskBudgetMultiplier).toBe(0.0);
    expect(directive.minAciThreshold).toBe(999);
  });

  it('activates 4.5x leverage and asymmetric profit harvesting on prime morning super-trend leaders (SC-037 to SC-054)', () => {
    const inputs: MasterBrainInputs = {
      istMinutes: 9 * 60 + 42, // 09:42 AM (like ADANIGREEN)
      marketPrice: 1315,
      dayOpenPrice: 1290,
      vwap: 1310, // ~0.5 ATR above VWAP
      atr: 10,
      hurst: 0.64,
      squeezeStatus: 'SQUEEZE_OFF',
      ouZScore: 0.1,
      macroBreadth: baseBreadth,
      sectorRank: 1, // Sector Leader
      sectorAvgChange: 1.5,
      sectorAdvanceRatio: 0.85,
    };

    const directive = evaluateStrategyMasterBrain(inputs);
    expect(directive.sessionPhase).toBe('T2_MORNING_EXPANSION');
    expect(directive.actionPermission).toBe('PERMITTED');
    expect(directive.allowedStrategies).toContain('Hurst Trend Rider');
    expect(directive.marginMultiplier).toBe(4.5); // 4.5x dynamic buying power
    expect(directive.riskBudgetMultiplier).toBe(1.25);
    expect(directive.requireGreenOnDay).toBe(true);
    expect(directive.downsizingAllowed).toBe(true);
    expect(directive.trancheTargets.guaranteedLockAtr).toBe(0.35); // +0.35 ATR locked runner stop
  });

  it('rejects overbought morning spikes as exhaustion traps (P2 Overbought)', () => {
    const inputs: MasterBrainInputs = {
      istMinutes: 9 * 60 + 40, // 09:40 AM (like COFORGE chasing spike)
      marketPrice: 1875,
      dayOpenPrice: 1840,
      vwap: 1850, // 25 points above VWAP with ATR 20 => 1.25 ATR
      atr: 20,
      hurst: 0.60,
      squeezeStatus: 'SQUEEZE_OFF',
      ouZScore: 0.8,
      macroBreadth: baseBreadth,
      sectorRank: 3,
      sectorAvgChange: 0.2,
      sectorAdvanceRatio: 0.5,
    };

    const directive = evaluateStrategyMasterBrain(inputs);
    expect(directive.priceLocation).toBe('P2_OVERBOUGHT_EXTENDED');
    expect(directive.actionPermission).toBe('BLOCKED_STAND_ASIDE');
    expect(directive.scenarioName).toBe('OVERBOUGHT_EXPANSION_EXHAUSTION_TRAP');
  });

  it('strictly prohibits trend breakouts during midday chop and permits only VWAP Band Mean Reversion (SC-109 to SC-144)', () => {
    // Scenario 1: Trend Breakout attempt at 12:15 PM -> Must be BLOCKED
    const trendInputs: MasterBrainInputs = {
      istMinutes: 12 * 60 + 15, // 12:15 PM
      marketPrice: 1000,
      dayOpenPrice: 995,
      vwap: 998,
      atr: 10,
      hurst: 0.60,
      squeezeStatus: 'SQUEEZE_OFF',
      ouZScore: 0.2,
      macroBreadth: baseBreadth,
      sectorRank: 2,
      sectorAvgChange: 0.4,
      sectorAdvanceRatio: 0.6,
    };
    const trendDirective = evaluateStrategyMasterBrain(trendInputs);
    expect(trendDirective.sessionPhase).toBe('T4_MIDDAY_CHOP');
    expect(trendDirective.actionPermission).toBe('BLOCKED_STAND_ASIDE');
    expect(trendDirective.scenarioName).toBe('MIDDAY_CHOP_BREAKOUT_PROHIBITION');

    // Scenario 2: Oversold VWAP Band bounce at 11:09 AM / 12:15 PM (like BAJFINANCE) -> PERMITTED
    const meanRevInputs: MasterBrainInputs = {
      istMinutes: 11 * 60 + 45, // 11:45 AM
      marketPrice: 1035,
      dayOpenPrice: 1045,
      vwap: 1048, // -1.3 ATR below VWAP
      atr: 10,
      hurst: 0.42,
      squeezeStatus: 'SQUEEZE_ON',
      ouZScore: -1.6, // Strongly oversold
      macroBreadth: baseBreadth,
      sectorRank: 3,
      sectorAvgChange: -0.1,
      sectorAdvanceRatio: 0.45,
    };
    const meanRevDirective = evaluateStrategyMasterBrain(meanRevInputs);
    expect(meanRevDirective.sessionPhase).toBe('T4_MIDDAY_CHOP');
    expect(meanRevDirective.priceLocation).toBe('P3_OVERSOLD_COMPRESSED');
    expect(meanRevDirective.actionPermission).toBe('PERMITTED');
    expect(meanRevDirective.allowedStrategies).toEqual(['VWAP Band Mean Reversion', 'Value Accumulator', 'OU Mean Reversion']);
    expect(meanRevDirective.marginMultiplier).toBe(3.5);
    expect(meanRevDirective.requireGreenOnDay).toBe(false); // Can buy oversold dips
  });

  it('enforces exit-only late-day liquidation after 14:00 IST (SC-181 to SC-216)', () => {
    const inputs: MasterBrainInputs = {
      istMinutes: 14 * 60 + 10, // 02:10 PM
      marketPrice: 500,
      dayOpenPrice: 490,
      vwap: 495,
      atr: 5,
      hurst: 0.65,
      squeezeStatus: 'SQUEEZE_OFF',
      ouZScore: 0.1,
      macroBreadth: baseBreadth,
      sectorRank: 1,
      sectorAvgChange: 1.0,
      sectorAdvanceRatio: 0.7,
    };

    const directive = evaluateStrategyMasterBrain(inputs);
    expect(directive.sessionPhase).toBe('T6_LATE_DAY');
    expect(directive.actionPermission).toBe('EXIT_ONLY');
    expect(directive.allowedStrategies).toEqual([]);
    expect(directive.riskBudgetMultiplier).toBe(0.0);
  });

  it('trips daily loss guard circuit breaker after 2 stop losses or <= -₹350 daily loss', () => {
    const inputs: MasterBrainInputs = {
      istMinutes: 10 * 60 + 15,
      marketPrice: 1000,
      dayOpenPrice: 995,
      vwap: 998,
      atr: 10,
      hurst: 0.65,
      squeezeStatus: 'SQUEEZE_OFF',
      ouZScore: 0.1,
      macroBreadth: baseBreadth,
      sectorRank: 1,
      sectorAvgChange: 1.0,
      sectorAdvanceRatio: 0.7,
      intradayPnlContext: {
        dailyRealizedPnl: -360,
        dailyUnrealizedPnl: 0,
        dailyNetPnl: -360,
        dailyWinsCount: 0,
        dailyLossCount: 2,
        dailyTradesCount: 2,
        activePositionCount: 0,
        targetProfitGoal: 100,
      },
    };

    const directive = evaluateStrategyMasterBrain(inputs);
    expect(directive.actionPermission).toBe('BLOCKED_DAILY_LOSS_GUARD');
    expect(directive.dailyPnlRegime).toBe('LOSS_GUARD_HALT');
    expect(directive.riskBudgetMultiplier).toBe(0.0);
    expect(directive.minAciThreshold).toBe(999);
  });

  it('locks daily profit goal in cash once net profit reaches >= ₹100 with 0 open positions', () => {
    const inputs: MasterBrainInputs = {
      istMinutes: 10 * 60 + 15,
      marketPrice: 1000,
      dayOpenPrice: 995,
      vwap: 998,
      atr: 10,
      hurst: 0.65,
      squeezeStatus: 'SQUEEZE_OFF',
      ouZScore: 0.1,
      macroBreadth: baseBreadth,
      sectorRank: 1,
      sectorAvgChange: 1.0,
      sectorAdvanceRatio: 0.7,
      intradayPnlContext: {
        dailyRealizedPnl: 145,
        dailyUnrealizedPnl: 0,
        dailyNetPnl: 145,
        dailyWinsCount: 2,
        dailyLossCount: 0,
        dailyTradesCount: 2,
        activePositionCount: 0,
        targetProfitGoal: 100,
      },
    };

    const directive = evaluateStrategyMasterBrain(inputs);
    expect(directive.actionPermission).toBe('BLOCKED_DAILY_PROFIT_LOCKED');
    expect(directive.dailyPnlRegime).toBe('PROFIT_LOCKED');
    expect(directive.riskBudgetMultiplier).toBe(0.0);
    expect(directive.minAciThreshold).toBe(999);
  });

  it('engages defensive recovery mode after 1 stop loss, halving risk and raising conviction hurdle', () => {
    const inputs: MasterBrainInputs = {
      istMinutes: 10 * 60 + 0, // Morning expansion
      marketPrice: 1005,
      dayOpenPrice: 995,
      vwap: 1000,
      atr: 10,
      hurst: 0.65,
      squeezeStatus: 'SQUEEZE_OFF',
      ouZScore: 0.1,
      macroBreadth: baseBreadth,
      sectorRank: 1,
      sectorAvgChange: 1.0,
      sectorAdvanceRatio: 0.7,
      intradayPnlContext: {
        dailyRealizedPnl: -150,
        dailyUnrealizedPnl: 0,
        dailyNetPnl: -150,
        dailyWinsCount: 0,
        dailyLossCount: 1,
        dailyTradesCount: 1,
        activePositionCount: 0,
        targetProfitGoal: 100,
      },
    };

    const directive = evaluateStrategyMasterBrain(inputs);
    expect(directive.actionPermission).toBe('PERMITTED');
    expect(directive.dailyPnlRegime).toBe('DEFENSIVE_RECOVERY');
    expect(directive.riskBudgetMultiplier).toBeLessThanOrEqual(0.50);
    expect(directive.minAciThreshold).toBeGreaterThanOrEqual(65);
    expect(directive.trancheTargets.tranche1Atr).toBe(1.10);
    expect(directive.trancheTargets.runnerMode).toBe('TIGHT_RATCHET');
  });

  it('triggers anti-giveback circuit breaker when intraday peak reached >= ₹60 and P&L slips to <= 0', () => {
    const inputs: MasterBrainInputs = {
      istMinutes: 11 * 60 + 15,
      marketPrice: 1005,
      dayOpenPrice: 995,
      vwap: 1000,
      atr: 10,
      hurst: 0.65,
      squeezeStatus: 'SQUEEZE_OFF',
      ouZScore: 0.1,
      macroBreadth: baseBreadth,
      sectorRank: 1,
      sectorAvgChange: 1.0,
      sectorAdvanceRatio: 0.7,
      intradayPnlContext: {
        dailyRealizedPnl: -10,
        dailyUnrealizedPnl: 0,
        dailyNetPnl: -10,
        dailyWinsCount: 1,
        dailyLossCount: 1,
        dailyTradesCount: 2,
        activePositionCount: 0,
        targetProfitGoal: 100,
        dailyPeakNetPnl: 78.5, // Reached +₹78.50 earlier today
      },
    };

    const directive = evaluateStrategyMasterBrain(inputs);
    expect(directive.actionPermission).toBe('BLOCKED_DAILY_LOSS_GUARD');
    expect(directive.dailyPnlRegime).toBe('LOSS_GUARD_HALT');
    expect(directive.riskBudgetMultiplier).toBe(0.0);
    expect(directive.minAciThreshold).toBe(999);
    expect(directive.rationale).toContain('Profit Preservation Circuit');
  });
});
