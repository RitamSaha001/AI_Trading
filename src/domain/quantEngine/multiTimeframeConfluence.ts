import { Candle, Market } from '../../types';

export interface MultiTimeframeConfluenceResult {
  isAligned: boolean;
  alignmentScore: number; // 0 to 100
  macroTrendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  microMomentumDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  rationale: string;
}

/**
 * Multi-Timeframe Alignment Engine.
 * Synthesizes 30-minute institutional macro trend with 1-minute execution microstructure.
 */
export function evaluateMultiTimeframeConfluence(
  market: Market | undefined,
  currentPrice: number,
  vwap: number,
  atr: number,
  hurst: number
): MultiTimeframeConfluenceResult {
  if (!market || !market.history || market.history.length < 10) {
    return {
      isAligned: true,
      alignmentScore: 60,
      macroTrendDirection: 'NEUTRAL',
      microMomentumDirection: 'NEUTRAL',
      rationale: 'Default neutral confluence (limited history).',
    };
  }

  const hist = market.history;
  const len = hist.length;

  // 30-minute Macro Moving Averages
  const sma10 = hist.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const sma20 = len >= 20 ? hist.slice(-20).reduce((a, b) => a + b, 0) / 20 : sma10;
  const isAboveSma10 = currentPrice >= sma10;
  const isAboveSma20 = currentPrice >= sma20;
  const isSma10Above20 = sma10 >= sma20;

  let macroTrendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (isAboveSma10 && isAboveSma20 && isSma10Above20) {
    macroTrendDirection = 'BULLISH';
  } else if (!isAboveSma10 && !isAboveSma20 && !isSma10Above20) {
    macroTrendDirection = 'BEARISH';
  }

  // Microstructure Check on Recent 1-minute Candles (if available)
  let microMomentumDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  const candles = market.candles || [];
  if (candles.length >= 3) {
    const last3 = candles.slice(-3);
    const greenCount = last3.filter((c) => c && c.close >= c.open).length;
    const redCount = last3.filter((c) => c && c.close < c.open).length;
    if (greenCount === 3) microMomentumDirection = 'BULLISH';
    else if (redCount === 3) microMomentumDirection = 'BEARISH';
    else if (greenCount >= 2 && currentPrice >= vwap) microMomentumDirection = 'BULLISH';
    else if (redCount >= 2 && currentPrice < vwap) microMomentumDirection = 'BEARISH';
  } else {
    microMomentumDirection = macroTrendDirection;
  }

  // Calculate Alignment Score (0 to 100)
  let alignmentScore = 50;

  // 1. Macro trend alignment (+/- 25 pts)
  if (macroTrendDirection === 'BULLISH') alignmentScore += 20;
  else if (macroTrendDirection === 'BEARISH') alignmentScore -= 20;

  // 2. Hurst trend persistence (+/- 15 pts)
  if (hurst >= 0.55) alignmentScore += 15;
  else if (hurst <= 0.45) alignmentScore -= 10;

  // 3. VWAP structure support (+/- 15 pts)
  if (vwap > 0 && currentPrice >= vwap) alignmentScore += 15;
  else if (vwap > 0 && currentPrice < vwap) alignmentScore -= 15;

  alignmentScore = Math.max(0, Math.min(100, alignmentScore));

  const isAligned = alignmentScore >= 60;
  const rationale = `MTF Alignment (${alignmentScore}/100): 30m Macro ${macroTrendDirection}, Micro ${microMomentumDirection}, Hurst ${hurst.toFixed(2)}.`;

  return {
    isAligned,
    alignmentScore,
    macroTrendDirection,
    microMomentumDirection,
    rationale,
  };
}
