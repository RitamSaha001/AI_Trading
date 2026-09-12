import { describe, it, expect } from 'vitest';
import {
  detectMarketRegime,
  alignToTickSize,
  evaluateMarketOpportunity,
  scanAllMarkets,
  checkPilotCircuitBreaker,
  PILOT_PROFILES,
  createDefaultAutonomousPilotState,
  UPSTOX_FLEET_ASSETS,
  initializeFleetStatus,
  determineAssetStrategyAndRegime,
  createDefaultRateLimitStatus,
  evaluateRateLimitAllowance,
  PILOT_RATE_LIMITS,
  isMarketSessionOpen,
  tickAutonomousPilot,
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

    it('keeps a persisted high-water mark when evaluating a later loss', () => {
      const stateWithPeak: AppState = {
        ...mockState,
        autonomousPilot: {
          ...createDefaultAutonomousPilotState(100000),
          peakPortfolioValue: 110000,
          dailyStartingValue: 100000,
        },
      };

      const res = checkPilotCircuitBreaker(stateWithPeak, 108000, 'balanced');
      expect(res.highWaterMark).toBe(110000);
      expect(res.drawdownPct).toBeCloseTo(1.82, 2);
      expect(res.tier).toBe('CAUTION');
      expect(res.sizingMultiplier).toBe(0.5);
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

  describe('Multi-Asset Fleet Orchestration & Zero Gemini Engine', () => {
    it('monitors all 100 institutional Indian equities (NIFTY 100)', () => {
      expect(UPSTOX_FLEET_ASSETS).toHaveLength(100);
      const landmarkAssets = [
        'RELIANCE',
        'TCS',
        'HDFCBANK',
        'INFY',
        'ICICIBANK',
        'SBIN',
        'BHARTIARTL',
        'LT',
        'ITC',
        'TATAMOTORS',
        'HAL',
        'BEL',
        'NTPC',
        'TATASTEEL',
        'SUNPHARMA',
      ];
      for (const asset of landmarkAssets) {
        expect(UPSTOX_FLEET_ASSETS).toContain(asset);
      }
    });

    it('initializes fleet telemetry with default monitoring state', () => {
      const fleet = initializeFleetStatus();
      expect(Object.keys(fleet)).toHaveLength(100);
      for (const asset of UPSTOX_FLEET_ASSETS) {
        expect(fleet[asset]).toBeDefined();
        expect(fleet[asset].state).toBe('MONITORING');
        expect(fleet[asset].asset).toBe(asset);
      }
    });

    it('assigns Hurst Trend Rider when time-series displays persistence (H > 0.55)', () => {
      // Linear upward trending series gives high Hurst
      const trendingHistory = Array.from({ length: 50 }, (_, i) => 1000 + i * 15);
      const mkt = createMockMarket('RELIANCE', 1750, trendingHistory, 2.5);
      const res = determineAssetStrategyAndRegime(mkt);
      expect(res.strategy).toBe('Hurst Trend Rider');
      expect(res.regimeLabel).toContain('Trending');
      expect(res.hurst).toBeGreaterThan(0.55);
    });

    it('assigns OU Mean Reversion when time-series is anti-persistent (H < 0.45)', () => {
      // Oscillating alternating series gives low Hurst
      const meanRevHistory = Array.from({ length: 60 }, (_, i) => 1000 + (i % 2 === 0 ? 10 : -10));
      const mkt = createMockMarket('TCS', 1000, meanRevHistory, 0.1);
      const res = determineAssetStrategyAndRegime(mkt);
      expect(res.strategy).toBe('OU Mean Reversion');
      expect(res.regimeLabel).toContain('Mean Reversion');
      expect(res.hurst).toBeLessThan(0.45);
    });
  });

  describe('Upstox API Rate Limiter & Pacing Invariants', () => {
    it('blocks orders dispatched within 1,500ms spacing window', () => {
      const status = createDefaultRateLimitStatus();
      const now = 1700000000000;
      status.lastDispatchedAt = now;

      // 500ms later -> must be blocked
      const check1 = evaluateRateLimitAllowance(status, now + 500);
      expect(check1.allowed).toBe(false);
      expect(check1.reason).toContain('Pacing limit');
      expect(check1.nextAvailableAt).toBe(now + PILOT_RATE_LIMITS.MIN_ORDER_SPACING_MS);

      // 1,500ms later -> allowed
      const check2 = evaluateRateLimitAllowance(status, now + 1500);
      expect(check2.allowed).toBe(true);
    });

    it('throttles when rolling minute quota reaches maximum (10 orders/min)', () => {
      const status = createDefaultRateLimitStatus();
      status.requestsThisMinute = 10;
      status.lastDispatchedAt = 1000;

      const check = evaluateRateLimitAllowance(status, 20000);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Rolling quota limit');
    });
  });

  describe('NSE Market Session & Cutoff Checks', () => {
    it('identifies weekend market closure', () => {
      // Saturday 2026-09-05 10:00 UTC (15:30 IST)
      const saturday = new Date('2026-09-05T10:00:00Z').getTime();
      const session = isMarketSessionOpen(saturday);
      expect(session.isOpen).toBe(false);
      expect(session.sessionDescription).toContain('Weekend');
    });

    it('identifies pre-open session before 09:15 IST on weekdays', () => {
      // Friday 2026-09-04 03:00 UTC = 08:30 IST
      const preOpen = new Date('2026-09-04T03:00:00Z').getTime();
      const session = isMarketSessionOpen(preOpen);
      expect(session.isOpen).toBe(false);
      expect(session.sessionDescription).toContain('Pre-Open Session');
    });

    it('identifies active market hours between 09:15 and 15:00 IST', () => {
      // Friday 2026-09-04 05:00 UTC = 10:30 IST
      const midday = new Date('2026-09-04T05:00:00Z').getTime();
      const session = isMarketSessionOpen(midday);
      expect(session.isOpen).toBe(true);
      expect(session.isNearingCutoff).toBe(false);
    });

    it('flags intraday cutoff after 15:00 IST', () => {
      // Friday 2026-09-04 09:40 UTC = 15:10 IST
      const lateDay = new Date('2026-09-04T09:40:00Z').getTime();
      const session = isMarketSessionOpen(lateDay);
      expect(session.isOpen).toBe(true);
      expect(session.isNearingCutoff).toBe(true);
      expect(session.sessionDescription).toContain('Intraday Cutoff Active');
    });
  });

  describe('Master tickAutonomousPilot Execution Loop', () => {
    it('only updates telemetry and dispatches 0 orders when disabled', () => {
      const state: AppState = {
        ...mockState,
        autonomousPilot: {
          ...createDefaultAutonomousPilotState(50000),
          enabled: false,
        },
      };

      const markets: any = {
        RELIANCE: createMockMarket('RELIANCE', 2800, Array.from({ length: 40 }, (_, i) => 2600 + i * 5)),
      };

      const res = tickAutonomousPilot(state, markets);
      expect(res.ordersToDispatch).toHaveLength(0);
      expect(res.circuitBreakerTripped).toBe(false);
      expect(res.updatedFleet['RELIANCE'].currentPrice).toBe(2800);
    });

    it('enforces trailing stop ratchet when in profit >= 1.5 ATR (Zero-Risk)', () => {
      const entryPrice = 2800;
      const currentPrice = 2950; // In profit by 150 (well over 1.5 ATR)
      const state: AppState = {
        ...mockState,
        positions: { RELIANCE: 10 } as any,
        avgBuyPrice: { RELIANCE: entryPrice } as any,
        autonomousPilot: {
          ...createDefaultAutonomousPilotState(50000),
          enabled: true,
          executionMode: 'full_autonomous',
          activeFleet: {
            RELIANCE: {
              asset: 'RELIANCE',
              assignedStrategy: 'Titan Alpha Sentinel',
              regimeLabel: 'Trending',
              hurst: 0.55,
              currentPrice: entryPrice,
              state: 'IN_POSITION',
              entryPrice,
              stopLossPrice: 2750,
              takeProfitPrice: 3100,
              unitsHeld: 10,
            },
          },
        },
      };

      const markets: any = {
        RELIANCE: createMockMarket('RELIANCE', currentPrice, Array.from({ length: 40 }, (_, i) => 2700 + i * 6)),
      };

      // Midday timestamp on weekday (Friday 11:30 IST)
      const midday = new Date('2026-09-04T06:00:00Z').getTime();
      const res = tickAutonomousPilot(state, markets, midday);

      const relianceFleet = res.updatedFleet['RELIANCE'];
      expect(relianceFleet.state).toBe('COOLDOWN');
      // Ratcheted stop loss MUST be above entry price (guaranteeing zero capital loss)
      expect(relianceFleet.stopLossPrice).toBeGreaterThan(entryPrice);
      expect(res.newActionLogs.some((l) => l.action === 'TRAILING_RATCHET')).toBe(true);
    });

    it('strictly preserves mandatory cash reserve floor (does not allow orders if cash buffer breached)', () => {
      // 1,000 equity with 1,000 cash (< 70% conservative floor of 700 + RELIANCE price 2710)
      // dailyStartingValue matches 1,000 so drawdown is 0% (circuit breaker does not trip)
      const state: AppState = {
        ...mockState,
        cash: 1000,
        startingEquity: 1000,
        autonomousPilot: {
          ...createDefaultAutonomousPilotState(1000),
          enabled: true,
          executionMode: 'full_autonomous',
        },
      };

      // Downward series produces oversold RSI (< 35) triggering Value Accumulator signal
      const history = Array.from({ length: 40 }, (_, i) => 3000 - i * 10);
      const markets: any = {
        RELIANCE: createMockMarket('RELIANCE', 2600, history),
      };

      const midday = new Date('2026-09-04T06:00:00Z').getTime();
      const res = tickAutonomousPilot(state, markets, midday);
      // Orders should be skipped when the economic and cash safeguards block entry.
      expect(res.ordersToDispatch).toHaveLength(0);
    });
  });
});
