import { describe, it, expect } from 'vitest';
import {
  calculateDynamicProfitRatchet,
  lateDayStopCompression,
  deadTradeStagnancyExit,
  volatilityShockFreeze,
  correlationGate,
} from '../alphaSignalEngine';
import { Candle, Market } from '../../../types';

describe('Phase 4: Defensive Position Management & Scenario Gates', () => {
  describe('Scenario 2: Multi-Stage Profit Ratchet & Level 0.5 Micro-Shield', () => {
    it('activates Level 0.5 Fee-Breakeven Shield at +0.85 ATR', () => {
      // Entry: ₹2,266.80, ATR: ₹18.00, Initial Stop: ₹2,221.80 (-2.5 ATR)
      // Roundtrip friction per share: ₹8.60 (Delivery)
      // +0.85 ATR is +₹15.30 -> Price reaches ₹2,283.00 (+₹16.20 gain)
      const entryPrice = 2266.80;
      const atr = 18.00;
      const initialStop = 2221.80;
      const frictionPerShare = 8.60;

      const currentPrice = 2283.00; // Above entry + friction (2275.55) with 0.40 ATR breathing room
      const res = calculateDynamicProfitRatchet(
        entryPrice,
        currentPrice,
        atr,
        initialStop,
        0.05,
        frictionPerShare
      );

      expect(res.stageName).toBe('FEE_BREAKEVEN_SHIELD');
      expect(res.isRatcheted).toBe(true);
      // Stop moved to Entry (2266.80) + Friction (8.60) + Tick (0.05) + Armor (0.10) = ₹2,275.55
      expect(res.ratchetedStopPrice).toBe(2275.55);
    });

    it('TCS Regression Replay: Protects against afternoon reversal after +0.85 ATR gain', () => {
      const entryPrice = 2266.80;
      const atr = 18.00;
      const initialStop = 2248.90;
      const frictionPerShare = 8.60;

      // Peak price reached during mid-day: ₹2,283.00 (+0.90 ATR)
      const peakRes = calculateDynamicProfitRatchet(
        entryPrice,
        2283.00,
        atr,
        initialStop,
        0.05,
        frictionPerShare
      );

      expect(peakRes.ratchetedStopPrice).toBe(2275.55);

      // Price later drops to ₹2,260.00 in late afternoon
      // The ratcheted stop (2275.55) triggers when price crosses 2275.55,
      // exiting with zero net loss rather than riding down to 2260 (-₹70 net loss)
      expect(peakRes.ratchetedStopPrice).toBeGreaterThan(2260.00);
      expect(peakRes.ratchetedStopPrice).toBeGreaterThan(entryPrice);
    });

    it('locks +0.50 ATR at Level 1 (+1.00 ATR)', () => {
      const entry = 1000;
      const atr = 20;
      const current = 1021; // +1.05 ATR
      const res = calculateDynamicProfitRatchet(entry, current, atr, 970, 0.05, 2.0);

      expect(res.stageName).toBe('STEPPED_BREAKEVEN');
      expect(res.ratchetedStopPrice).toBe(1010); // 1000 + 20 * 0.50
    });

    it('locks +0.85 ATR at Level 2 (+1.40 ATR)', () => {
      const entry = 1000;
      const atr = 20;
      const current = 1030; // +1.50 ATR
      const res = calculateDynamicProfitRatchet(entry, current, atr, 1010, 0.05, 2.0);

      expect(res.stageName).toBe('LOCKED_PROFIT_T1');
      expect(res.ratchetedStopPrice).toBe(1017); // 1000 + 20 * 0.85
    });
  });

  describe('Scenario 5: Late-Day Stop Compression (14:15-15:15 IST)', () => {
    function createIstTime(hours: number, minutes: number): number {
      return new Date(Date.UTC(2026, 8, 7, hours - 5, minutes - 30, 0)).getTime();
    }

    it('compresses trailing stop on profitable positions to HWM - 0.35 ATR at 14:30 IST', () => {
      const entry = 2200;
      const current = 2220;
      const hwm = 2230;
      const atr = 10;
      const initialStop = 2190;
      const t1430 = createIstTime(14, 30);

      const res = lateDayStopCompression(entry, current, atr, hwm, initialStop, t1430);
      expect(res.isCompressed).toBe(true);
      // HWM 2230 - 0.35 * 10 = 2226.50
      expect(res.compressedStopPrice).toBe(2226.5);
      expect(res.reason).toContain('Late-Day Profit Shield');
    });

    it('compresses stop on underwater positions to Entry - 0.40 ATR at 14:45 IST', () => {
      const entry = 2200;
      const current = 2195;
      const hwm = 2202;
      const atr = 10;
      const initialStop = 2175; // -2.5 ATR
      const t1445 = createIstTime(14, 45);

      const res = lateDayStopCompression(entry, current, atr, hwm, initialStop, t1445);
      expect(res.isCompressed).toBe(true);
      // Entry 2200 - 0.40 * 10 = 2196.00
      expect(res.compressedStopPrice).toBe(2196);
      expect(res.reason).toContain('Late-Day Loss Defense');
    });

    it('does not compress stop outside the 14:15-15:15 window', () => {
      const t1030 = createIstTime(10, 30);
      const res = lateDayStopCompression(2200, 2220, 10, 2230, 2190, t1030);
      expect(res.isCompressed).toBe(false);
      expect(res.compressedStopPrice).toBe(2190);
    });
  });

  describe('Scenario 7: Dead Trade Stagnancy Exit', () => {
    it('triggers exit after 60 mins when price range < 0.25 ATR and volume fading', () => {
      const entry = 2250;
      const current = 2251; // 1 pt move on ATR 10 = 0.10 ATR
      const atr = 10;
      const elapsed95Mins = 95 * 60 * 1000;
      const currentVol = 4000;
      const avgVol = 8000; // 0.5x volume ratio

      const res = deadTradeStagnancyExit(entry, current, atr, elapsed95Mins, currentVol, avgVol);
      expect(res.shouldExit).toBe(true);
      expect(res.reason).toContain('Dead Trade Stagnancy Exit');
    });

    it('does not exit if trade is progressing with strong momentum or volume', () => {
      const entry = 2250;
      const current = 2265; // +1.5 ATR
      const atr = 10;
      const elapsed95Mins = 95 * 60 * 1000;

      const res = deadTradeStagnancyExit(entry, current, atr, elapsed95Mins, 15000, 8000);
      expect(res.shouldExit).toBe(false);
    });
  });

  describe('Scenario 6: Volatility Shock Freeze', () => {
    it('triggers 10-minute freeze on single candle range >= 2.5x ATR', () => {
      const candle: Candle = {
        time: 1000,
        open: 2280,
        high: 2285,
        low: 2220, // 65 pt range
        close: 2222,
        volume: 50000,
      };
      const atr = 15; // 65 / 15 = 4.33x ATR shock!
      const now = 2000;

      const res = volatilityShockFreeze(candle, atr, 0, now);
      expect(res.isFrozen).toBe(true);
      expect(res.newShockDetected).toBe(true);
      expect(res.cooldownRemainingMs).toBeGreaterThan(0);
    });
  });

  describe('Scenario 8: Correlation Gate', () => {
    it('blocks entry when candidate asset has >= 75% correlation with existing holding', () => {
      // Create two highly correlated price series (r > 0.90)
      const baseSeries = Array.from({ length: 35 }, (_, i) => 100 + i * 1.5 + Math.sin(i));
      const correlatedSeries = baseSeries.map((p) => p * 1.05 + 2.0);

      const markets: Record<string, Market> = {
        HDFCBANK: { history: baseSeries } as any,
      };

      const gateRes = correlationGate('ICICIBANK', correlatedSeries, ['HDFCBANK'], markets, 0.75);
      expect(gateRes.allowed).toBe(false);
      expect(gateRes.maxCorrelation).toBeGreaterThanOrEqual(0.75);
      expect(gateRes.reason).toContain('Correlation breach');
    });

    it('allows entry when correlation is below threshold', () => {
      const seriesA = Array.from({ length: 35 }, (_, i) => 100 + i * 1.5);
      const seriesB = Array.from({ length: 35 }, (_, i) => 100 - i * 1.2); // negatively correlated

      const markets: Record<string, Market> = {
        RELIANCE: { history: seriesB } as any,
      };

      const gateRes = correlationGate('TCS', seriesA, ['RELIANCE'], markets, 0.75);
      expect(gateRes.allowed).toBe(true);
    });
  });
});
