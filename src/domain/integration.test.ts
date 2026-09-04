import { describe, it, expect } from 'vitest';
import { sendAIChat } from '../gemini';
import { AppState, Market, ASSETS } from '../types';
import { createPositionsRecord } from './portfolio';
import { MarketDataValidityGuard } from './marketValidity';
import { calculateRiskBasedPositionSize } from './positionSizing';
import { challengeTradingDecision } from './challenger';
import { validateAIProposal } from '../services/safetyGate';
import { DEFAULT_RISK_POLICY } from './riskPolicy';

const createMockMarket = (asset: string, price: number, chg = 0, ageMs = 5000): Market => ({
  asset: asset as any,
  symbol: `${asset}USDT`,
  name: asset,
  price,
  change24h: chg,
  high24h: price * 1.05,
  low24h: price * 0.95,
  volume24h: 150000000,
  history: Array.from({ length: 30 }, (_, i) => price * (1 + 0.02 * Math.sin(i * 0.5))),
  candles: [],
  source: 'Binance REST',
  isSynthetic: false,
  lastUpdated: Date.now() - ageMs,
});

const mockMarkets = Object.fromEntries(
  ASSETS.map((a) => {
    let p = 100;
    if (a === 'BTC') p = 60000;
    if (a === 'ETH') p = 3000;
    if (a === 'SOL') p = 150;
    if (a === 'AVAX') p = 30;
    return [a, createMockMarket(a, p, 1.2)];
  })
) as Record<any, Market>;

const baseState: AppState = {
  schemaVersion: 2,
  cash: 20000,
  initialCash: 50000,
  startingEquity: 50000,
  realizedPnl: 1500,
  totalFees: 35,
  positions: createPositionsRecord({
    BTC: 0.5, // $30,000 (60% concentration)
    ETH: 3.0, // $9,000
  }),
  avgBuyPrice: createPositionsRecord({
    BTC: 58000,
    ETH: 2900,
  }),
  watchlist: ['BTC', 'ETH', 'SOL'],
  orders: [],
  alerts: [],
  strategies: [],
  notifications: [],
  timeframe: '1D',
  selectedAsset: 'BTC',
  settings: {
    geminiApiKey: '',
    geminiModel: 'gemini-3.1-pro-preview',
    soundEnabled: true,
    enableWebSocket: true,
    theme: 'light',
    maxSlippageBps: 20,
  },
};

describe('Integration: Advanced Quantitative Trading Platform End-to-End', () => {
  it('handles offline fallback mode gracefully when API key is empty', async () => {
    const res = await sendAIChat(
      'Analyze my portfolio risk and tell me what is driving danger.',
      baseState,
      mockMarkets,
      []
    );

    expect(res.reply).toBeDefined();
    expect(res.engine).toContain('Deterministic Quant Engine');
    expect(res.telemetry).toBeDefined();
    expect(res.telemetry?.aiMode).toContain('Deterministic');
    expect(res.telemetry?.toolsUsed).toContain('calculate_portfolio_risk');
  });

  it('handles ambiguous natural language prompt realistically', async () => {
    const res = await sendAIChat(
      'Bro, my portfolio has been getting hammered. Tell me exactly what is driving the risk and whether I should make changes.',
      baseState,
      mockMarkets,
      []
    );

    expect(res.reply).toBeDefined();
    expect(res.reply.length).toBeGreaterThan(100);
    // Should touch concentration and capital defense
    expect(res.reply).toMatch(/Concentration|Risk|Equity|Cash/i);
  });

  it('strictly blocks executable proposals when market data is stale (> 45s)', () => {
    const staleMarket = createMockMarket('SOL', 150, 0, 75000); // 75s old
    const validity = MarketDataValidityGuard.validate(staleMarket, 'SOL', DEFAULT_RISK_POLICY, {
      requireExecutionGrade: true,
    });

    expect(validity.isStale).toBe(true);
    expect(validity.canExecute).toBe(false);
    expect(validity.errors.some((e) => e.includes('Executable proposals are strictly disabled'))).toBe(true);

    const proposal = {
      type: 'order',
      asset: 'SOL',
      side: 'buy',
      amount: 10,
      rationale: 'Stale quote purchase',
      confidence: 'medium',
      riskSummary: 'Stale test',
      requiresConfirmation: true,
    };

    const safety = validateAIProposal(proposal, baseState, {
      ...mockMarkets,
      SOL: staleMarket,
    } as any);

    // Warning or error generated on stale data
    expect(safety.warnings.some((w) => w.includes('lagging') || w.includes('stale'))).toBe(true);
  });

  it('prevents oversized trade proposals from bypassing safety gate', () => {
    // Attempt to buy $50,000 of ETH with only $20,000 cash
    const oversizedProposal = {
      type: 'order',
      asset: 'ETH',
      side: 'buy',
      amount: 17, // 17 * $3,000 = $51,000
      orderType: 'market',
      rationale: 'Massive unconstrained buy',
      confidence: 'high',
      riskSummary: 'Extreme size',
      requiresConfirmation: true,
    };

    const safety = validateAIProposal(oversizedProposal, baseState, mockMarkets);
    expect(safety.valid).toBe(false);
    expect(safety.errors.some((e) => /insufficient.*cash|single-trade cap/i.test(e))).toBe(true);
  });

  it('enforces risk-based sizing and prevents cash depletion', () => {
    // Total Equity: $59,000. Cash: $20,000.
    // Proposing trade on SOL at $150 with stop at $140
    const size = calculateRiskBasedPositionSize({
      asset: 'SOL',
      side: 'buy',
      entryPrice: 150,
      stopPrice: 140,
      targetPrice: 175,
      portfolioEquity: 59000,
      availableCash: 20000,
      currentHolding: 0,
      currentHoldingNotional: 0,
      policy: DEFAULT_RISK_POLICY,
    });

    expect(size.quantity).toBeGreaterThan(0);
    // Theoretical max loss should equal risk budget (2% of $59k = $1,180)
    expect(size.theoreticalMaxLoss).toBeLessThanOrEqual(1180.01);
    expect(size.notional).toBeLessThanOrEqual(20000);
    expect(size.riskRewardRatio).toBe(2.5);
  });

  it('runs challenger pass and catches concentration risks', () => {
    // Buying more BTC when BTC is already 60% of portfolio
    const challenge = challengeTradingDecision(
      {
        asset: 'BTC',
        action: 'BUY',
        notional: 3000,
        quantity: 0.05,
      },
      baseState,
      mockMarkets,
      DEFAULT_RISK_POLICY
    );

    expect(challenge.hasCriticalConcerns).toBe(true);
    expect(challenge.concerns.some((c) => /single-asset cap/i.test(c))).toBe(true);
    expect(challenge.counterArgument).toBeDefined();
  });

  it('handles extreme portfolio states safely (100% cash, 0% positions)', () => {
    const allCashState: AppState = {
      ...baseState,
      cash: 50000,
      positions: createPositionsRecord({}),
      avgBuyPrice: createPositionsRecord({}),
    };

    const res = MarketDataValidityGuard.validate(mockMarkets.BTC, 'BTC');
    expect(res.canExecute).toBe(true);

    const size = calculateRiskBasedPositionSize({
      asset: 'BTC',
      side: 'buy',
      entryPrice: 60000,
      stopPrice: 58000,
      portfolioEquity: 50000,
      availableCash: 50000,
      currentHolding: 0,
      currentHoldingNotional: 0,
    });

    expect(size.quantity).toBeGreaterThan(0);
    expect(size.notional).toBeLessThanOrEqual(50000 * DEFAULT_RISK_POLICY.maxSingleAssetPct);
  });
});
