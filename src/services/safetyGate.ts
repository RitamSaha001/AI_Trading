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
  FEE_RATE,
} from '../domain/portfolio';
import { calculateExecutionQuote } from '../domain/trading';
import { DEFAULT_RISK_POLICY, getRiskPolicy, RiskPolicy } from '../domain/riskPolicy';
import { MarketDataValidityGuard } from '../domain/marketValidity';

export const MAX_SINGLE_ORDER_PORTFOLIO_PCT = DEFAULT_RISK_POLICY.maxSingleOrderPortfolioPct; // Max 40% of portfolio in a single AI order
export const MAX_ASSET_ALLOCATION_PCT = DEFAULT_RISK_POLICY.maxSingleAssetPct; // Hard cap: Max 50% concentration allowed from AI orders
export const MIN_CASH_RESERVE_PCT = DEFAULT_RISK_POLICY.minCashReservePct; // Hard policy: Minimum 15% liquid cash reserve for capital preservation
export const STALE_DATA_THRESHOLD_MS = DEFAULT_RISK_POLICY.staleDataThresholdMs; // 45 seconds

/** In-memory pending order lock to prevent race-condition duplicate submissions */
const pendingOrderLocks = new Map<string, number>();
const LOCK_TTL_MS = 10_000; // 10 second lock

export function acquireOrderLock(asset: string, side: string): boolean {
  const key = `${asset}-${side}`;
  const now = Date.now();
  const existing = pendingOrderLocks.get(key);
  if (existing && now - existing < LOCK_TTL_MS) {
    return false; // Lock held
  }
  pendingOrderLocks.set(key, now);
  return true;
}

export function isOrderLocked(asset: string, side: string): boolean {
  const key = `${asset}-${side}`;
  const existing = pendingOrderLocks.get(key);
  if (existing && Date.now() - existing < LOCK_TTL_MS) {
    return true;
  }
  if (existing) {
    pendingOrderLocks.delete(key);
  }
  return false;
}

export function releaseOrderLock(asset: string, side: string): void {
  pendingOrderLocks.delete(`${asset}-${side}`);
}

export function clearOrderLocks(): void {
  pendingOrderLocks.clear();
}

/**
 * Validates any AI-generated proposal against financial sanity, portfolio risk caps,
 * minimum cash liquidity reserves, pending order reservations, and market freshness before authorization.
 */
export function validateAIProposal(
  proposal: any,
  state: AppState,
  markets: Record<Asset, Market | undefined>,
  options?: { acquireLock?: boolean }
): AISafetyValidation {
  const policy: RiskPolicy = getRiskPolicy(state);
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

  // 1a. Cross-mode proposal protection (Requirement 1.2)
  const currentMode = state.accountMode || 'paper';
  if (proposal.accountMode && proposal.accountMode !== currentMode) {
    errors.push(
      `Cross-mode proposal rejected: proposal target mode '${proposal.accountMode}' does not match current active trading mode '${currentMode}'.`
    );
  }

  // 1b. Rebalance & Emergency Defense Validation
  if (proposal.type === 'rebalance' || proposal.type === 'emergency_defend') {
    const steps: any[] = proposal.rebalanceSteps || [];
    if (!Array.isArray(steps) || steps.length === 0) {
      if (!proposal.rebalanceTargets && !proposal.cashTargetPct) {
        errors.push('Rebalance proposal must specify either rebalanceSteps or rebalanceTargets.');
      }
    } else {
      const isExch = state.accountMode === 'exchange';
      const isW3 = state.accountMode === 'web3';
      let runningCash = isExch
        ? (['USDT', 'USDC', 'BUSD', 'FDUSD', 'USD'] as const).reduce(
            (sum, c) => sum + (state.exchangeAccount?.balances[c]?.free || 0),
            0
          )
        : isW3
        ? (state.web3Account?.balances?.['USDT'] || 0) + (state.web3Account?.balances?.['USDC'] || 0)
        : getAvailableCash(state);

      const runningHoldings: Record<string, number> = {};
      for (const a of ASSETS) {
        runningHoldings[a] = isExch
          ? (state.exchangeAccount?.balances[a]?.free || 0)
          : isW3
          ? (state.web3Positions?.[a] || state.web3Account?.balances?.[a] || 0)
          : getAvailablePosition(state, a);
      }

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

        // Validate sufficient balance for rebalance step with cumulative tracking
        const stepMarket = markets[s.asset as Asset];
        if (stepMarket && stepMarket.price > 0 && Number.isFinite(s.amount) && s.amount > 0) {
          if (s.action === 'buy') {
            const stepNotional = s.amount * stepMarket.price;
            if (stepNotional > runningCash * 0.95) {
              errors.push(
                `Rebalance buy step for ${s.asset}: notional $${stepNotional.toFixed(2)} exceeds available cash $${runningCash.toFixed(2)}.`
              );
            } else {
              runningCash = Math.max(0, runningCash - stepNotional);
              runningHoldings[s.asset] = (runningHoldings[s.asset] || 0) + s.amount;
            }
          } else if (s.action === 'sell') {
            const curHolding = runningHoldings[s.asset] || 0;
            if (s.amount > curHolding + 1e-6) {
              errors.push(
                `Rebalance sell step for ${s.asset}: amount ${s.amount} exceeds available holding ${curHolding.toFixed(6)}.`
              );
            } else {
              runningHoldings[s.asset] = Math.max(0, curHolding - s.amount);
              runningCash += s.amount * stepMarket.price * (1 - FEE_RATE);
            }
          }
        }
      }
    }

    // Stale data check for rebalance steps
    for (const s of steps) {
      const stepMkt = markets[s.asset as Asset];
      if (stepMkt?.lastUpdated) {
        const age = Date.now() - stepMkt.lastUpdated;
        if (age > policy.staleDataThresholdMs) {
          errors.push(`Stale market data for ${s.asset} (${Math.round(age/1000)}s old). Rebalance blocked for capital safety.`);
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

    const stratMarket = markets[proposal.asset as Asset];
    if (stratMarket?.lastUpdated && Date.now() - stratMarket.lastUpdated > policy.staleDataThresholdMs) {
      errors.push(`Stale market data for ${proposal.asset}. Strategy deployment blocked for capital safety.`);
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

    const dcaMarket = markets[proposal.asset as Asset];
    if (dcaMarket?.lastUpdated && Date.now() - dcaMarket.lastUpdated > policy.staleDataThresholdMs) {
      errors.push(`Stale market data for ${proposal.asset}. Smart DCA blocked for capital safety.`);
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

  // Check market availability & validity
  if (!market || market.price <= 0) {
    return { valid: false, errors: [`Market data for ${asset} is currently unavailable.`], warnings: [] };
  }

  const validity = MarketDataValidityGuard.validate(market, asset, policy, { requireExecutionGrade: proposal.type === 'order' });
  if (!validity.isValid) {
    return { valid: false, errors: validity.errors, warnings: validity.warnings };
  }

  // Stale data rejection
  const now = Date.now();
  if (validity.isStale || (market.lastUpdated && now - market.lastUpdated > policy.staleDataThresholdMs)) {
    const ageSec = validity.ageSec || Math.round((now - (market.lastUpdated || 0)) / 1000);
    warnings.push(`Market feed is lagging (${ageSec}s old). Quote may not reflect immediate spot.`);
    if (proposal.type === 'order') {
      errors.push(`Stale market data rejection: Feed for ${asset} is ${ageSec}s old (threshold: ${Math.round(policy.staleDataThresholdMs / 1000)}s). Executable proposals are disabled.`);
    }
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

  // Duplicate-order protection (Requirement 19)
  if (Array.isArray(state.orders) && state.orders.length > 0 && Number.isFinite(amount) && amount > 0) {
    const isDuplicate = state.orders.some(
      (o) =>
        (o.accountMode || 'paper') === currentMode &&
        o.status === 'pending' &&
        o.asset === asset &&
        o.side === side &&
        Math.abs(o.amount - amount) / Math.max(amount, 0.0001) < 0.10
    );
    if (isDuplicate) {
      errors.push(`Duplicate order protection: An open ${side.toUpperCase()} order for ${asset} of matching size is already pending execution.`);
    }
  }

  // Temporal lock: prevent concurrent same-asset same-side submissions
  if (options?.acquireLock) {
    if (!acquireOrderLock(asset, side)) {
      errors.push(`Order throttle: A ${side.toUpperCase()} order for ${asset} was submitted within the last 10 seconds. Please wait.`);
    }
  }

  if (errors.length > 0) {
    if (options?.acquireLock) {
      releaseOrderLock(asset, side);
    }
    return { valid: false, errors, warnings };
  }

  // Financial & Execution Modeling
  const quote = calculateExecutionQuote(market.price, side, amount);

  // Exchange & Web3 Mode-Specific Checks
  const isExchangeMode = state.accountMode === 'exchange';
  const isWeb3Mode = state.accountMode === 'web3';

  if (isExchangeMode) {
    if (proposal.requiresConfirmation === false) {
      errors.push('Safety Gate: Live exchange orders require mandatory 2-step human confirmation.');
    }
    const envLabel = state.exchangeAccount?.environment?.toUpperCase() || 'TESTNET';
    warnings.push(`⚠️ DISPATCHING TO LIVE BINANCE [${envLabel}]`);

    // Minimum notional enforcement ($10.00 minimum on Binance Spot)
    if (quote.notional < 10.0) {
      errors.push(
        `Exchange minimum notional rejection: Order notional ($${quote.notional.toFixed(2)}) is below Binance minimum $10.00 requirement.`
      );
    }
  }

  if (isWeb3Mode) {
    if (proposal.requiresConfirmation === false) {
      errors.push('Safety Gate: Web3 on-chain transactions require mandatory 2-step human confirmation.');
    }
    const networkName = state.web3Account?.network?.toUpperCase() || 'POLYGON';
    warnings.push(`⚡ ON-CHAIN DEX SWAP [${networkName}]`);

    // Gas reserve check (must have native token for gas)
    const nativeBal = state.web3Account?.nativeBalance || 0;
    const minGas = state.web3Account?.network === 'arbitrum' ? 0.001 : 0.5;
    if (nativeBal < minGas) {
      errors.push(
        `Insufficient native gas reserve: Have ${nativeBal.toFixed(4)} ${state.web3Account?.nativeSymbol || 'POL'}, need at least ${minGas} for on-chain gas fees.`
      );
    }
  }

  // Financial & Execution Modeling
  const totalPortVal = portfolioValue(state, markets);
  const stablecoinsSum = (['USDT', 'USDC', 'BUSD', 'FDUSD', 'USD'] as const).reduce(
    (sum, c) => sum + (state.exchangeAccount?.balances[c]?.free || 0),
    0
  );
  const web3StableSum = (state.web3Account?.balances?.['USDT'] || 0) + (state.web3Account?.balances?.['USDC'] || 0);

  const currentCash = isExchangeMode ? stablecoinsSum : isWeb3Mode ? web3StableSum : state.cash;
  const availableCash = isExchangeMode ? stablecoinsSum : isWeb3Mode ? web3StableSum : getAvailableCash(state);
  const reservedCash = isExchangeMode || isWeb3Mode ? 0 : getReservedCash(state);
  const currentHolding = isExchangeMode
    ? (state.exchangeAccount?.balances[asset]?.free || 0)
    : isWeb3Mode
    ? (state.web3Positions?.[asset] || state.web3Account?.balances?.[asset] || 0)
    : (state.positions[asset] || 0);
  const availableHolding = isExchangeMode
    ? (state.exchangeAccount?.balances[asset]?.free || 0)
    : isWeb3Mode
    ? (state.web3Positions?.[asset] || state.web3Account?.balances?.[asset] || 0)
    : getAvailablePosition(state, asset);
  const reservedHolding = isExchangeMode || isWeb3Mode ? 0 : getReservedPosition(state, asset);
  const currentAssetVal = currentHolding * market.price;

  // Maximum Slippage Hard Limit (Requirement 19)
  // quote.slippagePct is in percent (e.g. 0.02 for 2 bps). policy.maxSlippagePct is decimal (e.g. 0.01 for 1%).
  if (quote.slippagePct / 100 > policy.maxSlippagePct) {
    errors.push(
      `Execution rejected: Estimated slippage (${quote.slippagePct.toFixed(2)}%) exceeds maximum risk policy threshold (${(policy.maxSlippagePct * 100).toFixed(2)}%).`
    );
  }

  // Single order notional cap (applies to both buy and sell)
  if (quote.notional > totalPortVal * policy.maxSingleOrderPortfolioPct) {
    errors.push(
      `Order size too large: Order exceeds maximum safe single-trade cap (${(policy.maxSingleOrderPortfolioPct * 100).toFixed(0)}% of portfolio). Trade requires ${money(quote.notional)}, but the maximum permitted per order is ${money(totalPortVal * policy.maxSingleOrderPortfolioPct)}.`
    );
  }

  // Capital & Holdings Checks
  if (side === 'buy') {
    if (quote.totalCashRequired > availableCash + 0.01) {
      const msg = isExchangeMode
        ? `Not enough USDT (insufficient available exchange USDT) — you need ${money(quote.totalCashRequired)} (incl. fee) but only have ${money(availableCash)} available.`
        : `Not enough cash (insufficient liquid cash) — you need ${money(quote.totalCashRequired)} (incl. fee) but only have ${money(availableCash)} available (after reserving ${money(reservedCash)} for pending orders).`;
      errors.push(msg);
    }

    // Cash Liquidity Reserve Enforcement (Policy minimum liquid buffer)
    const resultingCashEstimated = Math.max(0, currentCash - quote.totalCashRequired);
    const resultingCashPct = totalPortVal > 0 ? (resultingCashEstimated / totalPortVal) * 100 : 0;
    const minCashPct = policy.minCashReservePct * 100;
    if (resultingCashPct < minCashPct) {
      errors.push(
        `Capital Defense Hard Block: Order would leave liquid cash reserves at ${resultingCashPct.toFixed(1)}%, violating the mandatory ${minCashPct.toFixed(1)}% capital defense threshold. Please retain cash to protect against drawdowns.`
      );
    }

    // Asset allocation cap
    const resultingAssetVal = currentAssetVal + quote.notional;
    const resultingAllocPct = totalPortVal > 0 ? (resultingAssetVal / totalPortVal) * 100 : 0;
    const maxAssetPct = policy.maxSingleAssetPct * 100;
    const warnAssetPct = policy.warnSingleAssetPct * 100;
    if (resultingAllocPct > maxAssetPct + 0.01) {
      errors.push(
        `Safety Policy Hard Block: Order would raise ${asset} allocation to ${resultingAllocPct.toFixed(1)}%, violating the hard ${maxAssetPct.toFixed(1)}% diversification cap. Please reduce the order size to diversify risk.`
      );
    } else if (resultingAllocPct > warnAssetPct) {
      warnings.push(
        `Concentration Warning: Order elevates ${asset} allocation to ${resultingAllocPct.toFixed(1)}% of total portfolio.`
      );
    }
  } else {
    // Sell
    if (amount > availableHolding + 1e-6) {
      errors.push(
        `Not enough ${asset} (insufficient available holdings) — you attempted to sell ${formatQty(amount, asset)}, but only have ${formatQty(availableHolding, asset)} available (with ${formatQty(reservedHolding, asset)} reserved for pending orders).`
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
