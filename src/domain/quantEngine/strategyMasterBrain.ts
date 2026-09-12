/**
 * Autonomous Strategy Master Brain & 216+ Dynamic Scenario Matrix Coordinator
 *
 * Sits directly on top of the Quantitative Engine, coordinating all sub-engines:
 * (Macro Regime, Day Type Classifier, Session Timing, Sector Momentum,
 *  Microstructure Order Flow Delta, VWAP Standard Deviation Bands, and Half-Kelly Risk Sizing).
 *
 * Replaces hardcoded single-day logic with a mathematically exhaustive 216-scenario
 * multidimensional matrix derived from 5 years of historical test data.
 *
 * Target: Consistent ₹1,000 - ₹1,500/month baseline on ₹40,000 capital using 5x MIS leverage
 * with strict risk bounds (<= ₹400-500/trade, <= 2.0-2.5% max drawdown, 0 overnight risk).
 */

import { PilotStrategyKind, Market, Asset } from '../../types';
import { FleetMacroBreadthResult } from './macroRegimeEngine';
import { SectorRankingResult } from './sectorMomentumEngine';
import { MultiTimeframeConfluenceResult } from './multiTimeframeConfluence';
import { VWAPBands } from './vwapBandsEngine';
import * as thresholds from './config/thresholds';

// ============================================================================
// 1. MULTIDIMENSIONAL TAXONOMY TYPES
// ============================================================================

export type SessionPhaseKind =
  | 'T1_OPENING_DISCOVERY'       // 09:15 - 09:35 IST
  | 'T2_MORNING_EXPANSION'       // 09:35 - 10:30 IST
  | 'T3_MID_MORNING'             // 10:30 - 11:30 IST
  | 'T4_MIDDAY_CHOP'             // 11:30 - 13:15 IST
  | 'T5_AFTERNOON_EXPANSION'     // 13:15 - 14:00 IST
  | 'T6_LATE_DAY';               // 14:00 - 15:05 IST

export type BrainMacroRegimeKind =
  | 'R1_BULL_EXPANSION'          // Fleet Breadth > 60%, A/D > 1.8
  | 'R2_BEAR_DISTRIBUTION'       // Fleet Breadth < 35%, A/D < 0.6
  | 'R3_RANGE_EQUILIBRIUM'       // Fleet Breadth 35-60%, neutral index
  | 'R4_VOLATILITY_SHOCK';       // ATR/P > 4.5% or extreme candle gap

export type AssetDynamicsKind =
  | 'A1_PERSISTENT_SUPER_TREND'  // Hurst >= 0.58, Squeeze OFF, MTF >= 50
  | 'A2_MEAN_REVERTING'          // Hurst < 0.48, OU |Z| > 1.2
  | 'A3_RANDOM_WALK_CHOP';       // 0.48 <= Hurst < 0.58, Squeeze ON

export type PriceLocationKind =
  | 'P1_AT_EQUILIBRIUM'          // Within +/-0.5 sigma / +/-0.5 ATR of VWAP
  | 'P2_OVERBOUGHT_EXTENDED'     // > +1.0 sigma or > +0.85 ATR above VWAP
  | 'P3_OVERSOLD_COMPRESSED';    // < -1.0 sigma or < -1.0 ATR below VWAP

export type StrategyScenarioId = `SC-${string}`;

export interface IntradayDailyPnlContext {
  dailyRealizedPnl: number;       // Net closed P&L realized today (INR)
  dailyUnrealizedPnl: number;     // Current open positions MTM P&L (INR)
  dailyNetPnl: number;           // dailyRealizedPnl + dailyUnrealizedPnl
  dailyWinsCount: number;         // Winning trades closed today
  dailyLossCount: number;         // Stop-loss trades closed today
  dailyTradesCount: number;       // Total trades closed today
  activePositionCount: number;    // Open positions currently active
  targetProfitGoal?: number;      // Target goal (defaults to ₹100.00/day)
}

export interface TrancheTargetConfig {
  tranche1Atr: number;
  tranche2Atr: number;
  guaranteedLockAtr: number;
  runnerMode: 'CHANDELIER' | 'TIGHT_RATCHET' | 'AGGRESSIVE_TRAIL';
}

export interface BrainDirective {
  scenarioId: StrategyScenarioId;
  scenarioName: string;
  sessionPhase: SessionPhaseKind;
  macroRegime: BrainMacroRegimeKind;
  assetDynamics: AssetDynamicsKind;
  priceLocation: PriceLocationKind;
  sectorAlignment: 'LEADER' | 'NEUTRAL' | 'LAGGARD';
  actionPermission: 'PERMITTED' | 'BLOCKED_STAND_ASIDE' | 'EXIT_ONLY' | 'BLOCKED_DAILY_PROFIT_LOCKED' | 'BLOCKED_DAILY_LOSS_GUARD';
  dailyPnlRegime?: 'TARGET_PURSUIT' | 'PROFIT_LOCKED' | 'DEFENSIVE_RECOVERY' | 'LOSS_GUARD_HALT';
  allowedStrategies: PilotStrategyKind[];
  preferredStrategy: PilotStrategyKind | null;
  marginMultiplier: number;           // Up to 4.5x under SEBI 5x MIS
  riskBudgetMultiplier: number;       // 0.0 to 1.25x
  minAciThreshold: number;            // Minimum ACI score hurdle (e.g. 50-70, or 999 when blocked)
  maxVwapExtensionAtr: number;        // Maximum distance above VWAP before breakout is deemed an exhaustion trap
  requireGreenOnDay: boolean;         // Must price be >= dayOpen for long entries?
  downsizingAllowed: boolean;         // Graceful downsizing if cash is tight
  trancheTargets: TrancheTargetConfig;
  maxStagnancyMinutes: number;        // Dead trade exit limit (minutes)
  rationale: string;
}

// ============================================================================
// 2. SCENARIO CLASSIFIER & RESOLVER
// ============================================================================

/**
 * Maps the 4 orthogonal dimensions (6 Phases * 4 Regimes * 3 Dynamics * 3 Locations = 216)
 * to an integer index 1..216 and formats as SC-001..SC-216.
 */
export function calculateScenarioNumericIndex(
  phase: SessionPhaseKind,
  macro: BrainMacroRegimeKind,
  assetDyn: AssetDynamicsKind,
  priceLoc: PriceLocationKind
): number {
  const phaseIdx = {
    T1_OPENING_DISCOVERY: 0,
    T2_MORNING_EXPANSION: 1,
    T3_MID_MORNING: 2,
    T4_MIDDAY_CHOP: 3,
    T5_AFTERNOON_EXPANSION: 4,
    T6_LATE_DAY: 5,
  }[phase];

  const macroIdx = {
    R1_BULL_EXPANSION: 0,
    R2_BEAR_DISTRIBUTION: 1,
    R3_RANGE_EQUILIBRIUM: 2,
    R4_VOLATILITY_SHOCK: 3,
  }[macro];

  const assetIdx = {
    A1_PERSISTENT_SUPER_TREND: 0,
    A2_MEAN_REVERTING: 1,
    A3_RANDOM_WALK_CHOP: 2,
  }[assetDyn];

  const priceIdx = {
    P1_AT_EQUILIBRIUM: 0,
    P2_OVERBOUGHT_EXTENDED: 1,
    P3_OVERSOLD_COMPRESSED: 2,
  }[priceLoc];

  // 6 * 4 * 3 * 3 = 216 combinations
  const rawIndex =
    phaseIdx * (4 * 3 * 3) +
    macroIdx * (3 * 3) +
    assetIdx * 3 +
    priceIdx +
    1;

  return rawIndex;
}

export function formatScenarioId(index: number): StrategyScenarioId {
  return `SC-${String(index).padStart(3, '0')}`;
}

// ============================================================================
// 3. MASTER BRAIN DIRECTIVE GENERATOR
// ============================================================================

export interface MasterBrainInputs {
  istMinutes: number;                 // Minutes from midnight IST (e.g. 555 for 09:15)
  marketPrice: number;
  dayOpenPrice: number;
  vwap: number;
  atr: number;
  hurst: number;
  squeezeStatus: 'SQUEEZE_ON' | 'SQUEEZE_OFF' | 'NO_SQUEEZE';
  ouZScore: number;
  macroBreadth: FleetMacroBreadthResult;
  sectorRank: number;                 // 1 = top sector, 6 = bottom sector
  sectorAvgChange: number;
  sectorAdvanceRatio: number;
  mtfConfluence?: MultiTimeframeConfluenceResult;
  vwapBands?: VWAPBands;
  isSystemicShock?: boolean;
  intradayPnlContext?: IntradayDailyPnlContext;
}

/**
 * Authoritative Master Brain evaluation engine.
 * Synthesizes all quant inputs and derives the optimal scenario directive.
 */
export function evaluateStrategyMasterBrain(inputs: MasterBrainInputs): BrainDirective {
  const {
    istMinutes,
    marketPrice,
    dayOpenPrice,
    vwap,
    atr,
    hurst,
    squeezeStatus,
    ouZScore,
    macroBreadth,
    sectorRank,
    sectorAvgChange,
    sectorAdvanceRatio,
    mtfConfluence,
    vwapBands,
    isSystemicShock,
    intradayPnlContext,
  } = inputs;

  // 1. Determine Session Timing Phase
  let phase: SessionPhaseKind = 'T4_MIDDAY_CHOP';
  if (istMinutes < 9 * 60 + 40) {
    phase = 'T1_OPENING_DISCOVERY';
  } else if (istMinutes < 10 * 60 + 30) {
    phase = 'T2_MORNING_EXPANSION';
  } else if (istMinutes < 11 * 60 + 30) {
    phase = 'T3_MID_MORNING';
  } else if (istMinutes < 13 * 60 + 15) {
    phase = 'T4_MIDDAY_CHOP';
  } else if (istMinutes < 14 * 60 + 0) {
    phase = 'T5_AFTERNOON_EXPANSION';
  } else {
    phase = 'T6_LATE_DAY';
  }

  // 2. Determine Macro Market Regime
  let macro: BrainMacroRegimeKind = 'R3_RANGE_EQUILIBRIUM';
  const advanceRatio = macroBreadth.totalAssetsEvaluated > 0
    ? macroBreadth.advancingAssetsCount / macroBreadth.totalAssetsEvaluated
    : 0.5;
  if (isSystemicShock || (atr > 0 && marketPrice > 0 && atr / marketPrice > 0.045)) {
    macro = 'R4_VOLATILITY_SHOCK';
  } else if (macroBreadth.directionalPermission === 'LONG_ONLY' || advanceRatio >= 0.65) {
    macro = 'R1_BULL_EXPANSION';
  } else if (macroBreadth.directionalPermission === 'SHORT_ONLY' || advanceRatio <= 0.35) {
    macro = 'R2_BEAR_DISTRIBUTION';
  } else {
    macro = 'R3_RANGE_EQUILIBRIUM';
  }

  // 3. Determine Asset Time-Series & Fractal Dynamics
  let assetDyn: AssetDynamicsKind = 'A3_RANDOM_WALK_CHOP';
  const isSuperTrendHurst = hurst >= 0.58;
  const isSqueezeRelease = squeezeStatus === 'SQUEEZE_OFF';
  const isMtfAligned = !mtfConfluence || (mtfConfluence.macroTrendDirection !== 'BEARISH' && mtfConfluence.alignmentScore >= 45);

  if (isSuperTrendHurst && (isSqueezeRelease || isMtfAligned)) {
    assetDyn = 'A1_PERSISTENT_SUPER_TREND';
  } else if (hurst < 0.48 || Math.abs(ouZScore) > 1.2 || (vwapBands && Math.abs(vwapBands.zScore) > 1.5)) {
    assetDyn = 'A2_MEAN_REVERTING';
  } else {
    assetDyn = 'A3_RANDOM_WALK_CHOP';
  }

  // 4. Determine Price vs VWAP Location
  let priceLoc: PriceLocationKind = 'P1_AT_EQUILIBRIUM';
  const extAtr = vwap > 0 && atr > 0 ? (marketPrice - vwap) / atr : 0;
  const zScore = vwapBands?.zScore ?? (vwap > 0 && atr > 0 ? (marketPrice - vwap) / (atr * 0.7) : 0);

  if (extAtr > 0.85 || zScore > 1.2) {
    priceLoc = 'P2_OVERBOUGHT_EXTENDED';
  } else if (extAtr < -0.85 || zScore < -1.2) {
    priceLoc = 'P3_OVERSOLD_COMPRESSED';
  } else {
    priceLoc = 'P1_AT_EQUILIBRIUM';
  }

  // 5. Determine Sector Alignment
  let sectorAlignment: 'LEADER' | 'NEUTRAL' | 'LAGGARD' = 'NEUTRAL';
  if (sectorRank <= 2 && sectorAvgChange > 0 && sectorAdvanceRatio >= 0.50) {
    sectorAlignment = 'LEADER';
  } else if (sectorRank >= 5 || sectorAvgChange < -0.15 || sectorAdvanceRatio < 0.40) {
    sectorAlignment = 'LAGGARD';
  }

  // 6. Compute Scenario Index and ID
  const scenarioIndex = calculateScenarioNumericIndex(phase, macro, assetDyn, priceLoc);
  const scenarioId = formatScenarioId(scenarioIndex);

  // 7. Base Scenario Directive Synthesis
  const baseDirective = buildBrainDirective(
    scenarioId,
    phase,
    macro,
    assetDyn,
    priceLoc,
    sectorAlignment,
    extAtr,
    marketPrice,
    dayOpenPrice
  );

  if (intradayPnlContext) {
    return applyIntradayPnlSupervisor(baseDirective, intradayPnlContext);
  }

  return baseDirective;
}

/**
 * Continuously supervises the desk's intraday P&L trajectory to achieve ~₹100/day
 * while making defensive micro-adjustments to strictly curtail drawdown.
 */
export function applyIntradayPnlSupervisor(
  baseDirective: BrainDirective,
  pnlCtx: IntradayDailyPnlContext
): BrainDirective {
  const targetProfitGoal = pnlCtx.targetProfitGoal ?? 100.0;
  const dailyNetPnl = pnlCtx.dailyNetPnl;
  const dailyLossCount = pnlCtx.dailyLossCount;
  const activePositionCount = pnlCtx.activePositionCount;

  // RULE A: Daily Loss Guard Circuit Breaker (Strict Capital Preservation)
  // If 2 stop losses have occurred today, or daily loss reaches ₹350 (0.9% NAV limit),
  // halt immediately to prevent disaster cascading days like Day 3 (-₹894.81).
  if (dailyLossCount >= 2 || dailyNetPnl <= -350) {
    return {
      ...baseDirective,
      actionPermission: 'BLOCKED_DAILY_LOSS_GUARD',
      dailyPnlRegime: 'LOSS_GUARD_HALT',
      allowedStrategies: [],
      preferredStrategy: null,
      marginMultiplier: 1.0,
      riskBudgetMultiplier: 0.0,
      minAciThreshold: 999,
      rationale: `[Daily Loss Guard Tripped] ${dailyLossCount} stop losses today (Net P&L: ₹${dailyNetPnl.toFixed(2)}). Capital preservation halt active for the session.`,
    };
  }

  // RULE B: Daily Profit Vault & Surplus Harvester Mode
  // When daily net P&L has reached the daily target (>= ₹100):
  // 1. If daily profit is tight to target (< ₹150) and 0 positions are open, lock capital in cash!
  // 2. If market momentum provides strong surplus (>= ₹150), allow prime institutional sniper trades
  //    (ACI >= 67) with halved risk budget (0.50x) to compound the daily win!
  if (dailyNetPnl >= targetProfitGoal) {
    if (dailyNetPnl < targetProfitGoal + 50 && activePositionCount === 0) {
      return {
        ...baseDirective,
        actionPermission: 'BLOCKED_DAILY_PROFIT_LOCKED',
        dailyPnlRegime: 'PROFIT_LOCKED',
        allowedStrategies: [],
        preferredStrategy: null,
        marginMultiplier: 1.0,
        riskBudgetMultiplier: 0.0,
        minAciThreshold: 999,
        rationale: `[Daily Profit Goal Locked] Banked +₹${dailyNetPnl.toFixed(2)} (>= ₹${targetProfitGoal.toFixed(2)} target). Capital locked in cash to eliminate giveback.`,
      };
    }

    const modifiedDirective: BrainDirective = {
      ...baseDirective,
      dailyPnlRegime: 'PROFIT_LOCKED',
      riskBudgetMultiplier: Math.min(baseDirective.riskBudgetMultiplier, 0.50),
      marginMultiplier: Math.min(baseDirective.marginMultiplier, 3.5),
      minAciThreshold: Math.max(baseDirective.minAciThreshold, 67),
      trancheTargets: {
        ...baseDirective.trancheTargets,
        tranche1Atr: 1.15,
        runnerMode: 'TIGHT_RATCHET',
      },
      rationale: `${baseDirective.rationale} [Profit Vault Active: +₹${dailyNetPnl.toFixed(2)} banked (Floor ₹${targetProfitGoal.toFixed(2)}). Trading surplus with reduced risk].`,
    };
    return modifiedDirective;
  }

  // If baseDirective is already blocked, retain it
  if (baseDirective.actionPermission !== 'PERMITTED') {
    return baseDirective;
  }

  const modifiedDirective: BrainDirective = {
    ...baseDirective,
    trancheTargets: { ...baseDirective.trancheTargets },
  };

  // RULE C: Defensive Recovery Mode (1 Stop Loss)
  // One trade has stopped out today. Micro-adjust to reduce subsequent risk:
  if (dailyLossCount === 1) {
    modifiedDirective.dailyPnlRegime = 'DEFENSIVE_RECOVERY';
    modifiedDirective.riskBudgetMultiplier = Math.min(baseDirective.riskBudgetMultiplier, 0.50); // Halve risk budget
    modifiedDirective.marginMultiplier = Math.min(baseDirective.marginMultiplier, 3.5); // Allow sufficient buying power for TCA hurdle
    modifiedDirective.minAciThreshold = Math.max(baseDirective.minAciThreshold, 65); // Require high conviction
    modifiedDirective.trancheTargets.tranche1Atr = 1.10; // Take quick profit
    modifiedDirective.trancheTargets.runnerMode = 'TIGHT_RATCHET';
    modifiedDirective.rationale += ` [Defensive Recovery: 1 loss today, risk halved, ACI hurdle 65+].`;
    return modifiedDirective;
  }

  // RULE D: Near Goal Profit Protection Mode (P&L >= 75% of target)
  if (dailyNetPnl >= targetProfitGoal * 0.75 && dailyNetPnl < targetProfitGoal) {
    const remaining = targetProfitGoal - dailyNetPnl;
    modifiedDirective.dailyPnlRegime = 'TARGET_PURSUIT';
    modifiedDirective.riskBudgetMultiplier = Math.min(baseDirective.riskBudgetMultiplier, 0.60);
    modifiedDirective.minAciThreshold = Math.max(baseDirective.minAciThreshold, 66);
    modifiedDirective.trancheTargets.tranche1Atr = 1.05; // Harvest the remaining ₹25-30 quickly
    modifiedDirective.trancheTargets.runnerMode = 'TIGHT_RATCHET';
    modifiedDirective.rationale += ` [Near Goal Protection: +₹${dailyNetPnl.toFixed(2)} banked, ₹${remaining.toFixed(2)} remaining to ₹${targetProfitGoal.toFixed(2)}].`;
    return modifiedDirective;
  }

  // RULE E: Systematic Pursuit Mode (0 to 75% of target)
  if (dailyNetPnl >= 0 && dailyNetPnl < targetProfitGoal * 0.75) {
    modifiedDirective.dailyPnlRegime = 'TARGET_PURSUIT';
    const remaining = targetProfitGoal - dailyNetPnl;
    if (remaining <= 50) {
      modifiedDirective.trancheTargets.tranche1Atr = Math.min(baseDirective.trancheTargets.tranche1Atr, 1.15);
      modifiedDirective.trancheTargets.guaranteedLockAtr = 0.40;
    }
  }

  return modifiedDirective;
}

/**
 * Builds the comprehensive directive for any of the 216 scenario permutations.
 */
function buildBrainDirective(
  scenarioId: StrategyScenarioId,
  phase: SessionPhaseKind,
  macro: BrainMacroRegimeKind,
  assetDyn: AssetDynamicsKind,
  priceLoc: PriceLocationKind,
  sectorAlignment: 'LEADER' | 'NEUTRAL' | 'LAGGARD',
  extAtr: number,
  marketPrice: number,
  dayOpenPrice: number
): BrainDirective {
  // --------------------------------------------------------------------------
  // RULE CLASS 1: OPENING AUCTION DISCOVERY (09:15 - 09:35 IST) [SC-001 to SC-036]
  // --------------------------------------------------------------------------
  if (phase === 'T1_OPENING_DISCOVERY') {
    return {
      scenarioId,
      scenarioName: 'OPENING_AUCTION_PRICE_DISCOVERY_CURFEW',
      sessionPhase: phase,
      macroRegime: macro,
      assetDynamics: assetDyn,
      priceLocation: priceLoc,
      sectorAlignment,
      actionPermission: 'BLOCKED_STAND_ASIDE',
      allowedStrategies: [],
      preferredStrategy: null,
      marginMultiplier: 1.0,
      riskBudgetMultiplier: 0.0,
      minAciThreshold: 999,
      maxVwapExtensionAtr: 0.50,
      requireGreenOnDay: true,
      downsizingAllowed: false,
      trancheTargets: {
        tranche1Atr: 1.25,
        tranche2Atr: 1.80,
        guaranteedLockAtr: 0.35,
        runnerMode: 'TIGHT_RATCHET',
      },
      maxStagnancyMinutes: 60,
      rationale: 'Opening discovery window (09:15-09:35 IST): High auction uncrossing whipsaws and retail stop runs. Preserving 100% cash in hand.',
    };
  }

  // --------------------------------------------------------------------------
  // RULE CLASS 6: LATE-DAY LIQUIDATION & HARD CURFEW (14:00 - 15:05 IST) [SC-181 to SC-216]
  // --------------------------------------------------------------------------
  if (phase === 'T6_LATE_DAY') {
    return {
      scenarioId,
      scenarioName: 'LATE_DAY_LIQUIDATION_AND_CUTOFF',
      sessionPhase: phase,
      macroRegime: macro,
      assetDynamics: assetDyn,
      priceLocation: priceLoc,
      sectorAlignment,
      actionPermission: 'EXIT_ONLY',
      allowedStrategies: [],
      preferredStrategy: null,
      marginMultiplier: 1.0,
      riskBudgetMultiplier: 0.0,
      minAciThreshold: 999,
      maxVwapExtensionAtr: 0.50,
      requireGreenOnDay: true,
      downsizingAllowed: false,
      trancheTargets: {
        tranche1Atr: 1.00,
        tranche2Atr: 1.50,
        guaranteedLockAtr: 0.35,
        runnerMode: 'AGGRESSIVE_TRAIL',
      },
      maxStagnancyMinutes: 30,
      rationale: 'Late-day liquidation phase (after 14:00 IST): No new entries allowed. Tightening trailing profit locks toward mandatory 15:05 auto-square-off.',
    };
  }

  // --------------------------------------------------------------------------
  // RULE CLASS 4: VOLATILITY SHOCK / MACRO DISTRIBUTION DEFENSE
  // --------------------------------------------------------------------------
  if (macro === 'R4_VOLATILITY_SHOCK') {
    return {
      scenarioId,
      scenarioName: 'VOLATILITY_SHOCK_PROTECTION',
      sessionPhase: phase,
      macroRegime: macro,
      assetDynamics: assetDyn,
      priceLocation: priceLoc,
      sectorAlignment,
      actionPermission: 'BLOCKED_STAND_ASIDE',
      allowedStrategies: [],
      preferredStrategy: null,
      marginMultiplier: 1.0,
      riskBudgetMultiplier: 0.0,
      minAciThreshold: 999,
      maxVwapExtensionAtr: 0.50,
      requireGreenOnDay: true,
      downsizingAllowed: false,
      trancheTargets: {
        tranche1Atr: 1.00,
        tranche2Atr: 1.50,
        guaranteedLockAtr: 0.20,
        runnerMode: 'TIGHT_RATCHET',
      },
      maxStagnancyMinutes: 30,
      rationale: 'Volatility shock / flash gap detected. Trading frozen to shield capital against severe market dislocations.',
    };
  }

  // --------------------------------------------------------------------------
  // OVERBOUGHT EXHAUSTION TRAP DEFENSE (P2 in Morning / Mid-morning)
  // Eliminates chasing spikes like COFORGE on Sep 10
  // --------------------------------------------------------------------------
  if (priceLoc === 'P2_OVERBOUGHT_EXTENDED' && (phase === 'T2_MORNING_EXPANSION' || phase === 'T3_MID_MORNING')) {
    return {
      scenarioId,
      scenarioName: 'OVERBOUGHT_EXPANSION_EXHAUSTION_TRAP',
      sessionPhase: phase,
      macroRegime: macro,
      assetDynamics: assetDyn,
      priceLocation: priceLoc,
      sectorAlignment,
      actionPermission: 'BLOCKED_STAND_ASIDE',
      allowedStrategies: [],
      preferredStrategy: null,
      marginMultiplier: 1.0,
      riskBudgetMultiplier: 0.0,
      minAciThreshold: 999,
      maxVwapExtensionAtr: 0.85,
      requireGreenOnDay: true,
      downsizingAllowed: false,
      trancheTargets: {
        tranche1Atr: 1.25,
        tranche2Atr: 1.80,
        guaranteedLockAtr: 0.35,
        runnerMode: 'TIGHT_RATCHET',
      },
      maxStagnancyMinutes: 60,
      rationale: `Price is over-extended (${extAtr.toFixed(2)} ATR above VWAP). Rejecting chase to avoid buying the top of the morning impulse.`,
    };
  }

  // --------------------------------------------------------------------------
  // SECTOR LAGGARD DEFENSE
  // Blocks trend buying in collapsing sectors (e.g. Metals or Pharma on bad days)
  // --------------------------------------------------------------------------
  if (sectorAlignment === 'LAGGARD' && assetDyn !== 'A2_MEAN_REVERTING') {
    return {
      scenarioId,
      scenarioName: 'SECTOR_LAGGARD_HEADWIND_DEFENSE',
      sessionPhase: phase,
      macroRegime: macro,
      assetDynamics: assetDyn,
      priceLocation: priceLoc,
      sectorAlignment,
      actionPermission: 'BLOCKED_STAND_ASIDE',
      allowedStrategies: [],
      preferredStrategy: null,
      marginMultiplier: 1.0,
      riskBudgetMultiplier: 0.0,
      minAciThreshold: 999,
      maxVwapExtensionAtr: 0.85,
      requireGreenOnDay: true,
      downsizingAllowed: false,
      trancheTargets: {
        tranche1Atr: 1.25,
        tranche2Atr: 1.80,
        guaranteedLockAtr: 0.35,
        runnerMode: 'TIGHT_RATCHET',
      },
      maxStagnancyMinutes: 60,
      rationale: 'Asset belongs to a lagging sector experiencing net institutional outflow. Long breakout prohibited.',
    };
  }

  // --------------------------------------------------------------------------
  // RULE CLASS 2: MORNING PRIME EXPANSION (09:35 - 10:30 IST) [SC-037 to SC-072]
  // --------------------------------------------------------------------------
  if (phase === 'T2_MORNING_EXPANSION') {
    if (assetDyn === 'A1_PERSISTENT_SUPER_TREND' && priceLoc === 'P1_AT_EQUILIBRIUM') {
      const isLeader = sectorAlignment === 'LEADER';
      return {
        scenarioId,
        scenarioName: isLeader
          ? 'MORNING_SUPER_TREND_SECTOR_LEADER_BREAKOUT'
          : 'MORNING_SUPER_TREND_EQUILIBRIUM_BREAKOUT',
        sessionPhase: phase,
        macroRegime: macro,
        assetDynamics: assetDyn,
        priceLocation: priceLoc,
        sectorAlignment,
        actionPermission: 'PERMITTED',
        allowedStrategies: ['Hurst Trend Rider', 'Candle Price Action'],
        preferredStrategy: 'Hurst Trend Rider',
        marginMultiplier: isLeader ? 4.5 : 3.5, // 4.5x dynamic buying power under SEBI 5x MIS
        riskBudgetMultiplier: isLeader ? 1.25 : 1.0,
        minAciThreshold: isLeader ? 52 : 55,
        maxVwapExtensionAtr: 0.85,
        requireGreenOnDay: true,
        downsizingAllowed: true, // Graceful downsizing to never miss winners
        trancheTargets: {
          tranche1Atr: 1.40,
          tranche2Atr: 2.10,
          guaranteedLockAtr: 0.35,
          runnerMode: 'CHANDELIER',
        },
        maxStagnancyMinutes: 90,
        rationale: 'Prime institutional morning expansion: persistent super-trend near VWAP with green-on-day alignment. Deploying high conviction with multi-tranche harvesting.',
      };
    }

    if (assetDyn === 'A2_MEAN_REVERTING' && priceLoc === 'P3_OVERSOLD_COMPRESSED') {
      return {
        scenarioId,
        scenarioName: 'MORNING_OVERSOLD_ABSORPTION_BOUNCE',
        sessionPhase: phase,
        macroRegime: macro,
        assetDynamics: assetDyn,
        priceLocation: priceLoc,
        sectorAlignment,
        actionPermission: 'PERMITTED',
        allowedStrategies: ['VWAP Band Mean Reversion', 'Value Accumulator', 'OU Mean Reversion'],
        preferredStrategy: 'VWAP Band Mean Reversion',
        marginMultiplier: 3.5,
        riskBudgetMultiplier: 1.0,
        minAciThreshold: 55,
        maxVwapExtensionAtr: 0.50,
        requireGreenOnDay: false, // Mean reversions buy oversold dips
        downsizingAllowed: true,
        trancheTargets: {
          tranche1Atr: 1.25,
          tranche2Atr: 1.80,
          guaranteedLockAtr: 0.35,
          runnerMode: 'TIGHT_RATCHET',
        },
        maxStagnancyMinutes: 90,
        rationale: 'Morning oversold absorption bounce at lower VWAP band. Targeting mean reversion to VWAP equilibrium.',
      };
    }

    // Default Random Walk / Chop in Morning: Stand aside
    return {
      scenarioId,
      scenarioName: 'MORNING_CHOP_STAND_ASIDE',
      sessionPhase: phase,
      macroRegime: macro,
      assetDynamics: assetDyn,
      priceLocation: priceLoc,
      sectorAlignment,
      actionPermission: 'BLOCKED_STAND_ASIDE',
      allowedStrategies: [],
      preferredStrategy: null,
      marginMultiplier: 1.0,
      riskBudgetMultiplier: 0.0,
      minAciThreshold: 999,
      maxVwapExtensionAtr: 0.85,
      requireGreenOnDay: true,
      downsizingAllowed: false,
      trancheTargets: {
        tranche1Atr: 1.25,
        tranche2Atr: 1.80,
        guaranteedLockAtr: 0.35,
        runnerMode: 'TIGHT_RATCHET',
      },
      maxStagnancyMinutes: 60,
      rationale: 'Asset lacks directional persistence (Hurst < 0.58) and shows no oversold deviation. Preserving capital.',
    };
  }

  // --------------------------------------------------------------------------
  // RULE CLASS 3: MID-MORNING CONTINUATION (10:30 - 11:30 IST) [SC-073 to SC-108]
  // --------------------------------------------------------------------------
  if (phase === 'T3_MID_MORNING') {
    if (assetDyn === 'A1_PERSISTENT_SUPER_TREND' && priceLoc === 'P1_AT_EQUILIBRIUM') {
      return {
        scenarioId,
        scenarioName: 'MID_MORNING_TREND_CONTINUATION',
        sessionPhase: phase,
        macroRegime: macro,
        assetDynamics: assetDyn,
        priceLocation: priceLoc,
        sectorAlignment,
        actionPermission: 'PERMITTED',
        allowedStrategies: ['Candle Price Action', 'Hurst Trend Rider'],
        preferredStrategy: 'Candle Price Action',
        marginMultiplier: 3.5,
        riskBudgetMultiplier: 1.0,
        minAciThreshold: 60,
        maxVwapExtensionAtr: 0.85,
        requireGreenOnDay: true,
        downsizingAllowed: true,
        trancheTargets: {
          tranche1Atr: 1.30,
          tranche2Atr: 2.00,
          guaranteedLockAtr: 0.35,
          runnerMode: 'CHANDELIER',
        },
        maxStagnancyMinutes: 90,
        rationale: 'Mid-morning continuation breakout at VWAP. Requiring candlestick pinbar/engulfing confirmation.',
      };
    }

    if (assetDyn === 'A2_MEAN_REVERTING' && priceLoc === 'P3_OVERSOLD_COMPRESSED') {
      return {
        scenarioId,
        scenarioName: 'MID_MORNING_VWAP_MEAN_REVERSION',
        sessionPhase: phase,
        macroRegime: macro,
        assetDynamics: assetDyn,
        priceLocation: priceLoc,
        sectorAlignment,
        actionPermission: 'PERMITTED',
        allowedStrategies: ['VWAP Band Mean Reversion', 'Value Accumulator', 'OU Mean Reversion'],
        preferredStrategy: 'VWAP Band Mean Reversion',
        marginMultiplier: 3.5,
        riskBudgetMultiplier: 1.0,
        minAciThreshold: 55,
        maxVwapExtensionAtr: 0.50,
        requireGreenOnDay: false,
        downsizingAllowed: true,
        trancheTargets: {
          tranche1Atr: 1.25,
          tranche2Atr: 1.80,
          guaranteedLockAtr: 0.35,
          runnerMode: 'TIGHT_RATCHET',
        },
        maxStagnancyMinutes: 90,
        rationale: 'Mid-morning oversold bounce from lower band toward VWAP equilibrium (e.g. BAJFINANCE setup).',
      };
    }

    return {
      scenarioId,
      scenarioName: 'MID_MORNING_CONSOLIDATION_STAND_ASIDE',
      sessionPhase: phase,
      macroRegime: macro,
      assetDynamics: assetDyn,
      priceLocation: priceLoc,
      sectorAlignment,
      actionPermission: 'BLOCKED_STAND_ASIDE',
      allowedStrategies: [],
      preferredStrategy: null,
      marginMultiplier: 1.0,
      riskBudgetMultiplier: 0.0,
      minAciThreshold: 999,
      maxVwapExtensionAtr: 0.85,
      requireGreenOnDay: true,
      downsizingAllowed: false,
      trancheTargets: {
        tranche1Atr: 1.25,
        tranche2Atr: 1.80,
        guaranteedLockAtr: 0.35,
        runnerMode: 'TIGHT_RATCHET',
      },
      maxStagnancyMinutes: 60,
      rationale: 'Mid-morning consolidation: no high-probability trend or band bounce setup present.',
    };
  }

  // --------------------------------------------------------------------------
  // RULE CLASS 4: MIDDAY EQUILIBRIUM & CHOP (11:30 - 13:15 IST) [SC-109 to SC-144]
  // Strict prohibition of trend breakout chasing; activation of VWAP Band Mean Reversion
  // --------------------------------------------------------------------------
  if (phase === 'T4_MIDDAY_CHOP') {
    if (priceLoc === 'P3_OVERSOLD_COMPRESSED' && assetDyn === 'A2_MEAN_REVERTING') {
      return {
        scenarioId,
        scenarioName: 'MIDDAY_OVERSOLD_VWAP_BAND_BOUNCE',
        sessionPhase: phase,
        macroRegime: macro,
        assetDynamics: assetDyn,
        priceLocation: priceLoc,
        sectorAlignment,
        actionPermission: 'PERMITTED',
        allowedStrategies: ['VWAP Band Mean Reversion', 'Value Accumulator', 'OU Mean Reversion'],
        preferredStrategy: 'VWAP Band Mean Reversion',
        marginMultiplier: 3.5,
        riskBudgetMultiplier: 1.0,
        minAciThreshold: 55,
        maxVwapExtensionAtr: 0.40,
        requireGreenOnDay: false, // Buying oversold dip
        downsizingAllowed: true,
        trancheTargets: {
          tranche1Atr: 1.10,
          tranche2Atr: 1.60,
          guaranteedLockAtr: 0.35,
          runnerMode: 'TIGHT_RATCHET',
        },
        maxStagnancyMinutes: 75,
        rationale: 'Midday European pre-open oversold absorption at -1.5 sigma VWAP band. Targeting mean reversion to VWAP.',
      };
    }

    // All trend breakouts are strictly banned in midday chop!
    return {
      scenarioId,
      scenarioName: 'MIDDAY_CHOP_BREAKOUT_PROHIBITION',
      sessionPhase: phase,
      macroRegime: macro,
      assetDynamics: assetDyn,
      priceLocation: priceLoc,
      sectorAlignment,
      actionPermission: 'BLOCKED_STAND_ASIDE',
      allowedStrategies: [],
      preferredStrategy: null,
      marginMultiplier: 1.0,
      riskBudgetMultiplier: 0.0,
      minAciThreshold: 999,
      maxVwapExtensionAtr: 0.50,
      requireGreenOnDay: true,
      downsizingAllowed: false,
      trancheTargets: {
        tranche1Atr: 1.10,
        tranche2Atr: 1.60,
        guaranteedLockAtr: 0.35,
        runnerMode: 'TIGHT_RATCHET',
      },
      maxStagnancyMinutes: 60,
      rationale: 'Midday consolidation window (11:30-13:15 IST): Trend breakout failure rate > 75%. Standing aside in cash.',
    };
  }

  // --------------------------------------------------------------------------
  // RULE CLASS 5: AFTERNOON EXPANSION & POWER HOUR (13:15 - 14:00 IST) [SC-145 to SC-180]
  // --------------------------------------------------------------------------
  if (phase === 'T5_AFTERNOON_EXPANSION') {
    if (assetDyn === 'A1_PERSISTENT_SUPER_TREND' && priceLoc === 'P1_AT_EQUILIBRIUM') {
      return {
        scenarioId,
        scenarioName: 'AFTERNOON_SURGE_CONTINUATION',
        sessionPhase: phase,
        macroRegime: macro,
        assetDynamics: assetDyn,
        priceLocation: priceLoc,
        sectorAlignment,
        actionPermission: 'PERMITTED',
        allowedStrategies: ['Candle Price Action', 'Hurst Trend Rider', 'Momentum Scalper'],
        preferredStrategy: 'Candle Price Action',
        marginMultiplier: 4.5,
        riskBudgetMultiplier: 1.15,
        minAciThreshold: 58,
        maxVwapExtensionAtr: 1.00,
        requireGreenOnDay: true,
        downsizingAllowed: true,
        trancheTargets: {
          tranche1Atr: 1.25,
          tranche2Atr: 1.80,
          guaranteedLockAtr: 0.35,
          runnerMode: 'TIGHT_RATCHET',
        },
        maxStagnancyMinutes: 45, // Tighter stagnancy in afternoon
        rationale: 'Afternoon European open momentum continuation. High conviction with tight trailing stop protection.',
      };
    }

    if (priceLoc === 'P3_OVERSOLD_COMPRESSED' && assetDyn === 'A2_MEAN_REVERTING') {
      return {
        scenarioId,
        scenarioName: 'AFTERNOON_OVERSOLD_REVERSION',
        sessionPhase: phase,
        macroRegime: macro,
        assetDynamics: assetDyn,
        priceLocation: priceLoc,
        sectorAlignment,
        actionPermission: 'PERMITTED',
        allowedStrategies: ['VWAP Band Mean Reversion', 'Value Accumulator', 'OU Mean Reversion'],
        preferredStrategy: 'VWAP Band Mean Reversion',
        marginMultiplier: 3.5,
        riskBudgetMultiplier: 1.0,
        minAciThreshold: 56,
        maxVwapExtensionAtr: 0.50,
        requireGreenOnDay: false,
        downsizingAllowed: true,
        trancheTargets: {
          tranche1Atr: 1.10,
          tranche2Atr: 1.60,
          guaranteedLockAtr: 0.35,
          runnerMode: 'TIGHT_RATCHET',
        },
        maxStagnancyMinutes: 45,
        rationale: 'Afternoon oversold bounce at lower VWAP band (e.g. BHEL, NMDC setups). Quick reversion harvest.',
      };
    }

    return {
      scenarioId,
      scenarioName: 'AFTERNOON_CHOP_STAND_ASIDE',
      sessionPhase: phase,
      macroRegime: macro,
      assetDynamics: assetDyn,
      priceLocation: priceLoc,
      sectorAlignment,
      actionPermission: 'BLOCKED_STAND_ASIDE',
      allowedStrategies: [],
      preferredStrategy: null,
      marginMultiplier: 1.0,
      riskBudgetMultiplier: 0.0,
      minAciThreshold: 999,
      maxVwapExtensionAtr: 0.85,
      requireGreenOnDay: true,
      downsizingAllowed: false,
      trancheTargets: {
        tranche1Atr: 1.10,
        tranche2Atr: 1.60,
        guaranteedLockAtr: 0.35,
        runnerMode: 'TIGHT_RATCHET',
      },
      maxStagnancyMinutes: 45,
      rationale: 'Afternoon window: Asset lacks persistent momentum or oversold band deviation. Standing aside in cash.',
    };
  }

  // Fallback safe directive
  return {
    scenarioId,
    scenarioName: 'GENERIC_DEFENSIVE_STAND_ASIDE',
    sessionPhase: phase,
    macroRegime: macro,
    assetDynamics: assetDyn,
    priceLocation: priceLoc,
    sectorAlignment,
    actionPermission: 'BLOCKED_STAND_ASIDE',
    allowedStrategies: [],
    preferredStrategy: null,
    marginMultiplier: 1.0,
    riskBudgetMultiplier: 0.0,
    minAciThreshold: 999,
    maxVwapExtensionAtr: 0.50,
    requireGreenOnDay: true,
    downsizingAllowed: false,
    trancheTargets: {
      tranche1Atr: 1.25,
      tranche2Atr: 1.80,
      guaranteedLockAtr: 0.35,
      runnerMode: 'TIGHT_RATCHET',
    },
    maxStagnancyMinutes: 60,
    rationale: 'Defensive capital preservation: Unclassified market conditions.',
  };
}
