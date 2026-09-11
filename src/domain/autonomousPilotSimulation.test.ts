import { describe, it, expect } from 'vitest';
import {
  tickAutonomousPilot,
  applyDrawdownSizing,
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
  describe('Drawdown Sizing Guard', () => {
    it('reduces caution-tier entries and rejects fractional-share residuals', () => {
      expect(applyDrawdownSizing(20, 0.5)).toBe(10);
      expect(applyDrawdownSizing(1, 0.5)).toBe(0);
      expect(applyDrawdownSizing(20, 1)).toBe(20);
      expect(applyDrawdownSizing(20, 0)).toBe(0);
    });
  });

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
      expect(res.newActionLogs.some((l) => l.action === 'BUY_ENTRY')).toBe(false);
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
      expect(res.newActionLogs.some((l) => l.action === 'BUY_ENTRY')).toBe(false);
    });
  });

  describe('2. Economic Mass Guard (₹10,000 Portfolio)', () => {
    it('stands aside when a small portfolio cannot clear the ₹120 net-profit floor', () => {
      const state = create10kState('balanced');

      // TATAMOTORS at ₹950 (oversold dip)
      const history = Array.from({ length: 40 }, (_, i) => 1050 - i * 2.5);
      const markets: any = {
        TATAMOTORS: createMockMarket('TATAMOTORS', 950, history),
      };

      const res = tickAutonomousPilot(state, markets, regularMarketTime);
      expect(res.ordersToDispatch).toHaveLength(0);
    });
  });

  describe('3. Indian Equities Microstructure Invariants (NSE Tick Size & Integer Shares)', () => {
    it('does not bypass the net-profit floor to place an integer-share order', () => {
      const state = create10kState('balanced');
      const history = Array.from({ length: 40 }, (_, i) => 550 - i * 1.5);
      const markets: any = {
        ITC: createMockMarket('ITC', 490, history),
      };

      const res = tickAutonomousPilot(state, markets, regularMarketTime);
      expect(res.ordersToDispatch).toHaveLength(0);
    });

    it('keeps the portfolio in cash when tick-aligned sizing cannot meet the floor', () => {
      const state = create10kState('balanced');
      const history = Array.from({ length: 40 }, (_, i) => 550 - i * 1.5);
      const markets: any = {
        ITC: createMockMarket('ITC', 491.23, history),
      };

      const res = tickAutonomousPilot(state, markets, regularMarketTime);
      expect(res.ordersToDispatch).toHaveLength(0);
    });
  });

  describe('4. Trailing Stop Ratchet & Unified Exit (Zero-Risk Invariant)', () => {
    it('ratchets stop-loss above entry price and closes a small position with one exit order', () => {
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
      expect(fleet.state).toBe('COOLDOWN');

      // Small notionals exit in one order instead of creating multiple brokerage events.
      expect(res.ordersToDispatch).toHaveLength(1);
      const sellOrder = res.ordersToDispatch[0];
      expect(sellOrder.side).toBe('sell');
      expect(sellOrder.amount).toBe(2);
      expect(sellOrder.trancheStage).toBe(3);
      expect(res.newActionLogs.some((l) => l.action === 'TAKE_PROFIT')).toBe(true);
    });

    it('uses the unified exit route when a small position reaches its profit target', () => {
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
      expect(sellOrder.trancheStage).toBe(3);
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

    it('does not duplicate an exit while an autonomous sell is still pending at the broker', () => {
      const state = create10kState('balanced');
      state.positions.RELIANCE = 5;
      state.avgBuyPrice.RELIANCE = 100;
      state.orders = [
        {
          id: 'pending_autonomous_exit',
          asset: 'RELIANCE',
          side: 'sell',
          amount: 5,
          filled: 0,
          price: 95,
          status: 'pending',
          type: 'market',
          timestamp: regularMarketTime - 10_000,
          auto: true,
        },
      ] as any;
      state.autonomousPilot!.activeFleet.RELIANCE = {
        ...state.autonomousPilot!.activeFleet.RELIANCE,
        asset: 'RELIANCE',
        state: 'IN_POSITION',
        entryPrice: 100,
        stopLossPrice: 98,
        unitsHeld: 5,
      };

      const history = Array.from({ length: 40 }, () => 100);
      const result = tickAutonomousPilot(
        state,
        { RELIANCE: createMockMarket('RELIANCE', 95, history) } as any,
        regularMarketTime
      );

      expect(result.ordersToDispatch.filter((order) => order.asset === 'RELIANCE' && order.side === 'sell')).toHaveLength(0);
      expect(result.updatedFleet.RELIANCE.state).toBe('ORDER_PENDING');
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

      // TATAMOTORS remains the top candidate, but the ₹10k account stays in cash.
      expect(res.ordersToDispatch).toHaveLength(0);
      expect(res.updatedFleet.TATAMOTORS.alphaRank).toBe(1);
      expect(res.updatedFleet.TATAMOTORS.alphaConvictionIndex).toBeGreaterThan(40);
    });
  });

  describe('8. Stepped Breakeven Defense (Zero-Risk Trailing Guarantee)', () => {
    it('ratchets stop-loss to entry price + lock (+0.35 ATR) once gain reaches +1.0 ATR on 1-share holdings', () => {
      const entryPrice = 950.00;
      const initialStop = 910.00;
      const atr = 20.00;

      // Price gains +1.0 ATR (970.00)
      const ratchet = calculateDynamicProfitRatchet(entryPrice, 970.00, atr, initialStop, 0.05);

      expect(ratchet.isRatcheted).toBe(true);
      expect(ratchet.stageName).toBe('STEPPED_BREAKEVEN');
      expect(ratchet.ratchetedStopPrice).toBe(957.00); // Entry + 0.35 ATR (950 + 7 = 957)
    });

    it('locks in banked profit (+0.75 ATR) once gain reaches +1.5 ATR', () => {
      const entryPrice = 950.00;
      const initialStop = 910.00;
      const atr = 20.00;

      // Price gains +1.6 ATR (982.00)
      const ratchet = calculateDynamicProfitRatchet(entryPrice, 982.00, atr, initialStop, 0.05);

      expect(ratchet.isRatcheted).toBe(true);
      expect(ratchet.stageName).toBe('LOCKED_PROFIT_T1');
      expect(ratchet.ratchetedStopPrice).toBe(965.00); // 950 + 20 * 0.75 = 965 (profitable stop)
    });

    it('locks in core profit (+1.35 ATR) once gain reaches +2.2 ATR', () => {
      const entryPrice = 950.00;
      const initialStop = 910.00;
      const atr = 20.00;

      // Price gains +2.3 ATR (996.00)
      const ratchet = calculateDynamicProfitRatchet(entryPrice, 996.00, atr, initialStop, 0.05);

      expect(ratchet.isRatcheted).toBe(true);
      expect(ratchet.stageName).toBe('CORE_TARGET_T2');
      expect(ratchet.ratchetedStopPrice).toBe(977.00); // 950 + 20 * 1.35 = 977
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
    it('anchors limit orders to pullback support near VWAP rather than chasing candle highs when price > vwap', () => {
      const currentPrice = 950.00;
      const vwap = 942.00;
      const atr = 20.00;

      const limitPrice = calculateSmartLimitPrice(currentPrice, vwap, atr, 0.05);

      // Should be slightly discounted below LTP, aligned to tick size
      expect(limitPrice).toBeLessThan(currentPrice);
      expect(limitPrice).toBeGreaterThanOrEqual(vwap);
      expect(Math.round(limitPrice * 100) % 5).toBe(0);
    });

    it('prevents inverted limit pricing when currentPrice <= vwap (oversold/discount)', () => {
      const currentPrice = 940.00;
      const vwap = 955.00; // VWAP is higher than market price!
      const atr = 18.00;

      const limitPrice = calculateSmartLimitPrice(currentPrice, vwap, atr, 0.05);

      // Limit price must strictly be <= currentPrice, NEVER bumped up to VWAP
      expect(limitPrice).toBeLessThanOrEqual(currentPrice);
      expect(limitPrice).toBeLessThan(vwap);
      expect(Math.round(limitPrice * 100) % 5).toBe(0);

      // Verify that calculating stop-loss from this limit price never creates an inverted stop loss above market price
      const stopDistance = atr * 1.5;
      const stopLossPrice = alignToTickSize(limitPrice - stopDistance, 'INFY');
      expect(stopLossPrice).toBeLessThan(limitPrice);
      expect(stopLossPrice).toBeLessThan(currentPrice);
    });

    it('handles currentPrice == vwap gracefully without exceeding market price', () => {
      const currentPrice = 1000.00;
      const vwap = 1000.00;
      const atr = 15.00;

      const limitPrice = calculateSmartLimitPrice(currentPrice, vwap, atr, 0.05);

      expect(limitPrice).toBeLessThan(currentPrice);
      expect(Math.round(limitPrice * 100) % 5).toBe(0);
    });

    it('strictly aligns to custom tick sizes (e.g., 0.01 or 0.05)', () => {
      const p1 = calculateSmartLimitPrice(1234.56, 1230.00, 10.00, 0.05);
      expect(Math.round(p1 * 100) % 5).toBe(0);

      const p2 = calculateSmartLimitPrice(1234.56, 1230.00, 10.00, 0.01);
      expect(Math.round(p2 * 100) % 1).toBe(0);
    });

    it('calculates tighter adaptive pullback for high-conviction momentum expansion (alphaConviction >= 80)', () => {
      const currentPrice = 1000.00;
      const vwap = 980.00;
      const atr = 25.00;

      // High conviction (e.g. 85): bids close to LTP (within 0.08% or 1-2 ticks) to ensure execution on breakouts
      const highConvictionLimit = calculateSmartLimitPrice(currentPrice, vwap, atr, 0.05, 85);
      // Moderate conviction (e.g. 60): demands deeper discount towards VWAP
      const moderateConvictionLimit = calculateSmartLimitPrice(currentPrice, vwap, atr, 0.05, 60);

      expect(highConvictionLimit).toBeGreaterThan(moderateConvictionLimit);
      expect(highConvictionLimit).toBeLessThanOrEqual(currentPrice);
      expect(highConvictionLimit).toBeGreaterThanOrEqual(currentPrice * 0.999);
      expect(Math.round(highConvictionLimit * 100) % 5).toBe(0);
    });
  });

  describe('11. Stale Limit Order Sweeper & Capital Velocity Protection', () => {
    it('sweeps and queues cancellation for auto buy orders older than 20 minutes with > 1.2% price drift', () => {
      const state = create10kState('balanced');
      const orderTs = regularMarketTime - 25 * 60 * 1000; // 25 minutes ago
      state.orders = [
        {
          id: 'ord_stale_rel_1',
          ts: orderTs,
          side: 'buy',
          type: 'limit',
          asset: 'RELIANCE',
          amount: 2,
          price: 2400.00,
          limitPrice: 2400.00,
          fee: 5,
          notional: 4800,
          auto: true,
          strategyName: 'Kalman Mean Reversion',
          status: 'pending',
        },
      ];

      // RELIANCE has drifted up to ₹2,440 (+1.67% drift above ₹2,400 limit price)
      const relianceHistory = Array.from({ length: 30 }, (_, i) => 2400 + i * 1.5);
      const markets: any = {
        RELIANCE: createMockMarket('RELIANCE', 2440.00, relianceHistory),
      };

      const res = tickAutonomousPilot(state, markets, regularMarketTime);

      expect(res.ordersToCancel).toContain('ord_stale_rel_1');
      const cancelLog = res.newActionLogs.find(
        (l) => l.action === 'STALE_ORDER_CANCELLED' && l.asset === 'RELIANCE'
      );
      expect(cancelLog).toBeDefined();
      expect(cancelLog?.detail).toContain('timed out after 25m');
      expect(cancelLog?.detail).toContain('Unlocking capital');
    });

    it('retains recent orders (< 20m) or orders near limit price (< 1.2% drift)', () => {
      const state = create10kState('balanced');
      const recentOrderTs = regularMarketTime - 5 * 60 * 1000; // 5 minutes ago
      const staleOrderNearPriceTs = regularMarketTime - 30 * 60 * 1000; // 30 minutes ago, but price only drifted +0.4%

      state.orders = [
        {
          id: 'ord_recent_infy',
          ts: recentOrderTs,
          side: 'buy',
          type: 'limit',
          asset: 'INFY',
          amount: 3,
          price: 1500.00,
          limitPrice: 1500.00,
          fee: 3,
          notional: 4500,
          auto: true,
          strategyName: 'VWAP Momentum',
          status: 'pending',
        },
        {
          id: 'ord_stale_near_tcs',
          ts: staleOrderNearPriceTs,
          side: 'buy',
          type: 'limit',
          asset: 'TCS',
          amount: 1,
          price: 3500.00,
          limitPrice: 3500.00,
          fee: 3,
          notional: 3500,
          auto: true,
          strategyName: 'Hurst Squeeze Expansion',
          status: 'pending',
        },
      ];

      const markets: any = {
        INFY: createMockMarket('INFY', 1530.00, Array.from({ length: 30 }, (_, i) => 1500 + i)), // Drift +2% but only 5m old
        TCS: createMockMarket('TCS', 3510.00, Array.from({ length: 30 }, (_, i) => 3500 + i * 0.3)), // 30m old but only +0.28% drift
      };

      const res = tickAutonomousPilot(state, markets, regularMarketTime);

      expect(res.ordersToCancel).not.toContain('ord_recent_infy');
      expect(res.ordersToCancel).not.toContain('ord_stale_near_tcs');
      expect(res.ordersToCancel).toHaveLength(0);
    });

    it('sweeps partially_filled orders when stale and runaway', () => {
      const state = create10kState('balanced');
      const orderTs = regularMarketTime - 22 * 60 * 1000; // 22 minutes ago
      state.orders = [
        {
          id: 'ord_partially_filled_1',
          ts: orderTs,
          side: 'buy',
          type: 'limit',
          asset: 'HDFCBANK',
          amount: 5,
          executedAmount: 2,
          price: 1600.00,
          limitPrice: 1600.00,
          fee: 5,
          notional: 8000,
          auto: true,
          strategyName: 'Ornstein-Uhlenbeck Reversion',
          status: 'partially_filled',
        },
      ];

      // HDFCBANK surged to ₹1,630 (+1.875% drift)
      const hdfcHistory = Array.from({ length: 30 }, (_, i) => 1600 + i);
      const markets: any = {
        HDFCBANK: createMockMarket('HDFCBANK', 1630.00, hdfcHistory),
      };

      const res = tickAutonomousPilot(state, markets, regularMarketTime);

      expect(res.ordersToCancel).toContain('ord_partially_filled_1');
    });

    it('blocks a synthetic market snapshot from creating a new live entry', () => {
      const state = create10kState('balanced');
      const history = Array.from({ length: 40 }, (_, index) => 2450 + index * 2);
      const reliance = createMockMarket('RELIANCE', 2530, history);
      reliance.isSynthetic = true;

      const res = tickAutonomousPilot(state, { RELIANCE: reliance } as any, regularMarketTime);

      expect(res.ordersToDispatch).toHaveLength(0);
      expect(res.newActionLogs.some((log) => log.strategy === 'Live Market Data Quality Gate')).toBe(true);
    });

    it('freezes new entries after a flash-range candle', () => {
      const state = create10kState('balanced');
      const history = Array.from({ length: 40 }, (_, index) => 2450 + index * 2);
      const reliance = createMockMarket('RELIANCE', 2530, history);
      const lastCandle = reliance.candles[reliance.candles.length - 1];
      lastCandle.high = reliance.price + 250;
      lastCandle.low = reliance.price - 250;

      const res = tickAutonomousPilot(state, { RELIANCE: reliance } as any, regularMarketTime);

      expect(res.ordersToDispatch).toHaveLength(0);
      expect(res.newActionLogs.some((log) => log.action === 'VOLATILITY_SHOCK' && log.status === 'BLOCKED')).toBe(true);
    });

    it('allows a protective exit even when the incoming market snapshot is synthetic', () => {
      const state = create10kState('balanced');
      const entryPrice = 2530;
      state.positions = { RELIANCE: 2 } as any;
      state.avgBuyPrice = { RELIANCE: entryPrice } as any;
      state.autonomousPilot!.activeFleet = {
        RELIANCE: {
          asset: 'RELIANCE',
          assignedStrategy: 'Titan Alpha Sentinel',
          regimeLabel: 'Risk Defense',
          hurst: 0.5,
          currentPrice: entryPrice,
          state: 'IN_POSITION',
          entryPrice,
          stopLossPrice: 2500,
          takeProfitPrice: 2580,
          unitsHeld: 2,
          trancheStage: 0,
        },
      };
      const history = Array.from({ length: 40 }, (_, index) => 2550 - index * 2);
      const reliance = createMockMarket('RELIANCE', 2480, history);
      reliance.isSynthetic = true;

      const res = tickAutonomousPilot(state, { RELIANCE: reliance } as any, regularMarketTime);

      expect(res.ordersToDispatch).toHaveLength(1);
      expect(res.ordersToDispatch[0].side).toBe('sell');
      expect(res.newActionLogs.some((log) => log.action === 'STOP_LOSS')).toBe(true);
    });
  });
});
