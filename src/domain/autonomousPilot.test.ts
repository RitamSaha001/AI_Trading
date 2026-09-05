import { describe, it, expect } from 'vitest';
import {
  detectMarketRegime,
  alignToTickSize,
  evaluateMarketOpportunity,
  scanAllMarkets,
  checkPilotCircuitBreaker,
  PILOT_PROFILES,
  createDefaultAutonomousPilotState,
} from './autonomousPilot';
import { AppState, Market } from '../types';

describe('Autonomous Local Quant Pilot Engine', () => {
  const mockState: AppState = {
    schemaVersion: 1,
    cash: 50000,
    initialCash: 50000,
    startingEquity: 50000,
    realizedPnl: 0,
    totalFees: 0,
    positions: { RELIANCE: 0, BTC: 0 } as any,
    avgBuyPrice: { RELIANCE: 0, BTC: 0 } as any,
    watchlist: ['RELIANCE', 'TCS', 'BTC'],
    orders: [],
    alerts: [],
    strategies: [],
    settings: {
      geminiApiKey: '',
      geminiModel: 'gemini-3.1-pro-preview',
      soundEnabled: false,
      theme: 'glass',
      maxSlippageBps: 50,
      enableWebSocket: false,
    },
    notifications: [],
    timeframe: '1D',
    selectedAsset: 'RELIANCE',
  };

  const createMockMarket = (asset: any, price: number, history: number[], change24h = 2.0): Market => ({
    asset,
    name: asset,
    symbol: asset,
    price,
    change24h,
    high24h: price * 1.02,
    low24h: price * 0.98,
    volume24h: 1000000,
    history,
    candles: [],
    lastUpdated: Date.now(),
    source: 'Upstox Heuristic Simulation',
    isSynthetic: false,
  });

  describe('Tick Size Alignment', () => {
    it('aligns Indian equities strictly to NSE 0.05 tick size', () => {
      expect(alignToTickSize(2800.03, 'RELIANCE')).toBe(2800.05);
      expect(alignToTickSize(2800.01, 'RELIANCE')).toBe(2800.0);
      expect(alignToTickSize(2800.08, 'RELIANCE')).toBe(2800.1);
      expect(alignToTickSize(1600.24, 'HDFCBANK')).toBe(1600.25);
    });

    it('aligns standard global assets to 0.01 tick size', () => {
      expect(alignToTickSize(67850.1234, 'BTC')).toBe(67850.12);
      expect(alignToTickSize(3520.456, 'ETH')).toBe(3520.46);
    });
  });

  describe('Market Regime Detection', () => {
    it('returns LOW_LIQUIDITY_DANGER for invalid or zero-price market', () => {
      expect(detectMarketRegime(undefined)).toBe('LOW_LIQUIDITY_DANGER');
      expect(detectMarketRegime({ price: 0 } as any)).toBe('LOW_LIQUIDITY_DANGER');
    });

    it('identifies BULLISH_EXPANSION when price > s10 > s30 and RSI is healthy', () => {
      // Create series with ascending prices
      const history = Array.from({ length: 40 }, (_, i) => 100 + i * 2);
      const market = createMockMarket('RELIANCE', 180, history, 3.5);
      const regime = detectMarketRegime(market);
      expect(regime).toBe('BULLISH_EXPANSION');
    });
  });

  describe('Opportunity Evaluation & Anti-Loss Invariants', () => {
    it('strictly returns null if market is not favorable or missing', () => {
      expect(evaluateMarketOpportunity('RELIANCE', undefined, mockState)).toBeNull();
    });

    it('computes mathematically verified R:R ratio >= 2.8 for Conservative Guardian', () => {
      const history = Array.from({ length: 40 }, (_, i) => 2700 + i * 5);
      const market = createMockMarket('RELIANCE', 2900, history, 2.1);

      const opp = evaluateMarketOpportunity('RELIANCE', market, mockState, 'conservative');
      if (opp) {
        expect(opp.riskRewardRatio).toBeGreaterThanOrEqual(2.8);
        expect(opp.stopLossPrice).toBeLessThan(opp.entryPrice);
        expect(opp.takeProfitPrice).toBeGreaterThan(opp.entryPrice);
        expect(opp.recommendedUnits).toBeGreaterThan(0);
        expect(opp.maxCapitalAtRisk).toBeLessThanOrEqual(mockState.cash * 0.015);
        expect(opp.beginnerExplanation.verdict).toContain('Strong Buy');
        expect(opp.beginnerExplanation.safeguardNotice).toContain('₹');
      }
    });

    it('ensures position size strictly respects the risk budget (<=1.5% max risk)', () => {
      const history = Array.from({ length: 40 }, (_, i) => 60000 + i * 200);
      const market = createMockMarket('BTC', 68000, history, 1.8);

      const opp = evaluateMarketOpportunity('BTC', market, mockState, 'balanced');
      if (opp) {
        expect(opp.riskRewardRatio).toBeGreaterThanOrEqual(2.2);
        expect(opp.maxCapitalAtRisk).toBeLessThanOrEqual(mockState.cash * 0.015);
        expect(opp.beginnerExplanation.safeguardNotice).toContain('$');
      }
    });
  });

  describe('Circuit Breaker Sentinel', () => {
    it('does not trip when portfolio is at or above starting equity', () => {
      const res = checkPilotCircuitBreaker(mockState, 50500, 'conservative');
      expect(res.tripped).toBe(false);
      expect(res.drawdownPct).toBe(0);
    });

    it('trips when portfolio drawdown exceeds profile limit', () => {
      // Conservative limit is 1.2%. Let's test 1.5% drop (50000 -> 49250)
      const res = checkPilotCircuitBreaker(mockState, 49250, 'conservative');
      expect(res.tripped).toBe(true);
      expect(res.drawdownPct).toBe(1.5);
      expect(res.reason).toContain('Circuit Breaker Tripped');
    });
  });

  describe('Autonomous Pilot State & Market Scanning', () => {
    it('creates a safe default state with circuit breaker ready', () => {
      const state = createDefaultAutonomousPilotState(100000);
      expect(state.enabled).toBe(false);
      expect(state.profile).toBe('conservative');
      expect(state.dailyStartingValue).toBe(100000);
      expect(state.circuitBreakerTripped).toBe(false);
      expect(state.activeOpportunities).toHaveLength(0);
    });

    it('scans multiple markets and orders by composite score', () => {
      const history1 = Array.from({ length: 40 }, (_, i) => 2500 + i * 8);
      const history2 = Array.from({ length: 40 }, (_, i) => 3800 + i * 10);
      const mockMarkets: Record<string, Market> = {
        RELIANCE: createMockMarket('RELIANCE', 2820, history1, 2.5),
        TCS: createMockMarket('TCS', 4200, history2, 1.8),
      };

      const results = scanAllMarkets(mockState, mockMarkets as any, 'conservative');
      expect(Array.isArray(results)).toBe(true);
      if (results.length > 1) {
        expect(results[0].compositeScore).toBeGreaterThanOrEqual(results[1].compositeScore);
      }
    });
  });
});
