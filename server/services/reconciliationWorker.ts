import { getDb } from '../db';
import { AuditService, logger } from './auditService';
import { BinanceGateway } from './binanceGateway';
import crypto from 'node:crypto';

export interface ReconciliationResult {
  runId: string;
  status: 'SUCCESS' | 'MISMATCH_DETECTED' | 'FAILED';
  ordersChecked: number;
  balancesChecked: number;
  mismatchesFound: number;
  durationMs: number;
}

export class ReconciliationWorker {
  private static isRunning = false;

  /**
   * Executes an authoritative reconciliation run against exchange venues and local ledger projections.
   */
  static async runReconciliation(userId?: string): Promise<ReconciliationResult> {
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
        // Check for stale orders (e.g. older than 24h still in submitting)
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

      // 3. Balance Sanity & Negative Balance Check
      const ledgerAccounts = await db.query<any>(
        `SELECT * FROM ledger_accounts ${userId ? 'WHERE user_id = ?' : ''}`,
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

      const durationMs = Date.now() - startTime;
      const status = mismatchesFound > 0 ? 'MISMATCH_DETECTED' : 'SUCCESS';

      await db.execute(
        `INSERT INTO reconciliation_runs (id, ran_at, status, orders_checked, balances_checked, mismatches_found, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [runId, startTime, status, ordersChecked, balancesChecked, mismatchesFound, durationMs]
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

  private static async recordMismatch(params: {
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
        JSON.stringify(params.localState),
        JSON.stringify(params.exchangeState),
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
