import { getDb } from '../db';
import { AuditService, logger } from './auditService';
import { BinanceGateway } from './binanceGateway';
import { LedgerService } from './ledgerService';
import { ExactDecimal } from './precision';
import { DistributedLockService } from './distributedLockService';
import { CircuitBreakerService } from './circuitBreakerService';
import { OperationalSafetyService } from './operationalSafetyService';
import { ClockSyncService } from './clockSyncService';
import { RateLimitTracker } from './rateLimitTracker';
import { config } from '../config';
import crypto from 'node:crypto';

export interface ReconciliationResult {
  runId: string;
  status: 'SUCCESS' | 'MISMATCH_DETECTED' | 'FAILED';
  ordersChecked: number;
  balancesChecked: number;
  mismatchesFound: number;
  durationMs: number;
}

export interface ReconciliationStepResult {
  success: boolean;
  mismatches: number;
  error?: string;
}

export type DiscrepancyClassification = 'EXACT_MATCH' | 'WITHIN_PRECISION' | 'MATERIAL_MISMATCH';

export class ReconciliationWorker {
  private static isRunning = false;
  private static periodicTimer: NodeJS.Timeout | null = null;
  private static lastSuccessfulRunAt: number = 0;
  private static userLastSuccessfulRuns: Map<string, number> = new Map();
  private static mockExchangeStates: Map<string, {
    balances?: Record<string, number | string>;
    locked?: Record<string, number | string>;
    openOrders?: any[];
    trades?: Record<string, any[]>;
    shouldFail?: boolean;
    failureError?: string;
  }> = new Map();

  static setMockExchangeState(userId: string, state: {
    balances?: Record<string, number | string>;
    locked?: Record<string, number | string>;
    openOrders?: any[];
    trades?: Record<string, any[]>;
    shouldFail?: boolean;
    failureError?: string;
  } | null): void {
    if (!state) {
      this.mockExchangeStates.delete(userId);
    } else {
      this.mockExchangeStates.set(userId, state);
    }
  }

  static getMockExchangeState(userId: string) {
    return this.mockExchangeStates.get(userId);
  }

  static getLastSuccessfulRunAt(userId?: string): number {
    if (userId) {
      return this.userLastSuccessfulRuns.get(userId) || 0;
    }
    return this.lastSuccessfulRunAt;
  }

  static setLastSuccessfulRunAt(timestamp: number, userId?: string): void {
    if (userId) {
      this.userLastSuccessfulRuns.set(userId, timestamp);
    } else {
      this.lastSuccessfulRunAt = timestamp;
    }
  }

  static resetForTesting(): void {
    this.lastSuccessfulRunAt = 0;
    this.userLastSuccessfulRuns.clear();
    this.mockExchangeStates.clear();
    this.isRunning = false;
    this.stopPeriodicScheduler();
  }

  static startPeriodicScheduler(intervalMs: number = 60_000): void {
    if (this.periodicTimer) return;
    logger.info(`[ReconciliationWorker] Starting periodic reconciliation scheduler (interval: ${intervalMs}ms)`);
    this.periodicTimer = setInterval(async () => {
      try {
        await this.runReconciliation();
      } catch (err: any) {
        logger.error(`[ReconciliationWorker] Scheduled periodic reconciliation run failed: ${err.message}`);
      }
    }, intervalMs);
  }

  static stopPeriodicScheduler(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
      logger.info('[ReconciliationWorker] Stopped periodic reconciliation scheduler');
    }
  }

  static stop(): void {
    this.isRunning = false;
    this.stopPeriodicScheduler();
  }

  /**
   * Classifies difference between local ledger and exchange state.
   */
  static classifyDiscrepancy(
    diff: ExactDecimal,
    tolerance: ExactDecimal = ExactDecimal.from('0.00000001')
  ): DiscrepancyClassification {
    if (diff.isZero()) return 'EXACT_MATCH';
    if (diff.lte(tolerance)) return 'WITHIN_PRECISION';
    return 'MATERIAL_MISMATCH';
  }

  /**
   * Executes an authoritative reconciliation run against exchange venues and local ledger projections.
   * Uses DistributedLockService to prevent concurrent execution across multi-instance deployments.
   */
  static async runReconciliation(userId?: string): Promise<ReconciliationResult> {
    const lockResult = await DistributedLockService.withLock('worker:reconciliation', 60_000, async () => {
      return this.executeReconciliationInternal(userId);
    });

    if (!lockResult) {
      logger.warn('Reconciliation run skipped: already in progress on this or another server instance.');
      return {
        runId: 'skipped_locked',
        status: 'SUCCESS',
        ordersChecked: 0,
        balancesChecked: 0,
        mismatchesFound: 0,
        durationMs: 0,
      };
    }

    return lockResult;
  }

  private static async executeReconciliationInternal(userId?: string): Promise<ReconciliationResult> {
    if (this.isRunning) {
      logger.warn('Reconciliation run skipped: already in progress.');
      return {
        runId: 'skipped',
        status: 'SUCCESS',
        ordersChecked: 0,
        balancesChecked: 0,
        mismatchesFound: 0,
        durationMs: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const runId = `rec_run_${startTime}_${crypto.randomBytes(4).toString('hex')}`;
    const db = getDb();

    // Initialize reconciliation run record so foreign keys in mismatches are satisfied
    await db.execute(
      `INSERT INTO reconciliation_runs (id, ran_at, status, orders_checked, balances_checked, mismatches_found, duration_ms)
       VALUES (?, ?, 'IN_PROGRESS', 0, 0, 0, 0)`,
      [runId, startTime]
    );

    let ordersChecked = 0;
    let balancesChecked = 0;
    let mismatchesFound = 0;

    try {
      // 1. Reconcile any UNKNOWN orders
      const unknownOrders = await db.query<any>(
        `SELECT client_order_id, user_id FROM exchange_orders WHERE status = 'UNKNOWN' ${userId ? 'AND user_id = ?' : ''}`,
        userId ? [userId] : []
      );

      for (const ord of unknownOrders) {
        ordersChecked++;
        try {
          await BinanceGateway.reconcileUnknownOrder(ord.client_order_id);
        } catch (err: any) {
          mismatchesFound++;
          await this.recordMismatch({
            runId,
            userId: ord.user_id,
            entityType: 'ORDER',
            entityId: ord.client_order_id,
            severity: 'HIGH',
            localState: { status: 'UNKNOWN' },
            exchangeState: { error: err.message },
            notes: 'Could not query or reconcile unknown order from exchange.',
            actionTaken: 'DEGRADED',
          });
        }
      }

      // 2. Reconcile Open Orders & Detect Orphaned Exchange Orders
      const openOrders = await db.query<any>(
        `SELECT * FROM exchange_orders WHERE status IN ('SUBMITTING', 'OPEN', 'PARTIALLY_FILLED') ${userId ? 'AND user_id = ?' : ''}`,
        userId ? [userId] : []
      );

      for (const ord of openOrders) {
        ordersChecked++;
        // Check for stale orders (e.g. older than 10 minutes still in submitting)
        if (ord.status === 'SUBMITTING' && Date.now() - Number(ord.created_at) > 10 * 60 * 1000) {
          mismatchesFound++;
          await this.recordMismatch({
            runId,
            userId: ord.user_id,
            entityType: 'ORDER',
            entityId: ord.client_order_id,
            severity: 'MEDIUM',
            localState: { status: 'SUBMITTING', ageMinutes: (Date.now() - Number(ord.created_at)) / 60000 },
            exchangeState: { expected: 'Terminal state or open on book' },
            notes: 'Order stuck in SUBMITTING status for > 10 minutes.',
            actionTaken: 'DEGRADED',
          });
        }
      }

      // 3. Balance Sanity & Negative Balance Check (client cash and asset accounts must strictly be non-negative)
      const ledgerAccounts = await db.query<any>(
        `SELECT * FROM ledger_accounts 
         WHERE account_type IN ('sovereign_cash', 'user_vault', 'trading_allocated', 'crypto_holdings')
         ${userId ? 'AND user_id = ?' : ''}`,
        userId ? [userId] : []
      );

      for (const acc of ledgerAccounts) {
        balancesChecked++;
        if (BigInt(acc.balance_minor) < 0n) {
          mismatchesFound++;
          await this.recordMismatch({
            runId,
            userId: acc.user_id,
            entityType: 'BALANCE',
            entityId: acc.id,
            severity: 'CRITICAL',
            localState: { balanceMinor: acc.balance_minor, asset: acc.asset_or_currency },
            exchangeState: { invariant: 'Non-negative balance rule' },
            notes: 'CRITICAL INVARIANT BREACH: Negative ledger balance detected!',
            actionTaken: 'FREEZE_ACCOUNT',
          });

          // Auto freeze account on critical ledger corruption
          await OperationalSafetyService.freeze(
            'ACCOUNT',
            acc.user_id,
            'Critical negative ledger balance detected in local double-entry ledger',
            'reconciliation_worker'
          );

          await CircuitBreakerService.trip(
            'ledger_corruption',
            'ACCOUNT',
            acc.user_id,
            'Negative ledger balance invariant breach'
          );
        }
      }

      const now = Date.now();
      let overallRunSucceeded = true;

      // 4. Reconcile Local Authoritative Account State vs Exchange State
      if (userId) {
        const hasExchangeAccount = await db.queryOne<any>(
          `SELECT 1 FROM exchange_accounts WHERE user_id = ?`,
          [userId]
        );

        if (hasExchangeAccount) {
          // Single user reconciliation: balances, open orders, and trades
          const balancesResult = await this.reconcileBalancesAgainstExchange(userId, runId);
          mismatchesFound += balancesResult.mismatches;

          const openOrderMismatches = await this.reconcileOpenOrders(userId, runId);
          mismatchesFound += openOrderMismatches.mismatches;

          // Trade reconciliation for user's active symbols
          const symbolRows = await db.query<any>(
            `SELECT DISTINCT symbol FROM exchange_orders WHERE user_id = ?`,
            [userId]
          );
          const symbols = symbolRows.length > 0 ? symbolRows.map((r: any) => r.symbol) : ['BTCUSDT'];
          let tradesSucceeded = true;
          for (const sym of symbols) {
            const tradeResult = await this.reconcileTrades(userId, runId, sym);
            mismatchesFound += tradeResult.mismatches;
            if (!tradeResult.success) {
              tradesSucceeded = false;
            }
          }

          const userSuccess = balancesResult.success && openOrderMismatches.success && tradesSucceeded;
          if (!userSuccess) {
            overallRunSucceeded = false;
          }

          // Update durable exchange_sync_state for this user strictly based on verified success
          if (userSuccess) {
            try {
              await db.execute(
                `INSERT INTO exchange_sync_state (
                  account_id, last_sync_at, rest_health, updated_at
                ) VALUES (?, ?, 'HEALTHY', ?)
                ON CONFLICT(account_id) DO UPDATE SET
                  last_sync_at = excluded.last_sync_at,
                  rest_health = excluded.rest_health,
                  updated_at = excluded.updated_at`,
                [`rec_${userId}`, now, now]
              );
              this.userLastSuccessfulRuns.set(userId, now);
            } catch (err: any) {
              logger.warn(`[ReconciliationWorker] Failed to update exchange_sync_state for ${userId}: ${err.message}`);
            }
          } else {
            try {
              await db.execute(
                `INSERT INTO exchange_sync_state (
                  account_id, last_sync_at, rest_health, updated_at
                ) VALUES (?, 0, 'UNAVAILABLE', ?)
                ON CONFLICT(account_id) DO UPDATE SET
                  rest_health = excluded.rest_health,
                  updated_at = excluded.updated_at`,
                [`rec_${userId}`, now]
              );
            } catch (err: any) {
              logger.warn(`[ReconciliationWorker] Failed to update exchange_sync_state for ${userId}: ${err.message}`);
            }
            logger.warn(`[ReconciliationWorker] Exchange query failed for user ${userId}. Freshness timestamp NOT updated.`);
          }
        }
      } else {
        // Global scheduled run: Enumerate and reconcile EVERY registered user with exchange credentials
        const registeredUsers = await db.query<any>(
          `SELECT DISTINCT user_id FROM exchange_accounts WHERE can_trade = 1`
        );

        let allUsersSucceeded = registeredUsers.length > 0;

        for (const userRow of registeredUsers) {
          const uId = userRow.user_id;
          try {
            const balancesResult = await this.reconcileBalancesAgainstExchange(uId, runId);
            mismatchesFound += balancesResult.mismatches;

            const openOrderMismatches = await this.reconcileOpenOrders(uId, runId);
            mismatchesFound += openOrderMismatches.mismatches;

            const symbolRows = await db.query<any>(
              `SELECT DISTINCT symbol FROM exchange_orders WHERE user_id = ?`,
              [uId]
            );
            const symbols = symbolRows.length > 0 ? symbolRows.map((r: any) => r.symbol) : ['BTCUSDT'];
            let userTradesSucceeded = true;
            for (const sym of symbols) {
              const tradeResult = await this.reconcileTrades(uId, runId, sym);
              mismatchesFound += tradeResult.mismatches;
              if (!tradeResult.success) {
                userTradesSucceeded = false;
              }
            }

            const userSuccess = balancesResult.success && openOrderMismatches.success && userTradesSucceeded;

            if (userSuccess) {
              // Update per-user exchange_sync_state
              await db.execute(
                `INSERT INTO exchange_sync_state (
                  account_id, last_sync_at, rest_health, updated_at
                ) VALUES (?, ?, 'HEALTHY', ?)
                ON CONFLICT(account_id) DO UPDATE SET
                  last_sync_at = excluded.last_sync_at,
                  rest_health = excluded.rest_health,
                  updated_at = excluded.updated_at`,
                [`rec_${uId}`, now, now]
              );
              this.userLastSuccessfulRuns.set(uId, now);
            } else {
              allUsersSucceeded = false;
              await db.execute(
                `INSERT INTO exchange_sync_state (
                  account_id, last_sync_at, rest_health, updated_at
                ) VALUES (?, 0, 'UNAVAILABLE', ?)
                ON CONFLICT(account_id) DO UPDATE SET
                  rest_health = excluded.rest_health,
                  updated_at = excluded.updated_at`,
                [`rec_${uId}`, now]
              );
              logger.warn(`[ReconciliationWorker] Exchange query failed for user ${uId}. Freshness timestamp NOT updated.`);
            }
          } catch (userErr: any) {
            allUsersSucceeded = false;
            logger.error(`[ReconciliationWorker] Error reconciling exchange state for user ${uId}: ${userErr.message}`);
          }
        }

        overallRunSucceeded = allUsersSucceeded;

        // Also update rec_global for overall system health
        const globalHealth = allUsersSucceeded ? 'HEALTHY' : 'DEGRADED';
        try {
          await db.execute(
            `INSERT INTO exchange_sync_state (
              account_id, last_sync_at, rest_health, updated_at
            ) VALUES ('rec_global', ?, ?, ?)
            ON CONFLICT(account_id) DO UPDATE SET
              last_sync_at = excluded.last_sync_at,
              rest_health = excluded.rest_health,
              updated_at = excluded.updated_at`,
            [now, globalHealth, now]
          );
        } catch (err: any) {
          logger.warn(`[ReconciliationWorker] Failed to update global exchange_sync_state: ${err.message}`);
        }
        if (allUsersSucceeded) {
          this.lastSuccessfulRunAt = now;
        }
      }

      const durationMs = Date.now() - startTime;
      let status: 'SUCCESS' | 'MISMATCH_DETECTED' | 'FAILED' = 'SUCCESS';
      if (!overallRunSucceeded) {
        status = 'FAILED';
      } else if (mismatchesFound > 0) {
        status = 'MISMATCH_DETECTED';
      }

      await db.execute(
        `UPDATE reconciliation_runs SET status = ?, orders_checked = ?, balances_checked = ?, mismatches_found = ?, duration_ms = ? WHERE id = ?`,
        [status, ordersChecked, balancesChecked, mismatchesFound, durationMs, runId]
      );

      await AuditService.logEvent({
        userId,
        eventType: 'RECONCILIATION_RUN_COMPLETED',
        source: 'reconciliation_worker',
        actor: 'system',
        externalId: runId,
        metadata: { status, ordersChecked, balancesChecked, mismatchesFound, durationMs },
        result: mismatchesFound > 0 ? 'BLOCKED' : 'SUCCESS',
      });

      return {
        runId,
        status,
        ordersChecked,
        balancesChecked,
        mismatchesFound,
        durationMs,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Reconciles recent trades against exchange venue over a bounded overlapping window.
   * Deduplicates using canonical_fill_key. Never duplicates accounting.
   */
  static async reconcileTrades(
    userId: string,
    runId: string = `rec_run_${Date.now()}`,
    symbol: string = 'BTCUSDT',
    mockVenueTrades?: any[]
  ): Promise<ReconciliationStepResult> {
    let mismatches = 0;
    const db = getDb();

    let venueTrades: any[] | null = mockVenueTrades || null;

    if (!venueTrades) {
      const mockState = config.NODE_ENV === 'test' ? this.mockExchangeStates.get(userId) : undefined;
      if (mockState?.shouldFail) {
        return {
          success: false,
          mismatches: 0,
          error: mockState.failureError || 'Simulated exchange trade fetch failure',
        };
      }
      if (mockState?.trades && mockState.trades[symbol]) {
        venueTrades = mockState.trades[symbol];
      }
    }

    if (!venueTrades) {
      const creds = await BinanceGateway.getCredentials(userId);
      if (!creds?.apiKey) {
        return {
          success: false,
          mismatches: 0,
          error: `No exchange credentials found for user ${userId}`,
        };
      }

      if (
        config.NODE_ENV === 'test' &&
        (creds.apiKey.startsWith('mock_') || creds.apiKey.startsWith('test_')) &&
        !creds.apiKey.startsWith('mock_fail')
      ) {
        venueTrades = [];
      } else if (config.NODE_ENV === 'test' && creds.apiKey.startsWith('mock_fail')) {
        return {
          success: false,
          mismatches: 0,
          error: 'Simulated failure: mock_fail API key',
        };
      } else {
        try {
          const baseUrl =
            creds.environment === 'mainnet' ? 'https://api.binance.com' : 'https://testnet.binance.vision';
          const startTime = Date.now() - 3600_000; // 1 hour overlap window
          const timestamp = ClockSyncService.getExchangeTime();
          const queryString = `symbol=${symbol}&startTime=${startTime}&timestamp=${timestamp}&recvWindow=5000`;
          const signature = crypto.createHmac('sha256', creds.apiSecret).update(queryString).digest('hex');

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);

          const response = await fetch(`${baseUrl}/api/v3/myTrades?${queryString}&signature=${signature}`, {
            headers: { 'X-MBX-APIKEY': creds.apiKey },
            signal: controller.signal,
          });
          clearTimeout(timer);

          RateLimitTracker.recordResponse(response.headers, response.status);

          if (!response.ok) {
            const errorBody = await response.text().catch(() => '');
            logger.warn(`[ReconciliationWorker] Failed to query venue trades for ${symbol} (${response.status}): ${errorBody}`);
            return {
              success: false,
              mismatches: 0,
              error: `Binance myTrades API Error ${response.status}: ${errorBody || response.statusText}`,
            };
          }

          venueTrades = (await response.json()) as any[];
        } catch (err: any) {
          logger.warn(`[ReconciliationWorker] Network error querying venue trades for ${symbol}: ${err.message}`);
          return {
            success: false,
            mismatches: 0,
            error: `Network error querying Binance myTrades: ${err.message}`,
          };
        }
      }
    }

    if (!venueTrades) {
      return { success: false, mismatches: 0, error: 'Failed to retrieve exchange trades' };
    }

    if (venueTrades.length === 0) {
      return { success: true, mismatches: 0 };
    }

    for (const trade of venueTrades) {
      const tradeId = String(trade.id);
      const canonicalFillKey = `binance:${userId}:${symbol}:${tradeId}`;

      const existingFill = await db.queryOne<any>(
        `SELECT id, commission_status FROM exchange_fills WHERE canonical_fill_key = ?`,
        [canonicalFillKey]
      );

      if (!existingFill) {
        // Authoritative missing fill discovered on exchange!
        mismatches++;
        logger.warn(`[ReconciliationWorker] Missing fill discovered on exchange: ${canonicalFillKey}`);

        const fillPriceDec = ExactDecimal.from(trade.price || '0');
        const fillQtyDec = ExactDecimal.from(trade.qty || '0');
        const fillCommissionDec = ExactDecimal.from(trade.commission || '0');
        const fillAsset = trade.commissionAsset || 'USDT';
        const fillNotionalDec = fillPriceDec.mul(fillQtyDec);
        const accountingEventId = `settlement:${canonicalFillKey}`;
        const fillDbId = `fill_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        // Find or associate local order
        const localOrder = await db.queryOne<any>(
          `SELECT id, client_order_id FROM exchange_orders WHERE exchange_order_id = ? OR client_order_id = ? ORDER BY created_at DESC LIMIT 1`,
          [String(trade.orderId || ''), String(trade.orderId || '')]
        );
        const orderId = localOrder?.id || localOrder?.client_order_id || `rec_order_${trade.orderId || Date.now()}`;
        const quoteAsset = symbol.endsWith('USDT')
          ? 'USDT'
          : symbol.endsWith('USDC')
          ? 'USDC'
          : symbol.endsWith('FDUSD')
          ? 'FDUSD'
          : symbol.endsWith('BTC')
          ? 'BTC'
          : (trade.commissionAsset || 'USDT');
        const baseAsset = symbol.replace(new RegExp(`${quoteAsset}$`), '') || symbol;

        // Invariant: Never overwrite past ledger history. Post explicit compensating fill and accounting event.
        await db.transaction(async (tx) => {
          if (!localOrder) {
            await tx.execute(
              `INSERT INTO exchange_orders (
                id, user_id, client_order_id, exchange_order_id, symbol, side, type, status,
                orig_qty, orig_qty_exact, executed_qty, executed_qty_exact,
                price, price_exact, avg_price, avg_price_exact,
                cumulative_quote_qty, cumulative_quote_exact,
                quote_asset, notional, notional_exact,
                fee, fee_exact, fee_asset,
                actual_commission_exact, actual_commission_asset, commission_status,
                executed_notional_exact, reserved_cash_minor, reserved_qty_minor,
                idempotency_key, created_at, updated_at
              ) VALUES (
                ?, ?, ?, ?, ?, ?, 'MARKET', 'FILLED',
                0.0, ?, 0.0, ?,
                0.0, ?, 0.0, ?,
                0.0, ?,
                ?, 0.0, ?,
                0.0, ?, ?,
                ?, ?, 'AUTHORITATIVE',
                ?, 0, 0,
                ?, ?, ?
              ) ON CONFLICT (id) DO NOTHING`,
              [
                orderId,
                userId,
                orderId,
                String(trade.orderId || ''),
                symbol,
                trade.isBuyer ? 'BUY' : 'SELL',
                fillQtyDec.toString(),
                fillQtyDec.toString(),
                fillPriceDec.toString(),
                fillPriceDec.toString(),
                fillNotionalDec.toString(),
                quoteAsset,
                fillNotionalDec.toString(),
                fillCommissionDec.toString(),
                fillAsset,
                fillCommissionDec.toString(),
                fillAsset,
                fillNotionalDec.toString(),
                `idemp_${orderId}`,
                trade.time || Date.now(),
                trade.time || Date.now(),
              ]
            );
          }

          await tx.execute(
            `INSERT INTO exchange_fills (
              id, order_id, exchange_trade_id, canonical_fill_key, symbol,
              price, price_exact, qty, qty_exact,
              commission, commission_exact, commission_asset, commission_status,
              quote_qty, quote_qty_exact, executed_at
            ) VALUES (?, ?, ?, ?, ?, 0.0, ?, 0.0, ?, 0.0, ?, ?, 'AUTHORITATIVE', 0.0, ?, ?)
            ON CONFLICT (canonical_fill_key) DO NOTHING`,
            [
              fillDbId,
              orderId,
              tradeId,
              canonicalFillKey,
              symbol,
              fillPriceDec.toString(),
              fillQtyDec.toString(),
              fillCommissionDec.toString(),
              fillAsset,
              fillNotionalDec.toString(),
              trade.time || Date.now(),
            ]
          );

          await LedgerService.processFill({
            userId,
            accountMode: 'live',
            orderId,
            fillId: tradeId,
            symbol,
            baseAsset,
            quoteAsset,
            side: trade.isBuyer ? 'BUY' : 'SELL',
            price: fillPriceDec,
            quantity: fillQtyDec,
            fee: fillCommissionDec,
            feeAsset: fillAsset,
            commissionStatus: 'AUTHORITATIVE',
            accountingEventId,
            canonicalFillKey,
            executedAt: trade.time || Date.now(),
            tx,
          });
        });

        await this.recordMismatch({
          runId,
          userId,
          entityType: 'ORDER',
          entityId: canonicalFillKey,
          severity: 'HIGH',
          localState: { missing: true },
          exchangeState: { tradeId, price: trade.price, qty: trade.qty, commission: trade.commission },
          notes: `Missing exchange fill ${tradeId} discovered and settled authoritatively.`,
          actionTaken: 'DEGRADED',
          actionStatus: 'APPLIED',
        });
      } else if (existingFill.commission_status === 'PENDING') {
        // Authoritative venue trade record resolves previously pending fill!
        mismatches++;
        logger.info(`[ReconciliationWorker] Resolving pending commission for fill: ${canonicalFillKey}`);

        const fillPriceDec = ExactDecimal.from(trade.price || '0');
        const fillQtyDec = ExactDecimal.from(trade.qty || '0');
        const fillCommissionDec = ExactDecimal.from(trade.commission || '0');
        const fillAsset = trade.commissionAsset || 'USDT';
        const accountingEventId = `settlement:${canonicalFillKey}`;

        // Find or associate local order
        const localOrder = await db.queryOne<any>(
          `SELECT id, client_order_id FROM exchange_orders WHERE exchange_order_id = ? OR client_order_id = ? ORDER BY created_at DESC LIMIT 1`,
          [String(trade.orderId || ''), String(trade.orderId || '')]
        );
        const orderId = localOrder?.id || localOrder?.client_order_id || `rec_order_${trade.orderId || Date.now()}`;
        const quoteAsset = symbol.endsWith('USDT')
          ? 'USDT'
          : symbol.endsWith('USDC')
          ? 'USDC'
          : symbol.endsWith('FDUSD')
          ? 'FDUSD'
          : symbol.endsWith('BTC')
          ? 'BTC'
          : (trade.commissionAsset || 'USDT');
        const baseAsset = symbol.replace(new RegExp(`${quoteAsset}$`), '') || symbol;

        await db.transaction(async (tx) => {
          await tx.execute(
            `UPDATE exchange_fills SET
              commission = 0.0,
              commission_exact = ?,
              commission_asset = ?,
              commission_status = 'AUTHORITATIVE'
             WHERE id = ?`,
            [fillCommissionDec.toString(), fillAsset, existingFill.id]
          );

          if (localOrder) {
            await tx.execute(
              `UPDATE exchange_orders SET
                status = 'FILLED',
                fee = 0.0,
                fee_exact = ?,
                fee_asset = ?,
                actual_commission_exact = ?,
                actual_commission_asset = ?,
                commission_status = 'AUTHORITATIVE',
                updated_at = ?
               WHERE id = ?`,
              [
                fillCommissionDec.toString(),
                fillAsset,
                fillCommissionDec.toString(),
                fillAsset,
                Date.now(),
                localOrder.id,
              ]
            );
          }

          await LedgerService.processFill({
            userId,
            accountMode: 'live',
            orderId,
            fillId: tradeId,
            symbol,
            baseAsset,
            quoteAsset,
            side: trade.isBuyer ? 'BUY' : 'SELL',
            price: fillPriceDec,
            quantity: fillQtyDec,
            fee: fillCommissionDec,
            feeAsset: fillAsset,
            commissionStatus: 'AUTHORITATIVE',
            accountingEventId,
            canonicalFillKey,
            executedAt: trade.time || Date.now(),
            tx,
          });
        });

        await this.recordMismatch({
          runId,
          userId,
          entityType: 'ORDER',
          entityId: canonicalFillKey,
          severity: 'MEDIUM',
          localState: { commission_status: 'PENDING' },
          exchangeState: { tradeId, price: trade.price, qty: trade.qty, commission: trade.commission, commissionAsset: trade.commissionAsset },
          notes: `Pending fill commission for trade ${tradeId} resolved authoritatively from exchange venue.`,
          actionTaken: 'APPLIED',
          actionStatus: 'RESOLVED',
        });
      }
    }

    return { success: true, mismatches };
  }

  /**
   * Reconciles open orders against exchange open orders.
   * Identifies orphaned exchange orders (orders on Binance missing locally) and missing local orders.
   */
  static async reconcileOpenOrders(
    userId: string,
    runId: string = `rec_run_${Date.now()}`,
    mockVenueOpenOrders?: any[]
  ): Promise<ReconciliationStepResult> {
    let mismatches = 0;
    const db = getDb();

    let venueOpenOrders: any[] | null = mockVenueOpenOrders || null;

    if (!venueOpenOrders) {
      const mockState = config.NODE_ENV === 'test' ? this.mockExchangeStates.get(userId) : undefined;
      if (mockState?.shouldFail) {
        return {
          success: false,
          mismatches: 0,
          error: mockState.failureError || 'Simulated exchange open orders fetch failure',
        };
      }
      if (mockState?.openOrders) {
        venueOpenOrders = mockState.openOrders;
      }
    }

    if (!venueOpenOrders) {
      const creds = await BinanceGateway.getCredentials(userId);
      if (!creds?.apiKey) {
        return {
          success: false,
          mismatches: 0,
          error: `No exchange credentials found for user ${userId}`,
        };
      }

      if (
        config.NODE_ENV === 'test' &&
        (creds.apiKey.startsWith('mock_') || creds.apiKey.startsWith('test_')) &&
        !creds.apiKey.startsWith('mock_fail')
      ) {
        venueOpenOrders = [];
      } else if (config.NODE_ENV === 'test' && creds.apiKey.startsWith('mock_fail')) {
        return {
          success: false,
          mismatches: 0,
          error: 'Simulated failure: mock_fail API key',
        };
      } else {
        try {
          const baseUrl =
            creds.environment === 'mainnet' ? 'https://api.binance.com' : 'https://testnet.binance.vision';
          const timestamp = ClockSyncService.getExchangeTime();
          const queryString = `timestamp=${timestamp}&recvWindow=5000`;
          const signature = crypto.createHmac('sha256', creds.apiSecret).update(queryString).digest('hex');

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);

          const response = await fetch(`${baseUrl}/api/v3/openOrders?${queryString}&signature=${signature}`, {
            headers: { 'X-MBX-APIKEY': creds.apiKey },
            signal: controller.signal,
          });
          clearTimeout(timer);

          RateLimitTracker.recordResponse(response.headers, response.status);

          if (!response.ok) {
            const errorBody = await response.text().catch(() => '');
            logger.warn(`[ReconciliationWorker] Failed to query venue open orders (${response.status}): ${errorBody}`);
            return {
              success: false,
              mismatches: 0,
              error: `Binance openOrders API Error ${response.status}: ${errorBody || response.statusText}`,
            };
          }

          venueOpenOrders = (await response.json()) as any[];
        } catch (err: any) {
          logger.warn(`[ReconciliationWorker] Network error querying venue open orders: ${err.message}`);
          return {
            success: false,
            mismatches: 0,
            error: `Network error querying Binance openOrders: ${err.message}`,
          };
        }
      }
    }

    if (!venueOpenOrders) {
      return { success: false, mismatches: 0, error: 'Failed to retrieve exchange open orders' };
    }

    const localOpenOrders = await db.query<any>(
      `SELECT * FROM exchange_orders WHERE user_id = ? AND status IN ('SUBMITTING', 'OPEN', 'PARTIALLY_FILLED')`,
      [userId]
    );

    const localByClientOrderId = new Map<string, any>();
    for (const ord of localOpenOrders) {
      localByClientOrderId.set(ord.client_order_id, ord);
    }

    // 1. Detect orphaned exchange orders (on exchange but not in local DB)
    for (const venueOrd of venueOpenOrders) {
      const clientOrderId = venueOrd.clientOrderId;
      const localOrd = localByClientOrderId.get(clientOrderId);

      if (!localOrd) {
        mismatches++;
        logger.warn(`[ReconciliationWorker] Orphaned exchange order detected: ${venueOrd.orderId} (${clientOrderId})`);
        // Rule 8: Do NOT immediately delete or cancel! Persist reconciliation event and require administrative review.
        await this.recordMismatch({
          runId,
          userId,
          entityType: 'ORDER',
          entityId: String(venueOrd.orderId),
          severity: 'HIGH',
          localState: { existsLocally: false },
          exchangeState: {
            orderId: venueOrd.orderId,
            clientOrderId,
            symbol: venueOrd.symbol,
            origQty: venueOrd.origQty,
            status: venueOrd.status,
          },
          notes: `ORPHANED_EXCHANGE_ORDER: Order ${venueOrd.orderId} exists on venue but has no local record.`,
          actionTaken: 'REQUIRE_MANUAL_RECONCILIATION',
          actionStatus: 'PENDING',
        });
      }
    }

    return { success: true, mismatches };
  }

  /**
   * Reconciles local authoritative balances against exchange balances using ExactDecimal.
   * Discrepancies generate auditable RECONCILIATION_MISMATCH incidents without silently overwriting the ledger.
   */
  static async reconcileBalancesAgainstExchange(
    userId: string,
    runId: string = `rec_run_${Date.now()}`,
    mockExchangeBalances?: Record<string, number | string>,
    mockExchangeLocked?: Record<string, number | string>
  ): Promise<ReconciliationStepResult> {
    let mismatches = 0;
    const localProjection = await LedgerService.getAuthoritativeProjection(userId, 'live');

    let exchangeBalances: Record<string, number | string> | null = mockExchangeBalances || null;
    let exchangeLocked: Record<string, number | string> | null = mockExchangeLocked || null;

    if (!exchangeBalances) {
      const mockState = config.NODE_ENV === 'test' ? this.mockExchangeStates.get(userId) : undefined;
      if (mockState?.shouldFail) {
        return {
          success: false,
          mismatches: 0,
          error: mockState.failureError || 'Simulated exchange balance fetch failure',
        };
      }
      if (mockState?.balances) {
        exchangeBalances = mockState.balances;
        exchangeLocked = mockState.locked || null;
      }
    }

    if (!exchangeBalances) {
      const creds = await BinanceGateway.getCredentials(userId);
      if (!creds?.apiKey) {
        return {
          success: false,
          mismatches: 0,
          error: `No exchange credentials found for user ${userId}`,
        };
      }

      if (
        config.NODE_ENV === 'test' &&
        (creds.apiKey.startsWith('mock_') || creds.apiKey.startsWith('test_')) &&
        !creds.apiKey.startsWith('mock_fail')
      ) {
        const cashAsset = localProjection.cash.currency || 'USDT';
        exchangeBalances = {
          [cashAsset]: ExactDecimal.fromMinor(localProjection.cash.availableMinor, 2).toString(),
        };
        const positions = localProjection.positions || {};
        for (const [asset, pos] of Object.entries(positions)) {
          exchangeBalances[asset] = ExactDecimal.fromMinor(pos.availableQuantityMinor, 8).toString();
        }
        exchangeLocked = {};
      } else if (config.NODE_ENV === 'test' && creds.apiKey.startsWith('mock_fail')) {
        return {
          success: false,
          mismatches: 0,
          error: 'Simulated failure: mock_fail API key',
        };
      } else {
        try {
          const baseUrl =
            creds.environment === 'mainnet' ? 'https://api.binance.com' : 'https://testnet.binance.vision';
          const timestamp = ClockSyncService.getExchangeTime();
          const queryString = `timestamp=${timestamp}&recvWindow=5000`;
          const signature = crypto.createHmac('sha256', creds.apiSecret).update(queryString).digest('hex');

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);

          const response = await fetch(`${baseUrl}/api/v3/account?${queryString}&signature=${signature}`, {
            headers: { 'X-MBX-APIKEY': creds.apiKey },
            signal: controller.signal,
          });
          clearTimeout(timer);

          RateLimitTracker.recordResponse(response.headers, response.status);

          if (!response.ok) {
            const errorBody = await response.text().catch(() => '');
            logger.warn(`[ReconciliationWorker] Failed to query Binance account balances (${response.status}): ${errorBody}`);
            return {
              success: false,
              mismatches: 0,
              error: `Binance account API Error ${response.status}: ${errorBody || response.statusText}`,
            };
          }

          const data = (await response.json()) as any;
          exchangeBalances = {};
          exchangeLocked = {};
          for (const b of data.balances || []) {
            const freeDec = ExactDecimal.from(b.free || '0');
            const lockedDec = ExactDecimal.from(b.locked || '0');
            if (freeDec.gt(ExactDecimal.zero())) {
              exchangeBalances[b.asset] = b.free;
            }
            if (lockedDec.gt(ExactDecimal.zero())) {
              exchangeLocked[b.asset] = b.locked;
            }
          }
        } catch (e: any) {
          logger.warn(`[ReconciliationWorker] Network error querying Binance account balances: ${e.message}`);
          return {
            success: false,
            mismatches: 0,
            error: `Network error querying Binance account balances: ${e.message}`,
          };
        }
      }
    }

    if (!exchangeBalances) {
      return { success: false, mismatches: 0, error: 'Failed to retrieve exchange balances' };
    }

    // 1. Reconcile Cash
    const localCashDec = ExactDecimal.fromMinor(localProjection.cash.availableMinor, 2);
    const quoteAsset = localProjection.cash.currency || 'USDT';
    const rawExchangeCash = exchangeBalances[quoteAsset] ?? '0';
    const exchangeCashDec = ExactDecimal.from(rawExchangeCash);
    const cashDiffDec = localCashDec.sub(exchangeCashDec).abs();

    const cashTolerance = ExactDecimal.from('0.01'); // 1 cent tolerance
    const cashClassification = this.classifyDiscrepancy(cashDiffDec, cashTolerance);

    if (cashClassification === 'MATERIAL_MISMATCH') {
      mismatches++;
      const isCritical = cashDiffDec.gt(ExactDecimal.from('100.00'));
      const severity = isCritical ? 'CRITICAL' : 'HIGH';
      const actionTaken = isCritical ? 'FREEZE_ACCOUNT' : 'DEGRADED';

      await this.recordMismatch({
        runId,
        userId,
        entityType: 'BALANCE',
        entityId: quoteAsset,
        severity,
        localState: { availableCash: localCashDec.toString(), currency: quoteAsset },
        exchangeState: { availableCash: exchangeCashDec.toString(), diff: cashDiffDec.toString() },
        notes: `RECONCILIATION_MISMATCH: Cash discrepancy of ${cashDiffDec.toString()} ${quoteAsset} detected between local ledger and exchange venue.`,
        actionTaken,
      });

      if (isCritical) {
        await OperationalSafetyService.freeze(
          'ACCOUNT',
          userId,
          `Critical cash discrepancy of ${cashDiffDec.toString()} ${quoteAsset}`,
          'reconciliation_worker'
        );
        await CircuitBreakerService.trip('balance_discrepancy', 'ACCOUNT', userId, `Critical cash mismatch`);
      }
    }

    // 2. Reconcile Crypto Positions present in local ledger
    const positionTolerance = ExactDecimal.from('0.00000001'); // 1 satoshi tolerance

    for (const [asset, pos] of Object.entries(localProjection.positions)) {
      const localUnitsDec = ExactDecimal.fromMinor(pos.availableQuantityMinor, 8);
      const rawExchangeUnits = exchangeBalances[asset] ?? '0';
      const exchangeUnitsDec = ExactDecimal.from(rawExchangeUnits);
      const assetDiffDec = localUnitsDec.sub(exchangeUnitsDec).abs();
      const posClassification = this.classifyDiscrepancy(assetDiffDec, positionTolerance);

      if (posClassification === 'MATERIAL_MISMATCH') {
        mismatches++;
        await this.recordMismatch({
          runId,
          userId,
          entityType: 'POSITION',
          entityId: asset,
          severity: 'HIGH',
          localState: { availableQuantity: localUnitsDec.toString(), asset },
          exchangeState: { availableQuantity: exchangeUnitsDec.toString(), diff: assetDiffDec.toString() },
          notes: `RECONCILIATION_MISMATCH: Position discrepancy of ${assetDiffDec.toString()} ${asset} detected between local ledger and exchange venue.`,
          actionTaken: 'DEGRADED',
        });
      }
    }

    // 3. Reconcile Crypto Positions present on Exchange but missing in local ledger
    for (const [asset, exchangeVal] of Object.entries(exchangeBalances)) {
      if (asset === quoteAsset || localProjection.positions[asset]) continue;
      const exchangeUnitsDec = ExactDecimal.from(exchangeVal);
      if (exchangeUnitsDec.gt(positionTolerance)) {
        mismatches++;
        await this.recordMismatch({
          runId,
          userId,
          entityType: 'POSITION',
          entityId: asset,
          severity: 'HIGH',
          localState: { availableQuantity: '0', asset },
          exchangeState: { availableQuantity: exchangeUnitsDec.toString(), diff: exchangeUnitsDec.toString() },
          notes: `RECONCILIATION_MISMATCH: Exchange has unledgered balance of ${exchangeUnitsDec.toString()} ${asset}.`,
          actionTaken: 'DEGRADED',
        });
      }
    }

    return { success: true, mismatches };
  }

  /**
   * Persists auditable reconciliation mismatch evidence with action taken.
   * Invariant: Never destroys evidence or overwrites prior mismatch records.
   */
  static async recordMismatch(params: {
    runId: string;
    userId: string;
    entityType: 'BALANCE' | 'ORDER' | 'POSITION';
    entityId: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    localState: Record<string, any>;
    exchangeState: Record<string, any>;
    notes: string;
    actionTaken?: string;
    actionStatus?: string;
  }): Promise<void> {
    const db = getDb();
    const id = `mis_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Ensure run_id exists in reconciliation_runs to satisfy foreign key constraint
    await db.execute(
      `INSERT INTO reconciliation_runs (id, ran_at, status, orders_checked, balances_checked, mismatches_found, duration_ms)
       VALUES (?, ?, 'IN_PROGRESS', 0, 0, 0, 0)
       ON CONFLICT(id) DO NOTHING`,
      [params.runId, Date.now()]
    );

    await db.execute(
      `INSERT INTO reconciliation_mismatches (
        id, run_id, user_id, entity_type, entity_id, severity,
        local_state, exchange_state, action_taken, action_status, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.runId,
        params.userId,
        params.entityType,
        params.entityId,
        params.severity,
        JSON.stringify(params.localState, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
        JSON.stringify(params.exchangeState, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
        params.actionTaken || 'NONE',
        params.actionStatus || 'PENDING',
        params.notes,
        Date.now(),
      ]
    );

    await AuditService.logEvent({
      userId: params.userId,
      eventType: 'RECONCILIATION_MISMATCH',
      source: 'reconciliation_worker',
      actor: 'system',
      externalId: id,
      metadata: {
        severity: params.severity,
        entityType: params.entityType,
        entityId: params.entityId,
        actionTaken: params.actionTaken || 'NONE',
        notes: params.notes,
      },
      result: 'FAILURE',
      error: params.notes,
    });
  }

  /**
   * Deterministic recovery verification: Ensures all orders, fills, balances, and positions
   * pass reconciliation cleanly before re-opening live trading.
   */
  static async verifyRecovery(userId: string): Promise<{ clean: boolean; mismatches: number }> {
    const result = await this.executeReconciliationInternal(userId);
    return {
      clean: result.status === 'SUCCESS' && result.mismatchesFound === 0,
      mismatches: result.mismatchesFound,
    };
  }
}
