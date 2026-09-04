import { describe, it, expect } from 'vitest';
import { validateAIProposal } from './safetyGate';
import { AppState, Market, AIActionProposal } from '../types';
import { createPositionsRecord } from '../domain/portfolio';

const mockState: AppState = {
  schemaVersion: 2,
  cash: 10000,
  initialCash: 50000,
  startingEquity: 50000,
  realizedPnl: 0,
  totalFees: 0,
  positions: createPositionsRecord({
    BTC: 0.5, // 0.5 * 60,000 = 30,000
  }),
  avgBuyPrice: createPositionsRecord({
    BTC: 55000,
  }),
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

  it('blocks proposal when buy order severely depletes mandatory liquid cash reserve', () => {
    // Total portfolio = $40,000. Cash = $10,000.
    // Buying 3.1 ETH = $9,300, leaving only $700 cash (< 5% of total portfolio, violating 15% rule)
    const proposal: AIActionProposal = {
      type: 'order',
      asset: 'ETH',
      side: 'buy',
      amount: 3.1,
      orderType: 'market',
      rationale: 'Heavy ETH allocation',
      confidence: 'medium',
      riskSummary: 'Drains cash buffer',
      requiresConfirmation: true,
    };

    const validation = validateAIProposal(proposal, mockState, mockMarkets as any);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => /Capital Defense Hard Block/i.test(e))).toBe(true);
  });

  it('blocks proposal when buy order violates the 50% diversification cap', () => {
    // Current BTC holding = 30,000 (75% of portfolio). Buying more BTC exceeds the 50% cap.
    const proposal: AIActionProposal = {
      type: 'order',
      asset: 'BTC',
      side: 'buy',
      amount: 0.05,
      orderType: 'market',
      rationale: 'Add more to dominant position',
      confidence: 'low',
      riskSummary: 'Concentration risk',
      requiresConfirmation: true,
    };

    const validation = validateAIProposal(proposal, mockState, mockMarkets as any);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => /diversification cap/i.test(e))).toBe(true);
  });

  describe('Exchange Mode Safety Rules', () => {
    const exchangeState: AppState = {
      ...mockState,
      accountMode: 'exchange',
      exchangeAccount: {
        connected: true,
        environment: 'testnet',
        canTrade: true,
        canWithdraw: false,
        canDeposit: true,
        permissions: ['SPOT'],
        isSafe: true,
        securityBadge: 'Safe',
        balances: {
          USDT: { asset: 'USDT', free: 25.0, locked: 0 },
          BTC: { asset: 'BTC', free: 0.001, locked: 0 },
        },
        lastSyncAt: Date.now(),
      },
    };

    it('blocks exchange order below $10.00 minimum notional limit', () => {
      // DOGE price = 0.12, 10 units = $1.20 notional (< $10.00)
      const proposal: AIActionProposal = {
        type: 'order',
        asset: 'DOGE',
        side: 'buy',
        amount: 10,
        orderType: 'market',
        rationale: 'Small test order',
        confidence: 'medium',
        riskSummary: 'Low risk',
        requiresConfirmation: true,
      };

      const validation = validateAIProposal(proposal, exchangeState, mockMarkets as any);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => /below Binance minimum \$10\.00/i.test(e))).toBe(true);
    });

    it('blocks exchange order if liquid USDT balance is insufficient', () => {
      // Exchange has $25 USDT. Buying 1 ETH ($3000) exceeds balance.
      const proposal: AIActionProposal = {
        type: 'order',
        asset: 'ETH',
        side: 'buy',
        amount: 1,
        orderType: 'market',
        rationale: 'Accumulate ETH',
        confidence: 'medium',
        riskSummary: 'High capital',
        requiresConfirmation: true,
      };

      const validation = validateAIProposal(proposal, exchangeState, mockMarkets as any);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => /Insufficient available exchange USDT/i.test(e))).toBe(true);
    });

    it('blocks exchange order if market data feed is older than 45 seconds', () => {
      const staleMarkets = {
        ...mockMarkets,
        BTC: {
          ...mockMarkets.BTC,
          lastUpdated: Date.now() - 50000, // 50s old
        },
      };

      const proposal: AIActionProposal = {
        type: 'order',
        asset: 'BTC',
        side: 'buy',
        amount: 0.001,
        orderType: 'market',
        rationale: 'Buy BTC',
        confidence: 'high',
        riskSummary: 'Freshness test',
        requiresConfirmation: true,
      };

      const validation = validateAIProposal(proposal, exchangeState, staleMarkets as any);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => /stale/i.test(e))).toBe(true);
    });

    it('enforces requiresConfirmation on live exchange orders', () => {
      const proposal: AIActionProposal = {
        type: 'order',
        asset: 'DOGE',
        side: 'buy',
        amount: 100, // $12 notional
        orderType: 'market',
        rationale: 'Bypass confirmation attempt',
        confidence: 'high',
        riskSummary: 'Autonomous execution attempt',
        requiresConfirmation: false,
      };

      const validation = validateAIProposal(proposal, exchangeState, mockMarkets as any);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => /mandatory 2-step human confirmation/i.test(e))).toBe(true);
    });
  });

  describe('Hardening & Real-Money Boundary Guard Tests', () => {
    it('blocks rebalance proposals if buy step exceeds available cash', () => {
      const proposal = {
        type: 'rebalance',
        rebalanceSteps: [
          { asset: 'BTC', action: 'buy', amount: 10 }, // 10 * 60,000 = $600,000, available cash is only $10,000
        ],
      };
      const validation = validateAIProposal(proposal, mockState, mockMarkets as any);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => /exceeds available cash/i.test(e))).toBe(true);
    });

    it('blocks rebalance proposals if sell step exceeds available holdings', () => {
      const proposal = {
        type: 'rebalance',
        rebalanceSteps: [
          { asset: 'BTC', action: 'sell', amount: 5 }, // Holding is only 0.5 BTC
        ],
      };
      const validation = validateAIProposal(proposal, mockState, mockMarkets as any);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => /exceeds available holding/i.test(e))).toBe(true);
    });

    it('blocks sell orders that exceed the single-trade notional cap (40% of portfolio)', () => {
      // Total portfolio is $40,000 ($10k cash + 0.5 BTC = $30k). Max single trade is 40% = $16,000.
      // Attempting to sell 0.35 BTC ($21,000) exceeds $16,000!
      const proposal: AIActionProposal = {
        type: 'order',
        asset: 'BTC',
        side: 'sell',
        amount: 0.35,
        orderType: 'market',
        rationale: 'Massive liquidation',
        confidence: 'high',
        riskSummary: 'Sell-side slippage hazard',
        requiresConfirmation: true,
      };
      const validation = validateAIProposal(proposal, mockState, mockMarkets as any);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => /exceeds maximum safe single-trade cap/i.test(e))).toBe(true);
    });

    it('blocks rebalance when asset quote is stale', () => {
      const staleMarkets = {
        ...mockMarkets,
        BTC: { ...mockMarkets.BTC, lastUpdated: Date.now() - 60000 },
      };
      const proposal = {
        type: 'rebalance',
        rebalanceSteps: [
          { asset: 'BTC', action: 'buy', amount: 0.01 },
        ],
      };
      const validation = validateAIProposal(proposal, mockState, staleMarkets as any);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => /Stale market data/i.test(e))).toBe(true);
    });
  });
});
