import { describe, it, expect } from 'vitest';
import { validateAIProposal } from './safetyGate';
import { AppState, Market, AIActionProposal } from '../types';

const mockState: AppState = {
  schemaVersion: 2,
  cash: 10000,
  initialCash: 50000,
  startingEquity: 50000,
  realizedPnl: 0,
  totalFees: 0,
  positions: {
    BTC: 0.5, // 0.5 * 60,000 = 30,000
    ETH: 0,
    SOL: 0,
    ADA: 0,
    XRP: 0,
    AVAX: 0,
    LINK: 0,
    DOGE: 0,
  },
  avgBuyPrice: {
    BTC: 55000,
    ETH: 0,
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
  BTC: createMockMarket('BTC', 60000, 1.5),
  ETH: createMockMarket('ETH', 3000, -1.0),
  SOL: createMockMarket('SOL', 150, 2.0),
  ADA: createMockMarket('ADA', 0.5, 0.0),
  XRP: createMockMarket('XRP', 0.6, 0.0),
  AVAX: createMockMarket('AVAX', 30, 0.0),
  LINK: createMockMarket('LINK', 15, 0.0),
  DOGE: createMockMarket('DOGE', 0.12, 0.0),
};

describe('Service: AI Safety Gate Verification', () => {
  it('approves a safe, conservative trade within risk limits', () => {
    // Total portfolio = 10,000 cash + 30,000 BTC = 40,000
    // Buy 1 ETH at $3,000 = $3,000 notional (7.5% of portfolio, under 50% single asset limit)
    const proposal: AIActionProposal = {
      type: 'order',
      asset: 'ETH',
      side: 'buy',
      amount: 1,
      orderType: 'market',
      rationale: 'Diversification into ETH based on RSI support.',
      confidence: 'medium',
      riskSummary: 'Conservative sizing',
      requiresConfirmation: true,
    };

    const validation = validateAIProposal(proposal, mockState, mockMarkets as any);
    expect(validation.valid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });

  it('blocks proposal if notional cost exceeds available cash', () => {
    // Attempting to buy 5 ETH = $15,000 with only $10,000 cash
    const proposal: AIActionProposal = {
      type: 'order',
      asset: 'ETH',
      side: 'buy',
      amount: 5,
      orderType: 'market',
      rationale: 'Aggressive accumulation.',
      confidence: 'medium',
      riskSummary: 'High capital allocation',
      requiresConfirmation: true,
    };

    const validation = validateAIProposal(proposal, mockState, mockMarkets as any);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((v) => /insufficient.*cash/i.test(v))).toBe(true);
  });

  it('validates alert creation proposals safely', () => {
    const proposal: AIActionProposal = {
      type: 'alert',
      asset: 'BTC',
      alertType: 'above',
      value: 65000,
      rationale: 'Set resistance breakout trigger.',
      confidence: 'high',
      riskSummary: 'Informational trigger only',
      requiresConfirmation: true,
    };

    const validation = validateAIProposal(proposal, mockState, mockMarkets as any);
    expect(validation.valid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });
});
