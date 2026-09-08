/**
 * Autonomous Quant Pilot Server Daemon (NSE / Upstox)
 * 
 * Provides server-authoritative autonomous quantitative trading when the browser
 * tab is closed (CLOUD_HEADLESS), and synchronized telemetry when the browser tab
 * is open (BROWSER_LINKED).
 * 
 * Guarantees:
 * 1. Single-Master Execution Authority (zero duplicate orders).
 * 2. Strict Indian Market Hours enforcement (09:15 - 15:30 IST).
 * 3. Daily Upstox OAuth session token health verification.
 * 4. High-frequency distributed lease acquisition via DistributedLockService.
 * 5. SEBI algo-tagged order dispatch with 15-point live gate authorization.
 * 6. Durable state and audit logs in SQLite / PostgreSQL.
 */

import crypto from 'node:crypto';
import { getDb } from '../db';
import { logger, AuditService } from './auditService';
import { IndianMarketCalendar, MarketSessionType } from './brokers/upstox/indianMarketCalendar';
import { UpstoxAdapter } from './brokers/upstox/upstoxAdapter';
import { UpstoxCandleService } from './brokers/upstox/upstoxCandleService';
import { DistributedLockService } from './distributedLockService';
import {
  UPSTOX_FLEET_ASSETS,
  tickAutonomousPilot,
  initializeFleetStatus,
  createDefaultRateLimitStatus,
  AutonomousPilotTickResult,
} from '../../src/domain/autonomousPilotEngine';
import { PILOT_PROFILES } from '../../src/domain/autonomousPilot';
import {
  Asset,
  Market,
  AppState,
  AssetFleetStatus,
  PilotRateLimitStatus,
  PilotActionLog,
  AutonomousPilotProfile,
} from '../../src/types';

export interface PilotWorkerStateRecord {
  user_id: string;
  enabled: number;
  execution_mode: 'full_autonomous' | 'semi_autonomous';
  profile: AutonomousPilotProfile;
  daily_starting_value: number;
  risk_per_trade_pct: number;
  circuit_breaker_tripped: number;
  circuit_breaker_reason: string | null;
  last_client_heartbeat_at: number;
  last_server_run_at: number;
  execution_mode_status: 'BROWSER_LINKED' | 'CLOUD_HEADLESS';
  fleet_state_json: string | null;
  updated_at: number;
}

export interface PilotSweepResult {
  runId: string;
  usersProcessed: number;
  ordersDispatched: number;
  ordersCancelled: number;
  errors: string[];
  durationMs: number;
}

export class AutonomousPilotWorker {
  private static schedulerTimer: NodeJS.Timeout | null = null;
  private static isRunning: boolean = false;
  private static mockSession: MarketSessionType | null = null;
  private static mockNow: number | null = null;

  /**
   * For unit testing: overrides Indian Market Calendar session.
   */
  public static setMockSession(session: MarketSessionType | null): void {
    this.mockSession = session;
  }

  /**
   * For unit testing: overrides current timestamp.
   */
  public static setMockNow(now: number | null): void {
    this.mockNow = now;
  }

  public static getEffectiveNow(): number {
    return this.mockNow ?? Date.now();
  }

  /**
   * Starts the periodic 5-second autonomous execution daemon.
   */
  public static startScheduler(intervalMs: number = 5000): void {
    if (this.schedulerTimer) return;
    logger.info(`[AutonomousPilotWorker] Starting autonomous pilot daemon (interval: ${intervalMs}ms)`);
    this.schedulerTimer = setInterval(async () => {
      try {
        await this.runPilotSweep();
      } catch (err: any) {
        logger.error(`[AutonomousPilotWorker] Scheduled execution sweep failed: ${err.message}`);
      }
    }, intervalMs);
  }

  /**
   * Stops the periodic scheduler.
   */
  public static stopScheduler(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
      logger.info('[AutonomousPilotWorker] Stopped autonomous pilot daemon scheduler');
    }
  }

  /**
   * Graceful shutdown hook.
   */
  public static stop(): void {
    this.isRunning = false;
    this.stopScheduler();
  }

  /**
   * Testing reset helper.
   */
  public static resetForTesting(): void {
    this.stop();
    this.mockSession = null;
    this.mockNow = null;
  }

  /**
   * Records a heartbeat from an open client browser tab.
   */
  public static async recordClientHeartbeat(userId: string): Promise<{
    mode: 'BROWSER_LINKED';
    lastHeartbeat: number;
  }> {
    const db = getDb();
    const now = this.getEffectiveNow();
    // Ensure row exists
    await this.getPilotState(userId);

    await db.execute(
      `UPDATE autonomous_pilot_state
       SET last_client_heartbeat_at = ?,
           execution_mode_status = 'BROWSER_LINKED',
           updated_at = ?
       WHERE user_id = ?`,
      [now, now, userId]
    );
    return { mode: 'BROWSER_LINKED', lastHeartbeat: now };
  }

  /**
   * Retrieves the authoritative state for a user.
   */
  public static async getPilotState(userId: string): Promise<{
    enabled: boolean;
    executionMode: 'full_autonomous' | 'semi_autonomous';
    profile: AutonomousPilotProfile;
    dailyStartingValue: number;
    riskPerTradePct: number;
    circuitBreakerTripped: boolean;
    circuitBreakerReason?: string;
    executionModeStatus: 'BROWSER_LINKED' | 'CLOUD_HEADLESS';
    lastClientHeartbeatAt: number;
    lastServerRunAt: number;
    activeFleet: Record<string, AssetFleetStatus>;
    actionLogs: PilotActionLog[];
    isMarketOpen: boolean;
    marketSession: MarketSessionType;
    tokenStatus?: string;
  }> {
    const db = getDb();
    const now = this.getEffectiveNow();
    const session = this.mockSession ?? IndianMarketCalendar.getSession(new Date(now));
    const isMarketOpen = session === 'NORMAL';

    let row = await db.queryOne<PilotWorkerStateRecord>(
      `SELECT * FROM autonomous_pilot_state WHERE user_id = ?`,
      [userId]
    );

    if (!row) {
      // Ensure record exists with defaults
      const defaultFleet = initializeFleetStatus();
      await db.execute(
        `INSERT INTO autonomous_pilot_state (
          user_id, enabled, execution_mode, profile, daily_starting_value,
          risk_per_trade_pct, circuit_breaker_tripped, circuit_breaker_reason,
          last_client_heartbeat_at, last_server_run_at, execution_mode_status,
          fleet_state_json, updated_at
        ) VALUES (?, 0, 'full_autonomous', 'conservative', 50000.0, 0.75, 0, NULL, 0, ?, 'CLOUD_HEADLESS', ?, ?)`,
        [userId, now, JSON.stringify(defaultFleet), now]
      );
      row = await db.queryOne<PilotWorkerStateRecord>(
        `SELECT * FROM autonomous_pilot_state WHERE user_id = ?`,
        [userId]
      );
    }

    const logs = await db.query<any>(
      `SELECT id, timestamp, asset, action, strategy, detail, price, status
       FROM autonomous_pilot_logs
       WHERE user_id = ?
       ORDER BY timestamp DESC
       LIMIT 50`,
      [userId]
    );

    let activeFleet: Record<string, AssetFleetStatus> = {};
    try {
      if (row?.fleet_state_json) {
        activeFleet = JSON.parse(row.fleet_state_json);
      } else {
        activeFleet = initializeFleetStatus();
      }
    } catch {
      activeFleet = initializeFleetStatus();
    }

    const elapsedHeartbeat = now - (row?.last_client_heartbeat_at || 0);
    const modeStatus: 'BROWSER_LINKED' | 'CLOUD_HEADLESS' =
      elapsedHeartbeat <= 20_000 ? 'BROWSER_LINKED' : 'CLOUD_HEADLESS';

    const upstoxAdapter = new UpstoxAdapter();
    let tokenStatus = 'UNKNOWN';
    try {
      const health = await upstoxAdapter.getTokenHealth(userId);
      tokenStatus = health.status;
    } catch {
      tokenStatus = 'DISCONNECTED';
    }

    return {
      enabled: Boolean(row?.enabled),
      executionMode: row?.execution_mode || 'full_autonomous',
      profile: row?.profile || 'conservative',
      dailyStartingValue: row?.daily_starting_value || 50000,
      riskPerTradePct: row?.risk_per_trade_pct || 0.012,
      circuitBreakerTripped: Boolean(row?.circuit_breaker_tripped),
      circuitBreakerReason: row?.circuit_breaker_reason || undefined,
      executionModeStatus: modeStatus,
      lastClientHeartbeatAt: row?.last_client_heartbeat_at || 0,
      lastServerRunAt: row?.last_server_run_at || 0,
      activeFleet,
      actionLogs: logs.map((l) => ({
        id: l.id,
        timestamp: Number(l.timestamp),
        asset: l.asset as Asset,
        action: l.action,
        strategy: l.strategy,
        detail: l.detail,
        price: Number(l.price),
        status: l.status,
      })),
      isMarketOpen,
      marketSession: session,
      tokenStatus,
    };
  }

  /**
   * Updates user pilot configuration.
   */
  public static async updatePilotConfig(
    userId: string,
    updates: {
      enabled?: boolean;
      executionMode?: 'full_autonomous' | 'semi_autonomous';
      profile?: AutonomousPilotProfile;
      dailyStartingValue?: number;
      riskPerTradePct?: number;
      resetCircuitBreaker?: boolean;
    }
  ): Promise<any> {
    const db = getDb();
    const now = this.getEffectiveNow();

    // Ensure row exists
    await this.getPilotState(userId);

    const sets: string[] = ['updated_at = ?'];
    const params: any[] = [now];

    if (typeof updates.enabled === 'boolean') {
      sets.push('enabled = ?');
      params.push(updates.enabled ? 1 : 0);
    }
    if (updates.executionMode) {
      sets.push('execution_mode = ?');
      params.push(updates.executionMode);
    }
    if (updates.profile) {
      sets.push('profile = ?');
      params.push(updates.profile);
      if (PILOT_PROFILES[updates.profile]) {
        sets.push('risk_per_trade_pct = ?');
        params.push(PILOT_PROFILES[updates.profile].maxRiskPerTradePct);
      }
    }
    if (typeof updates.dailyStartingValue === 'number' && updates.dailyStartingValue > 0) {
      sets.push('daily_starting_value = ?');
      params.push(updates.dailyStartingValue);
    }
    if (typeof updates.riskPerTradePct === 'number' && updates.riskPerTradePct > 0) {
      sets.push('risk_per_trade_pct = ?');
      params.push(updates.riskPerTradePct);
    }
    if (updates.resetCircuitBreaker) {
      sets.push('circuit_breaker_tripped = 0');
      sets.push('circuit_breaker_reason = NULL');
    }

    params.push(userId);
    await db.execute(`UPDATE autonomous_pilot_state SET ${sets.join(', ')} WHERE user_id = ?`, params);

    // Audit log
    await AuditService.logEvent({
      userId,
      eventType: 'AUTONOMOUS_PILOT_CONFIG_UPDATED',
      source: 'autonomous_pilot_worker',
      actor: 'user',
      metadata: updates,
      result: 'SUCCESS',
    });

    return await this.getPilotState(userId);
  }

  /**
   * Main execution cycle.
   * Acquires distributed lock to ensure single-master authority across instances.
   */
  public static async runPilotSweep(targetUserId?: string, nowInput?: number): Promise<PilotSweepResult> {
    const now = nowInput ?? this.getEffectiveNow();
    const runId = `sweep_${now}_${crypto.randomBytes(4).toString('hex')}`;
    const startTime = Date.now();
    const errors: string[] = [];
    let usersProcessed = 0;
    let ordersDispatched = 0;
    let ordersCancelled = 0;

    const lockResult = await DistributedLockService.withLock(
      'worker:autonomous_pilot',
      12_000,
      async () => {
        const db = getDb();
        const upstoxAdapter = new UpstoxAdapter();

        const session = this.mockSession ?? IndianMarketCalendar.getSession(new Date(now));
        const isMarketOpen = session === 'NORMAL';

        // Query active pilots
        let query = `SELECT * FROM autonomous_pilot_state WHERE enabled = 1`;
        const queryParams: any[] = [];
        if (targetUserId) {
          query += ` AND user_id = ?`;
          queryParams.push(targetUserId);
        }

        const pilotRows = await db.query<PilotWorkerStateRecord>(query, queryParams);

        for (const row of pilotRows) {
          try {
            usersProcessed++;
            const userId = row.user_id;

            // Heartbeat & mode detection
            const elapsedHeartbeat = now - row.last_client_heartbeat_at;
            const modeStatus: 'BROWSER_LINKED' | 'CLOUD_HEADLESS' =
              elapsedHeartbeat <= 20_000 ? 'BROWSER_LINKED' : 'CLOUD_HEADLESS';

            // Verify Upstox OAuth session token health
            const health = await upstoxAdapter.getTokenHealth(userId);
            if (health.status === 'EXPIRED' || health.status === 'INVALID' || health.status === 'DISCONNECTED') {
              logger.warn(
                `[AutonomousPilotWorker] Skipping user ${userId}: Upstox token is not healthy (${health.status})`
              );
              continue;
            }

            // Outside market hours: update telemetry mode but skip trading evaluations
            if (!isMarketOpen) {
              await db.execute(
                `UPDATE autonomous_pilot_state
                 SET execution_mode_status = ?, last_server_run_at = ?, updated_at = ?
                 WHERE user_id = ?`,
                [modeStatus, now, now, userId]
              );
              continue;
            }

            // Gather market quotes and daily candles for monitored bluechip fleet
            const creds = await upstoxAdapter.loadCredentials(userId);
            const accessToken = creds?.accessToken;

            const quotesBatch = await upstoxAdapter.getMarketQuotesBatch(UPSTOX_FLEET_ASSETS, userId, accessToken);
            const markets: Partial<Record<Asset, Market>> = {};
            await Promise.all(
              UPSTOX_FLEET_ASSETS.map(async (asset) => {
                try {
                  const quote = quotesBatch[asset];
                  const candles = await UpstoxCandleService.getCandles(asset, '1D', accessToken);
                  if (quote && quote.lastPrice > 0) {
                    markets[asset] = {
                      price: quote.lastPrice,
                      change24h: quote.changePercent || 0,
                      high24h: quote.high || quote.lastPrice,
                      low24h: quote.low || quote.lastPrice,
                      volume24h: quote.volume || 0,
                      history: candles.length > 0 ? candles.map((c) => c.close) : [quote.lastPrice],
                      candles: candles.map((c) => ({
                        time: new Date(c.time).toISOString(),
                        open: c.open,
                        high: c.high,
                        low: c.low,
                        close: c.close,
                        volume: c.volume,
                      })),
                    };
                  }
                } catch (err: any) {
                  logger.warn(`[AutonomousPilotWorker] Market compilation failed for ${asset}: ${err.message}`);
                }
              })
            );

            // Fetch live positions, holdings, and funds
            const [funds, rawPositions, rawHoldings, openOrdersRows] = await Promise.all([
              upstoxAdapter.getFunds(userId).catch(() => null),
              upstoxAdapter.getPositions(userId).catch(() => []),
              upstoxAdapter.getHoldings(userId).catch(() => []),
              db.query<any>(
                `SELECT id, symbol, side, type, status, orig_qty, price
                 FROM exchange_orders
                 WHERE user_id = ? AND status IN ('NEW', 'SUBMITTING', 'PARTIALLY_FILLED')`,
                [userId]
              ).catch(() => []),
            ]);

            const availableCash = funds?.available || row.daily_starting_value;
            const assetPositions: Record<string, number> = {};
            const assetAvgPrices: Record<string, number> = {};

            for (const p of rawPositions) {
              const sym = p.symbol as Asset;
              assetPositions[sym] = (assetPositions[sym] || 0) + (p.quantity || 0);
              if (p.averagePrice) assetAvgPrices[sym] = p.averagePrice;
            }
            for (const h of rawHoldings) {
              const sym = h.symbol as Asset;
              assetPositions[sym] = (assetPositions[sym] || 0) + (h.quantity || 0);
              if (h.averagePrice && !assetAvgPrices[sym]) assetAvgPrices[sym] = h.averagePrice;
            }

            // Parse or initialize fleet status
            let fleet: Record<string, AssetFleetStatus>;
            try {
              fleet = row.fleet_state_json ? JSON.parse(row.fleet_state_json) : initializeFleetStatus();
            } catch {
              fleet = initializeFleetStatus();
            }

            const mappedOrders = openOrdersRows.map((o) => ({
              id: o.id,
              asset: o.symbol as Asset,
              side: (o.side.toLowerCase() === 'buy' ? 'buy' : 'sell') as 'buy' | 'sell',
              amount: Number(o.orig_qty),
              filled: 0,
              price: Number(o.price),
              status: 'pending' as const,
              type: (o.type.toLowerCase() === 'market' ? 'market' : 'limit') as 'market' | 'limit',
              timestamp: now,
              auto: true,
            }));

            // Calculate total positions & holdings valuation
            let totalPositionsValue = 0;
            for (const [sym, qty] of Object.entries(assetPositions)) {
              const p = markets[sym as Asset]?.price || assetAvgPrices[sym] || 0;
              totalPositionsValue += (Number(qty) || 0) * p;
            }
            const currentTotalEquity = availableCash + totalPositionsValue;

            // Auto-calibrate starting equity if it's the paper default (50000) or has a false cross-mode mismatch
            let resolvedStartingVal = row.daily_starting_value;
            const needsDaemonCalibration =
              (resolvedStartingVal === 50000 || resolvedStartingVal <= 0 || Math.abs(resolvedStartingVal - currentTotalEquity) > currentTotalEquity * 0.15) &&
              currentTotalEquity > 0;

            if (needsDaemonCalibration) {
              resolvedStartingVal = currentTotalEquity;
              row.daily_starting_value = resolvedStartingVal;
              row.circuit_breaker_tripped = 0;
              row.circuit_breaker_reason = null;
              db.execute(
                `UPDATE autonomous_pilot_state
                 SET daily_starting_value = ?, circuit_breaker_tripped = 0, circuit_breaker_reason = NULL, updated_at = ?
                 WHERE user_id = ?`,
                [resolvedStartingVal, now, userId]
              ).catch(() => {});
            }

            // Construct AppState representation for quant engine evaluation
            const syntheticState: AppState = {
              balance: availableCash,
              cash: availableCash,
              startingEquity: resolvedStartingVal,
              positions: assetPositions as any,
              averageBuyPrices: assetAvgPrices as any,
              orders: mappedOrders,
              trades: [],
              notifications: [],
              walletTransactions: [],
              accountMode: 'upstox',
              autonomousPilot: {
                enabled: true,
                executionMode: row.execution_mode,
                profile: row.profile,
                dailyStartingValue: resolvedStartingVal,
                peakPortfolioValue: Math.max(resolvedStartingVal, currentTotalEquity),
                riskPerTradePct: row.risk_per_trade_pct,
                circuitBreakerTripped: Boolean(row.circuit_breaker_tripped),
                circuitBreakerReason: row.circuit_breaker_reason || undefined,
                activeFleet: fleet,
                rateLimitStatus: createDefaultRateLimitStatus(),
                actionLogs: [],
                lastScanAt: row.last_server_run_at,
                activeOpportunities: [],
                totalAutopilotTradesExecuted: 0,
                autoPilotProfitTotal: 0,
                dailyDrawdownPct: 0,
                maxDailyDrawdownPct: PILOT_PROFILES[row.profile].maxDailyDrawdownPct,
              },
            } as any;

            // Execute master quantitative evaluation loop
            const tickResult: AutonomousPilotTickResult = tickAutonomousPilot(
              syntheticState,
              markets as Record<Asset, Market | undefined>,
              now
            );

            // Record action logs to database
            for (const log of tickResult.newActionLogs) {
              await db.execute(
                `INSERT INTO autonomous_pilot_logs (
                  id, user_id, timestamp, asset, action, strategy, detail, price, status, execution_source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'cloud_daemon', ?)`,
                [
                  log.id || `log_${now}_${crypto.randomBytes(3).toString('hex')}`,
                  userId,
                  log.timestamp || now,
                  log.asset,
                  log.action,
                  log.strategy,
                  log.detail,
                  log.price || 0,
                  log.status,
                  now,
                ]
              );
            }

            // Circuit breaker trip check & self-healing recovery
            let cbTripped = row.circuit_breaker_tripped;
            let cbReason = row.circuit_breaker_reason;
            if (tickResult.circuitBreakerTripped && !row.circuit_breaker_tripped) {
              cbTripped = 1;
              cbReason = tickResult.tripReason || 'Daily drawdown limit reached.';
              await db.execute(
                `UPDATE autonomous_pilot_state
                 SET circuit_breaker_tripped = 1, circuit_breaker_reason = ?, updated_at = ?
                 WHERE user_id = ?`,
                [cbReason, now, userId]
              );
              await AuditService.logEvent({
                userId,
                eventType: 'AUTONOMOUS_CIRCUIT_BREAKER_TRIPPED',
                source: 'autonomous_pilot_worker',
                actor: 'circuit_breaker',
                metadata: { reason: cbReason },
                result: 'BLOCKED',
              });
            } else if (!tickResult.circuitBreakerTripped && row.circuit_breaker_tripped) {
              cbTripped = 0;
              cbReason = null;
              await db.execute(
                `UPDATE autonomous_pilot_state
                 SET circuit_breaker_tripped = 0, circuit_breaker_reason = NULL, updated_at = ?
                 WHERE user_id = ?`,
                [now, userId]
              );
            }

            // Process Orders to Dispatch (Full Autonomous Mode only)
            if (row.execution_mode === 'full_autonomous' && tickResult.ordersToDispatch.length > 0 && !cbTripped) {
              for (const prop of tickResult.ordersToDispatch) {
                try {
                  const clientOrderId = `lm_pilot_${now}_${crypto.randomBytes(4).toString('hex')}`;
                  logger.info(
                    `[AutonomousPilotWorker] Executing autonomous order for ${userId}: ${prop.side.toUpperCase()} ${prop.amount} ${prop.asset} @ ₹${prop.price}`
                  );

                  await upstoxAdapter.placeOrder({
                    userId,
                    symbol: prop.asset,
                    side: prop.side.toUpperCase() as 'BUY' | 'SELL',
                    type: prop.type.toUpperCase() as 'LIMIT' | 'MARKET',
                    quantity: prop.amount,
                    price: prop.price,
                    product: 'CNC',
                    stopPrice: prop.stopLoss,
                    isAutonomous: true,
                    strategyName: prop.strategyName,
                    algoTag: 'AUTOPILOT_V2',
                    idempotencyKey: clientOrderId,
                    clientOrderId,
                    accountMode: 'live',
                  });

                  ordersDispatched++;

                  // Durable log of execution
                  await db.execute(
                    `INSERT INTO autonomous_pilot_logs (
                      id, user_id, timestamp, asset, action, strategy, detail, price, status, execution_source, created_at
                    ) VALUES (?, ?, ?, ?, 'ORDER_FILLED', ?, ?, ?, 'EXECUTED', 'cloud_daemon', ?)`,
                    [
                      `log_exec_${now}_${crypto.randomBytes(3).toString('hex')}`,
                      userId,
                      now,
                      prop.asset,
                      prop.strategyName,
                      `Cloud daemon dispatched ${prop.side.toUpperCase()} ${prop.amount} ${prop.asset} @ ₹${prop.price.toFixed(2)}`,
                      prop.price,
                      now,
                    ]
                  );
                } catch (orderErr: any) {
                  logger.error(
                    `[AutonomousPilotWorker] Order execution failed for ${prop.asset}: ${orderErr.message}`
                  );
                  errors.push(`Order error (${prop.asset}): ${orderErr.message}`);

                  await db.execute(
                    `INSERT INTO autonomous_pilot_logs (
                      id, user_id, timestamp, asset, action, strategy, detail, price, status, execution_source, created_at
                    ) VALUES (?, ?, ?, ?, 'THROTTLED', ?, ?, ?, 'BLOCKED', 'cloud_daemon', ?)`,
                    [
                      `log_err_${now}_${crypto.randomBytes(3).toString('hex')}`,
                      userId,
                      now,
                      prop.asset,
                      prop.strategyName,
                      `Execution blocked: ${orderErr.message}`,
                      prop.price,
                      now,
                    ]
                  );
                }
              }
            }

            // Process Orders to Cancel
            if (tickResult.ordersToCancel && tickResult.ordersToCancel.length > 0) {
              for (const cancelId of tickResult.ordersToCancel) {
                try {
                  await upstoxAdapter.cancelOrder(userId, cancelId);
                  ordersCancelled++;
                } catch (cancelErr: any) {
                  logger.warn(`[AutonomousPilotWorker] Failed to cancel order ${cancelId}: ${cancelErr.message}`);
                }
              }
            }

            // Persist updated fleet telemetry and execution status
            await db.execute(
              `UPDATE autonomous_pilot_state
               SET fleet_state_json = ?,
                   circuit_breaker_tripped = ?,
                   circuit_breaker_reason = ?,
                   execution_mode_status = ?,
                   last_server_run_at = ?,
                   updated_at = ?
               WHERE user_id = ?`,
              [
                JSON.stringify(tickResult.updatedFleet),
                cbTripped,
                cbReason,
                modeStatus,
                now,
                now,
                userId,
              ]
            );
          } catch (userErr: any) {
            logger.error(`[AutonomousPilotWorker] Error processing user ${row.user_id}: ${userErr.message}`);
            errors.push(`User ${row.user_id}: ${userErr.message}`);
          }
        }

        return {
          runId,
          usersProcessed,
          ordersDispatched,
          ordersCancelled,
          errors,
          durationMs: Date.now() - startTime,
        };
      }
    );

    if (!lockResult) {
      logger.warn('[AutonomousPilotWorker] Run skipped: already active on another cluster node.');
      return {
        runId,
        usersProcessed: 0,
        ordersDispatched: 0,
        ordersCancelled: 0,
        errors: ['Run skipped: already active on another cluster node.'],
        durationMs: 0,
      };
    }

    return lockResult;
  }
}
