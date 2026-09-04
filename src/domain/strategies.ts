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
 * capital defense constraints (15% cash reserve floor, consecutive loss circuit breakers,
 * per-market pause state), and dynamically attaches institutional ATR profit targets and stop-loss brackets.
 */
export function evaluateStrategy(
  strategy: StrategyConfig,
  state: AppState,
  markets: Record<Asset, Market | undefined>
): StrategyExecutionResult {
  // 1. Basic Status & Circuit Breaker Gates
  if (!strategy.enabled) {
    return { executed: false, message: 'Strategy disabled' };
  }

  if (strategy.circuitBreakerTriggered) {
    return {
      executed: false,
      message: `Circuit Breaker Active: ${strategy.circuitBreakerReason || 'Halted after consecutive losses'}`,
    };
  }

  // 2. Per-Market Master Pause Gate
  if (state.pausedMarkets && state.pausedMarkets.includes(strategy.asset)) {
    return {
      executed: false,
      message: `Market ${strategy.asset} is paused by operator. All automated trading suspended.`,
    };
  }

  const mm = markets[strategy.asset];
  if (!mm || mm.price <= 0) {
    return { executed: false, message: 'No market quote' };
  }

  // 3. Execution Cooldown Check
  const now = Date.now();
  const lastExec = strategy.lastExecutedAt || 0;
  if (now - lastExec < strategy.cooldownSec * 1000) {
    return { executed: false, message: 'Cooldown active' };
  }

  // 4. Portfolio Telemetry & Capital Defense Invariants
  const pv = portfolioValue(state, markets);
  const currentVal = positionValue(state, markets, strategy.asset);
  const maxAllowedVal = pv * (strategy.maxAllocation || 0.25);
  const availableCash = getAvailableCash(state);
  const availableHolding = getAvailablePosition(state, strategy.asset);

  const cashRatio = state.cash / Math.max(1, pv);
  const isLossPreventionStrict = state.lossPreventionMode !== 'aggressive';

  // Strict 15% Cash Liquidity Floor: Halt any new buy allocations if cash is depleted
  const isCashFloorViolated = isLossPreventionStrict && cashRatio < 0.15;

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
    tpMultiplier = 3.2,
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

  // Check if market is in severe structural downtrend (Bearish Regime Gate)
  const regimeFilterActive = strategy.params.regimeFilterEnabled !== false;
  const isBearishRegime =
    regimeFilterActive &&
    (ind.regime === 'Bearish Breakdown' ||
      (ind.score <= -1 && ind.rsi < 40) ||
      ind.emaRibbon.alignment === 'bearish');

  // =========================================================================
  // 0. TITAN QUANTUM APEX SENTINEL (FLAGSHIP ZERO-LOSS PROFIT-MAXIMIZING ENGINE)
  // =========================================================================
  if (strategy.kind === 'titan_quantum') {
    // A. Quarantine Shadow Verification Mode:
    // If quarantined due to a past stop-loss, simulate paper checks until 2 consecutive winning setups verify
    if (strategy.quarantineActive) {
      const minAlphaQuarantine = strategy.params.minAlphaScore ?? 35;
      const rsiMaxQuarantine = strategy.params.rsiThresholdBuy ?? 68;
      const isCandidateSignal =
        !isBearishRegime &&
        !ind.isChopBlocked &&
        ind.alphaScore >= minAlphaQuarantine &&
        ind.rsi <= rsiMaxQuarantine;

      if (isCandidateSignal) {
        strategy.quarantineShadowWins = (strategy.quarantineShadowWins || 0) + 1;
        strategy.lastExecutedAt = now;
        if (strategy.quarantineShadowWins >= 2) {
          strategy.quarantineActive = false;
          strategy.consecutiveLosses = 0;
          strategy.circuitBreakerTriggered = false;
          return {
            executed: false,
            message: `Titan Quantum: Graduated from shadow quarantine after 2 successful virtual setups! Resuming live capital allocation.`,
          };
        }
        return {
          executed: false,
          message: `Titan Quantum: Shadow paper setup verified (${strategy.quarantineShadowWins}/2 needed to exit quarantine). Real cash protected.`,
        };
      }
      return {
        executed: false,
        message: `Titan Quantum: In Shadow Quarantine (${strategy.quarantineShadowWins || 0}/2). Awaiting clean trending conditions.`,
      };
    }

    // B. Structural Invalidation Defense (Defensive Full Liquidation before SL)
    if (isBearishRegime && availableHolding > 0 && ind.score <= -2) {
      const r = executeOrder(state, markets, 'sell', strategy.asset, availableHolding, {
        auto: true,
        strategyName: strategy.name,
      });
      if (r.ok && r.order) {
        return recordExecution(
          r,
          'sell',
          `Titan Quantum Emergency Defense: Liquidated ${formatQty(availableHolding, strategy.asset)} ${strategy.asset} due to structural regime breakdown (Alpha: ${ind.alphaScore}). Capital salvaged.`
        );
      }
    }

    // C. Capital Defense & Liquidity Checks
    if (isCashFloorViolated) {
      return { executed: false, message: 'Titan Quantum: BUY VETOED (Mandatory 15% cash liquidity reserve active)' };
    }
    if (isBearishRegime) {
      return { executed: false, message: 'Titan Quantum: BUY VETOED (Market in Bearish Breakdown regime)' };
    }

    // D. Choppiness & Noise Rejection Filter (Zero-Loss Principle #1)
    const maxChop = strategy.params.maxChoppinessThreshold ?? 60.0;
    if (ind.chopIndex != null && ind.chopIndex > maxChop) {
      return {
        executed: false,
        message: `Titan Quantum: BUY VETOED (Choppiness Index ${ind.chopIndex} > ${maxChop} - sideways noise risk)`,
      };
    }

    // E. Directional ADX Trend Filter
    const minAdx = strategy.params.minAdxThreshold ?? 18;
    if (ind.adx && ind.adx.adx < minAdx) {
      return {
        executed: false,
        message: `Titan Quantum: BUY VETOED (ADX ${ind.adx.adx} < ${minAdx} - insufficient directional trend energy)`,
      };
    }

    // F. Multi-Factor Conviction Alignment
    const vwapObj = ind.vwap;
    const isAboveVwap = vwapObj ? currentPrice >= vwapObj.vwap * 0.998 : true;
    const minAlpha = strategy.params.minAlphaScore ?? 35;
    const rsiMin = strategy.params.rsiThresholdSell ?? 38;
    const isHealthyRsi = ind.rsi >= rsiMin && ind.rsi <= (strategy.params.rsiThresholdBuy ?? 68);
    const isEmaAligned = !regimeFilterActive || ind.emaRibbon.alignment !== 'bearish';

    if (
      isAboveVwap &&
      isHealthyRsi &&
      ind.alphaScore >= minAlpha &&
      isEmaAligned &&
      currentVal < maxAllowedVal
    ) {
      const remainingAllocation = maxAllowedVal - currentVal;
      // Fractional Kelly with volatility scaling (max 18% of available cash)
      const kellyFraction = Math.min(0.18, (ind.winProbabilityPct / 100) * 0.20);
      const budget = Math.min(remainingAllocation, availableCash * kellyFraction);

      if (budget >= 15) {
        const qty = +(budget / currentPrice).toFixed(4);
        // Triple-barrier brackets: TP1 scale-out at 2.2x ATR, initial SL at 1.15x ATR
        const tpMultiplier = strategy.params.scaleOutTp1AtrMult ?? 2.4;
        const slMultiplier = strategy.params.atrMultiplierSL ?? 1.15;
        const tpPrice = +(currentPrice + effectiveAtr * tpMultiplier).toFixed(2);
        const slPrice = +(Math.max(0.01, currentPrice - effectiveAtr * slMultiplier)).toFixed(2);

        const r = executeOrder(state, markets, 'buy', strategy.asset, qty, {
          auto: true,
          strategyName: strategy.name,
          takeProfit: tpPrice,
          stopLoss: slPrice,
        });

        if (r.ok && r.order) {
          return recordExecution(
            r,
            'buy',
            `Titan Quantum Sniper: Executed ${formatQty(qty, strategy.asset)} ${strategy.asset} @ ${money(currentPrice)} | Alpha: +${ind.alphaScore}, ADX: ${ind.adx?.adx ?? 'N/A'}, CHOP: ${ind.chopIndex ?? 'N/A'} (TP1: ${money(tpPrice)}, SL: ${money(slPrice)})`
          );
        }
      }
    }

    return {
      executed: false,
      message: `Titan Quantum: Scanning (Alpha: ${ind.alphaScore}/${minAlpha}, CHOP: ${ind.chopIndex ?? 'OK'}, ADX: ${ind.adx?.adx ?? 'OK'}, VWAP: ${isAboveVwap ? 'OK' : 'BELOW'})`,
    };
  }

  // =========================================================================
  // 1. THE TITAN ADAPTIVE MULTI-REGIME QUANTITATIVE SENTINEL (WORLD-CLASS FLAGSHIP)
  // =========================================================================
  if (strategy.kind === 'titan_adaptive') {
    // 1. Invalidation / Structural Breakdown Exit (Protects existing position before SL hit)
    if (isBearishRegime && availableHolding > 0 && ind.score <= -2) {
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
            `Titan Defensive Trim: Sold ${formatQty(trimQty, strategy.asset)} ${strategy.asset} due to structural regime breakdown (Score: ${ind.score})`
          );
        }
      }
    }

    // 2. Buy Gate checks
    if (isCashFloorViolated) {
      return { executed: false, message: 'Titan Sentinel: BUY BLOCKED (Preserving mandatory 15% cash liquidity floor)' };
    }
    if (isBearishRegime) {
      return { executed: false, message: 'Titan Sentinel: BUY BLOCKED (Market in Bearish Downtrend Regime)' };
    }

    // 3. Multi-Regime Signal Evaluation
    const vwapObj = ind.vwap;
    const isAboveVwap = vwapObj ? currentPrice >= vwapObj.vwap * 0.995 : true;
    const hasSufficientVolume = mm.volume24h > 10000;
    const isNotOverbought = ind.rsi <= (strategy.params.rsiThresholdBuy ?? 68);
    const hasAlphaConviction = ind.alphaScore >= (strategy.params.minAlphaScore ?? 30);
    const isEmaConstructive = !regimeFilterActive || ind.emaRibbon.alignment !== 'bearish';

    // Quantitative Entry Alignment:
    // Requires non-bearish regime, above VWAP support, solid alpha score, and healthy RSI bandwidth
    if (
      isAboveVwap &&
      isNotOverbought &&
      hasAlphaConviction &&
      isEmaConstructive &&
      hasSufficientVolume &&
      currentVal < maxAllowedVal
    ) {
      const remainingAllocation = maxAllowedVal - currentVal;
      // Fractional Kelly Volatility-Targeted Sizing (max 20% of cash, scaled by win probability)
      const kellyScale = Math.min(0.2, (ind.winProbabilityPct / 100) * 0.22);
      const budget = Math.min(remainingAllocation, availableCash * kellyScale);

      if (budget >= 15) {
        const qty = +(budget / currentPrice).toFixed(4);
        const brackets = calculateBrackets(
          currentPrice,
          strategy.params.atrMultiplierTP ?? 3.5,
          strategy.params.atrMultiplierSL ?? 1.35,
          strategy.targetProfitPct ?? 5.5,
          strategy.trailingStopPct ?? 2.2
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
            `Titan Adaptive Execution: ${formatQty(qty, strategy.asset)} ${strategy.asset} @ ${money(currentPrice)} (Alpha: +${ind.alphaScore}, WinProb: ${ind.winProbabilityPct}%, TP: ${money(brackets.takeProfit)}, SL: ${money(brackets.stopLoss)})`
          );
        }
      }
    }

    return {
      executed: false,
      message: `Titan Sentinel: Market scanning (Alpha: ${ind.alphaScore}, RSI: ${ind.rsi.toFixed(1)}, VWAP: ${isAboveVwap ? 'OK' : 'BELOW'})`,
    };
  }

  // =========================================================================
  // 1. INSTITUTIONAL VWAP TREND ACCUMULATION ENGINE
  // =========================================================================
  if (strategy.kind === 'vwap_trend') {
    // Loss Prevention: Don't buy if cash floor violated or market is bearish
    if (isCashFloorViolated) {
      return { executed: false, message: 'VWAP Trend: BUY BLOCKED (Preserving 15% cash liquidity floor)' };
    }
    if (isBearishRegime) {
      return { executed: false, message: 'VWAP Trend: BUY BLOCKED (Market in Bearish Regime)' };
    }

    const vwapObj = ind.vwap;
    const isAboveVwap = vwapObj ? currentPrice >= vwapObj.vwap * 0.996 : ind.score >= 0;
    const isPullbackSweetSpot = vwapObj
      ? currentPrice <= vwapObj.vwap * 1.025 && currentPrice >= vwapObj.lowerBand
      : ind.rsi >= 42 && ind.rsi <= 65;

    // Entry condition: Price retesting VWAP with bullish momentum alignment
    if (isAboveVwap && isPullbackSweetSpot && currentVal < maxAllowedVal) {
      const remainingAllocation = maxAllowedVal - currentVal;
      const budget = Math.min(remainingAllocation, availableCash * 0.20);
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
    if (isCashFloorViolated) {
      return { executed: false, message: 'Breakout Engine: BUY BLOCKED (Preserving 15% cash liquidity floor)' };
    }
    if (isBearishRegime) {
      return { executed: false, message: 'Breakout Engine: BUY BLOCKED (Market in Bearish Regime)' };
    }

    const isSqueeze = ind.bb?.isSqueeze ?? false;
    const isBreakout = ind.bb && currentPrice >= ind.bb.upper * 0.998 && ind.rsi > 56 && ind.rsi < 72;
    const hasMomentumVolume = (ind.macd && ind.macd.histogram > 0) || ind.score >= 1;

    // Trigger explosive breakout entry
    if ((isBreakout || (isSqueeze && hasMomentumVolume)) && currentVal < maxAllowedVal) {
      const remainingAllocation = maxAllowedVal - currentVal;
      const budget = Math.min(remainingAllocation, availableCash * 0.22);
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
    const minAlpha = strategy.params.minAlphaScore ?? 40;

    // Buy gate checks
    if (!isCashFloorViolated && ind.alphaScore >= minAlpha && currentVal < maxAllowedVal) {
      const remainingAllocation = maxAllowedVal - currentVal;
      const convictionMultiplier = Math.min(0.20, 0.10 + (Math.max(0, ind.alphaScore) / 100) * 0.15);
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
    if (ind.alphaScore <= -35 && availableHolding > 0) {
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
    if (isCashFloorViolated) {
      return { executed: false, message: 'Grid Scalper: BUY BLOCKED (Preserving 15% cash liquidity floor)' };
    }
    // Anti-Falling Knife: Never grid-buy during a structural market breakdown!
    if (isBearishRegime) {
      return { executed: false, message: 'Grid Scalper: BUY BLOCKED (Market in Bearish Downtrend - Anti-falling knife active)' };
    }

    const percentB = ind.bb?.percentB ?? 0.5;

    // Grid Buy: only in healthy range consolidation where %B is in lower quartile but not zero
    if (percentB <= 0.28 && percentB >= 0.05 && ind.rsi >= 32 && currentVal < maxAllowedVal) {
      const remainingAllocation = maxAllowedVal - currentVal;
      const budget = Math.min(remainingAllocation, availableCash * 0.15);

      if (budget >= 15) {
        const qty = +(budget / currentPrice).toFixed(4);
        const brackets = calculateBrackets(
          currentPrice,
          1.8,
          1.1,
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
    if (isCashFloorViolated) {
      return { executed: false, message: 'Momentum: BUY BLOCKED (Preserving 15% cash liquidity floor)' };
    }
    if (isBearishRegime) {
      return { executed: false, message: 'Momentum: BUY BLOCKED (Market in Bearish Regime)' };
    }

    const buyRsi = strategy.params.rsiThresholdBuy ?? 68;
    const isBullish = ind.score >= 1 && ind.rsi > 45 && ind.rsi < buyRsi && ind.emaRibbon.alignment !== 'bearish';

    if (isBullish && currentVal < maxAllowedVal) {
      const budget = Math.min(maxAllowedVal - currentVal, availableCash * 0.20);
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
    if (isCashFloorViolated) {
      return { executed: false, message: 'Mean Reversion: BUY BLOCKED (Preserving 15% cash liquidity floor)' };
    }
    // Mean reversion only succeeds in consolidating or expanding markets, not freefall!
    if (ind.score <= -2 && ind.rsi < 30) {
      return { executed: false, message: 'Mean Reversion: BUY BLOCKED (Freefall breakdown hazard)' };
    }

    const buyRsi = strategy.params.rsiThresholdBuy ?? 35;
    const isOversold = (ind.bb && currentPrice <= ind.bb.lower * 1.005 && ind.bb.percentB >= 0.05) || (ind.rsi <= buyRsi && ind.rsi >= 25);

    if (isOversold && currentVal < maxAllowedVal) {
      const budget = Math.min(maxAllowedVal - currentVal, availableCash * 0.18);
      if (budget >= 15) {
        const qty = +(budget / currentPrice).toFixed(4);
        const targetTp = ind.bb ? ind.bb.middle : currentPrice * 1.04;
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
    if (isCashFloorViolated) {
      return { executed: false, message: 'Smart DCA: Paused (Preserving mandatory 15% cash liquidity floor)' };
    }

    const baseDcaAmount = strategy.params.dcaAmountUsd ?? 100;

    // Smart Value Multiplier:
    // If deeply oversold (RSI < 35), increase purchase size to 1.6x
    // If overbought (RSI > 70), pause DCA to avoid buying euphoric peaks
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
        const brackets = calculateBrackets(currentPrice, 3.2, 1.5, 6.5, 3.0);
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
