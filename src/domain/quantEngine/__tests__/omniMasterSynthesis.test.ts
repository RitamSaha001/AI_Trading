import { describe, it, expect } from 'vitest';
import { evaluateOmniMasterSynthesis, OmniMasterSynthesisInputs } from '../omniMasterSynthesis';

describe('Omni-Synaptic Master Synthesis Engine (Prototype 4)', () => {
  const baseInputs: OmniMasterSynthesisInputs = {
    istMinutes: 630, // 10:30 AM IST (Optimal timing window)
    marketPrice: 1000,
    dayOpenPrice: 995,
    vwap: 996,
    atr: 12.0,
    hurst: 0.65, // Strong trending persistence
    squeezeStatus: 'NO_SQUEEZE',
    volumeSurgeRatio: 2.2, // Strong institutional surge
    hasInstitutionalVolume: true,
    ouZScore: 0.8,
    sectorRank: 1,
    sectorAvgChange: 1.2,
    sectorAdvanceRatio: 0.85,
    reputationScore: 100,
    projectedNotional: 35000,
    projectedQuantity: 35,
    isDeliveryHolding: false,
    dailyLossCount: 0,
    rollingMonthlyContext: {
      rollingMonthlyPnl: 300,
      daysEvaluatedInMonth: 10,
      dailyAvgPnl: 30,
      targetDailyPnl: 50,
      targetMonthlyPnl: 500,
      targetPaceRatio: 0.6,
      activePosture: 'MOMENTUM_EXPANSION',
      postureRationale: 'Pacing check',
    },
  };

  it('permits high-conviction trade and applies Alpha Expansion leverage when behind monthly target pace', () => {
    const directive = evaluateOmniMasterSynthesis(baseInputs);
    expect(directive.actionPermission).toBe('PERMITTED');
    expect(directive.activePosture).toBe('ALPHA_EXPANSION_HURDLE');
    expect(directive.highwayMode).toBe('SUPER_TREND_HIGHWAY');
    expect(directive.marginMultiplier).toBeGreaterThanOrEqual(3.5);
    expect(directive.maxRiskRupees).toBeGreaterThanOrEqual(350);
    expect(directive.madsScratchThresholdAtr).toBe(-0.35);
  });

  it('locks profit vault and reduces leverage once ₹1,000 monthly target is cleared', () => {
    const inputsWithLockedPnl: OmniMasterSynthesisInputs = {
      ...baseInputs,
      rollingMonthlyContext: {
        ...baseInputs.rollingMonthlyContext!,
        rollingMonthlyPnl: 1450,
        daysEvaluatedInMonth: 15,
        dailyAvgPnl: 96.6,
        targetDailyPnl: 50,
        targetMonthlyPnl: 750,
        targetPaceRatio: 1.93,
        activePosture: 'CAPITAL_DEFENSE_LOCKED',
        postureRationale: 'Target reached',
      },
    };

    const directive = evaluateOmniMasterSynthesis(inputsWithLockedPnl);
    expect(directive.actionPermission).toBe('PERMITTED');
    expect(directive.activePosture).toBe('PROFIT_VAULT_SHIELD');
    expect(directive.monthlyTargetStatus).toBe('PROFIT_VAULT_LOCKED');
    expect(directive.marginMultiplier).toBeLessThanOrEqual(2.0);
    expect(directive.maxRiskRupees).toBeLessThanOrEqual(200);
  });

  it('trips circuit breaker and blocks all entries when 2 daily losses have occurred', () => {
    const directive = evaluateOmniMasterSynthesis({
      ...baseInputs,
      dailyLossCount: 2,
    });
    expect(directive.actionPermission).toBe('BLOCKED_CIRCUIT_BREAKER');
    expect(directive.riskBudgetMultiplier).toBe(0.0);
    expect(directive.maxRiskRupees).toBe(0);
    expect(directive.rationale).toContain('Daily loss limit triggered');
  });

  it('halves risk cap when 1 loss has occurred today', () => {
    const directive = evaluateOmniMasterSynthesis({
      ...baseInputs,
      dailyLossCount: 1,
    });
    expect(directive.actionPermission).toBe('PERMITTED');
    expect(directive.maxRiskRupees).toBeLessThanOrEqual(180);
  });

  it('blocks entry when market price fails fee armor expectancy hurdle', () => {
    const tinyMoveInputs: OmniMasterSynthesisInputs = {
      ...baseInputs,
      atr: 0.1, // Ultra-low ATR where statutory fees exceed expected move
      marketPrice: 50,
      projectedNotional: 5000,
      projectedQuantity: 100,
      rollingMonthlyContext: {
        ...baseInputs.rollingMonthlyContext!,
        rollingMonthlyPnl: 500, // On track
      },
    };

    const directive = evaluateOmniMasterSynthesis(tinyMoveInputs);
    expect(directive.actionPermission).toBe('BLOCKED_FEE_ARMOR');
    expect(directive.rationale).toContain('[Statutory Fee Armor]');
  });

  it('blocks entry when systemic shock flag is active', () => {
    const directive = evaluateOmniMasterSynthesis({
      ...baseInputs,
      isSystemicShock: true,
    });
    expect(directive.actionPermission).toBe('BLOCKED_STAND_ASIDE');
    expect(directive.rationale).toContain('Extreme systemic market volatility');
  });

  it('blocks all entries when monthly loss limit (-500) is reached', () => {
    const directive = evaluateOmniMasterSynthesis({
      ...baseInputs,
      rollingMonthlyContext: {
        ...baseInputs.rollingMonthlyContext!,
        rollingMonthlyPnl: -520,
      },
    });
    expect(directive.actionPermission).toBe('BLOCKED_STAND_ASIDE');
    expect(directive.rationale).toContain('[Monthly Capital Defense Lock]');
  });

  it('enters CAPITAL_DEFENSE_LOCKED and cuts risk when monthly P&L is in moderate drawdown', () => {
    const directive = evaluateOmniMasterSynthesis({
      ...baseInputs,
      rollingMonthlyContext: {
        ...baseInputs.rollingMonthlyContext!,
        rollingMonthlyPnl: -220,
      },
    });
    expect(directive.actionPermission).toBe('PERMITTED');
    expect(directive.activePosture).toBe('CAPITAL_DEFENSE_LOCKED');
    expect(directive.marginMultiplier).toBeLessThanOrEqual(2.0);
    expect(directive.maxRiskRupees).toBeLessThanOrEqual(150);
  });
});

