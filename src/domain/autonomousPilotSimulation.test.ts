import { describe, it, expect } from 'vitest';
import {
  tickAutonomousPilot,
  initializeFleetStatus,
  UPSTOX_FLEET_ASSETS,
} from './autonomousPilotEngine';
import {
  createDefaultAutonomousPilotState,
  alignToTickSize,
  PILOT_PROFILES,
} from './autonomousPilot';
import {
  evaluateSessionTimingQuality,
  calculateDynamicProfitRatchet,
  calculateCrossSectionalAlphaRanking,
  calculateSmartLimitPrice,
} from './quantEngine';
import { AppState, Asset, Market } from '../types';
import { portfolioValue } from './portfolio';

describe('Autonomous Quant Pilot - ₹10,000 Upstox Realistic Simulation Test Suite', () => {
  // Helper to create a ₹10,000 Upstox state
  const create10kState = (profile: 'conservative' | 'balanced' | 'momentum' = 'balanced'): AppState => {
    const initialCash = 10000.00;
    return {
      schemaVersion: 1,
      cash: initialCash,
      initialCash,
      startingEquity: initialCash,
      realizedPnl: 0,
      totalFees: 0,
      positions: {} as any,
      avgBuyPrice: {} as any,
      watchlist: [...UPSTOX_FLEET_ASSETS],
      orders: [],
      alerts: [],
      strategies: [],
      accountMode: 'upstox',
      upstoxAccount: {
        connected: true,
        environment: 'production',
        accountId: '87BSJ2',
        accountName: 'Rajasree Saha',
        canTrade: true,
        lastSyncAt: Date.now(),
        funds: {
          currency: 'INR',
          availableCash: initialCash,
          usedMargin: 0,
          totalEquity: initialCash,
        },
        holdings: [],
        positions: [],
      },
      autonomousPilot: {
        ...createDefaultAutonomousPilotState(initialCash),
        enabled: true,
        executionMode: 'full_autonomous',
        profile,
        dailyStartingValue: initialCash,
        activeFleet: initializeFleetStatus(),
      },
      settings: {
        geminiApiKey: '',
        geminiModel: 'gemini-3.1-pro-preview',
        soundEnabled: false,
        theme: 'glass',
        maxSlippageBps: 20,
        enableWebSocket: false,
      },
      notifications: [],
      timeframe: '1D',
      selectedAsset: 'RELIANCE',
    };
  };

  const createMockMarket = (asset: Asset, price: number, history: number[]): Market => ({
    asset,
    name: asset,
    symbol: asset,
    price: alignToTickSize(price, asset),
    change24h: 1.5,
    high24h: alignToTickSize(price * 1.015, asset),
    low24h: alignToTickSize(price * 0.985, asset),
    volume24h: 1500000,
    history,
    candles: history.map((p, i) => ({
      time: Date.now() - (history.length - i) * 86400000,
      open: p * 0.998,
      high: p * 1.006,
      low: p * 0.994,
      close: p,
      volume: 50000,
    })),
    lastUpdated: Date.now(),
    source: 'Upstox Live Feed',
    isSynthetic: false,
  });

  // Weekday 11:30 IST timestamp
  const regularMarketTime = new Date('2026-09-07T06:00:00Z').getTime();

  describe('1. Capital Budget & Cash Reserve Floor Invariants (₹10,000 Capital)', () => {
    it('enforces 45% liquid cash reserve floor in Balanced profile (₹4,500 reserve / ₹5,500 allocatable)', () => {
      const state = create10kState('balanced');
      const profile = PILOT_PROFILES['balanced'];
      expect(profile.targetCashBufferPct).toBe(45);

      // Oversold value dip on RELIANCE (price: ₹2,600)
      const relianceHistory = Array.from({ length: 40 }, (_, i) => 3000 - i * 10);
      const markets: any = {
        RELIANCE: createMockMarket('RELIANCE', 2600, relianceHistory),
      };

      // If available cash is reduced to ₹5,000 (meaning allocatable cash = 5000 - 4500 = 500)
      // Buying 1 share of RELIANCE (₹2,600) would violate the ₹4,500 floor
      state.cash = 5000;
      if (state.upstoxAccount?.funds) {
        state.upstoxAccount.funds.availableCash = 5000;
        state.upstoxAccount.funds.totalEquity = 10000;
      }

      const res = tickAutonomousPilot(state, markets, regularMarketTime);
      expect(res.ordersToDispatch).toHaveLength(0);
      expect(res.newActionLogs.some((l) => l.action === 'SKIPPED' && l.detail.includes('liquid cash buffer'))).toBe(true);
    });

    it('enforces 70% liquid cash reserve floor in Conservative profile (₹7,000 reserve / ₹3,000 allocatable)', () => {
      const state = create10kState('conservative');
      const profile = PILOT_PROFILES['conservative'];
      expect(profile.targetCashBufferPct).toBe(70);

      // Oversold dip on TCS (price: ₹3,800)
      const tcsHistory = Array.from({ length: 40 }, (_, i) => 4200 - i * 10);
      const markets: any = {
        TCS: createMockMarket('TCS', 3800, tcsHistory),
      };

      // With full ₹10,000 cash, allocatable cash = 10,000 - 7,000 = ₹3,000
      // 1 share of TCS (₹3,800) exceeds ₹3,000 allocatable cash
      const res = tickAutonomousPilot(state, markets, regularMarketTime);
      expect(res.ordersToDispatch).toHaveLength(0);
      expect(res.newActionLogs.some((l) => l.action === 'SKIPPED' && l.detail.includes('liquid cash buffer'))).toBe(true);
    });
  });

  describe('2. Single-Asset Exposure Cap (Max 25% of Portfolio Equity = ₹2,500)', () => {
    it('strictly caps individual stock position size at 25% of ₹10,000 (max ₹2,500)', () => {
      const state = create10kState('balanced');

      // TATAMOTORS at ₹950 (oversold dip)
      const history = Array.from({ length: 40 }, (_, i) => 1050 - i * 2.5);
      const markets: any = {
        TATAMOTORS: createMockMarket('TATAMOTORS', 950, history),
      };

      const res = tickAutonomousPilot(state, markets, regularMarketTime);
      expect(res.ordersToDispatch.length).toBeGreaterThan(0);
      const buyOrder = res.ordersToDispatch[0];

      // Total proposed notional MUST NOT exceed 25% of equity (₹2,500)
      const notional = buyOrder.amount * buyOrder.price;
      expect(notional).toBeLessThanOrEqual(2500);
      // Math.floor(2500 / 950) = 2 shares maximum
      expect(buyOrder.amount).toBeLessThanOrEqual(2);
    });
  });

  describe('3. Indian Equities Microstructure Invariants (NSE Tick Size & Integer Shares)', () => {
    it('dispatches only integer share quantities (strictly whole shares)', () => {
      const state = create10kState('balanced');
      const history = Array.from({ length: 40 }, (_, i) => 550 - i * 1.5);
      const markets: any = {
        ITC: createMockMarket('ITC', 490, history),
      };

      const res = tickAutonomousPilot(state, markets, regularMarketTime);
      expect(res.ordersToDispatch.length).toBeGreaterThan(0);
      for (const order of res.ordersToDispatch) {
        expect(Number.isInteger(order.amount)).toBe(true);
        expect(order.amount).toBeGreaterThanOrEqual(1);
      }
    });

    it('aligns all prices, stop-loss, and profit targets strictly to ₹0.05 NSE tick size', () => {
      const state = create10kState('balanced');
      const history = Array.from({ length: 40 }, (_, i) => 550 - i * 1.5);
      const markets: any = {
        ITC: createMockMarket('ITC', 491.23, history),
      };

      const res = tickAutonomousPilot(state, markets, regularMarketTime);
      expect(res.ordersToDispatch.length).toBeGreaterThan(0);
      const order = res.ordersToDispatch[0];

      const isTickAligned = (p?: number) => {
        if (p === undefined) return true;
        const cents = Math.round(p * 100);
        return cents % 5 === 0;
      };

      expect(isTickAligned(order.price)).toBe(true);
      expect(isTickAligned(order.stopLoss)).toBe(true);
      expect(isTickAligned(order.takeProfit)).toBe(true);
      expect(isTickAligned(order.takeProfit2)).toBe(true);
    });
  });

  describe('4. Trailing Stop Ratchet & Multi-Tranche Harvest (Zero-Risk Invariant)', () => {
    it('ratchets stop-loss above entry price when in profit >= 1.5 ATR and triggers Tranche 1 harvest on 2+ shares', () => {
      const entryPrice = 960.00;
      const currentPrice = 995.00; // +35 rupees gain (> 1.5 * ATR ~15)
      const state = create10kState('balanced');

      state.positions = { TATAMOTORS: 2 } as any;
      state.avgBuyPrice = { TATAMOTORS: entryPrice } as any;
      state.cash = 8080.00;
      if (state.upstoxAccount?.funds) {
        state.upstoxAccount.funds.availableCash = 8080.00;
        state.upstoxAccount.funds.totalEquity = 10070.00;
      }

      state.autonomousPilot!.activeFleet = {
        TATAMOTORS: {
          asset: 'TATAMOTORS',
          assignedStrategy: 'Hurst Trend Rider',
          regimeLabel: 'Trending',
          hurst: 0.65,
          currentPrice: entryPrice,
          state: 'IN_POSITION',
          entryPrice,
          stopLossPrice: 935.00,
          takeProfitPrice: 1015.00,
          takeProfit2Price: 1035.00,
          unitsHeld: 2,
          trancheStage: 0,
        },
      };

      const history = Array.from({ length: 40 }, (_, i) => 940 + i * 1.4);
      const markets: any = {
        TATAMOTORS: createMockMarket('TATAMOTORS', currentPrice, history),
      };

      const res = tickAutonomousPilot(state, markets, regularMarketTime);

      // Trailing stop MUST ratchet above entry price (guaranteeing locked-in zero capital loss)
      const fleet = res.updatedFleet['TATAMOTORS'];
      expect(fleet.stopLossPrice).toBeGreaterThan(entryPrice);
      expect(fleet.state).toBe('TRAILING_PROFIT');

      // Tranche 1 harvest should trigger to sell 1 share (33% of 2 shares = 1 share)
      expect(res.ordersToDispatch).toHaveLength(1);
      const sellOrder = res.ordersToDispatch[0];
      expect(sellOrder.side).toBe('sell');
      expect(sellOrder.amount).toBe(1);
      expect(sellOrder.trancheStage).toBe(1);
      expect(res.newActionLogs.some((l) => l.action === 'PROFIT_HARVEST_T1')).toBe(true);
    });

    it('harvests Core Target T2 when price reaches takeProfit2 and trails stop to T1', () => {
      const entryPrice = 960.00;
      const target2Price = 1015.00;
      const currentPrice = 1020.00; // Reached Core Target T2
      const state = create10kState('balanced');

      state.positions = { TATAMOTORS: 1 } as any;
      state.avgBuyPrice = { TATAMOTORS: entryPrice } as any;

      state.autonomousPilot!.activeFleet = {
        TATAMOTORS: {
          asset: 'TATAMOTORS',
          assignedStrategy: 'Hurst Trend Rider',
          regimeLabel: 'Trending',
          hurst: 0.65,
          currentPrice: entryPrice,
          state: 'TRAILING_PROFIT',
          entryPrice,
          stopLossPrice: 975.00,
          takeProfitPrice: target2Price,
          takeProfit2Price: target2Price,
          unitsHeld: 1,
          trancheStage: 1,
        },
      };

      const history = Array.from({ length: 40 }, (_, i) => 950 + i * 1.8);
      const markets: any = {
        TATAMOTORS: createMockMarket('TATAMOTORS', currentPrice, history),
      };

      const res = tickAutonomousPilot(state, markets, regularMarketTime);
      expect(res.ordersToDispatch).toHaveLength(1);
      const sellOrder = res.ordersToDispatch[0];
      expect(sellOrder.side).toBe('sell');
      expect(sellOrder.amount).toBe(1);
      expect(sellOrder.trancheStage).toBe(2);
      expect(res.newActionLogs.some((l) => l.action === 'TAKE_PROFIT')).toBe(true);
    });
  });

  describe('5. Capital Defense Stop-Loss Execution', () => {
    it('executes immediate market exit when price drops below stop-loss price', () => {
      const entryPrice = 815.00;
      const stopPrice = 801.00;
      const currentPrice = 798.00; // Gap down below stop
      const state = create10kState('balanced');

      state.positions = { SBIN: 2 } as any;
      state.avgBuyPrice = { SBIN: entryPrice } as any;

      state.autonomousPilot!.activeFleet = {
        SBIN: {
          asset: 'SBIN',
          assignedStrategy: 'Hurst Trend Rider',
          regimeLabel: 'Trending',
          hurst: 0.60,
          currentPrice: entryPrice,
          state: 'IN_POSITION',
          entryPrice,
          stopLossPrice: stopPrice,
          takeProfitPrice: 845.00,
          unitsHeld: 2,
          trancheStage: 0,
        },
      };

      const history = Array.from({ length: 40 }, (_, i) => 830 - i * 0.8);
      const markets: any = {
        SBIN: createMockMarket('SBIN', currentPrice, history),
      };

      const res = tickAutonomousPilot(state, markets, regularMarketTime);
      expect(res.ordersToDispatch).toHaveLength(1);
      const exitOrder = res.ordersToDispatch[0];
      expect(exitOrder.side).toBe('sell');
      expect(exitOrder.amount).toBe(2);
      expect(exitOrder.type).toBe('market');
      expect(res.newActionLogs.some((l) => l.action === 'STOP_LOSS')).toBe(true);
    });
  });

  describe('6. Capital Guardian Circuit Breaker Protection', () => {
    it('trips immediately and halts all orders when daily drawdown reaches threshold (2.0% in Balanced)', () => {
      const state = create10kState('balanced');
      state.startingEquity = 10000.00;
      state.autonomousPilot!.dailyStartingValue = 10000.00;

      // Simulate a sudden portfolio drop to ₹9,780 (2.2% drawdown > 2.0% limit)
      state.cash = 9780.00;
      if (state.upstoxAccount?.funds) {
        state.upstoxAccount.funds.availableCash = 9780.00;
        state.upstoxAccount.funds.totalEquity = 9780.00;
      }

      const history = Array.from({ length: 40 }, (_, i) => 550 - i * 1.5);
      const markets: any = {
        ITC: createMockMarket('ITC', 485, history),
      };

      const res = tickAutonomousPilot(state, markets, regularMarketTime);
      expect(res.circuitBreakerTripped).toBe(true);
      expect(res.ordersToDispatch).toHaveLength(0);
      expect(res.tripReason).toContain('Circuit Breaker Tripped');
      expect(res.newActionLogs.some((l) => l.action === 'THROTTLED' && l.strategy.includes('Circuit Breaker'))).toBe(true);
    });
  });

  describe('7. Cross-Sectional Alpha Ranking Prioritization (Best-of-Breed Allocation)', () => {
    it('prioritizes higher Alpha Conviction Index (ACI) asset over lower ACI asset when capital is limited', () => {
      const state = create10kState('balanced');
      // Set cash so only 1 order can be funded (allocatable cash = 6000 - 4500 = 1500)
      state.cash = 6000.00;
      if (state.upstoxAccount?.funds) {
        state.upstoxAccount.funds.availableCash = 6000.00;
        state.upstoxAccount.funds.totalEquity = 10000.00;
      }

      // Candidate 1: TATAMOTORS at ₹950 (oversold value dip with institutional volume surge)
      const tataHistory = Array.from({ length: 40 }, (_, i) => 1050 - i * 2.5);
      const tataMarket = createMockMarket('TATAMOTORS', 950, tataHistory);
      tataMarket.candles[tataMarket.candles.length - 1].volume = 150000; // Strong volume surge

      // Candidate 2: SBIN at ₹820 (flat volume, lower conviction)
      const sbinHistory = Array.from({ length: 40 }, (_, i) => 900 - i * 2.0);
      const sbinMarket = createMockMarket('SBIN', 820, sbinHistory);

      const markets: any = {
        TATAMOTORS: tataMarket,
        SBIN: sbinMarket,
      };

      // 10:30 IST morning window
      const morningWindowTime = new Date('2026-09-07T05:00:00Z').getTime();
      const res = tickAutonomousPilot(state, markets, morningWindowTime);

      // Verify that TATAMOTORS was ranked #1 and dispatched
      expect(res.ordersToDispatch.length).toBeGreaterThanOrEqual(1);
      expect(res.ordersToDispatch[0].asset).toBe('TATAMOTORS');
      expect(res.updatedFleet.TATAMOTORS.alphaRank).toBe(1);
      expect(res.updatedFleet.TATAMOTORS.alphaConvictionIndex).toBeGreaterThan(40);
    });
  });

  describe('8. Stepped Breakeven Defense (Zero-Risk Trailing Guarantee)', () => {
    it('ratchets stop-loss to entry price + tick (Breakeven) once gain reaches +0.8 to +1.0 ATR on 1-share holdings', () => {
      const entryPrice = 950.00;
      const initialStop = 910.00;
      const atr = 20.00;

      // Price gains +1.0 ATR (970.00)
      const ratchet = calculateDynamicProfitRatchet(entryPrice, 970.00, atr, initialStop, 0.05);

      expect(ratchet.isRatcheted).toBe(true);
      expect(ratchet.stageName).toBe('STEPPED_BREAKEVEN');
      expect(ratchet.ratchetedStopPrice).toBe(950.05); // Entry + 1 tick (guarantees zero capital loss)
    });

    it('locks in banked profit (+0.5 ATR) once gain reaches +1.5 ATR', () => {
      const entryPrice = 950.00;
      const initialStop = 910.00;
      const atr = 20.00;

      // Price gains +1.6 ATR (982.00)
      const ratchet = calculateDynamicProfitRatchet(entryPrice, 982.00, atr, initialStop, 0.05);

      expect(ratchet.isRatcheted).toBe(true);
      expect(ratchet.stageName).toBe('LOCKED_PROFIT_T1');
      expect(ratchet.ratchetedStopPrice).toBe(960.00); // 950 + 20 * 0.5 = 960 (profitable stop)
    });

    it('locks in core profit (+1.2 ATR) once gain reaches +2.2 ATR', () => {
      const entryPrice = 950.00;
      const initialStop = 910.00;
      const atr = 20.00;

      // Price gains +2.3 ATR (996.00)
      const ratchet = calculateDynamicProfitRatchet(entryPrice, 996.00, atr, initialStop, 0.05);

      expect(ratchet.isRatcheted).toBe(true);
      expect(ratchet.stageName).toBe('CORE_TARGET_T2');
      expect(ratchet.ratchetedStopPrice).toBe(974.00); // 950 + 20 * 1.2 = 974
    });
  });

  describe('9. NSE Session Timing & Intraday Whipsaw Filtration', () => {
    it('classifies opening 10-minute noise (09:20 IST) with +8 conviction threshold penalty', () => {
      // 2026-09-07 09:20 IST -> UTC 03:50
      const openNoiseTime = new Date('2026-09-07T03:50:00Z').getTime();
      const quality = evaluateSessionTimingQuality(openNoiseTime);

      expect(quality.phase).toBe('OPENING_VOLATILITY');
      expect(quality.allowsNewEntries).toBe(true);
      expect(quality.convictionThresholdDelta).toBe(8);
      expect(quality.minVolumeSurgeRequired).toBe(1.5);
    });

    it('classifies prime morning expansion (10:30 IST) with optimal conditions', () => {
      // 2026-09-07 10:30 IST -> UTC 05:00
      const morningTime = new Date('2026-09-07T05:00:00Z').getTime();
      const quality = evaluateSessionTimingQuality(morningTime);

      expect(quality.phase).toBe('MORNING_EXPANSION');
      expect(quality.allowsNewEntries).toBe(true);
      expect(quality.convictionThresholdDelta).toBe(0);
    });

    it('classifies midday lull (12:30 IST) with higher volume surge hurdle (1.35x)', () => {
      // 2026-09-07 12:30 IST -> UTC 07:00
      const middayTime = new Date('2026-09-07T07:00:00Z').getTime();
      const quality = evaluateSessionTimingQuality(middayTime);

      expect(quality.phase).toBe('MIDDAY_CONSOLIDATION');
      expect(quality.allowsNewEntries).toBe(true);
      expect(quality.convictionThresholdDelta).toBe(6);
      expect(quality.minVolumeSurgeRequired).toBe(1.35);
    });

    it('blocks new entries after 15:00 IST intraday cutoff', () => {
      // 2026-09-07 15:10 IST -> UTC 09:40
      const closingTime = new Date('2026-09-07T09:40:00Z').getTime();
      const quality = evaluateSessionTimingQuality(closingTime);

      expect(quality.phase).toBe('CLOSING_SQUAREOFF');
      expect(quality.allowsNewEntries).toBe(false);
    });

    it('blocks entries on weekends', () => {
      // 2026-09-06 is Sunday
      const weekendTime = new Date('2026-09-06T06:00:00Z').getTime();
      const quality = evaluateSessionTimingQuality(weekendTime);

      expect(quality.phase).toBe('POST_CLOSE');
      expect(quality.allowsNewEntries).toBe(false);
    });
  });

  describe('10. Smart Microstructure Limit Pullback Pricing', () => {
    it('anchors limit orders to pullback support near VWAP rather than chasing candle highs', () => {
      const currentPrice = 950.00;
      const vwap = 942.00;
      const atr = 20.00;

      const limitPrice = calculateSmartLimitPrice(currentPrice, vwap, atr, 0.05);

      // Should be slightly discounted below LTP, aligned to tick size
      expect(limitPrice).toBeLessThan(currentPrice);
      expect(limitPrice).toBeGreaterThanOrEqual(vwap);
      expect(Math.round(limitPrice * 100) % 5).toBe(0);
    });
  });
});

