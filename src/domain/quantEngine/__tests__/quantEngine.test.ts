import { describe, it, expect } from 'vitest';
import {
  calculateBlackScholesAndGreeks,
  calculateImpliedVolatility,
  analyzeMultiLegStrategy,
  buildNSEDerivativesStrategy,
  generateOptionsGreeksExplanation,
  computeCovarianceMatrix,
  calculateHRP,
  calculateVaRAndCVaR,
  runMonteCarloSimulation,
  calculateKylesLambda,
  calculateAmihudIlliquidity,
  calculateOrderFlowImbalance,
  computeAlmgrenChrissSchedule,
  calculateHurstExponent,
  estimateOrnsteinUhlenbeck,
  estimateGarchVolatility,
  runKalmanFilter,
} from '../index';

describe('Institutional Quantitative Engine - Mathematical Verification Suite', () => {
  describe('Options Pricing & Analytical Greeks Engine', () => {
    it('accurately computes Black-Scholes-Merton European Call and Put prices', () => {
      // Benchmark: S=100, K=100, T=1, r=0.05, sigma=0.20
      const res = calculateBlackScholesAndGreeks({
        spotPrice: 100,
        strikePrice: 100,
        timeToExpiryYears: 1,
        volatility: 0.20,
        riskFreeRate: 0.05,
      });

      // Theoretical Black-Scholes Call is ~10.4506, Put is ~5.5735
      expect(res.callPrice).toBeGreaterThan(10.40);
      expect(res.callPrice).toBeLessThan(10.50);
      expect(res.putPrice).toBeGreaterThan(5.50);
      expect(res.putPrice).toBeLessThan(5.65);

      // Verify Put-Call Parity: C - P = S - K * exp(-r * T)
      const parityLeft = res.callPrice - res.putPrice;
      const parityRight = 100 - 100 * Math.exp(-0.05 * 1);
      expect(Math.abs(parityLeft - parityRight)).toBeLessThan(1e-4);
    });

    it('computes exact analytical first- and second-order Greeks', () => {
      const res = calculateBlackScholesAndGreeks({
        spotPrice: 100,
        strikePrice: 100,
        timeToExpiryYears: 0.5,
        volatility: 0.25,
        riskFreeRate: 0.06,
      });

      // Call Delta in (0, 1)
      expect(res.callGreeks.delta).toBeGreaterThan(0.5);
      expect(res.callGreeks.delta).toBeLessThan(0.7);

      // Put Delta in (-1, 0) and Call Delta - Put Delta = exp(-q*T) = 1
      expect(res.putGreeks.delta).toBeLessThan(0);
      expect(Math.abs(res.callGreeks.delta - res.putGreeks.delta - 1)).toBeLessThan(1e-4);

      // Gamma and Vega are positive and identical for call and put
      expect(res.callGreeks.gamma).toBeGreaterThan(0);
      expect(res.callGreeks.gamma).toBe(res.putGreeks.gamma);
      expect(res.callGreeks.vega).toBeGreaterThan(0);
      expect(res.callGreeks.vega).toBe(res.putGreeks.vega);

      // Theta is negative (calendar decay)
      expect(res.callGreeks.theta).toBeLessThan(0);
      expect(res.putGreeks.theta).toBeLessThan(0);

      // Cross Greeks: Vanna and Volga
      expect(res.callGreeks.vanna).toBeDefined();
      expect(res.callGreeks.volga).toBeDefined();
    });

    it('inverts option prices to solve Implied Volatility via Newton-Raphson', () => {
      const spot = 2500;
      const strike = 2500;
      const T = 0.25;
      const r = 0.07;
      const trueVol = 0.28;

      const forward = calculateBlackScholesAndGreeks({
        spotPrice: spot,
        strikePrice: strike,
        timeToExpiryYears: T,
        volatility: trueVol,
        riskFreeRate: r,
      });

      const solved = calculateImpliedVolatility(forward.callPrice, spot, strike, T, r, true);
      expect(solved.converged).toBe(true);
      expect(Math.abs(solved.impliedVol - trueVol)).toBeLessThan(0.001);
    });

    it('analyzes multi-leg Indian derivatives strategies (Iron Condor & Straddle)', () => {
      const condor = buildNSEDerivativesStrategy('iron_condor', 24000, 0.14, 7);
      expect(condor.strategyName).toBe('Market-Neutral Iron Condor');
      expect(condor.legs.length).toBe(4);
      expect(condor.netGreeks).toBeDefined();
      expect(condor.breakevens.length).toBeGreaterThanOrEqual(1);

      const straddle = buildNSEDerivativesStrategy('straddle', 24000, 0.14, 7);
      expect(straddle.strategyName).toBe('Long ATM Straddle');
      expect(straddle.legs.length).toBe(2);
      expect(straddle.netGreeks.vega).toBeGreaterThan(0);
    });

    it('generates rich KaTeX mathematical options explanation', () => {
      const explanation = generateOptionsGreeksExplanation('NIFTY', 24000, 0.15);
      expect(explanation).toContain('Black-Scholes-Merton');
      expect(explanation).toContain('\\Delta');
      expect(explanation).toContain('\\Gamma');
      expect(explanation).toContain('\\mathcal{V}');
      expect(explanation).toContain('25-Delta Put-Call Skew');
    });
  });

  describe('Portfolio Optimization & Stochastic Risk Engine', () => {
    const mockHistories: Record<string, number[]> = {
      RELIANCE: Array.from({ length: 60 }, (_, i) => 2800 * (1 + 0.01 * Math.sin(i * 0.2) + 0.002 * i)),
      TCS: Array.from({ length: 60 }, (_, i) => 4000 * (1 + 0.008 * Math.cos(i * 0.15) + 0.001 * i)),
      INFY: Array.from({ length: 60 }, (_, i) => 1800 * (1 + 0.012 * Math.sin(i * 0.25) + 0.0015 * i)),
      HDFCBANK: Array.from({ length: 60 }, (_, i) => 1650 * (1 + 0.009 * Math.cos(i * 0.1) + 0.0018 * i)),
    };

    it('computes positive semi-definite covariance and correlation matrices', () => {
      const matrix = computeCovarianceMatrix(mockHistories);
      expect(matrix.assets.length).toBe(4);
      expect(matrix.cov.length).toBe(4);
      expect(matrix.corr.length).toBe(4);

      // Diagonal of correlation matrix must be identically 1.0
      for (let i = 0; i < 4; i++) {
        expect(Math.abs(matrix.corr[i][i] - 1.0)).toBeLessThan(1e-5);
      }
    });

    it('allocates portfolio capital via Hierarchical Risk Parity (HRP) tree clustering', () => {
      const hrp = calculateHRP(mockHistories);
      expect(Object.keys(hrp.weights).length).toBe(4);

      // Sum of weights must equal 1.0
      const totalWeight = Object.values(hrp.weights).reduce((a, b) => a + b, 0);
      expect(Math.abs(totalWeight - 1.0)).toBeLessThan(0.01);

      // All weights must be strictly positive
      for (const w of Object.values(hrp.weights)) {
        expect(w).toBeGreaterThan(0);
      }
      expect(hrp.diversificationRatio).toBeGreaterThanOrEqual(1.0);
    });

    it('computes parametric and historical VaR & CVaR (Expected Shortfall)', () => {
      const returns = [-0.02, -0.015, -0.01, 0.005, 0.01, 0.012, 0.018, -0.025, 0.008, 0.003, -0.035, 0.02];
      const rep = calculateVaRAndCVaR(500000, returns, 0.018, 0.0004);

      expect(rep.parametricVaR95).toBeGreaterThan(0);
      expect(rep.parametricVaR99).toBeGreaterThan(rep.parametricVaR95);
      expect(rep.cVar95).toBeGreaterThanOrEqual(rep.parametricVaR95);
      expect(rep.cVar99).toBeGreaterThanOrEqual(rep.parametricVaR99);
    });

    it('runs 1,000-path Monte Carlo Geometric Brownian Motion simulation', () => {
      const mc = runMonteCarloSimulation(100, 0.10, 0.20, 30, 1000);
      expect(mc.terminalPrices.length).toBe(1000);
      expect(mc.percentile5).toBeLessThanOrEqual(mc.percentile25);
      expect(mc.percentile25).toBeLessThanOrEqual(mc.medianTerminalPrice);
      expect(mc.medianTerminalPrice).toBeLessThanOrEqual(mc.percentile75);
      expect(mc.percentile75).toBeLessThanOrEqual(mc.percentile95);
      expect(mc.probabilityOfLoss).toBeGreaterThanOrEqual(0);
      expect(mc.probabilityOfLoss).toBeLessThanOrEqual(1);
    });
  });

  describe('Market Microstructure & Optimal Execution Engine', () => {
    it('estimates Kyle lambda adverse selection price impact from tick flow', () => {
      const priceChanges = [0.1, -0.05, 0.2, -0.15, 0.3, -0.1, 0.25];
      const signedVolumes = [1000, -500, 2000, -1200, 2500, -800, 1800];

      const res = calculateKylesLambda(priceChanges, signedVolumes);
      expect(res.lambda).toBeGreaterThan(0);
      expect(res.priceImpactBpsPerUnit).toBeGreaterThan(0);
      expect(res.rSquared).toBeGreaterThan(0.5);
    });

    it('evaluates Amihud illiquidity index across daily turnover', () => {
      const rets = [0.01, 0.015, -0.02, 0.008, -0.012];
      const turnover = [50000000, 40000000, 60000000, 45000000, 55000000]; // 40M-60M INR

      const amihud = calculateAmihudIlliquidity(rets, turnover);
      expect(amihud.illiqValue).toBeGreaterThan(0);
      expect(amihud.liquidityTier).toBe('Deep Liquidity');
    });

    it('computes Order Flow Imbalance (OFI) top-of-book pressure', () => {
      // Buying pressure: Bid improves from 100 to 100.05, Ask improves
      const ofi = calculateOrderFlowImbalance(100, 500, 100.10, 800, 100.05, 700, 100.15, 600);
      expect(ofi.ofiValue).toBeGreaterThan(0);
      expect(ofi.normalizedOfi).toBeGreaterThan(0);
      expect(ofi.pressureDirection).toMatch(/Buying/);
    });

    it('schedules Almgren-Chriss optimal liquidation hyperbolic trajectory', () => {
      const sched = computeAlmgrenChrissSchedule(10000, 60, 6, 0.25);
      expect(sched.trajectory.length).toBe(6);
      expect(sched.trajectory[0].remainingShares).toBeLessThan(10000);
      expect(sched.trajectory[5].remainingShares).toBe(0);
      expect(sched.halfLifeMinutes).toBeGreaterThan(0);
    });
  });

  describe('Regime Detection & Stochastic Modeling Engine', () => {
    it('classifies Hurst Exponent for trending and mean-reverting price series', () => {
      // Trending series (monotonic geometric growth)
      const trendingSeries = Array.from({ length: 60 }, (_, i) => 100 * Math.pow(1.015, i));
      const hurstTrend = calculateHurstExponent(trendingSeries);
      expect(hurstTrend.hurst).toBeGreaterThan(0.50);
      expect(hurstTrend.regime).toBe('Persistent Trending');

      // Mean reverting anti-persistent series
      const meanRevertingSeries = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 === 0 ? 3 : -3));
      const hurstRevert = calculateHurstExponent(meanRevertingSeries);
      expect(hurstRevert.hurst).toBeLessThan(0.50);
      expect(hurstRevert.regime).toBe('Mean-Reverting');
    });

    it('estimates Ornstein-Uhlenbeck stochastic mean-reversion drift and half-life', () => {
      const prices = [100, 102, 99, 101, 98, 103, 97, 102, 99, 101, 100, 102];
      const ou = estimateOrnsteinUhlenbeck(prices);
      expect(ou.theta).toBeGreaterThan(0);
      expect(ou.mu).toBeGreaterThan(95);
      expect(ou.mu).toBeLessThan(105);
      expect(ou.halfLifePeriods).toBeGreaterThan(0);
      expect(ou.signal).toBeDefined();
    });

    it('estimates GARCH(1,1) volatility clustering and 30-day forecast', () => {
      const returns = Array.from({ length: 50 }, (_, i) => 0.015 * Math.sin(i * 0.3));
      const garch = estimateGarchVolatility(returns);
      expect(garch.currentVolAnnualized).toBeGreaterThan(0);
      expect(garch.forecastVol30d).toBeGreaterThan(0);
      expect(garch.persistence).toBeLessThan(1.0);
    });

    it('applies 1D Kalman Filter to filter microstructure noise from price stream', () => {
      const truePrices = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5);
      const noisyPrices = truePrices.map((p, i) => p + (i % 2 === 0 ? 1.5 : -1.5));

      const kf = runKalmanFilter(noisyPrices);
      expect(kf.filteredPrices.length).toBe(30);
      expect(kf.finalState.estimatedState).toBeGreaterThan(110);
      expect(kf.finalState.kalmanGain).toBeGreaterThan(0);
    });
  });
});
