/**
 * omniMasterSynthesis.ts
 *
 * PROTOTYPE 4: OMNI-SYNAPTIC MASTER SYNTHESIS
 *
 * Synthesizes the core alpha-generating and risk-mitigating traits of:
 *   - Prototype 1: Broad multi-indicator opportunity discovery across 100 instruments
 *   - Prototype 2: Rolling 30-day adaptive pace governor & intraday daily profit vault
 *   - Prototype 3: 8 continuous sensory neurons, MADS micro-cuts, Super Trend runner highway,
 *                  continuous Kelly leverage (1.0x-4.5x), and statutory fee armor.
 *
 * Core Objective:
 *   Consistent attainment of >= ₹1,000 / month average net profit across 5 years
 *   on ₹40,000 capital with max portfolio drawdown strictly capped < 7.5%.
 */

import {
  Asset,
  RollingMonthlyPnlContext,
  MasterBrainAdaptivePosture,
  SynapticNeuronActivations,
  NeuralAttentionWeights,
} from '../../types';
import { FleetMacroBreadthResult } from './macroRegimeEngine';
import { SectorRankingResult } from './sectorMomentumEngine';
import { MultiTimeframeConfluenceResult } from './multiTimeframeConfluence';
import { VWAPBands } from './vwapBandsEngine';
import { BrainDirective, IntradayDailyPnlContext, TrancheTargetConfig } from './strategyMasterBrain';
import {
  encodeSensoryNeurons,
  computeCrossAttentionWeights,
  evaluateStatutoryFeeArmor,
} from './synapticNeuralWeb';

export interface OmniMasterSynthesisInputs {
  istMinutes: number;
  marketPrice: number;
  dayOpenPrice: number;
  vwap: number;
  atr: number;
  hurst: number;
  squeezeStatus: 'SQUEEZE_ON' | 'SQUEEZE_OFF' | 'NO_SQUEEZE' | 'IN_SQUEEZE' | 'SQUEEZE_RELEASE_BULL' | 'SQUEEZE_RELEASE_BEAR';
  volumeSurgeRatio: number;
  hasInstitutionalVolume: boolean;
  ouZScore: number;
  macroBreadth?: FleetMacroBreadthResult;
  sectorRank?: number;
  sectorAvgChange?: number;
  sectorAdvanceRatio?: number;
  mtfConfluence?: MultiTimeframeConfluenceResult;
  vwapBands?: VWAPBands;
  reputationScore?: number;
  intradayDailyPnlContext?: IntradayDailyPnlContext;
  rollingMonthlyContext?: RollingMonthlyPnlContext;
  isSystemicShock?: boolean;
  projectedNotional?: number;
  projectedQuantity?: number;
  isDeliveryHolding?: boolean;
  dailyLossCount?: number;
}

export interface OmniSynthesisDirective {
  actionPermission: 'PERMITTED' | 'BLOCKED_FEE_ARMOR' | 'BLOCKED_CIRCUIT_BREAKER' | 'BLOCKED_LOW_CONVICTION' | 'BLOCKED_STAND_ASIDE';
  compositeAlphaScore: number;        // 0 - 100 synthesis conviction
  marginMultiplier: number;           // Continuous dynamic leverage 1.0x to 4.5x
  riskBudgetMultiplier: number;       // Sizing factor based on conviction & loss cascade
  maxRiskRupees: number;              // Absolute risk ceiling (₹160 to ₹400)
  trancheTargets: TrancheTargetConfig;
  highwayMode: 'SUPER_TREND_HIGHWAY' | 'BALANCED_COMPOUNDING' | 'PROFIT_VAULT_SHIELD' | 'MADS_DEFENSE';
  monthlyTargetStatus: 'ON_TRACK' | 'AGGRESSIVE_EDGE_FOCUS' | 'PROFIT_VAULT_LOCKED' | 'DEFENSIVE_RECOVERY';
  activePosture: 'ALPHA_EXPANSION_HURDLE' | 'BALANCED_COMPOUNDING' | 'PROFIT_VAULT_SHIELD' | 'CAPITAL_DEFENSE_LOCKED';
  maxVwapExtensionAtr: number;
  maxStagnancyMinutes: number;
  madsScratchThresholdAtr: number;    // -0.35 ATR
  rationale: string;
  neurons: SynapticNeuronActivations;
  attention: NeuralAttentionWeights;
}

/**
 * Evaluates the Omni-Synaptic Master Synthesis engine.
 */
export function evaluateOmniMasterSynthesis(inputs: OmniMasterSynthesisInputs): OmniSynthesisDirective {
  const {
    istMinutes,
    marketPrice,
    vwap,
    atr,
    hurst,
    volumeSurgeRatio,
    ouZScore,
    macroBreadth,
    sectorRank = 5,
    sectorAvgChange = 0,
    sectorAdvanceRatio = 0.5,
    mtfConfluence,
    vwapBands,
    reputationScore = 100,
    intradayDailyPnlContext,
    rollingMonthlyContext,
    isSystemicShock = false,
    projectedNotional = 35000,
    projectedQuantity = 10,
    isDeliveryHolding = false,
    dailyLossCount = 0,
  } = inputs;

  // 1. Cascading Loss Circuit Breaker (Pillar 3 & 6)
  if (dailyLossCount >= 2) {
    return createBlockedDirective(
      'BLOCKED_CIRCUIT_BREAKER',
      0,
      `[Omni Circuit Breaker] Daily loss limit triggered (${dailyLossCount} losses). Trading halted to protect capital.`
    );
  }

  // 2. Systemic Market Shock Guard
  if (isSystemicShock) {
    return createBlockedDirective(
      'BLOCKED_STAND_ASIDE',
      0,
      '[Omni Shock Guard] Extreme systemic market volatility detected. Standing aside in cash.'
    );
  }

  // 3. Evaluate 8 Continuous Sensory Neurons (Pillar 1 - Prototype 3)
  const defaultMacro: FleetMacroBreadthResult = {
    totalAssetsEvaluated: 100,
    assetsAboveVwapCount: 50,
    breadthAboveVwapPct: 50,
    advancingAssetsCount: 50,
    decliningAssetsCount: 50,
    advanceDeclineRatio: 1.0,
    fleetMeanChangePct: 0.0,
    macroRegime: 'CHOPPY_EQUILIBRIUM',
    directionalPermission: 'BOTH',
    convictionAdjustment: 0,
    rationale: 'Default neutral macro breadth',
  };

  const sensoryInputs = {
    istMinutes,
    marketPrice,
    dayOpenPrice: inputs.dayOpenPrice,
    vwap,
    atr,
    hurst,
    squeezeStatus:
      inputs.squeezeStatus === 'IN_SQUEEZE'
        ? ('SQUEEZE_ON' as const)
        : inputs.squeezeStatus === 'SQUEEZE_RELEASE_BULL' || inputs.squeezeStatus === 'SQUEEZE_RELEASE_BEAR'
        ? ('SQUEEZE_OFF' as const)
        : ('NO_SQUEEZE' as const),
    volumeSurgeRatio,
    hasInstitutionalVolume: inputs.hasInstitutionalVolume,
    ouZScore,
    macroBreadth: macroBreadth || defaultMacro,
    sectorRank,
    sectorAvgChange,
    sectorAdvanceRatio,
    mtfConfluence,
    vwapBands,
    reputationScore,
    intradayDailyPnlContext,
    rollingMonthlyContext,
  };

  const neurons = encodeSensoryNeurons(sensoryInputs);
  const attention = computeCrossAttentionWeights(istMinutes, neurons.macroBreadth, neurons.pnlVelocity);

  // Compute Composite Conviction (0 - 100)
  const weightedSynapseActivation =
    neurons.macroBreadth * attention.macroAttention +
    neurons.fractalPersistence * attention.fractalAttention +
    (neurons.orderFlowSurge * 2.0 - 1.0) * attention.orderFlowAttention +
    neurons.mtfConfluence * attention.mtfAttention +
    neurons.sectorTailwind * attention.sectorAttention +
    neurons.vwapCurvature * attention.vwapAttention +
    (neurons.assetReputation * 2.0 - 1.0) * attention.reputationAttention +
    neurons.pnlVelocity * attention.pnlVelocityAttention;

  const rawConviction = 50 + weightedSynapseActivation * 42;
  const compositeAlphaScore = Math.max(0, Math.min(100, Math.round(rawConviction)));

  // 4. Evaluate Monthly Target Pace and Capital Defense (Pillar 2 - Prototype 2 Evolution)
  const daysInMonth = Math.max(1, rollingMonthlyContext?.daysEvaluatedInMonth || 1);
  const currentMonthPnl = rollingMonthlyContext?.rollingMonthlyPnl || 0;
  const expectedPnlAtThisDay = daysInMonth * 50.0; // ₹50/day target pace (= ₹1,000/month)
  const monthPnlGap = currentMonthPnl - expectedPnlAtThisDay;

  // RULE A: Monthly Hard Capital Defense Circuit Breaker
  // If month drops to -₹500, stand aside for remainder of the month to protect portfolio capital.
  if (currentMonthPnl <= -500) {
    return createBlockedDirective(
      'BLOCKED_STAND_ASIDE',
      compositeAlphaScore,
      `[Monthly Capital Defense Lock] Monthly loss limit (-₹${Math.abs(currentMonthPnl).toFixed(0)} <= -₹500) reached. Standing aside in cash for remainder of month to protect capital.`
    );
  }

  let monthlyTargetStatus: 'ON_TRACK' | 'AGGRESSIVE_EDGE_FOCUS' | 'PROFIT_VAULT_LOCKED' | 'DEFENSIVE_RECOVERY';
  let activePosture: 'ALPHA_EXPANSION_HURDLE' | 'BALANCED_COMPOUNDING' | 'PROFIT_VAULT_SHIELD' | 'CAPITAL_DEFENSE_LOCKED';

  if (currentMonthPnl >= 1000) {
    // ₹1,000 monthly target cleared: lock profit vault
    monthlyTargetStatus = 'PROFIT_VAULT_LOCKED';
    activePosture = 'PROFIT_VAULT_SHIELD';
  } else if (currentMonthPnl <= -200) {
    // In drawdown: DEFENSIVE RECOVERY - do NOT increase risk!
    monthlyTargetStatus = 'DEFENSIVE_RECOVERY';
    activePosture = 'CAPITAL_DEFENSE_LOCKED';
  } else if (monthPnlGap < -100) {
    // Behind pace but not in deep drawdown: selective Alpha Expansion
    monthlyTargetStatus = 'AGGRESSIVE_EDGE_FOCUS';
    activePosture = 'ALPHA_EXPANSION_HURDLE';
  } else {
    // Standard steady compounding
    monthlyTargetStatus = 'ON_TRACK';
    activePosture = 'BALANCED_COMPOUNDING';
  }

  // 5. Conviction Threshold Gating
  const minAlphaThreshold =
    activePosture === 'CAPITAL_DEFENSE_LOCKED' ? 68 :
    activePosture === 'PROFIT_VAULT_SHIELD' ? 70 :
    activePosture === 'ALPHA_EXPANSION_HURDLE' ? 65 : 60;

  if (compositeAlphaScore < minAlphaThreshold) {
    return {
      actionPermission: 'BLOCKED_LOW_CONVICTION',
      compositeAlphaScore,
      marginMultiplier: 1.0,
      riskBudgetMultiplier: 0.0,
      maxRiskRupees: 0,
      trancheTargets: {
        tranche1Atr: 1.25,
        tranche2Atr: 2.00,
        guaranteedLockAtr: 0.35,
        runnerMode: 'TIGHT_RATCHET',
      },
      highwayMode: 'MADS_DEFENSE',
      monthlyTargetStatus,
      activePosture,
      maxVwapExtensionAtr: 1.8,
      maxStagnancyMinutes: 45,
      madsScratchThresholdAtr: -0.35,
      rationale: `[Omni Conviction Filter] Composite Score ${compositeAlphaScore}/100 below required ${minAlphaThreshold} threshold for posture ${activePosture}.`,
      neurons,
      attention,
    };
  }

  // 6. Statutory Fee Armor Gate (Pillar 5 - Prototype 3)
  const estimatedWinProb = Math.min(0.85, Math.max(0.40, 0.50 + (compositeAlphaScore - 50) / 100));
  const feeArmor = evaluateStatutoryFeeArmor(
    marketPrice,
    projectedQuantity,
    atr,
    estimatedWinProb,
    1.5,
    1.2,
    isDeliveryHolding
  );

  if (!feeArmor.allowsTrade) {
    return {
      actionPermission: 'BLOCKED_FEE_ARMOR',
      compositeAlphaScore,
      marginMultiplier: 1.0,
      riskBudgetMultiplier: 0.0,
      maxRiskRupees: 0,
      trancheTargets: {
        tranche1Atr: 1.25,
        tranche2Atr: 2.00,
        guaranteedLockAtr: 0.35,
        runnerMode: 'TIGHT_RATCHET',
      },
      highwayMode: 'MADS_DEFENSE',
      monthlyTargetStatus,
      activePosture,
      maxVwapExtensionAtr: 1.8,
      maxStagnancyMinutes: 45,
      madsScratchThresholdAtr: -0.35,
      rationale: `[Statutory Fee Armor] ${feeArmor.rationale}`,
      neurons,
      attention,
    };
  }

  // 7. Dynamic Asymmetric 3-Tranche Runner Highway Calibration
  // High-momentum trending leaders always qualify for the runner highway:
  const isSuperTrendCandidate =
    compositeAlphaScore >= 70 &&
    neurons.fractalPersistence >= 0.50 &&
    neurons.sectorTailwind >= 0.30;

  let highwayMode: 'SUPER_TREND_HIGHWAY' | 'BALANCED_COMPOUNDING' | 'PROFIT_VAULT_SHIELD' | 'MADS_DEFENSE';
  let trancheTargets: TrancheTargetConfig;

  if (isSuperTrendCandidate) {
    highwayMode = 'SUPER_TREND_HIGHWAY';
    trancheTargets = {
      tranche1Atr: 1.35,
      tranche2Atr: 3.00,             // Extended core target
      guaranteedLockAtr: 0.40,
      runnerMode: 'CHANDELIER',      // Trailing Chandelier runner for 3.5 - 5.5 ATR expansion
    };
  } else if (activePosture === 'PROFIT_VAULT_SHIELD') {
    highwayMode = 'PROFIT_VAULT_SHIELD';
    trancheTargets = {
      tranche1Atr: 1.20,
      tranche2Atr: 2.00,
      guaranteedLockAtr: 0.35,
      runnerMode: 'TIGHT_RATCHET',
    };
  } else {
    highwayMode = 'BALANCED_COMPOUNDING';
    trancheTargets = {
      tranche1Atr: 1.35,
      tranche2Atr: 2.50,
      guaranteedLockAtr: 0.35,
      runnerMode: 'CHANDELIER',
    };
  }

  // 8. Dynamic Continuous Kelly Leverage & Risk Ceiling
  let marginMultiplier: number;
  let riskBudgetMultiplier: number;
  let maxRiskRupees: number;

  if (activePosture === 'PROFIT_VAULT_SHIELD') {
    // ₹1,000+ milestone locked: capital defense
    marginMultiplier = 1.8;
    riskBudgetMultiplier = dailyLossCount === 1 ? 0.35 : 0.65;
    maxRiskRupees = 180;
  } else if (activePosture === 'CAPITAL_DEFENSE_LOCKED') {
    // In monthly drawdown (<= -200): protect downside, do not over-leverage
    marginMultiplier = 2.0;
    riskBudgetMultiplier = 0.60;
    maxRiskRupees = 150;
  } else if (activePosture === 'ALPHA_EXPANSION_HURDLE' || compositeAlphaScore >= 75) {
    // High conviction momentum: unlock Kelly leverage
    marginMultiplier = compositeAlphaScore >= 80 ? 4.2 : 3.5;
    riskBudgetMultiplier = dailyLossCount === 1 ? 0.55 : 1.20;
    maxRiskRupees = 350;
  } else {
    marginMultiplier = 2.5;
    riskBudgetMultiplier = dailyLossCount === 1 ? 0.5 : 1.0;
    maxRiskRupees = 260;
  }

  // If 1 loss occurred today, clamp maxRiskRupees to 180
  if (dailyLossCount === 1) {
    maxRiskRupees = Math.min(maxRiskRupees, 180);
  }

  const rationale = `[Omni-Synaptic Master Synthesis] CAS ${compositeAlphaScore}/100 | Posture: ${activePosture} | Margin: ${marginMultiplier}x | Mode: ${highwayMode} | RiskCap: ₹${maxRiskRupees}`;

  return {
    actionPermission: 'PERMITTED',
    compositeAlphaScore,
    marginMultiplier,
    riskBudgetMultiplier,
    maxRiskRupees,
    trancheTargets,
    highwayMode,
    monthlyTargetStatus,
    activePosture,
    maxVwapExtensionAtr: compositeAlphaScore >= 75 ? 2.5 : 2.0,
    maxStagnancyMinutes: compositeAlphaScore >= 75 ? 65 : 45,
    madsScratchThresholdAtr: -0.35,
    rationale,
    neurons,
    attention,
  };
}

function createBlockedDirective(
  permission: 'BLOCKED_CIRCUIT_BREAKER' | 'BLOCKED_STAND_ASIDE',
  score: number,
  rationale: string
): OmniSynthesisDirective {
  return {
    actionPermission: permission,
    compositeAlphaScore: score,
    marginMultiplier: 1.0,
    riskBudgetMultiplier: 0.0,
    maxRiskRupees: 0,
    trancheTargets: {
      tranche1Atr: 1.25,
      tranche2Atr: 2.00,
      guaranteedLockAtr: 0.35,
      runnerMode: 'TIGHT_RATCHET',
    },
    highwayMode: 'MADS_DEFENSE',
    monthlyTargetStatus: 'ON_TRACK',
    activePosture: 'BALANCED_COMPOUNDING',
    maxVwapExtensionAtr: 1.8,
    maxStagnancyMinutes: 45,
    madsScratchThresholdAtr: -0.35,
    rationale,
    neurons: {
      macroBreadth: 0,
      fractalPersistence: 0,
      orderFlowSurge: 0,
      mtfConfluence: 0,
      sectorTailwind: 0,
      vwapCurvature: 0,
      assetReputation: 1,
      pnlVelocity: 0,
    },
    attention: {
      macroAttention: 0.125,
      fractalAttention: 0.125,
      orderFlowAttention: 0.125,
      mtfAttention: 0.125,
      sectorAttention: 0.125,
      vwapAttention: 0.125,
      reputationAttention: 0.125,
      pnlVelocityAttention: 0.125,
    },
  };
}
