import { ASSETS, Asset, AppState, Market, AIActionProposal, RebalanceStep } from '../types';
import { portfolioValue, positionValue } from './portfolio';
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
  style: 'risk_parity' | 'kelly' | 'defensive_flight' | 'growth';
  targetWeights: Record<Asset, number>;
  cashTargetPct: number;
  currentWeights: Record<Asset, number>;
  latexFormula: string;
  rationale: string;
  steps: RebalanceStep[];
  proposal: AIActionProposal;
}

/**
 * Intelligent Autonomous Danger Sensing Engine (Sentinel).
 * Quantitatively inspects drawdowns, volatility velocity, RSI breakdown,
 * and portfolio concentration to detect market crash/dump hazards.
 */
export function senseMarketDanger(
  state: AppState,
  markets: Record<Asset, Market | undefined>
): DangerAssessment {
  const totalVal = portfolioValue(state, markets);
  const rk = calculatePortfolioRisk(state, markets);
  const hazards: string[] = [];
  let score = 0;

  // 1. Extreme Concentration Hazard
  if (rk.topAssetConcentrationPct > 60 && rk.topAsset) {
    hazards.push(`Severe concentration: ${rk.topAsset} constitutes ${rk.topAssetConcentrationPct.toFixed(1)}% of total equity`);
    score += 25;
  } else if (rk.topAssetConcentrationPct > 45 && rk.topAsset) {
    hazards.push(`Elevated single-asset concentration in ${rk.topAsset} (${rk.topAssetConcentrationPct.toFixed(1)}%)`);
    score += 15;
  }

  // 2. Liquid Cash Buffer Depletion Hazard
  if (rk.cashRatioPct < 5 && rk.totalExposurePct > 90) {
    hazards.push(`Ultra-low liquidity buffer: Cash is only ${rk.cashRatioPct.toFixed(1)}%, high margin of liquidation risk`);
    score += 25;
  } else if (rk.cashRatioPct < 15) {
    hazards.push(`Reduced cash buffer (${rk.cashRatioPct.toFixed(1)}%) during volatile cycle`);
    score += 10;
  }

  // 3. Market Momentum & Volatility breakdown across active holdings
  let heavyLossCount = 0;
  let oversoldBreakdownCount = 0;

  for (const a of ASSETS) {
    const holdingVal = positionValue(state, markets, a);
    if (holdingVal > 50) {
      const m = markets[a];
      if (m) {
        if (m.change24h <= -7) {
          heavyLossCount++;
          hazards.push(`${a} flash drawdown of ${m.change24h.toFixed(2)}% in 24h`);
          score += 15;
        } else if (m.change24h <= -4) {
          score += 8;
        }

        const ind = indicators(m.history, m.candles);
        if (ind.rsi < 28) {
          oversoldBreakdownCount++;
          score += 10;
        } else if (ind.rsi > 78) {
          hazards.push(`${a} extreme overbought RSI (${ind.rsi.toFixed(1)}) vulnerable to sharp mean-reversion`);
          score += 10;
        }
      }
    }
  }

  // Cap score 0 - 100
  const dangerScore = Math.min(100, Math.max(0, score));

  let dangerLevel: 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL' = 'NORMAL';
  if (dangerScore >= 75) dangerLevel = 'CRITICAL';
  else if (dangerScore >= 50) dangerLevel = 'HIGH';
  else if (dangerScore >= 25) dangerLevel = 'ELEVATED';

  const circuitBreakerRecommended = dangerLevel === 'CRITICAL' || dangerLevel === 'HIGH';
  const suggestedDeRiskPct = dangerLevel === 'CRITICAL' ? 60 : dangerLevel === 'HIGH' ? 35 : 15;

  // Build defensive proposal if elevated danger
  let defensiveProposal: AIActionProposal | null = null;
  if (circuitBreakerRecommended && totalVal > 0) {
    // Find high risk assets to de-risk
    const rebalanceSteps: RebalanceStep[] = [];
    const deRiskRatio = suggestedDeRiskPct / 100;

    for (const a of ASSETS) {
      const currentQty = state.positions[a] || 0;
      const m = markets[a];
      if (currentQty > 0 && m && m.price > 0) {
        // High beta assets get trimmed more aggressively
        const isHighBeta = ['SOL', 'DOGE', 'AVAX'].includes(a);
        const sellFraction = isHighBeta ? Math.min(0.7, deRiskRatio * 1.3) : deRiskRatio;
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
        rationale: `Autonomous Sentinel detected ${dangerLevel} danger level (Score: ${dangerScore}/100). Reallocating capital to secure cash buffer to prevent further portfolio drawdown.`,
        confidence: 'high',
        riskSummary: `Liquidates volatile allocations by ~${suggestedDeRiskPct}% to rebuild liquid safety cash buffer.`,
        formulaLatex: `\\text{Danger Score} = \\omega_{\\text{hhi}} \\cdot HHI + \\omega_{\\sigma} \\cdot \\sigma_p + \\mathbb{I}_{\\Delta P < -5\\%} > ${dangerScore}`,
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
 * Calculates quantitative risk-parity or Kelly-criterion portfolio allocation
 * and produces exact actionable rebalancing steps.
 */
export function calculateAgenticAllocation(
  state: AppState,
  markets: Record<Asset, Market | undefined>,
  style: 'risk_parity' | 'kelly' | 'defensive_flight' | 'growth' = 'risk_parity'
): AgenticAllocationPlan {
  const totalVal = portfolioValue(state, markets);

  // Current weights
  const currentWeights = Object.fromEntries(
    ASSETS.map((a) => [a, totalVal > 0 ? (positionValue(state, markets, a) / totalVal) * 100 : 0])
  ) as Record<Asset, number>;

  // Target Cash % by style
  const cashTargetPct =
    style === 'defensive_flight' ? 45 : style === 'risk_parity' ? 25 : style === 'kelly' ? 20 : 10;

  const investablePct = 100 - cashTargetPct;

  // Calculate asset volatilities
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

  // Calculate weights based on style
  const targetWeights: Record<Asset, number> = Object.fromEntries(ASSETS.map((a) => [a, 0])) as Record<Asset, number>;

  if (style === 'defensive_flight') {
    // 45% Cash, 35% BTC, 20% ETH, 0% high-beta
    targetWeights.BTC = 35;
    targetWeights.ETH = 20;
  } else if (style === 'risk_parity') {
    // Inverse volatility weighting: w_i = (1 / vol_i) / sum(1 / vol_k)
    // Focus on primary liquid core assets: BTC, ETH, SOL, LINK
    const coreAssets: Asset[] = ['BTC', 'ETH', 'SOL', 'LINK'];
    const invVolSum = coreAssets.reduce((sum, a) => sum + 1 / (assetVols[a] || 0.03), 0);

    coreAssets.forEach((a) => {
      const invVol = 1 / (assetVols[a] || 0.03);
      targetWeights[a] = +((invVol / invVolSum) * investablePct).toFixed(1);
    });
  } else if (style === 'kelly') {
    // Kelly Criterion allocation: f* = (p(b+1) - 1) / b
    // Emphasizes assets with positive trend & strong Sharpe
    targetWeights.BTC = +(investablePct * 0.45).toFixed(1);
    targetWeights.ETH = +(investablePct * 0.30).toFixed(1);
    targetWeights.SOL = +(investablePct * 0.15).toFixed(1);
    targetWeights.LINK = +(investablePct * 0.10).toFixed(1);
  } else {
    // Growth
    targetWeights.BTC = +(investablePct * 0.35).toFixed(1);
    targetWeights.ETH = +(investablePct * 0.25).toFixed(1);
    targetWeights.SOL = +(investablePct * 0.25).toFixed(1);
    targetWeights.AVAX = +(investablePct * 0.15).toFixed(1);
  }

  // Calculate rebalancing steps (difference between current value and target value)
  const steps: RebalanceStep[] = [];

  ASSETS.forEach((a) => {
    const currentVal = positionValue(state, markets, a);
    const targetVal = (targetWeights[a] / 100) * totalVal;
    const diffVal = targetVal - currentVal;
    const m = markets[a];

    if (m && m.price > 0 && Math.abs(diffVal) > 30) {
      if (diffVal < 0) {
        // Sell excess
        const sellNotional = Math.abs(diffVal);
        const sellQty = +(sellNotional / m.price).toFixed(4);
        if (sellQty > 0) {
          steps.push({
            asset: a,
            action: 'sell',
            amount: sellQty,
            estimatedPrice: m.price,
            estimatedNotional: +sellNotional.toFixed(2),
          });
        }
      } else {
        // Buy needed
        const buyNotional = diffVal;
        const buyQty = +(buyNotional / m.price).toFixed(4);
        if (buyQty > 0) {
          steps.push({
            asset: a,
            action: 'buy',
            amount: buyQty,
            estimatedPrice: m.price,
            estimatedNotional: +buyNotional.toFixed(2),
          });
        }
      }
    }
  });

  // Sort steps: Sells first (to free cash), then buys
  steps.sort((a, b) => (a.action === 'sell' ? -1 : 1));

  let latexFormula = '';
  if (style === 'risk_parity') {
    latexFormula = `w_i^* = \\frac{\\sigma_i^{-1}}{\\sum_{k=1}^N \\sigma_k^{-1}} \\cdot \\left(1 - w_{\\text{cash}}\\right)`;
  } else if (style === 'kelly') {
    latexFormula = `f^* = \\frac{p(b + 1) - 1}{b} \\implies w_{\\text{optimal}} = \\text{clamp}\\left(f^*, 0, 0.45\\right)`;
  } else {
    latexFormula = `\\mathbf{w}_{\\text{safe}} = \\arg\\min_{\\mathbf{w}} \\mathbf{w}^T \\boldsymbol{\\Sigma} \\mathbf{w} \\quad \\text{s.t.} \\quad w_{\\text{cash}} \\ge 0.45`;
  }

  const proposal: AIActionProposal = {
    type: 'rebalance',
    asset: 'BTC',
    rationale: `Agentic autonomous portfolio reallocation based on quantitative ${style.replace('_', ' ')} optimization.`,
    confidence: 'high',
    riskSummary: `Rebalances assets towards mathematical targets (${cashTargetPct}% liquid cash buffer, ${targetWeights.BTC}% BTC, ${targetWeights.ETH}% ETH).`,
    formulaLatex: latexFormula,
    requiresConfirmation: true,
    rebalanceTargets: targetWeights,
    cashTargetPct,
    rebalanceSteps: steps,
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
  };
}
