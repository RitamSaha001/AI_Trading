import { describe, it, expect } from 'vitest';
import { calculateRiskBasedPositionSize } from './positionSizing';
import { DEFAULT_RISK_POLICY } from './riskPolicy';

describe('Domain: Risk-Based Position Sizing Engine', () => {
  it('calculates position size strictly from risk budget and stop-loss distance', () => {
    // Equity: $100,000, 2% risk budget = $2,000
    // Entry: $100, Stop: $90 -> Unit Risk: $10
    // Raw Quantity: 2,000 / 10 = 200 units ($20,000 notional, 20% of equity)
    const res = calculateRiskBasedPositionSize({
      asset: 'SOL',
      side: 'buy',
      entryPrice: 100,
      stopPrice: 90,
      targetPrice: 125,
      portfolioEquity: 100000,
      availableCash: 50000,
      currentHolding: 0,
      currentHoldingNotional: 0,
    });

    expect(res.quantity).toBe(200);
    expect(res.notional).toBe(20000);
    expect(res.portfolioPct).toBe(20);
    expect(res.riskBudget).toBe(2000);
    expect(res.unitRisk).toBe(10);
    expect(res.theoreticalMaxLoss).toBe(2000);
    expect(res.riskRewardRatio).toBe(2.5); // (125-100)/(100-90) = 2.5
    expect(res.constrainedBy).toContain('risk_budget');
  });

  it('bounds buy order quantity when available liquid cash is constrained', () => {
    // Equity: $100,000, Cash: $20,000. Min Cash reserve 15% ($15,000). Usable cash: ~$5,000
    // Entry: $100, Stop: $95 -> Unit risk: $5 -> Raw size: 2,000 / 5 = 400 units ($40,000 notional)
    // But usable cash is only ~$5,000 -> must constrain to ~50 units
    const res = calculateRiskBasedPositionSize({
      asset: 'SOL',
      side: 'buy',
      entryPrice: 100,
      stopPrice: 95,
      portfolioEquity: 100000,
      availableCash: 20000,
      currentHolding: 0,
      currentHoldingNotional: 0,
    });

    expect(res.quantity).toBeLessThanOrEqual(50);
    expect(res.notional).toBeLessThanOrEqual(5000);
    expect(res.constrainedBy).toContain('available_cash');
  });

  it('bounds buy order when asset concentration would exceed the 50% cap', () => {
    // Equity: $100,000. Current SOL holding: $45,000 (45%). Cap is 50% ($50,000).
    // Remaining capacity: $5,000 (50 units at $100).
    // Risk budget allows 200 units, but concentration allows only 50 units.
    const res = calculateRiskBasedPositionSize({
      asset: 'SOL',
      side: 'buy',
      entryPrice: 100,
      stopPrice: 90,
      portfolioEquity: 100000,
      availableCash: 50000,
      currentHolding: 450,
      currentHoldingNotional: 45000,
    });

    expect(res.quantity).toBeLessThanOrEqual(50);
    expect(res.notional).toBeLessThanOrEqual(5000);
    expect(res.constrainedBy).toContain('single_asset_cap');
  });

  it('caps order size when exceeding single trade cap (40% of equity)', () => {
    // Equity: $10,000. Stop is super close: $100 entry, $99.90 stop. Unit risk: $0.10.
    // Raw size: $200 / $0.10 = 2,000 units = $200,000 (2,000% of equity!)
    // Order cap is 40% = $4,000 = 40 units
    const res = calculateRiskBasedPositionSize({
      asset: 'SOL',
      side: 'buy',
      entryPrice: 100,
      stopPrice: 99.90,
      portfolioEquity: 10000,
      availableCash: 10000,
      currentHolding: 0,
      currentHoldingNotional: 0,
    });

    expect(res.notional).toBeLessThanOrEqual(4000);
    expect(res.constrainedBy).toContain('single_order_cap');
  });

  it('bounds sell order by currently available position quantity', () => {
    const res = calculateRiskBasedPositionSize({
      asset: 'SOL',
      side: 'sell',
      entryPrice: 100,
      stopPrice: 110,
      portfolioEquity: 50000,
      availableCash: 10000,
      currentHolding: 15,
      currentHoldingNotional: 1500,
    });

    expect(res.quantity).toBeLessThanOrEqual(15);
    expect(res.constrainedBy).toContain('available_holding');
  });

  it('enforces minimum order size ($10 notional)', () => {
    // Very small equity ($100), tiny risk budget ($2)
    const res = calculateRiskBasedPositionSize({
      asset: 'SOL',
      side: 'buy',
      entryPrice: 100,
      stopPrice: 90,
      portfolioEquity: 100,
      availableCash: 80,
      currentHolding: 0,
      currentHoldingNotional: 0,
    });

    expect(res.notional).toBeGreaterThanOrEqual(10);
  });

  it('safely rejects invalid or zero entry prices without fake fallback', () => {
    const resZero = calculateRiskBasedPositionSize({
      asset: 'BTC',
      side: 'buy',
      entryPrice: 0,
      portfolioEquity: 50000,
      availableCash: 25000,
      currentHolding: 0,
      currentHoldingNotional: 0,
    });
    expect(resZero.quantity).toBe(0);
    expect(resZero.constrainedBy).toContain('invalid_price');
    expect(resZero.rationale).toMatch(/REJECTED.*Invalid or zero entry price/i);

    const resNegative = calculateRiskBasedPositionSize({
      asset: 'BTC',
      side: 'buy',
      entryPrice: -500,
      portfolioEquity: 50000,
      availableCash: 25000,
      currentHolding: 0,
      currentHoldingNotional: 0,
    });
    expect(resNegative.quantity).toBe(0);
    expect(resNegative.constrainedBy).toContain('invalid_price');
  });

  it('zeros out order if min size bump would violate asset concentration cap', () => {
    // Portfolio is $100. Min order is $10. But asset cap is 50% = $50.
    // If user already holds $48 of the asset, adding $10 = $58 (58% > 50%), so boundedQty must be 0!
    const res = calculateRiskBasedPositionSize({
      asset: 'SOL',
      side: 'buy',
      entryPrice: 100,
      portfolioEquity: 100,
      availableCash: 50,
      currentHolding: 0.48,
      currentHoldingNotional: 48,
    });
    expect(res.quantity).toBe(0);
  });

  it('uses dynamic ATR-based stop loss calculation when stopPrice is not provided', () => {
    const candles = Array.from({ length: 20 }, (_, i) => ({
      time: Date.now() - (20 - i) * 60000,
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 100 + i,
      volume: 1000,
    }));
    const mockMarket = {
      asset: 'SOL' as const,
      price: 100,
      history: Array.from({ length: 20 }, (_, i) => 100 + i),
      candles,
    };

    const res = calculateRiskBasedPositionSize({
      asset: 'SOL',
      side: 'buy',
      entryPrice: 100,
      portfolioEquity: 50000,
      availableCash: 20000,
      currentHolding: 0,
      currentHoldingNotional: 0,
      market: mockMarket as any,
    });

    expect(res.stopPrice).toBeLessThan(100);
    expect(res.stopPrice).toBeGreaterThan(0);
    expect(res.targetPrice).toBeGreaterThan(100);
    expect(res.quantity).toBeGreaterThan(0);
  });

  it('allows complete liquidation of dust holdings (< $10) on sell orders', () => {
    // Current holding is 0.05 SOL at $100 = $5.00 notional (< $10 min order)
    const res = calculateRiskBasedPositionSize({
      asset: 'SOL',
      side: 'sell',
      entryPrice: 100,
      portfolioEquity: 50000,
      availableCash: 10000,
      currentHolding: 0.05,
      currentHoldingNotional: 5,
    });

    // Should liquidate all available dust (0.05 units)
    expect(res.quantity).toBe(0.05);
    expect(res.notional).toBe(5);
  });

  it('zeros out order if min size bump would violate max trade risk budget', () => {
    // Equity is $100. Max trade risk is 2% = $2.00.
    // Entry: $100, Stop: $50 (Unit risk: $50).
    // Min order notional: $10.00 -> minQty = 0.1 units.
    // Min trade risk = 0.1 * $50 = $5.00 > $2.00 risk budget!
    const res = calculateRiskBasedPositionSize({
      asset: 'SOL',
      side: 'buy',
      entryPrice: 100,
      stopPrice: 50,
      portfolioEquity: 100,
      availableCash: 50,
      currentHolding: 0,
      currentHoldingNotional: 0,
    });
    expect(res.quantity).toBe(0);
  });
});
