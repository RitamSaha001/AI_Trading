import { describe, it, expect } from 'vitest';
import {
  portfolioValue,
  positionPnl,
  totalPortfolioPnl,
  money,
  formatQty,
} from './portfolio';
import { AppState, Market } from '../types';

const mockState: AppState = {
  schemaVersion: 2,
  cash: 25000,
  initialCash: 50000,
  startingEquity: 50000,
  realizedPnl: 1500,
  totalFees: 35,
  positions: {
    BTC: 0.5,
    ETH: 4.0,
    SOL: 0,
    ADA: 0,
    XRP: 0,
    AVAX: 0,
    LINK: 0,
    DOGE: 0,
  },
  avgBuyPrice: {
    BTC: 60000, // Cost: 0.5 * 60,000 = 30,000
    ETH: 3000,  // Cost: 4.0 * 3,000 = 12,000
    SOL: 0,
    ADA: 0,
    XRP: 0,
    AVAX: 0,
    LINK: 0,
    DOGE: 0,
  },
  watchlist: ['BTC', 'ETH'],
  orders: [],
  alerts: [],
  strategies: [],
  notifications: [],
  timeframe: '1D',
  selectedAsset: 'BTC',
  settings: {
    geminiApiKey: '',
    geminiModel: 'gemini-1.5-flash',
    soundEnabled: true,
    enableWebSocket: true,
    theme: 'light',
    maxSlippageBps: 20,
  },
};

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
  BTC: createMockMarket('BTC', 70000, 3.5),
  ETH: createMockMarket('ETH', 3500, -1.2),
  SOL: createMockMarket('SOL', 150, 2.1),
  ADA: createMockMarket('ADA', 0.5, 0.5),
  XRP: createMockMarket('XRP', 0.6, 1.0),
  AVAX: createMockMarket('AVAX', 30, -0.5),
  LINK: createMockMarket('LINK', 15, 1.5),
  DOGE: createMockMarket('DOGE', 0.12, 0.2),
};

describe('Domain: Portfolio Valuation and Calculations', () => {
  it('calculates total portfolio liquidation value correctly', () => {
    // BTC: 0.5 * 70,000 = 35,000
    // ETH: 4.0 * 3,500 = 14,000
    // Cash: 25,000
    // Total: 74,000
    const val = portfolioValue(mockState, mockMarkets as any);
    expect(val).toBe(74000);
  });

  it('calculates single position unrealized P&L and return percentage', () => {
    // BTC: cost = 0.5 * 60,000 = 30,000; current = 0.5 * 70,000 = 35,000
    // PnL = +5,000, pct = 5,000 / 30,000 = 16.6667%
    const btcPnl = positionPnl(mockState, mockMarkets as any, 'BTC');
    expect(btcPnl.costBasis).toBe(30000);
    expect(btcPnl.currentValue).toBe(35000);
    expect(btcPnl.amount).toBe(5000);
    expect(btcPnl.pct).toBeCloseTo(16.6667, 2);

    // SOL has 0 units
    const solPnl = positionPnl(mockState, mockMarkets as any, 'SOL');
    expect(solPnl.amount).toBe(0);
    expect(solPnl.pct).toBe(0);
  });

  it('calculates total portfolio P&L combining realized and unrealized', () => {
    // BTC unrealized: +5,000
    // ETH unrealized: (4 * 3,500) - (4 * 3,000) = 14,000 - 12,000 = +2,000
    // Total unrealized = +7,000
    // Realized = +1,500
    // Total PnL = +8,500
    // Starting equity = 50,000
    // Pct = 8,500 / 50,000 = 17.0%
    const res = totalPortfolioPnl(mockState, mockMarkets as any);
    expect(res.realizedPnl).toBe(1500);
    expect(res.unrealizedPnl).toBe(7000);
    expect(res.totalPnl).toBe(8500);
    expect(res.amount).toBe(8500);
    expect(res.pct).toBe(17.0);
    expect(res.totalValue).toBe(74000);
  });

  it('formats currency and quantities with mathematical safety', () => {
    expect(money(0)).toBe('$0.00');
    expect(money(54321.5)).toBe('$54,321.50');
    expect(money(0.005)).toBe('$0.0050');
    expect(money(-1200)).toBe('$-1,200.00');
    expect(formatQty(0.12345678, 'BTC')).toBe('0.12346');
  });
});
