import { describe, it, expect } from 'vitest';
import { MarketDataValidityGuard } from './marketValidity';
import { Market } from '../types';

const createMockMarket = (overrides?: Partial<Market>): Market => ({
  asset: 'BTC',
  symbol: 'BTCUSDT',
  name: 'Bitcoin',
  price: 60000,
  change24h: 2.5,
  high24h: 61000,
  low24h: 59000,
  volume24h: 500000000,
  history: Array.from({ length: 30 }, (_, i) => 60000 + i * 50),
  candles: [],
  source: 'Binance REST',
  isSynthetic: false,
  lastUpdated: Date.now() - 5000, // 5s old
  ...overrides,
});

describe('Domain: MarketDataValidityGuard', () => {
  it('validates fresh, complete market data successfully', () => {
    const market = createMockMarket();
    const res = MarketDataValidityGuard.validate(market, 'BTC');

    expect(res.isValid).toBe(true);
    expect(res.canExecute).toBe(true);
    expect(res.isStale).toBe(false);
    expect(res.qualityScore).toBeGreaterThanOrEqual(80);
    expect(res.errors.length).toBe(0);
  });

  it('detects and flags missing market data, strictly blocking execution', () => {
    const res = MarketDataValidityGuard.validate(undefined, 'ETH');

    expect(res.isValid).toBe(false);
    expect(res.canExecute).toBe(false);
    expect(res.qualityScore).toBe(0);
    expect(res.errors.some((e) => e.includes('Missing market feed'))).toBe(true);
  });

  it('detects and flags stale market data (> 45 seconds)', () => {
    const market = createMockMarket({
      lastUpdated: Date.now() - 60000, // 60s old
    });

    const res = MarketDataValidityGuard.validate(market, 'BTC');
    expect(res.isStale).toBe(true);
    expect(res.ageSec).toBeGreaterThanOrEqual(59);
    expect(res.warnings.some((w) => w.includes('stale'))).toBe(true);

    // When execution grade is requested, stale data is a fatal error
    const execRes = MarketDataValidityGuard.validate(market, 'BTC', undefined, { requireExecutionGrade: true });
    expect(execRes.canExecute).toBe(false);
    expect(execRes.errors.some((e) => e.includes('Executable proposals are strictly disabled'))).toBe(true);
  });

  it('rejects invalid or non-finite prices', () => {
    const market = createMockMarket({ price: -50 });
    const res = MarketDataValidityGuard.validate(market, 'BTC');

    expect(res.isValid).toBe(false);
    expect(res.canExecute).toBe(false);
    expect(res.errors.some((e) => e.includes('Invalid spot price'))).toBe(true);
  });

  it('penalizes synthetic data in quality score', () => {
    const liveMarket = createMockMarket({ isSynthetic: false });
    const syntheticMarket = createMockMarket({ isSynthetic: true });

    const liveRes = MarketDataValidityGuard.validate(liveMarket, 'BTC');
    const synthRes = MarketDataValidityGuard.validate(syntheticMarket, 'BTC');

    expect(synthRes.qualityScore).toBeLessThan(liveRes.qualityScore);
    expect(synthRes.isSynthetic).toBe(true);
    expect(synthRes.warnings.some((w) => w.includes('heuristic simulation'))).toBe(true);
  });

  it('throws an error via assertExecutionGrade when data is not execution ready', () => {
    expect(() => {
      MarketDataValidityGuard.assertExecutionGrade(undefined, 'BTC');
    }).toThrow(/Execution blocked for BTC/);
  });
});
