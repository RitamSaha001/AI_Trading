import { describe, it, expect } from 'vitest';
import {
  calculateTTMSqueeze,
  calculateHalfKellyFraction,
  getAssetSector,
  calculateSectorAllocations,
  validateSectorExposureLimit,
  calculateChandelierExit,
  calculateVolumeMetrics,
  MAX_SECTOR_ALLOCATION_PCT,
  evaluateAllocationModeSwitch,
  evaluateLiveMarketDataQuality,
  CandidateForAllocation,
} from '../alphaSignalEngine';

describe('Alpha Signal & Microstructure Engine', () => {
  describe('TTM Volatility Squeeze', () => {
    it('returns default NO_SQUEEZE for short or empty price histories', () => {
      const res = calculateTTMSqueeze([]);
      expect(res.squeezeState).toBe('NO_SQUEEZE');
      expect(res.bandwidth).toBeGreaterThan(0);
    });

    it('identifies SQUEEZE_ON when price volatility contracts tightly inside Keltner bands', () => {
      // Create very low volatility range: 25 periods around 100 with 0.05 variation
      const history = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 0.1);
      const res = calculateTTMSqueeze(history, 20, 2.0, 1.5);
      expect(res.squeezeState).toBe('SQUEEZE_ON');
      expect(res.bbUpper).toBeLessThanOrEqual(res.kcUpper);
      expect(res.bbLower).toBeGreaterThanOrEqual(res.kcLower);
    });

    it('identifies SQUEEZE_OFF when volatility expands out of a prior compression', () => {
      // First 25 points flat, then a massive spike
      const flat = Array.from({ length: 25 }, () => 100);
      const spike = [101, 103, 107, 112, 118];
      const history = [...flat, ...spike];
      const res = calculateTTMSqueeze(history, 20, 2.0, 1.5);
      expect(['SQUEEZE_OFF', 'NO_SQUEEZE']).toContain(res.squeezeState);
    });
  });

  describe('Half-Kelly Optimal Capital Sizing', () => {
    it('computes Half-Kelly multiplier with positive edge', () => {
      // 60% win rate, 2.0 reward-to-risk ratio
      // Full Kelly = p - q/b = 0.60 - 0.40/2.0 = 0.40
      // Half Kelly = 0.20
      const res = calculateHalfKellyFraction(0.60, 2.0);
      expect(res.fullKelly).toBe(0.40);
      expect(res.halfKelly).toBe(0.20);
      expect(res.edge).toBeGreaterThan(0);
      expect(res.recommendedSizeMultiplier).toBeGreaterThanOrEqual(0.25);
    });

    it('clamps size multiplier between minFraction and maxFraction for extreme probabilities', () => {
      // Very high win rate: 95% with 3:1 R:R
      const highRes = calculateHalfKellyFraction(0.95, 3.0, 1.25, 0.25);
      expect(highRes.recommendedSizeMultiplier).toBeLessThanOrEqual(1.25);

      // Low win rate: 30% with 1:1 R:R (negative edge)
      const lowRes = calculateHalfKellyFraction(0.30, 1.0, 1.0, 0.25);
      expect(lowRes.recommendedSizeMultiplier).toBe(0.25);
    });

    it('does not inflate a moderate edge above the configured conservative floor', () => {
      const res = calculateHalfKellyFraction(0.58, 2.2, 1.25, 0.25);
      expect(res.recommendedSizeMultiplier).toBe(0.25);
      expect(res.halfKelly).toBeLessThan(0.25);
    });
  });

  describe('Sector Exposure & Concentration Matrix', () => {
    it('classifies Indian fleet assets into canonical NSE sectors', () => {
      expect(getAssetSector('HDFCBANK')).toBe('Banking');
      expect(getAssetSector('ICICIBANK')).toBe('Banking');
      expect(getAssetSector('SBIN')).toBe('Banking');
      expect(getAssetSector('TCS')).toBe('IT');
      expect(getAssetSector('INFY')).toBe('IT');
      expect(getAssetSector('RELIANCE')).toBe('Energy');
      expect(getAssetSector('TATAMOTORS')).toBe('Auto');
      expect(getAssetSector('LT')).toBe('Infrastructure');
      expect(getAssetSector('ITC')).toBe('FMCG');
      expect(getAssetSector('BHARTIARTL')).toBe('Telecom');
    });

    it('accurately calculates sector allocations across active positions', () => {
      const positions = {
        HDFCBANK: 10,  // ₹1,600 * 10 = ₹16,000
        ICICIBANK: 10, // ₹1,200 * 10 = ₹12,000 (Total Banking = ₹28,000)
        TCS: 5,        // ₹4,000 * 5  = ₹20,000 (Total IT = ₹20,000)
      };
      const markets: any = {
        HDFCBANK: { price: 1600 },
        ICICIBANK: { price: 1200 },
        TCS: { price: 4000 },
      };
      const totalPv = 100000;

      const summary = calculateSectorAllocations(positions, markets, totalPv);
      expect(summary.sectorWeights['Banking']).toBe(28.0);
      expect(summary.sectorWeights['IT']).toBe(20.0);
      expect(summary.isOverweight).toBe(false);
      expect(summary.maxSector).toBe('Banking');
    });

    it('blocks proposed orders that would breach the 50% sector ceiling', () => {
      const positions = {
        HDFCBANK: 20, // ₹1,600 * 20 = ₹32,000 (32% of ₹100,000)
      };
      const markets: any = {
        HDFCBANK: { price: 1600 },
        ICICIBANK: { price: 1200 },
      };
      const pv = 100000;

      // Adding ₹20,000 of ICICIBANK would push Banking to ₹52,000 (52% > 50%)
      const res = validateSectorExposureLimit('ICICIBANK', 20000, positions, markets, pv, MAX_SECTOR_ALLOCATION_PCT);
      expect(res.allowed).toBe(false);
      expect(res.projectedSectorPct).toBe(52.0);
      expect(res.reason).toContain('Sector concentration breach');
    });

    it('permits proposed orders when resulting sector weight stays below 35%', () => {
      const positions = {
        HDFCBANK: 10, // ₹1,600 * 10 = ₹16,000 (16% of ₹100,000)
      };
      const markets: any = {
        HDFCBANK: { price: 1600 },
        ICICIBANK: { price: 1200 },
      };
      const pv = 100000;

      // Adding ₹5,000 of ICICIBANK would push Banking to ₹21,000 (21% <= 35%)
      const res = validateSectorExposureLimit('ICICIBANK', 5000, positions, markets, pv, MAX_SECTOR_ALLOCATION_PCT);
      expect(res.allowed).toBe(true);
      expect(res.projectedSectorPct).toBe(21.0);
    });
  });

  describe('Chandelier Trailing Exit', () => {
    it('computes Chandelier exit based on highest high minus ATR multiplier', () => {
      const history = [100, 102, 105, 108, 110, 112, 115, 118, 120];
      const exit = calculateChandelierExit(history, 10, 2.0);
      expect(exit).toBeLessThan(120);
      expect(exit).toBeGreaterThan(110);
    });
  });

  describe('Volume & Microstructure Metrics', () => {
    it('calculates VWAP and volume surge ratio from candle series', () => {
      const candles = [
        { high: 102, low: 98, close: 100, volume: 1000 },
        { high: 105, low: 100, close: 104, volume: 2000 },
        { high: 108, low: 103, close: 107, volume: 3000 },
      ];
      const history = [100, 104, 107];

      const res = calculateVolumeMetrics(candles, history);
      expect(res.vwap).toBeGreaterThan(100);
      expect(res.volumeSurgeRatio).toBeGreaterThanOrEqual(1.0);
    });
  });

  describe('Live Market Data Quality Gate', () => {
    const liveMarket = (overrides: Record<string, unknown> = {}) => ({
      asset: 'RELIANCE',
      name: 'RELIANCE',
      symbol: 'RELIANCE',
      price: 2500,
      change24h: 1,
      high24h: 2520,
      low24h: 2470,
      volume24h: 1_000_000,
      history: Array.from({ length: 30 }, (_, index) => 2450 + index * 1.5),
      candles: Array.from({ length: 20 }, (_, index) => ({
        time: 1_000_000 + index * 60_000,
        open: 2450 + index,
        high: 2452 + index,
        low: 2448 + index,
        close: 2450 + index,
        volume: 10_000,
      })),
      source: 'Upstox Live Feed',
      isSynthetic: false,
      lastUpdated: 2_000_000,
      ...overrides,
    });

    it('accepts a complete, fresh, non-synthetic live snapshot', () => {
      expect(evaluateLiveMarketDataQuality(liveMarket() as any, 2_060_000).allowed).toBe(true);
    });

    it('rejects synthetic, stale, incomplete, and malformed live inputs', () => {
      expect(evaluateLiveMarketDataQuality(liveMarket({ isSynthetic: true }) as any, 2_060_000).allowed).toBe(false);
      expect(evaluateLiveMarketDataQuality(liveMarket({ lastUpdated: 1_000_000 }) as any, 2_000_001).reason).toContain('old');
      expect(evaluateLiveMarketDataQuality(liveMarket({ history: [2500] }) as any, 2_060_000).reason).toContain('Insufficient price history');
      expect(evaluateLiveMarketDataQuality(liveMarket({ candles: [{ open: 1, high: 1, low: 2, close: 1, volume: 1 }] }) as any, 2_060_000).reason).toContain('Insufficient OHLCV candles');
    });
  });

  describe('Conditions-Based Allocation Switch', () => {
    const candidate = (overrides: Partial<CandidateForAllocation> = {}): CandidateForAllocation => ({
      asset: 'RELIANCE',
      price: 2500,
      atr: 20,
      sector: 'Energy',
      convictionScore: 90,
      hurst: 0.6,
      squeezeStatus: 'SQUEEZE_OFF',
      volumeSurgeRatio: 1.5,
      realisticGrossProfit: 180,
      roundtripFriction: 20,
      realisticNetProfit: 160,
      history: Array.from({ length: 20 }, (_, index) => 100 + index * 2),
      regimeScenario: 'A_EXPANSION',
      ...overrides,
    });

    it('stands aside in a choppy or volatility-shock regime', () => {
      expect(evaluateAllocationModeSwitch([candidate({ regimeScenario: 'C_CHOP' })]).mode).toBe('STAND_ASIDE');
      expect(evaluateAllocationModeSwitch([candidate({ regimeScenario: 'D_VOL_SHOCK' })]).mode).toBe('STAND_ASIDE');
    });

    it('uses 40-1 after a loss or when only one candidate clears the floor', () => {
      expect(evaluateAllocationModeSwitch([candidate()]).mode).toBe('MODE_40_1');
      expect(evaluateAllocationModeSwitch([candidate(), candidate({ asset: 'TCS', sector: 'IT', convictionScore: 88, realisticNetProfit: 220, history: Array.from({ length: 20 }, (_, index) => 200 - index * 3) })], true).mode).toBe('MODE_40_1');
    });

    it('activates 35-2 only for two strong, uncorrelated candidates clearing the elevated floor', () => {
      const second = candidate({
        asset: 'TCS',
        sector: 'IT',
        convictionScore: 80,
        realisticNetProfit: 220,
        history: Array.from({ length: 20 }, (_, index) => 200 - index * 3),
      });
      const decision = evaluateAllocationModeSwitch([candidate(), second]);
      expect(decision.mode).toBe('MODE_35_2');
      expect(decision.assetAllocationPct).toBe(35);
    });
  });
});
