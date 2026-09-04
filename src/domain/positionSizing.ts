import { Asset, Market } from '../types';
import { META, FEE_RATE } from './portfolio';
import { DEFAULT_RISK_POLICY, RiskPolicy } from './riskPolicy';
import { indicators } from './indicators';

export interface PositionSizeRequest {
  asset: Asset;
  side: 'buy' | 'sell';
  entryPrice: number;
  stopPrice?: number;
  targetPrice?: number;
  maxTradeRiskPct?: number; // e.g. 0.02 (2%)
  portfolioEquity: number;
  availableCash: number;
  currentHolding: number;
  currentHoldingNotional: number;
  market?: Market;
  policy?: RiskPolicy;
}

export interface PositionSizeResult {
  quantity: number;
  notional: number;
  portfolioPct: number;
  theoreticalMaxLoss: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  riskRewardRatio: number;
  riskBudget: number;
  unitRisk: number;
  constrainedBy: ('risk_budget' | 'available_cash' | 'single_asset_cap' | 'single_order_cap' | 'minimum_size' | 'available_holding')[];
  rationale: string;
}

/**
 * Calculates institutional risk-based position sizing:
 * 1. risk_budget = portfolioEquity * maxTradeRiskPct
 * 2. unit_risk = |entryPrice - stopPrice|
 * 3. raw_quantity = risk_budget / unit_risk
 * 4. Bound by available cash, min cash reserve, max single-asset allocation, and max single order cap.
 */
export function calculateRiskBasedPositionSize(
  req: PositionSizeRequest
): PositionSizeResult {
  const policy = req.policy || DEFAULT_RISK_POLICY;
  const equity = Math.max(1, req.portfolioEquity);
  const maxRiskPct = req.maxTradeRiskPct && req.maxTradeRiskPct > 0 && req.maxTradeRiskPct <= 0.10
    ? req.maxTradeRiskPct
    : policy.maxTradeRiskPct;
  const riskBudget = equity * maxRiskPct;

  const entry = req.entryPrice > 0 ? req.entryPrice : 1;
  const decimals = META[req.asset]?.decimals ?? 4;

  // Determine Stop Loss price if not provided
  let stop = req.stopPrice;
  if (!stop || stop <= 0 || (req.side === 'buy' && stop >= entry) || (req.side === 'sell' && stop <= entry)) {
    // Dynamic ATR-based or volatility stop distance
    let stopDistancePct = 0.035; // Default 3.5%
    if (req.market && req.market.history && req.market.history.length >= 14) {
      const ind = indicators(req.market.history, req.market.candles);
      if (ind.atr && ind.atr > 0) {
        // 2x ATR distance
        const atrPct = (ind.atr * 2) / entry;
        stopDistancePct = Math.max(policy.minStopDistancePct, Math.min(policy.maxStopDistancePct, atrPct));
      }
    }
    stop = req.side === 'buy' ? +(entry * (1 - stopDistancePct)).toFixed(4) : +(entry * (1 + stopDistancePct)).toFixed(4);
  }

  // Determine Take Profit price if not provided
  let target = req.targetPrice;
  if (!target || target <= 0 || (req.side === 'buy' && target <= entry) || (req.side === 'sell' && target >= entry)) {
    // Standard 2.2x risk/reward target
    const stopDist = Math.abs(entry - stop);
    target = req.side === 'buy' ? +(entry + stopDist * 2.2).toFixed(4) : +(Math.max(0.0001, entry - stopDist * 2.2)).toFixed(4);
  }

  const unitRisk = Math.max(entry * 0.001, Math.abs(entry - stop));
  const rawQty = riskBudget / unitRisk;

  const constrainedBy: PositionSizeResult['constrainedBy'] = ['risk_budget'];
  let boundedQty = rawQty;

  if (req.side === 'buy') {
    // 1. Cap by max single order notional (e.g. 40% of equity)
    const maxOrderNotional = equity * policy.maxSingleOrderPortfolioPct;
    const maxQtyByOrderCap = maxOrderNotional / entry;
    if (boundedQty > maxQtyByOrderCap) {
      boundedQty = maxQtyByOrderCap;
      constrainedBy.push('single_order_cap');
    }

    // 2. Cap by maximum asset allocation (e.g. 50% max allocation per asset)
    const maxAllowedHoldingValue = equity * policy.maxSingleAssetPct;
    const remainingAssetCapacityValue = Math.max(0, maxAllowedHoldingValue - req.currentHoldingNotional);
    const maxQtyByAssetCap = remainingAssetCapacityValue / entry;
    if (boundedQty > maxQtyByAssetCap) {
      boundedQty = maxQtyByAssetCap;
      constrainedBy.push('single_asset_cap');
    }

    // 3. Cap by available liquid cash (ensuring min cash reserve and taker fee are preserved)
    const minCashPreserved = equity * policy.minCashReservePct;
    const usableCash = Math.max(0, req.availableCash - minCashPreserved);
    // Include 0.08% taker fee + 0.1% buffer
    const maxCashToSpend = usableCash / (1 + FEE_RATE + 0.001);
    const maxQtyByCash = maxCashToSpend / entry;
    if (boundedQty > maxQtyByCash) {
      boundedQty = Math.max(0, maxQtyByCash);
      constrainedBy.push('available_cash');
    }
  } else {
    // Sell: bound by available position holdings
    if (boundedQty > req.currentHolding) {
      boundedQty = Math.max(0, req.currentHolding);
      constrainedBy.push('available_holding');
    }
  }

  // Minimum order size enforcement ($10 notional)
  const notional = boundedQty * entry;
  if (notional < policy.minOrderNotionalUsd && boundedQty > 0) {
    if (req.side === 'buy') {
      const minQty = policy.minOrderNotionalUsd / entry;
      // If we cannot even afford the minimum order without violating cash, set to 0
      if (req.availableCash < policy.minOrderNotionalUsd * 1.05) {
        boundedQty = 0;
      } else {
        boundedQty = minQty;
        constrainedBy.push('minimum_size');
      }
    } else {
      // For sell, if holdings are smaller than $10, can liquidate all
      boundedQty = req.currentHolding;
    }
  }

  // Round quantity to proper precision
  const factor = Math.pow(10, decimals);
  const finalQty = Math.floor(boundedQty * factor) / factor;
  const finalNotional = +(finalQty * entry).toFixed(2);
  const portfolioPct = equity > 0 ? +((finalNotional / equity) * 100).toFixed(2) : 0;
  const theoreticalMaxLoss = +(finalQty * unitRisk).toFixed(2);

  const profitDistance = Math.abs(target - entry);
  const lossDistance = Math.max(0.0001, Math.abs(entry - stop));
  const riskRewardRatio = +(profitDistance / lossDistance).toFixed(2);

  const rationale = `Risk-adjusted position size: ${finalQty} ${req.asset} ($${finalNotional.toLocaleString()}, ${portfolioPct}% of equity). Risk budget is $${riskBudget.toFixed(2)} (${(maxRiskPct * 100).toFixed(1)}% of capital) with stop-loss at $${stop.toLocaleString()} (unit risk: $${unitRisk.toFixed(2)}). Theoretical max loss: $${theoreticalMaxLoss.toLocaleString()}.`;

  return {
    quantity: finalQty,
    notional: finalNotional,
    portfolioPct,
    theoreticalMaxLoss,
    entryPrice: entry,
    stopPrice: stop,
    targetPrice: target,
    riskRewardRatio,
    riskBudget: +riskBudget.toFixed(2),
    unitRisk: +unitRisk.toFixed(2),
    constrainedBy,
    rationale,
  };
}
