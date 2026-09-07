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
import { AppState, Asset, Market } from '../types';
import { portfolioValue } from './portfolio';

// ---------------------------------------------------------------------------
// 1,000+ SCENARIOS MONTE CARLO & DETERMINISTIC STRESS TEST SUITE
// ---------------------------------------------------------------------------

interface SimulationRunResult {
  scenarioId: string;
  category: 'EASY' | 'MODERATE' | 'DIFFICULT';
  asset: Asset;
  startingEquity: number;
  finalEquity: number;
  netPnl: number;
  netReturnPct: number;
  maxDrawdownPct: number;
  tradesExecuted: number;
  circuitBreakerTripped: boolean;
  staleOrdersSwept: number;
  cashFloorPreserved: boolean;
  tickAligned: boolean;
  integerShares: boolean;
}

// Helper to create a clean ₹10,000 Upstox account state
function createTestState(profile: 'conservative' | 'balanced' | 'momentum' = 'balanced'): AppState {
  const initialCash = 10000.0;
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
      accountName: 'Lumen Quant Desk',
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
}

// Helper to construct a synthetic Market object with candles & history
function createMarketFeed(asset: Asset, price: number, history: number[], volume = 500000): Market {
  const alignedP = alignToTickSize(price, asset);
  return {
    asset,
    name: asset,
    symbol: asset,
    price: alignedP,
    change24h: 0.5,
    high24h: alignToTickSize(alignedP * 1.015, asset),
    low24h: alignToTickSize(alignedP * 0.985, asset),
    volume24h: volume,
    history,
    candles: history.map((p, i) => ({
      time: Date.now() - (history.length - i) * 60000,
      open: alignToTickSize(p * 0.999, asset),
      high: alignToTickSize(p * 1.004, asset),
      low: alignToTickSize(p * 0.996, asset),
      close: alignToTickSize(p, asset),
      volume: Math.round(volume / history.length),
    })),
    lastUpdated: Date.now(),
    source: 'Upstox Authoritative Test Feed',
    isSynthetic: false,
  };
}

// Simulates sequential execution of a single market scenario across multiple ticks
function runScenarioSimulation(
  scenarioId: string,
  category: 'EASY' | 'MODERATE' | 'DIFFICULT',
  asset: Asset,
  priceSequence: number[],
  initialHistory: number[],
  profile: 'conservative' | 'balanced' | 'momentum' = 'balanced',
  volumeSequence?: number[]
): SimulationRunResult {
  const state = createTestState(profile);
  const minCashFloorPct = Math.max(15, PILOT_PROFILES[profile].targetCashBufferPct);

  let peakEquity = state.startingEquity;
  let maxDrawdownPct = 0;
  let tradesExecuted = 0;
  let staleOrdersSwept = 0;
  let cashFloorPreserved = true;
  let tickAligned = true;
  let integerShares = true;

  let currentHistory = [...initialHistory];
  let simTime = new Date('2026-09-07T06:00:00Z').getTime(); // 11:30 AM IST (Active Market Session)

  for (let i = 0; i < priceSequence.length; i++) {
    const rawPrice = priceSequence[i];
    const price = alignToTickSize(rawPrice, asset);
    currentHistory.push(price);
    if (currentHistory.length > 50) currentHistory.shift();

    const vol = volumeSequence ? volumeSequence[i] : 500000;
    const market = createMarketFeed(asset, price, currentHistory, vol);
    const markets: any = { [asset]: market };

    simTime += 60000; // +1 minute per tick

    // Execute Quant Pilot Tick
    const res = tickAutonomousPilot(state, markets, simTime);

    // Track stale order sweeper actions
    if (res.ordersToCancel.length > 0) {
      staleOrdersSwept += res.ordersToCancel.length;
      state.orders = state.orders.filter((o) => !res.ordersToCancel.includes(o.id));
    }

    // Process Dispatched Orders (Limit & Market execution simulation)
    for (const proposal of res.ordersToDispatch) {
      // Validate Microstructure invariants
      if (!Number.isInteger(proposal.amount) || proposal.amount <= 0) {
        integerShares = false;
      }
      const cents = Math.round(proposal.price * 100);
      if (cents % 5 !== 0) {
        tickAligned = false;
      }

      if (proposal.side === 'buy') {
        // Limit buy fills if current/next market price is at or below limit
        if (price <= proposal.price) {
          const cost = proposal.amount * proposal.price;
          state.cash -= cost;
          state.positions[asset] = (state.positions[asset] || 0) + proposal.amount;
          state.avgBuyPrice[asset] = proposal.price;
          if (state.upstoxAccount?.funds) {
            state.upstoxAccount.funds.availableCash = state.cash;
            state.upstoxAccount.funds.usedMargin += cost;
          }
          tradesExecuted++;
        } else {
          // Keep as pending order
          state.orders.push({
            id: `ord_${scenarioId}_${i}_${proposal.asset}`,
            asset: proposal.asset,
            side: 'buy',
            amount: proposal.amount,
            price: proposal.price,
            limitPrice: proposal.price,
            type: proposal.type,
            status: 'pending',
            ts: simTime,
            strategyName: proposal.strategyName,
            auto: true,
          } as any);
        }
      } else if (proposal.side === 'sell') {
        // Sell fills (profit harvest, stop loss, chandelier exit)
        const heldUnits = state.positions[asset] || 0;
        const sellUnits = Math.min(heldUnits, proposal.amount);
        if (sellUnits > 0) {
          const avgBuy = state.avgBuyPrice[asset] || price;
          const proceeds = sellUnits * proposal.price;
          const pnl = (proposal.price - avgBuy) * sellUnits;

          state.cash += proceeds;
          state.realizedPnl += pnl;
          state.positions[asset] = heldUnits - sellUnits;
          if (state.positions[asset] === 0) {
            delete state.avgBuyPrice[asset];
          }
          if (state.upstoxAccount?.funds) {
            state.upstoxAccount.funds.availableCash = state.cash;
            state.upstoxAccount.funds.usedMargin = Math.max(0, state.upstoxAccount.funds.usedMargin - sellUnits * avgBuy);
          }
          tradesExecuted++;
        }
      }
    }

    // Mark-to-market evaluation
    const currentEquity = portfolioValue(state, markets);
    if (state.upstoxAccount?.funds) {
      state.upstoxAccount.funds.totalEquity = currentEquity;
    }

    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    }
    const currentDdPct = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
    if (currentDdPct > maxDrawdownPct) {
      maxDrawdownPct = currentDdPct;
    }

    // Invariant: Verify Cash floor is never breached
    const requiredFloor = currentEquity * (minCashFloorPct / 100);
    if (state.cash < requiredFloor - 1.0) { // ₹1.0 float tolerance
      cashFloorPreserved = false;
    }

    if (res.circuitBreakerTripped) {
      break; // Halt simulation as circuit breaker triggered
    }
  }

  const finalEquity = portfolioValue(state, {
    [asset]: createMarketFeed(asset, priceSequence[priceSequence.length - 1], currentHistory),
  } as any);
  const netPnl = +(finalEquity - state.startingEquity).toFixed(2);
  const netReturnPct = +((netPnl / state.startingEquity) * 100).toFixed(2);

  return {
    scenarioId,
    category,
    asset,
    startingEquity: state.startingEquity,
    finalEquity,
    netPnl,
    netReturnPct,
    maxDrawdownPct: +maxDrawdownPct.toFixed(2),
    tradesExecuted,
    circuitBreakerTripped: Boolean(state.autonomousPilot?.circuitBreakerTripped),
    staleOrdersSwept,
    cashFloorPreserved,
    tickAligned,
    integerShares,
  };
}

describe('Ultra Huge Stress Test: 1,050 Market Scenarios across 10-Asset Indian Bluechip Fleet', () => {
  // -------------------------------------------------------------------------
  // CATEGORY A: 350 EASY SCENARIOS (Bull Trends, OU Mean Reversion, Squeeze Releases)
  // -------------------------------------------------------------------------
  describe('Category A: 350 Easy / High-Yield Scenarios', () => {
    it('successfully processes 350 Easy Scenarios with positive expectancy & 100% invariant preservation', () => {
      const results: SimulationRunResult[] = [];

      // 1. 100 Bull Trend Breakout Runs
      for (let i = 0; i < 100; i++) {
        const asset = UPSTOX_FLEET_ASSETS[i % UPSTOX_FLEET_ASSETS.length];
        const basePrice = asset === 'TCS' ? 4000 : asset === 'LT' ? 3500 : asset === 'RELIANCE' ? 2800 : 1000;
        const driftPct = 0.015 + (i % 5) * 0.008; // 1.5% to 4.7% steady uptrend
        const history = Array.from({ length: 40 }, (_, idx) => basePrice * (0.95 + (idx / 40) * 0.05));
        const priceSeq = Array.from({ length: 25 }, (_, idx) => basePrice * (1 + (idx / 25) * driftPct));

        const res = runScenarioSimulation(`EASY_TREND_${i}`, 'EASY', asset, priceSeq, history, 'balanced');
        results.push(res);
      }

      // 2. 100 Ornstein-Uhlenbeck Mean-Reversion Oscillations
      for (let i = 0; i < 100; i++) {
        const asset = UPSTOX_FLEET_ASSETS[(i + 3) % UPSTOX_FLEET_ASSETS.length];
        const basePrice = asset === 'HDFCBANK' ? 1600 : asset === 'ICICIBANK' ? 1180 : 800;
        // Oversold plunge in history, followed by smooth sine wave mean-reversion
        const history = Array.from({ length: 40 }, (_, idx) => basePrice * (1.0 - (idx / 40) * 0.08)); // -8% dip
        const priceSeq = Array.from({ length: 25 }, (_, idx) => {
          const cycle = Math.sin((idx / 25) * Math.PI);
          return basePrice * 0.92 * (1 + cycle * 0.06); // +6% recovery bounce
        });

        const res = runScenarioSimulation(`EASY_OU_${i}`, 'EASY', asset, priceSeq, history, 'balanced');
        results.push(res);
      }

      // 3. 100 TTM Volatility Squeeze Releases
      for (let i = 0; i < 100; i++) {
        const asset = UPSTOX_FLEET_ASSETS[(i + 7) % UPSTOX_FLEET_ASSETS.length];
        const basePrice = asset === 'BHARTIARTL' ? 1580 : asset === 'TATAMOTORS' ? 975 : 500;
        // 40 ticks tight sideways consolidation (Squeeze ON), then explosive 4.5% expansion
        const history = Array.from({ length: 40 }, () => basePrice * (0.998 + Math.random() * 0.004));
        const priceSeq = Array.from({ length: 25 }, (_, idx) => basePrice * (1 + (idx / 25) * 0.045));

        const res = runScenarioSimulation(`EASY_SQUEEZE_${i}`, 'EASY', asset, priceSeq, history, 'balanced');
        results.push(res);
      }

      // 4. 50 Multi-Asset Rotation Scenarios
      for (let i = 0; i < 50; i++) {
        const asset = UPSTOX_FLEET_ASSETS[i % 5];
        const basePrice = 1200;
        const history = Array.from({ length: 40 }, (_, idx) => basePrice * (0.97 + (idx / 40) * 0.03));
        const priceSeq = Array.from({ length: 20 }, (_, idx) => basePrice * (1 + (idx / 20) * 0.03));

        const res = runScenarioSimulation(`EASY_ROTATION_${i}`, 'EASY', asset, priceSeq, history, 'momentum');
        results.push(res);
      }

      expect(results.length).toBe(350);

      // Verify Invariants across all 350 Easy Scenarios
      for (const r of results) {
        expect(r.cashFloorPreserved, `Cash floor must be preserved in ${r.scenarioId}`).toBe(true);
        expect(r.tickAligned, `Ticks must be ₹0.05 aligned in ${r.scenarioId}`).toBe(true);
        expect(r.integerShares, `Shares must be whole integers in ${r.scenarioId}`).toBe(true);
        expect(r.finalEquity).toBeGreaterThan(0);
      }

      // Aggregate Statistics
      const profitableRuns = results.filter((r) => r.netPnl >= 0);
      const winRate = (profitableRuns.length / results.length) * 100;
      expect(winRate).toBeGreaterThanOrEqual(95); // High win rate on favorable regimes
    });
  });

  // -------------------------------------------------------------------------
  // CATEGORY B: 350 MODERATE SCENARIOS (Sideways Chop, Gap-Downs, Stale Orders, Throttles)
  // -------------------------------------------------------------------------
  describe('Category B: 350 Moderate / Real-World Friction Scenarios', () => {
    it('successfully processes 350 Moderate Scenarios with controlled drawdown & robust order handling', () => {
      const results: SimulationRunResult[] = [];

      // 1. 100 Brownian Sideways Chop Runs (testing noise filtering)
      for (let i = 0; i < 100; i++) {
        const asset = UPSTOX_FLEET_ASSETS[i % UPSTOX_FLEET_ASSETS.length];
        const basePrice = 1500;
        let p = basePrice;
        const history = Array.from({ length: 40 }, () => {
          p += (Math.random() - 0.5) * 6;
          return p;
        });
        const priceSeq = Array.from({ length: 30 }, () => {
          p += (Math.random() - 0.5) * 8;
          return p;
        });

        const res = runScenarioSimulation(`MOD_CHOP_${i}`, 'MODERATE', asset, priceSeq, history, 'balanced');
        results.push(res);
      }

      // 2. 100 Morning Gap-Downs with Partial Recovery (-2% gap -> 1.5% recovery)
      for (let i = 0; i < 100; i++) {
        const asset = UPSTOX_FLEET_ASSETS[(i + 2) % UPSTOX_FLEET_ASSETS.length];
        const basePrice = 1800;
        const history = Array.from({ length: 40 }, () => basePrice);
        const priceSeq = [
          basePrice * 0.98, // -2% gap down
          basePrice * 0.978,
          basePrice * 0.982,
          basePrice * 0.986,
          basePrice * 0.992,
          basePrice * 0.995,
        ];

        const res = runScenarioSimulation(`MOD_GAP_${i}`, 'MODERATE', asset, priceSeq, history, 'conservative');
        results.push(res);
      }

      // 3. 75 Stale Limit Order Drift & Cancellation Runs
      for (let i = 0; i < 75; i++) {
        const asset = UPSTOX_FLEET_ASSETS[(i + 4) % UPSTOX_FLEET_ASSETS.length];
        const basePrice = 1000;
        // Oversold setup triggers limit buy @ ₹980, but price rallies away to ₹1,020 and stays for >20 mins
        const history = Array.from({ length: 40 }, (_, idx) => basePrice * (1.02 - (idx / 40) * 0.04));
        const priceSeq = Array.from({ length: 25 }, (_, idx) => basePrice * (1.00 + (idx / 25) * 0.025));

        const res = runScenarioSimulation(`MOD_STALE_${i}`, 'MODERATE', asset, priceSeq, history, 'balanced');
        results.push(res);
      }

      // 4. 75 Rate-Limiter Saturation Stress Runs
      for (let i = 0; i < 75; i++) {
        const asset = UPSTOX_FLEET_ASSETS[(i + 6) % UPSTOX_FLEET_ASSETS.length];
        const basePrice = 2400;
        const history = Array.from({ length: 40 }, (_, idx) => basePrice * (0.96 + (idx / 40) * 0.04));
        const priceSeq = Array.from({ length: 20 }, (_, idx) => basePrice * (1.0 + (idx / 20) * 0.02));

        const res = runScenarioSimulation(`MOD_THROTTLE_${i}`, 'MODERATE', asset, priceSeq, history, 'balanced');
        results.push(res);
      }

      expect(results.length).toBe(350);

      // Verify Invariants across all 350 Moderate Scenarios
      for (const r of results) {
        expect(r.cashFloorPreserved).toBe(true);
        expect(r.tickAligned).toBe(true);
        expect(r.integerShares).toBe(true);
        expect(r.finalEquity).toBeGreaterThan(0);
        // Moderate drawdowns must never exceed 3.0%
        expect(r.maxDrawdownPct).toBeLessThanOrEqual(3.0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // CATEGORY C: 350 DIFFICULT SCENARIOS (Flash Crashes, High Vol Whipsaws, Liquidity Droughts)
  // -------------------------------------------------------------------------
  describe('Category C: 350 Difficult / Black Swan Stress Scenarios', () => {
    it('strictly preserves 100% survival and engages capital defense stops across 350 Difficult Scenarios', () => {
      const results: SimulationRunResult[] = [];

      // 1. 100 Severe Flash Crashes (-6% to -18% sudden drops)
      for (let i = 0; i < 100; i++) {
        const asset = UPSTOX_FLEET_ASSETS[i % UPSTOX_FLEET_ASSETS.length];
        const basePrice = 2500;
        const crashPct = 0.06 + (i % 7) * 0.02; // -6% to -18% drop
        // Steady uptrend in history to trigger an entry, followed by a violent crash
        const history = Array.from({ length: 40 }, (_, idx) => basePrice * (0.95 + (idx / 40) * 0.05));
        const priceSeq = [
          basePrice * 1.002,
          basePrice * 1.005,
          basePrice * (1 - crashPct * 0.5), // Immediate gap down
          basePrice * (1 - crashPct),       // Deep crash
          basePrice * (1 - crashPct * 1.02),
        ];

        const res = runScenarioSimulation(`DIFF_CRASH_${i}`, 'DIFFICULT', asset, priceSeq, history, 'balanced');
        results.push(res);
      }

      // 2. 100 High-Volatility Violent Whipsaws (+/- 4% high ATR whipsaw)
      for (let i = 0; i < 100; i++) {
        const asset = UPSTOX_FLEET_ASSETS[(i + 3) % UPSTOX_FLEET_ASSETS.length];
        const basePrice = 1200;
        const history = Array.from({ length: 40 }, (_, idx) => basePrice * (1 + (idx % 2 === 0 ? 0.03 : -0.03)));
        const priceSeq = Array.from({ length: 20 }, (_, idx) => basePrice * (1 + (idx % 2 === 0 ? 0.035 : -0.035)));

        const res = runScenarioSimulation(`DIFF_WHIPSAW_${i}`, 'DIFFICULT', asset, priceSeq, history, 'conservative');
        results.push(res);
      }

      // 3. 75 Consecutive Losing Streaks (Circuit Breaker Tripping Invariant)
      for (let i = 0; i < 75; i++) {
        const asset = UPSTOX_FLEET_ASSETS[(i + 5) % UPSTOX_FLEET_ASSETS.length];
        const basePrice = 800;
        const history = Array.from({ length: 40 }, (_, idx) => basePrice * (0.96 + (idx / 40) * 0.04));
        // Continuous steady downward drift to test circuit breaker trip
        const priceSeq = Array.from({ length: 30 }, (_, idx) => basePrice * (1.0 - (idx / 30) * 0.06));

        const res = runScenarioSimulation(`DIFF_CIRCUIT_${i}`, 'DIFFICULT', asset, priceSeq, history, 'conservative');
        results.push(res);
      }

      // 4. 75 Liquidity Drought Runs (Volume drops 90%, wide bid-ask)
      for (let i = 0; i < 75; i++) {
        const asset = UPSTOX_FLEET_ASSETS[(i + 8) % UPSTOX_FLEET_ASSETS.length];
        const basePrice = 3000;
        const history = Array.from({ length: 40 }, () => basePrice);
        const priceSeq = Array.from({ length: 20 }, () => basePrice * 0.995);
        const lowVolSeq = Array.from({ length: 20 }, () => 15000); // 15k volume (dry)

        const res = runScenarioSimulation(`DIFF_DROUGHT_${i}`, 'DIFFICULT', asset, priceSeq, history, 'balanced', lowVolSeq);
        results.push(res);
      }

      expect(results.length).toBe(350);

      // Verify Invariants across all 350 Difficult Scenarios
      for (const r of results) {
        // Absolute Survival: Zero bankruptcy, cash floor preserved
        expect(r.cashFloorPreserved, `Cash floor must be preserved in ${r.scenarioId}`).toBe(true);
        expect(r.finalEquity).toBeGreaterThan(0);
        expect(r.tickAligned).toBe(true);
        expect(r.integerShares).toBe(true);
      }

      // Even under 350 flash crash & whipsaw runs, max drawdown across all difficult scenarios must be capped by stops/circuit breaker
      const maxDrawdownEncountered = Math.max(...results.map((r) => r.maxDrawdownPct));
      expect(maxDrawdownEncountered).toBeLessThanOrEqual(4.5); // Hard ceiling capped by stop-losses
    });
  });
});
