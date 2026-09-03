import { AIActionProposal, AISafetyValidation, ASSETS, AppState, Asset, Market } from '../types';
import { portfolioValue, positionValue, money } from '../domain/portfolio';
import { calculateExecutionQuote } from '../domain/trading';

export const MAX_SINGLE_ORDER_PORTFOLIO_PCT = 0.5; // Max 50% of portfolio in a single AI order
export const MAX_ASSET_ALLOCATION_PCT = 0.6; // Max 60% concentration allowed from AI orders
export const STALE_DATA_THRESHOLD_MS = 45000; // 45 seconds

/**
 * Validates any AI-generated proposal against financial sanity, portfolio risk caps,
 * and market freshness before a user is prompted for authorization.
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

  if (
    proposal.type !== 'order' &&
    proposal.type !== 'alert' &&
    proposal.type !== 'rebalance' &&
    proposal.type !== 'emergency_defend'
  ) {
    return { valid: false, errors: [`Unsupported proposal type: ${proposal.type}`], warnings: [] };
  }

  // 1b. Rebalance & Emergency Defense Validation
  if (proposal.type === 'rebalance' || proposal.type === 'emergency_defend') {
    const steps: any[] = proposal.rebalanceSteps || [];
    if (!Array.isArray(steps) || steps.length === 0) {
      // If targets were provided without steps, check targets
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
  const currentHolding = state.positions[asset] || 0;
  const currentAssetVal = positionValue(state, markets, asset);

  // Capital & Holdings Checks
  if (side === 'buy') {
    if (quote.totalCashRequired > currentCash) {
      errors.push(
        `Insufficient liquid cash. Order requires ${money(quote.totalCashRequired)} (including fees), but available cash is ${money(currentCash)}.`
      );
    }

    // Single order size cap
    if (quote.notional > totalPortVal * MAX_SINGLE_ORDER_PORTFOLIO_PCT) {
      errors.push(
        `Order exceeds maximum safe single-trade size (50% of portfolio). Notional: ${money(quote.notional)}.`
      );
    }

    // Asset allocation cap
    const resultingAssetVal = currentAssetVal + quote.notional;
    const resultingAllocPct = totalPortVal > 0 ? (resultingAssetVal / totalPortVal) * 100 : 0;
    if (resultingAllocPct > MAX_ASSET_ALLOCATION_PCT * 100) {
      warnings.push(
        `Order would raise ${asset} allocation to ${resultingAllocPct.toFixed(1)}% (exceeding recommended 60% diversification cap).`
      );
    }
  } else {
    // Sell
    if (amount > currentHolding + 1e-6) {
      errors.push(
        `Insufficient holdings. Attempted to sell ${amount} ${asset}, but current portfolio holding is ${currentHolding}.`
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
