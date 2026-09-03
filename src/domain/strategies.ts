import { AppState, Asset, Market, StrategyConfig } from '../types';
import { portfolioValue, positionValue, getAvailableCash, getAvailablePosition, money, formatQty } from './portfolio';
import { indicators, TechnicalIndicators } from './indicators';
import { executeOrder, ExecuteOrderResult } from './trading';

export interface StrategyExecutionResult {
  executed: boolean;
  orderResult?: ExecuteOrderResult;
  message?: string;
  type?: 'buy' | 'sell';
  alphaScore?: number;
  winProbabilityPct?: number;
  regime?: string;
}

/**
 * Evaluates an algorithmic strategy against real market signals, allocation caps, cooldowns,
 * and dynamically attaches institutional ATR profit targets and stop-loss brackets.
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
  const availableCash = getAvailableCash(state);
  const currentHolding = state.positions[strategy.asset] || 0;
  const availableHolding = getAvailablePosition(state, strategy.asset);

  const ind: TechnicalIndicators = indicators(mm.history, mm.candles);
  const currentPrice = mm.price;
  const effectiveAtr = ind.atr ?? currentPrice * Math.max(0.015, ind.vol * 1.5);

  // Helper to record execution metrics
  const recordExecution = (r: ExecuteOrderResult, type: 'buy' | 'sell', msg: string): StrategyExecutionResult => {
    strategy.lastExecutedAt = now;
    strategy.tradesExecuted = (strategy.tradesExecuted || 0) + 1;
    if (r.order) {
      strategy.feesPaid = (strategy.feesPaid || 0) + r.order.fee;
    }
    return {
      executed: true,
      orderResult: r,
      type,
      message: msg,
      alphaScore: ind.alphaScore,
      winProbabilityPct: ind.winProbabilityPct,
      regime: ind.regime,
    };
  };

  // Helper to calculate dynamic take-profit and stop-loss brackets
  const calculateBrackets = (
    entryPrice: number,
    tpMultiplier = 2.8,
    slMultiplier = 1.3,
    customTpPct?: number,
    customSlPct?: number
  ) => {
    let tp: number;
    let sl: number;

    if (customTpPct && customTpPct > 0) {
      tp = +(entryPrice * (1 + customTpPct / 100)).toFixed(2);
    } else {
      tp = +(entryPrice + effectiveAtr * tpMultiplier).toFixed(2);
    }

    if (customSlPct && customSlPct > 0) {
      sl = +(Math.max(0.01, entryPrice * (1 - customSlPct / 100))).toFixed(2);
    } else {
      sl = +(Math.max(0.01, entryPrice - effectiveAtr * slMultiplier)).toFixed(2);
    }

    return { takeProfit: tp, stopLoss: sl };
  };

  // =========================================================================
  // 1. INSTITUTIONAL VWAP TREND ACCUMULATION ENGINE
  // =========================================================================
  if (strategy.kind === 'vwap_trend') {
    const vwapObj = ind.vwap;
    const isAboveVwap = vwapObj ? currentPrice >= vwapObj.vwap * 0.996 : ind.score >= 0;
    const isPullbackSweetSpot = vwapObj
      ? currentPrice <= vwapObj.vwap * 1.025 && currentPrice >= vwapObj.lowerBand
      : ind.rsi >= 42 && ind.rsi <= 65;

    // Entry condition: Price retesting VWAP with bullish momentum alignment
    if (isAboveVwap && isPullbackSweetSpot && currentVal < maxAllowedVal) {
      const remainingAllocation = maxAllowedVal - currentVal;
      const budget = Math.min(remainingAllocation, availableCash * 0.25);
      if (budget >= 15) {
        const qty = +(budget / currentPrice).toFixed(4);
        const brackets = calculateBrackets(
          currentPrice,
          strategy.params.atrMultiplierTP ?? 3.0,
          strategy.params.atrMultiplierSL ?? 1.25,
          strategy.targetProfitPct,
          strategy.trailingStopPct
        );

        const r = executeOrder(state, markets, 'buy', strategy.asset, qty, {
          auto: true,
          strategyName: strategy.name,
          takeProfit: brackets.takeProfit,
          stopLoss: brackets.stopLoss,
        });

        if (r.ok && r.order) {
          return recordExecution(
            r,
            'buy',
            `VWAP Trend Fill: ${formatQty(qty, strategy.asset)} ${strategy.asset} @ ${money(currentPrice)} (TP: ${money(brackets.takeProfit)}, SL: ${money(brackets.stopLoss)})`
          );
        }
      }
    }

    // Exit / Trim condition: Severe breakdown below lower VWAP band with bearish momentum
    if (vwapObj && currentPrice < vwapObj.lowerBand * 0.99 && ind.rsi < 38 && availableHolding > 0) {
      const trimQty = +(availableHolding * 0.35).toFixed(4);
      if (trimQty > 0) {
        const r = executeOrder(state, markets, 'sell', strategy.asset, trimQty, {
          auto: true,
          strategyName: strategy.name,
        });
        if (r.ok && r.order) {
          return recordExecution(
            r,
            'sell',
            `VWAP Trend Risk Trim: Sold ${formatQty(trimQty, strategy.asset)} ${strategy.asset} on structural breakdown`
          );
        }
      }
    }
  }

  // =========================================================================
  // 2. ADAPTIVE VOLATILITY & SQUEEZE BREAKOUT ENGINE
  // =========================================================================
  if (strategy.kind === 'breakout_volatility') {
    const isSqueeze = ind.bb?.isSqueeze ?? false;
    const isBreakout = ind.bb && currentPrice >= ind.bb.upper * 0.998 && ind.rsi > 58;
    const hasMomentumVolume = (ind.macd && ind.macd.histogram > 0) || ind.score >= 1;

    // Trigger explosive breakout entry
    if ((isBreakout || (isSqueeze && hasMomentumVolume)) && currentVal < maxAllowedVal) {
      const remainingAllocation = maxAllowedVal - currentVal;
      const budget = Math.min(remainingAllocation, availableCash * 0.28);
      if (budget >= 15) {
        const qty = +(budget / currentPrice).toFixed(4);
        const brackets = calculateBrackets(
          currentPrice,
          strategy.params.atrMultiplierTP ?? 3.5,
          strategy.params.atrMultiplierSL ?? 1.4,
          strategy.targetProfitPct ?? 7.5,
          strategy.trailingStopPct ?? 2.5
        );

        const r = executeOrder(state, markets, 'buy', strategy.asset, qty, {
          auto: true,
          strategyName: strategy.name,
          takeProfit: brackets.takeProfit,
          stopLoss: brackets.stopLoss,
        });

        if (r.ok && r.order) {
          return recordExecution(
            r,
            'buy',
            `Volatility Breakout Fired: ${formatQty(qty, strategy.asset)} ${strategy.asset} @ ${money(currentPrice)} (Target: +${strategy.targetProfitPct ?? 7.5}%)`
          );
        }
      }
    }
  }

  // =========================================================================
  // 3. COMPOSITE MULTI-FACTOR ALPHA QUANT ENGINE
  // =========================================================================
  if (strategy.kind === 'ai_multi_factor') {
    const minAlpha = strategy.params.minAlphaScore ?? 42;

    // High conviction buy signal: Multi-factor score meets statistical hurdle
    if (ind.alphaScore >= minAlpha && currentVal < maxAllowedVal) {
      const remainingAllocation = maxAllowedVal - currentVal;
      // Conviction scaling: Higher alpha score deploys higher cash proportion
      const convictionMultiplier = 0.15 + (ind.alphaScore / 100) * 0.2;
      const budget = Math.min(remainingAllocation, availableCash * convictionMultiplier);

      if (budget >= 15) {
        const qty = +(budget / currentPrice).toFixed(4);
        const brackets = calculateBrackets(
          currentPrice,
          strategy.params.atrMultiplierTP ?? 3.2,
          strategy.params.atrMultiplierSL ?? 1.3,
          strategy.targetProfitPct,
          strategy.trailingStopPct
        );

        const r = executeOrder(state, markets, 'buy', strategy.asset, qty, {
          auto: true,
          strategyName: strategy.name,
          takeProfit: brackets.takeProfit,
          stopLoss: brackets.stopLoss,
        });

        if (r.ok && r.order) {
          return recordExecution(
            r,
            'buy',
            `Alpha Engine (${ind.alphaScore} / Win: ${ind.winProbabilityPct}%): Bought ${formatQty(qty, strategy.asset)} ${strategy.asset} @ ${money(currentPrice)}`
          );
        }
      }
    }

    // Sell / Capital preservation trim on alpha collapse
    if (ind.alphaScore <= -40 && availableHolding > 0) {
      const trimQty = +(availableHolding * 0.4).toFixed(4);
      if (trimQty > 0) {
        const r = executeOrder(state, markets, 'sell', strategy.asset, trimQty, {
          auto: true,
          strategyName: strategy.name,
        });
        if (r.ok && r.order) {
          return recordExecution(
            r,
            'sell',
            `Alpha Exhaustion Trim (Score ${ind.alphaScore}): Sold ${formatQty(trimQty, strategy.asset)} ${strategy.asset}`
          );
        }
      }
    }
  }

  // =========================================================================
  // 4. DYNAMIC MULTI-TIER ATR GRID SCALPER
  // =========================================================================
  if (strategy.kind === 'grid_scalp') {
    const percentB = ind.bb?.percentB ?? 0.5;

    // Grid Buy: price in lower 30% of Bollinger band or Stochastic deeply oversold
    if ((percentB <= 0.3 || (ind.stochastic && ind.stochastic.k < 25)) && currentVal < maxAllowedVal) {
      const remainingAllocation = maxAllowedVal - currentVal;
      const budget = Math.min(remainingAllocation, availableCash * 0.15);

      if (budget >= 15) {
        const qty = +(budget / currentPrice).toFixed(4);
        const brackets = calculateBrackets(
          currentPrice,
          1.8,
          1.0,
          strategy.targetProfitPct ?? 3.2,
          strategy.trailingStopPct ?? 1.5
        );

        const r = executeOrder(state, markets, 'buy', strategy.asset, qty, {
          auto: true,
          strategyName: strategy.name,
          takeProfit: brackets.takeProfit,
          stopLoss: brackets.stopLoss,
        });

        if (r.ok && r.order) {
          return recordExecution(
            r,
            'buy',
            `Grid Scalp Dip Fill: ${formatQty(qty, strategy.asset)} ${strategy.asset} @ ${money(currentPrice)} (TP: +3.2%)`
          );
        }
      }
    }

    // Grid Sell: price reached upper 20% of range
    if (percentB >= 0.82 && availableHolding > 0) {
      const trimQty = +(availableHolding * 0.3).toFixed(4);
      if (trimQty > 0) {
        const r = executeOrder(state, markets, 'sell', strategy.asset, trimQty, {
          auto: true,
          strategyName: strategy.name,
        });
        if (r.ok && r.order) {
          return recordExecution(
            r,
            'sell',
            `Grid Scalp Profit Harvest: Sold ${formatQty(trimQty, strategy.asset)} ${strategy.asset} at upper band`
          );
        }
      }
    }
  }

  // =========================================================================
  // 5. ENHANCED MOMENTUM TREND-FOLLOWING ENGINE
  // =========================================================================
  if (strategy.kind === 'momentum') {
    const buyRsi = strategy.params.rsiThresholdBuy ?? 68;
    const isBullish = ind.score >= 1 && ind.rsi < buyRsi && (ind.emaRibbon.alignment !== 'bearish');

    if (isBullish && currentVal < maxAllowedVal) {
      const budget = Math.min(maxAllowedVal - currentVal, availableCash * 0.22);
      if (budget >= 15) {
        const qty = +(budget / currentPrice).toFixed(4);
        const brackets = calculateBrackets(
          currentPrice,
          strategy.params.atrMultiplierTP ?? 3.0,
          strategy.params.atrMultiplierSL ?? 1.3,
          strategy.targetProfitPct,
          strategy.trailingStopPct
        );

        const r = executeOrder(state, markets, 'buy', strategy.asset, qty, {
          auto: true,
          strategyName: strategy.name,
          takeProfit: brackets.takeProfit,
          stopLoss: brackets.stopLoss,
        });

        if (r.ok && r.order) {
          return recordExecution(
            r,
            'buy',
            `Momentum Buy: ${formatQty(qty, strategy.asset)} ${strategy.asset} @ ${money(currentPrice)} (TP: ${money(brackets.takeProfit)})`
          );
        }
      }
    }

    // Bearish Exit / Profit Trim
    const sellRsi = strategy.params.rsiThresholdSell ?? 38;
    if (ind.score <= -1 && ind.rsi < sellRsi && availableHolding > 0) {
      const trimQty = +(availableHolding * 0.3).toFixed(4);
      if (trimQty > 0) {
        const r = executeOrder(state, markets, 'sell', strategy.asset, trimQty, {
          auto: true,
          strategyName: strategy.name,
        });
        if (r.ok && r.order) {
          return recordExecution(
            r,
            'sell',
            `Momentum Profit Trim: Sold ${formatQty(trimQty, strategy.asset)} ${strategy.asset}`
          );
        }
      }
    }
  }

  // =========================================================================
  // 6. ENHANCED MEAN REVERSION / BOLLINGER %B EXHAUSTION
  // =========================================================================
  if (strategy.kind === 'mean_reversion') {
    const buyRsi = strategy.params.rsiThresholdBuy ?? 35;
    const isOversold = (ind.bb && currentPrice <= ind.bb.lower * 1.002) || ind.rsi <= buyRsi;

    if (isOversold && currentVal < maxAllowedVal) {
      const budget = Math.min(maxAllowedVal - currentVal, availableCash * 0.22);
      if (budget >= 15) {
        const qty = +(budget / currentPrice).toFixed(4);
        // Target is the middle Bollinger band / 20-period mean
        const targetTp = ind.bb ? ind.bb.middle : currentPrice * 1.045;
        const targetSl = +(Math.max(0.01, currentPrice - effectiveAtr * 1.2)).toFixed(2);

        const r = executeOrder(state, markets, 'buy', strategy.asset, qty, {
          auto: true,
          strategyName: strategy.name,
          takeProfit: +targetTp.toFixed(2),
          stopLoss: targetSl,
        });

        if (r.ok && r.order) {
          return recordExecution(
            r,
            'buy',
            `Mean-Reversion Dip Buy: ${formatQty(qty, strategy.asset)} ${strategy.asset} @ ${money(currentPrice)} (Target Mean: ${money(targetTp)})`
          );
        }
      }
    }
  }

  // =========================================================================
  // 7. SMART VALUE-WEIGHTED DCA (DOLLAR-COST AVERAGING)
  // =========================================================================
  if (strategy.kind === 'dca') {
    const baseDcaAmount = strategy.params.dcaAmountUsd ?? 100;

    // Smart Value Multiplier:
    // If deeply oversold (RSI < 35), increase purchase size to 1.6x
    // If overbought (RSI > 70), pause DCA to avoid buying the top
    let dcaMultiplier = 1.0;
    if (ind.rsi < 35) {
      dcaMultiplier = 1.6;
    } else if (ind.rsi > 70) {
      return { executed: false, message: 'DCA paused: Market currently overbought (RSI > 70)' };
    }

    const dcaAmount = baseDcaAmount * dcaMultiplier;
    if (availableCash >= dcaAmount && currentVal < maxAllowedVal) {
      const qty = +(dcaAmount / currentPrice).toFixed(4);
      if (qty > 0) {
        const brackets = calculateBrackets(currentPrice, 3.0, 1.5, 6.0, 3.0);
        const r = executeOrder(state, markets, 'buy', strategy.asset, qty, {
          auto: true,
          strategyName: strategy.name,
          takeProfit: brackets.takeProfit,
          stopLoss: brackets.stopLoss,
        });

        if (r.ok && r.order) {
          return recordExecution(
            r,
            'buy',
            `Smart DCA Execution: ${formatQty(qty, strategy.asset)} ${strategy.asset} ($${dcaAmount.toFixed(0)}, RSI: ${ind.rsi.toFixed(0)})`
          );
        }
      }
    }
  }

  return { executed: false };
}
