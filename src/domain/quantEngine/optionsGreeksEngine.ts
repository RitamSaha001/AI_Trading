import {
  BlackScholesInputs,
  GreeksResult,
  OptionPriceAndGreeks,
  MultiLegStrategyAnalysis,
  OptionsLeg,
  ImpliedVolResult,
} from './types';

// Standard Normal Probability Density Function: N'(x) = (1 / sqrt(2*pi)) * exp(-0.5 * x^2)
export function standardNormalPdf(x: number): number {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

// Cumulative Standard Normal Distribution N(x)
// High-precision Abramowitz & Stegun 7.1.26 polynomial approximation (max error < 1.5e-7)
export function cumulativeNormal(x: number): number {
  if (x < -10) return 0;
  if (x > 10) return 1;

  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c = 1 / Math.sqrt(2 * Math.PI);

  if (x >= 0) {
    const t = 1 / (1 + p * x);
    return 1 - c * Math.exp(-0.5 * x * x) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  } else {
    const t = 1 / (1 - p * x);
    return c * Math.exp(-0.5 * x * x) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  }
}

/**
 * Calculates closed-form Black-Scholes-Merton European option prices and complete Greeks.
 */
export function calculateBlackScholesAndGreeks(inputs: BlackScholesInputs): OptionPriceAndGreeks {
  const {
    spotPrice: S,
    strikePrice: K,
    timeToExpiryYears: T,
    volatility: sigma,
    riskFreeRate: r,
    dividendYield: q = 0,
  } = inputs;

  // Boundary condition handling for near-expiry or zero volatility
  if (T <= 1e-6 || sigma <= 1e-6) {
    const intrinsicCall = Math.max(0, S - K);
    const intrinsicPut = Math.max(0, K - S);
    const zeroGreeks: GreeksResult = {
      delta: S >= K ? 1 : 0,
      gamma: 0,
      vega: 0,
      theta: 0,
      rho: 0,
      vanna: 0,
      volga: 0,
    };
    return {
      callPrice: intrinsicCall,
      putPrice: intrinsicPut,
      callGreeks: zeroGreeks,
      putGreeks: { ...zeroGreeks, delta: S <= K ? -1 : 0 },
      d1: 0,
      d2: 0,
    };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const expNegQT = Math.exp(-q * T);
  const expNegRT = Math.exp(-r * T);

  const Nd1 = cumulativeNormal(d1);
  const Nd2 = cumulativeNormal(d2);
  const NnegD1 = cumulativeNormal(-d1);
  const NnegD2 = cumulativeNormal(-d2);
  const pdfD1 = standardNormalPdf(d1);

  // Closed-form European prices
  const callPrice = S * expNegQT * Nd1 - K * expNegRT * Nd2;
  const putPrice = K * expNegRT * NnegD2 - S * expNegQT * NnegD1;

  // Shared Greeks
  const gamma = (expNegQT * pdfD1) / (S * sigma * sqrtT);
  // Vega (derivative with respect to sigma; conventionally expressed per 1% change: vega / 100)
  const rawVega = S * expNegQT * pdfD1 * sqrtT;
  const vega = rawVega / 100;

  // Higher-order cross Greeks
  const vanna = (-expNegQT * pdfD1 * d2) / sigma;
  const volga = (rawVega * d1 * d2) / sigma;

  // Call-specific Greeks
  const callDelta = expNegQT * Nd1;
  const callThetaAnnual = -(S * expNegQT * pdfD1 * sigma) / (2 * sqrtT) - r * K * expNegRT * Nd2 + q * S * expNegQT * Nd1;
  const callThetaDaily = callThetaAnnual / 365; // 1-day decay
  const callRho = (K * T * expNegRT * Nd2) / 100; // per 1% interest rate change

  // Put-specific Greeks
  const putDelta = expNegQT * (Nd1 - 1);
  const putThetaAnnual = -(S * expNegQT * pdfD1 * sigma) / (2 * sqrtT) + r * K * expNegRT * NnegD2 - q * S * expNegQT * NnegD1;
  const putThetaDaily = putThetaAnnual / 365;
  const putRho = (-K * T * expNegRT * NnegD2) / 100;

  return {
    callPrice: Math.max(0, callPrice),
    putPrice: Math.max(0, putPrice),
    callGreeks: {
      delta: callDelta,
      gamma,
      vega,
      theta: callThetaDaily,
      rho: callRho,
      vanna,
      volga,
    },
    putGreeks: {
      delta: putDelta,
      gamma,
      vega,
      theta: putThetaDaily,
      rho: putRho,
      vanna,
      volga,
    },
    d1,
    d2,
  };
}

/**
 * Numerically solves for Implied Volatility (IV) using Newton-Raphson with Brenner-Subrahmanyam seed.
 */
export function calculateImpliedVolatility(
  targetPrice: number,
  spotPrice: number,
  strikePrice: number,
  timeToExpiryYears: number,
  riskFreeRate: number,
  isCall: boolean = true,
  maxIterations: number = 50,
  tolerance: number = 1e-5
): ImpliedVolResult {
  if (timeToExpiryYears <= 0 || targetPrice <= 0) {
    return { impliedVol: 0, converged: false, iterations: 0, residualError: 0 };
  }

  // Intrinsic value check
  const intrinsic = isCall ? Math.max(0, spotPrice - strikePrice) : Math.max(0, strikePrice - spotPrice);
  if (targetPrice < intrinsic) {
    return { impliedVol: 0.01, converged: false, iterations: 0, residualError: intrinsic - targetPrice };
  }

  // Initial volatility guess via Brenner-Subrahmanyam approximation for at-the-money options
  let sigma = Math.sqrt((2 * Math.PI) / timeToExpiryYears) * (targetPrice / spotPrice);
  sigma = Math.min(Math.max(sigma, 0.05), 3.0); // Clamp initial seed between 5% and 300%

  for (let i = 0; i < maxIterations; i++) {
    const result = calculateBlackScholesAndGreeks({
      spotPrice,
      strikePrice,
      timeToExpiryYears,
      volatility: sigma,
      riskFreeRate,
    });

    const currentPrice = isCall ? result.callPrice : result.putPrice;
    const diff = currentPrice - targetPrice;

    if (Math.abs(diff) < tolerance) {
      return { impliedVol: sigma, converged: true, iterations: i + 1, residualError: diff };
    }

    // Vega is needed in raw decimal terms (not /100)
    const rawVega = (isCall ? result.callGreeks.vega : result.putGreeks.vega) * 100;
    if (rawVega < 1e-8) {
      // Fallback: slight perturbation if vega is too small
      sigma += (diff < 0 ? 0.02 : -0.02);
    } else {
      const step = diff / rawVega;
      sigma -= step;
    }

    // Keep sigma within sensible physical bounds [0.001, 10.0]
    sigma = Math.min(Math.max(sigma, 0.001), 10.0);
  }

  return { impliedVol: sigma, converged: false, iterations: maxIterations, residualError: tolerance * 2 };
}

/**
 * Analyzes multi-leg options structures (e.g. Iron Condor, Straddle, Vertical Spreads)
 * computing net Greeks, breakeven prices, and payoff points.
 */
export function analyzeMultiLegStrategy(
  strategyName: string,
  legs: OptionsLeg[],
  spotPrice: number,
  riskFreeRate: number = 0.07,
  impliedVol: number = 0.20
): MultiLegStrategyAnalysis {
  let netDebitOrCredit = 0;
  let netDelta = 0;
  let netGamma = 0;
  let netVega = 0;
  let netTheta = 0;
  let netRho = 0;
  let netVanna = 0;
  let netVolga = 0;

  for (const leg of legs) {
    const sign = leg.side === 'buy' ? 1 : -1;
    netDebitOrCredit += sign * leg.premium * leg.quantity;

    const bs = calculateBlackScholesAndGreeks({
      spotPrice,
      strikePrice: leg.strike,
      timeToExpiryYears: Math.max(1 / 365, leg.expiryDays / 365),
      volatility: impliedVol,
      riskFreeRate,
    });

    const greeks = leg.type === 'call' ? bs.callGreeks : bs.putGreeks;
    netDelta += sign * greeks.delta * leg.quantity;
    netGamma += sign * greeks.gamma * leg.quantity;
    netVega += sign * greeks.vega * leg.quantity;
    netTheta += sign * greeks.theta * leg.quantity;
    netRho += sign * greeks.rho * leg.quantity;
    netVanna += sign * greeks.vanna * leg.quantity;
    netVolga += sign * greeks.volga * leg.quantity;
  }

  // Generate discrete payoff curve from -25% to +25% of current spot price
  const payoffPoints: { underlyingPrice: number; pnl: number }[] = [];
  const minPrice = spotPrice * 0.75;
  const maxPrice = spotPrice * 1.25;
  const step = (maxPrice - minPrice) / 50;

  for (let p = minPrice; p <= maxPrice; p += step) {
    let pnl = -netDebitOrCredit;
    for (const leg of legs) {
      const sign = leg.side === 'buy' ? 1 : -1;
      let terminalValue = 0;
      if (leg.type === 'call') {
        terminalValue = Math.max(0, p - leg.strike);
      } else {
        terminalValue = Math.max(0, leg.strike - p);
      }
      pnl += sign * terminalValue * leg.quantity;
    }
    payoffPoints.push({ underlyingPrice: +p.toFixed(2), pnl: +pnl.toFixed(2) });
  }

  // Find approximate breakeven points (where pnl crosses 0)
  const breakevens: number[] = [];
  for (let i = 1; i < payoffPoints.length; i++) {
    const prev = payoffPoints[i - 1];
    const curr = payoffPoints[i];
    if ((prev.pnl <= 0 && curr.pnl >= 0) || (prev.pnl >= 0 && curr.pnl <= 0)) {
      // Linear interpolation
      const ratio = Math.abs(prev.pnl) / (Math.abs(prev.pnl) + Math.abs(curr.pnl) || 1);
      const be = prev.underlyingPrice + ratio * (curr.underlyingPrice - prev.underlyingPrice);
      breakevens.push(+be.toFixed(2));
    }
  }

  const pnlValues = payoffPoints.map((pt) => pt.pnl);
  const minPnl = Math.min(...pnlValues);
  const maxPnl = Math.max(...pnlValues);

  return {
    strategyName,
    legs,
    netDebitOrCredit: +netDebitOrCredit.toFixed(2),
    maxProfit: maxPnl > 1e6 ? 'unlimited' : +maxPnl.toFixed(2),
    maxLoss: minPnl < -1e6 ? 'unlimited' : +Math.abs(minPnl).toFixed(2),
    breakevens,
    netGreeks: {
      delta: +netDelta.toFixed(4),
      gamma: +netGamma.toFixed(5),
      vega: +netVega.toFixed(4),
      theta: +netTheta.toFixed(4),
      rho: +netRho.toFixed(4),
      vanna: +netVanna.toFixed(4),
      volga: +netVolga.toFixed(4),
    },
    payoffPoints,
  };
}

/**
 * Builds standard NSE / Indian derivatives strategies for NIFTY / BANKNIFTY or bluechip equities.
 */
export function buildNSEDerivativesStrategy(
  kind: 'iron_condor' | 'straddle' | 'bull_call_spread' | 'bear_put_spread',
  spotPrice: number,
  atmIv: number = 0.15,
  daysToExpiry: number = 7
): MultiLegStrategyAnalysis {
  const roundToStrike = (p: number, step: number) => Math.round(p / step) * step;
  const strikeStep = spotPrice > 15000 ? 100 : spotPrice > 5000 ? 50 : 20;
  const atmStrike = roundToStrike(spotPrice, strikeStep);
  const T = Math.max(1 / 365, daysToExpiry / 365);
  const r = 0.07;

  if (kind === 'straddle') {
    const bs = calculateBlackScholesAndGreeks({
      spotPrice,
      strikePrice: atmStrike,
      timeToExpiryYears: T,
      volatility: atmIv,
      riskFreeRate: r,
    });
    return analyzeMultiLegStrategy(
      'Long ATM Straddle',
      [
        { type: 'call', side: 'buy', strike: atmStrike, expiryDays: daysToExpiry, premium: bs.callPrice, quantity: 1 },
        { type: 'put', side: 'buy', strike: atmStrike, expiryDays: daysToExpiry, premium: bs.putPrice, quantity: 1 },
      ],
      spotPrice,
      r,
      atmIv
    );
  }

  if (kind === 'iron_condor') {
    const otmPutLong = roundToStrike(spotPrice * 0.96, strikeStep);
    const otmPutShort = roundToStrike(spotPrice * 0.98, strikeStep);
    const otmCallShort = roundToStrike(spotPrice * 1.02, strikeStep);
    const otmCallLong = roundToStrike(spotPrice * 1.04, strikeStep);

    const getPrice = (k: number, isCall: boolean) => {
      const res = calculateBlackScholesAndGreeks({
        spotPrice,
        strikePrice: k,
        timeToExpiryYears: T,
        volatility: atmIv,
        riskFreeRate: r,
      });
      return isCall ? res.callPrice : res.putPrice;
    };

    return analyzeMultiLegStrategy(
      'Market-Neutral Iron Condor',
      [
        { type: 'put', side: 'buy', strike: otmPutLong, expiryDays: daysToExpiry, premium: getPrice(otmPutLong, false), quantity: 1 },
        { type: 'put', side: 'sell', strike: otmPutShort, expiryDays: daysToExpiry, premium: getPrice(otmPutShort, false), quantity: 1 },
        { type: 'call', side: 'sell', strike: otmCallShort, expiryDays: daysToExpiry, premium: getPrice(otmCallShort, true), quantity: 1 },
        { type: 'call', side: 'buy', strike: otmCallLong, expiryDays: daysToExpiry, premium: getPrice(otmCallLong, true), quantity: 1 },
      ],
      spotPrice,
      r,
      atmIv
    );
  }

  if (kind === 'bull_call_spread') {
    const buyStrike = atmStrike;
    const sellStrike = atmStrike + strikeStep * 2;
    const resBuy = calculateBlackScholesAndGreeks({ spotPrice, strikePrice: buyStrike, timeToExpiryYears: T, volatility: atmIv, riskFreeRate: r });
    const resSell = calculateBlackScholesAndGreeks({ spotPrice, strikePrice: sellStrike, timeToExpiryYears: T, volatility: atmIv, riskFreeRate: r });

    return analyzeMultiLegStrategy(
      'Bull Call Spread',
      [
        { type: 'call', side: 'buy', strike: buyStrike, expiryDays: daysToExpiry, premium: resBuy.callPrice, quantity: 1 },
        { type: 'call', side: 'sell', strike: sellStrike, expiryDays: daysToExpiry, premium: resSell.callPrice, quantity: 1 },
      ],
      spotPrice,
      r,
      atmIv
    );
  }

  // bear_put_spread
  const buyStrike = atmStrike;
  const sellStrike = atmStrike - strikeStep * 2;
  const resBuy = calculateBlackScholesAndGreeks({ spotPrice, strikePrice: buyStrike, timeToExpiryYears: T, volatility: atmIv, riskFreeRate: r });
  const resSell = calculateBlackScholesAndGreeks({ spotPrice, strikePrice: sellStrike, timeToExpiryYears: T, volatility: atmIv, riskFreeRate: r });

  return analyzeMultiLegStrategy(
    'Bear Put Spread',
    [
      { type: 'put', side: 'buy', strike: buyStrike, expiryDays: daysToExpiry, premium: resBuy.putPrice, quantity: 1 },
      { type: 'put', side: 'sell', strike: sellStrike, expiryDays: daysToExpiry, premium: resSell.putPrice, quantity: 1 },
    ],
    spotPrice,
    r,
    atmIv
  );
}

/**
 * Formats options analytical explanation with rich KaTeX equations and Greeks matrix.
 */
export function generateOptionsGreeksExplanation(
  asset: string,
  spotPrice: number,
  atmIv: number = 0.22
): string {
  const K = spotPrice;
  const T = 30 / 365;
  const r = 0.07;
  const bs = calculateBlackScholesAndGreeks({
    spotPrice,
    strikePrice: K,
    timeToExpiryYears: T,
    volatility: atmIv,
    riskFreeRate: r,
  });

  return `### Quantitative Options Surface, Skew & Analytical Greeks for \`${asset}\`

#### 1. Black-Scholes-Merton Partial Differential Equation
The arbitrage-free price of any derivative $V(S, t)$ satisfies:
$$\\frac{\\partial V}{\\partial t} + \\frac{1}{2}\\sigma^2 S^2 \\frac{\\partial^2 V}{\\partial S^2} + r S \\frac{\\partial V}{\\partial S} - r V = 0$$

Analytical solution for European Call ($C$) and Put ($P$):
$$d_1 = \\frac{\\ln(S/K) + (r + \\frac{1}{2}\\sigma^2)T}{\\sigma\\sqrt{T}}, \\quad d_2 = d_1 - \\sigma\\sqrt{T}$$
$$C = S \\cdot \\mathcal{N}(d_1) - K e^{-rT} \\mathcal{N}(d_2)$$
$$P = K e^{-rT} \\mathcal{N}(-d_2) - S \\cdot \\mathcal{N}(-d_1)$$

#### 2. Live Analytical Greeks Matrix (30D ATM Expiry, $\\sigma = ${(atmIv * 100).toFixed(1)}\\%$)
| Greek Metric | Symbol & Partial Derivative | Call Value | Put Value | Institutional Interpretation |
| :--- | :--- | :--- | :--- | :--- |
| **Delta** | $\\Delta = \\frac{\\partial V}{\\partial S}$ | \`+${bs.callGreeks.delta.toFixed(3)}\` | \`${bs.putGreeks.delta.toFixed(3)}\` | Directional exposure per ₹1 underlying move |
| **Gamma** | $\\Gamma = \\frac{\\partial^2 V}{\\partial S^2}$ | \`${bs.callGreeks.gamma.toFixed(5)}\` | \`${bs.putGreeks.gamma.toFixed(5)}\` | Rate of Delta change; peak at ATM strike |
| **Vega** | $\\mathcal{V} = \\frac{\\partial V}{\\partial \\sigma}$ | \`₹${bs.callGreeks.vega.toFixed(2)}\` | \`₹${bs.putGreeks.vega.toFixed(2)}\` | Price sensitivity per 1.0% shift in Implied Volatility |
| **Theta (Daily)** | $\\Theta = \\frac{\\partial V}{\\partial t}$ | \`-₹${Math.abs(bs.callGreeks.theta).toFixed(2)}\` | \`-₹${Math.abs(bs.putGreeks.theta).toFixed(2)}\` | Expected 24h calendar time-decay |
| **Rho** | $\\rho = \\frac{\\partial V}{\\partial r}$ | \`₹${bs.callGreeks.rho.toFixed(3)}\` | \`₹${bs.putGreeks.rho.toFixed(3)}\` | Sensitivity per 1.0% change in risk-free discount rate |
| **Vanna** | $\\frac{\\partial \\Delta}{\\partial \\sigma}$ | \`${bs.callGreeks.vanna.toFixed(4)}\` | \`${bs.putGreeks.vanna.toFixed(4)}\` | Cross-derivative: Delta sensitivity to implied vol shift |
| **Volga (Vomma)** | $\\frac{\\partial \\mathcal{V}}{\\partial \\sigma}$ | \`${bs.callGreeks.volga.toFixed(4)}\` | \`${bs.putGreeks.volga.toFixed(4)}\` | Convexity of Vega with respect to implied volatility |

#### 3. Volatility Smile & 25-Delta Put-Call Skew
$$\\text{25-Delta Put-Call Skew} = \\sigma_{25\\Delta \\text{ Put}} - \\sigma_{25\\Delta \\text{ Call}}$$
- **Negative Skew (Typical Equity Regime)**: Out-of-the-money puts trade at a structural volatility premium over calls due to institutional downside crash protection hedging.
- **Positive Skew (Euphoric Momentum)**: Call options command higher IV due to leveraged upside call buying.`;
}
