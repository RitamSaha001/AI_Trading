import { describe, it, expect } from 'vitest';
import { evaluateStrategy } from './strategies';
import { freshState } from '../storage';
import { Market, StrategyConfig } from '../types';

function createMockMarket(price: number, asset: any = 'BTC'): Market {
  // Generate 40 simulated candle ticks
  const history = Array.from({ length: 40 }, (_, i) => price * (1 + Math.sin(i / 5) * 0.02));
  const candles = history.map((p, i) => ({
    time: Date.now() - (40 - i) * 60000,
    open: p * 0.998,
    high: p * 1.005,
    low: p * 0.995,
    close: p,
    volume: 50 + i * 2,
  }));

  return {
    asset,
    name: asset,
    symbol: asset,
    price,
    change24h: 2.5,
    high24h: price * 1.05,
    low24h: price * 0.95,
    volume24h: 150000000,
    history,
    candles,
    source: 'Simulated Heuristic',
    isSynthetic: false,
    lastUpdated: Date.now(),
  };
}

describe('Autonomous Algorithmic Strategy Suite', () => {
  it('respects strategy enabled switch and cooldowns', () => {
    const state = freshState(50000, 'clean');
    const markets = { BTC: createMockMarket(65000, 'BTC') } as any;

    const strat: StrategyConfig = {
      id: 'test_disabled',
      asset: 'BTC',
      kind: 'vwap_trend',
      name: 'Test VWAP',
      enabled: false,
      maxAllocation: 0.3,
      cooldownSec: 30,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      params: {},
    };

    const resDisabled = evaluateStrategy(strat, state, markets);
    expect(resDisabled.executed).toBe(false);
    expect(resDisabled.message).toContain('Strategy disabled');

    strat.enabled = true;
    strat.lastExecutedAt = Date.now(); // active cooldown
    const resCooldown = evaluateStrategy(strat, state, markets);
    expect(resCooldown.executed).toBe(false);
    expect(resCooldown.message).toContain('Cooldown active');
  });

  it('evaluates and executes ai_multi_factor strategy when conditions align', () => {
    const state = freshState(50000, 'clean');
    const market = createMockMarket(65000, 'BTC');
    const markets = { BTC: market } as any;

    const strat: StrategyConfig = {
      id: 'test_alpha',
      asset: 'BTC',
      kind: 'ai_multi_factor',
      name: 'Alpha Quant',
      enabled: true,
      maxAllocation: 0.35,
      cooldownSec: 0,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      params: { minAlphaScore: -100 }, // Ensure trigger for verification
    };

    const res = evaluateStrategy(strat, state, markets);
    expect(res.executed).toBe(true);
    expect(res.type).toBe('buy');
    expect(res.orderResult?.ok).toBe(true);
    expect(res.orderResult?.order?.takeProfit).toBeGreaterThan(65000);
    expect(res.orderResult?.order?.stopLoss).toBeLessThan(65000);
    expect(strat.tradesExecuted).toBe(1);
  });

  it('attaches takeProfit and stopLoss brackets on vwap_trend executions', () => {
    const state = freshState(50000, 'clean');
    const market = createMockMarket(65000, 'BTC');
    const markets = { BTC: market } as any;

    const strat: StrategyConfig = {
      id: 'test_vwap',
      asset: 'BTC',
      kind: 'vwap_trend',
      name: 'VWAP Trend',
      enabled: true,
      maxAllocation: 0.3,
      cooldownSec: 0,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      targetProfitPct: 5.0,
      trailingStopPct: 2.0,
      params: {},
    };

    const res = evaluateStrategy(strat, state, markets);
    if (res.executed) {
      expect(res.orderResult?.ok).toBe(true);
      expect(res.orderResult?.order?.takeProfit).toBeDefined();
      expect(res.orderResult?.order?.stopLoss).toBeDefined();
    }
  });

  it('smart DCA adjusts purchase volume and pauses during overbought conditions', () => {
    const state = freshState(50000, 'clean');
    // Create a stable market where RSI is around 50 (neutral)
    const flatHistory = Array.from({ length: 40 }, () => 3200);
    const stableMarket: Market = {
      asset: 'ETH',
      name: 'Ethereum',
      symbol: 'ETH',
      price: 3200,
      change24h: 0.5,
      high24h: 3250,
      low24h: 3150,
      volume24h: 50000000,
      history: flatHistory,
      candles: flatHistory.map((p, i) => ({
        time: Date.now() - (40 - i) * 60000,
        open: p,
        high: p * 1.002,
        low: p * 0.998,
        close: p,
        volume: 100,
      })),
      source: 'Simulated Heuristic',
      isSynthetic: false,
      lastUpdated: Date.now(),
    };

    const markets = { ETH: stableMarket } as any;

    const strat: StrategyConfig = {
      id: 'test_dca',
      asset: 'ETH',
      kind: 'dca',
      name: 'ETH DCA',
      enabled: true,
      maxAllocation: 0.25,
      cooldownSec: 0,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      params: { dcaAmountUsd: 200 },
    };

    const res = evaluateStrategy(strat, state, markets);
    expect(res.executed).toBe(true);
    expect(res.orderResult?.ok).toBe(true);
    expect(state.positions.ETH).toBeGreaterThan(0);
    expect(strat.tradesExecuted).toBe(1);

    // Now test with strongly overbought market where RSI > 70
    const overboughtHistory = Array.from({ length: 40 }, (_, i) => 3000 + i * 25);
    const overboughtMarket: Market = {
      ...stableMarket,
      price: 3975,
      history: overboughtHistory,
      candles: overboughtHistory.map((p, i) => ({
        time: Date.now() - (40 - i) * 60000,
        open: p * 0.99,
        high: p * 1.01,
        low: p * 0.99,
        close: p,
        volume: 200,
      })),
    };
    strat.lastExecutedAt = 0;
    const resOverbought = evaluateStrategy(strat, state, { ETH: overboughtMarket } as any);
    expect(resOverbought.executed).toBe(false);
    expect(resOverbought.message).toContain('overbought');
  });

  it('halts strategy when per-market pause is active for that asset', () => {
    const state = freshState(50000, 'clean');
    state.pausedMarkets = ['BTC'];
    const markets = { BTC: createMockMarket(65000, 'BTC') } as any;

    const strat: StrategyConfig = {
      id: 'test_btc_sentinel',
      asset: 'BTC',
      kind: 'titan_adaptive',
      name: 'Titan Sentinel',
      enabled: true,
      maxAllocation: 0.25,
      cooldownSec: 0,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      params: {},
    };

    const res = evaluateStrategy(strat, state, markets);
    expect(res.executed).toBe(false);
    expect(res.message).toContain('paused by operator');
  });

  it('halts strategy when consecutive loss circuit breaker is triggered', () => {
    const state = freshState(50000, 'clean');
    const markets = { BTC: createMockMarket(65000, 'BTC') } as any;

    const strat: StrategyConfig = {
      id: 'test_btc_breaker',
      asset: 'BTC',
      kind: 'titan_adaptive',
      name: 'Titan Sentinel',
      enabled: true,
      circuitBreakerTriggered: true,
      circuitBreakerReason: 'Consecutive loss limit reached (2 losses)',
      maxAllocation: 0.25,
      cooldownSec: 0,
      tradesExecuted: 2,
      totalPnl: -120,
      realizedPnl: -120,
      feesPaid: 15,
      params: {},
    };

    const res = evaluateStrategy(strat, state, markets);
    expect(res.executed).toBe(false);
    expect(res.message).toContain('Circuit Breaker Active');
  });

  it('blocks new strategy buys when 15% cash liquidity floor is violated', () => {
    const state = freshState(50000, 'clean');
    state.positions = { ...state.positions, BTC: 1.0 }; // $65,000 position
    state.cash = 4000; // Equity = $69,000; cash ratio = 4,000 / 69,000 = 5.8% (< 15%)
    const markets = { BTC: createMockMarket(65000, 'BTC') } as any;

    const strat: StrategyConfig = {
      id: 'test_btc_floor',
      asset: 'BTC',
      kind: 'titan_adaptive',
      name: 'Titan Sentinel',
      enabled: true,
      maxAllocation: 0.85,
      cooldownSec: 0,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      params: {},
    };

    const res = evaluateStrategy(strat, state, markets);
    expect(res.executed).toBe(false);
    expect(res.message).toContain('15% cash liquidity floor');
  });

  it('executes Titan Adaptive strategy with dynamic ATR brackets and stops when conditions align', () => {
    const state = freshState(50000, 'clean');
    const market = createMockMarket(65000, 'BTC');
    const markets = { BTC: market } as any;

    const strat: StrategyConfig = {
      id: 'titan_btc_live',
      asset: 'BTC',
      kind: 'titan_adaptive',
      name: 'Titan Adaptive BTC',
      enabled: true,
      maxAllocation: 0.35,
      cooldownSec: 0,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      consecutiveLosses: 0,
      maxConsecutiveLossesAllowed: 2,
      params: { minAlphaScore: -100, rsiThresholdBuy: 100, regimeFilterEnabled: false },
    };

    const res = evaluateStrategy(strat, state, markets);
    expect(res.executed).toBe(true);
    expect(res.type).toBe('buy');
    expect(res.orderResult?.ok).toBe(true);
    expect(res.orderResult?.order?.takeProfit).toBeGreaterThan(65000);
    expect(res.orderResult?.order?.stopLoss).toBeLessThan(65000);
    expect(strat.tradesExecuted).toBe(1);
  });

  it('executes Titan Quantum Apex Sentinel with Zero-Loss Armor and ATR scale-out brackets when clean setup aligns', () => {
    const state = freshState(50000, 'clean');
    const market = createMockMarket(65000, 'BTC');
    const markets = { BTC: market } as any;

    const strat: StrategyConfig = {
      id: 'titan_quantum_btc_test',
      asset: 'BTC',
      kind: 'titan_quantum',
      name: 'Titan Quantum BTC',
      enabled: true,
      maxAllocation: 0.35,
      cooldownSec: 0,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      zeroLossMode: true,
      scaleOutEnabled: true,
      consecutiveLosses: 0,
      maxConsecutiveLossesAllowed: 2,
      params: {
        minAlphaScore: -100,
        minAdxThreshold: 0,
        maxChoppinessThreshold: 100,
        regimeFilterEnabled: false,
        rsiThresholdBuy: 100,
        rsiThresholdSell: 0,
      },
    };

    const res = evaluateStrategy(strat, state, markets);
    expect(res.executed).toBe(true);
    expect(res.type).toBe('buy');
    expect(res.orderResult?.ok).toBe(true);
    expect(res.orderResult?.order?.takeProfit).toBeGreaterThan(65000);
    expect(res.orderResult?.order?.stopLoss).toBeLessThan(65000);
    expect(strat.tradesExecuted).toBe(1);
  });

  it('blocks Titan Quantum buy execution when Choppiness Index detects choppy consolidation whipsaw', () => {
    const state = freshState(50000, 'clean');
    const market = createMockMarket(65000, 'BTC');
    const markets = { BTC: market } as any;

    const strat: StrategyConfig = {
      id: 'titan_quantum_chop_test',
      asset: 'BTC',
      kind: 'titan_quantum',
      name: 'Titan Quantum BTC',
      enabled: true,
      maxAllocation: 0.35,
      cooldownSec: 0,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      params: { minAlphaScore: -100, maxChoppinessThreshold: 10 }, // strict chop threshold (10) guaranteed to trigger
    };

    const res = evaluateStrategy(strat, state, markets);
    expect(res.executed).toBe(false);
    expect(res.message).toContain('sideways noise risk');
  });

  it('manages Quarantine Shadow Verification mode, recording paper wins and graduating to live execution after 2 wins', () => {
    const state = freshState(50000, 'clean');
    const market = createMockMarket(65000, 'BTC');
    const markets = { BTC: market } as any;

    const strat: StrategyConfig = {
      id: 'titan_quantum_quarantine_test',
      asset: 'BTC',
      kind: 'titan_quantum',
      name: 'Titan Quantum BTC',
      enabled: true,
      maxAllocation: 0.35,
      cooldownSec: 0,
      tradesExecuted: 0,
      totalPnl: -100,
      realizedPnl: -100,
      feesPaid: 10,
      quarantineActive: true,
      quarantineShadowWins: 0,
      consecutiveLosses: 1,
      params: {
        minAlphaScore: -100,
        minAdxThreshold: 0,
        maxChoppinessThreshold: 100,
        regimeFilterEnabled: false,
        rsiThresholdBuy: 100,
      },
    };

    // First shadow evaluation
    const res1 = evaluateStrategy(strat, state, markets);
    expect(res1.executed).toBe(false);
    expect(strat.quarantineShadowWins).toBe(1);
    expect(strat.quarantineActive).toBe(true);

    // Second shadow evaluation (reset cooldown)
    strat.lastExecutedAt = 0;
    const res2 = evaluateStrategy(strat, state, markets);
    expect(res2.executed).toBe(false);
    expect(strat.quarantineShadowWins).toBe(2);
    // After 2 shadow wins, quarantine is deactivated and consecutive losses reset!
    expect(strat.quarantineActive).toBe(false);
    expect(strat.consecutiveLosses).toBe(0);
    expect(res2.message).toContain('Graduated from shadow quarantine');
  });
});
