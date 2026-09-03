import { AppState, Asset, Market, StrategyConfig } from '../types';
import { portfolioValue, positionValue } from './portfolio';
import { indicators } from './indicators';
import { executeOrder, ExecuteOrderResult } from './trading';

export interface StrategyExecutionResult {
  executed: boolean;
  orderResult?: ExecuteOrderResult;
  message?: string;
  type?: 'buy' | 'sell';
}

/**
 * Evaluates a single algorithmic strategy against real market signals, allocation caps, and cooldowns.
 */
export function evaluateStrategy(
  strategy: StrategyConfig,
  state: AppState,
  markets: Record<Asset, Market | undefined>
): StrategyExecutionResult {
  if (!strategy.enabled) {
    return { executed: false, message: 'Strategy disabled' };
  }

  const mm = markets[strategy.asset];
  if (!mm || mm.price <= 0) {
    return { executed: false, message: 'No market quote' };
  }

  const now = Date.now();
  const lastExec = strategy.lastExecutedAt || 0;
  if (now - lastExec < strategy.cooldownSec * 1000) {
    return { executed: false, message: 'Cooldown active' };
  }

  const pv = portfolioValue(state, markets);
  const currentVal = positionValue(state, markets, strategy.asset);
  const maxAllowedVal = pv * (strategy.maxAllocation || 0.25);
  const ind = indicators(mm.history, mm.candles);

  // 1. MOMENTUM STRATEGY
  if (strategy.kind === 'momentum') {
    // Bullish Entry: score >= 1 (SMA cross or RSI strength) and RSI not overbought (< threshold)
    const buyRsi = strategy.params.rsiThresholdBuy ?? 68;
    if (ind.score >= 1 && ind.rsi < buyRsi && currentVal < maxAllowedVal) {
      const budget = Math.min(maxAllowedVal - currentVal, state.cash * 0.2);
      if (budget >= 15) {
        const qty = +(budget / mm.price).toFixed(4);
        const r = executeOrder(state, markets, 'buy', strategy.asset, qty, {
          auto: true,
          strategyName: strategy.name,
        });
        if (r.ok && r.order) {
          strategy.lastExecutedAt = now;
          strategy.tradesExecuted = (strategy.tradesExecuted || 0) + 1;
          strategy.feesPaid = (strategy.feesPaid || 0) + r.order.fee;
          return {
            executed: true,
            orderResult: r,
            type: 'buy',
            message: `Momentum Buy Triggered: ${qty} ${strategy.asset} @ $${mm.price.toFixed(2)}`,
          };
        }
      }
    }

    // Bearish Exit / Profit Trim: score <= -1 and RSI falling below sell threshold
    const sellRsi = strategy.params.rsiThresholdSell ?? 38;
    const currentHolding = state.positions[strategy.asset] || 0;
    if (ind.score <= -1 && ind.rsi < sellRsi && currentHolding > 0) {
      const trimQty = +(currentHolding * 0.25).toFixed(4);
      if (trimQty > 0) {
        const r = executeOrder(state, markets, 'sell', strategy.asset, trimQty, {
          auto: true,
          strategyName: strategy.name,
        });
        if (r.ok && r.order) {
          strategy.lastExecutedAt = now;
          strategy.tradesExecuted = (strategy.tradesExecuted || 0) + 1;
          strategy.feesPaid = (strategy.feesPaid || 0) + r.order.fee;
          return {
            executed: true,
            orderResult: r,
            type: 'sell',
            message: `Momentum Take-Profit / Stop: Sold ${trimQty} ${strategy.asset}`,
          };
        }
      }
    }
  }

  // 2. MEAN REVERSION STRATEGY
  if (strategy.kind === 'mean_reversion') {
    const buyRsi = strategy.params.rsiThresholdBuy ?? 35;
    // Oversold entry: Price touches/breaks below lower Bollinger Band and RSI is low
    if (ind.bb && mm.price <= ind.bb.lower && ind.rsi <= buyRsi && currentVal < maxAllowedVal) {
      const budget = Math.min(maxAllowedVal - currentVal, state.cash * 0.2);
      if (budget >= 15) {
        const qty = +(budget / mm.price).toFixed(4);
        const r = executeOrder(state, markets, 'buy', strategy.asset, qty, {
          auto: true,
          strategyName: strategy.name,
        });
        if (r.ok && r.order) {
          strategy.lastExecutedAt = now;
          strategy.tradesExecuted = (strategy.tradesExecuted || 0) + 1;
          strategy.feesPaid = (strategy.feesPaid || 0) + r.order.fee;
          return {
            executed: true,
            orderResult: r,
            type: 'buy',
            message: `Mean-Reversion Dip Buy: ${qty} ${strategy.asset} @ $${mm.price.toFixed(2)}`,
          };
        }
      }
    }
  }

  // 3. DCA (DOLLAR-COST AVERAGING) STRATEGY
  if (strategy.kind === 'dca') {
    const dcaAmount = strategy.params.dcaAmountUsd ?? 100;
    if (state.cash >= dcaAmount && currentVal < maxAllowedVal) {
      const qty = +(dcaAmount / mm.price).toFixed(4);
      if (qty > 0) {
        const r = executeOrder(state, markets, 'buy', strategy.asset, qty, {
          auto: true,
          strategyName: strategy.name,
        });
        if (r.ok && r.order) {
          strategy.lastExecutedAt = now;
          strategy.tradesExecuted = (strategy.tradesExecuted || 0) + 1;
          strategy.feesPaid = (strategy.feesPaid || 0) + r.order.fee;
          return {
            executed: true,
            orderResult: r,
            type: 'buy',
            message: `DCA Periodic Allocation: ${qty} ${strategy.asset} ($${dcaAmount})`,
          };
        }
      }
    }
  }

  return { executed: false };
}
