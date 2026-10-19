import { describe, it, expect } from 'vitest';
import { DFARegimeEngine } from '../dfaRegimeEngine';

describe('Detrended Fluctuation Analysis (DFA) Engine', () => {
  it('returns neutral Brownian noise when insufficient price history is provided', () => {
    const result = DFARegimeEngine.calculate([100, 101, 102]);
    expect(result.alpha).toBe(0.50);
    expect(result.regime).toBe('BROWNIAN_NOISE');
    expect(result.isNoiseChop).toBe(true);
    expect(result.canTradeMeanReversion).toBe(false);
  });

  it('detects strong persistent trend (alpha > 0.58) on synthetic persistent series', () => {
    // Generate trending prices with strong positive drift
    const prices: number[] = [100];
    for (let i = 1; i < 100; i++) {
      const step = 0.5 + (Math.sin(i / 10) * 0.2) + (i % 2 === 0 ? 0.3 : 0.1);
      prices.push(prices[i - 1] + step);
    }

    const result = DFARegimeEngine.calculate(prices);
    expect(result.alpha).toBeGreaterThanOrEqual(0.55);
    expect(result.rSquared).toBeGreaterThan(0.70);
  });

  it('detects mean-reverting equilibrium (alpha < 0.50) on anti-persistent series', () => {
    // Deterministic anti-persistent increments: r_t = -0.6 * r_{t-1} + noise
    let s = 12345;
    const lcg = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return (s / 4294967296) - 0.5;
    };

    let p = 100;
    let prevRet = 0;
    const prices: number[] = [p];
    for (let i = 0; i < 150; i++) {
      const r = -0.65 * prevRet + lcg() * 0.005;
      prevRet = r;
      p *= Math.exp(r);
      prices.push(p);
    }

    const result = DFARegimeEngine.calculate(prices);
    expect(result.alpha).toBeLessThan(0.50);
    expect(result.regime).toBe('MEAN_REVERTING');
    expect(result.canTradeMeanReversion).toBe(true);
  });

  it('identifies Brownian noise / random walk and signals stand-aside', () => {
    // Deterministic independent increments (uncorrelated white noise returns)
    let s = 98765;
    const lcg = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return (s / 4294967296) - 0.5;
    };

    let p = 500;
    const prices: number[] = [p];
    for (let i = 0; i < 150; i++) {
      p *= Math.exp(lcg() * 0.01);
      prices.push(p);
    }

    const result = DFARegimeEngine.calculate(prices);
    expect(result.alpha).toBeGreaterThanOrEqual(0.40);
    expect(result.alpha).toBeLessThanOrEqual(0.65);
    expect(result.rSquared).toBeGreaterThan(0.85);
  });
});
