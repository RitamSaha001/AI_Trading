/**
 * LUMEN-ASTRA-FIN 1.0: EPISTEMIC UNCERTAINTY CALIBRATOR
 * Computes model confidence variance and epistemic uncertainty bounds.
 */

export class UncertaintyCalibrator {
  /**
   * Computes epistemic uncertainty (sigma) based on text ambiguity, conflicting tokens, and expert consensus.
   * Sigma = 0.0 (maximum deterministic certainty) to 1.0 (pure ambiguity / coin-flip).
   */
  public static calibrate(headline: string, expertScores: number[]): number {
    const upper = headline.toUpperCase();

    // 1. Text Ambiguity / Hedges
    let ambiguityPenalty = 0.05;
    if (/MAY|COULD|MIGHT|SOURCES\s+SAY|REPORTEDLY|UNCONFIRMED|SPECULATION|RUMOR/i.test(upper)) {
      ambiguityPenalty += 0.35;
    }
    if (/DISPUTE|UNCERTAIN|VOLATILE|MIXED/i.test(upper)) {
      ambiguityPenalty += 0.20;
    }

    // 2. Expert Disagreement Variance (Var(scores))
    let variance = 0.0;
    if (expertScores.length > 1) {
      const mean = expertScores.reduce((sum, s) => sum + s, 0) / expertScores.length;
      const squaredDiffs = expertScores.map((s) => Math.pow(s - mean, 2));
      variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / expertScores.length;
    }

    // Combine into calibrated uncertainty sigma [0.05, 0.95]
    const sigma = Math.min(0.95, Math.max(0.05, ambiguityPenalty + Math.sqrt(variance) * 0.4));
    return Number(sigma.toFixed(2));
  }
}
