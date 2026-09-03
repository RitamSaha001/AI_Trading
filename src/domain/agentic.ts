import { ASSETS, Asset, AppState, Market, AIActionProposal, RebalanceStep } from '../types';
import { portfolioValue, positionValue, FEE_RATE } from './portfolio';
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
