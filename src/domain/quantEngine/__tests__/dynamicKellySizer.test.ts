import { describe, it, expect } from 'vitest';
import { DynamicKellySizer, TradeOutcome } from '../dynamicKellySizer';

describe('Dynamic Fractional Kelly & Volatility-Targeted Position Sizer', () => {
  it('calculates expected quantity pegged to 0.75% portfolio risk', () => {
    const nav = 40_000;
    const entryPrice = 1000;
    const stopLossPrice = 985; // Stop distance = 15
    // 0.75% of 40,000 = ₹300 risk budget
    // Expected quantity = floor(300 / 15) = 20 shares (scaled by kelly factor)

    const result = DynamicKellySizer.calculate(nav, entryPrice, stopLossPrice);
    expect(result.recommendedQuantity).toBeGreaterThanOrEqual(15);
    expect(result.recommendedQuantity).toBeLessThanOrEqual(25);
    expect(result.positionNotional).toBe(result.recommendedQuantity * entryPrice);
    expect(result.actualRiskPct).toBeGreaterThanOrEqual(0.50);
    expect(result.actualRiskPct).toBeLessThanOrEqual(1.20);
  });

  it('adjusts Half-Kelly fraction dynamically based on rolling win rate and payoff ratio', () => {
    const nav = 40_000;
    const entryPrice = 500;
    const stopLossPrice = 495; // Stop dist = 5

    // High performing history: 75% win rate, 2:1 payoff
    const highWinTrades: TradeOutcome[] = [];
    for (let i = 0; i < 20; i++) {
      if (i % 4 !== 0) {
        highWinTrades.push({ pnl: 200, isWin: true });
      } else {
        highWinTrades.push({ pnl: -100, isWin: false });
      }
    }

    const highResult = DynamicKellySizer.calculate(nav, entryPrice, stopLossPrice, highWinTrades);
    expect(highResult.rollingWinRate).toBe(75.0);
    expect(highResult.kellyFraction).toBeGreaterThanOrEqual(0.25);

    // Choppy/losing history: 40% win rate
    const poorTrades: TradeOutcome[] = [];
    for (let i = 0; i < 20; i++) {
      if (i % 5 === 0) {
        poorTrades.push({ pnl: 150, isWin: true });
      } else {
        poorTrades.push({ pnl: -100, isWin: false });
      }
    }

    const poorResult = DynamicKellySizer.calculate(nav, entryPrice, stopLossPrice, poorTrades);
    expect(poorResult.rollingWinRate).toBe(20.0);
    // Kelly fraction scales down to safety floor
    expect(poorResult.kellyFraction).toBeLessThanOrEqual(0.15);
    expect(poorResult.recommendedQuantity).toBeLessThan(highResult.recommendedQuantity);
  });

  it('respects maximum single-position notional constraint (1.5x NAV)', () => {
    const nav = 40_000;
    const entryPrice = 100;
    const stopLossPrice = 99.95; // Extremely tight stop dist (0.05) which could otherwise demand 6000+ shares

    const result = DynamicKellySizer.calculate(nav, entryPrice, stopLossPrice);
    // Max notional is capped at 1.5 * 40k = 60,000 INR
    expect(result.positionNotional).toBeLessThanOrEqual(60_000);
    expect(result.recommendedQuantity).toBeLessThanOrEqual(600);
  });
});
