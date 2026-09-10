import { describe, it, expect } from 'vitest';
import {
  calculateRoundtripFriction,
  passesFrictionHurdle,
  passesNetProfitFloor,
} from '../alphaSignalEngine';
import * as thresholds from '../config/thresholds';

describe('Scenario 1: Transaction Cost & Statutory Friction Engine', () => {
  describe('calculateRoundtripFriction', () => {
    it('accurately calculates roundtrip friction for TCS live trade (6 shares @ ₹2,267)', () => {
      // 6 shares of TCS @ ₹2,267 = turnover of ₹13,602
      const deliveryFriction = calculateRoundtripFriction(2267, 6, true);

      // Turnover
      expect(deliveryFriction.turnover).toBe(13602.0);

      // Brokerage: ₹20 flat cap per order -> ₹40.00
      expect(deliveryFriction.brokerage).toBe(40.0);

      // STT Delivery: 0.1% buy + 0.1% sell = 0.2% of 13602 = ₹27.20
      expect(deliveryFriction.stt).toBe(27.2);

      // Exchange txn charges: 0.00307% * 2 * 13602 = ₹0.84
      expect(deliveryFriction.exchangeTxnCharge).toBe(0.84);

      // Stamp Duty: 0.015% buy leg = ₹2.04
      expect(deliveryFriction.stampDuty).toBe(2.04);

      // GST: 18% on (brokerage ₹40 + exchange ₹0.84 + sebi ₹0.03 = ₹40.87) = ₹7.36
      expect(deliveryFriction.gst).toBe(7.36);

      // Total roundtrip friction should be between ₹70 and ₹79
      expect(deliveryFriction.totalRoundtripFriction).toBeCloseTo(77.47, 1);
      expect(deliveryFriction.frictionPerShare).toBeCloseTo(12.91, 1);
      expect(deliveryFriction.frictionPct).toBeCloseTo(0.57, 1);
    });

    it('calculates lower friction for intraday trades (reduced STT and stamp duty)', () => {
      const intradayFriction = calculateRoundtripFriction(2267, 6, false);

      // Turnover remains ₹13,602
      expect(intradayFriction.turnover).toBe(13602.0);

      // Brokerage: 0.10% of 13602 = ₹13.60 per leg -> ₹27.20 total
      expect(intradayFriction.brokerage).toBe(27.2);

      // STT Intraday: 0.025% on sell side only = ₹3.40
      expect(intradayFriction.stt).toBe(3.4);

      // Stamp duty: 0.003% buy side = ₹0.41
      expect(intradayFriction.stampDuty).toBe(0.41);

      // GST on (27.20 + 0.84 + 0.03) = ₹5.05
      expect(intradayFriction.gst).toBe(5.05);

      // Total roundtrip intraday friction is ₹36.93 under current published rates.
      expect(intradayFriction.totalRoundtripFriction).toBeCloseTo(36.93, 1);
      expect(intradayFriction.frictionPct).toBeCloseTo(0.27, 1);
    });

    it('clamps brokerage to flat ₹20 per leg on large institutional notional', () => {
      // 100 shares of RELIANCE @ ₹2,500 = ₹250,000 turnover
      const largeFriction = calculateRoundtripFriction(2500, 100, true);

      expect(largeFriction.turnover).toBe(250000.0);
      // Brokerage must be capped at ₹40.00 (₹20 buy + ₹20 sell)
      expect(largeFriction.brokerage).toBe(40.0);
      // STT: 0.2% of ₹250,000 = ₹500.00
      expect(largeFriction.stt).toBe(500.0);
      expect(largeFriction.totalRoundtripFriction).toBeGreaterThan(500.0);
    });

    it('handles small micro-notional without division by zero', () => {
      const microFriction = calculateRoundtripFriction(100, 1, false);
      expect(microFriction.turnover).toBe(100.0);
      expect(microFriction.totalRoundtripFriction).toBeGreaterThan(0);
      expect(microFriction.frictionPerShare).toBe(microFriction.totalRoundtripFriction);
    });
  });

  describe('passesFrictionHurdle', () => {
    it('approves trades where gross target profit >= 3.0x roundtrip friction', () => {
      // Friction = ₹77.43, 3x hurdle = ₹232.29
      const friction = 77.43;
      expect(passesFrictionHurdle(240.0, friction, 3.0)).toBe(true);
      expect(passesFrictionHurdle(350.0, friction, 3.0)).toBe(true);
    });

    it('rejects trades where gross target profit is insufficient to overcome 3.0x friction', () => {
      const friction = 77.43;
      // ₹150 profit vs ₹77.43 fee is only ~1.9x -> rejected to avoid fee churn
      expect(passesFrictionHurdle(150.0, friction, 3.0)).toBe(false);
      // ₹70 profit is less than 1x friction -> heavily rejected
      expect(passesFrictionHurdle(70.0, friction, 3.0)).toBe(false);
    });

    it('rejects invalid or non-positive expected profit or friction', () => {
      expect(passesFrictionHurdle(0, 50)).toBe(false);
      expect(passesFrictionHurdle(-20, 50)).toBe(false);
      expect(passesFrictionHurdle(100, 0)).toBe(false);
    });
  });

  describe('passesNetProfitFloor', () => {
    it('requires the configured net rupee floor after all roundtrip costs', () => {
      expect(passesNetProfitFloor(150, 30)).toBe(true);
      expect(passesNetProfitFloor(149.99, 30)).toBe(false);
    });

    it('rejects non-positive values', () => {
      expect(passesNetProfitFloor(0, 20)).toBe(false);
      expect(passesNetProfitFloor(150, 0)).toBe(false);
    });
  });
});
