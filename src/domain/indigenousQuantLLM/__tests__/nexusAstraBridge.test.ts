import { describe, it, expect } from 'vitest';
import { globalAstraNexusBridge, ASTRA_ENGINE_LABEL, AstraNexusBridge } from '../neural/nexusAstraBridge';
import { AstraFinLLMProvider } from '../../llmProvider';
import { sendAIChat } from '../../../gemini';
import { AppState, Market, Asset } from '../../../types';

function createMockState(): AppState {
  return {
    schemaVersion: 2,
    cash: 50000,
    initialCash: 50000,
    startingEquity: 50000,
    realizedPnl: 0,
    totalFees: 0,
    positions: {
      BTC: 0.25,
      ETH: 2.0,
      RELIANCE: 10,
    },
    avgBuyPrice: {},
    watchlist: ['BTC', 'RELIANCE'],
    orders: [],
    alerts: [],
    strategies: [],
    notifications: [],
    selectedAsset: 'BTC' as Asset,
    timeframe: '1D',
    accountMode: 'upstox',
    settings: {
      geminiApiKey: '',
      geminiModel: 'gemini-3.1-pro-preview',
      soundEnabled: false,
      theme: 'glass',
      maxSlippageBps: 20,
      enableWebSocket: false,
    },
    riskProfile: {
      maxDrawdownPct: 15,
      maxPositionPct: 20,
      stopLossPct: 2.5,
      takeProfitPct: 5.0,
      dailyLossLimitUsd: 1000,
    },
  } as any as AppState;
}

function createMockMarkets(): Record<string, Market> {
  return {
    BTC: {
      symbol: 'BTC',
      name: 'Bitcoin',
      price: 65000,
      change24h: 2.5,
      volume24h: 30000000000,
      history: [63000, 63500, 64000, 64500, 65000],
      candles: [
        { time: 1, open: 63000, high: 63500, low: 62800, close: 63500, volume: 100 },
        { time: 2, open: 63500, high: 64500, low: 63200, close: 64200, volume: 150 },
        { time: 3, open: 64200, high: 65200, low: 64000, close: 65000, volume: 200 },
      ],
    } as any,
    RELIANCE: {
      symbol: 'RELIANCE',
      name: 'Reliance Industries',
      price: 2950.45,
      change24h: 1.2,
      volume24h: 5000000,
      history: [2900, 2920, 2935, 2940, 2950.45],
      candles: [
        { time: 1, open: 2900, high: 2930, low: 2895, close: 2920, volume: 1000 },
        { time: 2, open: 2920, high: 2960, low: 2915, close: 2950.45, volume: 1500 },
      ],
    } as any,
  };
}

describe('Lumen-Astra-Fin 2.0: Nexus Cognitive Bridge & Chatbox Backend Suite', () => {
  it('instantiates the AstraNexusBridge with Sovereign MoE Transformer and Generator', () => {
    const bridge = new AstraNexusBridge();
    expect(bridge.getModel()).toBeDefined();
    expect(bridge.getModel().config.useMoE).toBe(true);
    expect(bridge.getModel().config.nExperts).toBe(4);
    expect(bridge.getGenerator()).toBeDefined();
  });

  it('executes /audit (Sentinel Risk Audit) with DeepSeek-R1 <think> trace and defense proposal', () => {
    const state = createMockState();
    const markets = createMockMarkets();
    const res = globalAstraNexusBridge.query('/audit', state, markets, []);

    expect(res.engine).toBe(ASTRA_ENGINE_LABEL);
    expect(res.reply).toContain('<think>');
    expect(res.reply).toContain('</think>');
    expect(res.reply).toContain('Sentinel Portfolio Danger & Risk Audit');
    expect(res.telemetry.aiMode).toContain('Lumen-Astra-Fin 2.0');
    expect(res.telemetry.toolsUsed).toContain('calculate_portfolio_risk');
    expect(res.neuralInference.policyConfidence).toBeGreaterThan(0);
    expect(res.neuralInference.policyEntropy).toBeDefined();
  });

  it('executes /scan (Alpha Radar Scanner) with multi-asset setup screening', () => {
    const state = createMockState();
    const markets = createMockMarkets();
    const res = globalAstraNexusBridge.query('/scan', state, markets, []);

    expect(res.engine).toBe(ASTRA_ENGINE_LABEL);
    expect(res.reply).toContain('<think>');
    expect(res.reply).toContain('Alpha Radar');
    expect(res.telemetry.toolsUsed).toContain('compare_tokens_alpha');
  });

  it('executes /bot (Strategy Synthesizer) with dynamic ATR bracket bot card', () => {
    const state = createMockState();
    const markets = createMockMarkets();
    const res = globalAstraNexusBridge.query('/bot RELIANCE', state, markets, []);

    expect(res.engine).toBe(ASTRA_ENGINE_LABEL);
    expect(res.reply).toContain('Strategy Bot Architecture');
    expect(res.reply).toContain('<think>');
    expect(res.actionProposal).toBeDefined();
  });

  it('executes /dca (Smart Value-Weighted DCA) with dip accumulation ticket', () => {
    const state = createMockState();
    const markets = createMockMarkets();
    const res = globalAstraNexusBridge.query('/dca BTC', state, markets, []);

    expect(res.engine).toBe(ASTRA_ENGINE_LABEL);
    expect(res.reply).toContain('Smart Value-Weighted DCA Accumulator');
    expect(res.actionProposal).toBeDefined();
    expect(res.actionProposal?.type).toBe('smart_dca');
  });

  it('executes /rebalance (Fractional Kelly Allocation)', () => {
    const state = createMockState();
    const markets = createMockMarkets();
    const res = globalAstraNexusBridge.query('/rebalance', state, markets, []);

    expect(res.engine).toBe(ASTRA_ENGINE_LABEL);
    expect(res.reply).toContain('Kelly');
    expect(res.telemetry.toolsUsed).toContain('calculate_agentic_allocation');
  });

  it('executes /stress (Crisis Stress-Test Simulation)', () => {
    const state = createMockState();
    const markets = createMockMarkets();
    const res = globalAstraNexusBridge.query('/stress', state, markets, []);

    expect(res.engine).toBe(ASTRA_ENGINE_LABEL);
    expect(res.reply).toContain('Stress-Test');
  });

  it('executes /help (Interactive Quant Tools Cheatsheet)', () => {
    const state = createMockState();
    const markets = createMockMarkets();
    const res = globalAstraNexusBridge.query('/help', state, markets, []);

    expect(res.engine).toBe(ASTRA_ENGINE_LABEL);
    expect(res.reply).toContain('Nexus Deterministic Quant Tools');
    expect(res.reply).toContain('Tick Size');
  });

  it('correctly handles Indian Equity microstructure with ₹0.05 tick size and ₹2,000 cash floor', () => {
    const state = createMockState();
    const markets = createMockMarkets();
    state.selectedAsset = 'RELIANCE' as Asset;
    const res = globalAstraNexusBridge.query('analyze RELIANCE', state, markets, []);

    expect(res.engine).toBe(ASTRA_ENGINE_LABEL);
    expect(res.reply).toContain('Quantitative NSE Equity Analysis: RELIANCE');
    expect(res.reply).toContain('₹0.05 NSE Compliant');
    expect(res.reply).toContain('₹2,000');
    if (res.actionProposal && res.actionProposal.type === 'order') {
      expect(res.actionProposal.amount! % 1).toBe(0); // integer shares
      expect(Number((res.actionProposal.limitPrice! * 100).toFixed(0)) % 5).toBe(0); // 0.05 tick increment
    }
  });

  it('AstraFinLLMProvider satisfies LLMProvider interface and returns thought + analysis', async () => {
    const provider = new AstraFinLLMProvider();
    expect(provider.name).toBe('Lumen-Astra-Fin 2.0 Sovereign Provider');

    const res = await provider.generate({
      model: 'lumen-astra-fin-2.0-moe',
      messages: [{ role: 'user', content: 'What is our portfolio danger level?' }],
      tools: [
        {
          name: 'calculate_portfolio_risk',
          description: 'risk',
          parameters: { type: 'object', properties: {} },
          execute: async () => ({}),
        },
      ],
    });

    // Tool call triggered on turn 1
    expect(res.toolCalls).toBeDefined();
    expect(res.toolCalls![0].name).toBe('calculate_portfolio_risk');

    // Turn 2 with tool results
    const resTurn2 = await provider.generate({
      model: 'lumen-astra-fin-2.0-moe',
      messages: [
        { role: 'user', content: 'What is our portfolio danger level?' },
        { role: 'model', toolResults: [{ name: 'calculate_portfolio_risk', result: { risk: 'low' } }] },
      ],
    });

    expect(resTurn2.text).toContain('<think>');
    expect(resTurn2.text).toContain('Lumen-Astra-Fin 2.0 Neural Analysis');
  });

  it('sendAIChat seamlessly runs Lumen-Astra-Fin 2.0 when offline or on slash commands', async () => {
    const state = createMockState();
    const markets = createMockMarkets();
    const response = await sendAIChat('/audit', state, markets as any, []);

    expect(response.engine).toBe(ASTRA_ENGINE_LABEL);
    expect(response.reply).toContain('<think>');
    expect(response.telemetry?.aiMode).toContain('Lumen-Astra-Fin 2.0');
  });
});
