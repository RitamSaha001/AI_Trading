import { AIActionProposal, AISafetyValidation, ASSETS, AppState, Asset, Market } from '../types';
import {
  portfolioValue,
  positionValue,
  money,
  getAvailableCash,
  getReservedCash,
  getAvailablePosition,
  getReservedPosition,
  formatQty,
} from '../domain/portfolio';
import { calculateExecutionQuote } from '../domain/trading';

export const MAX_SINGLE_ORDER_PORTFOLIO_PCT = 0.5; // Max 50% of portfolio in a single AI order
export const MAX_ASSET_ALLOCATION_PCT = 0.6; // Hard cap: Max 60% concentration allowed from AI orders
export const STALE_DATA_THRESHOLD_MS = 45000; // 45 seconds

/**
 * Validates any AI-generated proposal against financial sanity, portfolio risk caps,
 * pending order reservations, and market freshness before authorization.
 */
export function validateAIProposal(
  proposal: any,
  state: AppState,
  markets: Record<Asset, Market | undefined>
): AISafetyValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Schema Validation
  if (!proposal || typeof proposal !== 'object') {
    return { valid: false, errors: ['Proposal is malformed or empty.'], warnings: [] };
  }

  const supportedTypes = [
    'order',
    'alert',
    'rebalance',
    'emergency_defend',
    'deploy_strategy',
    'stress_test',
    'smart_dca',
    'token_compare',
  ];

  if (!supportedTypes.includes(proposal.type)) {
    return { valid: false, errors: [`Unsupported proposal type: ${proposal.type}`], warnings: [] };
  }

  // 1b. Rebalance & Emergency Defense Validation
  if (proposal.type === 'rebalance' || proposal.type === 'emergency_defend') {
    const steps: any[] = proposal.rebalanceSteps || [];
    if (!Array.isArray(steps) || steps.length === 0) {
      if (!proposal.rebalanceTargets && !proposal.cashTargetPct) {
        errors.push('Rebalance proposal must specify either rebalanceSteps or rebalanceTargets.');
      }
    } else {
      for (const s of steps) {
        if (!ASSETS.includes(s.asset)) {
          errors.push(`Unknown asset in rebalance step: ${s.asset}`);
        }
        if (s.action !== 'buy' && s.action !== 'sell') {
          errors.push(`Invalid action in rebalance step for ${s.asset}: ${s.action}`);
        }
        if (!Number.isFinite(s.amount) || s.amount <= 0) {
          errors.push(`Invalid amount in rebalance step for ${s.asset}: ${s.amount}`);
        }
      }
    }

    if (proposal.dangerLevel === 'CRITICAL' || proposal.dangerLevel === 'HIGH') {
      warnings.push(`Urgent Capital Defense Flagged: ${proposal.hazardSource || 'Market risk threshold breached'}.`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // 1c. Strategy Deployment Validation
  if (proposal.type === 'deploy_strategy') {
    if (!ASSETS.includes(proposal.asset)) {
      errors.push(`Unknown cryptocurrency asset for strategy deployment: ${proposal.asset}`);
    }
    const maxAlloc = proposal.strategyParams?.maxAllocation ?? 0.25;
    if (maxAlloc > 0.50) {
      errors.push(`Maximum strategy allocation cannot exceed 50% of portfolio (requested ${(maxAlloc * 100).toFixed(0)}%).`);
    }
    const currentActiveAlloc = (state.strategies || [])
      .filter((s) => s.enabled)
      .reduce((sum, s) => sum + (s.maxAllocation || 0), 0);
    if (currentActiveAlloc + maxAlloc > 1.0) {
      warnings.push(`Total active algorithmic allocation would reach ${((currentActiveAlloc + maxAlloc) * 100).toFixed(0)}% of portfolio capacity.`);
    }
    return { valid: errors.length === 0, errors, warnings };
  }

  // 1d. Stress Test Validation
  if (proposal.type === 'stress_test') {
    if (!proposal.stressTest) {
      warnings.push('Scenario parameters will be dynamically populated upon execution.');
    }
    return { valid: true, errors: [], warnings };
  }

  // 1e. Smart DCA Validation
  if (proposal.type === 'smart_dca') {
    if (!ASSETS.includes(proposal.asset)) {
      errors.push(`Unknown asset for Smart DCA plan: ${proposal.asset}`);
    }
    const baseAmount = proposal.dcaPlan?.baseAmountUsd ?? 100;
    if (baseAmount <= 0 || !Number.isFinite(baseAmount)) {
      errors.push('Base DCA allocation amount must be a positive number.');
    }
    if (baseAmount > state.cash) {
      warnings.push(`Base DCA amount ($${baseAmount}) exceeds currently available cash ($${state.cash.toFixed(2)}). Ensure cash buffer is maintained.`);
    }
    return { valid: errors.length === 0, errors, warnings };
  }

  // 1f. Token Comparison Validation
  if (proposal.type === 'token_compare') {
    return { valid: true, errors: [], warnings };
  }

  if (!ASSETS.includes(proposal.asset)) {
    return { valid: false, errors: [`Unknown or unsupported cryptocurrency asset: ${proposal.asset}`], warnings: [] };
  }

  const asset: Asset = proposal.asset;
  const market = markets[asset];

  // Check market availability
  if (!market || market.price <= 0) {
    return { valid: false, errors: [`Market data for ${asset} is currently unavailable.`], warnings: [] };
  }

  // Check data freshness
  const now = Date.now();
  if (market.lastUpdated && now - market.lastUpdated > STALE_DATA_THRESHOLD_MS) {
    warnings.push(`Market feed is lagging (${Math.round((now - market.lastUpdated) / 1000)}s old). Quote may not reflect immediate spot.`);
  }

  if (market.isSynthetic) {
    warnings.push('Market data is currently operating on heuristic simulation.');
  }

  // 2. Alert Proposal Validation
  if (proposal.type === 'alert') {
    const validAlertTypes = ['above', 'below', 'changeUp', 'changeDown'];
    if (!validAlertTypes.includes(proposal.alertType)) {
      errors.push(`Invalid alert type "${proposal.alertType}". Must be one of: ${validAlertTypes.join(', ')}.`);
    }
    const val = Number(proposal.value);
    if (!Number.isFinite(val) || val <= 0) {
      errors.push('Alert target value must be a positive number.');
    }
    return { valid: errors.length === 0, errors, warnings };
  }

  // 3. Order Proposal Validation
  const side = proposal.side;
  if (side !== 'buy' && side !== 'sell') {
    errors.push(`Invalid order side "${side}". Must be 'buy' or 'sell'.`);
  }

  const amount = Number(proposal.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.push('Order quantity must be a positive finite number.');
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Financial & Execution Modeling
  const quote = calculateExecutionQuote(market.price, side, amount);
  const totalPortVal = portfolioValue(state, markets);
  const currentCash = state.cash;
  const availableCash = getAvailableCash(state);
  const reservedCash = getReservedCash(state);
  const currentHolding = state.positions[asset] || 0;
  const availableHolding = getAvailablePosition(state, asset);
  const reservedHolding = getReservedPosition(state, asset);
  const currentAssetVal = positionValue(state, markets, asset);

  // Capital & Holdings Checks
  if (side === 'buy') {
    if (quote.totalCashRequired > availableCash + 0.01) {
      errors.push(
        `Insufficient available liquid cash. Order requires ${money(quote.totalCashRequired)} (incl. fee), but available cash is ${money(availableCash)} (${money(reservedCash)} reserved for pending orders).`
      );
    }

    // Single order size cap (Hard Block at 50%)
    if (quote.notional > totalPortVal * MAX_SINGLE_ORDER_PORTFOLIO_PCT) {
      errors.push(
        `Order exceeds maximum safe single-trade cap (50% of portfolio). Trade notional: ${money(quote.notional)}, max allowed: ${money(totalPortVal * MAX_SINGLE_ORDER_PORTFOLIO_PCT)}.`
      );
    }

    // Asset allocation cap (Hard Block at 60%)
    const resultingAssetVal = currentAssetVal + quote.notional;
    const resultingAllocPct = totalPortVal > 0 ? (resultingAssetVal / totalPortVal) * 100 : 0;
    if (resultingAllocPct > MAX_ASSET_ALLOCATION_PCT * 100 + 0.01) {
      errors.push(
        `Safety Policy Hard Block: Order would raise ${asset} allocation to ${resultingAllocPct.toFixed(1)}%, violating the hard 60.0% diversification cap.`
      );
    }
  } else {
    // Sell
    if (amount > availableHolding + 1e-6) {
      errors.push(
        `Insufficient available holdings. Attempted to sell ${formatQty(amount, asset)}, but available holding is ${formatQty(availableHolding, asset)} (${formatQty(reservedHolding, asset)} reserved for pending orders).`
      );
    }
  }

  const resultingCash = side === 'buy' ? Math.max(0, currentCash - quote.totalCashRequired) : currentCash + quote.netProceeds;
  const resultingPosition = side === 'buy' ? currentHolding + amount : Math.max(0, currentHolding - amount);
  const resultingVal = resultingPosition * market.price;
  const allocationPct = totalPortVal > 0 ? (resultingVal / totalPortVal) * 100 : 0;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    preview: {
      side,
      asset,
      amount,
      estPrice: quote.estimatedPrice,
      slippage: quote.slippagePct,
      estFee: quote.fee,
      notional: quote.notional,
      currentCash,
      resultingCash,
      currentPosition: currentHolding,
      resultingPosition,
      allocationPct,
      maxAllowedAllocationPct: MAX_ASSET_ALLOCATION_PCT * 100,
    },
  };
}
