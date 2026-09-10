import { Candle } from '../../types';
import * as thresholds from './config/thresholds';
import {
  calculateRoundtripFriction,
  passesFrictionHurdle,
  calculateDynamicProfitRatchet,
  calculateHalfKellyFraction,
  evaluateSessionTimingQuality,
  ttmSqueezeState,
  calculateHurstExponentFromCandles,
  ouMeanReversionSignal,
  lateDayStopCompression,
  deadTradeStagnancyExit,
  volatilityShockFreeze,
  FrictionBreakdown,
} from './alphaSignalEngine';

export interface SignalFeatures {
  hurst: number;
  volumeSurgeRatio: number;
  isSqueezeRelease: boolean;
  relativeStrengthPct: number;
  alphaConvictionIndex: number;
  atrPriceRatio: number;
}

export interface TradeSample {
  features: SignalFeatures;
  won: number; // 1 for profitable trade, 0 for loss
}

/**
 * Supervised Logistic Regression Classifier for Empirical Win-Probability Fitting.
 * Replaces static constants with gradient-descent optimization over historical trade samples.
 */
export class LogisticRegressionModel {
  // Model weights: [bias, beta_hurst, beta_vol, beta_sqz, beta_conv, beta_atr]
  public weights: number[] = [0.12, 1.65, 0.45, 0.35, 0.55, -0.85];
  public isFitted = false;
  public trainingLoss = 0;
  public sampleCount = 0;

  public fit(samples: TradeSample[], learningRate = 0.05, epochs = 250, l2Penalty = 0.01): void {
    if (samples.length < 5) {
      this.isFitted = false;
      return;
    }

    this.sampleCount = samples.length;

    for (let epoch = 0; epoch < epochs; epoch++) {
      const grads = new Array(this.weights.length).fill(0);
      let totalLoss = 0;

      for (const s of samples) {
        const x = this.extractVector(s.features);
        const logit = x.reduce((sum, val, idx) => sum + val * this.weights[idx], 0);
        const p = 1 / (1 + Math.exp(-Math.max(-10, Math.min(10, logit))));
        const error = p - s.won;

        totalLoss += -(s.won * Math.log(Math.max(1e-7, p)) + (1 - s.won) * Math.log(Math.max(1e-7, 1 - p)));

        for (let k = 0; k < this.weights.length; k++) {
          grads[k] += error * x[k];
          if (k > 0) {
            grads[k] += l2Penalty * this.weights[k];
          }
        }
      }

      this.trainingLoss = totalLoss / samples.length;
      for (let k = 0; k < this.weights.length; k++) {
        this.weights[k] -= (learningRate * grads[k]) / samples.length;
      }
    }

    this.isFitted = true;
  }

  public predict(features: SignalFeatures): number {
    const x = this.extractVector(features);
    const logit = x.reduce((sum, val, idx) => sum + val * this.weights[idx], 0);
    const rawP = 1 / (1 + Math.exp(-logit));
    return +Math.max(0.30, Math.min(0.78, rawP)).toFixed(3);
  }

  private extractVector(f: SignalFeatures): number[] {
    const hurstOffset = f.hurst - 0.50;
    const volSurge = Math.max(0, Math.min(2.5, f.volumeSurgeRatio) - 1.0);
    const sqzBonus = f.isSqueezeRelease ? 1.0 : 0.0;
    const convOffset = (f.alphaConvictionIndex - 50) / 50;
    const atrPenalty = Math.max(0, (f.atrPriceRatio - 0.02) / 0.02);
    return [1, hurstOffset, volSurge, sqzBonus, convOffset, atrPenalty];
  }
}

/**
 * Heuristic prior for win-probability estimation when empirical fitting is not yet active.
 */
export function estimateWinProbabilityHeuristic(features: SignalFeatures): number {
  const model = new LogisticRegressionModel();
  return model.predict(features);
}

// Backward-compatible alias with transparent documentation
export const estimateWinProbability = estimateWinProbabilityHeuristic;

export interface BacktestTrade {
  entryBar: number;
  exitBar: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  grossProfit: number;
  friction: number;
  netProfit: number;
  exitReason: 'STOP_LOSS' | 'BREAKEVEN_SHIELD' | 'TRANCHE_1' | 'TRANCHE_2' | 'CHANDELIER' | 'DEAD_TRADE_TIME_STOP' | 'SESSION_CLOSE';
  holdBars: number;
  highestPriceSeen: number;
  signalFeatures?: SignalFeatures;
}

export interface BacktestReport {
  regime: string;
  totalBars: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRatePct: number;
  grossPnl: number;
  totalFrictionPaid: number;
  netPnl: number;
  profitFactor: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  frictionHurdleRejections: number;
  trades: BacktestTrade[];
  tradeSamples: TradeSample[];
}

export interface BacktestConfig {
  initialCapital?: number;
  isDelivery?: boolean;
  atrPeriod?: number;
  stopLossAtrMultiple?: number;
  takeProfitAtrMultiple?: number;
  frictionProfitMultiple?: number;
  microShieldAtrMultiple?: number;
  model?: LogisticRegressionModel;
}

export const BACKTEST_WARMUP_BARS = 35;

export interface WalkForwardWindow {
  fold: number;
  trainingStartBar: number;
  trainingEndBarExclusive: number;
  testStartBar: number;
  testEndBarExclusive: number;
}

export interface WalkForwardConfig {
  trainingBars?: number;
  testBars?: number;
  stepBars?: number;
  minTrainingTradeSamples?: number;
  minOutOfSampleTrades?: number;
  minProfitFactor?: number;
  minSharpeRatio?: number;
  maxDrawdownPct?: number;
  minimumPassingFolds?: number;
  backtest?: Omit<BacktestConfig, 'model'>;
}

export interface WalkForwardFoldResult {
  window: WalkForwardWindow;
  trainingReport: BacktestReport;
  outOfSampleReport: BacktestReport;
  modelFitted: boolean;
  passed: boolean;
  rejectionReasons: string[];
}

export interface WalkForwardValidationReport {
  totalBars: number;
  folds: WalkForwardFoldResult[];
  passingFolds: number;
  aggregateOutOfSampleNetPnl: number;
  aggregateOutOfSampleTrades: number;
  isPromotable: boolean;
  rejectionReasons: string[];
}

export function createWalkForwardWindows(
  totalBars: number,
  trainingBars: number,
  testBars: number,
  stepBars: number = testBars
): WalkForwardWindow[] {
  if (
    !Number.isInteger(totalBars) ||
    !Number.isInteger(trainingBars) ||
    !Number.isInteger(testBars) ||
    !Number.isInteger(stepBars) ||
    trainingBars < BACKTEST_WARMUP_BARS + 1 ||
    testBars < BACKTEST_WARMUP_BARS + 1 ||
    stepBars < 1
  ) {
    return [];
  }

  const windows: WalkForwardWindow[] = [];
  for (let testStartBar = trainingBars, fold = 1; testStartBar + testBars <= totalBars; testStartBar += stepBars, fold++) {
    windows.push({
      fold,
      trainingStartBar: Math.max(0, testStartBar - trainingBars),
      trainingEndBarExclusive: testStartBar,
      testStartBar,
      testEndBarExclusive: testStartBar + testBars,
    });
  }
  return windows;
}

/**
 * Runs rolling, strictly chronological training and out-of-sample evaluation.
 * The OOS slice receives only a fixed lookback prefix for indicator warm-up;
 * orders begin exactly at the test boundary, so model fitting cannot see test bars.
 */
export function runWalkForwardValidation(
  candles: Candle[],
  regimeLabel: string,
  config: WalkForwardConfig = {}
): WalkForwardValidationReport {
  const trainingBars = config.trainingBars ?? 240;
  const testBars = config.testBars ?? 80;
  const stepBars = config.stepBars ?? testBars;
  const minTrainingTradeSamples = config.minTrainingTradeSamples ?? 20;
  const minOutOfSampleTrades = config.minOutOfSampleTrades ?? 5;
  const minProfitFactor = config.minProfitFactor ?? 1.10;
  const minSharpeRatio = config.minSharpeRatio ?? 0.25;
  const maxDrawdownPct = config.maxDrawdownPct ?? 5.0;
  const minimumPassingFolds = config.minimumPassingFolds ?? 3;
  const windows = createWalkForwardWindows(candles.length, trainingBars, testBars, stepBars);

  const folds = windows.map((window) => {
    const trainingCandles = candles.slice(window.trainingStartBar, window.trainingEndBarExclusive);
    const trainingReport = runBacktest(trainingCandles, `${regimeLabel}: train fold ${window.fold}`, config.backtest);
    const model = new LogisticRegressionModel();
    const modelFitted = trainingReport.tradeSamples.length >= minTrainingTradeSamples;
    if (modelFitted) {
      model.fit(trainingReport.tradeSamples);
    }

    const warmupStart = Math.max(window.trainingStartBar, window.testStartBar - BACKTEST_WARMUP_BARS);
    const outOfSampleCandles = candles.slice(warmupStart, window.testEndBarExclusive);
    const outOfSampleReport = runBacktest(
      outOfSampleCandles,
      `${regimeLabel}: OOS fold ${window.fold}`,
      { ...config.backtest, model: modelFitted ? model : undefined }
    );
    const rejectionReasons: string[] = [];
    if (!modelFitted) rejectionReasons.push(`Only ${trainingReport.tradeSamples.length} training trade samples; minimum is ${minTrainingTradeSamples}.`);
    if (outOfSampleReport.totalTrades < minOutOfSampleTrades) rejectionReasons.push(`Only ${outOfSampleReport.totalTrades} OOS trades; minimum is ${minOutOfSampleTrades}.`);
    if (outOfSampleReport.netPnl <= 0) rejectionReasons.push('Out-of-sample net P&L is not positive after friction.');
    if (outOfSampleReport.profitFactor < minProfitFactor) rejectionReasons.push(`Out-of-sample profit factor ${outOfSampleReport.profitFactor} is below ${minProfitFactor}.`);
    if (outOfSampleReport.sharpeRatio < minSharpeRatio) rejectionReasons.push(`Out-of-sample Sharpe ${outOfSampleReport.sharpeRatio} is below ${minSharpeRatio}.`);
    if (outOfSampleReport.maxDrawdownPct > maxDrawdownPct) rejectionReasons.push(`Out-of-sample drawdown ${outOfSampleReport.maxDrawdownPct}% exceeds ${maxDrawdownPct}%.`);

    return {
      window,
      trainingReport,
      outOfSampleReport,
      modelFitted,
      passed: rejectionReasons.length === 0,
      rejectionReasons,
    };
  });

  const passingFolds = folds.filter((fold) => fold.passed).length;
  const rejectionReasons: string[] = [];
  if (folds.length < minimumPassingFolds) rejectionReasons.push(`Only ${folds.length} chronological folds available; minimum is ${minimumPassingFolds}.`);
  if (passingFolds < minimumPassingFolds) rejectionReasons.push(`Only ${passingFolds}/${folds.length} folds passed the OOS gate; minimum is ${minimumPassingFolds}.`);

  return {
    totalBars: candles.length,
    folds,
    passingFolds,
    aggregateOutOfSampleNetPnl: +folds.reduce((sum, fold) => sum + fold.outOfSampleReport.netPnl, 0).toFixed(2),
    aggregateOutOfSampleTrades: folds.reduce((sum, fold) => sum + fold.outOfSampleReport.totalTrades, 0),
    isPromotable: rejectionReasons.length === 0,
    rejectionReasons,
  };
}

/**
 * Replays quantitative execution tick-by-tick across candle fixtures.
 * Exercises Scenarios 1 (TCA), 2 (Unified Ratchet), 3 (Timing), 4 (Regime),
 * 5 (Late-Day Compression), 6 (Stagnancy), 7 (Volatility Shock), 9 (Multi-Tranche Harvesting),
 * and 10 (Half-Kelly Sizing) with next-bar execution delay.
 */
export function runBacktest(
  candles: Candle[],
  regimeLabel: string,
  config: BacktestConfig = {}
): BacktestReport {
  const isDelivery = config.isDelivery ?? false; // Autonomous pilot defaults to Intraday MIS
  const frictionMultiple = config.frictionProfitMultiple ?? thresholds.MIN_FRICTION_PROFIT_MULTIPLE;
  const model = config.model;

  let capital = config.initialCapital ?? 50000;
  let peakCapital = capital;
  let maxDrawdown = 0;

  const trades: BacktestTrade[] = [];
  const tradeSamples: TradeSample[] = [];
  let frictionHurdleRejections = 0;

  // Open position state
  let inPosition = false;
  let entryBar = 0;
  let entryPrice = 0;
  let currentStop = 0;
  let target1Price = 0;
  let target2Price = 0;
  let initialQuantity = 0;
  let remainingQuantity = 0;
  let highestPrice = 0;
  let trancheStage = 0;
  let lastExitBar = -999;
  let entryFeatures: SignalFeatures | undefined;
  let activeFriction: FrictionBreakdown = {
    turnover: 0,
    brokerage: 0,
    stt: 0,
    exchangeTxnCharge: 0,
    sebiTurnoverCharge: 0,
    stampDuty: 0,
    gst: 0,
    totalRoundtripFriction: 0,
    frictionPerShare: 0,
    frictionPct: 0,
  };
  let lastShockTimestamp = 0;

  // Pending order for next-bar execution delay
  let pendingOrder: {
    entryPrice: number;
    stop: number;
    t1: number;
    t2: number;
    qty: number;
    friction: FrictionBreakdown;
    features: SignalFeatures;
  } | null = null;

  const windowSize = BACKTEST_WARMUP_BARS;

  for (let i = windowSize; i < candles.length; i++) {
    const window = candles.slice(i - windowSize, i + 1);
    const closePrices = window.map((c) => c.close);
    const currentCandle = candles[i];
    const currentPrice = currentCandle.close;

    // Approximate ATR over 14 bars
    let atrSum = 0;
    for (let j = 1; j < 15 && j < window.length; j++) {
      atrSum += Math.abs(window[window.length - j].high - window[window.length - j].low);
    }
    const atr = Math.max(0.5, atrSum / 14);

    // ------------------------------------------------------------------------
    // Process Pending Order from Previous Bar (Realistic Next-Bar Open Fill)
    // ------------------------------------------------------------------------
    if (pendingOrder && !inPosition) {
      entryPrice = currentCandle.open;
      currentStop = pendingOrder.stop;
      target1Price = pendingOrder.t1;
      target2Price = pendingOrder.t2;
      initialQuantity = pendingOrder.qty;
      remainingQuantity = pendingOrder.qty;
      activeFriction = pendingOrder.friction;
      entryFeatures = pendingOrder.features;
      inPosition = true;
      entryBar = i;
      highestPrice = currentCandle.open;
      trancheStage = 0;
      pendingOrder = null;
    }

    // ------------------------------------------------------------------------
    // Open Position Lifecycle Management
    // ------------------------------------------------------------------------
    if (inPosition) {
      const barsHeld = i - entryBar;
      const timingQuality = evaluateSessionTimingQuality(currentCandle.time);

      if (barsHeld > 0) {
        // 1. Stop-Loss or Level 0.5 Breakeven Shield Exit (evaluated against stop active entering bar)
        if (currentCandle.low <= currentStop) {
          const exitPrice = currentCandle.open < currentStop ? currentCandle.open : currentStop;
          const grossProfit = +(remainingQuantity * (exitPrice - entryPrice)).toFixed(2);
          const feeFraction = remainingQuantity / initialQuantity;
          const frictionShare = +(activeFriction.totalRoundtripFriction * feeFraction).toFixed(2);
          const netProfit = +(grossProfit - frictionShare).toFixed(2);
          const exitReason = exitPrice >= entryPrice ? 'BREAKEVEN_SHIELD' : 'STOP_LOSS';

          trades.push({
            entryBar,
            exitBar: i,
            entryPrice,
            exitPrice,
            quantity: remainingQuantity,
            grossProfit,
            friction: frictionShare,
            netProfit,
            exitReason,
            holdBars: barsHeld,
            highestPriceSeen: highestPrice,
            signalFeatures: entryFeatures,
          });

          tradeSamples.push({
            features: entryFeatures || {
              hurst: 0.5,
              volumeSurgeRatio: 1.0,
              isSqueezeRelease: false,
              relativeStrengthPct: 0,
              alphaConvictionIndex: 50,
              atrPriceRatio: atr / currentPrice,
            },
            won: netProfit > 0 ? 1 : 0,
          });

          capital += netProfit;
          inPosition = false;
          lastExitBar = i;
          continue;
        }

        // 2. Scenario 9: Multi-Tranche Partial Harvesting (Tranche 1 @ +1.40 ATR)
        if (currentCandle.high >= target1Price && trancheStage === 0 && remainingQuantity >= 2) {
          const harvestQty = Math.floor(initialQuantity / 2);
          const harvestPrice = target1Price;
          const grossProfit = +(harvestQty * (harvestPrice - entryPrice)).toFixed(2);
          const frictionShare = +(activeFriction.totalRoundtripFriction * (harvestQty / initialQuantity)).toFixed(2);
          const netProfit = +(grossProfit - frictionShare).toFixed(2);

          trades.push({
            entryBar,
            exitBar: i,
            entryPrice,
            exitPrice: harvestPrice,
            quantity: harvestQty,
            grossProfit,
            friction: frictionShare,
            netProfit,
            exitReason: 'TRANCHE_1',
            holdBars: barsHeld,
            highestPriceSeen: Math.max(highestPrice, currentCandle.high),
            signalFeatures: entryFeatures,
          });

          capital += netProfit;
          remainingQuantity -= harvestQty;
          trancheStage = 1;
          // Lock stop to RATCHET_LOCK_2_ATR (+0.60 ATR) on the remaining position
          currentStop = Math.max(
            currentStop,
            +(entryPrice + atr * thresholds.RATCHET_LOCK_2_ATR).toFixed(2)
          );
        }

        // 3. Scenario 9: Tranche 2 Final Target Exit (+2.00 ATR)
        if (currentCandle.high >= target2Price && trancheStage >= 1) {
          const exitPrice = target2Price;
          const grossProfit = +(remainingQuantity * (exitPrice - entryPrice)).toFixed(2);
          const feeFraction = remainingQuantity / initialQuantity;
          const frictionShare = +(activeFriction.totalRoundtripFriction * feeFraction).toFixed(2);
          const netProfit = +(grossProfit - frictionShare).toFixed(2);

          trades.push({
            entryBar,
            exitBar: i,
            entryPrice,
            exitPrice,
            quantity: remainingQuantity,
            grossProfit,
            friction: frictionShare,
            netProfit,
            exitReason: 'TRANCHE_2',
            holdBars: barsHeld,
            highestPriceSeen: Math.max(highestPrice, currentCandle.high),
            signalFeatures: entryFeatures,
          });

          tradeSamples.push({
            features: entryFeatures || {
              hurst: 0.5,
              volumeSurgeRatio: 1.0,
              isSqueezeRelease: false,
              relativeStrengthPct: 0,
              alphaConvictionIndex: 50,
              atrPriceRatio: atr / currentPrice,
            },
            won: 1,
          });

          capital += netProfit;
          inPosition = false;
          lastExitBar = i;
          continue;
        }

        // 4. Scenario 6: Dead Trade Stagnancy Exit (90 minutes with zero progress)
        const stagnancy = deadTradeStagnancyExit(
          entryPrice,
          currentPrice,
          atr,
          barsHeld * 5 * 60 * 1000
        );
        if (stagnancy.shouldExit && currentPrice >= currentStop) {
          const grossProfit = +(remainingQuantity * (currentPrice - entryPrice)).toFixed(2);
          const feeFraction = remainingQuantity / initialQuantity;
          const frictionShare = +(activeFriction.totalRoundtripFriction * feeFraction).toFixed(2);
          const netProfit = +(grossProfit - frictionShare).toFixed(2);

          trades.push({
            entryBar,
            exitBar: i,
            entryPrice,
            exitPrice: currentPrice,
            quantity: remainingQuantity,
            grossProfit,
            friction: frictionShare,
            netProfit,
            exitReason: 'DEAD_TRADE_TIME_STOP',
            holdBars: barsHeld,
            highestPriceSeen: highestPrice,
            signalFeatures: entryFeatures,
          });

          tradeSamples.push({
            features: entryFeatures || {
              hurst: 0.5,
              volumeSurgeRatio: 1.0,
              isSqueezeRelease: false,
              relativeStrengthPct: 0,
              alphaConvictionIndex: 50,
              atrPriceRatio: atr / currentPrice,
            },
            won: netProfit > 0 ? 1 : 0,
          });

          capital += netProfit;
          inPosition = false;
          lastExitBar = i;
          continue;
        }

        // 5. Scenario 3 / MIS Rule: Session Close Auto Square-Off (15:15 IST or last bar)
        const isSessionCutoff =
          !isDelivery &&
          (timingQuality.phase === 'POST_CLOSE' ||
            i === candles.length - 1 ||
            (candles[i + 1] && candles[i + 1].time - currentCandle.time > 30 * 60 * 1000));

        if (isSessionCutoff) {
          const grossProfit = +(remainingQuantity * (currentPrice - entryPrice)).toFixed(2);
          const feeFraction = remainingQuantity / initialQuantity;
          const frictionShare = +(activeFriction.totalRoundtripFriction * feeFraction).toFixed(2);
          const netProfit = +(grossProfit - frictionShare).toFixed(2);

          trades.push({
            entryBar,
            exitBar: i,
            entryPrice,
            exitPrice: currentPrice,
            quantity: remainingQuantity,
            grossProfit,
            friction: frictionShare,
            netProfit,
            exitReason: 'SESSION_CLOSE',
            holdBars: barsHeld,
            highestPriceSeen: highestPrice,
            signalFeatures: entryFeatures,
          });

          tradeSamples.push({
            features: entryFeatures || {
              hurst: 0.5,
              volumeSurgeRatio: 1.0,
              isSqueezeRelease: false,
              relativeStrengthPct: 0,
              alphaConvictionIndex: 50,
              atrPriceRatio: atr / currentPrice,
            },
            won: netProfit > 0 ? 1 : 0,
          });

          capital += netProfit;
          inPosition = false;
          lastExitBar = i;
          continue;
        }
      }

      // Position survived stop checks: update highest price and ratchet stop for subsequent bars
      highestPrice = Math.max(highestPrice, currentCandle.high);

      // Scenario 2: Authoritative Unified Ratchet Call (Single source of truth)
      const ratchet = calculateDynamicProfitRatchet(
        entryPrice,
        currentPrice,
        atr,
        currentStop,
        thresholds.NSE_TICK_SIZE_INR,
        activeFriction.frictionPerShare,
        highestPrice
      );
      if (ratchet.isRatcheted) {
        currentStop = Math.max(currentStop, ratchet.ratchetedStopPrice);
      }

      // Scenario 5: 14:15 Late-Day Stop Compression before retail MIS square-off
      if (timingQuality.isLateDayLiquidationPhase && currentPrice > entryPrice) {
        const compressedStop = lateDayStopCompression(
          entryPrice,
          currentPrice,
          atr,
          highestPrice,
          currentStop,
          currentCandle.time,
          thresholds.NSE_TICK_SIZE_INR
        );
        currentStop = Math.max(currentStop, compressedStop.compressedStopPrice);
      }

      // Track Peak Portfolio Value & Drawdown
      const unrealizedPnl = (currentPrice - entryPrice) * remainingQuantity;
      peakCapital = Math.max(peakCapital, capital + unrealizedPnl);
      const dd = ((peakCapital - (capital + unrealizedPnl)) / peakCapital) * 100;
      maxDrawdown = Math.max(maxDrawdown, dd);
    } else {
      // ----------------------------------------------------------------------
      // Entry Evaluation & Multi-Scenario Safety Gates
      // ----------------------------------------------------------------------
      // Enforce 4-bar (20 min) cooldown after exit to prevent fee-draining churn
      if (i - lastExitBar < 4) continue;

      // Scenario 3: Session Timing Gate (blocks outside trading hours & 14:00 curfew)
      const timingQuality = evaluateSessionTimingQuality(currentCandle.time);
      if (!timingQuality.allowsNewEntries) continue;

      // Scenario 7: Flash Volatility Shock Freeze (> 3.5x ATR bar)
      const shock = volatilityShockFreeze(currentCandle, atr, lastShockTimestamp, currentCandle.time);
      if (shock.newShockDetected) {
        lastShockTimestamp = currentCandle.time;
      }
      if (shock.isFrozen) continue;

      // Scenario 4: Regime & Alpha Signal Math
      const hurstRes = calculateHurstExponentFromCandles(window);
      const squeezeState = ttmSqueezeState(closePrices);
      const ou = ouMeanReversionSignal(closePrices);
      const sma20 = closePrices.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const donchian10 = Math.max(...closePrices.slice(-11, -1));

      // Alpha Entry Filters:
      // 1. Hurst Persistent Breakout: H >= 0.55 AND price >= Donchian 10 High AND price > SMA20
      const isTrendingBreakout =
        hurstRes.hurst >= thresholds.HURST_TRENDING_THRESHOLD &&
        currentPrice >= donchian10 &&
        currentPrice > sma20;

      // 2. Extreme Mean Reversion Dip: H <= 0.48 AND OU Z-Score <= -1.20
      const isOversoldDip =
        hurstRes.hurst <= 0.48 &&
        ou.zScore <= -1.20;

      if (isTrendingBreakout || isOversoldDip) {
        // Signal Features for Win Probability Calibration
        const features: SignalFeatures = {
          hurst: hurstRes.hurst,
          volumeSurgeRatio: currentCandle.volume / 50000,
          isSqueezeRelease: squeezeState === 'off',
          relativeStrengthPct: ((currentPrice - sma20) / sma20) * 100,
          alphaConvictionIndex: Math.round(50 + (hurstRes.hurst - 0.5) * 60),
          atrPriceRatio: atr / currentPrice,
        };

        const estimatedWinRate = model
          ? model.predict(features)
          : estimateWinProbabilityHeuristic(features);

        // Price Targets & Stops
        const stopDistance = Math.max(currentPrice * 0.008, atr * 1.5);
        const proposedStop = +(currentPrice - stopDistance).toFixed(2);
        const t1 = +(currentPrice + atr * thresholds.RATCHET_STAGE_2_ATR).toFixed(2); // +1.40 ATR
        const dynamicTpMultiplier =
          hurstRes.hurst >= thresholds.HURST_SUPER_TREND_THRESHOLD
            ? thresholds.RATCHET_STAGE_3_ATR * 1.20
            : thresholds.RATCHET_STAGE_3_ATR;
        const t2 = +(currentPrice + atr * dynamicTpMultiplier).toFixed(2);

        const rewardRiskRatio = (t1 - currentPrice) / (currentPrice - proposedStop);

        // Scenario 10: Half-Kelly Volatility-Adaptive Position Sizing
        const kelly = calculateHalfKellyFraction(
          estimatedWinRate,
          rewardRiskRatio,
          thresholds.MAX_KELLY_SIZE_MULTIPLIER,
          thresholds.MIN_KELLY_SIZE_MULTIPLIER,
          features.atrPriceRatio
        );

        const positionNotional = Math.min(
          capital * thresholds.MAX_SECTOR_ALLOCATION_PCT,
          capital * Math.max(0.15, kelly.recommendedSizeMultiplier)
        );
        const proposedUnits = Math.max(1, Math.floor(positionNotional / currentPrice));

        // Scenario 1: Pre-Trade TCA Hurdle Check
        const expectedProfit = (t2 - currentPrice) * proposedUnits;
        const friction = calculateRoundtripFriction(currentPrice, proposedUnits, isDelivery);

        if (!passesFrictionHurdle(expectedProfit, friction.totalRoundtripFriction, frictionMultiple)) {
          frictionHurdleRejections++;
          continue;
        }

        // Queue order for next-bar execution delay
        pendingOrder = {
          entryPrice: currentPrice,
          stop: proposedStop,
          t1,
          t2,
          qty: proposedUnits,
          friction,
          features,
        };
      }
    }
  }

  // Calculate aggregate performance metrics
  const winningTrades = trades.filter((t) => t.netProfit > 0).length;
  const losingTrades = trades.filter((t) => t.netProfit < 0).length;
  const breakevenTrades = trades.filter((t) => t.netProfit === 0).length;
  const grossPnl = +trades.reduce((sum, t) => sum + t.grossProfit, 0).toFixed(2);
  const totalFrictionPaid = +trades.reduce((sum, t) => sum + t.friction, 0).toFixed(2);
  const netPnl = +trades.reduce((sum, t) => sum + t.netProfit, 0).toFixed(2);
  const winRatePct = trades.length > 0 ? +((winningTrades / trades.length) * 100).toFixed(1) : 0;

  const grossGains = trades.filter((t) => t.netProfit > 0).reduce((s, t) => s + t.netProfit, 0);
  const grossLosses = Math.abs(trades.filter((t) => t.netProfit < 0).reduce((s, t) => s + t.netProfit, 0));
  const profitFactor = grossLosses > 0 ? +(grossGains / grossLosses).toFixed(2) : grossGains > 0 ? 99.0 : 0;

  // Annualized Sharpe Ratio
  const returns = trades.map((t) => t.netProfit / (t.entryPrice * t.quantity));
  const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const varReturn =
    returns.length > 1
      ? returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / (returns.length - 1)
      : 0;
  const stdReturn = Math.sqrt(varReturn);
  const sharpeRatio = stdReturn > 0 ? +((meanReturn / stdReturn) * Math.sqrt(252)).toFixed(2) : 0;

  return {
    regime: regimeLabel,
    totalBars: candles.length,
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    breakevenTrades,
    winRatePct,
    grossPnl,
    totalFrictionPaid,
    netPnl,
    profitFactor,
    maxDrawdownPct: +maxDrawdown.toFixed(2),
    sharpeRatio,
    frictionHurdleRejections,
    trades,
    tradeSamples,
  };
}
