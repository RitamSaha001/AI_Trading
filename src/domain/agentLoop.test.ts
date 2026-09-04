import { describe, it, expect } from 'vitest';
import { runAgentLoop } from './agentLoop';
import { LLMProvider, LLMGenerateRequest, LLMGenerateResponse } from './llmProvider';
import { AppState, Market, ASSETS } from '../types';
import { createPositionsRecord } from './portfolio';

const mockState: AppState = {
  schemaVersion: 2,
  cash: 20000,
  initialCash: 50000,
  startingEquity: 50000,
  realizedPnl: 1000,
  totalFees: 25,
  positions: createPositionsRecord({
    BTC: 0.4, // $24,000
  }),
  avgBuyPrice: createPositionsRecord({
    BTC: 58000,
  }),
  watchlist: ['BTC', 'ETH', 'SOL'],
  orders: [],
  alerts: [],
  strategies: [],
  notifications: [],
  timeframe: '1D',
  selectedAsset: 'SOL',
  settings: {
    geminiApiKey: 'test-key',
    geminiModel: 'gemini-3.1-pro-preview',
    soundEnabled: true,
    enableWebSocket: true,
    theme: 'light',
    maxSlippageBps: 20,
  },
};

const mockMarkets: Record<string, Market> = {
  BTC: {
    asset: 'BTC',
    symbol: 'BTCUSDT',
    name: 'Bitcoin',
    price: 60000,
    change24h: 1.5,
    high24h: 61000,
    low24h: 59000,
    volume24h: 500000000,
    history: Array.from({ length: 30 }, (_, i) => 60000 + i * 20),
    candles: [],
    source: 'Binance REST',
    isSynthetic: false,
    lastUpdated: Date.now(),
  },
  SOL: {
    asset: 'SOL',
    symbol: 'SOLUSDT',
    name: 'Solana',
    price: 150,
    change24h: 3.2,
    high24h: 155,
    low24h: 146,
    volume24h: 80000000,
    history: Array.from({ length: 30 }, (_, i) => 140 + i * 0.4),
    candles: [],
    source: 'Binance REST',
    isSynthetic: false,
    lastUpdated: Date.now(),
  },
};

/**
 * Mock LLM Provider simulating multi-turn tool calling:
 * Turn 1: Calls `get_market_snapshot` and `calculate_portfolio_risk`
 * Turn 2: Returns synthesized answer with structured `<<<DECISION>>>` payload
 */
class MockMultiTurnLLMProvider implements LLMProvider {
  name = 'Mock Frontier Provider';
  callCount = 0;

  async generate(req: LLMGenerateRequest): Promise<LLMGenerateResponse> {
    this.callCount++;

    if (this.callCount === 1) {
      // First turn: invoke tools
      return {
        toolCalls: [
          { name: 'get_market_snapshot', args: { asset: 'SOL' } },
          { name: 'calculate_portfolio_risk', args: {} },
        ],
      };
    }

    // Second turn: model receives tool observations and produces structured decision
    const decisionPayload = JSON.stringify({
      intent: 'Risk-budgeted entry in SOL',
      thesis: 'SOL presents constructive momentum with controlled portfolio risk impact.',
      evidence: ['SOL spot price confirmed at $150', 'Portfolio cash buffer is 45.4%'],
      asset: 'SOL',
      action: 'BUY',
      entry: 150,
      stopLoss: 142,
      takeProfit: 168,
      quantity: 5,
      notional: 750,
      riskAmount: 40,
      portfolioRiskImpact: 'Adds $750 exposure (1.7% of portfolio); cash buffer stays above 40%.',
      signalScore: 65,
      modelConfidence: 82,
      dataQuality: 95,
      riskReward: 2.25,
      assumptions: ['BTC maintains stability above $58k'],
      warnings: ['Volatility expansion expected around US market open'],
      alternatives: ['Scale in with 2 tranches'],
      requiresConfirmation: true,
      timeHorizon: 'swing',
      regime: 'Bullish Trend Alignment',
    });

    return {
      text: `### Executive Analysis: Solana (SOL)
Based on live market feeds and portfolio risk analysis, SOL is displaying constructive momentum.

<<<DECISION
${decisionPayload}
DECISION>>>`,
    };
  }
}

describe('Domain: Multi-Turn Agent Loop & Tool Calling', () => {
  it('executes multi-turn tool calling, receives observations, and returns structured decision', async () => {
    const mockProvider = new MockMultiTurnLLMProvider();

    const result = await runAgentLoop({
      query: 'Analyze SOL and tell me if I should take a swing position.',
      state: mockState,
      markets: mockMarkets as any,
      history: [],
      provider: mockProvider,
      model: 'gemini-3.1-pro-preview',
      apiKey: 'test-key',
    });

    // Verify multi-turn tool calling
    expect(mockProvider.callCount).toBe(2);
    expect(result.telemetry.toolsUsed).toContain('get_market_snapshot');
    expect(result.telemetry.toolsUsed).toContain('calculate_portfolio_risk');
    expect(result.telemetry.loopIterations).toBe(2);

    // Verify response synthesis and decision parsing
    expect(result.reply).toContain('Executive Analysis');
    expect(result.reply).not.toContain('<<<DECISION'); // Stripped from text
    expect(result.decision).toBeDefined();
    expect(result.decision?.asset).toBe('SOL');
    expect(result.decision?.action).toBe('BUY');
    expect(result.decision?.quantity).toBe(5);

    // Verify Action Proposal passed through safety gate
    expect(result.actionProposal).toBeDefined();
    expect(result.actionProposal?.asset).toBe('SOL');
    expect(result.actionProposal?.side).toBe('buy');
    expect(result.actionProposal?.amount).toBe(5);
    expect(result.actionProposal?.requiresConfirmation).toBe(true);
  });

  it('extracts and updates user session preferences from conversation text', async () => {
    const mockProvider = new MockMultiTurnLLMProvider();

    const result = await runAgentLoop({
      query: 'My maximum risk per trade is 0.5%. Never sell BTC.',
      state: mockState,
      markets: mockMarkets as any,
      history: [],
      provider: mockProvider,
      model: 'gemini-3.1-pro-preview',
      apiKey: 'test-key',
    });

    expect(result.updatedPreferences).toBeDefined();
    expect(result.updatedPreferences?.maxTradeRiskPct).toBe(0.005);
    expect(result.updatedPreferences?.specialInstructions.some((s) => s.includes('Never sell BTC') || s.includes('Preserve core holding in BTC'))).toBe(true);
  });

  it('blocks proposal execution when market data is stale', async () => {
    const staleMarkets = {
      ...mockMarkets,
      SOL: {
        ...mockMarkets.SOL,
        lastUpdated: Date.now() - 100000, // 100s old
      },
    };

    const mockProvider = new MockMultiTurnLLMProvider();
    const result = await runAgentLoop({
      query: 'Buy SOL now',
      state: mockState,
      markets: staleMarkets as any,
      history: [],
      provider: mockProvider,
      model: 'gemini-3.1-pro-preview',
      apiKey: 'test-key',
    });

    // Stale data must block the executable proposal
    expect(result.actionProposal).toBeNull();
    expect(result.reply).toContain('Execution Gate Block');
  });
});
