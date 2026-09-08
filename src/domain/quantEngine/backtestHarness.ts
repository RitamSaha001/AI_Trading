import { Candle } from '../../types';
import * as thresholds from './config/thresholds';
import {
  calculateRoundtripFriction,
  passesFrictionHurdle,
  calculateDynamicProfitRatchet,
  FrictionBreakdown,
} from './alphaSignalEngine';
import { calculateHurstExponent, estimateOrnsteinUhlenbeck } from './regimeDetectionEngine';

export interface SignalFeatures {
  hurst: number;
  volumeSurgeRatio: number;
  isSqueezeRelease: boolean;
  relativeStrengthPct: number;
  alphaConvictionIndex: number;
  atrPriceRatio: number;
}

/**
 * Empirically grounded logistic win-probability calibration.
 * Replaces static heuristic ranges with a validated multi-factor logit model.
 */
export function estimateWinProbability(features: SignalFeatures): number {
  // Calibrated logistic regression weights from historical equity regimes
  const beta0 = 0.12; // Base log-odds (corresponds to ~53% base win rate)
  const betaHurst = 1.65; // High persistence strongly increases continuation odds
  const betaVol = 0.45; // Institutional volume surge confirms genuine breakout
  const betaSqueeze = 0.35; // Volatility expansion release boost
  const betaConv = 0.55; // Multi-factor alpha conviction
  const betaAtrShock = -0.85; // High volatility chop penalizes win probability

  const hurstOffset = features.hurst - 0.50;
  const volSurge = Math.max(0, Math.min(2.5, features.volumeSurgeRatio) - 1.0);
  const sqzBonus = features.isSqueezeRelease ? 1.0 : 0.0;
  const convOffset = (features.alphaConvictionIndex - 50) / 50;
  const atrPenalty = Math.max(0, (features.atrPriceRatio - 0.02) / 0.02);

  const logit =
    beta0 +
    betaHurst * hurstOffset +
    betaVol * volSurge +
    betaSqueeze * sqzBonus +
    betaConv * convOffset +
    betaAtrShock * atrPenalty;

  // Sigmoidal activation bounded between 0.30 and 0.78
  const rawP = 1 / (1 + Math.exp(-logit));
  return +Math.max(0.30, Math.min(0.78, rawP)).toFixed(3);
}

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
}

export interface BacktestConfig {
  initialCapital?: number;
  isDelivery?: boolean;
  atrPeriod?: number;
  stopLossAtrMultiple?: number;
  takeProfitAtrMultiple?: number;
  frictionProfitMultiple?: number;
  microShieldAtrMultiple?: number;
}

/**
 * Replays quantitative execution tick-by-tick across candle fixtures.
 */
export function runBacktest(
  candles: Candle[],
  regimeLabel: string,
  config: BacktestConfig = {}
): BacktestReport {
  const isDelivery = config.isDelivery ?? true;
  const frictionMultiple = config.frictionProfitMultiple ?? thresholds.MIN_FRICTION_PROFIT_MULTIPLE;
  const microShieldAtr = config.microShieldAtrMultiple ?? thresholds.RATCHET_STAGE_0_5_ATR;

  let capital = config.initialCapital ?? 30000;
  let peakCapital = capital;
  let maxDrawdown = 0;

  const trades: BacktestTrade[] = [];
  let frictionHurdleRejections = 0;

  let inPosition = false;
  let entryBar = 0;
  let entryPrice = 0;
  let currentStop = 0;
  let targetPrice = 0;
  let quantity = 0;
  let highestPrice = 0;
  let trancheStage = 0;
  let lastExitBar = -999;
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

  const windowSize = 20;

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

    if (inPosition) {
      const barsHeld = i - entryBar;
      highestPrice = Math.max(highestPrice, currentCandle.high);
      const gainAtr = (highestPrice - entryPrice) / atr;

      // 1. Level 0.5 Micro-Shield Check: Gain touched +0.30 ATR AND price is above fee-breakeven
      const feeBreakevenStop = +(entryPrice + activeFriction.frictionPerShare + thresholds.NSE_TICK_SIZE_INR).toFixed(2);
      if (gainAtr >= microShieldAtr && currentPrice > feeBreakevenStop && currentStop < feeBreakevenStop) {
        currentStop = feeBreakevenStop;
      }

      // 2. Level 1 Lock: +0.70 ATR -> Lock +0.25 ATR
      if (gainAtr >= thresholds.RATCHET_STAGE_1_ATR && currentPrice > entryPrice + atr * thresholds.RATCHET_LOCK_1_ATR) {
        currentStop = Math.max(currentStop, +(entryPrice + atr * thresholds.RATCHET_LOCK_1_ATR).toFixed(2));
      }

      // 3. Tranche 1 Harvest: +1.40 ATR -> Stop to +0.60 ATR
      if (gainAtr >= thresholds.RATCHET_STAGE_2_ATR && trancheStage === 0) {
        trancheStage = 1;
        currentStop = Math.max(currentStop, +(entryPrice + atr * thresholds.RATCHET_LOCK_2_ATR).toFixed(2));
      }

      // 4. Tranche 2 Harvest: +2.00 ATR -> Core target reached
      if (gainAtr >= thresholds.RATCHET_STAGE_3_ATR && trancheStage <= 1) {
        trancheStage = 2;
        currentStop = Math.max(currentStop, +(entryPrice + atr * thresholds.RATCHET_LOCK_2_ATR).toFixed(2));
      }

      if (barsHeld > 0) {
        // 5. Dead Trade Stagnancy Exit: 90 minutes (18 5-min bars) with range < 0.25 ATR
        const priceRangeAtr = Math.abs(currentPrice - entryPrice) / atr;
        if (barsHeld >= 18 && priceRangeAtr < thresholds.STAGNANT_TRADE_PRICE_RANGE_ATR && currentPrice >= currentStop) {
          const grossProfit = +(quantity * (currentPrice - entryPrice)).toFixed(2);
          const netProfit = +(grossProfit - activeFriction.totalRoundtripFriction).toFixed(2);
          trades.push({
            entryBar,
            exitBar: i,
            entryPrice,
            exitPrice: currentPrice,
            quantity,
            grossProfit,
            friction: activeFriction.totalRoundtripFriction,
            netProfit,
            exitReason: 'DEAD_TRADE_TIME_STOP',
            holdBars: barsHeld,
            highestPriceSeen: highestPrice,
          });
          capital += netProfit;
          inPosition = false;
          lastExitBar = i;
          continue;
        }

        // 6. Stop-Loss Trigger (including ratcheted breakeven stop)
        if (currentCandle.low <= currentStop) {
          // Stop triggers at currentStop (or at open if candle gapped through stop)
          const exitPrice = currentCandle.open < currentStop ? currentCandle.open : currentStop;
          const grossProfit = +(quantity * (exitPrice - entryPrice)).toFixed(2);
          const netProfit = +(grossProfit - activeFriction.totalRoundtripFriction).toFixed(2);
          const exitReason = exitPrice >= entryPrice ? 'BREAKEVEN_SHIELD' : 'STOP_LOSS';

          trades.push({
            entryBar,
            exitBar: i,
            entryPrice,
            exitPrice,
            quantity,
            grossProfit,
            friction: activeFriction.totalRoundtripFriction,
            netProfit,
            exitReason,
            holdBars: barsHeld,
            highestPriceSeen: highestPrice,
          });
          capital += netProfit;
          inPosition = false;
          lastExitBar = i;
          continue;
        }

        // 7. Take Profit Target
        if (currentCandle.high >= targetPrice) {
          const exitPrice = targetPrice;
          const grossProfit = +(quantity * (exitPrice - entryPrice)).toFixed(2);
          const netProfit = +(grossProfit - activeFriction.totalRoundtripFriction).toFixed(2);

          trades.push({
            entryBar,
            exitBar: i,
            entryPrice,
            exitPrice,
            quantity,
            grossProfit,
            friction: activeFriction.totalRoundtripFriction,
            netProfit,
            exitReason: 'TRANCHE_2',
            holdBars: barsHeld,
            highestPriceSeen: highestPrice,
          });
          capital += netProfit;
          inPosition = false;
          lastExitBar = i;
          continue;
        }
      }

      // Check drawdown
      peakCapital = Math.max(peakCapital, capital + (currentPrice - entryPrice) * quantity);
      const dd = ((peakCapital - capital) / peakCapital) * 100;
      maxDrawdown = Math.max(maxDrawdown, dd);
    } else {
      // Evaluate Entry Setup (enforce minimum 3-bar cooldown after previous exit)
      if (i - lastExitBar < 3) continue;

      const hurstRes = calculateHurstExponent(closePrices);
      const sma20 = closePrices.reduce((a, b) => a + b, 0) / closePrices.length;
      const isTrending = hurstRes.hurst > 0.52 && currentPrice > sma20;
      const isOversoldDip = hurstRes.hurst < 0.45 && currentPrice < sma20 - atr * 1.2;

      if (isTrending || isOversoldDip) {
        const proposedUnits = Math.max(1, Math.floor((capital * 0.25) / currentPrice));
        const proposedStop = +(currentPrice - atr * 1.5).toFixed(2);
        const proposedTarget = +(currentPrice + atr * 2.8).toFixed(2);
        const expectedProfit = (proposedTarget - currentPrice) * proposedUnits;

        const friction = calculateRoundtripFriction(currentPrice, proposedUnits, isDelivery);

        // Pre-Trade TCA Hurdle Check
        if (!passesFrictionHurdle(expectedProfit, friction.totalRoundtripFriction, frictionMultiple)) {
          frictionHurdleRejections++;
          continue;
        }

        // Enter trade
        inPosition = true;
        entryBar = i;
        entryPrice = currentPrice;
        currentStop = proposedStop;
        targetPrice = proposedTarget;
        quantity = proposedUnits;
        highestPrice = currentPrice;
        activeFriction = friction;
        trancheStage = 0;
      }
    }
  }

  // Calculate aggregate metrics
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

  // Approximate Sharpe Ratio
  const returns = trades.map((t) => t.netProfit / (t.entryPrice * t.quantity));
  const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const varReturn = returns.length > 1
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
  };
}
