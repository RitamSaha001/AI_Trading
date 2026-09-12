import { FleetMacroBreadthResult } from './macroRegimeEngine';

export type MarketDayType =
  | 'BULL_TREND_DAY'
  | 'BEAR_TREND_DAY'
  | 'RANGE_BOUND_EQUILIBRIUM'
  | 'AFTERNOON_EXPANSION_WINDOW'
  | 'HIGH_VOLATILITY_CHOP';

export interface DayTypeClassification {
  dayType: MarketDayType;
  confidence: number;
  favoredStrategies: string[];
  restrictedStrategies: string[];
  maxDailyTradesRecommended: number;
  minAciFloor: number;
  targetProfitAtrMultiplier: number;
  narrative: string;
}

/**
 * Classifies current trading session into an institutional day archetype
 * based on cross-sectional fleet breadth, advance/decline ratio, and time of day.
 */
export function classifyMarketDayType(
  macroBreadth: FleetMacroBreadthResult,
  nowTimestamp: number
): DayTypeClassification {
  const d = new Date(nowTimestamp + 3600000 * 5.5);
  const istMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  const isAfternoonWindow = istMinutes >= (13 * 60 + 15) && istMinutes <= (14 * 60 + 30);

  const { breadthAboveVwapPct, advanceDeclineRatio, fleetMeanChangePct } = macroBreadth;

  // 1. Strong Bull Trend Day
  if (breadthAboveVwapPct >= 58 && advanceDeclineRatio >= 1.6 && fleetMeanChangePct >= 0.20) {
    return {
      dayType: 'BULL_TREND_DAY',
      confidence: 0.88,
      favoredStrategies: ['Hurst Trend Rider', 'ORB Breakout', 'Momentum Scalper', 'Candle Price Action'],
      restrictedStrategies: ['Counter-Trend Short'],
      maxDailyTradesRecommended: 4,
      minAciFloor: 48,
      targetProfitAtrMultiplier: 2.2,
      narrative: `Bull Trend Day confirmed: ${breadthAboveVwapPct.toFixed(0)}% fleet above VWAP, A/D ratio ${advanceDeclineRatio.toFixed(1)}x. Trend breakouts and momentum scaling favoured.`,
    };
  }

  // 2. Bear Breakdown / Sell-off Day
  if (
    macroBreadth.totalAssetsEvaluated >= 15 &&
    ((breadthAboveVwapPct <= 38 && advanceDeclineRatio <= 0.65 && fleetMeanChangePct <= -0.20) ||
      macroBreadth.directionalPermission === 'SHORT_ONLY' ||
      (breadthAboveVwapPct <= 32 && advanceDeclineRatio <= 0.55))
  ) {
    return {
      dayType: 'BEAR_TREND_DAY',
      confidence: 0.85,
      favoredStrategies: ['ORB Breakdown', 'VWAP Rejection Short', 'Value Accumulator'],
      restrictedStrategies: [
        'Hurst Trend Rider',
        'ORB Breakout',
        'VWAP Band Mean Reversion',
        'Momentum Scalper',
        'Candle Price Action',
      ],
      maxDailyTradesRecommended: 0,
      minAciFloor: 75,
      targetProfitAtrMultiplier: 1.5,
      narrative: `Bear Trend / Liquidation Day: Only ${breadthAboveVwapPct.toFixed(0)}% fleet above VWAP, A/D ${advanceDeclineRatio.toFixed(1)}x. Long entries strictly restricted to preserve capital.`,
    };
  }

  // 3. Afternoon Institutional Expansion Window (13:15 - 14:30 IST)
  if (isAfternoonWindow && breadthAboveVwapPct >= 45) {
    return {
      dayType: 'AFTERNOON_EXPANSION_WINDOW',
      confidence: 0.80,
      favoredStrategies: ['Momentum Scalper', 'Candle Price Action'],
      restrictedStrategies: ['Value Accumulator'],
      maxDailyTradesRecommended: 3,
      minAciFloor: 50,
      targetProfitAtrMultiplier: 1.4,
      narrative: `Afternoon European Open Expansion: Capitalizing on 13:15-14:30 institutional volume burst for quick momentum scalps.`,
    };
  }

  // 4. Range-Bound Equilibrium / Consolidation Day
  if (breadthAboveVwapPct >= 40 && breadthAboveVwapPct <= 60 && advanceDeclineRatio >= 0.75 && advanceDeclineRatio <= 1.35) {
    return {
      dayType: 'RANGE_BOUND_EQUILIBRIUM',
      confidence: 0.82,
      favoredStrategies: ['VWAP Band Mean Reversion', 'Candle Price Action', 'Value Accumulator'],
      restrictedStrategies: ['Aggressive Breakouts'],
      maxDailyTradesRecommended: 3,
      minAciFloor: 48,
      targetProfitAtrMultiplier: 1.25,
      narrative: `Range-Bound Equilibrium Day: Fleet oscillating around VWAP (${breadthAboveVwapPct.toFixed(0)}%). Mean reversion between +/-2σ VWAP bands and pinbar bounces favoured.`,
    };
  }

  // 5. Default High-Volatility / Indecisive Chop
  return {
    dayType: 'HIGH_VOLATILITY_CHOP',
    confidence: 0.65,
    favoredStrategies: ['Value Accumulator', 'Candle Price Action'],
    restrictedStrategies: ['Low-Conviction Breakouts'],
    maxDailyTradesRecommended: 2,
    minAciFloor: 55,
    targetProfitAtrMultiplier: 1.3,
    narrative: `Indecisive Market Chop: Divergent sector breadth. Heightened selectivity enforced.`,
  };
}
