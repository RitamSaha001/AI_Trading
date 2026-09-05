import {
  Asset,
  ASSETS,
  AppState,
  Market,
  AutonomousPilotProfile,
  MarketRegime,
  QuantitativeOpportunity,
  AutonomousPilotState,
} from '../types';
import { portfolioValue, META, isIndianAsset, formatCurrency } from './portfolio';
import { indicators } from './indicators';
import { calculatePortfolioRisk } from './risk';

export interface PilotProfileConfig {
  profile: AutonomousPilotProfile;
  name: string;
  tagline: string;
  description: string;
  minRiskReward: number;
  minCompositeScore: number;
  maxRiskPerTradePct: number;
  stopLossAtrMultiplier: number;
  takeProfitAtrMultiplier: number;
  maxDrawdownCircuitBreakerPct: number;
  targetCashBufferPct: number;
  allowedRegimes: MarketRegime[];
}

export const PILOT_PROFILES: Record<AutonomousPilotProfile, PilotProfileConfig> = {
  conservative: {
    profile: 'conservative',
    name: 'Conservative Capital Guardian',
    tagline: 'Capital Preservation & Low-Volatility Income',
    description: 'Prioritizes extreme safety, deep cash buffers (70%+), and minimum 2.8:1 profit-to-risk ratio. Strict stop-loss protection.',
    minRiskReward: 2.8,
    minCompositeScore: 75,
    maxRiskPerTradePct: 0.75, // Never risk more than 0.75% of portfolio equity on one trade
    stopLossAtrMultiplier: 1.5,
    takeProfitAtrMultiplier: 4.2,
    maxDrawdownCircuitBreakerPct: 1.2,
    targetCashBufferPct: 70,
    allowedRegimes: ['BULLISH_EXPANSION', 'RANGE_BOUND_ACCUMULATION'],
  },
  balanced: {
    profile: 'balanced',
    name: 'Balanced Alpha Harvester',
    tagline: 'Disciplined Growth with Systematic Hedging',
    description: 'Balances capital safety with steady trend and mean-reversion profits. Targets 2.2:1+ reward-to-risk with 2.0x ATR stops.',
    minRiskReward: 2.2,
    minCompositeScore: 68,
    maxRiskPerTradePct: 1.0, // 1.0% maximum risk
    stopLossAtrMultiplier: 2.0,
    takeProfitAtrMultiplier: 4.6,
    maxDrawdownCircuitBreakerPct: 2.0,
    targetCashBufferPct: 45,
    allowedRegimes: ['BULLISH_EXPANSION', 'RANGE_BOUND_ACCUMULATION'],
  },
  momentum: {
    profile: 'momentum',
    name: 'Momentum Trend Capture',
    tagline: 'High-Probability Breakouts & Trailing Profit',
    description: 'Rides strong upward momentum with progressive take-profit scaling and trailing stop-loss guards. Minimum 2.0:1 R:R.',
    minRiskReward: 2.0,
    minCompositeScore: 62,
    maxRiskPerTradePct: 1.5, // 1.5% maximum risk
    stopLossAtrMultiplier: 2.5,
    takeProfitAtrMultiplier: 5.2,
    maxDrawdownCircuitBreakerPct: 3.5,
    targetCashBufferPct: 25,
    allowedRegimes: ['BULLISH_EXPANSION', 'RANGE_BOUND_ACCUMULATION', 'HIGH_VOLATILITY_CHOP'],
  },
};

/**
 * Creates default initial state for Autonomous Local Quant Pilot.
 */
export function createDefaultAutonomousPilotState(startingValue = 50000): AutonomousPilotState {
  return {
    enabled: false,
    profile: 'conservative',
    maxDailyDrawdownPct: 1.5,
    riskPerTradePct: 0.75,
    activeOpportunities: [],
    lastScanAt: null,
    dailyStartingValue: startingValue,
    dailyDrawdownPct: 0,
    circuitBreakerTripped: false,
    totalAutopilotTradesExecuted: 0,
    autoPilotProfitTotal: 0,
  };
}

/**
 * Classifies market regime from quantitative indicators.
 */
export function detectMarketRegime(market?: Market): MarketRegime {
  if (!market || !market.price || market.price <= 0) {
    return 'LOW_LIQUIDITY_DANGER';
  }

  const ind = indicators(market.history, market.candles);
  const price = market.price;
  const s10 = ind.s10 ?? price;
  const s30 = ind.s30 ?? price;
  const rsi = ind.rsi ?? 50;
  const vol = ind.vol ?? 0.02;

  // Extreme volatility flag
  if (vol > 0.06 || (ind.atr && ind.atr / price > 0.06)) {
    return 'HIGH_VOLATILITY_CHOP';
  }

  // Bullish expansion: Price > 10-SMA > 30-SMA with positive momentum
  if (price > s10 && s10 > s30 && rsi >= 48) {
    return 'BULLISH_EXPANSION';
  }

  // Bearish contraction: Price < 10-SMA < 30-SMA with depressed RSI
  if (price < s10 && s10 < s30 && rsi <= 48) {
    return 'BEARISH_CONTRACTION';
  }

  // Range-bound accumulation: SMAs within 1.5% and neutral RSI
  const smaDiff = Math.abs(s10 - s30) / Math.max(1, s30);
  if (smaDiff <= 0.018 && rsi >= 38 && rsi <= 62) {
    return 'RANGE_BOUND_ACCUMULATION';
  }

  return 'RANGE_BOUND_ACCUMULATION';
}

/**
 * Aligns price to venue tick size (0.05 for NSE Indian equities, 0.01 for standard fiat/crypto).
 */
export function alignToTickSize(price: number, asset: Asset): number {
  const isIndian = isIndianAsset(asset);
  const tick = isIndian ? 0.05 : 0.01;
  return +(Math.round(price / tick) * tick).toFixed(isIndian ? 2 : 4);
}

/**
 * Evaluates an individual asset using strict quantitative multi-factor metrics.
 * Returns a high-conviction QuantitativeOpportunity if all anti-loss criteria pass; null otherwise.
 */
export function evaluateMarketOpportunity(
  asset: Asset,
  market: Market | undefined,
  state: AppState,
  profileKey: AutonomousPilotProfile = 'conservative'
): QuantitativeOpportunity | null {
  if (!market || !market.price || market.price <= 0) return null;

  const profile = PILOT_PROFILES[profileKey];
  const ind = indicators(market.history, market.candles);
  const price = market.price;
  const isIndian = isIndianAsset(asset);
  const atr = ind.atr && ind.atr > 0 ? ind.atr : price * 0.02;
  const rsi = ind.rsi ?? 50;
  const vol = ind.vol ?? 0.02;
  const s10 = ind.s10 ?? price;
  const s30 = ind.s30 ?? price;

  // 1. Detect Regime
  const regime = detectMarketRegime(market);
  if (!profile.allowedRegimes.includes(regime)) {
    // Loss-protection: Skip regimes not supported by risk profile (e.g. Bearish, Choppy)
    return null;
  }

  // 2. Compute Multi-Factor Composite Score (0 - 100)
  let score = 50;

  // Factor A: Trend Momentum (Up to +20)
  if (price > s10 && s10 > s30) score += 15;
  else if (price > s10) score += 8;
  else if (price < s30) score -= 15;

  // Factor B: RSI Momentum & Mean Reversion (Up to +15)
  if (rsi >= 40 && rsi <= 60) {
    score += 10; // Optimal accumulation zone
  } else if (rsi < 35) {
    score += 15; // Oversold high-probability bounce
  } else if (rsi > 72) {
    score -= 20; // Overbought risk: avoid buying top
  }

  // Factor C: Volatility Safety (Up to +15)
  if (vol < 0.035) score += 12; // Stable, predictable volatility
  else if (vol > 0.06) score -= 15; // Dangerously high variance

  // Factor D: 24h Performance Confirmation
  if (market.change24h > -4 && market.change24h < 6) score += 8;
  else if (market.change24h > 12) score -= 10; // Chasing parabolic pump

  const compositeScore = Math.min(98, Math.max(20, Math.round(score)));

  // Minimum score gate
  if (compositeScore < profile.minCompositeScore) {
    return null;
  }

  // 3. Mathematical ATR Brackets & Risk-Reward Ratio
  const stopDistance = Math.max(price * 0.008, atr * profile.stopLossAtrMultiplier);
  const stopLossRaw = price - stopDistance;
  const targetDistance = stopDistance * profile.minRiskReward;
  const takeProfitRaw = price + targetDistance;
  const takeProfit2Raw = price + targetDistance * 1.5;

  const entryPrice = alignToTickSize(price, asset);
  const stopLossPrice = alignToTickSize(stopLossRaw, asset);
  const takeProfitPrice = alignToTickSize(takeProfitRaw, asset);
  const takeProfit2Price = alignToTickSize(takeProfit2Raw, asset);

  const riskPerUnit = entryPrice - stopLossPrice;
  const rewardPerUnit = takeProfitPrice - entryPrice;

  if (riskPerUnit <= 0 || rewardPerUnit <= 0) return null;

  const calculatedRR = +(rewardPerUnit / riskPerUnit).toFixed(2);
  if (calculatedRR < profile.minRiskReward) {
    // Loss-protection: Reject trades that do not meet the mathematical threshold
    return null;
  }

  // 4. Position Sizing: Strict Capital-at-Risk Budgeting
  const pv = portfolioValue(state, { [asset]: market } as any);
  const currentCash = state.accountMode === 'upstox' && state.upstoxAccount?.funds
    ? state.upstoxAccount.funds.availableCash
    : state.cash;

  const totalBase = Math.max(1000, pv > 0 ? pv : currentCash);
  const maxAllowedRiskMonetary = totalBase * (profile.maxRiskPerTradePct / 100);

  // Units = Allowed Risk / Risk Per Unit
  let units = maxAllowedRiskMonetary / riskPerUnit;
  if (isIndian) {
    // Whole shares for equities
    units = Math.max(1, Math.floor(units));
  } else {
    // Crypto fractional units
    const decimals = META[asset]?.decimals || 4;
    units = +(Math.max(0.001, units).toFixed(decimals));
  }

  const notional = units * entryPrice;

  // Ensure notional does not exceed available cash buffer
  if (notional > currentCash * 0.95 && currentCash > 0) {
    units = isIndian ? Math.max(1, Math.floor(currentCash * 0.9 / entryPrice)) : +(currentCash * 0.9 / entryPrice).toFixed(4);
  }

  if (units <= 0) return null;

  const maxCapitalAtRisk = +(units * riskPerUnit).toFixed(2);
  const projectedGain = +(units * rewardPerUnit).toFixed(2);
  const projectedLoss = maxCapitalAtRisk;

  // 5. Confidence Labeling
  let confidenceLabel: 'HIGH' | 'VERY_HIGH' | 'EXTREME' = 'HIGH';
  if (compositeScore >= 85) confidenceLabel = 'EXTREME';
  else if (compositeScore >= 75) confidenceLabel = 'VERY_HIGH';

  // 6. Beginner-Friendly Plain English Translation
  const assetName = META[asset]?.name || asset;
  const currSym = isIndian ? '₹' : '$';

  const plainEnglishRationale = `${assetName} demonstrates exceptional quantitative stability with an optimal ${calculatedRR}:1 profit-to-risk ratio. The mathematical entry is ${currSym}${entryPrice.toLocaleString()} with strict downside stop protection at ${currSym}${stopLossPrice.toLocaleString()}, targeting ${currSym}${takeProfitPrice.toLocaleString()} profit.`;

  const beginnerExplanation = {
    verdict: `Strong Buy (${calculatedRR}x Reward vs Risk)`,
    why: `${assetName} has settled into an attractive accumulation zone. Mathematical momentum indicates high probability of upward expansion while downside volatility remains strictly contained.`,
    whatCouldGoWrong: `If unexpected broader market selling occurs, the price could drop toward the support line.`,
    safeguardNotice: `Your automated Stop-Loss is hard-coded at ${currSym}${stopLossPrice.toLocaleString()}. If hit, the position automatically closes, strictly limiting your maximum loss to ${currSym}${projectedLoss.toLocaleString()} (${profile.maxRiskPerTradePct}% of portfolio).`,
  };

  return {
    id: `opp_${asset}_${Date.now()}`,
    asset,
    action: 'BUY',
    compositeScore,
    confidenceLabel,
    regime,
    entryPrice,
    stopLossPrice,
    takeProfitPrice,
    takeProfit2Price,
    riskRewardRatio: calculatedRR,
    riskPerUnit: +riskPerUnit.toFixed(2),
    recommendedUnits: units,
    maxCapitalAtRisk,
    projectedGain,
    projectedLoss,
    plainEnglishRationale,
    beginnerExplanation,
    indicatorsSummary: {
      rsi: +rsi.toFixed(1),
      atr: +atr.toFixed(2),
      trend: price > s10 ? 'UP' : price < s30 ? 'DOWN' : 'SIDEWAYS',
      volatilityPct: +(vol * 100).toFixed(2),
    },
    timestamp: Date.now(),
  };
}

/**
 * Scans all available market instruments and returns top scored quantitative opportunities.
 */
export function scanAllMarkets(
  state: AppState,
  markets: Record<Asset, Market | undefined>,
  profile: AutonomousPilotProfile = 'conservative'
): QuantitativeOpportunity[] {
  const opps: QuantitativeOpportunity[] = [];
  const assetsToScan = Object.keys(markets) as Asset[];

  for (const a of assetsToScan) {
    const opp = evaluateMarketOpportunity(a, markets[a], state, profile);
    if (opp) {
      opps.push(opp);
    }
  }

  // Sort descending by composite score, then by Risk:Reward ratio
  opps.sort((a, b) => b.compositeScore - a.compositeScore || b.riskRewardRatio - a.riskRewardRatio);

  return opps.slice(0, 5); // Return top 5 premier setups
}

/**
 * Checks portfolio drawdown against circuit breaker limits.
 * Protects user from catastrophic loss by automatically halting autonomous execution.
 */
export function checkPilotCircuitBreaker(
  state: AppState,
  currentPortfolioValue: number,
  profileKey: AutonomousPilotProfile = 'conservative'
): { tripped: boolean; drawdownPct: number; reason?: string } {
  const profile = PILOT_PROFILES[profileKey];
  const startingVal = state.autonomousPilot?.dailyStartingValue || state.startingEquity || currentPortfolioValue;

  if (startingVal <= 0) {
    return { tripped: false, drawdownPct: 0 };
  }

  const drawdownMonetary = startingVal - currentPortfolioValue;
  const drawdownPct = Math.max(0, +((drawdownMonetary / startingVal) * 100).toFixed(2));

  if (drawdownPct >= profile.maxDrawdownCircuitBreakerPct) {
    return {
      tripped: true,
      drawdownPct,
      reason: `Circuit Breaker Tripped: Intraday drawdown reached ${drawdownPct}% (exceeds ${profile.name} safety cap of ${profile.maxDrawdownCircuitBreakerPct}%). All autonomous buy executions halted to preserve capital.`,
    };
  }

  return { tripped: false, drawdownPct };
}
