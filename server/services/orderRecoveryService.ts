import { getDb } from '../db';
import { BinanceGateway } from './binanceGateway';
import { LedgerService } from './ledgerService';
import { OrderStateMachine } from './orderStateMachine';
import { ExactDecimal } from './precision';
import { AuditService } from './auditService';
import { DistributedLockService } from './distributedLockService';
import crypto from 'node:crypto';

export interface RecoverySweepResult {
  ordersInspected: number;
  recoveredCount: number;
  unresolvedCount: number;
  actions: Array<{
    clientOrderId: string;
    fromStatus: string;
    toStatus: string;
    action: string;
    reason?: string;
  }>;
}

export class OrderRecoveryService {
  private static isRunning = false;

  static stop(): void {
    this.isRunning = false;
  }

  /**
   * Deterministic recovery sweep across all non-terminal trading states.
   * Coordinated across multiple server instances via DistributedLockService.
   */
  static async runRecoverySweep(): Promise<RecoverySweepResult> {
    return (
      (await DistributedLockService.withLock('worker:order_recovery', 60_000, async () => {
        return this.executeRecoverySweepInternal();
      })) || {
        ordersInspected: 0,
        recoveredCount: 0,
        unresolvedCount: 0,
        actions: [],
      }
    );
  }

  /**
   * Internal implementation of recovery sweep.
   */
  private static async executeRecoverySweepInternal(): Promise<RecoverySweepResult> {
    this.isRunning = true;
    const db = getDb();

    const nonTerminalOrders = await db.query<any>(
      `SELECT * FROM exchange_orders 
       WHERE status IN ('SUBMITTING', 'UNKNOWN', 'RECONCILING', 'CANCEL_REQUESTED', 'PARTIALLY_FILLED', 'OPEN')
       ORDER BY created_at ASC`
    );

    const result: RecoverySweepResult = {
      ordersInspected: nonTerminalOrders.length,
      recoveredCount: 0,
      unresolvedCount: 0,
      actions: [],
    };

    for (const order of nonTerminalOrders) {
      if (!this.isRunning) break;

      const clientOrderId = order.client_order_id;
      const currentStatus = order.status;

      try {
        const venueResult = await BinanceGateway.reconcileUnknownOrder(
          clientOrderId,
          order.symbol,
          order.user_id
        );

        if (venueResult.notFoundConfirmed) {
          // Case A: Exchange confirms order was NEVER accepted on the book
          await db.transaction(async (tx) => {
            await LedgerService.releaseOrderReservation({ orderId: clientOrderId, tx });
            await tx.execute(
              `UPDATE exchange_orders 
               SET status = 'REJECTED', 
                   reserved_cash = 0, reserved_qty = 0, reserved_cash_minor = 0, reserved_qty_minor = 0,
                   reject_reason = ?, 
                   updated_at = ? 
               WHERE client_order_id = ?`,
              [
                'Recovery: Order never reached exchange venue before interruption',
                Date.now(),
                clientOrderId,
              ]
            );
          });

          await AuditService.logEvent({
            userId: order.user_id,
            eventType: 'ORDER_RECOVERED_REJECTED',
            source: 'order_recovery_service',
            actor: 'system',
            metadata: { clientOrderId, fromStatus: currentStatus, toStatus: 'REJECTED' },
            result: 'SUCCESS',
          });

          result.recoveredCount++;
          result.actions.push({
            clientOrderId,
            fromStatus: currentStatus,
            toStatus: 'REJECTED',
            action: 'RELEASE_RESERVATION_AND_REJECT',
            reason: 'Order confirmed absent from exchange venue',
          });
        } else if (venueResult.found) {
          // Case B: Order exists on exchange
          const exchangeStatus = (venueResult.status || 'OPEN').toUpperCase();

          if (exchangeStatus === 'FILLED') {
            const executedQtyDec = ExactDecimal.from(
              venueResult.executedQtyExact || venueResult.executedQty || order.orig_qty_exact || order.orig_qty
            );
            const avgPriceDec = ExactDecimal.from(
              venueResult.avgPriceExact || venueResult.avgPrice || order.price_exact || order.price
            );
            const notionalSettledDec = executedQtyDec.mul(avgPriceDec);

            let feeAmountDec: ExactDecimal;
            let feeAssetActual = order.quote_asset;
            if (venueResult.fills && venueResult.fills.length > 0) {
              feeAmountDec = ExactDecimal.zero();
              for (const fill of venueResult.fills) {
                feeAmountDec = feeAmountDec.add(ExactDecimal.from(fill.commission));
                if (fill.commissionAsset) feeAssetActual = fill.commissionAsset;
              }
            } else {
              feeAmountDec = notionalSettledDec.mul(ExactDecimal.from('0.00075'));
            }

            const tradeId = `trd_rec_${clientOrderId}_${executedQtyDec.toString()}`;
            const fillId = `fill_rec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
            const baseAsset = order.symbol.replace(order.quote_asset, '');
            const now = Date.now();

            await db.transaction(async (tx) => {
              await tx.execute(
                `UPDATE exchange_orders SET
                  status = 'FILLED', exchange_order_id = ?, executed_qty = ?, executed_qty_exact = ?,
                  avg_price = ?, avg_price_exact = ?, cumulative_quote_qty = ?, cumulative_quote_exact = ?,
                  fee = ?, fee_exact = ?, fee_asset = ?, updated_at = ?
                 WHERE client_order_id = ?`,
                [
                  venueResult.exchangeOrderId || `ex_rec_${now}`,
                  executedQtyDec.toDisplayNumber(), // PRECISION_BOUNDARY: legacy REAL column
                  executedQtyDec.toString(),       // Authoritative exact string
                  avgPriceDec.toDisplayNumber(),    // PRECISION_BOUNDARY: legacy REAL column
                  avgPriceDec.toString(),          // Authoritative exact string
                  notionalSettledDec.toDisplayNumber(), // PRECISION_BOUNDARY: legacy REAL column
                  notionalSettledDec.toString(),   // Authoritative exact string
                  feeAmountDec.toDisplayNumber(),  // PRECISION_BOUNDARY: legacy REAL column
                  feeAmountDec.toString(),         // Authoritative exact string
                  feeAssetActual,
                  now,
                  clientOrderId,
                ]
              );

              await tx.execute(
                `INSERT INTO exchange_fills (
                  id, order_id, exchange_trade_id, symbol, price, price_exact, qty, qty_exact,
                  commission, commission_exact, commission_asset, quote_qty, quote_qty_exact, executed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (order_id, exchange_trade_id) DO NOTHING`,
                [
                  fillId,
                  clientOrderId,
                  tradeId,
                  order.symbol,
                  avgPriceDec.toDisplayNumber(),    // PRECISION_BOUNDARY: legacy REAL column
                  avgPriceDec.toString(),          // Authoritative exact string
                  executedQtyDec.toDisplayNumber(), // PRECISION_BOUNDARY: legacy REAL column
                  executedQtyDec.toString(),       // Authoritative exact string
                  feeAmountDec.toDisplayNumber(),  // PRECISION_BOUNDARY: legacy REAL column
                  feeAmountDec.toString(),         // Authoritative exact string
                  feeAssetActual,
                  notionalSettledDec.toDisplayNumber(), // PRECISION_BOUNDARY: legacy REAL column
                  notionalSettledDec.toString(),   // Authoritative exact string
                  now,
                ]
              );

              await LedgerService.processFill({
                userId: order.user_id,
                accountMode: 'live',
                orderId: clientOrderId,
                fillId: tradeId,
                symbol: order.symbol,
                baseAsset,
                quoteAsset: order.quote_asset,
                side: order.side,
                price: avgPriceDec,
                quantity: executedQtyDec,
                fee: feeAmountDec,
                feeAsset: feeAssetActual,
                executedAt: now,
                tx,
              });

              await LedgerService.releaseOrderReservation({ orderId: clientOrderId, tx });
            });

            await AuditService.logEvent({
              userId: order.user_id,
              eventType: 'ORDER_RECOVERED_FILLED',
              source: 'order_recovery_service',
              actor: 'system',
              metadata: { clientOrderId, fromStatus: currentStatus, toStatus: 'FILLED' },
              result: 'SUCCESS',
            });

            result.recoveredCount++;
            result.actions.push({
              clientOrderId,
              fromStatus: currentStatus,
              toStatus: 'FILLED',
              action: 'SETTLE_FILL_AND_FINALIZE',
            });
          } else if (exchangeStatus === 'CANCELED' || exchangeStatus === 'CANCELLED' || exchangeStatus === 'EXPIRED') {
            await db.transaction(async (tx) => {
              await LedgerService.releaseOrderReservation({ orderId: clientOrderId, tx });
              await tx.execute(
                `UPDATE exchange_orders 
                 SET status = 'CANCELED', 
                     reserved_cash = 0, reserved_qty = 0, reserved_cash_minor = 0, reserved_qty_minor = 0,
                     updated_at = ? 
                 WHERE client_order_id = ?`,
                [Date.now(), clientOrderId]
              );
            });

            await AuditService.logEvent({
              userId: order.user_id,
              eventType: 'ORDER_RECOVERED_CANCELED',
              source: 'order_recovery_service',
              actor: 'system',
              metadata: { clientOrderId, fromStatus: currentStatus, toStatus: 'CANCELED' },
              result: 'SUCCESS',
            });

            result.recoveredCount++;
            result.actions.push({
              clientOrderId,
              fromStatus: currentStatus,
              toStatus: 'CANCELED',
              action: 'RELEASE_RESERVATION_AND_CANCEL',
            });
          } else if (exchangeStatus === 'NEW' || exchangeStatus === 'PARTIALLY_FILLED') {
            const targetStatus = exchangeStatus === 'NEW' ? 'OPEN' : 'PARTIALLY_FILLED';
            await db.execute(
              `UPDATE exchange_orders SET status = ?, exchange_order_id = ?, updated_at = ? WHERE client_order_id = ?`,
              [targetStatus, venueResult.exchangeOrderId || order.exchange_order_id, Date.now(), clientOrderId]
            );

            result.recoveredCount++;
            result.actions.push({
              clientOrderId,
              fromStatus: currentStatus,
              toStatus: targetStatus,
              action: 'SYNC_EXCHANGE_STATE',
            });
          }
        } else {
          // Case C: Exchange unreachable or order age check
          const ageMs = Date.now() - Number(order.created_at);
          if (currentStatus === 'SUBMITTING' && ageMs > 30000) {
            // Stuck in SUBMITTING without exchange ACK -> transition to UNKNOWN without releasing reservations
            await db.execute(
              `UPDATE exchange_orders SET status = 'UNKNOWN', reject_reason = ?, updated_at = ? WHERE client_order_id = ?`,
              ['Stuck in SUBMITTING state; preserved reservation in UNKNOWN state', Date.now(), clientOrderId]
            );
            result.recoveredCount++;
            result.actions.push({
              clientOrderId,
              fromStatus: currentStatus,
              toStatus: 'UNKNOWN',
              action: 'TRANSITION_UNKNOWN_PRESERVE_CAPITAL',
            });
          } else {
            result.unresolvedCount++;
          }
        }
      } catch (err: any) {
        result.unresolvedCount++;
        result.actions.push({
          clientOrderId,
          fromStatus: currentStatus,
          toStatus: currentStatus,
          action: 'ERROR',
          reason: err.message,
        });
      }
    }

    this.isRunning = false;
    return result;
  }
}
