import { getDb } from '../db';
import { AuditService, logger } from './auditService';
import { BinanceGateway } from './binanceGateway';
import { LedgerService } from './ledgerService';
import { ExactDecimal } from './precision';
import { DistributedLockService } from './distributedLockService';
import crypto from 'node:crypto';

export interface ReconciliationResult {
  runId: string;
  status: 'SUCCESS' | 'MISMATCH_DETECTED' | 'FAILED';
  ordersChecked: number;
  balancesChecked: number;
  mismatchesFound: number;
  durationMs: number;
}

export type DiscrepancyClassification = 'EXACT_MATCH' | 'WITHIN_PRECISION' | 'MATERIAL_MISMATCH';

export class ReconciliationWorker {
  private static isRunning = false;

  static stop(): void {
    this.isRunning = false;
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
          });
        }
      }

      // 2. Reconcile Open Orders
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
        if (Number(acc.balance_minor) < 0) {
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
          });

          // Auto freeze account on critical ledger corruption
          await db.execute(
            `UPDATE account_limits SET is_emergency_frozen = 1, freeze_reason = 'Critical negative ledger balance detected' WHERE user_id = ?`,
            [acc.user_id]
          );
        }
      }

      // 4. Reconcile Local Authoritative Account State vs Exchange State
      if (userId) {
        const mismatchCount = await this.reconcileBalancesAgainstExchange(userId, runId);
        mismatchesFound += mismatchCount;
      }

      const durationMs = Date.now() - startTime;
      const status = mismatchesFound > 0 ? 'MISMATCH_DETECTED' : 'SUCCESS';

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
   * Reconciles local authoritative balances against exchange balances using ExactDecimal.
   * Discrepancies generate auditable RECONCILIATION_MISMATCH incidents without silently overwriting the ledger.
   */
  static async reconcileBalancesAgainstExchange(
    userId: string,
    runId: string = `rec_run_${Date.now()}`,
    mockExchangeBalances?: Record<string, number | string>
  ): Promise<number> {
    let mismatches = 0;
    const localProjection = await LedgerService.getAuthoritativeProjection(userId, 'live');

    let exchangeBalances: Record<string, number | string> | null = mockExchangeBalances || null;

    if (!exchangeBalances) {
      const creds = await BinanceGateway.getCredentials(userId);
      if (creds?.apiKey) {
        try {
          const baseUrl =
            creds.environment === 'mainnet'
              ? 'https://api.binance.com'
              : 'https://testnet.binance.vision';
          const timestamp = Date.now();
          const queryString = `timestamp=${timestamp}`;
          const signature = crypto
            .createHmac('sha256', creds.apiSecret)
            .update(queryString)
            .digest('hex');

          const response = await fetch(`${baseUrl}/api/v3/account?${queryString}&signature=${signature}`, {
            headers: { 'X-MBX-APIKEY': creds.apiKey },
          });

          if (response.ok) {
            const data = (await response.json()) as any;
            exchangeBalances = {};
            for (const b of data.balances || []) {
              const freeDec = ExactDecimal.from(b.free || '0');
              if (freeDec.gt(ExactDecimal.zero())) {
                exchangeBalances[b.asset] = b.free;
              }
            }
          }
        } catch (e: any) {
          logger.warn(`Could not query Binance account balances for reconciliation: ${e.message}`);
        }
      }
    }

    if (!exchangeBalances) {
      return 0;
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
      await this.recordMismatch({
        runId,
        userId,
        entityType: 'BALANCE',
        entityId: quoteAsset,
        severity: isCritical ? 'CRITICAL' : 'HIGH',
        localState: { availableCash: localCashDec.toString(), currency: quoteAsset },
        exchangeState: { availableCash: exchangeCashDec.toString(), diff: cashDiffDec.toString() },
        notes: `RECONCILIATION_MISMATCH: Cash discrepancy of ${cashDiffDec.toFixed(2)} ${quoteAsset} detected between local ledger and exchange venue.`,
      });
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
        });
      }
    }

    return mismatches;
  }

  static async recordMismatch(params: {
    runId: string;
    userId: string;
    entityType: 'BALANCE' | 'ORDER' | 'POSITION';
    entityId: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    localState: Record<string, any>;
    exchangeState: Record<string, any>;
    notes: string;
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
        local_state, exchange_state, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.runId,
        params.userId,
        params.entityType,
        params.entityId,
        params.severity,
        JSON.stringify(params.localState, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
        JSON.stringify(params.exchangeState, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
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
        notes: params.notes,
      },
      result: 'FAILURE',
      error: params.notes,
    });
  }
}
