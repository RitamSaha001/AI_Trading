/**
 * Mandatory Intraday (MIS) Square-Off & Egress Service (NSE/BSE)
 * 
 * Implements:
 * 1. 15:00:00 IST Cutoff: Blocks new Intraday (MIS) BUY orders to prevent entering late exposure.
 * 2. 15:15:00 IST Auto-Egress: Automatically and gracefully squares off all open MIS limit orders
 *    and positions before Upstox RMS forced auto-liquidation (15:20 IST) with penalty fees (₹50+GST).
 * 3. Durable audit trail in panic_squareoff_runs and automated ledger balance reconciliation.
 */

import crypto from 'node:crypto';
import { getDb } from '../db';
import { logger, AuditService } from './auditService';
import { IndianMarketCalendar } from './brokers/upstox/indianMarketCalendar';
import { UpstoxAdapter } from './brokers/upstox/upstoxAdapter';
import { ReconciliationWorker } from './reconciliationWorker';

export interface IntradaySquareOffSummary {
  runId: string;
  userId: string;
  cancelledOrdersCount: number;
  positionsClosedCount: number;
  errors: string[];
  executedAt: number;
}

export class IntradaySquareOffService {
  private static schedulerTimer: NodeJS.Timeout | null = null;
  private static lastExecutedDateStr: string | null = null;
  private static mockCutoffActive: boolean | null = null;

  /**
   * For unit testing: allows mocking cutoff active state.
   */
  public static setMockCutoffActive(active: boolean | null): void {
    this.mockCutoffActive = active;
  }

  /**
   * Determines if the 15:00 IST intraday cutoff is currently active.
   * When active, no new Intraday (MIS) BUY orders are permitted.
   */
  public static isCutoffActive(date: Date = new Date()): boolean {
    if (this.mockCutoffActive !== null) {
      return this.mockCutoffActive;
    }

    const session = IndianMarketCalendar.getSession(date);
    if (session !== 'NORMAL') return false;

    const ist = IndianMarketCalendar.toIST(date);
    // 15:00 IST = 900 minutes. Regular session ends at 15:30 IST = 930 minutes.
    return ist.timeMinutes >= 900 && ist.timeMinutes < 930;
  }

  /**
   * Determines if the 15:15 IST auto-squareoff window is reached.
   */
  public static isSquareOffTime(date: Date = new Date()): boolean {
    const session = IndianMarketCalendar.getSession(date);
    if (session !== 'NORMAL') return false;

    const ist = IndianMarketCalendar.toIST(date);
    // 15:15 IST = 915 minutes.
    return ist.timeMinutes >= 915 && ist.timeMinutes < 930;
  }

  /**
   * Executes automated square-off for a specific user or all active Upstox users.
   */
  public static async executeIntradaySquareOff(targetUserId?: string): Promise<IntradaySquareOffSummary[]> {
    const db = getDb();
    const upstoxAdapter = new UpstoxAdapter();
    const results: IntradaySquareOffSummary[] = [];

    const userRows = targetUserId
      ? [{ user_id: targetUserId }]
      : await db.query<{ user_id: string }>(
          `SELECT DISTINCT user_id FROM broker_credentials WHERE broker = 'upstox' AND can_trade = 1`
        );

    for (const { user_id: userId } of userRows) {
      const runId = `mis_egress_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const startedAt = Date.now();
      const errors: string[] = [];
      let cancelledOrdersCount = 0;
      let positionsClosedCount = 0;

      await AuditService.logEvent({
        userId,
        eventType: 'INTRADAY_SQUARE_OFF_STARTED',
        source: 'intraday_square_off_service',
        actor: 'system_daemon',
        metadata: { runId, deadline: '15:15 IST' },
        result: 'SUCCESS',
      });

      // 1. Cancel all open/submitting MIS orders
      try {
        const openOrders = await db.query<any>(
          `SELECT * FROM exchange_orders 
           WHERE user_id = ? AND broker = 'upstox' 
             AND status IN ('OPEN', 'PARTIALLY_FILLED', 'SUBMITTING')`,
          [userId]
        );

        for (const ord of openOrders) {
          try {
            await upstoxAdapter.cancelOrder(userId, ord.client_order_id);
            cancelledOrdersCount++;
          } catch (cancelErr: any) {
            errors.push(`Failed to cancel order ${ord.client_order_id}: ${cancelErr.message}`);
          }
        }
      } catch (err: any) {
        errors.push(`Failed to query open orders: ${err.message}`);
      }

      // 2. Query and square off open MIS positions
      try {
        const positions = await upstoxAdapter.getPositions(userId);
        for (const pos of positions) {
          const qty = Number(pos.quantity || 0);
          if (qty === 0) continue;

          // Square off: if long (+qty), submit SELL; if short (-qty), submit BUY
          const side: 'BUY' | 'SELL' = qty > 0 ? 'SELL' : 'BUY';
          const closeQty = Math.abs(qty);

          try {
            const closeClientOrderId = `close_mis_${Date.now()}_${pos.symbol.slice(0, 6)}`;
            await upstoxAdapter.placeOrder({
              userId,
              symbol: pos.symbol,
              side,
              type: 'MARKET',
              quantity: closeQty,
              clientOrderId: closeClientOrderId,
              idempotencyKey: closeClientOrderId,
              product: 'I',
              validity: 'DAY',
              slice: true,
              isSystemPanic: true, // Bypass human token confirmation for system square-off
            });
            positionsClosedCount++;
          } catch (posErr: any) {
            errors.push(`Failed to square off position ${pos.symbol}: ${posErr.message}`);
          }
        }
      } catch (err: any) {
        errors.push(`Failed to query positions: ${err.message}`);
      }

      // 3. Persist run record in panic_squareoff_runs table
      try {
        await db.execute(
          `INSERT INTO panic_squareoff_runs (
            id, user_id, broker, status, cancelled_orders_count,
            positions_evaluated_count, close_orders_submitted_count, started_at, completed_at
          ) VALUES (?, ?, 'upstox', ?, ?, ?, ?, ?, ?)`,
          [
            runId,
            userId,
            errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
            cancelledOrdersCount,
            positionsClosedCount,
            positionsClosedCount,
            startedAt,
            Date.now(),
          ]
        );
      } catch (dbErr: any) {
        logger.error(`[IntradaySquareOff] Failed to persist run record: ${dbErr.message}`);
      }

      // 4. Trigger reconciliation
      await ReconciliationWorker.runReconciliation(userId).catch(() => {});

      await AuditService.logEvent({
        userId,
        eventType: 'INTRADAY_SQUARE_OFF_COMPLETED',
        source: 'intraday_square_off_service',
        actor: 'system_daemon',
        metadata: { runId, cancelledOrdersCount, positionsClosedCount, errors },
        result: errors.length > 0 ? 'DEGRADED' : 'SUCCESS',
      });

      results.push({
        runId,
        userId,
        cancelledOrdersCount,
        positionsClosedCount,
        errors,
        executedAt: Date.now(),
      });
    }

    return results;
  }

  /**
   * Starts periodic scheduler (checks every 30 seconds).
   */
  public static startScheduler(intervalMs: number = 30_000): void {
    if (this.schedulerTimer) return;

    this.schedulerTimer = setInterval(() => {
      const now = new Date();
      const ist = IndianMarketCalendar.toIST(now);

      if (this.isSquareOffTime(now)) {
        if (this.lastExecutedDateStr !== ist.dateStr) {
          this.lastExecutedDateStr = ist.dateStr;
          logger.info(`[IntradaySquareOff] 15:15 IST triggered auto-squareoff for date ${ist.dateStr}`);
          void this.executeIntradaySquareOff().catch((err) => {
            logger.error(`[IntradaySquareOff] Auto-squareoff error: ${err.message}`);
          });
        }
      }
    }, intervalMs);
  }

  public static stop(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }
}
