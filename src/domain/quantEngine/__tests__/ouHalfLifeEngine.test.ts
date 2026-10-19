import { describe, it, expect } from 'vitest';
import { OUHalfLifeEngine } from '../ouHalfLifeEngine';

describe('Ornstein-Uhlenbeck (OU) Statistical Half-Life Engine', () => {
  it('returns robust fallback when insufficient observations are provided', () => {
    const fit = OUHalfLifeEngine.fit([0.5, 0.4]);
    expect(fit.halfLifeBars).toBe(30);
    expect(fit.isStatisticallyMeanReverting).toBe(false);
  });

  it('accurately estimates theta and half-life on mean-reverting deviations', () => {
    // Generate synthetic AR(1) mean-reverting process with phi = 0.85
    // Theoretical half-life = ln(2) / -ln(0.85) = 0.6931 / 0.1625 = 4.26 bars -> bounded to min 8 bars
    const deviations: number[] = [2.0];
    const phiTrue = 0.88;
    for (let i = 1; i < 60; i++) {
      const noise = (Math.sin(i * 3) * 0.1);
      deviations.push(deviations[i - 1] * phiTrue + noise);
    }

    const fit = OUHalfLifeEngine.fit(deviations, 60_000);
    expect(fit.phi).toBeGreaterThan(0.70);
    expect(fit.phi).toBeLessThan(0.98);
    expect(fit.theta).toBeGreaterThan(0.02);
    expect(fit.halfLifeBars).toBeGreaterThanOrEqual(8);
    expect(fit.halfLifeBars).toBeLessThanOrEqual(60);
  });

  it('evaluates stagnancy correctly: triggers exit when trade duration exceeds 1.5 * half-life without progress', () => {
    const entryTime = 1000000;
    const now = entryTime + (65 * 60 * 1000); // 65 minutes elapsed
    const entryDeviation = -2.5; // Dislocated -2.5 below VWAP
    const currentDeviation = -2.3; // Barely moved (only recovered 0.2 out of 2.5 = 8%)
    const halfLifeBars = 35; // 1.5 * 35 = 53 bars max allowed

    const evalRes = OUHalfLifeEngine.evaluateStagnancy(
      entryTime,
      now,
      entryDeviation,
      currentDeviation,
      halfLifeBars
    );

    expect(evalRes.shouldExit).toBe(true);
    expect(evalRes.elapsedBars).toBe(65);
    expect(evalRes.maxAllowedBars).toBe(53);
    expect(evalRes.reason).toContain('OU Statistical Half-Life Expired');
  });

  it('keeps position open when trade is reverting as expected within half-life envelope', () => {
    const entryTime = 1000000;
    const now = entryTime + (15 * 60 * 1000); // 15 minutes elapsed
    const entryDeviation = -2.5;
    const currentDeviation = -1.0; // Reverted 1.5 out of 2.5 = 60% recovered
    const halfLifeBars = 20;

    const evalRes = OUHalfLifeEngine.evaluateStagnancy(
      entryTime,
      now,
      entryDeviation,
      currentDeviation,
      halfLifeBars
    );

    expect(evalRes.shouldExit).toBe(false);
    expect(evalRes.reversionProgressPct).toBeGreaterThanOrEqual(50);
  });
});
