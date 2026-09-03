import { describe, it, expect } from 'vitest';
import { executeOrder, checkPendingOrders } from './trading';
import { AppState, Market } from '../types';
import { createPositionsRecord } from './portfolio';

function createFreshState(cash = 50000): AppState {
  return {
    schemaVersion: 2,
    cash,
    initialCash: cash,
    startingEquity: cash,
    realizedPnl: 0,
    totalFees: 0,
    positions: createPositionsRecord(),
    avgBuyPrice: createPositionsRecord(),
    watchlist: ['BTC', 'ETH'],
    orders: [],
    alerts: [],
    strategies: [],
    notifications: [],
    timeframe: '1D',
    selectedAsset: 'BTC',
    settings: {
      geminiApiKey: '',
      geminiModel: 'gemini-3.8-flash',
      soundEnabled: true,
      enableWebSocket: true,
      theme: 'light',
      maxSlippageBps: 20,
    },
  };
}

const createMockMarket = (asset: string, price: number, change24h = 0): Market => ({
  asset: asset as any,
  symbol: `${asset}USDT`,
  name: asset,
  price,
  change24h,
  high24h: price * 1.02,
  low24h: price * 0.98,
  volume24h: 100000000,
  history: [price],
  candles: [],
  source: 'Simulated Heuristic',
  isSynthetic: false,
  lastUpdated: Date.now(),
});

const mockMarkets: Record<string, Market> = {
  BTC: createMockMarket('BTC', 50000, 2.0),
  ETH: createMockMarket('ETH', 3000, 1.0),
  SOL: createMockMarket('SOL', 150, 0),
  ADA: createMockMarket('ADA', 0.5, 0),
  XRP: createMockMarket('XRP', 0.6, 0),
  AVAX: createMockMarket('AVAX', 30, 0),
  LINK: createMockMarket('LINK', 15, 0),
  DOGE: createMockMarket('DOGE', 0.12, 0),
};

describe('Domain: Paper Trading Engine Execution', () => {
  it('executes a market buy order, deducting cash, adding units, and recording fee', () => {
    const state = createFreshState(50000);
    // Buy 0.5 BTC at base price 50,000
    const result = executeOrder(state, mockMarkets as any, 'buy', 'BTC', 0.5, { type: 'market' });

    expect(result.ok).toBe(true);
    expect(state.positions.BTC).toBe(0.5);
    expect(state.avgBuyPrice?.BTC).toBeGreaterThan(0);
    expect(state.totalFees).toBeGreaterThan(0);
    expect(state.cash).toBeLessThan(50000);
    expect(state.orders.length).toBe(1);
    expect(state.orders[0].side).toBe('buy');
    expect(state.orders[0].status).toBe('filled');
  });

  it('rejects a market buy when cash balance is insufficient', () => {
    const state = createFreshState(100); // Only $100 cash
    const result = executeOrder(state, mockMarkets as any, 'buy', 'BTC', 1.0, { type: 'market' });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/insufficient/i);
    expect(state.cash).toBe(100);
    expect(state.positions.BTC).toBe(0);
  });

  it('executes a market sell order, crediting cash and accurately realizing P&L', () => {
    const state = createFreshState(50000);
    // 1. Buy 0.5 BTC at $50,000
    const buyRes = executeOrder(state, mockMarkets as any, 'buy', 'BTC', 0.5, { type: 'market' });
    expect(buyRes.ok).toBe(true);

    // 2. Price rises to $60,000
    const higherMarkets: any = {
      ...mockMarkets,
      BTC: { ...mockMarkets.BTC, price: 60000 },
    };

    // 3. Sell 0.5 BTC at $60,000
    const sellRes = executeOrder(state, higherMarkets, 'sell', 'BTC', 0.5, { type: 'market' });
    expect(sellRes.ok).toBe(true);

    expect(state.positions.BTC).toBe(0);
    expect(state.realizedPnl).toBeGreaterThan(4500); // 0.5 * (60,000 - ~50,000) minus fees
    expect(state.cash).toBeGreaterThan(50000);
  });

  it('rejects selling more units than currently held', () => {
    const state = createFreshState(50000);
    const result = executeOrder(state, mockMarkets as any, 'sell', 'BTC', 1.0, { type: 'market' });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/insufficient/i);
  });

  it('places a limit order as pending and fills it when market crosses limit price', () => {
    const state = createFreshState(50000);
    // Limit Buy: Target price is $48,000 when market is $50,000
    const limitRes = executeOrder(state, mockMarkets as any, 'buy', 'BTC', 0.2, {
      type: 'limit',
      limitPrice: 48000,
    });

    expect(limitRes.ok).toBe(true);
    expect(state.orders.length).toBe(1);
    expect(state.orders[0].status).toBe('pending');
    expect(state.positions.BTC).toBe(0); // Not filled yet

    // Check with market price still at $50,000 -> Should remain pending
    const check1 = checkPendingOrders(state, mockMarkets as any);
    expect(check1.filledOrders.length).toBe(0);
    expect(state.positions.BTC).toBe(0);

    // Now market drops to $47,500 <= $48,000 -> Should execute!
    const droppedMarkets: any = {
      ...mockMarkets,
      BTC: { ...mockMarkets.BTC, price: 47500 },
    };
    const check2 = checkPendingOrders(state, droppedMarkets);
    expect(check2.filledOrders.length).toBe(1);
    expect(state.positions.BTC).toBe(0.2);
    expect(state.orders[0].status).toBe('filled');
  });
});
