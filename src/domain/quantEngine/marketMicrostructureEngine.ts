import {
  KylesLambdaMetrics,
  AmihudIlliquidity,
  OrderFlowImbalance,
  AlmgrenChrissSchedule,
} from './types';

/**
 * Calculates Kyle's Lambda (price impact per unit of signed volume flow).
 * Regression model: Delta P_t = lambda * Q_t + epsilon_t
 */
export function calculateKylesLambda(
  priceChanges: number[],
  signedVolumes: number[]
): KylesLambdaMetrics {
  const n = Math.min(priceChanges.length, signedVolumes.length);
  if (n < 5) {
    return {
      lambda: 0.0001,
      priceImpactBpsPerUnit: 0.01,
      rSquared: 0,
      interpretation: 'Insufficient tick sample size for Kyle lambda regression; utilizing default baseline.',
    };
  }

  const meanP = priceChanges.reduce((a, b) => a + b, 0) / n;
  const meanQ = signedVolumes.reduce((a, b) => a + b, 0) / n;

  let cov = 0;
  let varQ = 0;
  let varP = 0;

  for (let i = 0; i < n; i++) {
    const diffQ = signedVolumes[i] - meanQ;
    const diffP = priceChanges[i] - meanP;
    cov += diffP * diffQ;
    varQ += diffQ * diffQ;
    varP += diffP * diffP;
  }

  const lambda = varQ > 1e-9 ? cov / varQ : 0;
  const correlation = Math.sqrt(varQ * varP) > 1e-9 ? cov / Math.sqrt(varQ * varP) : 0;
  const rSquared = Math.max(0, Math.min(1, correlation * correlation));

  const bpsPerUnit = Math.abs(lambda) * 10000;

  let interpretation = 'Normal institutional market depth';
  if (bpsPerUnit > 5) {
    interpretation = 'Severe adverse selection & thin order book depth. High slippage vulnerability.';
  } else if (bpsPerUnit < 0.5) {
    interpretation = 'Extremely deep, institutional limit order book with minimal price impact.';
  }

  return {
    lambda: +lambda.toFixed(6),
    priceImpactBpsPerUnit: +bpsPerUnit.toFixed(4),
    rSquared: +rSquared.toFixed(3),
    interpretation,
  };
}

/**
 * Calculates Amihud Illiquidity Ratio (Amihud 2002).
 * ILLIQ = (1 / T) * sum( |R_t| / (Volume_t * Price_t) )
 */
export function calculateAmihudIlliquidity(
  returns: number[],
  turnoverUsdOrInr: number[]
): AmihudIlliquidity {
  const n = Math.min(returns.length, turnoverUsdOrInr.length);
  if (n === 0) {
    return {
      illiqValue: 0.01,
      liquidityTier: 'Moderate Liquidity',
      estimatedSpreadBps: 5,
    };
  }

  let sum = 0;
  let validCount = 0;

  for (let i = 0; i < n; i++) {
    const turnover = turnoverUsdOrInr[i];
    if (turnover > 1000) {
      // turnover in millions to scale Amihud metric into readable units
      const turnoverMillions = turnover / 1_000_000;
      sum += Math.abs(returns[i]) / turnoverMillions;
      validCount++;
    }
  }

  const illiqValue = validCount > 0 ? sum / validCount : 0.05;

  let liquidityTier: AmihudIlliquidity['liquidityTier'] = 'Moderate Liquidity';
  let estimatedSpreadBps = 5;

  if (illiqValue < 0.02) {
    liquidityTier = 'Deep Liquidity';
    estimatedSpreadBps = 1.5;
  } else if (illiqValue < 0.15) {
    liquidityTier = 'Moderate Liquidity';
    estimatedSpreadBps = 6.0;
  } else if (illiqValue < 0.50) {
    liquidityTier = 'Illiquid';
    estimatedSpreadBps = 18.0;
  } else {
    liquidityTier = 'High Slippage Risk';
    estimatedSpreadBps = 45.0;
  }

  return {
    illiqValue: +illiqValue.toFixed(5),
    liquidityTier,
    estimatedSpreadBps,
  };
}

/**
 * Computes Order Flow Imbalance (OFI) from top-of-book quotes.
 * OFI_t = I_{p_b^t >= p_b^{t-1}} * q_b^t - I_{p_b^t <= p_b^{t-1}} * q_b^{t-1}
 *       - I_{p_a^t <= p_a^{t-1}} * q_a^t + I_{p_a^t >= p_a^{t-1}} * q_a^{t-1}
 */
export function calculateOrderFlowImbalance(
  prevBidPrice: number,
  prevBidQty: number,
  prevAskPrice: number,
  prevAskQty: number,
  currBidPrice: number,
  currBidQty: number,
  currAskPrice: number,
  currAskQty: number
): OrderFlowImbalance {
  let deltaBid = 0;
  if (currBidPrice > prevBidPrice) {
    deltaBid = currBidQty;
  } else if (currBidPrice === prevBidPrice) {
    deltaBid = currBidQty - prevBidQty;
  } else {
    deltaBid = -prevBidQty;
  }

  let deltaAsk = 0;
  if (currAskPrice < prevAskPrice) {
    deltaAsk = currAskQty;
  } else if (currAskPrice === prevAskPrice) {
    deltaAsk = currAskQty - prevAskQty;
  } else {
    deltaAsk = -prevAskQty;
  }

  const ofiValue = deltaBid - deltaAsk;
  const totalVolume = Math.max(1, currBidQty + currAskQty + prevBidQty + prevAskQty);
  const normalizedOfi = Math.max(-1, Math.min(1, (2 * ofiValue) / totalVolume));

  let pressureDirection: OrderFlowImbalance['pressureDirection'] = 'Neutral';
  if (normalizedOfi > 0.4) pressureDirection = 'Strong Buying';
  else if (normalizedOfi > 0.1) pressureDirection = 'Moderate Buying';
  else if (normalizedOfi < -0.4) pressureDirection = 'Aggressive Selling';
  else if (normalizedOfi < -0.1) pressureDirection = 'Moderate Selling';

  return {
    ofiValue: +ofiValue.toFixed(1),
    normalizedOfi: +normalizedOfi.toFixed(3),
    pressureDirection,
  };
}

/**
 * Almgren-Chriss Optimal Execution Trajectory (Almgren & Chriss 2000).
 * Balances market impact against timing/volatility risk using a hyperbolic schedule.
 * x_j = X * sinh(kappa * (T - t_j)) / sinh(kappa * T)
 */
export function computeAlmgrenChrissSchedule(
  totalQuantity: number,
  timeHorizonMinutes: number = 60,
  intervals: number = 12,
  annualVolatility: number = 0.25,
  riskAversion: number = 1e-5,
  temporaryImpactEta: number = 2.5e-6
): AlmgrenChrissSchedule {
  const dt = timeHorizonMinutes / intervals;
  const sigmaPerMin = (annualVolatility / Math.sqrt(252 * 375)); // volatility per minute for Indian equities (375 min session)

  // Urgency parameter kappa = sqrt(lambda_risk * sigma^2 / eta)
  const kappa = Math.sqrt(Math.max(1e-8, (riskAversion * sigmaPerMin * sigmaPerMin) / temporaryImpactEta));
  const T = timeHorizonMinutes;

  const trajectory: AlmgrenChrissSchedule['trajectory'] = [];
  let remainingShares = totalQuantity;

  const sinhKappaT = Math.sinh(kappa * T);

  for (let step = 1; step <= intervals; step++) {
    const tCurrent = step * dt;
    const theoreticalRemaining = (totalQuantity * Math.sinh(kappa * (T - tCurrent))) / (sinhKappaT || 1);
    const sharesToTrade = Math.max(0, remainingShares - theoreticalRemaining);

    // Expected temporary price impact
    const tradeRatePerMin = sharesToTrade / dt;
    const impactPct = temporaryImpactEta * tradeRatePerMin * 100;

    trajectory.push({
      minute: Math.round(tCurrent),
      remainingShares: Math.max(0, Math.round(theoreticalRemaining)),
      sharesToTrade: Math.round(sharesToTrade),
      expectedPriceImpactPct: +impactPct.toFixed(4),
    });

    remainingShares = theoreticalRemaining;
  }

  const halfLifeMinutes = Math.log(2) / (kappa || 0.01);

  let recommendedExecution: AlmgrenChrissSchedule['recommendedExecution'] = 'TWAP';
  if (halfLifeMinutes < 15) {
    recommendedExecution = 'Aggressive Liquidation';
  } else if (halfLifeMinutes < 45) {
    recommendedExecution = 'VWAP';
  } else {
    recommendedExecution = 'Passive Staged Brackets';
  }

  return {
    totalQuantity,
    timeHorizonMinutes,
    intervals,
    trajectory,
    halfLifeMinutes: +halfLifeMinutes.toFixed(1),
    recommendedExecution,
  };
}

/**
 * Generates an institutional Microstructure & Execution explanation with KaTeX formulas.
 */
export function generateMicrostructureExplanation(): string {
  return `### Market Microstructure, Price Impact & Optimal Execution Analytics

#### 1. Kyle's Lambda (Adverse Selection & Depth Metric)
Kyle's foundational model of order-driven markets decomposes price revision into informed order flow:
$$\\Delta P_t = \\lambda \\cdot Q_t + \\epsilon_t, \\quad \\lambda = \\frac{\\text{Cov}(\\Delta P, Q)}{\\text{Var}(Q)}$$
- $\\lambda$ measures price elasticity to order flow. In deep bluechip stocks like Reliance or TCS, $\\lambda$ is fractions of a basis point per ₹10 Lakhs.
- In low-liquidity midcaps or thin order books, elevated $\\lambda$ causes severe slippage and predatory adverse selection.

#### 2. Almgren-Chriss Optimal Liquidation Trajectory
Balancing immediate market impact against ongoing volatility risk:
$$\\min_{\\{n_k\\}} \\mathbb{E}[x] + \\lambda_{\\text{risk}} \\text{Var}(x)$$
Optimal remaining position at time $t$:
$$x(t) = X \\cdot \\frac{\\sinh(\\kappa(T - t))}{\\sinh(\\kappa T)}, \\quad \\kappa = \\sqrt{\\frac{\\lambda_{\\text{risk}} \\sigma^2}{\\eta}}$$
- When volatility risk $\\sigma$ is extreme, $\\kappa$ increases, shifting the schedule toward aggressive front-loaded liquidation.
- When market impact $\\eta$ dominates, $\\kappa \\to 0$, converging to linear TWAP (Time-Weighted Average Price).

#### 3. Maximal Extractable Value (MEV) & Loss-Versus-Rebalancing (LVR)
In decentralized automated market makers (AMMs), liquidity providers incur non-hedged arbitrage losses modeled by LVR:
$$\\text{LVR} = \\int_0^T \\frac{\\sigma^2}{8} S_t \\sqrt{L} \\, dt$$
Sandwich searchers execute atomic bundle reordering in block mempools:
$$P_{\\text{front-run}} = P_0 \\cdot \\left(1 + \\frac{\\Delta x}{x}\\right)^2 \\implies \\text{Extractable Spread} = P_{\\text{back-run}} - P_{\\text{front-run}} - \\text{Priority Gas Fee}$$`;
}
