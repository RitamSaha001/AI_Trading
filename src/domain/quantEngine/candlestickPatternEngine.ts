import { Candle } from '../../types';

export type CandlestickPatternType =
  | 'BULLISH_PINBAR'
  | 'BEARISH_PINBAR'
  | 'BULLISH_ENGULFING'
  | 'BEARISH_ENGULFING'
  | 'INSIDE_BAR_BREAKOUT'
  | 'THREE_BAR_THRUST'
  | 'NONE';

export interface CandleMicrostructure {
  range: number;
  body: number;
  upperShadow: number;
  lowerShadow: number;
  bodyRatio: number;
  upperShadowRatio: number;
  lowerShadowRatio: number;
  isBullish: boolean;
  isDoji: boolean;
}

export interface OrderFlowDeltaProxy {
  recentBuyingVolume: number;
  recentSellingVolume: number;
  cumulativeDelta: number;
  deltaRatio: number; // > 1.0 indicates net aggressive buying
  flowInterpretation: string;
}

export interface CandlePriceActionResult {
  isActionSignal: boolean;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  pattern: CandlestickPatternType;
  convictionBonus: number; // +5 to +15 ACI
  limitPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  takeProfit2Price: number;
  rationale: string;
  orderFlow: OrderFlowDeltaProxy;
}

/**
 * Computes detailed geometric microstructure metrics of a single candle bar.
 */
export function extractCandleMicrostructure(candle: Candle): CandleMicrostructure {
  const range = Math.max(0.001, candle.high - candle.low);
  const body = Math.abs(candle.close - candle.open);
  const upperShadow = candle.high - Math.max(candle.open, candle.close);
  const lowerShadow = Math.min(candle.open, candle.close) - candle.low;

  const bodyRatio = body / range;
  const upperShadowRatio = upperShadow / range;
  const lowerShadowRatio = lowerShadow / range;
  const isBullish = candle.close >= candle.open;
  const isDoji = bodyRatio < 0.10;

  return {
    range,
    body,
    upperShadow,
    lowerShadow,
    bodyRatio,
    upperShadowRatio,
    lowerShadowRatio,
    isBullish,
    isDoji,
  };
}

/**
 * Estimates intraday order flow imbalance and net aggressor volume delta
 * from 1-minute OHLCV candles using price position within the bar.
 */
export function calculateOrderFlowDelta(candles: Candle[], lookback = 10): OrderFlowDeltaProxy {
  if (!candles || candles.length === 0) {
    return {
      recentBuyingVolume: 0,
      recentSellingVolume: 0,
      cumulativeDelta: 0,
      deltaRatio: 1.0,
      flowInterpretation: 'Neutral order flow (no data).',
    };
  }

  const slice = candles.slice(-lookback);
  let totalBuyVol = 0;
  let totalSellVol = 0;

  for (const c of slice) {
    const range = c.high - c.low;
    if (range <= 0) {
      totalBuyVol += c.volume * 0.5;
      totalSellVol += c.volume * 0.5;
      continue;
    }

    // Weight volume towards buyers when closing near high, sellers when closing near low
    const buyFrac = Math.max(0, Math.min(1, (c.close - c.low) / range));
    const sellFrac = 1.0 - buyFrac;

    totalBuyVol += c.volume * buyFrac;
    totalSellVol += c.volume * sellFrac;
  }

  const cumulativeDelta = totalBuyVol - totalSellVol;
  const deltaRatio = totalSellVol > 0 ? totalBuyVol / totalSellVol : 1.0;

  let flowInterpretation = 'Balanced order flow';
  if (deltaRatio >= 1.6) {
    flowInterpretation = 'Aggressive institutional buying absorption (+60% delta)';
  } else if (deltaRatio <= 0.625) {
    flowInterpretation = 'Heavy aggressive selling liquidation (-60% delta)';
  } else if (deltaRatio > 1.15) {
    flowInterpretation = 'Mild buying pressure';
  } else if (deltaRatio < 0.85) {
    flowInterpretation = 'Mild selling pressure';
  }

  return {
    recentBuyingVolume: Math.round(totalBuyVol),
    recentSellingVolume: Math.round(totalSellVol),
    cumulativeDelta: Math.round(cumulativeDelta),
    deltaRatio: +deltaRatio.toFixed(2),
    flowInterpretation,
  };
}

/**
 * Evaluates high-conviction candlestick price action patterns in context of VWAP and ATR.
 */
export function evaluateCandlePriceAction(
  candles: Candle[] | undefined,
  currentPrice: number,
  vwap: number,
  atr: number,
  volumeSurgeRatio: number,
  nowTimestamp: number
): CandlePriceActionResult {
  const defaultRes: CandlePriceActionResult = {
    isActionSignal: false,
    direction: 'NEUTRAL',
    pattern: 'NONE',
    convictionBonus: 0,
    limitPrice: currentPrice,
    stopLossPrice: 0,
    takeProfitPrice: 0,
    takeProfit2Price: 0,
    rationale: 'No candlestick price action pattern confirmed.',
    orderFlow: {
      recentBuyingVolume: 0,
      recentSellingVolume: 0,
      cumulativeDelta: 0,
      deltaRatio: 1.0,
      flowInterpretation: 'Neutral',
    },
  };

  // Require at least 20 intraday candles (09:35+ IST) to avoid early auction noise
  if (!candles || candles.length < 20) return defaultRes;

  const orderFlow = calculateOrderFlowDelta(candles, 10);
  const n = candles.length;
  const curr = candles[n - 1];
  const prev = candles[n - 2];
  const prev2 = n >= 3 ? candles[n - 3] : null;

  const microCurr = extractCandleMicrostructure(curr);
  const microPrev = extractCandleMicrostructure(prev);

  // 1. Bullish Pinbar / Hammer Rejection at Key Levels
  // - Long lower shadow (>= 55% of range), small body at top (<= 35%), close near high
  // - Occurs at or near VWAP (within 0.35%) or testing intraday low
  const isBullishPinbar =
    microCurr.lowerShadowRatio >= 0.55 &&
    microCurr.bodyRatio <= 0.35 &&
    curr.close >= (curr.low + microCurr.range * 0.60);

  if (isBullishPinbar && vwap > 0 && curr.low <= vwap * 1.002 && curr.close >= vwap * 0.998) {
    const sl = Math.min(curr.low - atr * 0.20, currentPrice - atr * 0.65);
    const tp1 = currentPrice + atr * 1.20;
    const tp2 = currentPrice + atr * 2.00;
    return {
      isActionSignal: true,
      direction: 'LONG',
      pattern: 'BULLISH_PINBAR',
      convictionBonus: 10,
      limitPrice: currentPrice,
      stopLossPrice: +sl.toFixed(2),
      takeProfitPrice: +tp1.toFixed(2),
      takeProfit2Price: +tp2.toFixed(2),
      rationale: `Bullish Pinbar Rejection at VWAP: Lower wick ${(microCurr.lowerShadowRatio * 100).toFixed(0)}% rejected lower prices. Order flow delta: ${orderFlow.deltaRatio}x.`,
      orderFlow,
    };
  }

  // 2. Bullish Engulfing with Volume Confirmation
  // - Previous candle was bearish, current candle is strong bullish engulfing previous real body
  // - Volume surge >= 1.15x
  const isBullishEngulfing =
    !microPrev.isBullish &&
    microCurr.isBullish &&
    curr.open <= prev.close * 1.001 &&
    curr.close >= prev.open * 0.999 &&
    microCurr.body > microPrev.body * 1.05 &&
    volumeSurgeRatio >= 1.15 &&
    curr.close >= (curr.low + microCurr.range * 0.65);

  if (isBullishEngulfing && (vwap === 0 || currentPrice >= vwap * 0.998)) {
    const sl = Math.min(curr.low - atr * 0.15, currentPrice - atr * 0.75);
    const tp1 = currentPrice + atr * 1.30;
    const tp2 = currentPrice + atr * 2.20;
    return {
      isActionSignal: true,
      direction: 'LONG',
      pattern: 'BULLISH_ENGULFING',
      convictionBonus: 12,
      limitPrice: currentPrice,
      stopLossPrice: +sl.toFixed(2),
      takeProfitPrice: +tp1.toFixed(2),
      takeProfit2Price: +tp2.toFixed(2),
      rationale: `Bullish Engulfing Impulse: Volume ${volumeSurgeRatio.toFixed(2)}x surge engulfing prior bar body. Aggressive buyer absorption confirmed.`,
      orderFlow,
    };
  }

  // 3. Inside Bar Momentum Breakout
  // - Previous bar is inside bar of prev2
  // - Current bar breaks above prev2 high with volume expansion
  if (prev2) {
    const isInsideBar = prev.high <= prev2.high && prev.low >= prev2.low;
    const breaksHigh = currentPrice > prev2.high && curr.close > prev2.high;

    if (isInsideBar && breaksHigh && volumeSurgeRatio >= 1.10 && (vwap === 0 || currentPrice >= vwap * 0.999)) {
      const sl = Math.min(prev.low - atr * 0.10, currentPrice - atr * 0.70);
      const tp1 = currentPrice + atr * 1.25;
      const tp2 = currentPrice + atr * 2.10;
      return {
        isActionSignal: true,
        direction: 'LONG',
        pattern: 'INSIDE_BAR_BREAKOUT',
        convictionBonus: 8,
        limitPrice: currentPrice,
        stopLossPrice: +sl.toFixed(2),
        takeProfitPrice: +tp1.toFixed(2),
        takeProfit2Price: +tp2.toFixed(2),
        rationale: `Inside Bar Coiling Breakout: Volatility compression breakout above ₹${prev2.high.toFixed(2)} with volume expansion.`,
        orderFlow,
      };
    }
  }

  // 4. Three-Bar Momentum Thrust
  // - 3 consecutive bullish bars with higher highs and higher closes
  // - Order flow delta ratio >= 1.35x
  if (prev2) {
    const microPrev2 = extractCandleMicrostructure(prev2);
    const is3Thrust =
      microPrev2.isBullish &&
      microPrev.isBullish &&
      microCurr.isBullish &&
      curr.close > prev.close &&
      prev.close > prev2.close &&
      curr.high > prev.high &&
      orderFlow.deltaRatio >= 1.35;

    if (is3Thrust && (vwap === 0 || currentPrice >= vwap * 1.001)) {
      const sl = currentPrice - atr * 0.75;
      const tp1 = currentPrice + atr * 1.35;
      const tp2 = currentPrice + atr * 2.25;
      return {
        isActionSignal: true,
        direction: 'LONG',
        pattern: 'THREE_BAR_THRUST',
        convictionBonus: 10,
        limitPrice: currentPrice,
        stopLossPrice: +sl.toFixed(2),
        takeProfitPrice: +tp1.toFixed(2),
        takeProfit2Price: +tp2.toFixed(2),
        rationale: `Three-Bar Bullish Thrust: Sustained micro-momentum with order flow delta ratio ${orderFlow.deltaRatio}x.`,
        orderFlow,
      };
    }
  }

  return defaultRes;
}
