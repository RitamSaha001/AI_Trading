import {
  HurstExponentResult,
  OrnsteinUhlenbeckParams,
  GarchVolatilityForecast,
  KalmanFilterState,
} from './types';

/**
 * Computes Hurst Exponent (H) via Rescaled Range (R/S) analysis.
 * H < 0.45: Mean-Reverting / Anti-Persistent
 * 0.45 <= H <= 0.55: Geometric Random Walk (Martingale)
 * H > 0.55: Persistent Trending (Momentum)
 */
export function calculateHurstExponent(prices: number[]): HurstExponentResult {
  if (prices.length < 20) {
    return {
      hurst: 0.50,
      regime: 'Random Walk',
      confidence: 0.5,
      recommendation: 'Insufficient sample points for robust R/S regression. Assume martingale efficiency.',
    };
  }

  // Calculate log returns
  const rets: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    rets.push(Math.log(prices[i] / (prices[i - 1] || 1)));
  }

  const minLag = 4;
  const maxLag = Math.min(64, Math.floor(rets.length / 2));
  const lags: number[] = [];
  const rsValues: number[] = [];

  for (let lag = minLag; lag <= maxLag; lag = Math.floor(lag * 1.5)) {
    const numSubsets = Math.floor(rets.length / lag);
    if (numSubsets < 1) break;

    let totalRs = 0;
    for (let s = 0; s < numSubsets; s++) {
      const subset = rets.slice(s * lag, (s + 1) * lag);
      const mean = subset.reduce((a, b) => a + b, 0) / lag;

      // Cumulative deviations from mean
      let cumDev = 0;
      let minDev = 0;
      let maxDev = 0;
      let sumSq = 0;

      for (let i = 0; i < lag; i++) {
        const dev = subset[i] - mean;
        cumDev += dev;
        if (cumDev < minDev) minDev = cumDev;
        if (cumDev > maxDev) maxDev = cumDev;
        sumSq += dev * dev;
      }

      const range = maxDev - minDev;
      const stdDev = Math.sqrt(sumSq / Math.max(1, lag - 1));
      if (stdDev > 1e-8) {
        totalRs += range / stdDev;
      }
    }

    const avgRs = totalRs / numSubsets;
    if (avgRs > 0) {
      lags.push(Math.log(lag));
      rsValues.push(Math.log(avgRs));
    }
  }

  if (lags.length < 3) {
    // Fallback: estimate Hurst via first-order autocorrelation and directional drift
    const meanR = rets.reduce((a, b) => a + b, 0) / rets.length;
    let num = 0;
    let den = 0;
    for (let i = 0; i < rets.length - 1; i++) {
      num += (rets[i] - meanR) * (rets[i + 1] - meanR);
      den += (rets[i] - meanR) * (rets[i] - meanR);
    }
    const rho1 = den > 1e-9 ? num / den : 0;
    const posPct = rets.filter((r) => r > 0).length / rets.length;
    let hurstEst = 0.50 + 0.4 * rho1;
    if (posPct > 0.8 || posPct < 0.2) {
      hurstEst = Math.max(hurstEst, 0.72);
    }
    const hurst = Math.max(0.05, Math.min(0.95, hurstEst));
    let regime: HurstExponentResult['regime'] = 'Random Walk';
    if (hurst < 0.45) regime = 'Mean-Reverting';
    else if (hurst > 0.55) regime = 'Persistent Trending';

    return {
      hurst: +hurst.toFixed(3),
      regime,
      confidence: 0.65,
      recommendation: regime === 'Persistent Trending' ? 'Persistent momentum detected.' : regime === 'Mean-Reverting' ? 'Anti-persistent behavior detected.' : 'Random walk assumed.',
    };
  }

  // OLS Linear regression to find slope (Hurst exponent)
  const meanX = lags.reduce((a, b) => a + b, 0) / lags.length;
  const meanY = rsValues.reduce((a, b) => a + b, 0) / rsValues.length;

  let covXY = 0;
  let varX = 0;
  for (let i = 0; i < lags.length; i++) {
    covXY += (lags[i] - meanX) * (rsValues[i] - meanY);
    varX += (lags[i] - meanX) * (lags[i] - meanX);
  }

  const rawHurst = varX > 1e-9 ? covXY / varX : 0.50;
  const hurst = Math.max(0.01, Math.min(0.99, rawHurst));

  let regime: HurstExponentResult['regime'] = 'Random Walk';
  let recommendation = 'Price series adheres to efficient market random walk. Focus on risk management.';

  if (hurst < 0.45) {
    regime = 'Mean-Reverting';
    recommendation = 'Anti-persistent behavior detected. Deploy mean-reversion brackets, Bollinger Bands, and Ornstein-Uhlenbeck fade.';
  } else if (hurst > 0.55) {
    regime = 'Persistent Trending';
    recommendation = 'Strong long-memory momentum detected. Deploy VWAP trend following, breakout riders, and trailing ratchets.';
  }

  return {
    hurst: +hurst.toFixed(3),
    regime,
    confidence: +Math.min(0.95, 0.5 + Math.abs(hurst - 0.5) * 2).toFixed(2),
    recommendation,
  };
}

/**
 * Fits Ornstein-Uhlenbeck (OU) Mean-Reversion Parameters.
 * dX_t = theta * (mu - X_t) * dt + sigma * dW_t
 */
export function estimateOrnsteinUhlenbeck(prices: number[]): OrnsteinUhlenbeckParams {
  const n = prices.length;
  if (n < 10) {
    const meanPrice = prices.reduce((a, b) => a + b, 0) / Math.max(1, n);
    return {
      theta: 0.1,
      mu: meanPrice,
      sigma: 0.02,
      halfLifePeriods: 7,
      currentZScore: 0,
      signal: 'Neutral Equilibrium',
    };
  }

  // Discrete AR(1) regression: X_t = a + b * X_{t-1} + eps
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  const m = n - 1;

  for (let i = 0; i < m; i++) {
    const x = prices[i];
    const y = prices[i + 1];
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumXY += x * y;
  }

  const denom = m * sumXX - sumX * sumX;
  const b = denom !== 0 ? (m * sumXY - sumX * sumY) / denom : 0.95;
  const a = (sumY - b * sumX) / m;

  // Derive continuous parameters (assuming dt = 1 period)
  // b = exp(-theta * dt) => theta = -ln(b)
  const clampedB = Math.min(0.999, Math.max(0.001, b));
  const theta = -Math.log(clampedB);
  const sampleMean = prices.reduce((sum, p) => sum + p, 0) / n;
  let mu = a / (1 - clampedB);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  if (!Number.isFinite(mu) || mu < minP * 0.7 || mu > maxP * 1.3) {
    mu = sampleMean;
  }

  // Residual variance
  let sumSqRes = 0;
  for (let i = 0; i < m; i++) {
    const expected = a + clampedB * prices[i];
    const res = prices[i + 1] - expected;
    sumSqRes += res * res;
  }
  const varEps = sumSqRes / Math.max(1, m - 2);
  const sigma = Math.sqrt(varEps * ((-2 * Math.log(clampedB)) / (1 - clampedB * clampedB || 1e-4)));

  const halfLifePeriods = theta > 1e-5 ? Math.log(2) / theta : 999;

  const currentPrice = prices[n - 1];
  const stationaryStd = sigma / Math.sqrt(Math.max(1e-8, 2 * theta));
  const currentZScore = stationaryStd > 0 ? (currentPrice - mu) / stationaryStd : 0;

  let signal: OrnsteinUhlenbeckParams['signal'] = 'Neutral Equilibrium';
  if (currentZScore < -2.0) signal = 'Strong Buy (Oversold)';
  else if (currentZScore < -0.8) signal = 'Mild Buy';
  else if (currentZScore > 2.0) signal = 'Strong Sell (Overbought)';
  else if (currentZScore > 0.8) signal = 'Mild Sell';

  return {
    theta: +theta.toFixed(4),
    mu: +mu.toFixed(2),
    sigma: +sigma.toFixed(4),
    halfLifePeriods: +Math.min(999, halfLifePeriods).toFixed(1),
    currentZScore: +currentZScore.toFixed(2),
    signal,
  };
}

/**
 * GARCH(1,1) Volatility Forecasting.
 * sigma_t^2 = omega + alpha * eps_{t-1}^2 + beta * sigma_{t-1}^2
 */
export function estimateGarchVolatility(
  returns: number[],
  omega: number = 0.00001,
  alpha: number = 0.10,
  beta: number = 0.85
): GarchVolatilityForecast {
  const persistence = alpha + beta;
  const longRunVarDaily = omega / Math.max(1e-6, 1 - persistence);
  const longRunVolAnnualized = Math.sqrt(longRunVarDaily * 252);

  let currentVar = longRunVarDaily;
  for (const r of returns) {
    currentVar = omega + alpha * (r * r) + beta * currentVar;
  }

  const currentVolAnnualized = Math.sqrt(currentVar * 252);

  // 30-day forecast: sigma_{t+k}^2 = V_L + (alpha + beta)^k * (sigma_t^2 - V_L)
  const k = 30;
  const forecastVarDaily = longRunVarDaily + Math.pow(persistence, k) * (currentVar - longRunVarDaily);
  const forecastVol30d = Math.sqrt(forecastVarDaily * 252);

  let volatilityRegime: GarchVolatilityForecast['volatilityRegime'] = 'Normal Equilibrium';
  if (currentVolAnnualized > longRunVolAnnualized * 1.3) {
    volatilityRegime = 'Elevated Clustered Volatility';
  } else if (currentVolAnnualized < longRunVolAnnualized * 0.7) {
    volatilityRegime = 'Subdued Low Volatility';
  }

  return {
    currentVolAnnualized: +(currentVolAnnualized * 100).toFixed(2),
    forecastVol30d: +(forecastVol30d * 100).toFixed(2),
    longRunVolAnnualized: +(longRunVolAnnualized * 100).toFixed(2),
    persistence: +persistence.toFixed(3),
    volatilityRegime,
  };
}

/**
 * 1D Kalman Filter for Dynamic Fair-Value Estimation.
 * Filters microstructure noise from high-frequency tick prices.
 */
export function runKalmanFilter(
  observedPrices: number[],
  processNoiseQ: number = 1e-4,
  measurementNoiseR: number = 1e-2
): { filteredPrices: number[]; finalState: KalmanFilterState } {
  if (observedPrices.length === 0) {
    return {
      filteredPrices: [],
      finalState: {
        estimatedState: 0,
        estimatedVariance: 1,
        innovationResidual: 0,
        kalmanGain: 0,
      },
    };
  }

  let x = observedPrices[0]; // initial state estimate
  let p = 1.0; // initial estimation error variance

  const filteredPrices: number[] = [];
  let lastGain = 0;
  let lastResidual = 0;

  for (const z of observedPrices) {
    // 1. Time Update (Predict)
    const xPrior = x;
    const pPrior = p + processNoiseQ;

    // 2. Measurement Update (Correct)
    lastResidual = z - xPrior;
    const s = pPrior + measurementNoiseR;
    lastGain = pPrior / (s || 1);

    x = xPrior + lastGain * lastResidual;
    p = (1 - lastGain) * pPrior;

    filteredPrices.push(+x.toFixed(2));
  }

  return {
    filteredPrices,
    finalState: {
      estimatedState: +x.toFixed(2),
      estimatedVariance: +p.toFixed(6),
      innovationResidual: +lastResidual.toFixed(4),
      kalmanGain: +lastGain.toFixed(4),
    },
  };
}
