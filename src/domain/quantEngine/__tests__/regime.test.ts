import { describe, it, expect } from 'vitest';
import {
  calculateHurstExponentFromCandles,
  ouMeanReversionSignal,
  kalmanFairValue,
  ttmSqueezeState,
  evaluateSessionTimingQuality,
  sectorBetaGate,
} from '../alphaSignalEngine';
import {
  getTrendingWeekCandles,
  getChoppyWeekCandles,
  getShockDayCandles,
} from '../__fixtures__/historicalCandles';
import { Market } from '../../../types';

describe('Phase 2: Regime Classification & Signal Engine', () => {
  const trendingCandles = getTrendingWeekCandles();
  const choppyCandles = getChoppyWeekCandles();
  const shockCandles = getShockDayCandles();

  describe('calculateHurstExponentFromCandles', () => {
    it('identifies persistent trending regime (H > 0.55) on trending fixture', () => {
      const res = calculateHurstExponentFromCandles(trendingCandles);
      expect(res.hurst).toBeGreaterThan(0.55);
      expect(res.regime).toBe('Persistent Trending');
    });

    it('identifies anti-persistent mean-reverting regime (H < 0.45) on choppy fixture', () => {
      const res = calculateHurstExponentFromCandles(choppyCandles);
      expect(res.hurst).toBeLessThanOrEqual(0.48);
      expect(['Mean-Reverting', 'Random Walk']).toContain(res.regime);
    });

    it('gracefully returns fallback for short or empty series', () => {
      const emptyRes = calculateHurstExponentFromCandles([]);
      expect(emptyRes.hurst).toBe(0.50);
      expect(emptyRes.regime).toBe('Random Walk');
    });
  });

  describe('ouMeanReversionSignal', () => {
    it('computes theta, mu, and standardized Z-score for price stream', () => {
      const res = ouMeanReversionSignal(choppyCandles);
      expect(res.theta).toBeGreaterThan(0);
      expect(res.mu).toBeCloseTo(2250, -2);
      expect(typeof res.zScore).toBe('number');
    });

    it('flags isExtreme = true when price experiences a major shock deviation', () => {
      // In shock candles, price drops by 65 points at bar 40
      const shockBarSlice = shockCandles.slice(0, 41);
      const res = ouMeanReversionSignal(shockBarSlice);
      expect(res.isExtreme).toBe(true);
      expect(Math.abs(res.zScore)).toBeGreaterThanOrEqual(1.80);
    });
  });

  describe('kalmanFairValue', () => {
    it('estimates unbiased fair value tracking the price center', () => {
      const prices = [2250, 2252, 2248, 2255, 2249, 2251];
      const fairValue = kalmanFairValue(prices);
      expect(fairValue).toBeGreaterThan(2245);
      expect(fairValue).toBeLessThan(2260);
    });

    it('returns 0 for empty price streams', () => {
      expect(kalmanFairValue([])).toBe(0);
    });
  });

  describe('ttmSqueezeState', () => {
    it('returns on for tightly compressed Bollinger/Keltner series', () => {
      // Flat series with minimal variance
      const compressedPrices = Array.from({ length: 30 }, (_, i) => 2200 + Math.sin(i) * 0.1);
      const state = ttmSqueezeState(compressedPrices);
      expect(state).toBe('on');
    });

    it('returns off when volatility expands after compression', () => {
      const flat = Array.from({ length: 25 }, () => 2200);
      const spike = [2205, 2215, 2235, 2260, 2290];
      const state = ttmSqueezeState([...flat, ...spike]);
      expect(['off', 'none']).toContain(state);
    });
  });

  describe('evaluateSessionTimingQuality', () => {
    // Helper to construct a Monday timestamp at specific IST hours and minutes
    function createIstTimestamp(hours: number, minutes: number): number {
      // 2026-09-07 is a Monday
      // UTC time for IST (UTC = IST - 5:30)
      const date = new Date(Date.UTC(2026, 8, 7, hours - 5, minutes - 30, 0));
      return date.getTime();
    }

    it('filters opening volatility between 09:15 and 09:30 (+8 score, 1.5x surge)', () => {
      const t = createIstTimestamp(9, 20);
      const res = evaluateSessionTimingQuality(t);
      expect(res.phase).toBe('OPENING_VOLATILITY');
      expect(res.allowsNewEntries).toBe(true);
      expect(res.convictionThresholdDelta).toBe(8);
      expect(res.minVolumeSurgeRequired).toBe(1.5);
      expect(res.isLateDayLiquidationPhase).toBe(false);
    });

    it('permits prime morning entries between 09:30 and 11:30 without penalty', () => {
      const t = createIstTimestamp(10, 30);
      const res = evaluateSessionTimingQuality(t);
      expect(res.phase).toBe('MORNING_EXPANSION');
      expect(res.allowsNewEntries).toBe(true);
      expect(res.convictionThresholdDelta).toBe(0);
      expect(res.isLateDayLiquidationPhase).toBe(false);
    });

    it('dampens midday consolidation between 11:30 and 13:15 (+6 score, 1.35x surge)', () => {
      const t = createIstTimestamp(12, 15);
      const res = evaluateSessionTimingQuality(t);
      expect(res.phase).toBe('MIDDAY_CONSOLIDATION');
      expect(res.convictionThresholdDelta).toBe(6);
      expect(res.minVolumeSurgeRequired).toBe(1.35);
      expect(res.isLateDayLiquidationPhase).toBe(false);
    });

    it('enforces 14:00 entry curfew (blocks new entries)', () => {
      const t = createIstTimestamp(14, 5);
      const res = evaluateSessionTimingQuality(t);
      expect(res.phase).toBe('CLOSING_SQUAREOFF');
      expect(res.allowsNewEntries).toBe(false);
      expect(res.isLateDayLiquidationPhase).toBe(false);
    });

    it('activates late-day liquidation window between 14:15 and 15:15', () => {
      const t = createIstTimestamp(14, 30);
      const res = evaluateSessionTimingQuality(t);
      expect(res.allowsNewEntries).toBe(false);
      expect(res.isLateDayLiquidationPhase).toBe(true);
    });

    it('blocks trading on weekends', () => {
      // 2026-09-06 is Sunday
      const sundayTime = new Date(Date.UTC(2026, 8, 6, 6, 0, 0)).getTime();
      const res = evaluateSessionTimingQuality(sundayTime);
      expect(res.phase).toBe('POST_CLOSE');
      expect(res.allowsNewEntries).toBe(false);
    });
  });

  describe('sectorBetaGate', () => {
    it('blocks long orders when sector index is below VWAP with lower lows', () => {
      // Sector index falling from 1000 to 950 with high volume
      const fallingSector: Market = {
        symbol: 'NIFTY_IT',
        price: 950,
        history: [1000, 990, 980, 970, 960, 950],
        candles: [
          { time: 1, open: 1000, high: 1005, low: 985, close: 990, volume: 50000 },
          { time: 2, open: 990, high: 992, low: 975, close: 980, volume: 55000 },
          { time: 3, open: 980, high: 982, low: 965, close: 970, volume: 60000 },
          { time: 4, open: 970, high: 972, low: 955, close: 960, volume: 70000 },
          { time: 5, open: 960, high: 962, low: 948, close: 950, volume: 90000 },
        ],
      } as any;

      const gateRes = sectorBetaGate('TCS', fallingSector);
      expect(gateRes.allowed).toBe(false);
      expect(gateRes.reason).toContain('breakdown');
    });

    it('allows long orders when sector index is healthy and above VWAP', () => {
      const risingSector: Market = {
        symbol: 'NIFTY_IT',
        price: 1050,
        history: [980, 995, 1010, 1025, 1040, 1050],
        candles: [
          { time: 1, open: 980, high: 995, low: 975, close: 995, volume: 30000 },
          { time: 2, open: 995, high: 1012, low: 990, close: 1010, volume: 40000 },
          { time: 3, open: 1010, high: 1030, low: 1008, close: 1025, volume: 50000 },
          { time: 4, open: 1025, high: 1045, low: 1020, close: 1040, volume: 60000 },
          { time: 5, open: 1040, high: 1055, low: 1038, close: 1050, volume: 80000 },
        ],
      } as any;

      const gateRes = sectorBetaGate('TCS', risingSector);
      expect(gateRes.allowed).toBe(true);
      expect(gateRes.reason).toContain('healthy');
    });

    it('returns allowed = true if sector data is neutral/missing', () => {
      const gateRes = sectorBetaGate('TCS', undefined);
      expect(gateRes.allowed).toBe(true);
    });
  });
});
