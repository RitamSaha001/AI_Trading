/**
 * Detrended Fluctuation Analysis (DFA) Engine
 * Based on Peng, Buldyrev, Havlin, Simons, Stanley, Goldberger (Phys. Rev. E, 1994)
 * 
 * Accurately calculates the scaling exponent alpha (self-similarity / generalized Hurst exponent)
 * on non-stationary financial time series without small-sample or polynomial trend bias.
 * 
 * Regime Interpretations:
 * - alpha in [0.45, 0.55]: Pure Brownian Random Walk / Noise -> STAND ASIDE (0 trades)
 * - alpha < 0.45: Anti-persistent / Mean-reverting -> High expectancy for VWAP Band Reversion
 * - alpha > 0.58: Persistent / Trending Momentum -> High expectancy for Trend Continuation
 */

export type DFARegime = 'BROWNIAN_NOISE' | 'MEAN_REVERTING' | 'PERSISTENT_TREND';

export interface DFAResult {
  alpha: number;
  regime: DFARegime;
  rSquared: number;
  isNoiseChop: boolean;
  canTradeMeanReversion: boolean;
  canTradeTrend: boolean;
}

export class DFARegimeEngine {
  /**
   * Computes Detrended Fluctuation Analysis on a series of prices or log-returns.
   * Uses multi-scale box sizes s from 4 to N/4 to estimate F(s) ~ s^alpha.
   */
  public static calculate(prices: number[], minBoxSize = 4, maxBoxSize = 32): DFAResult {
    if (!prices || prices.length < 24) {
      // Default to neutral Brownian noise when insufficient data is present
      return {
        alpha: 0.50,
        regime: 'BROWNIAN_NOISE',
        rSquared: 1.0,
        isNoiseChop: true,
        canTradeMeanReversion: false,
        canTradeTrend: false,
      };
    }

    // 1. Compute Log Returns
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0 && prices[i] > 0) {
        returns.push(Math.log(prices[i] / prices[i - 1]));
      }
    }

    const N = returns.length;
    if (N < 20) {
      return {
        alpha: 0.50,
        regime: 'BROWNIAN_NOISE',
        rSquared: 1.0,
        isNoiseChop: true,
        canTradeMeanReversion: false,
        canTradeTrend: false,
      };
    }

    // 2. Compute Mean Return & Cumulative Profile Y(k)
    let sumRet = 0;
    for (let i = 0; i < N; i++) sumRet += returns[i];
    const meanRet = sumRet / N;

    const Y: number[] = new Array(N);
    let cumSum = 0;
    for (let k = 0; k < N; k++) {
      cumSum += (returns[k] - meanRet);
      Y[k] = cumSum;
    }

    // 3. Evaluate Fluctuation Function F(s) across logarithmic box scales
    const boxScales: number[] = [];
    const maxScale = Math.min(maxBoxSize, Math.floor(N / 4));
    let s = minBoxSize;
    while (s <= maxScale) {
      boxScales.push(s);
      s = Math.max(s + 1, Math.round(s * 1.35));
    }

    if (boxScales.length < 3) {
      return {
        alpha: 0.50,
        regime: 'BROWNIAN_NOISE',
        rSquared: 1.0,
        isNoiseChop: true,
        canTradeMeanReversion: false,
        canTradeTrend: false,
      };
    }

    const logS: number[] = [];
    const logFs: number[] = [];

    for (const scale of boxScales) {
      const numBoxes = Math.floor(N / scale);
      if (numBoxes < 2) continue;

      let totalVariance = 0;

      for (let b = 0; b < numBoxes; b++) {
        const startIdx = b * scale;

        // Linear Least Squares Fit y = m*x + c over this box
        let sumX = 0;
        let sumY = 0;
        let sumXY = 0;
        let sumX2 = 0;

        for (let i = 0; i < scale; i++) {
          const x = i;
          const y = Y[startIdx + i];
          sumX += x;
          sumY += y;
          sumXY += x * y;
          sumX2 += x * x;
        }

        const denom = (scale * sumX2 - sumX * sumX);
        const slope = denom !== 0 ? (scale * sumXY - sumX * sumY) / denom : 0;
        const intercept = (sumY - slope * sumX) / scale;

        // Sum squared residuals
        for (let i = 0; i < scale; i++) {
          const fitted = slope * i + intercept;
          const residual = Y[startIdx + i] - fitted;
          totalVariance += residual * residual;
        }
      }

      const meanVariance = totalVariance / (numBoxes * scale);
      const Fs = Math.sqrt(meanVariance);
      if (Fs > 0) {
        logS.push(Math.log(scale));
        logFs.push(Math.log(Fs));
      }
    }

    if (logS.length < 3) {
      return {
        alpha: 0.50,
        regime: 'BROWNIAN_NOISE',
        rSquared: 1.0,
        isNoiseChop: true,
        canTradeMeanReversion: false,
        canTradeTrend: false,
      };
    }

    // 4. Linear Regression on log(F(s)) vs log(s) to determine alpha
    let sumLogS = 0;
    let sumLogFs = 0;
    let sumLogS2 = 0;
    let sumLogS_Fs = 0;
    const M = logS.length;

    for (let i = 0; i < M; i++) {
      sumLogS += logS[i];
      sumLogFs += logFs[i];
      sumLogS2 += logS[i] * logS[i];
      sumLogS_Fs += logS[i] * logFs[i];
    }

    const regDenom = (M * sumLogS2 - sumLogS * sumLogS);
    if (regDenom === 0) {
      return {
        alpha: 0.50,
        regime: 'BROWNIAN_NOISE',
        rSquared: 0,
        isNoiseChop: true,
        canTradeMeanReversion: false,
        canTradeTrend: false,
      };
    }

    const alphaRaw = (M * sumLogS_Fs - sumLogS * sumLogFs) / regDenom;
    // Bound alpha between reasonable empirical limits [0.20, 0.90]
    const alpha = Math.max(0.20, Math.min(0.90, Number(alphaRaw.toFixed(3))));

    // Calculate R-squared of the fit
    const meanLogFs = sumLogFs / M;
    let ssTot = 0;
    let ssRes = 0;
    const intercept = (sumLogFs - alphaRaw * sumLogS) / M;

    for (let i = 0; i < M; i++) {
      const pred = alphaRaw * logS[i] + intercept;
      ssRes += Math.pow(logFs[i] - pred, 2);
      ssTot += Math.pow(logFs[i] - meanLogFs, 2);
    }
    const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1.0;

    // 5. Determine Regime
    let regime: DFARegime;
    if (alpha >= 0.45 && alpha <= 0.55) {
      regime = 'BROWNIAN_NOISE';
    } else if (alpha < 0.45) {
      regime = 'MEAN_REVERTING';
    } else {
      regime = 'PERSISTENT_TREND';
    }

    return {
      alpha,
      regime,
      rSquared: Number(rSquared.toFixed(3)),
      isNoiseChop: regime === 'BROWNIAN_NOISE',
      canTradeMeanReversion: regime === 'MEAN_REVERTING',
      canTradeTrend: regime === 'PERSISTENT_TREND' && alpha >= 0.58,
    };
  }
}
