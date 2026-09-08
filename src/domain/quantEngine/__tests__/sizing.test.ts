import { describe, it, expect } from 'vitest';
import {
  calculateHalfKellyFraction,
  validateSectorExposureLimit,
} from '../alphaSignalEngine';
import * as thresholds from '../config/thresholds';

describe('Phase 4: Sizing Engine & Portfolio Invariants', () => {
  describe('Half-Kelly Capital Allocation (Scenario 10)', () => {
    it('computes Half-Kelly multiplier with positive edge (60% win rate, 2:1 R:R)', () => {
      // p = 0.60, b = 2.0
      // Full Kelly = 0.60 - 0.40/2 = 0.40
      // Half Kelly = 0.20
      const res = calculateHalfKellyFraction(0.60, 2.0);
      expect(res.fullKelly).toBe(0.40);
      expect(res.halfKelly).toBe(0.20);
      expect(res.recommendedSizeMultiplier).toBeGreaterThanOrEqual(0.25);
    });

    it('dampens win-rate when volatility is abnormal (ATR/Price > 4.5%)', () => {
      let estWinRate = 0.60;
      const atrPriceRatio = 0.052; // 5.2% > 4.5%

      if (atrPriceRatio > thresholds.VOLATILITY_DAMPENER_ATR_PRICE_RATIO) {
        estWinRate -= thresholds.VOLATILITY_DAMPENER_WIN_RATE_PENALTY;
      }

      expect(estWinRate).toBe(0.54);
      const res = calculateHalfKellyFraction(estWinRate, 2.0);
      // Half Kelly of 0.54 is lower than 0.60
      expect(res.halfKelly).toBeLessThan(0.20);
    });

    it('clamps size multiplier between minFraction (0.25) and maxFraction (1.25)', () => {
      // Negative edge (30% win rate with 1:1 R:R) clamps to minFraction 0.25
      const lowRes = calculateHalfKellyFraction(0.30, 1.0, 1.25, 0.25);
      expect(lowRes.recommendedSizeMultiplier).toBe(0.25);

      // Extreme edge (95% win rate with 3:1 R:R) clamps to maxFraction 0.40
      const highRes = calculateHalfKellyFraction(0.95, 3.0, 0.40, 0.25);
      expect(highRes.recommendedSizeMultiplier).toBe(0.40);
    });
  });

  describe('Portfolio Invariants: Concentration Caps', () => {
    it('strictly limits sector exposure to 35% ceiling', () => {
      const positions = {
        TCS: 10, // ₹2,267 * 10 = ₹22,670 (IT sector)
      };
      const markets: any = {
        TCS: { price: 2267 },
      };
      const portfolioValue = 100000;

      // Proposing ₹15,000 more in INFY (also IT sector): Total IT = ₹37,670 (37.67% > 35%)
      const check = validateSectorExposureLimit(
        'INFY',
        15000,
        positions,
        markets,
        portfolioValue,
        thresholds.MAX_SECTOR_ALLOCATION_PCT
      );

      expect(check.allowed).toBe(false);
      expect(check.projectedSectorPct).toBeGreaterThan(35.0);
    });

    it('allows proposed allocation when sector remains below 35%', () => {
      const positions = {
        TCS: 5, // ₹2,267 * 5 = ₹11,335 (IT)
      };
      const markets: any = {
        TCS: { price: 2267 },
      };
      const portfolioValue = 100000;

      // Proposing ₹10,000 in INFY: Total IT = ₹21,335 (21.3% < 35%)
      const check = validateSectorExposureLimit(
        'INFY',
        10000,
        positions,
        markets,
        portfolioValue,
        thresholds.MAX_SECTOR_ALLOCATION_PCT
      );

      expect(check.allowed).toBe(true);
      expect(check.projectedSectorPct).toBeLessThanOrEqual(35.0);
    });
  });
});
