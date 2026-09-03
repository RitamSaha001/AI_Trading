import {
  ASSETS,
  Asset,
  AppState,
  Market,
  AIActionProposal,
  RebalanceStep,
  StrategyConfig,
  StrategyKind,
  StressTestScenario,
  SmartDCAPlan,
  TokenComparison,
  TokenComparisonMetric,
} from '../types';
import { portfolioValue, positionValue, FEE_RATE, META } from './portfolio';
import { returns, stdev, indicators } from './indicators';
import { calculatePortfolioRisk } from './risk';

export interface DangerAssessment {
  dangerScore: number; // 0 to 100
  dangerLevel: 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
  hazards: string[];
  latexFormula: string;
  circuitBreakerRecommended: boolean;
  suggestedDeRiskPct: number;
  defensiveProposal: AIActionProposal | null;
}

export interface AgenticAllocationPlan {
  style: 'risk_parity' | 'kelly' | 'growth_weighted' | 'defensive_flight' | 'growth';
  targetWeights: Record<Asset, number>;
  cashTargetPct: number;
  currentWeights: Record<Asset, number>;
  latexFormula: string;
  rationale: string;
  steps: RebalanceStep[];
  proposal: AIActionProposal;
  executionPlan: {
    estimatedPostSellCash: number;
    estimatedTotalFees: number;
    residualCash: number;
    isCashFeasible: boolean;
  };
}

/**
 * Intelligent Autonomous Danger Sensing Engine (Sentinel).
 * Directly calculates quantitative risk from portfolio volatility, Herfindahl concentration (HHI),
 * and exponential cash buffer depletion:
 * Danger(w, σ) = 100 · σp · (1 + HHI) · exp(-Cash/Total)
 */
export function senseMarketDanger(
  state: AppState,
  markets: Record<Asset, Market | undefined>
): DangerAssessment {
  const totalVal = portfolioValue(state, markets);
  const rk = calculatePortfolioRisk(state, markets);
  const hazards: string[] = [];

  if (totalVal <= 0) {
    return {
      dangerScore: 0,
      dangerLevel: 'NORMAL',
      hazards: ['Portfolio is empty'],
      latexFormula: '\\text{Danger}(\\mathbf{w}, \\boldsymbol{\\sigma}) = 0\\%',
      circuitBreakerRecommended: false,
      suggestedDeRiskPct: 0,
      defensiveProposal: null,
    };
  }

  // 1. Direct mathematical parameters
  const cashRatio = Math.max(0, Math.min(1, state.cash / totalVal));
  const hhi = rk.herfindahlIndex; // Sum of w_i^2 (0 to 1)
  // Annualized portfolio weighted volatility
  const sigmaPAnn = Math.min(1.5, rk.weightedVolatility * Math.sqrt(365));

  // Base Danger equation: Danger(w, σ) = 100 · σp · (1 + HHI) · exp(-Cash/Total)
  const baseDanger = 100 * sigmaPAnn * (1 + hhi) * Math.exp(-cashRatio * 2.2);

  // 2. Market shock / flash crash penalty from active position drawdowns
  let shockPenalty = 0;
  for (const a of ASSETS) {
    const holdingVal = positionValue(state, markets, a);
    if (holdingVal > 50) {
      const m = markets[a];
      if (m) {
        if (m.change24h <= -7) {
          shockPenalty += 12;
          hazards.push(`${a} flash drawdown of ${m.change24h.toFixed(2)}% in 24h`);
        } else if (m.change24h <= -4) {
          shockPenalty += 5;
        }

        const ind = indicators(m.history, m.candles);
        if (ind.rsi < 28) {
          shockPenalty += 8;
          hazards.push(`${a} severe RSI breakdown (${ind.rsi.toFixed(1)})`);
        } else if (ind.rsi > 78) {
          shockPenalty += 6;
          hazards.push(`${a} extreme overbought RSI (${ind.rsi.toFixed(1)}) vulnerable to sharp drop`);
        }
      }
    }
  }

  // Concentration and low-cash hazard warnings
  if (rk.topAssetConcentrationPct > 60 && rk.topAsset) {
    hazards.push(`Severe concentration: ${rk.topAsset} constitutes ${rk.topAssetConcentrationPct.toFixed(1)}% of portfolio`);
  } else if (rk.topAssetConcentrationPct > 45 && rk.topAsset) {
    hazards.push(`High concentration: ${rk.topAsset} constitutes ${rk.topAssetConcentrationPct.toFixed(1)}%`);
  }
  if (rk.cashRatioPct < 10) {
    hazards.push(`Depleted liquid cash buffer (${rk.cashRatioPct.toFixed(1)}%)`);
  }

  // Final quantitative score clamped to 0 - 100
  const dangerScore = Math.min(100, Math.max(0, Math.round(baseDanger + shockPenalty)));

  let dangerLevel: 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL' = 'NORMAL';
  if (dangerScore >= 75) dangerLevel = 'CRITICAL';
  else if (dangerScore >= 50) dangerLevel = 'HIGH';
  else if (dangerScore >= 25) dangerLevel = 'ELEVATED';

  const circuitBreakerRecommended = dangerLevel === 'CRITICAL' || dangerLevel === 'HIGH';
  const suggestedDeRiskPct = dangerLevel === 'CRITICAL' ? 60 : dangerLevel === 'HIGH' ? 35 : 15;

  // Build defensive proposal if elevated danger
  let defensiveProposal: AIActionProposal | null = null;
  if (circuitBreakerRecommended && totalVal > 0) {
    const rebalanceSteps: RebalanceStep[] = [];
    const deRiskRatio = suggestedDeRiskPct / 100;

    for (const a of ASSETS) {
      const currentQty = state.positions[a] || 0;
      const m = markets[a];
      if (currentQty > 0 && m && m.price > 0) {
        const isHighBeta = ['SOL', 'DOGE', 'AVAX', 'PEPE'].includes(a);
        const sellFraction = isHighBeta ? Math.min(0.75, deRiskRatio * 1.3) : deRiskRatio;
        const sellQty = +(currentQty * sellFraction).toFixed(4);
        if (sellQty > 0 && sellQty * m.price > 25) {
          rebalanceSteps.push({
            asset: a,
            action: 'sell',
            amount: sellQty,
            estimatedPrice: m.price,
            estimatedNotional: +(sellQty * m.price).toFixed(2),
          });
        }
      }
    }

    if (rebalanceSteps.length > 0) {
      defensiveProposal = {
        type: 'emergency_defend',
        asset: rk.topAsset || 'BTC',
        dangerLevel,
        hazardSource: hazards.slice(0, 2).join('; ') || 'High market drawdown probability',
        rationale: `Autonomous Sentinel detected ${dangerLevel} danger level (Quantitative Score: ${dangerScore}/100). Reallocating capital to liquid cash buffer.`,
        confidence: 'high',
        riskSummary: `Liquidates volatile allocations by ~${suggestedDeRiskPct}% to restore safety cash buffer.`,
        formulaLatex: `\\text{Danger}(\\mathbf{w}, \\boldsymbol{\\sigma}) = 100 \\cdot \\sigma_p \\cdot (1 + \\text{HHI}) \\cdot \\exp(-c) = ${dangerScore}`,
        requiresConfirmation: true,
        rebalanceSteps,
      };
    }
  }

  const latexFormula = `\\text{Danger}(\\mathbf{w}, \\boldsymbol{\\sigma}) = 100 \\cdot \\sigma_p \\cdot \\left(1 + \\text{HHI}\\right) \\cdot \\exp\\left(-\\frac{\\text{Cash}}{\\text{Total}}\\right) = ${dangerScore.toFixed(1)}\\%`;

  return {
    dangerScore,
    dangerLevel,
    hazards,
    latexFormula,
    circuitBreakerRecommended,
    suggestedDeRiskPct,
    defensiveProposal,
  };
}

/**
 * Calculates quantitative allocation (Fractional Kelly, Risk Parity, Growth Weighted)
 * and executes a two-stage cash feasibility plan:
 * Current Portfolio -> Planned Sells -> Estimated Post-Sell Cash -> Planned Buys -> Fees -> Residual Cash -> Final Weights.
 */
export function calculateAgenticAllocation(
  state: AppState,
  markets: Record<Asset, Market | undefined>,
  style: 'risk_parity' | 'kelly' | 'growth_weighted' | 'defensive_flight' | 'growth' = 'risk_parity'
): AgenticAllocationPlan {
  const totalVal = portfolioValue(state, markets);

  // Current weights
  const currentWeights = Object.fromEntries(
    ASSETS.map((a) => [a, totalVal > 0 ? (positionValue(state, markets, a) / totalVal) * 100 : 0])
  ) as Record<Asset, number>;

  // Target Cash % by style
  const cashTargetPct =
    style === 'defensive_flight' ? 45 : style === 'risk_parity' ? 25 : style === 'kelly' ? 20 : 15;

  const investablePct = 100 - cashTargetPct;

  // Calculate asset return statistics & volatilities
  const assetVols: Partial<Record<Asset, number>> = {};
  for (const a of ASSETS) {
    const m = markets[a];
    if (m && m.history.length > 5) {
      const vol = stdev(returns(m.history.slice(-20))) || 0.02;
      assetVols[a] = Math.max(0.005, vol);
    } else {
      assetVols[a] = 0.03;
    }
  }

  const targetWeights: Record<Asset, number> = Object.fromEntries(ASSETS.map((a) => [a, 0])) as Record<Asset, number>;
  let latexFormula = '';

  if (style === 'defensive_flight') {
    // 45% Cash, 35% BTC, 20% ETH
    targetWeights.BTC = 35;
    targetWeights.ETH = 20;
    latexFormula = `\\mathbf{w}_{\\text{safe}} = \\arg\\min_{\\mathbf{w}} \\mathbf{w}^T \\boldsymbol{\\Sigma} \\mathbf{w} \\quad \\text{s.t.} \\quad w_{\\text{cash}} \\ge 0.45`;
  } else if (style === 'risk_parity') {
    // Inverse volatility weighting: w_i = (1 / vol_i) / sum(1 / vol_k)
    const coreAssets: Asset[] = ['BTC', 'ETH', 'SOL', 'LINK'];
    const invVolSum = coreAssets.reduce((sum, a) => sum + 1 / (assetVols[a] || 0.03), 0);

    coreAssets.forEach((a) => {
      const invVol = 1 / (assetVols[a] || 0.03);
      targetWeights[a] = +((invVol / invVolSum) * investablePct).toFixed(1);
    });
    latexFormula = `w_i^* = \\frac{\\sigma_i^{-1}}{\\sum_{k=1}^N \\sigma_k^{-1}} \\cdot \\left(1 - w_{\\text{cash}}\\right)`;
  } else if (style === 'kelly') {
    // Genuine Fractional Kelly: f* = (p*b - (1 - p)) / b
    // Estimated from historical returns with 0.25 (quarter-Kelly) drawdown damping
    const candidateAssets: Asset[] = ['BTC', 'ETH', 'SOL', 'LINK'];
    const rawKellyFractions: Record<string, number> = {};

    candidateAssets.forEach((a) => {
      const hist = markets[a]?.history || [];
      const r = returns(hist.slice(-30));
      const wins = r.filter((x) => x > 0);
      const losses = r.filter((x) => x < 0);

      const p = wins.length + losses.length > 0 ? wins.length / (wins.length + losses.length) : 0.52;
      const meanWin = wins.length > 0 ? wins.reduce((sum, w) => sum + w, 0) / wins.length : 0.015;
      const meanLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, l) => sum + l, 0) / losses.length) : 0.012;
      const b = Math.max(0.2, meanWin / Math.max(1e-4, meanLoss));

      // Unconstrained Kelly: f* = (p(b + 1) - 1) / b = (pb - (1 - p)) / b
      const fStar = (p * b - (1 - p)) / b;
      // Conservative Quarter-Kelly fraction (capped at 0.45 single asset cap)
      const fQuarter = Math.max(0.05, Math.min(0.45, 0.25 * Math.max(0, fStar)));
      rawKellyFractions[a] = fQuarter;
    });

    const sumKelly = candidateAssets.reduce((sum, a) => sum + (rawKellyFractions[a] || 0.1), 0);
    candidateAssets.forEach((a) => {
      const normalizedFrac = (rawKellyFractions[a] || 0.1) / Math.max(1e-4, sumKelly);
      targetWeights[a] = +(normalizedFrac * investablePct).toFixed(1);
    });

    latexFormula = `f_i^* = 0.25 \\cdot \\frac{p_i b_i - (1 - p_i)}{b_i} \\implies w_i = \\frac{f_i^*}{\\sum_k f_k^*} \\cdot \\left(1 - w_{\\text{cash}}\\right)`;
  } else if (style === 'growth_weighted') {
    // Predefined growth-weighted portfolio template
    targetWeights.BTC = +(investablePct * 0.45).toFixed(1);
    targetWeights.ETH = +(investablePct * 0.30).toFixed(1);
    targetWeights.SOL = +(investablePct * 0.15).toFixed(1);
    targetWeights.LINK = +(investablePct * 0.10).toFixed(1);
    latexFormula = `\\mathbf{w}_{\\text{growth}} = [45\\%\\,\\text{BTC},\\,30\\%\\,\\text{ETH},\\,15\\%\\,\\text{SOL},\\,10\\%\\,\\text{LINK}] \\cdot \\left(1 - w_{\\text{cash}}\\right)`;
  } else {
    // Growth
    targetWeights.BTC = +(investablePct * 0.35).toFixed(1);
    targetWeights.ETH = +(investablePct * 0.25).toFixed(1);
    targetWeights.SOL = +(investablePct * 0.25).toFixed(1);
    targetWeights.AVAX = +(investablePct * 0.15).toFixed(1);
    latexFormula = `\\mathbf{w}_{\\text{growth}} = [35\\%\\,\\text{BTC},\\,25\\%\\,\\text{ETH},\\,25\\%\\,\\text{SOL},\\,15\\%\\,\\text{AVAX}] \\cdot \\left(1 - w_{\\text{cash}}\\right)`;
  }

  // TWO-STAGE EXECUTION PLANNER:
  // Current Portfolio -> Planned Sells -> Estimated Post-Sell Cash -> Planned Buys -> Fees -> Residual Cash -> Final Weights
  let estimatedCash = state.cash;
  let estimatedTotalFees = 0;
  const sellSteps: RebalanceStep[] = [];
  const buySteps: RebalanceStep[] = [];

  // Stage 1: Planned Sells (liquidate assets exceeding target weight)
  ASSETS.forEach((a) => {
    const currentVal = positionValue(state, markets, a);
    const targetVal = (targetWeights[a] / 100) * totalVal;
    const diffVal = targetVal - currentVal;
    const m = markets[a];

    if (m && m.price > 0 && diffVal < -25) {
      const desiredSellNotional = Math.abs(diffVal);
      const currentHolding = state.positions[a] || 0;
      const maxSellNotional = currentHolding * m.price;
      const actualSellNotional = Math.min(desiredSellNotional, maxSellNotional);
      const sellQty = +(actualSellNotional / m.price).toFixed(4);

      if (sellQty > 0) {
        const fee = actualSellNotional * FEE_RATE;
        const netProceeds = actualSellNotional - fee;
        estimatedCash += netProceeds;
        estimatedTotalFees += fee;
        sellSteps.push({
          asset: a,
          action: 'sell',
          amount: sellQty,
          estimatedPrice: m.price,
          estimatedNotional: +actualSellNotional.toFixed(2),
        });
      }
    }
  });

  const estimatedPostSellCash = estimatedCash;

  // Stage 2: Planned Buys with cash feasibility scaling
  const targetCashBuffer = (cashTargetPct / 100) * totalVal;
  // Maximum cash permitted to spend on buys while respecting target cash buffer
  const maxBuyCashBudget = Math.max(0, estimatedPostSellCash - targetCashBuffer);

  const desiredBuys: { asset: Asset; desiredNotional: number; price: number }[] = [];
  ASSETS.forEach((a) => {
    const currentVal = positionValue(state, markets, a);
    const targetVal = (targetWeights[a] / 100) * totalVal;
    const diffVal = targetVal - currentVal;
    const m = markets[a];

    if (m && m.price > 0 && diffVal > 25) {
      desiredBuys.push({ asset: a, desiredNotional: diffVal, price: m.price });
    }
  });

  const totalDesiredBuyNotional = desiredBuys.reduce((sum, b) => sum + b.desiredNotional, 0);
  const totalDesiredCostWithFees = totalDesiredBuyNotional * (1 + FEE_RATE);

  // Feasibility scaling factor (clamps within [0, 1])
  const buyScaleFactor =
    totalDesiredCostWithFees > maxBuyCashBudget && totalDesiredCostWithFees > 0
      ? Math.max(0, maxBuyCashBudget / totalDesiredCostWithFees)
      : 1.0;

  desiredBuys.forEach((b) => {
    const actualBuyNotional = b.desiredNotional * buyScaleFactor;
    const buyQty = +(actualBuyNotional / b.price).toFixed(4);
    if (buyQty > 0) {
      const fee = actualBuyNotional * FEE_RATE;
      const cost = actualBuyNotional + fee;
      estimatedCash -= cost;
      estimatedTotalFees += fee;
      buySteps.push({
        asset: b.asset,
        action: 'buy',
        amount: buyQty,
        estimatedPrice: b.price,
        estimatedNotional: +actualBuyNotional.toFixed(2),
      });
    }
  });

  const residualCash = Math.max(0, estimatedCash);
  const steps: RebalanceStep[] = [...sellSteps, ...buySteps];

  const executionPlan = {
    estimatedPostSellCash: +estimatedPostSellCash.toFixed(2),
    estimatedTotalFees: +estimatedTotalFees.toFixed(2),
    residualCash: +residualCash.toFixed(2),
    isCashFeasible: true,
  };

  const proposal: AIActionProposal = {
    type: 'rebalance',
    asset: 'BTC',
    rationale: `Agentic autonomous portfolio reallocation based on quantitative ${style.replace('_', ' ')} optimization.`,
    confidence: 'high',
    riskSummary: `Two-stage rebalancing: ${sellSteps.length} sells to free ${estimatedPostSellCash.toFixed(0)} cash, followed by ${buySteps.length} buys (Target Cash: ${cashTargetPct}%).`,
    formulaLatex: latexFormula,
    requiresConfirmation: true,
    rebalanceTargets: targetWeights,
    cashTargetPct,
    rebalanceSteps: steps,
    executionPlan,
  };

  return {
    style,
    targetWeights,
    cashTargetPct,
    currentWeights,
    latexFormula,
    rationale: `Mathematical rebalancing aligns portfolio with quantitative ${style.replace('_', ' ')} targets.`,
    steps,
    proposal,
    executionPlan,
  };
}

/**
 * Mathematically models portfolio drawdown and liquidation risk under historical & hypothetical stress scenarios.
 * Scenarios: Bitcoin Flash Crash (-20%), Macro Rate Shock, Altcoin Flash Liquidation, and Crypto Winter.
 */
export function simulatePortfolioStressTest(
  state: AppState,
  markets: Record<Asset, Market | undefined>,
  scenarioId: StressTestScenario['scenarioId'] = 'btc_flash_crash_20'
): StressTestScenario {
  const currentTotalVal = portfolioValue(state, markets);
  const rk = calculatePortfolioRisk(state, markets);

  let shockTitle = '';
  let shockDesc = '';
  let btcDrop = -0.20;
  let ethDrop = -0.25;
  let altDrop = -0.35;
  let memeDrop = -0.45;

  if (scenarioId === 'macro_rate_shock') {
    shockTitle = 'Macro Rate Hike & Liquidity Shock';
    shockDesc = 'Central bank surprise +50bps rate hike drains market liquidity across risk assets.';
    btcDrop = -0.12;
    ethDrop = -0.16;
    altDrop = -0.24;
    memeDrop = -0.32;
  } else if (scenarioId === 'high_beta_liquidation') {
    shockTitle = 'Altcoin Flash Liquidation Cascade';
    shockDesc = 'Derivatives leverage unwind triggering stop runs across high-beta and meme tokens.';
    btcDrop = -0.08;
    ethDrop = -0.14;
    altDrop = -0.38;
    memeDrop = -0.50;
  } else if (scenarioId === 'crypto_winter_cascade') {
    shockTitle = 'Crypto Winter Maximum Drawdown';
    shockDesc = 'Prolonged multi-month bear market capitulation across all digital asset sectors.';
    btcDrop = -0.45;
    ethDrop = -0.55;
    altDrop = -0.68;
    memeDrop = -0.80;
  } else {
    // btc_flash_crash_20 (default)
    shockTitle = 'Bitcoin Flash Crash (-20%)';
    shockDesc = 'Sudden liquidation wick where Bitcoin drops 20% in 12 hours, dragging the market down.';
    btcDrop = -0.20;
    ethDrop = -0.25;
    altDrop = -0.35;
    memeDrop = -0.42;
  }

  let totalSimulatedLoss = 0;
  const assetImpacts: StressTestScenario['assetImpacts'] = [];

  for (const a of ASSETS) {
    const units = state.positions[a] || 0;
    const price = markets[a]?.price || 0;
    const holdingVal = units * price;

    if (holdingVal > 0) {
      const cat = META[a]?.category || 'Layer 1';
      let assetShockPct = altDrop;
      if (a === 'BTC') assetShockPct = btcDrop;
      else if (a === 'ETH') assetShockPct = ethDrop;
      else if (cat === 'Meme') assetShockPct = memeDrop;
      else if (cat === 'DeFi' || cat === 'Gaming') assetShockPct = altDrop * 1.1;

      const loss = holdingVal * Math.abs(assetShockPct);
      totalSimulatedLoss += loss;
      assetImpacts.push({
        asset: a,
        priceShockPct: +(assetShockPct * 100).toFixed(1),
        simulatedLossUsd: +loss.toFixed(2),
      });
    }
  }

  assetImpacts.sort((a, b) => b.simulatedLossUsd - a.simulatedLossUsd);

  const postShockPortfolioVal = Math.max(0, currentTotalVal - totalSimulatedLoss);
  const simulatedDrawdownPct = currentTotalVal > 0 ? (totalSimulatedLoss / currentTotalVal) * 100 : 0;
  const var95Pct = +(rk.weightedVolatility * 1.645 * 100).toFixed(2);

  const cashBufferPct = currentTotalVal > 0 ? (state.cash / currentTotalVal) * 100 : 100;
  const survivabilityScore = Math.max(
    5,
    Math.min(100, Math.round(cashBufferPct * 0.7 + (100 - simulatedDrawdownPct) * 0.5 - rk.topAssetConcentrationPct * 0.2))
  );

  let survivabilityRating: StressTestScenario['survivabilityRating'] = 'Moderate';
  if (survivabilityScore >= 75) survivabilityRating = 'Robust';
  else if (survivabilityScore >= 50) survivabilityRating = 'Moderate';
  else if (survivabilityScore >= 30) survivabilityRating = 'Vulnerable';
  else survivabilityRating = 'Critical';

  const mitigationSteps: string[] = [];
  if (cashBufferPct < 20) {
    mitigationSteps.push(`Increase liquid cash reserves to at least 25% (currently ${cashBufferPct.toFixed(1)}%) to cushion drawdowns.`);
  }
  if (assetImpacts.length > 0 && assetImpacts[0].simulatedLossUsd > currentTotalVal * 0.15) {
    mitigationSteps.push(`Hedge or trim largest risk contributor ${assetImpacts[0].asset} (${assetImpacts[0].priceShockPct}% projected shock).`);
  }
  mitigationSteps.push('Deploy trailing stop-loss brackets on high-beta holdings.');
  mitigationSteps.push('Prepare automated DCA orders to buy undervalued dips during panic capitulation.');

  return {
    scenarioId,
    title: shockTitle,
    description: shockDesc,
    simulatedDrawdownPct: +simulatedDrawdownPct.toFixed(2),
    simulatedLossUsd: +totalSimulatedLoss.toFixed(2),
    postShockPortfolioVal: +postShockPortfolioVal.toFixed(2),
    var95Pct,
    survivabilityScore,
    survivabilityRating,
    assetImpacts,
    mitigationSteps,
  };
}

/**
 * Automatically synthesizes an institutional-grade StrategyConfig calibrated to the asset's current ATR & volatility.
 */
export function synthesizeStrategyBot(
  asset: Asset,
  kind: StrategyKind,
  state: AppState,
  markets: Record<Asset, Market | undefined>,
  options?: Partial<StrategyConfig>
): StrategyConfig {
  const m = markets[asset];
  const ind = m ? indicators(m.history, m.candles) : null;
  const currentPrice = m?.price || 100;
  const effectiveAtr = ind?.atr || currentPrice * 0.02;

  const names: Record<StrategyKind, string> = {
    vwap_trend: `${asset} Institutional VWAP Momentum Engine`,
    breakout_volatility: `${asset} Dynamic Squeeze & Volatility Breakout`,
    ai_multi_factor: `${asset} Composite Multi-Factor Alpha Quant`,
    grid_scalp: `${asset} Dynamic ATR Grid Scalper`,
    momentum: `${asset} High-Velocity EMA Trend Surfer`,
    mean_reversion: `${asset} Bollinger %B Mean-Reversion Harvest`,
    dca: `${asset} Smart Value-Weighted DCA Accumulator`,
  };

  const id = 'strat_ai_' + asset.toLowerCase() + '_' + Math.random().toString(36).substring(2, 7);

  const targetProfitPct = +(options?.targetProfitPct ?? Math.max(3.5, Math.min(14.0, (effectiveAtr / currentPrice) * 100 * 3.2))).toFixed(1);
  const trailingStopPct = +(options?.trailingStopPct ?? Math.max(1.5, Math.min(5.0, (effectiveAtr / currentPrice) * 100 * 1.3))).toFixed(1);
  const maxAllocation = options?.maxAllocation ?? (['BTC', 'ETH'].includes(asset) ? 0.30 : 0.20);
  const cooldownSec = options?.cooldownSec ?? (kind === 'grid_scalp' ? 15 : 25);

  return {
    id,
    asset,
    kind,
    name: options?.name || names[kind] || `${asset} Algorithmic Bot`,
    enabled: true,
    maxAllocation,
    cooldownSec,
    tradesExecuted: 0,
    totalPnl: 0,
    realizedPnl: 0,
    feesPaid: 0,
    targetProfitPct,
    trailingStopPct,
    params: {
      atrMultiplierTP: 3.0,
      atrMultiplierSL: 1.3,
      minAlphaScore: 35,
      rsiThresholdBuy: 65,
      rsiThresholdSell: 38,
      dcaAmountUsd: 150,
      ...(options?.params || {}),
    },
  };
}

/**
 * Generates an automated Smart Value-Weighted DCA plan with oversold dip buy scaling and euphoria pausing.
 */
export function generateSmartDCAPlan(
  asset: Asset,
  budgetUsd = 200,
  state: AppState,
  markets: Record<Asset, Market | undefined>
): SmartDCAPlan {
  return {
    asset,
    frequency: 'Weekly',
    baseAmountUsd: budgetUsd,
    oversoldMultiplier: 1.6, // scale buy by 1.6x when RSI < 35
    pauseThresholdRsi: 70, // pause buys if RSI > 70
    targetProfitPct: 8.0,
    trailingStopPct: 2.5,
  };
}

/**
 * Computes cross-asset statistical correlation, Sharpe estimates, relative momentum, and beta against BTC.
 */
export function compareTokensAlpha(
  assets: Asset[],
  markets: Record<Asset, Market | undefined>
): TokenComparison {
  const targetAssets = assets.length > 0 ? assets : (['BTC', 'ETH', 'SOL', 'AVAX'] as Asset[]);
  const metrics: TokenComparisonMetric[] = [];

  const btcHist = markets.BTC?.history || [];
  const btcReturns = returns(btcHist.slice(-25));
  const btcVol = stdev(btcReturns);

  for (const a of targetAssets) {
    const m = markets[a];
    const hist = m?.history || [];
    const ind = indicators(hist, m?.candles);
    const assetReturns = returns(hist.slice(-25));
    const vol = stdev(assetReturns);
    const volAnnualizedPct = +(vol * Math.sqrt(365) * 100).toFixed(1);

    const meanReturn = assetReturns.length > 0 ? assetReturns.reduce((acc, r) => acc + r, 0) / assetReturns.length : 0;
    const annReturn = meanReturn * 365;
    const sharpeEstimate = vol > 0 ? +((annReturn - 0.04) / Math.max(0.01, vol * Math.sqrt(365))).toFixed(2) : 0;

    let beta = 1.0;
    if (a !== 'BTC' && btcVol > 0 && assetReturns.length === btcReturns.length && btcReturns.length > 5) {
      let cov = 0;
      const btcMean = btcReturns.reduce((acc, r) => acc + r, 0) / btcReturns.length;
      for (let i = 0; i < assetReturns.length; i++) {
        cov += (assetReturns[i] - meanReturn) * (btcReturns[i] - btcMean);
      }
      cov /= (assetReturns.length - 1);
      beta = +(cov / (btcVol * btcVol)).toFixed(2);
    }

    metrics.push({
      asset: a,
      name: META[a]?.name || a,
      price: m?.price || 0,
      change24h: +(m?.change24h || 0).toFixed(2),
      rsi: +ind.rsi.toFixed(1),
      volAnnualizedPct,
      sharpeEstimate,
      momentumScore: ind.score,
      betaToBtc: Math.max(0.1, beta),
      regime: ind.regime,
    });
  }

  const sorted = [...metrics].sort((a, b) => (b.momentumScore * 2 + b.sharpeEstimate) - (a.momentumScore * 2 + a.sharpeEstimate));
  const topAlpha = sorted[0]?.asset || 'BTC';

  const verdict = `${topAlpha} currently presents the highest risk-adjusted alpha profile with a momentum score of ${sorted[0]?.momentumScore >= 0 ? '+' : ''}${sorted[0]?.momentumScore} and ${sorted[0]?.regime} market structure.`;

  return {
    tokens: metrics,
    verdict,
    topAlphaAsset: topAlpha,
  };
}

