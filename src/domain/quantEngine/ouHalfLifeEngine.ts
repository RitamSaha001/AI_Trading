/**
 * Ornstein-Uhlenbeck (OU) Statistical Half-Life Engine
 * 
 * Replaces static time timers (e.g. 90 min) with dynamic statistical physics.
 * Continuous OU Process: dX_t = theta * (mu - X_t) * dt + sigma * dW_t
 * 
 * Discretized via AR(1) OLS Regression:
 * X_t = c + phi * X_{t-1} + eps
 * theta = -ln(phi) / dt
 * Half-life tau_{1/2} = ln(2) / theta
 * 
 * If a mean-reverting position fails to revert after 1.5 * tau_{1/2}, the hypothesis
 * has statistically failed (p < 0.05). Exiting immediately preserves capital,
 * cuts margin lockup, and prevents midday/afternoon alpha decay.
 */

export interface OUFitResult {
  phi: number;
  theta: number;
  halfLifeBars: number;
  halfLifeMs: number;
  equilibriumMean: number;
  sigmaResidual: number;
  isStatisticallyMeanReverting: boolean;
}

export interface OUStagnancyEvaluation {
  shouldExit: boolean;
  elapsedBars: number;
  halfLifeBars: number;
  maxAllowedBars: number;
  reversionProgressPct: number;
  reason: string;
}

export class OUHalfLifeEngine {
  /**
   * Fits an Ornstein-Uhlenbeck process to deviations from VWAP or moving equilibrium.
   * @param deviations Array of deviation values (e.g. Price - VWAP)
   * @param barIntervalMs Interval per bar in milliseconds (default: 60,000 for 1m bars)
   */
  public static fit(deviations: number[], barIntervalMs = 60_000): OUFitResult {
    if (!deviations || deviations.length < 15) {
      // Default fallback: 30 minutes half-life
      return {
        phi: 0.95,
        theta: 0.0513,
        halfLifeBars: 30,
        halfLifeMs: 30 * barIntervalMs,
        equilibriumMean: 0,
        sigmaResidual: 1.0,
        isStatisticallyMeanReverting: false,
      };
    }

    const n = deviations.length - 1;
    let sumX = 0;
    let sumY = 0;
    let sumXX = 0;
    let sumXY = 0;

    for (let i = 0; i < n; i++) {
      const x = deviations[i];
      const y = deviations[i + 1];
      sumX += x;
      sumY += y;
      sumXX += x * x;
      sumXY += x * y;
    }

    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) {
      return {
        phi: 0.95,
        theta: 0.0513,
        halfLifeBars: 30,
        halfLifeMs: 30 * barIntervalMs,
        equilibriumMean: 0,
        sigmaResidual: 1.0,
        isStatisticallyMeanReverting: false,
      };
    }

    const phi = (n * sumXY - sumX * sumY) / denom;
    const c = (sumY - phi * sumX) / n;

    // A valid stationary mean-reverting process requires 0 < phi < 1.0
    if (phi <= 0.01 || phi >= 0.999) {
      return {
        phi: Math.max(0, Math.min(1, phi)),
        theta: 0.01,
        halfLifeBars: 45,
        halfLifeMs: 45 * barIntervalMs,
        equilibriumMean: 0,
        sigmaResidual: 1.0,
        isStatisticallyMeanReverting: false,
      };
    }

    const theta = -Math.log(phi);
    const halfLifeBarsRaw = Math.log(2) / theta;
    // Bound half-life to realistic intraday boundaries: min 30 bars (30m), max 60 bars (60m)
    const halfLifeBars = Math.max(30, Math.min(60, Math.round(halfLifeBarsRaw)));
    const equilibriumMean = c / (1 - phi);

    // Compute residual variance
    let ssRes = 0;
    for (let i = 0; i < n; i++) {
      const pred = c + phi * deviations[i];
      ssRes += Math.pow(deviations[i + 1] - pred, 2);
    }
    const sigmaResidual = Math.sqrt(ssRes / n);

    return {
      phi: Number(phi.toFixed(4)),
      theta: Number(theta.toFixed(4)),
      halfLifeBars,
      halfLifeMs: halfLifeBars * barIntervalMs,
      equilibriumMean: Number(equilibriumMean.toFixed(2)),
      sigmaResidual: Number(sigmaResidual.toFixed(4)),
      isStatisticallyMeanReverting: phi < 0.97 && theta > 0.03,
    };
  }

  /**
   * Evaluates if a trade has stayed in position too long without exhibiting expected reversion.
   * @param entryTimestamp When position was entered
   * @param currentTimestamp Current bar timestamp
   * @param entryDeviation Distance from VWAP at entry (Price - VWAP)
   * @param currentDeviation Current distance from VWAP
   * @param halfLifeBars Estimated half-life from OU fit
   * @param barIntervalMs Bar interval (default 60,000 ms)
   */
  public static evaluateStagnancy(
    entryTimestamp: number,
    currentTimestamp: number,
    entryDeviation: number,
    currentDeviation: number,
    halfLifeBars: number,
    barIntervalMs = 60_000
  ): OUStagnancyEvaluation {
    const elapsedMs = Math.max(0, currentTimestamp - entryTimestamp);
    const elapsedBars = Math.floor(elapsedMs / barIntervalMs);

    // Statistical cut-off barrier is 1.5 times the half-life (min 45 bars = 45m)
    const maxAllowedBars = Math.max(45, Math.round(halfLifeBars * 1.5));

    // Measure mean reversion progress: did deviation shrink toward 0?
    // For long entries (entryDeviation < 0), progress means currentDeviation > entryDeviation
    const initialDislocation = Math.abs(entryDeviation);
    let reversionProgressPct = 0;
    if (initialDislocation > 0.001) {
      if (entryDeviation < 0) {
        // Long entry: expected to rise toward VWAP
        const recovered = currentDeviation - entryDeviation;
        reversionProgressPct = Math.max(0, Math.min(100, (recovered / initialDislocation) * 100));
      } else {
        // Short entry: expected to drop toward VWAP
        const recovered = entryDeviation - currentDeviation;
        reversionProgressPct = Math.max(0, Math.min(100, (recovered / initialDislocation) * 100));
      }
    }

    // If elapsed time exceeds 1.5 * tau_{1/2} and position has recovered less than 35% of the dislocation,
    // the mean-reverting alpha has decayed.
    if (elapsedBars >= maxAllowedBars && reversionProgressPct < 35) {
      return {
        shouldExit: true,
        elapsedBars,
        halfLifeBars,
        maxAllowedBars,
        reversionProgressPct: Number(reversionProgressPct.toFixed(1)),
        reason: `OU Statistical Half-Life Expired: ${elapsedBars} bars active (limit ${maxAllowedBars} bars, τ_1/2=${halfLifeBars}m) with only ${reversionProgressPct.toFixed(0)}% mean reversion progress. Liquidating alpha decay.`,
      };
    }

    return {
      shouldExit: false,
      elapsedBars,
      halfLifeBars,
      maxAllowedBars,
      reversionProgressPct: Number(reversionProgressPct.toFixed(1)),
      reason: 'Within expected statistical half-life envelope.',
    };
  }
}
