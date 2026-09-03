import { describe, it, expect } from 'vitest';
import {
  simulatePortfolioStressTest,
  synthesizeStrategyBot,
  generateSmartDCAPlan,
  compareTokensAlpha,
} from './agentic';
import { validateAIProposal } from '../services/safetyGate';
import { AppState, Market, AIActionProposal } from '../types';
import { createPositionsRecord } from './portfolio';

const createMockMarket = (asset: string, price: number, change24h = 0): Market => ({
  asset: asset as any,
  symbol: `${asset}USDT`,
  name: asset,
  price,
  change24h,
  high24h: price * 1.05,
  low24h: price * 0.95,
  volume24h: 100000000,
  history: Array.from({ length: 30 }, (_, i) => price * (1 + 0.03 * Math.sin(i * 0.5))),
  candles: [],
  source: 'Simulated Heuristic',
  isSynthetic: false,
  lastUpdated: Date.now(),
});

const mockState: AppState = {
  schemaVersion: 2,
  cash: 15000,
  initialCash: 50000,
  startingEquity: 50000,
  realizedPnl: 2500,
  totalFees: 45,
  positions: createPositionsRecord({
    BTC: 0.5, // 0.5 * 60,000 = 30,000
    ETH: 3,   // 3 * 3,000 = 9,000
    SOL: 20,  // 20 * 150 = 3,000
  }),
  avgBuyPrice: createPositionsRecord({
    BTC: 58000,
    ETH: 2800,
    SOL: 130,
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
    geminiModel: 'gemini-3.8-flash',
    soundEnabled: true,
    enableWebSocket: true,
    theme: 'light',
    maxSlippageBps: 20,
  },
};

const mockMarkets: Record<string, Market> = {
  BTC: createMockMarket('BTC', 60000, 1.2),
  ETH: createMockMarket('ETH', 3000, -2.1),
  SOL: createMockMarket('SOL', 150, 4.5),
};

describe('Agentic Domain: Portfolio Stress Testing', () => {
  it('simulates a 20% BTC crash scenario with proportional losses and survivability', () => {
    const shock = simulatePortfolioStressTest(mockState, mockMarkets, 'btc_flash_crash_20');
    expect(shock.scenarioId).toBe('btc_flash_crash_20');
    expect(shock.simulatedLossUsd).toBeGreaterThan(0);
    expect(shock.simulatedDrawdownPct).toBeGreaterThan(0);
    expect(shock.simulatedDrawdownPct).toBeLessThan(100);
    expect(shock.postShockPortfolioVal).toBeGreaterThan(0);
    expect(['Robust', 'Moderate', 'Vulnerable', 'Critical']).toContain(shock.survivabilityRating);
    expect(shock.mitigationSteps.length).toBeGreaterThan(0);
    expect(shock.assetImpacts.length).toBeGreaterThan(0);
  });

  it('evaluates crypto winter cascade scenario with deeper drawdowns', () => {
    const shock = simulatePortfolioStressTest(mockState, mockMarkets, 'crypto_winter_cascade');
    expect(shock.simulatedDrawdownPct).toBeGreaterThan(25);
    expect(shock.survivabilityScore).toBeGreaterThanOrEqual(0);
    expect(shock.survivabilityScore).toBeLessThanOrEqual(100);
  });
});

describe('Agentic Domain: Strategy Bot Synthesizer', () => {
  it('calibrates dynamic ATR take-profit and trailing stop brackets for volatile assets', () => {
    const bot = synthesizeStrategyBot('SOL', 'vwap_trend', mockState, mockMarkets as any);
    expect(bot.asset).toBe('SOL');
    expect(bot.kind).toBe('vwap_trend');
    expect(bot.targetProfitPct).toBeGreaterThanOrEqual(2.5);
    expect(bot.trailingStopPct).toBeGreaterThanOrEqual(1.0);
    expect(bot.maxAllocation).toBeLessThanOrEqual(0.35);
    expect(bot.params.atrMultiplierTP).toBeGreaterThan(1.5);
    expect(bot.params.atrMultiplierSL).toBeGreaterThan(0.5);
  });
});

describe('Agentic Domain: Smart DCA Plan Generator', () => {
  it('creates value-weighted DCA accumulation schedule with dip multipliers', () => {
    const dca = generateSmartDCAPlan('ETH', 250, mockState, mockMarkets as any);
    expect(dca.asset).toBe('ETH');
    expect(dca.baseAmountUsd).toBe(250);
    expect(dca.frequency).toBe('Weekly');
    expect(dca.oversoldMultiplier).toBe(1.6);
    expect(dca.pauseThresholdRsi).toBe(70);
    expect(dca.targetProfitPct).toBeGreaterThan(0);
    expect(dca.trailingStopPct).toBeGreaterThan(0);
  });
});

describe('Agentic Domain: Multi-Token Alpha Radar', () => {
  it('computes Sharpe, beta, annualized volatility, and returns top alpha asset', () => {
    const comparison = compareTokensAlpha(['BTC', 'ETH', 'SOL'], mockMarkets as any);
    expect(comparison.tokens.length).toBe(3);
    expect(['BTC', 'ETH', 'SOL']).toContain(comparison.topAlphaAsset);
    expect(comparison.verdict).toBeDefined();

    for (const t of comparison.tokens) {
      expect(t.volAnnualizedPct).toBeGreaterThan(0);
      expect(typeof t.sharpeEstimate).toBe('number');
      expect(typeof t.betaToBtc).toBe('number');
      expect(typeof t.rsi).toBe('number');
    }
  });
});

describe('Agentic Safety Gate: Deploy Strategy & Smart DCA Validations', () => {
  it('authorizes strategy deployment when allocation is within safe limits', () => {
    const proposal: AIActionProposal = {
      type: 'deploy_strategy',
      asset: 'SOL',
      strategyParams: {
        name: 'Solana Nexus Trend',
        kind: 'vwap_trend',
        maxAllocation: 0.2,
        cooldownSec: 20,
        targetProfitPct: 6.5,
        trailingStopPct: 2.2,
      },
      rationale: 'Trend breakout on VWAP support.',
      confidence: 'high',
      riskSummary: 'Max 20% portfolio allocation',
      requiresConfirmation: true,
    };

    const result = validateAIProposal(proposal, mockState, mockMarkets as any);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('blocks strategy deployment if single-bot allocation exceeds 50% threshold', () => {
    const proposal: AIActionProposal = {
      type: 'deploy_strategy',
      asset: 'SOL',
      strategyParams: {
        name: 'Solana Overallocated',
        kind: 'vwap_trend',
        maxAllocation: 0.65,
        cooldownSec: 20,
        targetProfitPct: 5,
        trailingStopPct: 2,
      },
      rationale: 'Extreme allocation test.',
      confidence: 'low',
      riskSummary: 'Excessive exposure',
      requiresConfirmation: true,
    };

    const result = validateAIProposal(proposal, mockState, mockMarkets as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /50%/i.test(e))).toBe(true);
  });

  it('validates stress-test proposal without blocking', () => {
    const shock = simulatePortfolioStressTest(mockState, mockMarkets, 'btc_flash_crash_20');
    const proposal: AIActionProposal = {
      type: 'stress_test',
      asset: 'BTC',
      stressTest: shock,
      rationale: 'Audit under 20% drop.',
      confidence: 'high',
      riskSummary: 'Simulation audit',
      requiresConfirmation: false,
    };

    const result = validateAIProposal(proposal, mockState, mockMarkets as any);
    expect(result.valid).toBe(true);
  });
});
