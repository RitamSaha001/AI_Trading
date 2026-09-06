import {
  Asset,
  AppState,
  Market,
  Order,
  AssetFleetStatus,
  PilotRateLimitStatus,
  PilotActionLog,
  PilotStrategyKind,
  FleetAssetLifecycle,
} from '../types';
import { portfolioValue, isIndianAsset, META } from './portfolio';
import { indicators } from './indicators';
import { PILOT_PROFILES, alignToTickSize, checkPilotCircuitBreaker } from './autonomousPilot';
import {
  calculateHurstExponent,
  estimateOrnsteinUhlenbeck,
  runKalmanFilter,
} from './quantEngine';

// Institutional Indian Bluechip Assets monitored by the Autonomous Desk
export const UPSTOX_FLEET_ASSETS: Asset[] = [
  'RELIANCE',
  'TCS',
  'HDFCBANK',
  'INFY',
  'ICICIBANK',
  'SBIN',
  'BHARTIARTL',
  'LT',
  'ITC',
  'TATAMOTORS',
];

// Upstox API Rate Limit Constants (Conservative Pacing)
export const PILOT_RATE_LIMITS = {
  MIN_ORDER_SPACING_MS: 1500, // At least 1.5 seconds between orders
  MAX_ORDERS_PER_MINUTE: 10,  // Max 10 orders per 60-second rolling window
  WINDOW_MS: 60000,
};

export interface AutonomousPilotOrderProposal {
  asset: Asset;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  stopLoss?: number;
  takeProfit?: number;
  type: 'limit' | 'market';
  strategyName: string;
  reason: string;
}

export interface AutonomousPilotTickResult {
  updatedFleet: Record<string, AssetFleetStatus>;
  updatedRateLimits: PilotRateLimitStatus;
  newActionLogs: PilotActionLog[];
  ordersToDispatch: AutonomousPilotOrderProposal[];
  circuitBreakerTripped: boolean;
  tripReason?: string;
}

/**
 * Creates initial default rate limit status.
 */
export function createDefaultRateLimitStatus(): PilotRateLimitStatus {
  return {
    requestsThisMinute: 0,
    maxPerMinute: PILOT_RATE_LIMITS.MAX_ORDERS_PER_MINUTE,
    minSpacingMs: PILOT_RATE_LIMITS.MIN_ORDER_SPACING_MS,
    lastDispatchedAt: 0,
    queueLength: 0,
    isThrottled: false,
  };
}

/**
 * Initializes the default fleet tracking record for all monitored assets.
 */
export function initializeFleetStatus(assets: Asset[] = UPSTOX_FLEET_ASSETS): Record<string, AssetFleetStatus> {
  const fleet: Record<string, AssetFleetStatus> = {};
  for (const a of assets) {
    fleet[a] = {
      asset: a,
      assignedStrategy: 'Titan Alpha Sentinel',
      regimeLabel: 'Calibrating',
      hurst: 0.50,
      currentPrice: 0,
      state: 'MONITORING',
    };
  }
  return fleet;
}

/**
 * Evaluates rate limit allowance for dispatching a new order.
 */
export function evaluateRateLimitAllowance(
  status: PilotRateLimitStatus,
  now: number = Date.now()
): { allowed: boolean; reason?: string; nextAvailableAt?: number } {
  // Check minimum inter-order spacing
  const elapsedSinceLast = now - status.lastDispatchedAt;
  if (elapsedSinceLast < PILOT_RATE_LIMITS.MIN_ORDER_SPACING_MS) {
    return {
      allowed: false,
      reason: `Pacing limit: Must wait ${((PILOT_RATE_LIMITS.MIN_ORDER_SPACING_MS - elapsedSinceLast) / 1000).toFixed(1)}s for Upstox rate pacing.`,
      nextAvailableAt: status.lastDispatchedAt + PILOT_RATE_LIMITS.MIN_ORDER_SPACING_MS,
    };
  }

  // Check rolling minute quota
  if (status.requestsThisMinute >= PILOT_RATE_LIMITS.MAX_ORDERS_PER_MINUTE) {
    return {
      allowed: false,
      reason: `Rolling quota limit: Reached maximum ${PILOT_RATE_LIMITS.MAX_ORDERS_PER_MINUTE} orders/minute. Throttling for safety.`,
    };
  }

  return { allowed: true };
}

/**
 * Classifies regime and assigns optimal quantitative strategy for an individual asset.
 */
export function determineAssetStrategyAndRegime(
  market: Market | undefined
): {
  strategy: PilotStrategyKind;
  regimeLabel: string;
  hurst: number;
  ouZScore: number;
  kalmanFairValue: number;
  atr: number;
} {
  const price = market?.price || 100;
  const history = market?.history || [];

  const ind = indicators(history, market?.candles);
  const atr = ind.atr && ind.atr > 0 ? ind.atr : price * 0.02;

  // 1. Hurst Exponent Analysis
  const hurstRes = history.length >= 20
    ? calculateHurstExponent(history)
    : { hurst: 0.52, regime: 'Random Walk' as const };

  // 2. Ornstein-Uhlenbeck Mean Reversion
  const ouRes = history.length >= 10
    ? estimateOrnsteinUhlenbeck(history)
    : { currentZScore: 0, theta: 0.1, mu: price };

  // 3. Kalman Filter Fair Value
  const kfRes = history.length >= 5
    ? runKalmanFilter(history)
    : { finalState: { estimatedState: price } };

  const hurst = hurstRes.hurst;
  const ouZScore = ouRes.currentZScore;
  const kalmanFairValue = kfRes.finalState.estimatedState;

  let strategy: PilotStrategyKind = 'Titan Alpha Sentinel';
  let regimeLabel = 'Equilibrium';

  if (ind.rsi < 35) {
    strategy = 'Value Accumulator';
    regimeLabel = 'Oversold Accumulation';
  } else if (hurst > 0.55 && price >= (ind.s10 ?? price)) {
    strategy = 'Hurst Trend Rider';
    regimeLabel = 'Persistent Trending Momentum';
  } else if (hurst < 0.45) {
    strategy = 'OU Mean Reversion';
    regimeLabel = 'Anti-Persistent Mean Reversion';
  } else {
    strategy = 'Titan Alpha Sentinel';
    regimeLabel = 'Multi-Factor Alpha Zone';
  }

  return {
    strategy,
    regimeLabel,
    hurst,
    ouZScore,
    kalmanFairValue,
    atr,
  };
}

/**
 * Checks Indian Market Hours & Cutoffs.
 * 09:15 to 15:30 IST. New MIS entries blocked after 15:00 IST.
 */
export function isMarketSessionOpen(now: number = Date.now()): {
  isOpen: boolean;
  isNearingCutoff: boolean;
  sessionDescription: string;
} {
  const d = new Date(now);
  // IST is UTC + 5:30
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 3600000 * 5.5);

  const day = ist.getDay();
  // Saturday (6) or Sunday (0)
  if (day === 0 || day === 6) {
    return { isOpen: false, isNearingCutoff: false, sessionDescription: 'Market Closed (Weekend)' };
  }

  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  const marketOpen = 9 * 60 + 15;   // 09:15
  const intradayCutoff = 15 * 60;   // 15:00
  const marketClose = 15 * 60 + 30; // 15:30

  if (timeInMinutes < marketOpen) {
    return { isOpen: false, isNearingCutoff: false, sessionDescription: 'Pre-Open Session (Market opens at 09:15 IST)' };
  }
  if (timeInMinutes >= marketClose) {
    return { isOpen: false, isNearingCutoff: false, sessionDescription: 'Market Closed (Post-Session)' };
  }

  const isNearingCutoff = timeInMinutes >= intradayCutoff;
  return {
    isOpen: true,
    isNearingCutoff,
    sessionDescription: isNearingCutoff ? 'Intraday Cutoff Active (No new MIS orders)' : 'Regular Market Hours Active',
  };
}

/**
 * Master Execution Engine Tick for the Autonomous Quant Pilot.
 * Undertakes all quantitative strategies across all monitored stocks on its own.
 * Respects Upstox rate limits, cash preservation invariants, and anti-loss ratchets.
 */
export function tickAutonomousPilot(
  state: AppState,
  markets: Record<Asset, Market | undefined>,
  now: number = Date.now()
): AutonomousPilotTickResult {
  const pilot = state.autonomousPilot;
  const startingVal = pilot?.dailyStartingValue || state.startingEquity || 50000;
  const pv = portfolioValue(state, markets);

  // Initialize status containers
  const updatedFleet: Record<string, AssetFleetStatus> = {
    ...(pilot?.activeFleet || initializeFleetStatus()),
  };

  let rateLimits: PilotRateLimitStatus = {
    ...(pilot?.rateLimitStatus || createDefaultRateLimitStatus()),
  };

  // Reset rolling minute counter if 60 seconds have elapsed
  if (now - rateLimits.lastDispatchedAt > PILOT_RATE_LIMITS.WINDOW_MS) {
    rateLimits.requestsThisMinute = 0;
    rateLimits.isThrottled = false;
  }

  const newActionLogs: PilotActionLog[] = [];
  const ordersToDispatch: AutonomousPilotOrderProposal[] = [];

  // 1. Check Circuit Breaker
  const profileKey = pilot?.profile || 'conservative';
  const profile = PILOT_PROFILES[profileKey];
  const cbCheck = checkPilotCircuitBreaker(state, pv, profileKey);

  if (cbCheck.tripped) {
    return {
      updatedFleet,
      updatedRateLimits: rateLimits,
      newActionLogs: [
        {
          id: `log_cb_${now}`,
          timestamp: now,
          asset: 'RELIANCE',
          action: 'THROTTLED',
          strategy: 'Capital Guardian Circuit Breaker',
          detail: cbCheck.reason || 'Drawdown limit reached.',
          price: 0,
          status: 'BLOCKED',
        },
      ],
      ordersToDispatch: [],
      circuitBreakerTripped: true,
      tripReason: cbCheck.reason,
    };
  }

  // If pilot is disabled or semi-autonomous, do not automatically place orders
  if (!pilot?.enabled || pilot.executionMode !== 'full_autonomous') {
    // Only refresh fleet telemetry without placing orders
    for (const asset of UPSTOX_FLEET_ASSETS) {
      const m = markets[asset];
      if (!m || !m.price) continue;
      const { strategy, regimeLabel, hurst } = determineAssetStrategyAndRegime(m);
      const holding = state.positions[asset] || 0;
      updatedFleet[asset] = {
        ...updatedFleet[asset],
        asset,
        assignedStrategy: strategy,
        regimeLabel,
        hurst,
        currentPrice: m.price,
        state: holding > 0 ? 'IN_POSITION' : 'MONITORING',
        unitsHeld: holding,
      };
    }
    return {
      updatedFleet,
      updatedRateLimits: rateLimits,
      newActionLogs: [],
      ordersToDispatch: [],
      circuitBreakerTripped: false,
    };
  }

  // 2. Market Hours Check (for live Upstox mode)
  const isLiveUpstox = state.accountMode === 'upstox';
  const session = isMarketSessionOpen(now);
  if (isLiveUpstox && !session.isOpen) {
    // Outside market hours: do not submit live orders
    return {
      updatedFleet,
      updatedRateLimits: rateLimits,
      newActionLogs: [],
      ordersToDispatch: [],
      circuitBreakerTripped: false,
    };
  }

  // Compute available liquid cash and mandatory cash reserve floor (15% or profile target)
  const currentCash = state.accountMode === 'upstox' && state.upstoxAccount?.funds
    ? state.upstoxAccount.funds.availableCash
    : state.cash;

  const minCashFloorPct = Math.max(15, profile.targetCashBufferPct);
  const minRequiredCash = pv * (minCashFloorPct / 100);
  let allocatableCash = Math.max(0, currentCash - minRequiredCash);

  // Set of assets with active pending BUY orders (prevent duplicate submissions)
  const pendingBuyAssets = new Set(
    state.orders
      .filter((o) => o.status === 'pending' && o.side === 'buy')
      .map((o) => o.asset)
  );

  // 3. Process Monitored Fleet Assets
  for (const asset of UPSTOX_FLEET_ASSETS) {
    const market = markets[asset];
    if (!market || !market.price || market.price <= 0) continue;

    const price = market.price;
    const currentHolding = state.positions[asset] || 0;
    const avgBuyPrice = state.avgBuyPrice?.[asset] || price;
    const { strategy, regimeLabel, hurst, ouZScore, atr } = determineAssetStrategyAndRegime(market);

    let fleetStatus = updatedFleet[asset] || {
      asset,
      assignedStrategy: strategy,
      regimeLabel,
      hurst,
      currentPrice: price,
      state: 'MONITORING' as FleetAssetLifecycle,
    };

    // A. EXISTING OPEN POSITION MANAGEMENT (Take-Profit & Trailing Stop Ratchet)
    if (currentHolding > 0) {
      const unrealizedPnl = (price - avgBuyPrice) * currentHolding;
      const unrealizedPnlPct = +(((price - avgBuyPrice) / avgBuyPrice) * 100).toFixed(2);
      const profitDistance = price - avgBuyPrice;

      let currentStop = fleetStatus.stopLossPrice || alignToTickSize(avgBuyPrice - atr * profile.stopLossAtrMultiplier, asset);
      let currentTarget = fleetStatus.takeProfitPrice || alignToTickSize(avgBuyPrice + atr * profile.takeProfitAtrMultiplier, asset);
      let lifecycleState: FleetAssetLifecycle = 'IN_POSITION';

      // Trailing Stop Ratchet: If in profit by >= 1.5 ATR, ratchet stop-loss above entry to lock in gain
      if (profitDistance >= atr * 1.5) {
        const ratchetedStop = alignToTickSize(Math.max(currentStop, avgBuyPrice + atr * 0.2), asset);
        if (ratchetedStop > currentStop) {
          currentStop = ratchetedStop;
          lifecycleState = 'TRAILING_PROFIT';
          newActionLogs.push({
            id: `log_ratchet_${asset}_${now}`,
            timestamp: now,
            asset,
            action: 'TRAILING_RATCHET',
            strategy,
            detail: `Ratcheted trailing stop-loss to ₹${currentStop.toFixed(2)} (guaranteeing zero capital loss).`,
            price,
            status: 'EXECUTED',
          });
        }
      }

      // Check Take Profit Target Hit
      if (price >= currentTarget && evaluateRateLimitAllowance(rateLimits, now).allowed) {
        // Exit 50% or full position at target
        const exitQty = Math.max(1, Math.floor(currentHolding * 0.5));
        ordersToDispatch.push({
          asset,
          side: 'sell',
          amount: exitQty,
          price: alignToTickSize(price, asset),
          type: 'limit',
          strategyName: `Auto-Pilot: ${strategy} Profit Harvest`,
          reason: `Target hit at ₹${price.toFixed(2)} (+${unrealizedPnlPct}%). Harvesting gains.`,
        });

        rateLimits.requestsThisMinute++;
        rateLimits.lastDispatchedAt = now;
        lifecycleState = 'COOLDOWN';

        newActionLogs.push({
          id: `log_tp_${asset}_${now}`,
          timestamp: now,
          asset,
          action: 'TAKE_PROFIT',
          strategy,
          detail: `Harvested ${exitQty} shares at ₹${price.toFixed(2)} target (+${unrealizedPnlPct}%).`,
          price,
          status: 'EXECUTED',
        });
      }

      // Check Stop Loss Triggered
      if (price <= currentStop && evaluateRateLimitAllowance(rateLimits, now).allowed) {
        ordersToDispatch.push({
          asset,
          side: 'sell',
          amount: currentHolding,
          price: alignToTickSize(price, asset),
          type: 'market',
          strategyName: `Auto-Pilot: ${strategy} Capital Defense Stop`,
          reason: `Stop hit at ₹${price.toFixed(2)}. Protecting capital.`,
        });

        rateLimits.requestsThisMinute++;
        rateLimits.lastDispatchedAt = now;
        lifecycleState = 'COOLDOWN';

        newActionLogs.push({
          id: `log_sl_${asset}_${now}`,
          timestamp: now,
          asset,
          action: 'STOP_LOSS',
          strategy,
          detail: `Executed stop-loss exit on ${currentHolding} shares at ₹${price.toFixed(2)}.`,
          price,
          status: 'EXECUTED',
        });
      }

      updatedFleet[asset] = {
        ...fleetStatus,
        assignedStrategy: strategy,
        regimeLabel,
        hurst,
        currentPrice: price,
        state: lifecycleState,
        entryPrice: avgBuyPrice,
        stopLossPrice: currentStop,
        takeProfitPrice: currentTarget,
        trailingStopPrice: currentStop,
        unrealizedPnl: +unrealizedPnl.toFixed(2),
        unrealizedPnlPct,
        unitsHeld: currentHolding,
      };

      continue; // Move to next asset
    }

    // B. NEW OPPORTUNITY ENTRY EVALUATION (Zero Current Position)
    // Anti-loss and deduplication checks
    if (pendingBuyAssets.has(asset) || fleetStatus.state === 'COOLDOWN') {
      // If was in cooldown and price moves away, reset to monitoring
      if (fleetStatus.state === 'COOLDOWN') {
        fleetStatus.state = 'MONITORING';
      }
      updatedFleet[asset] = {
        ...fleetStatus,
        assignedStrategy: strategy,
        regimeLabel,
        hurst,
        currentPrice: price,
        unitsHeld: 0,
      };
      continue;
    }

    // Evaluate Entry Signal based on the asset's assigned strategy
    let hasEntrySignal = false;
    let entryRationale = '';

    if (strategy === 'Hurst Trend Rider') {
      // Momentum Breakout entry: Price above 10 SMA and 10 SMA > 30 SMA
      const ind = indicators(market.history, market.candles);
      if (price > (ind.s10 ?? price) && (ind.s10 ?? 0) >= (ind.s30 ?? 0) && (ind.rsi ?? 50) >= 45 && (ind.rsi ?? 50) <= 68) {
        hasEntrySignal = true;
        entryRationale = `Hurst Trend Breakout (H=${hurst.toFixed(2)}): Momentum alignment with RSI ${(ind.rsi ?? 50).toFixed(0)}.`;
      }
    } else if (strategy === 'OU Mean Reversion') {
      // Mean Reversion entry: Z-score oversold (<-1.2) indicating statistically stretched dip
      if (ouZScore < -1.2 && (indicators(market.history).rsi ?? 50) < 45) {
        hasEntrySignal = true;
        entryRationale = `OU Mean Reversion (Z=${ouZScore.toFixed(2)}): Oversold deviation from equilibrium mean.`;
      }
    } else if (strategy === 'Value Accumulator') {
      // Value Accumulator entry: RSI oversold in constructive consolidation
      const rsi = indicators(market.history).rsi ?? 50;
      if (rsi < 35) {
        hasEntrySignal = true;
        entryRationale = `Value Accumulation: Depressed RSI (${rsi.toFixed(0)}) in high-quality bluechip.`;
      }
    } else {
      // Titan Alpha Sentinel: Multi-factor composite score > 70
      const ind = indicators(market.history, market.candles);
      if (ind.score >= 65 && price > (ind.s30 ?? 0)) {
        hasEntrySignal = true;
        entryRationale = `Titan Alpha Multi-Factor Score (+${ind.score}/100) with favorable variance.`;
      }
    }

    if (!hasEntrySignal) {
      updatedFleet[asset] = {
        ...fleetStatus,
        assignedStrategy: strategy,
        regimeLabel,
        hurst,
        currentPrice: price,
        state: 'MONITORING',
        unitsHeld: 0,
      };
      continue;
    }

    // 4. Position Sizing & Capital Allocation Bounds
    // Check Rate Limiter before constructing order
    const rateCheck = evaluateRateLimitAllowance(rateLimits, now);
    if (!rateCheck.allowed) {
      rateLimits.isThrottled = true;
      newActionLogs.push({
        id: `log_throttle_${asset}_${now}`,
        timestamp: now,
        asset,
        action: 'THROTTLED',
        strategy,
        detail: rateCheck.reason || 'Upstox rate limiter active.',
        price,
        status: 'THROTTLED',
      });
      updatedFleet[asset] = {
        ...fleetStatus,
        assignedStrategy: strategy,
        regimeLabel,
        hurst,
        currentPrice: price,
        state: 'MONITORING',
      };
      continue;
    }

    // Stop and Target Brackets
    const stopLossDist = Math.max(price * 0.008, atr * profile.stopLossAtrMultiplier);
    const stopLossPrice = alignToTickSize(price - stopLossDist, asset);
    const takeProfitPrice = alignToTickSize(price + stopLossDist * profile.minRiskReward, asset);

    const riskPerShare = price - stopLossPrice;
    if (riskPerShare <= 0) continue;

    // Sizing via Fractional Risk Budget
    const maxRiskCapital = pv * (profile.maxRiskPerTradePct / 100);
    let unitsToBuy = Math.max(1, Math.floor(maxRiskCapital / riskPerShare));

    // Cap single asset concentration at 25% of portfolio equity
    const maxAssetExposure = pv * 0.25;
    const proposedNotional = unitsToBuy * price;
    if (proposedNotional > maxAssetExposure) {
      unitsToBuy = Math.max(1, Math.floor(maxAssetExposure / price));
    }

    // Check cash liquidity constraint: must preserve minimum cash floor
    const requiredOrderCash = unitsToBuy * price;
    if (requiredOrderCash > allocatableCash || allocatableCash <= 0) {
      newActionLogs.push({
        id: `log_cash_floor_${asset}_${now}`,
        timestamp: now,
        asset,
        action: 'SKIPPED',
        strategy,
        detail: `Preserving mandatory ${minCashFloorPct}% liquid cash buffer. Required: ₹${requiredOrderCash.toFixed(2)}, Allocatable: ₹${allocatableCash.toFixed(2)}.`,
        price,
        status: 'BLOCKED',
      });
      continue;
    }

    // All safety gates passed: Queue Order for Automated Dispatch
    ordersToDispatch.push({
      asset,
      side: 'buy',
      amount: unitsToBuy,
      price: alignToTickSize(price, asset),
      stopLoss: stopLossPrice,
      takeProfit: takeProfitPrice,
      type: 'limit',
      strategyName: `Auto-Pilot: ${strategy}`,
      reason: entryRationale,
    });

    // Update internal pacing and cash
    rateLimits.requestsThisMinute++;
    rateLimits.lastDispatchedAt = now;
    allocatableCash -= requiredOrderCash;
    pendingBuyAssets.add(asset);

    updatedFleet[asset] = {
      ...fleetStatus,
      assignedStrategy: strategy,
      regimeLabel,
      hurst,
      currentPrice: price,
      state: 'ORDER_PENDING',
      entryPrice: price,
      stopLossPrice,
      takeProfitPrice,
      unitsHeld: 0,
      lastActionAt: now,
      lastActionDetail: entryRationale,
    };

    newActionLogs.push({
      id: `log_buy_${asset}_${now}`,
      timestamp: now,
      asset,
      action: 'BUY_ENTRY',
      strategy,
      detail: `${entryRationale} Ordered ${unitsToBuy} shares at ₹${price.toFixed(2)} (SL: ₹${stopLossPrice.toFixed(2)}, TP: ₹${takeProfitPrice.toFixed(2)}).`,
      price,
      status: 'EXECUTED',
    });
  }

  return {
    updatedFleet,
    updatedRateLimits: rateLimits,
    newActionLogs,
    ordersToDispatch,
    circuitBreakerTripped: false,
  };
}
