import {
  Asset,
  AppState,
  Market,
  AssetFleetStatus,
  PilotRateLimitStatus,
  PilotActionLog,
  PilotStrategyKind,
  FleetAssetLifecycle,
} from '../types';
import { portfolioValue, isIndianAsset } from './portfolio';
import { indicators } from './indicators';
import { PILOT_PROFILES, alignToTickSize, checkPilotCircuitBreaker } from './autonomousPilot';
import {
  calculateHurstExponent,
  estimateOrnsteinUhlenbeck,
  runKalmanFilter,
  calculateTTMSqueeze,
  calculateHalfKellyFraction,
  getAssetSector,
  validateSectorExposureLimit,
  calculateChandelierExit,
  calculateVolumeMetrics,
  calculateDynamicProfitRatchet,
  evaluateSessionTimingQuality,
  calculateCrossSectionalAlphaRanking,
  calculateSmartLimitPrice,
  calculateRoundtripFriction,
  passesFrictionHurdle,
  lateDayStopCompression,
  deadTradeStagnancyExit,
  volatilityShockFreeze,
  correlationGate,
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
  'HAL',
  'BEL',
  'NTPC',
  'TATASTEEL',
  'SUNPHARMA',
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
  takeProfit2?: number;
  takeProfit3?: number;
  type: 'limit' | 'market';
  product?: 'MIS' | 'CNC';
  strategyName: string;
  reason: string;
  trancheStage?: number;
}

export interface AutonomousPilotTickResult {
  updatedFleet: Record<string, AssetFleetStatus>;
  updatedRateLimits: PilotRateLimitStatus;
  newActionLogs: PilotActionLog[];
  ordersToDispatch: AutonomousPilotOrderProposal[];
  ordersToCancel: string[];
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
      sector: getAssetSector(a),
      squeezeStatus: 'NO_SQUEEZE',
      trancheStage: 0,
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
 * Enriched with TTM Volatility Squeeze, VWAP, and volume surge metrics.
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
  sector: string;
  squeezeStatus: 'SQUEEZE_ON' | 'SQUEEZE_OFF' | 'NO_SQUEEZE';
  vwap: number;
  volumeSurgeRatio: number;
  hasInstitutionalVolume: boolean;
} {
  const price = market?.price || 100;
  const history = market?.history || [];
  const symbol = market?.symbol || (market as any)?.asset || '';

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

  // 4. TTM Volatility Squeeze
  const squeezeRes = history.length >= 15
    ? calculateTTMSqueeze(history)
    : { squeezeState: 'NO_SQUEEZE' as const };

  // 5. Volume & Microstructure Metrics
  const volMetrics = calculateVolumeMetrics(market?.candles, history);

  const hurst = hurstRes.hurst;
  const ouZScore = ouRes.currentZScore;
  const kalmanFairValue = kfRes.finalState.estimatedState;
  const sector = getAssetSector(symbol);

  let strategy: PilotStrategyKind = 'Titan Alpha Sentinel';
  let regimeLabel = 'Equilibrium';

  if (squeezeRes.squeezeState === 'SQUEEZE_OFF' && hurst > 0.52) {
    strategy = 'Hurst Trend Rider';
    regimeLabel = 'Squeeze Breakout Momentum';
  } else if (hurst < 0.45) {
    strategy = 'OU Mean Reversion';
    regimeLabel = 'Anti-Persistent Mean Reversion';
  } else if (squeezeRes.squeezeState === 'SQUEEZE_ON') {
    strategy = hurst > 0.52 ? 'Hurst Trend Rider' : 'Titan Alpha Sentinel';
    regimeLabel = 'TTM Squeeze Compression';
  } else if (ind.rsi < 35) {
    strategy = 'Value Accumulator';
    regimeLabel = 'Oversold Accumulation';
  } else if (hurst > 0.55 && price >= (ind.s10 ?? price)) {
    strategy = 'Hurst Trend Rider';
    regimeLabel = 'Persistent Trending Momentum';
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
    sector,
    squeezeStatus: squeezeRes.squeezeState,
    vwap: volMetrics.vwap,
    volumeSurgeRatio: volMetrics.volumeSurgeRatio,
    hasInstitutionalVolume: volMetrics.hasInstitutionalVolume,
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
 * Enforces Half-Kelly position sizing, multi-tranche profit harvest, sector limits, and Upstox rate limits.
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
      ordersToCancel: [],
      circuitBreakerTripped: true,
      tripReason: cbCheck.reason,
    };
  }

  // If pilot is disabled or semi-autonomous, refresh fleet telemetry without placing orders
  if (!pilot?.enabled || pilot.executionMode !== 'full_autonomous') {
    for (const asset of UPSTOX_FLEET_ASSETS) {
      const m = markets[asset];
      if (!m || !m.price) continue;
      const { strategy, regimeLabel, hurst, sector, squeezeStatus, vwap, volumeSurgeRatio } =
        determineAssetStrategyAndRegime(m);
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
        sector,
        squeezeStatus,
        vwap,
        volumeSurgeRatio,
      };
    }
    return {
      updatedFleet,
      updatedRateLimits: rateLimits,
      newActionLogs: [],
      ordersToDispatch: [],
      ordersToCancel: [],
      circuitBreakerTripped: false,
    };
  }

  // 2. Market Hours & Timing Quality Check (for live Upstox mode)
  const isLiveUpstox = state.accountMode === 'upstox';
  const session = isMarketSessionOpen(now);
  const timingQuality = evaluateSessionTimingQuality(now);

  if (isLiveUpstox && !session.isOpen) {
    return {
      updatedFleet,
      updatedRateLimits: rateLimits,
      newActionLogs: [],
      ordersToDispatch: [],
      ordersToCancel: [],
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

  const ordersToCancel: string[] = [];

  // STALE LIMIT ORDER SWEEPER (Capital Velocity Protection)
  // If an auto limit buy order has been open > 20 minutes AND current market price has rallied > 1.2%
  // above the limit price, the entry setup has expired. We cancel the order to release reserved cash
  // back into allocatable capital for higher-alpha opportunities.
  const STALE_ORDER_MAX_AGE_MS = 20 * 60 * 1000;
  for (const o of state.orders) {
    if (o.auto && o.side === 'buy' && (o.status === 'pending' || o.status === 'partially_filled')) {
      const m = markets[o.asset];
      const ageMs = now - (o.ts || now);
      const limitP = o.limitPrice || o.price;
      if (m && m.price > 0 && limitP > 0 && ageMs >= STALE_ORDER_MAX_AGE_MS) {
        const driftPct = ((m.price - limitP) / limitP) * 100;
        if (driftPct >= 1.2) {
          ordersToCancel.push(o.id);
          newActionLogs.push({
            id: `stale_cancel_${o.id}_${now}`,
            timestamp: now,
            asset: o.asset,
            action: 'STALE_ORDER_CANCELLED',
            strategy: o.strategyName || 'Auto-Pilot Sweeper',
            detail: `Stale limit buy on ${o.asset} @ ₹${limitP.toFixed(2)} timed out after ${Math.round(ageMs / 60000)}m (LTP ₹${m.price.toFixed(2)}, +${driftPct.toFixed(1)}% away). Unlocking capital for higher-alpha opportunities.`,
            price: m.price,
            status: 'EXECUTED',
          });
        }
      }
    }
  }

  const cancelledOrderIds = new Set(ordersToCancel);

  // Set of assets with active pending BUY orders (excluding newly swept orders)
  const pendingBuyAssets = new Set(
    state.orders
      .filter((o) => (o.status === 'pending' || o.status === 'partially_filled') && o.side === 'buy' && !cancelledOrderIds.has(o.id))
      .map((o) => o.asset)
  );

  // 3A. STEP 1: OPEN POSITION MANAGEMENT (Stepped Breakeven Defense & Multi-Tranche Profit Ladder)
  for (const asset of UPSTOX_FLEET_ASSETS) {
    const market = markets[asset];
    if (!market || !market.price || market.price <= 0) continue;

    const currentHolding = state.positions[asset] || 0;
    if (currentHolding <= 0) continue;

    const price = market.price;
    const avgBuyPrice = state.avgBuyPrice?.[asset] || price;
    const {
      strategy,
      regimeLabel,
      hurst,
      atr,
      sector,
      squeezeStatus,
      vwap,
      volumeSurgeRatio,
    } = determineAssetStrategyAndRegime(market);

    let fleetStatus: AssetFleetStatus = updatedFleet[asset] || {
      asset,
      assignedStrategy: strategy,
      regimeLabel,
      hurst,
      currentPrice: price,
      state: 'IN_POSITION' as FleetAssetLifecycle,
      sector,
      squeezeStatus,
      trancheStage: 0,
    };

    const unrealizedPnl = (price - avgBuyPrice) * currentHolding;
    const unrealizedPnlPct = +(((price - avgBuyPrice) / avgBuyPrice) * 100).toFixed(2);

    let currentStop = fleetStatus.stopLossPrice || alignToTickSize(avgBuyPrice - atr * profile.stopLossAtrMultiplier, asset);
    let currentTarget = fleetStatus.takeProfitPrice || alignToTickSize(avgBuyPrice + atr * profile.takeProfitAtrMultiplier, asset);
    let lifecycleState: FleetAssetLifecycle = 'IN_POSITION';
    let trancheStage = fleetStatus.trancheStage || 0;

    // Multi-Tranche Ladder Levels
    const t1Price = alignToTickSize(avgBuyPrice + atr * 1.5, asset);
    const t2Price = currentTarget;
    const t3Chandelier = calculateChandelierExit(market.history, 22, 2.0);

    // Differentiate delivery (CNC) from intraday (MIS) for accurate fee-shielding:
    // If holding exists in Upstox CNC holdings or position.product === 'D'/'CNC', apply delivery clearing friction.
    const isDeliveryHolding = Boolean(
      state.upstoxAccount?.holdings?.some((h) => (h as any).asset === asset || (h as any).tradingsymbol === asset || (h as any).symbol === asset) ||
      state.upstoxAccount?.positions?.some(
        (p) => ((p as any).asset === asset || (p as any).symbol === asset) && (p.product === 'D' || p.product === 'CNC' || p.product === 'DELIVERY')
      )
    );
    const exitProduct: 'CNC' | 'MIS' = isDeliveryHolding ? 'CNC' : 'MIS';
    const roundtripFriction = calculateRoundtripFriction(avgBuyPrice, currentHolding, isDeliveryHolding);
    const highWaterMark = Math.max(fleetStatus.highWaterMark || avgBuyPrice, price);

    // Stepped Trailing Defense: Level 0.5 Micro-Shield (+0.30 ATR -> Breakeven + Fees), Level 1 (+0.70 ATR), Level 2 (+1.40 ATR), Level 3 (+2.00 ATR)
    const dynamicRatchet = calculateDynamicProfitRatchet(
      avgBuyPrice,
      price,
      atr,
      currentStop,
      isIndianAsset(asset) ? 0.05 : 0.01,
      roundtripFriction.frictionPerShare,
      highWaterMark
    );

    if (dynamicRatchet.isRatcheted && dynamicRatchet.ratchetedStopPrice > currentStop) {
      currentStop = dynamicRatchet.ratchetedStopPrice;
      lifecycleState = 'TRAILING_PROFIT';
      newActionLogs.push({
        id: `log_ratchet_${asset}_${now}`,
        timestamp: now,
        asset,
        action: 'TRAILING_RATCHET',
        strategy,
        detail: `Stepped Defense (${dynamicRatchet.stageName}): Ratcheted stop-loss to ₹${currentStop.toFixed(2)} (+${dynamicRatchet.gainAtrMultiples} ATR gain). Net-risk free.`,
        price,
        status: 'EXECUTED',
      });
    }

    // 15:05 IST Intraday Session Square-Off (MIS Mandatory Rule)
    // All intraday MIS positions MUST be closed before 15:10 IST to eliminate overnight gap risk
    // and completely avoid Upstox RMS forced auto-square-off penalty charges (₹50 + GST).
    // Priority exit: Never throttled by rate-limit allowances.
    if (!isDeliveryHolding && timingQuality.isSessionCutoffPhase) {
      ordersToDispatch.push({
        asset,
        side: 'sell',
        amount: currentHolding,
        price: alignToTickSize(price, asset),
        type: 'market',
        product: 'MIS',
        strategyName: `Auto-Pilot: 15:05 MIS Auto Square-Off`,
        reason: `15:05 IST intraday cutoff reached. Closing ${currentHolding} shares of ${asset} @ market to eliminate overnight gap risk and avoid broker penalty.`,
      });

      rateLimits.requestsThisMinute++;
      rateLimits.lastDispatchedAt = now;
      lifecycleState = 'COOLDOWN';
      trancheStage = 0;

      newActionLogs.push({
        id: `log_eod_squareoff_${asset}_${now}`,
        timestamp: now,
        asset,
        action: 'SESSION_CLOSE' as any,
        strategy,
        detail: `15:05 IST Session Cutoff: Auto squared-off ${currentHolding} shares of ${asset} @ ₹${price.toFixed(2)}. Zero overnight exposure.`,
        price,
        status: 'EXECUTED',
      });

      updatedFleet[asset] = {
        ...fleetStatus,
        assignedStrategy: strategy,
        regimeLabel,
        hurst,
        currentPrice: price,
        state: lifecycleState,
        entryPrice: avgBuyPrice,
        stopLossPrice: currentStop,
        takeProfitPrice: t1Price,
        takeProfit2Price: t2Price,
        takeProfit3Price: t3Chandelier,
        unitsHeld: 0,
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
        lastActionAt: now,
        trancheStage,
        highWaterMark,
      };
      continue;
    }

    // Late-Day Liquidation Defense (14:15 - 15:15 IST): Compress stop to protect High-Water Mark before retail MIS square-off
    const lateDayCompression = lateDayStopCompression(
      avgBuyPrice,
      price,
      atr,
      highWaterMark,
      currentStop,
      now,
      isIndianAsset(asset) ? 0.05 : 0.01
    );

    if (lateDayCompression.isCompressed && lateDayCompression.compressedStopPrice > currentStop) {
      currentStop = lateDayCompression.compressedStopPrice;
      lifecycleState = 'TRAILING_PROFIT';
      newActionLogs.push({
        id: `log_lateday_${asset}_${now}`,
        timestamp: now,
        asset,
        action: 'TRAILING_RATCHET',
        strategy,
        detail: lateDayCompression.reason,
        price,
        status: 'EXECUTED',
      });
    }

    // Stagnant Capital / Dead Trade Expiration: After 90 mins with range < 0.25 ATR and volume fading, liquidate orderly
    const entryTimestamp = fleetStatus.entryTimestamp || fleetStatus.lastActionAt || now;
    const elapsedMs = now - entryTimestamp;
    const stagnancyCheck = deadTradeStagnancyExit(
      avgBuyPrice,
      price,
      atr,
      elapsedMs,
      volumeSurgeRatio,
      1.0
    );

    if (stagnancyCheck.shouldExit && evaluateRateLimitAllowance(rateLimits, now).allowed) {
      ordersToDispatch.push({
        asset,
        side: 'sell',
        amount: currentHolding,
        price: alignToTickSize(price, asset),
        type: 'market',
        product: exitProduct,
        strategyName: `Auto-Pilot: ${strategy} Stagnancy Exit`,
        reason: stagnancyCheck.reason,
      });

      rateLimits.requestsThisMinute++;
      rateLimits.lastDispatchedAt = now;
      lifecycleState = 'COOLDOWN';
      trancheStage = 0;

      newActionLogs.push({
        id: `log_stagnant_${asset}_${now}`,
        timestamp: now,
        asset,
        action: 'DEAD_TRADE_EXIT' as any,
        strategy,
        detail: stagnancyCheck.reason,
        price,
        status: 'EXECUTED',
      });
    }

    // Tranche 1 Profit Harvest: Take partial profit (33%) at +1.5 ATR
    if (trancheStage === 0 && price >= t1Price && currentHolding >= 2 && evaluateRateLimitAllowance(rateLimits, now).allowed) {
      const exitQty = Math.max(1, Math.floor(currentHolding * 0.33));
      ordersToDispatch.push({
        asset,
        side: 'sell',
        amount: exitQty,
        price: alignToTickSize(price, asset),
        type: 'limit',
        product: exitProduct,
        strategyName: `Auto-Pilot: ${strategy} Tranche 1 Harvest`,
        reason: `Tranche 1 (+1.5 ATR) reached at ₹${price.toFixed(2)} (+${unrealizedPnlPct}%). Locking partial profit.`,
        trancheStage: 1,
      });

      rateLimits.requestsThisMinute++;
      rateLimits.lastDispatchedAt = now;
      trancheStage = 1;
      currentStop = alignToTickSize(Math.max(currentStop, avgBuyPrice + atr * 0.5), asset);
      lifecycleState = 'TRAILING_PROFIT';

      newActionLogs.push({
        id: `log_t1_${asset}_${now}`,
        timestamp: now,
        asset,
        action: 'PROFIT_HARVEST_T1',
        strategy,
        detail: `Harvested Tranche 1 (33% = ${exitQty} shares) at ₹${price.toFixed(2)} (+${unrealizedPnlPct}%). Stop moved to ₹${currentStop.toFixed(2)}.`,
        price,
        status: 'EXECUTED',
      });
    }
    // Tranche 2 Profit Harvest: Take core target (50% of remaining) at T2
    else if (trancheStage <= 1 && price >= t2Price && evaluateRateLimitAllowance(rateLimits, now).allowed) {
      const exitQty = Math.max(1, Math.floor(currentHolding * 0.5));
      ordersToDispatch.push({
        asset,
        side: 'sell',
        amount: exitQty,
        price: alignToTickSize(price, asset),
        type: 'limit',
        product: exitProduct,
        strategyName: `Auto-Pilot: ${strategy} Core Target Harvest`,
        reason: `Core Target T2 reached at ₹${price.toFixed(2)} (+${unrealizedPnlPct}%). Harvesting core gain.`,
        trancheStage: 2,
      });

      rateLimits.requestsThisMinute++;
      rateLimits.lastDispatchedAt = now;
      trancheStage = 2;
      currentStop = t1Price;
      lifecycleState = currentHolding > exitQty ? 'TRAILING_PROFIT' : 'COOLDOWN';

      newActionLogs.push({
        id: `log_tp_${asset}_${now}`,
        timestamp: now,
        asset,
        action: 'TAKE_PROFIT',
        strategy,
        detail: `Harvested Core Target T2 (${exitQty} shares) at ₹${price.toFixed(2)} (+${unrealizedPnlPct}%). Trailing remainder.`,
        price,
        status: 'EXECUTED',
      });
    }
    // Tranche 3 Chandelier Runner Exit: Trail remainder until breakdown below 22-period high - 2 ATR
    else if (trancheStage >= 2 && price <= t3Chandelier && currentHolding > 0 && evaluateRateLimitAllowance(rateLimits, now).allowed) {
      ordersToDispatch.push({
        asset,
        side: 'sell',
        amount: currentHolding,
        price: alignToTickSize(price, asset),
        type: 'market',
        product: exitProduct,
        strategyName: `Auto-Pilot: ${strategy} Chandelier Runner Exit`,
        reason: `Chandelier Trailing Exit triggered at ₹${price.toFixed(2)}. Final runner closed.`,
        trancheStage: 3,
      });

      rateLimits.requestsThisMinute++;
      rateLimits.lastDispatchedAt = now;
      lifecycleState = 'COOLDOWN';
      trancheStage = 0;

      newActionLogs.push({
        id: `log_chandelier_${asset}_${now}`,
        timestamp: now,
        asset,
        action: 'CHANDELIER_EXIT',
        strategy,
        detail: `Closed final runner (${currentHolding} shares) on Chandelier Exit at ₹${price.toFixed(2)}.`,
        price,
        status: 'EXECUTED',
      });
    }
    // Capital Defense Stop Loss Triggered - Priority Exit (Never throttled by rate limit allowances)
    else if (price <= currentStop) {
      ordersToDispatch.push({
        asset,
        side: 'sell',
        amount: currentHolding,
        price: alignToTickSize(price, asset),
        type: 'market',
        product: exitProduct,
        strategyName: `Auto-Pilot: ${strategy} Capital Defense Stop`,
        reason: `Stop hit at ₹${price.toFixed(2)}. Protecting capital.`,
      });

      rateLimits.requestsThisMinute++;
      rateLimits.lastDispatchedAt = now;
      lifecycleState = 'COOLDOWN';
      trancheStage = 0;

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
      takeProfit2Price: t2Price,
      takeProfit3Price: t3Chandelier,
      trailingStopPrice: currentStop,
      unrealizedPnl: +unrealizedPnl.toFixed(2),
      unrealizedPnlPct,
      unitsHeld: currentHolding,
      sector,
      squeezeStatus,
      trancheStage,
      vwap,
      volumeSurgeRatio,
      highWaterMark,
      entryTimestamp,
    };
  }

  // 3B. STEP 2: CANDIDATE SCANNING ACROSS FLEET (Unallocated Assets)
  interface CandidateSetup {
    asset: Asset;
    market: Market;
    strategy: PilotStrategyKind;
    regimeLabel: string;
    hurst: number;
    ouZScore: number;
    atr: number;
    sector: string;
    squeezeStatus: 'SQUEEZE_ON' | 'SQUEEZE_OFF' | 'NO_SQUEEZE';
    vwap: number;
    volumeSurgeRatio: number;
    hasInstitutionalVolume: boolean;
    entryRationale: string;
    price: number;
  }

  const candidatePool: CandidateSetup[] = [];

  for (const asset of UPSTOX_FLEET_ASSETS) {
    const market = markets[asset];
    if (!market || !market.price || market.price <= 0) continue;

    const currentHolding = state.positions[asset] || 0;
    if (currentHolding > 0) continue; // Handled in position management above

    const price = market.price;
    const {
      strategy,
      regimeLabel,
      hurst,
      ouZScore,
      atr,
      sector,
      squeezeStatus,
      vwap,
      volumeSurgeRatio,
      hasInstitutionalVolume,
    } = determineAssetStrategyAndRegime(market);

    let fleetStatus: AssetFleetStatus = updatedFleet[asset] || {
      asset,
      assignedStrategy: strategy,
      regimeLabel,
      hurst,
      currentPrice: price,
      state: 'MONITORING' as FleetAssetLifecycle,
      sector,
      squeezeStatus,
      trancheStage: 0,
    };

    // Cooldown & pending order check
    if (pendingBuyAssets.has(asset) || fleetStatus.state === 'COOLDOWN') {
      const cooldownElapsed = now - (fleetStatus.lastActionAt || 0);
      if (fleetStatus.state === 'COOLDOWN' && cooldownElapsed > 180000) {
        fleetStatus.state = 'MONITORING';
      } else {
        updatedFleet[asset] = {
          ...fleetStatus,
          assignedStrategy: strategy,
          regimeLabel,
          hurst,
          currentPrice: price,
          unitsHeld: 0,
          sector,
          squeezeStatus,
          vwap,
          volumeSurgeRatio,
        };
        continue;
      }
    }

    // Session Timing Check for New Entries in live Upstox mode
    if (isLiveUpstox && !timingQuality.allowsNewEntries) {
      updatedFleet[asset] = {
        ...fleetStatus,
        assignedStrategy: strategy,
        regimeLabel,
        hurst,
        currentPrice: price,
        state: 'MONITORING',
        unitsHeld: 0,
        sector,
        squeezeStatus,
        vwap,
        volumeSurgeRatio,
      };
      continue;
    }

    // Evaluate Entry Signal based on strategy & microstructure
    let hasEntrySignal = false;
    let entryRationale = '';

    if (strategy === 'Hurst Trend Rider') {
      const ind = indicators(market.history, market.candles);
      const isBreakout = price > (ind.s10 ?? price) && (ind.s10 ?? 0) >= (ind.s30 ?? 0);
      const isHealthyRsi = (ind.rsi ?? 50) >= 45 && (ind.rsi ?? 50) <= 68;
      const isSqueezeRelease = squeezeStatus === 'SQUEEZE_OFF';

      if (isBreakout && (isHealthyRsi || isSqueezeRelease)) {
        hasEntrySignal = true;
        entryRationale = `Hurst Trend Breakout (H=${hurst.toFixed(2)}${isSqueezeRelease ? ' + Squeeze Release' : ''}): Momentum alignment with RSI ${(ind.rsi ?? 50).toFixed(0)}.`;
      }
    } else if (strategy === 'OU Mean Reversion') {
      const rsi = indicators(market.history).rsi ?? 50;
      if (ouZScore < -1.2 && rsi < 45) {
        hasEntrySignal = true;
        entryRationale = `OU Mean Reversion (Z=${ouZScore.toFixed(2)}): Oversold deviation from equilibrium mean (t1/2 confirmed).`;
      }
    } else if (strategy === 'Value Accumulator') {
      const rsi = indicators(market.history).rsi ?? 50;
      if (rsi < 35) {
        hasEntrySignal = true;
        entryRationale = `Value Accumulation: Depressed RSI (${rsi.toFixed(0)}) in high-quality bluechip.`;
      }
    } else {
      const ind = indicators(market.history, market.candles);
      const minScore = 65 + (isLiveUpstox ? Math.min(15, timingQuality.convictionThresholdDelta) : 0);
      if (ind.score >= minScore && price > (ind.s30 ?? 0)) {
        hasEntrySignal = true;
        entryRationale = `Titan Alpha Multi-Factor Score (+${ind.score}/100) with favorable variance.`;
      }
    }

    // Session-Aware Midday Noise Filtration
    if (hasEntrySignal && isLiveUpstox && timingQuality.phase === 'MIDDAY_CONSOLIDATION') {
      if (volumeSurgeRatio < timingQuality.minVolumeSurgeRequired && squeezeStatus !== 'SQUEEZE_OFF' && hurst < 0.60) {
        hasEntrySignal = false; // Filter low-volume midday whipsaws
      }
    }

    if (hasEntrySignal) {
      candidatePool.push({
        asset,
        market,
        strategy,
        regimeLabel,
        hurst,
        ouZScore,
        atr,
        sector,
        squeezeStatus,
        vwap,
        volumeSurgeRatio,
        hasInstitutionalVolume,
        entryRationale,
        price,
      });
    }

    // Update fleet telemetry
    updatedFleet[asset] = {
      ...fleetStatus,
      assignedStrategy: strategy,
      regimeLabel,
      hurst,
      currentPrice: price,
      state: 'MONITORING',
      unitsHeld: 0,
      sector,
      squeezeStatus,
      vwap,
      volumeSurgeRatio,
    };
  }

  // 3C. STEP 3: CROSS-SECTIONAL ALPHA RANKING & CAPITAL ALLOCATION
  const rankedAlphaList = calculateCrossSectionalAlphaRanking(
    candidatePool.map((c) => ({
      asset: c.asset,
      market: c.market,
      hurst: c.hurst,
      squeezeStatus: c.squeezeStatus,
      volumeSurgeRatio: c.volumeSurgeRatio,
      vwap: c.vwap,
    }))
  );

  const alphaByAsset = new Map(rankedAlphaList.map((r) => [r.asset, r]));

  // Sort candidatePool by alpha rank (Rank #1 first!)
  candidatePool.sort((a, b) => {
    const rankA = alphaByAsset.get(a.asset)?.rank ?? 999;
    const rankB = alphaByAsset.get(b.asset)?.rank ?? 999;
    return rankA - rankB;
  });

  // Iterate in order of highest conviction alpha rank
  for (const cand of candidatePool) {
    const ranked = alphaByAsset.get(cand.asset);
    const asset = cand.asset;
    const price = cand.price;
    const atr = cand.atr;
    const sector = cand.sector;
    const strategy = cand.strategy;

    // Update telemetry
    if (updatedFleet[asset]) {
      updatedFleet[asset].alphaRank = ranked?.rank;
      updatedFleet[asset].alphaConvictionIndex = ranked?.alphaConvictionIndex;
    }

    // Check rate limit
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
      continue;
    }

    // Smart Limit Pullback Pricing (Avoids chasing ask/top of candle, adaptively tightened on high conviction)
    const limitPrice = calculateSmartLimitPrice(
      price,
      cand.vwap,
      atr,
      isIndianAsset(asset) ? 0.05 : 0.01,
      ranked?.alphaConvictionIndex
    );

    // Stop and Target Brackets
    const stopLossDist = Math.max(limitPrice * 0.008, atr * profile.stopLossAtrMultiplier);
    const stopLossPrice = alignToTickSize(limitPrice - stopLossDist, asset);
    const takeProfitPrice = alignToTickSize(limitPrice + stopLossDist * profile.minRiskReward, asset);
    // Adaptive Trend Expansion: In confirmed high-Hurst super-trends (H >= 0.62) with Squeeze Release,
    // dynamically expand Tranche 2 take-profit multiplier by 20% to capture larger multi-ATR trend runners!
    const isSuperTrend = cand.hurst >= 0.62 && cand.squeezeStatus === 'SQUEEZE_OFF';
    const dynamicTpMultiplier = isSuperTrend
      ? profile.takeProfitAtrMultiplier * 1.20
      : profile.takeProfitAtrMultiplier;
    const takeProfit2Price = alignToTickSize(limitPrice + atr * dynamicTpMultiplier, asset);
    const takeProfit3Price = calculateChandelierExit(cand.market.history, 22, 2.0);

    const riskPerShare = limitPrice - stopLossPrice;
    if (riskPerShare <= 0) continue;

    // Dynamic Multi-Factor Kelly Win Rate Calibration
    let estWinRate = profileKey === 'conservative' ? 0.65 : profileKey === 'momentum' ? 0.54 : 0.58;
    if (cand.hasInstitutionalVolume) estWinRate += 0.04;
    if (cand.squeezeStatus === 'SQUEEZE_OFF') estWinRate += 0.04;
    if (cand.hurst > 0.60) estWinRate += 0.03;
    if ((ranked?.relativeStrengthPct || 0) > 0) estWinRate += 0.03;
    if ((ranked?.alphaConvictionIndex || 0) >= 75) estWinRate += 0.03;

    // Adaptive Volatility Shock Dampener: In high-volatility chop (ATR/P > 4.5%), dampen Kelly sizing
    if (atr / price > 0.045) {
      estWinRate -= 0.06;
    }

    const rrRatio = (takeProfitPrice - limitPrice) / riskPerShare;
    const kellyRes = calculateHalfKellyFraction(estWinRate, rrRatio, 1.25, 0.4);

    // Sizing via Fractional Risk Budget multiplied by Half-Kelly multiplier
    const baseRiskCapital = pv * (profile.maxRiskPerTradePct / 100);
    const maxRiskCapital = baseRiskCapital * kellyRes.recommendedSizeMultiplier;
    let unitsToBuy = Math.max(1, Math.floor(maxRiskCapital / riskPerShare));

    // Cap single asset concentration at 25% of portfolio equity
    const maxAssetExposure = pv * 0.25;
    let proposedNotional = unitsToBuy * limitPrice;
    if (proposedNotional > maxAssetExposure) {
      unitsToBuy = Math.max(1, Math.floor(maxAssetExposure / limitPrice));
      proposedNotional = unitsToBuy * limitPrice;
    }

    // Check cash liquidity constraint: must preserve mandatory cash reserve floor
    const requiredOrderCash = unitsToBuy * limitPrice;
    if (requiredOrderCash > allocatableCash || allocatableCash <= 0) {
      const recentCashSkip = state.autonomousPilot?.actionLogs?.find(
        (l) => l.asset === asset && l.action === 'SKIPPED' && now - l.timestamp < 300_000
      );
      if (!recentCashSkip) {
        newActionLogs.push({
          id: `log_cash_floor_${asset}_${now}`,
          timestamp: now,
          asset,
          action: 'SKIPPED',
          strategy,
          detail: `Preserving mandatory ${minCashFloorPct}% liquid cash buffer. Required: ₹${requiredOrderCash.toFixed(2)}, Allocatable: ₹${allocatableCash.toFixed(2)}.`,
          price: limitPrice,
          status: 'BLOCKED',
        });
      }
      continue;
    }

    // Sector Concentration Defense (Max 35% of total portfolio in any single sector)
    const sectorCheck = validateSectorExposureLimit(
      asset,
      proposedNotional,
      state.positions,
      markets,
      pv,
      35.0
    );

    if (!sectorCheck.allowed) {
      const recentSectorCap = state.autonomousPilot?.actionLogs?.find(
        (l) => l.asset === asset && l.action === 'SECTOR_CAP_DEFENSE' && now - l.timestamp < 300_000
      );
      if (!recentSectorCap) {
        newActionLogs.push({
          id: `log_sector_${asset}_${now}`,
          timestamp: now,
          asset,
          action: 'SECTOR_CAP_DEFENSE',
          strategy,
          detail: sectorCheck.reason || `Sector concentration cap (35%) reached for ${sector}.`,
          price: limitPrice,
          status: 'BLOCKED',
        });
      }
      continue;
    }

    // Pre-Trade TCA Friction Hurdle: Expected profit must be >= 3.0x roundtrip friction
    // Autonomous pilot orders execute as Intraday MIS by default
    const isDeliveryOrder = false;
    const expectedGrossProfit = (takeProfitPrice - limitPrice) * unitsToBuy;
    const orderFriction = calculateRoundtripFriction(limitPrice, unitsToBuy, isDeliveryOrder);
    if (!passesFrictionHurdle(expectedGrossProfit, orderFriction.totalRoundtripFriction, 3.0)) {
      const recentTcaSkip = state.autonomousPilot?.actionLogs?.find(
        (l) => l.asset === asset && l.action === 'SKIPPED' && now - l.timestamp < 300_000
      );
      if (!recentTcaSkip) {
        newActionLogs.push({
          id: `log_tca_${asset}_${now}`,
          timestamp: now,
          asset,
          action: 'SKIPPED',
          strategy,
          detail: `TCA Friction Hurdle: Expected profit ₹${expectedGrossProfit.toFixed(2)} is less than 3x roundtrip fees (₹${(3 * orderFriction.totalRoundtripFriction).toFixed(2)}). Setup rejected to avoid negative expectancy.`,
          price: limitPrice,
          status: 'BLOCKED',
        });
      }
      continue;
    }

    // Portfolio Correlation Gate: Prevent concentrated correlated drawdown
    const heldAssets = (Object.keys(state.positions) as Asset[]).filter((k) => (state.positions[k] || 0) > 0);
    const corrCheck = correlationGate(asset, cand.market.history || [], heldAssets, markets, 0.75);
    if (!corrCheck.allowed) {
      const recentCorrSkip = state.autonomousPilot?.actionLogs?.find(
        (l) => l.asset === asset && l.action === 'CORRELATION_DEFENSE' && now - l.timestamp < 300_000
      );
      if (!recentCorrSkip) {
        newActionLogs.push({
          id: `log_corr_${asset}_${now}`,
          timestamp: now,
          asset,
          action: 'CORRELATION_DEFENSE',
          strategy,
          detail: corrCheck.reason,
          price: limitPrice,
          status: 'BLOCKED',
        });
      }
      continue;
    }

    // All safety gates passed: Queue Order for Automated Dispatch
    ordersToDispatch.push({
      asset,
      side: 'buy',
      amount: unitsToBuy,
      price: limitPrice,
      stopLoss: stopLossPrice,
      takeProfit: takeProfitPrice,
      takeProfit2: takeProfit2Price,
      takeProfit3: takeProfit3Price,
      type: 'limit',
      product: 'MIS',
      strategyName: `Auto-Pilot: ${strategy} [Rank #${ranked?.rank || 1} ACI:${ranked?.alphaConvictionIndex || 0}]`,
      reason: `${cand.entryRationale} [Rank #${ranked?.rank || 1}, ACI:${ranked?.alphaConvictionIndex || 0}, Half-Kelly: ${kellyRes.recommendedSizeMultiplier}x, Sector: ${sector}]`,
    });

    // Update internal pacing and cash
    rateLimits.requestsThisMinute++;
    rateLimits.lastDispatchedAt = now;
    allocatableCash -= requiredOrderCash;
    pendingBuyAssets.add(asset);

    updatedFleet[asset] = {
      ...updatedFleet[asset],
      assignedStrategy: strategy,
      regimeLabel: cand.regimeLabel,
      hurst: cand.hurst,
      currentPrice: price,
      state: 'ORDER_PENDING',
      entryPrice: limitPrice,
      stopLossPrice,
      takeProfitPrice,
      takeProfit2Price,
      takeProfit3Price,
      unitsHeld: 0,
      lastActionAt: now,
      lastActionDetail: cand.entryRationale,
      sector,
      squeezeStatus: cand.squeezeStatus,
      trancheStage: 0,
      kellyFraction: kellyRes.recommendedSizeMultiplier,
      vwap: cand.vwap,
      volumeSurgeRatio: cand.volumeSurgeRatio,
      alphaRank: ranked?.rank,
      alphaConvictionIndex: ranked?.alphaConvictionIndex,
    };

    newActionLogs.push({
      id: `log_buy_${asset}_${now}`,
      timestamp: now,
      asset,
      action: 'BUY_ENTRY',
      strategy,
      detail: `[Rank #${ranked?.rank || 1} ACI:${ranked?.alphaConvictionIndex || 0}] ${cand.entryRationale} Limit buy ordered for ${unitsToBuy} shares at ₹${limitPrice.toFixed(2)} (SL: ₹${stopLossPrice.toFixed(2)}, T1: ₹${takeProfitPrice.toFixed(2)}, T2: ₹${takeProfit2Price.toFixed(2)}).`,
      price: limitPrice,
      status: 'EXECUTED',
    });
  }

  return {
    updatedFleet,
    updatedRateLimits: rateLimits,
    newActionLogs,
    ordersToDispatch,
    ordersToCancel,
    circuitBreakerTripped: false,
  };
}
