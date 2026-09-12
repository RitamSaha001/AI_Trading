import { Market, Asset } from '../../types';

export type MacroRegimeKind =
  | 'BULL_MOMENTUM'
  | 'BEAR_MOMENTUM'
  | 'CHOPPY_EQUILIBRIUM'
  | 'VOLATILITY_PANIC';

export type DirectionalPermission =
  | 'LONG_ONLY'
  | 'SHORT_ONLY'
  | 'BOTH'
  | 'STAND_ASIDE';

export interface FleetMacroBreadthResult {
  totalAssetsEvaluated: number;
  assetsAboveVwapCount: number;
  breadthAboveVwapPct: number;
  advancingAssetsCount: number;
  decliningAssetsCount: number;
  advanceDeclineRatio: number;
  fleetMeanChangePct: number;
  macroRegime: MacroRegimeKind;
  directionalPermission: DirectionalPermission;
  convictionAdjustment: number;
  rationale: string;
}

/**
 * Institutional Fleet Macro Breadth & Market Regime Classifier.
 * Analyzes the cross-sectional state of all 100 monitored Indian equities
 * to identify aggregate market direction, institutional participation, and liquidity bias.
 */
export function evaluateFleetMacroBreadth(
  markets: Partial<Record<Asset, Market>>,
  activeAssets: Asset[]
): FleetMacroBreadthResult {
  let totalEvaluated = 0;
  let aboveVwapCount = 0;
  let advancingCount = 0;
  let decliningCount = 0;
  let totalChangePct = 0;

  for (const asset of activeAssets) {
    const m = markets[asset];
    if (!m || !m.price || m.price <= 0) continue;

    totalEvaluated++;
    const price = m.price;
    const change = m.change24h || 0;
    totalChangePct += change;

    if (change > 0.05) advancingCount++;
    else if (change < -0.05) decliningCount++;

    // Check VWAP from candles or fallback
    let vwap = 0;
    if (m.candles && m.candles.length > 0) {
      let cumVol = 0;
      let cumTypical = 0;
      for (const c of m.candles) {
        if (!c || typeof c.close !== 'number' || typeof c.volume !== 'number') continue;
        const typical = ((c.high ?? c.close) + (c.low ?? c.close) + c.close) / 3;
        const v = Math.max(1, c.volume);
        cumTypical += typical * v;
        cumVol += v;
      }
      if (cumVol > 0) vwap = cumTypical / cumVol;
    }

    if (vwap > 0 && price >= vwap) {
      aboveVwapCount++;
    } else if (vwap === 0 && change >= 0) {
      aboveVwapCount++;
    }
  }

  if (totalEvaluated === 0) {
    return {
      totalAssetsEvaluated: 0,
      assetsAboveVwapCount: 0,
      breadthAboveVwapPct: 50,
      advancingAssetsCount: 0,
      decliningAssetsCount: 0,
      advanceDeclineRatio: 1.0,
      fleetMeanChangePct: 0,
      macroRegime: 'CHOPPY_EQUILIBRIUM',
      directionalPermission: 'BOTH',
      convictionAdjustment: 0,
      rationale: 'Insufficient market data for fleet breadth evaluation.',
    };
  }

  const breadthAboveVwapPct = +((aboveVwapCount / totalEvaluated) * 100).toFixed(1);
  const fleetMeanChangePct = +(totalChangePct / totalEvaluated).toFixed(2);
  const advanceDeclineRatio = decliningCount > 0 ? +(advancingCount / decliningCount).toFixed(2) : advancingCount > 0 ? 5.0 : 1.0;

  let macroRegime: MacroRegimeKind = 'CHOPPY_EQUILIBRIUM';
  let directionalPermission: DirectionalPermission = 'BOTH';
  let convictionAdjustment = 0;
  let rationale = '';

  // Severe Systemic Crash: < 25% above VWAP and A/D <= 0.40
  if (breadthAboveVwapPct <= 25 && advanceDeclineRatio <= 0.40) {
    macroRegime = 'BEAR_MOMENTUM';
    directionalPermission = 'SHORT_ONLY';
    convictionAdjustment = -10;
    rationale = `Severe Macro Liquidation: Only ${breadthAboveVwapPct}% of fleet above VWAP, A/D ${advanceDeclineRatio}:1 (Avg ${fleetMeanChangePct}%). Long entries completely blocked.`;
  }
  // Bullish Expansion: >= 58% above VWAP and A/D >= 1.35
  else if (breadthAboveVwapPct >= 58 && advanceDeclineRatio >= 1.35) {
    macroRegime = 'BULL_MOMENTUM';
    directionalPermission = 'BOTH';
    convictionAdjustment = +5;
    rationale = `Macro Bull Expansion: ${breadthAboveVwapPct}% of fleet above VWAP, A/D ${advanceDeclineRatio}:1 (Avg +${fleetMeanChangePct}%). Institutional tailwind for longs.`;
  }
  // Moderate Bearish Lean: 25% - 42% above VWAP
  else if (breadthAboveVwapPct <= 42 && advanceDeclineRatio <= 0.75) {
    macroRegime = 'BEAR_MOMENTUM';
    directionalPermission = 'BOTH';
    convictionAdjustment = -4;
    rationale = `Moderate Bear Lean: ${breadthAboveVwapPct}% of fleet above VWAP, A/D ${advanceDeclineRatio}:1. Long entries require higher conviction.`;
  }
  // Choppy Equilibrium: Mixed signals
  else {
    macroRegime = 'CHOPPY_EQUILIBRIUM';
    directionalPermission = 'BOTH';
    convictionAdjustment = 0;
    rationale = `Macro Neutral Chop: ${breadthAboveVwapPct}% above VWAP, A/D ${advanceDeclineRatio}:1. Stock-specific alpha active.`;
  }

  return {
    totalAssetsEvaluated: totalEvaluated,
    assetsAboveVwapCount: aboveVwapCount,
    breadthAboveVwapPct,
    advancingAssetsCount: advancingCount,
    decliningAssetsCount: decliningCount,
    advanceDeclineRatio,
    fleetMeanChangePct,
    macroRegime,
    directionalPermission,
    convictionAdjustment,
    rationale,
  };
}
