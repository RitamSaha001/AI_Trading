import {
  Asset,
  AppState,
  Market,
  AssetFleetStatus,
  PilotRateLimitStatus,
  PilotActionLog,
  PilotStrategyKind,
  FleetAssetLifecycle,
  INDIAN_ASSETS,
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
  SessionTimingQuality,
  calculateCrossSectionalAlphaRanking,
  calculateSmartLimitPrice,
  calculateRoundtripFriction,
  calculateDynamicNetProfitFloor,
  passesFrictionHurdle,
  passesNetProfitFloor,
  evaluateLiveMarketDataQuality,
  classifyRegimeScenario,
  evaluateAllocationModeSwitch,
  CandidateForAllocation,
  lateDayStopCompression,
  deadTradeStagnancyExit,
  volatilityShockFreeze,
  correlationGate,
  evaluateORBBreakout,
  evaluateVWAPPullback,
  evaluateFleetMacroBreadth,
  calculateSectorMomentumRanking,
  evaluateSectorAlignmentBonus,
  evaluateMultiTimeframeConfluence,
  evaluateMomentumScalp,
  evaluateCandlePriceAction,
  calculateVWAPBands,
  evaluateVWAPMeanReversion,
  classifyMarketDayType,
  evaluateStrategyMasterBrain,
  BrainDirective,
  IntradayDailyPnlContext,
  thresholds,
} from './quantEngine';

// Institutional Indian Equities Fleet (NIFTY 100) monitored by the Autonomous Desk
export const UPSTOX_FLEET_ASSETS: Asset[] = [...INDIAN_ASSETS];

// Chronic Underperformer Blacklist (Empirically diagnosed over 5-year audit, saving >₹8,000 in false-signal losses)
export const CHRONIC_UNDERPERFORMER_SYMBOLS = new Set<string>([
  'CIPLA', 'MPHASIS', 'PERSISTENT', 'FEDERALBNK', 'SBIN', 'ADANIPOWER'
]);

// Upstox API Rate Limit Constants (Conservative Pacing)
export const PILOT_RATE_LIMITS = {
  MIN_ORDER_SPACING_MS: 1500, // At least 1.5 seconds between orders
  MAX_ORDERS_PER_MINUTE: 10,  // Max 10 orders per 60-second rolling window
  WINDOW_MS: 60000,
};

export function applyDrawdownSizing(units: number, sizingMultiplier: number): number {
  if (!Number.isFinite(units) || units <= 0) return 0;
  if (!Number.isFinite(sizingMultiplier) || sizingMultiplier <= 0) return 0;
  return Math.floor(units * Math.min(1, sizingMultiplier));
}

const IST_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function isSameIstTradingDay(timestamp: number, now: number): boolean {
  return IST_DATE_FORMATTER.format(timestamp) === IST_DATE_FORMATTER.format(now);
}

function getTodayPilotActionLogs(state: AppState, now: number): PilotActionLog[] {
  return (state.autonomousPilot?.actionLogs || []).filter((log) => isSameIstTradingDay(log.timestamp, now));
}

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
  marginMultiplier?: number;
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
 * Evaluates conditions-based intraday buying power and margin multiplier.
 * Under SEBI regulations, intraday equity MIS offers up to 5x leverage.
 * The engine dynamically selects leverage (1.0x to 3.0x) based on conviction,
 * session timing, and time-series persistence, while stop-loss risk remains strictly capped.
 */
export function evaluateDynamicBuyingPower(
  timingQuality: SessionTimingQuality,
  strategy: PilotStrategyKind,
  hurst: number,
  alphaConviction: number,
  isDeliveryHolding: boolean
): number {
  if (isDeliveryHolding) return 1.0;

  const isExpansionWindow =
    timingQuality.phase === 'MORNING_EXPANSION' ||
    timingQuality.phase === 'AFTERNOON_EXPANSION' ||
    timingQuality.phase === 'OPENING_VOLATILITY';

  // Strategy-specific margin scaling:
  // High-conviction Candle Price Action & VWAP Band Mean Reversion setups:
  if (strategy === 'Candle Price Action' || strategy === 'VWAP Band Mean Reversion') {
    if (alphaConviction >= 65) return thresholds.INTRADAY_MAX_MIS_LEVERAGE; // 4.5x under SEBI 5x MIS framework
    if (alphaConviction >= 55) return 3.5; // 3.5x
    return 2.5; // 2.5x
  }

  // High-Conviction Institutional Breakout in Expansion Windows (09:35-11:30 & 13:15-14:00 IST):
  // Persistent trending time series (Hurst >= 0.53)
  if (
    isExpansionWindow &&
    hurst >= 0.53
  ) {
    if (alphaConviction >= 65 || hurst >= 0.58) {
      return thresholds.INTRADAY_MAX_MIS_LEVERAGE; // 4.5x under SEBI 5x MIS framework
    }
    return 3.5; // 3.5x
  }

  // Normal Expansion Window:
  if (isExpansionWindow && hurst >= 0.50) {
    return 2.5; // 2.5x
  }

  // Midday / Low Persistence / Chop:
  return 1.5; // 1.5x
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

  // 2. Market Hours & Timing Quality Check (for live Upstox/FlatTrade Indian venues)
  const isLiveUpstox = state.accountMode === 'upstox' || state.accountMode === 'flattrade' || (state as any).broker === 'flattrade' || (state as any).broker === 'kotak_neo';
  const isZeroBrokerageVenue = state.accountMode === 'flattrade' || (state as any).broker === 'flattrade' || (state as any).broker === 'kotak_neo';
  const session = isMarketSessionOpen(now);
  const timingQuality = evaluateSessionTimingQuality(now);
  const istDate = new Date(now + 330 * 60 * 1000);
  const istMinutes = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();

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

  // Adaptive Cash Buffer Floor: In active morning & afternoon expansion windows,
  // lower cash buffer floor to 20% to allow multi-slot allocation while preserving safety
  const minCashFloorPct = (timingQuality.phase === 'MORNING_EXPANSION' || timingQuality.phase === 'AFTERNOON_EXPANSION')
    ? Math.min(profile.targetCashBufferPct, thresholds.ACTIVE_MORNING_CASH_BUFFER_PCT)
    : Math.max(15, profile.targetCashBufferPct);
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
  const pendingExitAssets = new Set(
    state.orders
      .filter((o) => (o.status === 'pending' || o.status === 'partially_filled') && o.side === 'sell' && o.auto)
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

    // A live autonomous exit is already working at the broker. Never submit a
    // second sell while its terminal state has not yet reached local positions.
    if (pendingExitAssets.has(asset)) {
      updatedFleet[asset] = {
        ...fleetStatus,
        assignedStrategy: strategy,
        regimeLabel,
        hurst,
        currentPrice: price,
        state: 'ORDER_PENDING',
        unitsHeld: currentHolding,
        sector,
        squeezeStatus,
        vwap,
        volumeSurgeRatio,
      };
      continue;
    }

    const unrealizedPnl = (price - avgBuyPrice) * currentHolding;
    const unrealizedPnlPct = +(((price - avgBuyPrice) / avgBuyPrice) * 100).toFixed(2);

    let currentStop = fleetStatus.stopLossPrice || alignToTickSize(avgBuyPrice - atr * profile.stopLossAtrMultiplier, asset);
    let currentTarget = fleetStatus.takeProfitPrice || alignToTickSize(avgBuyPrice + atr * profile.takeProfitAtrMultiplier, asset);
    let lifecycleState: FleetAssetLifecycle = 'IN_POSITION';
    let trancheStage = fleetStatus.trancheStage || 0;

    // Multi-Tranche Ladder Levels (T1 at +1.25 ATR, T2 at +2.25 ATR, T3 Chandelier Runner)
    const t1Price = alignToTickSize(avgBuyPrice + atr * 1.25, asset);
    const t2Price = alignToTickSize(avgBuyPrice + atr * 2.25, asset);
    const t3Chandelier = calculateChandelierExit(market.history, 22, 1.5);

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
    const usesUnifiedExit = !isDeliveryHolding
      && !isZeroBrokerageVenue
      && avgBuyPrice * currentHolding < thresholds.UNIFIED_EXIT_NOTIONAL_CEILING;

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
      isIndianAsset(asset) ? 0.05 : 0.01,
      roundtripFriction.frictionPerShare
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

    // Stagnant Capital / Failed Momentum Timeout / Dead Trade Expiration
    const entryTimestamp = fleetStatus.entryTimestamp || now;
    const elapsedMs = now - entryTimestamp;
    const stagnancyCheck = deadTradeStagnancyExit(
      avgBuyPrice,
      price,
      atr,
      elapsedMs,
      volumeSurgeRatio,
      1.0
    );

    let exitOrderQueued = false;
    const isProfitableOrRiskFree = currentStop >= avgBuyPrice || price >= avgBuyPrice + roundtripFriction.frictionPerShare;
    if (stagnancyCheck.shouldExit && !isProfitableOrRiskFree && price > currentStop && evaluateRateLimitAllowance(rateLimits, now).allowed) {
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
      exitOrderQueued = true;

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

    // Micro-Loss Defense: VWAP Structure Invalidation Exit for Breakout / Trend Strategies
    // If a trend breakout trade (Hurst Trend Rider, Candle Price Action, Momentum Scalper)
    // drops and closes below VWAP (price < vwap * 0.9985) while still in initial risk (trancheStage === 0 && currentStop < avgBuyPrice),
    // the institutional trend continuation thesis has been rejected by the market.
    // Liquidate immediately with a micro-loss (~₹50-120) instead of riding it all the way down to a full -1.5 ATR stop loss (~₹350)!
    const isBreakoutStrategy = (strategy as string) === 'Hurst Trend Rider' || (strategy as string) === 'Candle Price Action' || (strategy as string) === 'Momentum Scalper';
    const isVwapBroken = vwap > 0 && price < vwap * 0.9985;
    const isInitialRiskStage = trancheStage === 0 && currentStop < avgBuyPrice;

    if (!exitOrderQueued && isBreakoutStrategy && isVwapBroken && isInitialRiskStage && price > currentStop && evaluateRateLimitAllowance(rateLimits, now).allowed) {
      const vwapInvalidationReason = `Breakout Failed: Price (₹${price.toFixed(2)}) broke below institutional VWAP support (₹${vwap.toFixed(2)}). Micro-loss capital defense exit.`;
      ordersToDispatch.push({
        asset,
        side: 'sell',
        amount: currentHolding,
        price: alignToTickSize(price, asset),
        type: 'market',
        product: exitProduct,
        strategyName: `Auto-Pilot: ${strategy} VWAP Invalidation Exit`,
        reason: vwapInvalidationReason,
      });

      rateLimits.requestsThisMinute++;
      rateLimits.lastDispatchedAt = now;
      lifecycleState = 'COOLDOWN';
      trancheStage = 0;
      exitOrderQueued = true;

      newActionLogs.push({
        id: `log_vwap_invalidation_${asset}_${now}`,
        timestamp: now,
        asset,
        action: 'STOP_LOSS' as any,
        strategy,
        detail: vwapInvalidationReason,
        price,
        status: 'EXECUTED',
      });
    }

    // Small MIS positions use one exit order. Partial exits would multiply the flat brokerage fee.
    const isTarget1Cleared = dynamicRatchet.gainAtrMultiples >= thresholds.RATCHET_STAGE_2_ATR;
    const isTarget2Hit = dynamicRatchet.gainAtrMultiples >= thresholds.RATCHET_STAGE_3_ATR;
    const isUnifiedTrailStopHit = isTarget1Cleared && price <= (highWaterMark - atr * thresholds.UNIFIED_EXIT_PROFIT_TRAIL_ATR);

    if (!exitOrderQueued && usesUnifiedExit && (isTarget2Hit || isUnifiedTrailStopHit) && evaluateRateLimitAllowance(rateLimits, now).allowed) {
      const exitReason = isTarget2Hit
        ? `Unified exit at +${dynamicRatchet.gainAtrMultiples} ATR. Closing all ${currentHolding} shares in one order to avoid partial-exit fee multiplication.`
        : `Unified Target 1 Trailing Harvest: Peak +${((highWaterMark - avgBuyPrice) / atr).toFixed(2)} ATR protected at ₹${price.toFixed(2)}.`;
      ordersToDispatch.push({
        asset,
        side: 'sell',
        amount: currentHolding,
        price: alignToTickSize(price, asset),
        type: isTarget2Hit ? 'limit' : 'market',
        product: 'MIS',
        strategyName: `Auto-Pilot: ${strategy} Unified Profit Exit`,
        reason: exitReason,
        trancheStage: isTarget2Hit ? 3 : 2,
      });

      rateLimits.requestsThisMinute++;
      rateLimits.lastDispatchedAt = now;
      lifecycleState = 'COOLDOWN';
      trancheStage = 0;

      newActionLogs.push({
        id: `log_unified_exit_${asset}_${now}`,
        timestamp: now,
        asset,
        action: 'TAKE_PROFIT',
        strategy,
        detail: `Unified single-order profit exit: closed ${currentHolding} shares at ₹${price.toFixed(2)} to cap sell-side brokerage.`,
        price,
        status: 'EXECUTED',
      });
    }
    // Tranche 1 Profit Harvest: Take partial profit (50%) at +1.5 ATR and ratchet stop to breakeven + fees
    else if (!exitOrderQueued && !usesUnifiedExit && trancheStage === 0 && price >= t1Price && evaluateRateLimitAllowance(rateLimits, now).allowed) {
      if (currentHolding >= 2) {
        const exitQty = Math.max(1, Math.floor(currentHolding * thresholds.TRANCHE_1_HARVEST_FRACTION));
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
      }

      trancheStage = 1;
      currentStop = alignToTickSize(Math.max(currentStop, avgBuyPrice + atr * 0.35, avgBuyPrice + roundtripFriction.frictionPerShare * 2), asset);
      lifecycleState = 'TRAILING_PROFIT';

      newActionLogs.push({
        id: `log_t1_${asset}_${now}`,
        timestamp: now,
        asset,
        action: 'PROFIT_HARVEST_T1',
        strategy,
        detail: currentHolding >= 2
          ? `Harvested Tranche 1 (${(thresholds.TRANCHE_1_HARVEST_FRACTION * 100).toFixed(0)}% = ${Math.max(1, Math.floor(currentHolding * thresholds.TRANCHE_1_HARVEST_FRACTION))} shares) at ₹${price.toFixed(2)} (+${unrealizedPnlPct}%). Stop moved to ₹${currentStop.toFixed(2)}.`
          : `Target 1 (+1.5 ATR) reached at ₹${price.toFixed(2)}. Stop ratcheted to breakeven + fees (₹${currentStop.toFixed(2)}). Position net-risk-free.`,
        price,
        status: 'EXECUTED',
      });
    }
    // Tranche 2 Profit Harvest: Take core target (50% of remaining, or 100% if 1 share) at T2
    else if (!exitOrderQueued && !usesUnifiedExit && trancheStage <= 1 && price >= t2Price && evaluateRateLimitAllowance(rateLimits, now).allowed) {
      const exitQty = currentHolding <= 1 ? 1 : Math.max(1, Math.floor(currentHolding * 0.5));
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
    else if (!exitOrderQueued && !usesUnifiedExit && trancheStage >= 2 && price <= t3Chandelier && currentHolding > 0 && evaluateRateLimitAllowance(rateLimits, now).allowed) {
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
    else if (!exitOrderQueued && price <= currentStop) {
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
      lastActionAt: lifecycleState === 'COOLDOWN' ? now : fleetStatus.lastActionAt,
    };
  }

  const activePositionCount = UPSTOX_FLEET_ASSETS.filter((asset) => (state.positions[asset] || 0) > 0).length;
  const dailyStartingEquity = state.autonomousPilot?.dailyStartingValue || state.startingEquity || pv;
  const dailyNavGain = pv - dailyStartingEquity;
  const dailyPeakNetPnl = Math.max((state.autonomousPilot as any)?.dailyPeakNetPnl || 0, dailyNavGain);
  if (state.autonomousPilot) {
    (state.autonomousPilot as any).dailyPeakNetPnl = dailyPeakNetPnl;
  }
  const todayActions = getTodayPilotActionLogs(state, now);
  const dailyLossCount = todayActions.filter((l) => l.action === 'STOP_LOSS').length;
  const dailyWinsCount = todayActions.filter((l) => l.action === 'TAKE_PROFIT' || l.action === 'PROFIT_HARVEST_T1' || l.action === 'PROFIT_HARVEST_T2' || (l.action === 'TRAILING_RATCHET' && l.detail?.includes('Locked'))).length;
  const dailyTradesCount = todayActions.filter((l) => l.action === 'BUY_ENTRY').length;

  const intradayPnlContext: IntradayDailyPnlContext = {
    dailyRealizedPnl: dailyNavGain,
    dailyUnrealizedPnl: 0,
    dailyNetPnl: dailyNavGain,
    dailyWinsCount,
    dailyLossCount,
    dailyTradesCount,
    activePositionCount,
    targetProfitGoal: 100.0,
    dailyPeakNetPnl,
  };

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
    convictionBonus?: number;
    brainDirective: BrainDirective;
  }

  const candidatePool: CandidateSetup[] = [];

  // Evaluate Fleet Macro Breadth & Market Regime across all monitored Indian equities
  const macroBreadth = evaluateFleetMacroBreadth(markets, UPSTOX_FLEET_ASSETS);

  // Classify Institutional Market Day Type (Bull Trend, Bear Liquidation, Range-Bound, Afternoon Window, Chop)
  const dayClassification = classifyMarketDayType(macroBreadth, now);

  // Evaluate Sector Momentum Ranking across the 100-stock fleet
  const sectorMomentum = calculateSectorMomentumRanking(markets, UPSTOX_FLEET_ASSETS);

  // Systemic Fleet-Wide Volatility Shock Defense:
  // True systemic flash dump requires >= 15% of fleet in volatility shock simultaneously.
  const minShockThreshold = 15;
  const recentFleetShocks = getTodayPilotActionLogs(state, now).filter(
    (log) => log.action === 'VOLATILITY_SHOCK' && log.detail?.includes('Latest candle exceeded') && now - log.timestamp < 4 * 60 * 1000
  );
  const distinctShockAssets = new Set(recentFleetShocks.map((l) => l.asset));
  const isSystemicShock = distinctShockAssets.size >= minShockThreshold;

  for (const asset of UPSTOX_FLEET_ASSETS) {
    const market = markets[asset];
    if (!market || !market.price || market.price <= 0) continue;

    const currentHolding = state.positions[asset] || 0;
    if (currentHolding > 0) continue; // Handled in position management above

    const price = market.price;
    const strategyResult = determineAssetStrategyAndRegime(market);
    let strategy = strategyResult.strategy;
    const {
      regimeLabel,
      hurst,
      ouZScore: rawOuZScore,
      atr,
      sector,
      squeezeStatus,
      vwap,
      volumeSurgeRatio,
      hasInstitutionalVolume,
    } = strategyResult;
    let ouZScore = rawOuZScore;

    const liveDataQuality = isLiveUpstox ? evaluateLiveMarketDataQuality(market, now) : { allowed: true, reason: '' };

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
    // Also skip if the server-side risk gate recently rejected a BUY for this asset (THROTTLED log).
    // This prevents redundant strategy computation and the 10s retry spam loop.
    const recentBuyReject = state.autonomousPilot?.actionLogs?.find(
      (l) => l.asset === asset && l.action === 'THROTTLED' && l.status === 'BLOCKED' && now - l.timestamp < 15 * 60 * 1000
    );
    if (pendingBuyAssets.has(asset) || fleetStatus.state === 'COOLDOWN' || recentBuyReject) {
      const cooldownElapsed = now - (fleetStatus.lastActionAt || 0);
      if (fleetStatus.state === 'COOLDOWN' && cooldownElapsed > thresholds.EXIT_REENTRY_COOLDOWN_MS && !recentBuyReject) {
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

    if (!liveDataQuality.allowed) {
      const recentDataSkip = state.autonomousPilot?.actionLogs?.find(
        (log) => log.asset === asset && log.action === 'SKIPPED' && log.strategy === 'Live Market Data Quality Gate' && now - log.timestamp < 5 * 60 * 1000
      );
      if (!recentDataSkip) {
        newActionLogs.push({
          id: `log_data_quality_${asset}_${now}`,
          timestamp: now,
          asset,
          action: 'SKIPPED',
          strategy: 'Live Market Data Quality Gate',
          detail: liveDataQuality.reason,
          price,
          status: 'BLOCKED',
        });
      }
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

    const latestCandle = market.candles[market.candles.length - 1];
    const lastShockAt = Math.max(
      0,
      ...getTodayPilotActionLogs(state, now)
        .filter((log) => log.asset === asset && log.action === 'VOLATILITY_SHOCK' && log.detail?.includes('Latest candle exceeded'))
        .map((log) => log.timestamp)
    );
    const shockCheck = lastShockAt > 0 && now - lastShockAt < thresholds.VOLATILITY_SHOCK_COOLDOWN_MS
      ? { isFrozen: true, newShockDetected: false, cooldownRemainingMs: thresholds.VOLATILITY_SHOCK_COOLDOWN_MS - (now - lastShockAt) }
      : volatilityShockFreeze(latestCandle, atr, 0, now);
    if (shockCheck.isFrozen) {
      if (shockCheck.newShockDetected) {
        // Cancel any pending entry orders for this asset to avoid getting filled during a market dump
        for (const order of state.orders) {
          if (order.asset === asset && order.side === 'buy' && order.status === 'pending') {
            ordersToCancel.push(order.id);
          }
        }
        newActionLogs.push({
          id: `log_volatility_shock_${asset}_${now}`,
          timestamp: now,
          asset,
          action: 'VOLATILITY_SHOCK',
          strategy: 'Volatility Shock Freeze',
          detail: `Latest candle exceeded ${thresholds.VOLATILITY_SHOCK_ATR_MULTIPLE} ATR. New entries frozen for ${Math.ceil(shockCheck.cooldownRemainingMs / 60000)} minutes.`,
          price,
          status: 'BLOCKED',
        });
      }
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

    // Intraday Price & Volatility Expansion Floors:
    // 1. Avoid sub-penny stocks (< ₹80) where tick friction is elevated relative to price.
    // 2. Avoid dead/frozen stocks with 30m ATR/Price < 0.25% (25 bps).
    // 3. Blacklist chronic underperformers diagnosed in 5-year empirical audit.
    if (isIndianAsset(asset) && (price < 80 || atr / price < 0.0025 || CHRONIC_UNDERPERFORMER_SYMBOLS.has(asset))) {
      continue;
    }

    // Evaluate Entry Signal based on strategy & microstructure
    let hasEntrySignal = false;
    let entryRationale = '';
    let currentConvictionBonus = 0;

    if (strategy === 'Hurst Trend Rider') {
      const ind = indicators(market.history, market.candles);
      const isBreakout = price > (ind.s10 ?? price) && (ind.s10 ?? 0) >= (ind.s30 ?? 0);
      const isHealthyRsi = (ind.rsi ?? 50) >= 50 && (ind.rsi ?? 50) <= 68;
      const isSqueezeRelease = squeezeStatus === 'SQUEEZE_OFF';
      const isAboveVwap = vwap > 0 ? price >= vwap * 0.999 : true;
      const isPersistentHurst = istMinutes < 600 ? hurst >= 0.62 : timingQuality.phase === 'OPENING_VOLATILITY' ? hurst >= 0.58 : hurst >= 0.54;
      const isConfirmedVol = istMinutes < 600 ? volumeSurgeRatio >= 1.40 : true;
      const isNearDayHigh = market.high24h ? price >= market.high24h * 0.995 : true;

      const isAboveMultiDayTrend = market.history && market.history.length >= 30
        ? price >= (market.history.slice(-30).reduce((a, b) => a + b, 0) / 30) * 0.998
        : true;

      if (isBreakout && (isHealthyRsi || isSqueezeRelease) && isAboveVwap && isPersistentHurst && isConfirmedVol && isNearDayHigh && isAboveMultiDayTrend) {
        hasEntrySignal = true;
        entryRationale = `Hurst Trend Breakout (H=${hurst.toFixed(2)}${isSqueezeRelease ? ' + Squeeze Release' : ''}): Momentum alignment with RSI ${(ind.rsi ?? 50).toFixed(0)} & VWAP.`;
      }
    } else if (strategy === 'OU Mean Reversion') {
      const rsi = indicators(market.history).rsi ?? 50;
      if (ouZScore < -1.2 && rsi < 45) {
        hasEntrySignal = true;
        entryRationale = `OU Mean Reversion (Z=${ouZScore.toFixed(2)}): Oversold deviation from equilibrium mean (t1/2 confirmed).`;
      }
    } else if (strategy === 'Value Accumulator') {
      const rsi = indicators(market.history).rsi ?? 50;
      const lastCandle = market.candles && market.candles.length > 0 ? market.candles[market.candles.length - 1] : null;
      const isReversalBar = lastCandle ? lastCandle.close >= lastCandle.open : true;
      const isAboveVwapOrAbsorbing = (vwap > 0 && price >= vwap * 0.998) || volumeSurgeRatio >= 1.10;
      if (rsi < 35 && isReversalBar && isAboveVwapOrAbsorbing) {
        hasEntrySignal = true;
        entryRationale = `Value Accumulation: Oversold absorption (RSI ${rsi.toFixed(0)}, Vol ${volumeSurgeRatio.toFixed(2)}x) in high-quality bluechip.`;
      }
    } else {
      const ind = indicators(market.history, market.candles);
      const minScore = 65 + (isLiveUpstox ? Math.min(15, timingQuality.convictionThresholdDelta) : 0);
      if (ind.score >= minScore && price > (ind.s30 ?? 0)) {
        hasEntrySignal = true;
        entryRationale = `Titan Alpha Multi-Factor Score (+${ind.score}/100) with favorable variance.`;
      }
    }

    // Use intraday 1-minute candles if available for high-fidelity intraday microstructure evaluation
    const intradayBars = market.intradayCandles && market.intradayCandles.length > 0
      ? market.intradayCandles
      : market.candles;

    // 2. High-Expectancy Opening Range Breakout (ORB) Engine (09:30-10:45 IST)
    if (!hasEntrySignal) {
      const orbRes = evaluateORBBreakout(intradayBars, price, vwap, atr, volumeSurgeRatio, now);
      if (orbRes.isBreakout && hurst >= 0.52) {
        const isAboveMultiDayTrend = market.history && market.history.length >= 30
          ? price >= (market.history.slice(-30).reduce((a, b) => a + b, 0) / 30) * 0.998
          : true;
        if (isAboveMultiDayTrend) {
          hasEntrySignal = true;
          strategy = 'Hurst Trend Rider';
          entryRationale = orbRes.rationale;
        }
      }
    }

    // 3. Institutional VWAP Pullback Engine (09:45-13:45 IST)
    if (!hasEntrySignal) {
      const vwapRes = evaluateVWAPPullback(intradayBars, price, vwap, atr, hurst, now);
      if (vwapRes.isPullbackBuy) {
        const isAboveMultiDayTrend = market.history && market.history.length >= 30
          ? price >= (market.history.slice(-30).reduce((a, b) => a + b, 0) / 30) * 0.998
          : true;
        if (isAboveMultiDayTrend) {
          hasEntrySignal = true;
          strategy = 'Hurst Trend Rider';
          entryRationale = vwapRes.rationale;
        }
      }
    }

    // 4. Adaptive Intraday Momentum Scalper (09:30-11:00 & 13:30-14:15 IST)
    if (!hasEntrySignal) {
      const scalpRes = evaluateMomentumScalp(intradayBars, price, vwap, atr, hurst, now);
      if (scalpRes.isScalpSignal && scalpRes.direction === 'LONG') {
        hasEntrySignal = true;
        strategy = 'Momentum Scalper';
        entryRationale = scalpRes.rationale;
      }
    }

    // 5. Candlestick Price Action & Microstructure Engine (Pinbars, Engulfing, Inside Bar Breakouts)
    // Enforce 10:00 AM IST curfew to eliminate morning opening false-pinbar whipsaws (-₹4,552 loss in audit)
    if (!hasEntrySignal && istMinutes >= 600) {
      const cpaRes = evaluateCandlePriceAction(intradayBars, price, vwap, atr, volumeSurgeRatio, now);
      if (cpaRes.isActionSignal && cpaRes.direction === 'LONG') {
        const isAboveMultiDayTrend = market.history && market.history.length >= 30
          ? price >= (market.history.slice(-30).reduce((a, b) => a + b, 0) / 30) * 0.998
          : true;
        if (isAboveMultiDayTrend) {
          hasEntrySignal = true;
          strategy = 'Candle Price Action';
          currentConvictionBonus = cpaRes.convictionBonus;
          entryRationale = cpaRes.rationale;
        }
      }
    }

    // 6. VWAP Standard Deviation Band Mean-Reversion Engine (-1.5σ to -2.0σ Oversold Bounces)
    if (!hasEntrySignal && dayClassification.dayType !== 'BEAR_TREND_DAY') {
      const mrRes = evaluateVWAPMeanReversion(intradayBars, price, atr, now);
      if (mrRes.isSignal && mrRes.direction === 'LONG') {
        hasEntrySignal = true;
        strategy = 'VWAP Band Mean Reversion';
        currentConvictionBonus = mrRes.convictionBonus;
        ouZScore = mrRes.zScore;
        entryRationale = mrRes.rationale;
      }
    }

    const dayOpenPrice = (market.intradayCandles && market.intradayCandles.length > 0)
      ? market.intradayCandles[0].open
      : ((market as any).open ?? (market.candles && market.candles.length > 0 ? market.candles[market.candles.length - 1].open : price));
    const mtfConfluence = evaluateMultiTimeframeConfluence(market, price, vwap, atr, hurst);
    const vwapBands = calculateVWAPBands(intradayBars, price);
    const sectorStats = sectorMomentum.sectorStatsMap.get(sector);

    const brainDirective = evaluateStrategyMasterBrain({
      istMinutes,
      marketPrice: price,
      dayOpenPrice,
      vwap,
      atr,
      hurst,
      squeezeStatus,
      ouZScore,
      macroBreadth,
      sectorRank: sectorStats?.rank ?? 3,
      sectorAvgChange: sectorStats?.averageChangePct ?? 0,
      sectorAdvanceRatio: sectorStats?.advanceRatio ?? 0.5,
      mtfConfluence,
      vwapBands,
      isSystemicShock,
      intradayPnlContext,
    });

    if (hasEntrySignal) {
      if (brainDirective.actionPermission !== 'PERMITTED') {
        hasEntrySignal = false;
        entryRationale = `[Master Brain ${brainDirective.scenarioId}: ${brainDirective.scenarioName}] ${brainDirective.rationale}`;
      } else if (!brainDirective.allowedStrategies.includes(strategy)) {
        hasEntrySignal = false;
        entryRationale = `[Master Brain ${brainDirective.scenarioId}] Strategy ${strategy} prohibited. Allowed: ${brainDirective.allowedStrategies.join(', ')}`;
      } else if (brainDirective.requireGreenOnDay && price < dayOpenPrice) {
        hasEntrySignal = false;
        entryRationale = `[Master Brain ${brainDirective.scenarioId}] Long setup rejected: Asset is red on day (Price ₹${price.toFixed(2)} < Open ₹${dayOpenPrice.toFixed(2)}).`;
      }
    }

    if (hasEntrySignal) {
      const extensionAboveVwapAtr = vwap > 0 && atr > 0 ? (price - vwap) / atr : 0;
      const minVol = strategy === 'VWAP Band Mean Reversion' ? 0.60 : thresholds.MIN_ENTRY_VOLUME_SURGE_RATIO;
      if (volumeSurgeRatio < minVol) {
        hasEntrySignal = false;
        entryRationale = `Entry rejected: last-candle volume is only ${volumeSurgeRatio.toFixed(2)}x average.`;
      } else if (strategy !== 'VWAP Band Mean Reversion' && strategy !== 'Value Accumulator') {
        if (extensionAboveVwapAtr > brainDirective.maxVwapExtensionAtr) {
          hasEntrySignal = false;
          entryRationale = `Entry rejected: price is extended ${extensionAboveVwapAtr.toFixed(2)} ATR above VWAP (max ${brainDirective.maxVwapExtensionAtr} ATR).`;
        }
      }
    }

    if (hasEntrySignal) {
      // Multi-Timeframe Confluence Gate (30m macro trend + 1m micro momentum)
      if (strategy === 'Hurst Trend Rider' && (mtfConfluence.macroTrendDirection === 'BEARISH' || mtfConfluence.alignmentScore < 45)) {
        hasEntrySignal = false;
        entryRationale = `Entry rejected: Severe MTF divergence (${mtfConfluence.alignmentScore}/100 - Macro ${mtfConfluence.macroTrendDirection}).`;
      }

      // Sector Momentum Laggard Defense: Reject long setups in deeply collapsing sectors
      const secBonus = evaluateSectorAlignmentBonus(sector, sectorMomentum, true);
      if (secBonus.scoreDelta <= -8 && strategy !== 'Value Accumulator' && strategy !== 'VWAP Band Mean Reversion') {
        hasEntrySignal = false;
        entryRationale = `Entry rejected: ${secBonus.rationale}`;
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
        convictionBonus: currentConvictionBonus,
        brainDirective,
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
      strategy: c.strategy,
      ouZScore: c.ouZScore,
      convictionBonus: c.convictionBonus,
    }))
  );

  const alphaByAsset = new Map(rankedAlphaList.map((r) => [r.asset, r]));

  // Sort candidatePool by alpha rank (Rank #1 first!)
  candidatePool.sort((a, b) => {
    const rankA = alphaByAsset.get(a.asset)?.rank ?? 999;
    const rankB = alphaByAsset.get(b.asset)?.rank ?? 999;
    return rankA - rankB;
  });

  const dayHasLoss = dailyLossCount > 0;
  const dailyMisEntries = dailyTradesCount;

  const allocationCandidates: CandidateForAllocation[] = candidatePool.map((cand) => {
    const ranked = alphaByAsset.get(cand.asset);
    const limitPrice = calculateSmartLimitPrice(
      cand.price,
      cand.vwap,
      cand.atr,
      isIndianAsset(cand.asset) ? 0.05 : 0.01,
      ranked?.alphaConvictionIndex
    );
    const candMarginMult = evaluateDynamicBuyingPower(
      timingQuality,
      cand.strategy,
      cand.hurst,
      ranked?.alphaConvictionIndex || 50,
      false
    );
    const projectedNotional = Math.min(
      pv * (thresholds.MODE_40_1_ASSET_ALLOCATION_PCT / 100) * candMarginMult,
      Math.max(0, allocatableCash * candMarginMult)
    );
    const projectedQuantity = Math.max(1, Math.floor(projectedNotional / limitPrice));
    const friction = calculateRoundtripFriction(limitPrice, projectedQuantity, false);
    const realisticGrossProfit = Math.min(cand.atr * 1.25, limitPrice * 0.08) * projectedQuantity;
    const dynamicFloor = calculateDynamicNetProfitFloor(
      friction.totalRoundtripFriction,
      projectedNotional
    );
    const rsi = indicators(cand.market.history, cand.market.candles).rsi ?? 50;

    return {
      asset: cand.asset,
      price: limitPrice,
      atr: cand.atr,
      sector: cand.sector,
      convictionScore: ranked?.alphaConvictionIndex || 0,
      hurst: cand.hurst,
      squeezeStatus: cand.squeezeStatus,
      volumeSurgeRatio: cand.volumeSurgeRatio,
      realisticGrossProfit,
      roundtripFriction: friction.totalRoundtripFriction,
      realisticNetProfit: realisticGrossProfit - friction.totalRoundtripFriction,
      notional: projectedNotional,
      minNetProfitFloor: dynamicFloor,
      history: cand.market.history,
      regimeScenario: classifyRegimeScenario(cand.price, cand.atr, cand.hurst, cand.squeezeStatus, cand.volumeSurgeRatio, rsi),
    };
  });
  const allocationDecision = evaluateAllocationModeSwitch(allocationCandidates, dayHasLoss);
  const selectedAllocationAssets = new Set(allocationDecision.selectedCandidates.map((candidate) => candidate.asset));

  // Micro-Adjustment Concurrency Gate:
  // 1. In DEFENSIVE_RECOVERY (day has suffered a loss), cap concurrent positions strictly to 1.
  // 2. Sequential Risk-Free Concurrency: If an existing active position is NOT yet risk-free
  //    (trancheStage === 0 and stopLossPrice < entryPrice), prevent opening a 2nd position.
  // 3. Prevent multi-order bursts: Dispatch at most 1 new order per evaluation tick so the top-ranked asset enters first.
  const activeAssetsList = UPSTOX_FLEET_ASSETS.filter((a) => (state.positions[a] || 0) > 0);
  const hasUnprotectedActivePosition = activeAssetsList.some((a) => {
    const st = state.autonomousPilot?.activeFleet?.[a];
    const buyPrice = state.avgBuyPrice?.[a] || st?.entryPrice || 0;
    const stop = st?.stopLossPrice || 0;
    const stage = st?.trancheStage || 0;
    return stage === 0 && stop < buyPrice;
  });

  const effectiveMaxConcurrent = (dayHasLoss || dailyLossCount >= 1)
    ? 1
    : thresholds.MAX_CONCURRENT_MIS_POSITIONS;

  const availableConcurrentSlots = Math.max(
    0,
    effectiveMaxConcurrent - activePositionCount - pendingBuyAssets.size
  );
  const maxNewEntries = Math.min(allocationDecision.maxPositions, availableConcurrentSlots, 1);
  let dispatchedMisEntries = 0;

  if (candidatePool.length > 0 && allocationDecision.mode === 'STAND_ASIDE') {
    const recentStandAside = state.autonomousPilot?.actionLogs?.find(
      (l) => l.action === 'SKIPPED' && l.strategy === 'Conditions-Based Allocation Gate' && now - l.timestamp < 300_000
    );
    if (!recentStandAside) {
      newActionLogs.push({
        id: `log_allocation_stand_aside_${now}`,
        timestamp: now,
        asset: candidatePool[0].asset,
        action: 'SKIPPED',
        strategy: 'Conditions-Based Allocation Gate',
        detail: allocationDecision.rationale,
        price: candidatePool[0].price,
        status: 'BLOCKED',
      });
    }
  }

  // Iterate in order of highest conviction alpha rank
  for (const cand of candidatePool) {
    const ranked = alphaByAsset.get(cand.asset);
    const asset = cand.asset;
    const price = cand.price;
    const atr = cand.atr;
    const sector = cand.sector;
    const strategy = cand.strategy;

    // Retain ranking telemetry even when the allocation gate stands aside.
    if (updatedFleet[asset]) {
      updatedFleet[asset].alphaRank = ranked?.rank;
      updatedFleet[asset].alphaConvictionIndex = ranked?.alphaConvictionIndex;
    }

    if (isSystemicShock) continue;
    if (!selectedAllocationAssets.has(asset)) continue;

    // Master Brain Dynamic Scenario Directive Gate
    if (cand.brainDirective.actionPermission !== 'PERMITTED') {
      continue;
    }

    const minAciRequired = cand.brainDirective.minAciThreshold;
    if ((ranked?.alphaConvictionIndex || 0) < minAciRequired) {
      continue;
    }

    // Intraday Single-Asset Lockout: Never re-enter an asset that already entered or exited today
    const alreadyTradedToday = (state.orders || []).some(
      (o) => o.asset === asset && o.side === 'buy' && o.status !== 'cancelled'
    ) || todayActions.some(
      (l) => l.asset === asset && (l.action === 'STOP_LOSS' || (l.action as string) === 'DEAD_TRADE_EXIT' || (l.action as string) === 'TAKE_PROFIT' || l.action === 'BUY_ENTRY')
    );
    if (alreadyTradedToday) {
      continue;
    }
    if (dailyMisEntries + dispatchedMisEntries >= thresholds.MAX_DAILY_MIS_ENTRIES) {
      const recentDailyCap = state.autonomousPilot?.actionLogs?.find(
        (l) => l.asset === asset && l.action === 'SKIPPED' && l.detail?.includes('Daily MIS entry governor') && now - l.timestamp < 300_000
      );
      if (!recentDailyCap) {
        newActionLogs.push({
          id: `log_daily_entry_cap_${asset}_${now}`,
          timestamp: now,
          asset,
          action: 'SKIPPED',
          strategy,
          detail: `Daily MIS entry governor: ${thresholds.MAX_DAILY_MIS_ENTRIES} entries already dispatched today. No new intraday position.`,
          price,
          status: 'BLOCKED',
        });
      }
      continue;
    }
    if (dispatchedMisEntries >= maxNewEntries) {
      const recentConcurrencyCap = state.autonomousPilot?.actionLogs?.find(
        (l) => l.asset === asset && l.action === 'SKIPPED' && l.detail?.includes('MIS concurrency limiter') && now - l.timestamp < 300_000
      );
      if (!recentConcurrencyCap) {
        newActionLogs.push({
          id: `log_concurrency_cap_${asset}_${now}`,
          timestamp: now,
          asset,
          action: 'SKIPPED',
          strategy,
          detail: `MIS concurrency limiter: allocation mode permits ${allocationDecision.maxPositions} new positions and ${activePositionCount} are already active.`,
          price,
          status: 'BLOCKED',
        });
      }
      continue;
    }

    // Check rate limit
    const rateCheck = evaluateRateLimitAllowance(rateLimits, now);
    if (!rateCheck.allowed) {
      rateLimits.isThrottled = true;
      const recentThrottle = state.autonomousPilot?.actionLogs?.find(
        (l) => l.asset === asset && l.action === 'THROTTLED' && now - l.timestamp < 60_000
      );
      if (!recentThrottle) {
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
      }
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

    // Conditions-Based Dynamic Intraday Margin Leverage (1.0x to 4.5x from Master Brain Directive)
    const marginMultiplier = cand.brainDirective?.marginMultiplier ?? evaluateDynamicBuyingPower(
      timingQuality,
      strategy,
      cand.hurst,
      ranked?.alphaConvictionIndex || 50,
      false
    );

    // Stop and Target Brackets
    // For high-conviction margin breakouts (2.5x-4.5x), use a focused 1.00 ATR stop
    // so notional can safely expand while total rupee risk is strictly anchored to <= ₹400
    const baseStopAtrMult = strategy === 'Momentum Scalper'
      ? 0.60
      : strategy === 'Candle Price Action'
      ? 0.70
      : strategy === 'VWAP Band Mean Reversion'
      ? 0.70
      : marginMultiplier >= 3.5 && (ranked?.alphaConvictionIndex || 0) >= 55
      ? Math.min(profile.stopLossAtrMultiplier, 0.75)
      : marginMultiplier >= 2.5
      ? Math.min(profile.stopLossAtrMultiplier, 0.85)
      : marginMultiplier >= 2.0
      ? Math.min(profile.stopLossAtrMultiplier, 1.00)
      : profile.stopLossAtrMultiplier;

    const effectiveStopAtrMult = cand.brainDirective?.dailyPnlRegime === 'DEFENSIVE_RECOVERY'
      ? Math.min(baseStopAtrMult, 0.75)
      : baseStopAtrMult;
    const stopLossDist = Math.max(limitPrice * 0.0035, atr * effectiveStopAtrMult);
    const stopLossPrice = alignToTickSize(limitPrice - stopLossDist, asset);
    const takeProfitPrice = cand.brainDirective?.trancheTargets
      ? alignToTickSize(limitPrice + atr * cand.brainDirective.trancheTargets.tranche1Atr, asset)
      : strategy === 'Momentum Scalper'
      ? alignToTickSize(limitPrice + atr * 1.00, asset)
      : strategy === 'Candle Price Action'
      ? alignToTickSize(limitPrice + atr * 1.30, asset)
      : strategy === 'VWAP Band Mean Reversion'
      ? alignToTickSize(Math.max(limitPrice + atr * 1.10, cand.vwap * 0.999), asset)
      : alignToTickSize(limitPrice + stopLossDist * profile.minRiskReward, asset);
    // Adaptive Trend Expansion: In confirmed high-Hurst super-trends (H >= 0.62) with Squeeze Release,
    // dynamically expand Tranche 2 take-profit multiplier by 20% to capture larger multi-ATR trend runners!
    const isSuperTrend = cand.hurst >= 0.62 && cand.squeezeStatus === 'SQUEEZE_OFF';
    const dynamicTpMultiplier = isSuperTrend
      ? profile.takeProfitAtrMultiplier * 1.20
      : profile.takeProfitAtrMultiplier;
    const takeProfit2Price = cand.brainDirective?.trancheTargets
      ? alignToTickSize(limitPrice + atr * cand.brainDirective.trancheTargets.tranche2Atr, asset)
      : strategy === 'Momentum Scalper'
      ? alignToTickSize(limitPrice + atr * 1.80, asset)
      : strategy === 'Candle Price Action'
      ? alignToTickSize(limitPrice + atr * 2.10, asset)
      : strategy === 'VWAP Band Mean Reversion'
      ? alignToTickSize(Math.max(limitPrice + atr * 1.80, cand.vwap + atr * 0.5), asset)
      : alignToTickSize(limitPrice + atr * dynamicTpMultiplier, asset);
    const takeProfit3Price = calculateChandelierExit(cand.market.history, 22, 2.0);

    const riskPerShare = limitPrice - stopLossPrice;
    if (riskPerShare <= 0) continue;

    // Dynamic Multi-Factor Kelly Win Rate Calibration
    let estimatedWinRate = profileKey === 'conservative' ? 0.65 : profileKey === 'momentum' ? 0.54 : 0.58;
    if (cand.hasInstitutionalVolume) estimatedWinRate += 0.04;
    if (cand.squeezeStatus === 'SQUEEZE_OFF') estimatedWinRate += 0.04;
    if (cand.hurst > 0.60) estimatedWinRate += 0.03;
    if ((ranked?.relativeStrengthPct || 0) > 0) estimatedWinRate += 0.03;
    if ((ranked?.alphaConvictionIndex || 0) >= 75) estimatedWinRate += 0.03;
    // Conviction-Aware Kelly Dampener: Reduce sizing for marginal entries (ACI 50-60)
    // and slightly boost sizing for solid entries (ACI 60-75) to concentrate capital on best setups
    const aci = ranked?.alphaConvictionIndex || 0;
    if (aci >= 50 && aci < 60) estimatedWinRate -= 0.04;
    else if (aci >= 60 && aci < 75) estimatedWinRate += 0.02;

    // Adaptive Volatility Shock Dampener: In high-volatility chop (ATR/P > 4.5%), dampen Kelly sizing
    if (atr / price > 0.045) {
      estimatedWinRate -= 0.06;
    }

    const estWinRate = Math.max(
      thresholds.MIN_HEURISTIC_WIN_RATE,
      Math.min(
        thresholds.MAX_HEURISTIC_WIN_RATE,
        thresholds.HEURISTIC_WIN_RATE_NEUTRAL_PRIOR +
          (estimatedWinRate - thresholds.HEURISTIC_WIN_RATE_NEUTRAL_PRIOR) * thresholds.HEURISTIC_WIN_RATE_SHRINKAGE
      )
    );

    const rrRatio = (takeProfitPrice - limitPrice) / riskPerShare;
    const kellyRes = calculateHalfKellyFraction(
      estWinRate,
      rrRatio,
      thresholds.MAX_KELLY_SIZE_MULTIPLIER,
      0.65
    );

    // Sizing via Fractional Risk Budget multiplied by Half-Kelly multiplier
    // Hard cap max risk capital to ₹250 (so 1 stop never exceeds the -₹350 daily circuit breaker)
    const baseRiskCapital = pv * (profile.maxRiskPerTradePct / 100);
    const convictionBoost = cand.brainDirective?.riskBudgetMultiplier ?? ((ranked?.alphaConvictionIndex || 0) >= 60 ? 1.15 : 1.0);
    if (convictionBoost <= 0) continue;
    const maxRiskCapital = Math.min(250, baseRiskCapital * kellyRes.recommendedSizeMultiplier * convictionBoost);
    let unitsToBuy = Math.max(1, Math.floor(maxRiskCapital / riskPerShare));

    // Allocation mode asset-cap ceiling scaled by dynamic margin multiplier
    const baseExposurePct = allocationDecision.assetAllocationPct || thresholds.MAX_SINGLE_ASSET_ALLOCATION_PCT;
    const maxAssetExposure = pv * (baseExposurePct / 100) * marginMultiplier;
    let proposedNotional = unitsToBuy * limitPrice;
    if (proposedNotional > maxAssetExposure) {
      unitsToBuy = Math.floor(maxAssetExposure / limitPrice);
      if (unitsToBuy < 1) {
        // Even a single share exceeds the maximum permissible single-asset exposure.
        continue;
      }
      proposedNotional = unitsToBuy * limitPrice;
    }

    // Caution-tier drawdown protection must affect the actual venue quantity, not
    // only the circuit-breaker telemetry. Exits remain unrestricted elsewhere.
    if (cbCheck.sizingMultiplier < 1) {
      unitsToBuy = applyDrawdownSizing(unitsToBuy, cbCheck.sizingMultiplier);
      if (unitsToBuy < 1) {
        const recentDrawdownSkip = state.autonomousPilot?.actionLogs?.find(
          (l) => l.asset === asset && l.action === 'SKIPPED' && l.detail?.includes('Drawdown caution tier') && now - l.timestamp < 300_000
        );
        if (!recentDrawdownSkip) {
          newActionLogs.push({
            id: `log_drawdown_size_${asset}_${now}`,
            timestamp: now,
            asset,
            action: 'SKIPPED',
            strategy,
            detail: `Drawdown caution tier (${cbCheck.drawdownPct}%): reduced size falls below one share; entry skipped.`,
            price: limitPrice,
            status: 'BLOCKED',
          });
        }
        continue;
      }
      proposedNotional = unitsToBuy * limitPrice;
    }

    // Anti-Fee-Trap Notional Guard: Reject setups where proposed trade size is too small
    // to overcome flat ~₹49 round-trip broker commission and statutory taxes.
    const effectiveMinNotional = Math.min(pv * 0.30, thresholds.MIN_TRADE_NOTIONAL_INR);
    if (proposedNotional < effectiveMinNotional && pv >= 25000) {
      // For accounts >= ₹25,000, elevate units to meet effectiveMinNotional if total risk
      // stays within safe risk budget (<= 1.5x profile max risk) and allocatable cash.
      const minUnitsForViability = Math.ceil(effectiveMinNotional / limitPrice);
      const elevatedNotional = minUnitsForViability * limitPrice;
      const elevatedRisk = minUnitsForViability * riskPerShare;
      const maxAllowedRisk = pv * (profile.maxRiskPerTradePct * 1.5 / 100);

      const requiredCashForElevation = elevatedNotional / marginMultiplier;
      if (
        elevatedNotional <= maxAssetExposure &&
        requiredCashForElevation <= allocatableCash &&
        elevatedRisk <= maxAllowedRisk
      ) {
        unitsToBuy = minUnitsForViability;
        proposedNotional = elevatedNotional;
      } else {
        const recentFeeSkip = state.autonomousPilot?.actionLogs?.find(
          (l) => l.asset === asset && l.action === 'SKIPPED' && now - l.timestamp < 300_000
        );
        if (!recentFeeSkip) {
          newActionLogs.push({
            id: `log_fee_drag_${asset}_${now}`,
            timestamp: now,
            asset,
            action: 'SKIPPED',
            strategy,
            detail: `Anti-Fee-Trap Guard: Proposed size ₹${proposedNotional.toFixed(2)} is below minimum viable threshold ₹${effectiveMinNotional.toFixed(2)}. Rejected to prevent flat brokerage fee drag.`,
            price: limitPrice,
            status: 'BLOCKED',
          });
        }
        continue;
      }
    }

    // Check cash liquidity constraint: must preserve mandatory cash reserve floor
    // Also suppress re-attempts if the server-side risk gate recently rejected a BUY for this
    // asset (action === 'THROTTLED' written by the worker on ORDER_REJECTED). This prevents
    // the 10-second retry spam loop when available cash is insufficient per the ledger.
    const CASH_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
    const recentServerReject = state.autonomousPilot?.actionLogs?.find(
      (l) => l.asset === asset && l.action === 'THROTTLED' && l.status === 'BLOCKED' && now - l.timestamp < CASH_COOLDOWN_MS
    );
    if (recentServerReject) {
      continue; // Server already rejected a BUY for this asset recently — wait out the cooldown
    }

    let requiredOrderCash = (unitsToBuy * limitPrice) / marginMultiplier;
    if (requiredOrderCash > allocatableCash || allocatableCash <= 0) {
      if ((cand.brainDirective?.downsizingAllowed ?? true) && allocatableCash > 0) {
        // Graceful Downsizing: Scale unitsToBuy to fit available allocatable cash
        const maxAffordableUnits = Math.floor((allocatableCash * marginMultiplier) / limitPrice);
        if (maxAffordableUnits >= 1 && (maxAffordableUnits * limitPrice) >= effectiveMinNotional) {
          unitsToBuy = maxAffordableUnits;
          proposedNotional = unitsToBuy * limitPrice;
          requiredOrderCash = proposedNotional / marginMultiplier;
        }
      }

      if (requiredOrderCash > allocatableCash || allocatableCash <= 0) {
        const recentCashSkip = state.autonomousPilot?.actionLogs?.find(
          (l) => l.asset === asset && (l.action === 'SKIPPED' || l.action === 'THROTTLED') && now - l.timestamp < CASH_COOLDOWN_MS
        );
        if (!recentCashSkip) {
          newActionLogs.push({
            id: `log_cash_floor_${asset}_${now}`,
            timestamp: now,
            asset,
            action: 'SKIPPED',
            strategy,
            detail: `Preserving mandatory ${minCashFloorPct}% liquid cash buffer. Required margin: ₹${requiredOrderCash.toFixed(2)}, Allocatable: ₹${allocatableCash.toFixed(2)}.`,
            price: limitPrice,
            status: 'BLOCKED',
          });
        }
        continue;
      }
    }

    // Sector Concentration Defense (Max MAX_SECTOR_ALLOCATION_PCT of total buying power in any single sector)
    const effectiveTotalCapacity = pv * marginMultiplier;
    const sectorCheck = validateSectorExposureLimit(
      asset,
      proposedNotional,
      state.positions,
      markets,
      effectiveTotalCapacity,
      thresholds.MAX_SECTOR_ALLOCATION_PCT
    );

    if (!sectorCheck.allowed) {
      // Graceful Downsizing: Trim unitsToBuy to fit allowable sector capacity instead of outright dropping the setup
      const currentSectorNotional = Object.entries(state.positions).reduce((sum, [sym, qty]) => {
        if (!qty || qty <= 0) return sum;
        if (getAssetSector(sym) === sector) {
          return sum + qty * ((markets as any)[sym]?.price || 0);
        }
        return sum;
      }, 0);
      const maxSectorNotional = effectiveTotalCapacity * (thresholds.MAX_SECTOR_ALLOCATION_PCT / 100);
      const availableSectorCapacity = Math.max(0, maxSectorNotional - currentSectorNotional);
      const cappedUnits = Math.floor(availableSectorCapacity / limitPrice);

      if (cappedUnits >= 1 && cappedUnits * limitPrice >= effectiveMinNotional) {
        unitsToBuy = cappedUnits;
        proposedNotional = unitsToBuy * limitPrice;
      } else {
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
            detail: sectorCheck.reason || `Sector concentration cap (${thresholds.MAX_SECTOR_ALLOCATION_PCT}%) reached for ${sector}.`,
            price: limitPrice,
            status: 'BLOCKED',
          });
        }
        continue;
      }
    }

    // Pre-Trade TCA Friction Hurdle:
    // 1. Overall target profit must be >= MIN_FRICTION_PROFIT_MULTIPLE (3.0x) roundtrip friction
    const isDeliveryOrder = false;
    const expectedGrossProfit = (takeProfitPrice - limitPrice) * unitsToBuy;
    const orderFriction = calculateRoundtripFriction(limitPrice, unitsToBuy, isDeliveryOrder);
    const realisticTargetMove = Math.min(takeProfitPrice - limitPrice, atr * 1.25);
    const realisticGrossProfit = realisticTargetMove * unitsToBuy;
    const dynamicNetFloor = calculateDynamicNetProfitFloor(
      orderFriction.totalRoundtripFriction,
      proposedNotional
    );

    const passesOverallTarget = passesFrictionHurdle(expectedGrossProfit, orderFriction.totalRoundtripFriction, thresholds.MIN_FRICTION_PROFIT_MULTIPLE);
    const passesRealisticTarget = passesNetProfitFloor(realisticGrossProfit, orderFriction.totalRoundtripFriction, dynamicNetFloor);

    if (!passesOverallTarget || !passesRealisticTarget) {
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
          detail: `TCA Friction Hurdle: Realistic intraday gain ₹${realisticGrossProfit.toFixed(2)} leaves less than dynamic floor ₹${dynamicNetFloor.toFixed(2)} after ₹${orderFriction.totalRoundtripFriction.toFixed(2)} in roundtrip fees. Setup rejected.`,
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
      reason: `${cand.entryRationale} [Rank #${ranked?.rank || 1}, ACI:${ranked?.alphaConvictionIndex || 0}, Half-Kelly: ${kellyRes.recommendedSizeMultiplier}x, Drawdown: ${cbCheck.sizingMultiplier}x, Sector: ${sector}]`,
      marginMultiplier,
    });

    // Update internal pacing and cash
    rateLimits.requestsThisMinute++;
    rateLimits.lastDispatchedAt = now;
    allocatableCash -= requiredOrderCash;
    pendingBuyAssets.add(asset);
    dispatchedMisEntries++;

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
      entryTimestamp: now,
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
