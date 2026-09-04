import { getDb } from '../db';
import { AuditService, logger } from './auditService';
import { BinanceGateway } from './binanceGateway';
import { LedgerService } from './ledgerService';
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
   * Reconciles local authoritative balances against exchange balances.
   * Discrepancies generate auditable RECONCILIATION_MISMATCH incidents without silently overwriting the ledger.
   */
  static async reconcileBalancesAgainstExchange(
    userId: string,
    runId: string = `rec_run_${Date.now()}`,
    mockExchangeBalances?: Record<string, number>
  ): Promise<number> {
    let mismatches = 0;
    const localProjection = await LedgerService.getAuthoritativeProjection(userId, 'live');

    let exchangeBalances: Record<string, number> | null = mockExchangeBalances || null;

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
              const free = parseFloat(b.free || '0');
              if (free > 0) {
                exchangeBalances[b.asset] = free;
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
    const localCash = localProjection.cash.available;
    const quoteAsset = localProjection.cash.currency || 'USDT';
    const exchangeCash = exchangeBalances[quoteAsset] ?? 0;
    const cashDiff = Math.abs(localCash - exchangeCash);

    if (cashDiff > 0.01) {
      mismatches++;
      await this.recordMismatch({
        runId,
        userId,
        entityType: 'BALANCE',
        entityId: quoteAsset,
        severity: cashDiff > 100 ? 'CRITICAL' : 'HIGH',
        localState: { availableCash: localCash, currency: quoteAsset },
        exchangeState: { availableCash: exchangeCash, diff: cashDiff },
        notes: `RECONCILIATION_MISMATCH: Cash discrepancy of ${cashDiff.toFixed(2)} ${quoteAsset} detected between local ledger and exchange venue.`,
      });
    }

    // 2. Reconcile Crypto Positions
    for (const [asset, pos] of Object.entries(localProjection.positions)) {
      const localUnits = pos.availableQuantity;
      const exchangeUnits = exchangeBalances[asset] ?? 0;
      const assetDiff = Math.abs(localUnits - exchangeUnits);

      if (assetDiff > 0.00001) {
        mismatches++;
        await this.recordMismatch({
          runId,
          userId,
          entityType: 'POSITION',
          entityId: asset,
          severity: 'HIGH',
          localState: { availableQuantity: localUnits, asset },
          exchangeState: { availableQuantity: exchangeUnits, diff: assetDiff },
          notes: `RECONCILIATION_MISMATCH: Position discrepancy of ${assetDiff} ${asset} detected between local ledger and exchange venue.`,
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
