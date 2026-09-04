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

  it('ratchets stop loss to breakeven (+0.2% net profit) when position advances >= +0.8%', () => {
    const state = createFreshState(50000);
    // 1. Buy 0.5 BTC at $50,000 with SL $49,000 (-2.0%) and TP $55,000 (+10%)
    const buyRes = executeOrder(state, mockMarkets as any, 'buy', 'BTC', 0.5, {
      type: 'market',
      stopLoss: 49000,
      takeProfit: 55000,
    });
    expect(buyRes.ok).toBe(true);
    const lot = state.orders.find((o) => o.id === buyRes.order?.id)!;
    expect(lot.stopLoss).toBe(49000);
    expect(lot.zeroLossLocked).toBeFalsy();

    // 2. Price advances by +0.9% to $50,450 (which is >= +0.8%)
    const advancedMarkets: any = {
      ...mockMarkets,
      BTC: { ...mockMarkets.BTC, price: 50450 },
    };
    checkPendingOrders(state, advancedMarkets);

    // Stop loss should now be ratcheted up to entryPrice * 1.002 = 50,000 * 1.002 = $50,100 (+0.2% net profit)
    expect(lot.zeroLossLocked).toBe(true);
    expect(lot.stopLoss).toBe(+(lot.price * 1.002).toFixed(2));
    expect(lot.stopLoss).toBeGreaterThan(lot.price); // Guaranteed profit locked!

    // 3. Price advances further to +2.2% ($51,100 >= +2.0% Level 2 anchor)
    const profitMarkets: any = {
      ...mockMarkets,
      BTC: { ...mockMarkets.BTC, price: 51100 },
    };
    checkPendingOrders(state, profitMarkets);

    // Stop loss should ratchet to entryPrice * 1.010 = +1.0% profit anchor
    expect(lot.stopLoss).toBe(+(lot.price * 1.010).toFixed(2));
  });

  it('executes 50% partial scale-out profit harvesting at TP1, trailing remaining runner with ratcheted stop', () => {
    const state = createFreshState(50000);
    // Buy 0.4 BTC at $50,000 with TP1 at $52,000 (+4%) and SL at $49,000
    const buyRes = executeOrder(state, mockMarkets as any, 'buy', 'BTC', 0.4, {
      type: 'market',
      stopLoss: 49000,
      takeProfit: 52000,
    });
    expect(buyRes.ok).toBe(true);
    const lot = state.orders.find((o) => o.id === buyRes.order?.id)!;
    const initialCash = state.cash;

    // Price spikes to $52,200 (crossing TP1 of $52,000)
    const spikeMarkets: any = {
      ...mockMarkets,
      BTC: { ...mockMarkets.BTC, price: 52200 },
    };

    const checkResult = checkPendingOrders(state, spikeMarkets);

    // 1. Partial harvest executed
    expect(lot.partialHarvested).toBe(true);
    // 2. Position size halved (0.4 * 0.5 = 0.2 remaining)
    expect(lot.amount).toBe(0.2);
    // 3. Stop loss on remainder moved to at least +0.8% ($50,400)
    expect(lot.stopLoss).toBeGreaterThanOrEqual(+(lot.price * 1.008).toFixed(2));
    // 4. Take profit extended by +6% on the runner
    expect(lot.takeProfit).toBe(+(52200 * 1.06).toFixed(2));
    // 5. Cash credited from 50% liquidation
    expect(state.cash).toBeGreaterThan(initialCash);
    // 6. Realized PnL is positive
    expect(state.realizedPnl).toBeGreaterThan(0);
    // 7. Alert notification generated
    expect(checkResult.triggeredAlerts.some((a) => a.includes('Scale-Out TP1'))).toBe(true);
  });
});
