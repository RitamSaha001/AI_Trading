/**
 * Dynamic Fractional Kelly & Volatility-Targeted Position Sizer
 * Based on J.L. Kelly (1956) Information Theory & Ralph Vince Optimal f
 * 
 * Computes optimal position sizing without arbitrary fixed notional allocations:
 * 1. Half-Kelly fraction f* = 0.5 * (p*b - q)/b based on rolling trade outcomes.
 * 2. Normalizes trade risk to a strict percentage of portfolio NAV (default: 0.75% = ₹300 on ₹40k).
 * 3. Quantity = floor(RiskBudget / (Entry - StopLoss)).
 * 4. Caps notional at SEBI 5x intraday MIS margin constraint.
 */

export interface TradeOutcome {
  pnl: number;
  isWin: boolean;
}

export interface KellySizingResult {
  recommendedQuantity: number;
  positionNotional: number;
  riskAmountInr: number;
  actualRiskPct: number;
  kellyFraction: number;
  rollingWinRate: number;
  rollingPayoffRatio: number;
  marginUsed: number;
  marginUtilizationPct: number;
}

export class DynamicKellySizer {
  /**
   * Computes volatility-targeted Half-Kelly position sizing.
   * @param currentNav Current portfolio equity value (e.g. ₹40,000)
   * @param entryPrice Current market entry price
   * @param stopLossPrice Calculated stop loss price
   * @param recentTrades Rolling list of recent closed trade outcomes (last 20-30 trades)
   * @param targetRiskPct Risk budget per trade as fraction of NAV (default: 0.0075 = 0.75%)
   * @param maxMisLeverage Maximum intraday margin allowed (default: 5.0 for SEBI MIS)
   */
  public static calculate(
    currentNav: number,
    entryPrice: number,
    stopLossPrice: number,
    recentTrades: TradeOutcome[] = [],
    targetRiskPct = 0.0075,
    maxMisLeverage = 5.0
  ): KellySizingResult {
    const nav = Math.max(1000, currentNav);
    const stopDistance = Math.abs(entryPrice - stopLossPrice);

    // Fallback stop distance of 1% if invalid
    const effectiveStopDist = stopDistance > 0 ? stopDistance : entryPrice * 0.01;

    // 1. Calculate Rolling Win Rate (p) and Payoff Ratio (b)
    let p = 0.62; // Baseline prior
    let b = 1.80; // Baseline payoff prior (1.8:1)

    if (recentTrades.length >= 10) {
      const window = recentTrades.slice(-25);
      const wins = window.filter((t) => t.isWin);
      const losses = window.filter((t) => !t.isWin);

      if (wins.length > 0 && losses.length > 0) {
        p = wins.length / window.length;
        const avgWin = wins.reduce((s, t) => s + Math.abs(t.pnl), 0) / wins.length;
        const avgLoss = losses.reduce((s, t) => s + Math.abs(t.pnl), 0) / losses.length;
        if (avgLoss > 0) {
          b = Math.max(0.8, Math.min(4.0, avgWin / avgLoss));
        }
      }
    }

    // 2. Continuous Full Kelly: f* = (p * b - (1 - p)) / b
    const q = 1 - p;
    const fullKelly = b > 0 ? (p * b - q) / b : 0;

    // 3. Fractional Half-Kelly with conservative floor and ceiling
    // If recent performance is negative or choppy (fullKelly <= 0), scale down to a safe floor (0.15)
    let halfKelly = 0.50 * fullKelly;
    if (halfKelly < 0.10) {
      halfKelly = 0.10; // Safety floor
    } else if (halfKelly > 0.40) {
      halfKelly = 0.40; // Conservative cap
    }

    // 4. Volatility-Targeted Risk Allocation in INR
    // Risk is scaled by Half-Kelly multiplier relative to baseline
    const kellyScale = halfKelly / 0.25; // 1.0 when halfKelly = 0.25
    const riskAmountInr = nav * targetRiskPct * Math.max(0.60, Math.min(1.40, kellyScale));

    // 5. Quantity Calculation: Quantity = floor(RiskBudget / StopDistance)
    let recommendedQuantity = Math.floor(riskAmountInr / effectiveStopDist);
    if (recommendedQuantity < 1) recommendedQuantity = 1;

    // 6. Max Buying Power Constraint (SEBI 5x MIS margin)
    const maxBuyingPower = nav * maxMisLeverage;
    const maxSinglePositionNotional = nav * 1.5; // No single stock exceeds 1.5x NAV (e.g. ₹60,000 max on ₹40k NAV)

    let notional = recommendedQuantity * entryPrice;
    if (notional > maxSinglePositionNotional) {
      recommendedQuantity = Math.max(1, Math.floor(maxSinglePositionNotional / entryPrice));
      notional = recommendedQuantity * entryPrice;
    }

    const actualRiskInr = recommendedQuantity * effectiveStopDist;
    const actualRiskPct = (actualRiskInr / nav) * 100;
    const marginUsed = notional / maxMisLeverage;
    const marginUtilizationPct = (marginUsed / nav) * 100;

    return {
      recommendedQuantity,
      positionNotional: Number(notional.toFixed(2)),
      riskAmountInr: Number(actualRiskInr.toFixed(2)),
      actualRiskPct: Number(actualRiskPct.toFixed(2)),
      kellyFraction: Number(halfKelly.toFixed(3)),
      rollingWinRate: Number((p * 100).toFixed(1)),
      rollingPayoffRatio: Number(b.toFixed(2)),
      marginUsed: Number(marginUsed.toFixed(2)),
      marginUtilizationPct: Number(marginUtilizationPct.toFixed(1)),
    };
  }
}
