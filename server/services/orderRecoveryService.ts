import { getDb } from '../db';
import { BrokerRegistry } from './brokers/brokerRegistry';
import { BrokerGateway } from './brokers/brokerGateway';
import { LedgerService } from './ledgerService';
import { OrderStateMachine } from './orderStateMachine';
import { ExactDecimal } from './precision';
import { AuditService } from './auditService';
import { DistributedLockService, LeaseController } from './distributedLockService';
import { config } from '../config';
import { OrderFillsService } from './orderFillsService';
import { UpstoxInstrumentMasterService } from './brokers/upstox/upstoxInstrumentMasterService';
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
      (await DistributedLockService.withLock('worker:order_recovery', 60_000, async (leaseController) => {
        return this.executeRecoverySweepInternal(leaseController);
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
  private static async executeRecoverySweepInternal(leaseController?: LeaseController): Promise<RecoverySweepResult> {
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
      const brokerId = order.broker || 'binance';
      const broker: BrokerGateway = BrokerRegistry.get(brokerId);

      try {
        const venueResult = await broker.reconcileUnknownOrder(
          clientOrderId,
          order.symbol,
          order.user_id
        );

        if (venueResult.notFoundConfirmed) {
          // Case A: Exchange confirms order was NEVER accepted on the book
          leaseController?.assertLeaseValid('order recovery rejection');
          await db.transaction(async (tx) => {
            await OrderStateMachine.transitionOrder(clientOrderId, 'REJECTED', {
              tx,
              reason: 'Recovery: Order never reached exchange venue before interruption',
              source: 'order_recovery_service',
              actor: 'system',
              releaseReservationOnTerminal: true,
              extraFields: {
                reserved_cash: 0,
                reserved_qty: 0,
                reserved_cash_minor: 0,
                reserved_qty_minor: 0,
                reject_reason: 'Recovery: Order never reached exchange venue before interruption',
              },
            });
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
            let fills = venueResult.fills;
            if (!fills || fills.length === 0) {
              try {
                fills = await broker.fetchOrderFills(
                  order.user_id,
                  order.symbol,
                  venueResult.exchangeOrderId || order.exchange_order_id,
                  clientOrderId
                );
              } catch (err: any) {
                console.warn(`[OrderRecoveryService] Failed to fetch venue fills for ${clientOrderId}:`, err.message);
              }
            }

            const hasAuthoritativeCommission =
              fills &&
              fills.length > 0 &&
              fills.every((f) => f.commission !== undefined && f.commission !== null && f.commission !== '' && f.commissionAsset);

            if (!hasAuthoritativeCommission) {
              // Authoritative fee data missing! Keep order in RECONCILING, commission_status = 'PENDING'
              await OrderStateMachine.transitionOrder(clientOrderId, 'RECONCILING', {
                reason: 'Missing authoritative fee data from exchange venue',
                source: 'order_recovery_service',
                actor: 'system',
                extraFields: {
                  exchange_order_id: venueResult.exchangeOrderId || order.exchange_order_id || `ex_rec_${Date.now()}`,
                  executed_qty: 0.0,
                  executed_qty_exact: venueResult.executedQtyExact || order.orig_qty_exact || String(order.orig_qty || 0),
                  avg_price: 0.0,
                  avg_price_exact: venueResult.avgPriceExact || order.price_exact || String(order.price || 0),
                  cumulative_quote_qty: 0.0,
                  cumulative_quote_exact: order.notional_exact || String(order.notional || 0),
                  executed_notional_exact: order.notional_exact || String(order.notional || 0),
                  commission_status: 'PENDING',
                },
              });

              await AuditService.logEvent({
                userId: order.user_id,
                eventType: 'ORDER_RECONCILING_PENDING_COMMISSION',
                source: 'order_recovery_service',
                actor: 'system',
                metadata: {
                  clientOrderId,
                  exchangeOrderId: venueResult.exchangeOrderId || order.exchange_order_id,
                  status: 'RECONCILING',
                  commissionStatus: 'PENDING',
                },
                result: 'SUCCESS',
              });

              result.unresolvedCount++;
              result.actions.push({
                clientOrderId,
                fromStatus: currentStatus,
                toStatus: 'RECONCILING',
                action: 'AWAIT_AUTHORITATIVE_COMMISSION',
                reason: 'Missing authoritative fee data from exchange venue',
              });
              continue;
            }

            // Authoritative multi-fill settlement
            OrderStateMachine.validateTransition(currentStatus, 'FILLED', clientOrderId);

            let totalExecutedQtyDec = ExactDecimal.zero();
            let totalExecutedNotionalDec = ExactDecimal.zero();
            let totalCommissionDec = ExactDecimal.zero();
            let actualCommissionAsset = order.quote_asset;

            for (const fill of fills!) {
              const fillQtyDec = ExactDecimal.from(fill.qty);
              const fillPriceDec = ExactDecimal.from(fill.price);
              const fillNotionalDec = fillPriceDec.mul(fillQtyDec);
              const fillCommissionDec = ExactDecimal.from(fill.commission);
              const fillAsset = fill.commissionAsset || order.quote_asset;

              totalExecutedQtyDec = totalExecutedQtyDec.add(fillQtyDec);
              totalExecutedNotionalDec = totalExecutedNotionalDec.add(fillNotionalDec);
              totalCommissionDec = totalCommissionDec.add(fillCommissionDec);
              actualCommissionAsset = fillAsset;
            }

            const avgPriceDec = totalExecutedQtyDec.isZero()
              ? ExactDecimal.from(order.price_exact || order.price || '0')
              : totalExecutedNotionalDec.div(totalExecutedQtyDec);

            const authInst = UpstoxInstrumentMasterService.getInstrument(order.symbol) ||
              (broker ? (broker as any).getInstrument?.(order.symbol) : null);
            const baseAsset = authInst?.baseAsset || order.base_asset ||
              (order.symbol.endsWith(order.quote_asset) ? order.symbol.slice(0, -order.quote_asset.length) : order.symbol);
            const now = Date.now();

            leaseController?.assertLeaseValid('order recovery fill settlement');
            await db.transaction(async (tx) => {
              await OrderStateMachine.transitionOrder(clientOrderId, 'FILLED', {
                tx,
                reason: 'Recovery: Authoritative multi-fill settlement',
                source: 'order_recovery_service',
                actor: 'system',
                extraFields: {
                  exchange_order_id: venueResult.exchangeOrderId || order.exchange_order_id || `ex_rec_${now}`,
                  executed_qty: 0.0,
                  executed_qty_exact: totalExecutedQtyDec.toString(),
                  avg_price: 0.0,
                  avg_price_exact: avgPriceDec.toString(),
                  cumulative_quote_qty: 0.0,
                  cumulative_quote_exact: totalExecutedNotionalDec.toString(),
                  executed_notional_exact: totalExecutedNotionalDec.toString(),
                  fee: 0.0,
                  fee_exact: totalCommissionDec.toString(),
                  fee_asset: actualCommissionAsset,
                  actual_commission_exact: totalCommissionDec.toString(),
                  actual_commission_asset: actualCommissionAsset,
                  commission_status: 'AUTHORITATIVE',
                },
              });

              for (let idx = 0; idx < fills!.length; idx++) {
                const fill = fills![idx];
                const fillQtyDec = ExactDecimal.from(fill.qty);
                const fillPriceDec = ExactDecimal.from(fill.price);
                const fillNotionalDec = fillPriceDec.mul(fillQtyDec);
                const fillCommissionDec = ExactDecimal.from(fill.commission);
                const fillAsset = fill.commissionAsset || order.quote_asset;
                const tradeId = fill.tradeId || `${clientOrderId}_rec_${idx}`;
                const canonicalFillKey = `${broker.id}:${order.user_id}:${order.symbol}:${tradeId}`;
                const accountingEventId = `settlement:${broker.id}:${order.user_id}:${order.symbol}:${tradeId}`;
                const fillDbId = `fill_rec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

                await OrderFillsService.recordFill(tx, {
                  fillDbId,
                  orderIdentifier: order.id,
                  exchangeTradeId: tradeId,
                  canonicalFillKey,
                  symbol: order.symbol,
                  price: fillPriceDec,
                  qty: fillQtyDec,
                  commission: fillCommissionDec,
                  commissionAsset: fillAsset,
                  commissionStatus: 'AUTHORITATIVE',
                  quoteQty: fillNotionalDec,
                  executedAt: fill.time || now,
                  broker: broker.id,
                });

                await LedgerService.processFill({
                  userId: order.user_id,
                  accountMode: 'live',
                  orderId: clientOrderId,
                  fillId: tradeId,
                  symbol: order.symbol,
                  baseAsset,
                  quoteAsset: order.quote_asset,
                  side: order.side,
                  price: fillPriceDec,
                  quantity: fillQtyDec,
                  fee: fillCommissionDec,
                  feeAsset: fillAsset,
                  commissionStatus: 'AUTHORITATIVE',
                  accountingEventId,
                  canonicalFillKey,
                  executedAt: fill.time || now,
                  tx,
                });
              }

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
              await OrderStateMachine.transitionOrder(clientOrderId, 'CANCELED', {
                tx,
                reason: `Recovery: Venue status was ${exchangeStatus}`,
                source: 'order_recovery_service',
                actor: 'system',
                releaseReservationOnTerminal: true,
                extraFields: {
                  reserved_cash: 0,
                  reserved_qty: 0,
                  reserved_cash_minor: 0,
                  reserved_qty_minor: 0,
                },
              });
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
            await OrderStateMachine.transitionOrder(clientOrderId, targetStatus, {
              reason: `Recovery: Syncing venue status ${exchangeStatus}`,
              source: 'order_recovery_service',
              actor: 'system',
              extraFields: {
                exchange_order_id: venueResult.exchangeOrderId || order.exchange_order_id,
              },
            });

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
            await OrderStateMachine.transitionOrder(clientOrderId, 'UNKNOWN', {
              reason: 'Stuck in SUBMITTING state; preserved reservation in UNKNOWN state',
              source: 'order_recovery_service',
              actor: 'system',
              extraFields: {
                reject_reason: 'Stuck in SUBMITTING state; preserved reservation in UNKNOWN state',
              },
            });
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
