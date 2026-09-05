/**
 * Emergency Control & Panic Square-Off Service
 * 
 * Provides server-authoritative, durable emergency controls across three distinct tiers:
 * - TRADING_NORMAL: Normal operational state. Orders permitted subject to risk and live gates.
 * - TRADING_HALTED: Temporary execution pause. New orders blocked; existing positions retained.
 * - PANIC: Emergency state. All new orders strictly blocked; initiates controlled, circuit-aware
 *          square-off of open orders and eligible active positions.
 * 
 * State is persisted durably in `emergency_system_state` and survives process restarts and deployments.
 */

import { getDb } from '../db';
import { AuditService, logger } from './auditService';
import { BrokerRegistry } from './brokers/brokerRegistry';
import { BrokerGateway, StandardBrokerError } from './brokers/brokerGateway';
import { IndianMarketCalendar } from './brokers/upstox/indianMarketCalendar';
import { UpstoxInstrumentRegistry } from './brokers/upstox/upstoxInstrumentRegistry';
import { ExactDecimal } from './precision';
import crypto from 'node:crypto';

export type EmergencyState = 'TRADING_NORMAL' | 'TRADING_HALTED' | 'PANIC';

export interface EmergencySystemStatus {
  state: EmergencyState;
  reason: string;
  initiatedBy: string;
  updatedAt: number;
  metadata?: any;
}

export interface PanicSquareOffSummary {
  runId: string;
  userId: string;
  broker: string;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  cancelledOrdersCount: number;
  positionsEvaluatedCount: number;
  closeOrdersSubmittedCount: number;
  skippedPositionsCount: number;
  errors: string[];
  startedAt: number;
  completedAt: number;
}

export class EmergencyControlService {
  /**
   * Retrieves the current durable emergency system state.
   */
  public static async getStatus(): Promise<EmergencySystemStatus> {
    const db = getDb();
    const row = await db.queryOne<any>(
      `SELECT state, reason, initiated_by, updated_at, metadata FROM emergency_system_state WHERE id = 'current'`
    );

    if (!row) {
      return {
        state: 'TRADING_NORMAL',
        reason: 'Default normal state',
        initiatedBy: 'system',
        updatedAt: Date.now(),
      };
    }

    let parsedMeta: any = undefined;
    if (row.metadata) {
      try {
        parsedMeta = JSON.parse(row.metadata);
      } catch {
        parsedMeta = row.metadata;
      }
    }

    return {
      state: (row.state as EmergencyState) || 'TRADING_NORMAL',
      reason: row.reason || '',
      initiatedBy: row.initiated_by || 'system',
      updatedAt: Number(row.updated_at || Date.now()),
      metadata: parsedMeta,
    };
  }

  /**
   * Returns true if live execution is allowed (i.e. state is TRADING_NORMAL).
   */
  public static async isExecutionAllowed(): Promise<{ allowed: boolean; state: EmergencyState; reason?: string }> {
    const status = await this.getStatus();
    return {
      allowed: status.state === 'TRADING_NORMAL',
      state: status.state,
      reason: status.reason,
    };
  }

  /**
   * Durably sets the emergency system state and logs institutional audit events.
   */
  public static async setState(
    newState: EmergencyState,
    reason: string,
    initiatedBy: string = 'system',
    metadata?: any
  ): Promise<EmergencySystemStatus> {
    const db = getDb();
    const now = Date.now();
    const metaStr = metadata ? JSON.stringify(metadata) : null;

    const previousStatus = await this.getStatus();

    await db.execute(
      `INSERT INTO emergency_system_state (id, state, reason, initiated_by, metadata, updated_at)
       VALUES ('current', ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         state = excluded.state,
         reason = excluded.reason,
         initiated_by = excluded.initiated_by,
         metadata = excluded.metadata,
         updated_at = excluded.updated_at`,
      [newState, reason, initiatedBy, metaStr, now]
    );

    logger.warn(`[EmergencyControlService] State transitioned: ${previousStatus.state} -> ${newState} by ${initiatedBy}. Reason: ${reason}`);

    let auditEventType = 'EMERGENCY_STATE_CHANGED';
    if (newState === 'PANIC') {
      auditEventType = 'PANIC_ACTIVATED';
    } else if (newState === 'TRADING_HALTED') {
      auditEventType = 'TRADING_HALTED';
    } else if (newState === 'TRADING_NORMAL') {
      auditEventType = 'TRADING_RESUMED';
    }

    await AuditService.logEvent({
      eventType: auditEventType,
      source: 'emergency_control_service',
      actor: initiatedBy,
      result: 'SUCCESS',
      metadata: {
        fromState: previousStatus.state,
        toState: newState,
        reason,
        details: metadata,
      },
    });

    return {
      state: newState,
      reason,
      initiatedBy,
      updatedAt: now,
      metadata,
    };
  }

  /**
   * Activates emergency PANIC mode and executes a controlled, safe square-off.
   * 
   * Safety Invariants (Section 11):
   * 1. Cancels eligible open orders first to prevent pending executions.
   * 2. Inspects real open positions.
   * 3. Checks market hours (NSE/BSE) — if market closed, records condition rather than blindly submitting.
   * 4. Validates circuit limits & freeze quantities before sending close orders.
   * 5. Slices oversized positions to respect exchange freeze limits.
   * 6. Does NOT loop indefinitely — single deterministic pass with structured error handling.
   */
  public static async executePanicSquareOff(
    userId: string,
    brokerId: string = 'upstox',
    reason: string = 'Emergency Panic Square-Off Triggered',
    initiatedBy: string = 'human_operator'
  ): Promise<PanicSquareOffSummary> {
    const db = getDb();
    const runId = `panic_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const startedAt = Date.now();

    // 1. Immediately transition durable system state to PANIC (blocks all new live orders)
    await this.setState('PANIC', reason, initiatedBy, { runId, userId, brokerId });

    // Record initial run record
    await db.execute(
      `INSERT INTO panic_squareoff_runs (
        id, user_id, broker, status, cancelled_orders_count,
        positions_evaluated_count, close_orders_submitted_count, started_at
      ) VALUES (?, ?, ?, 'IN_PROGRESS', 0, 0, 0, ?)`,
      [runId, userId, brokerId, startedAt]
    );

    const errors: string[] = [];
    let cancelledOrdersCount = 0;
    let positionsEvaluatedCount = 0;
    let closeOrdersSubmittedCount = 0;
    let skippedPositionsCount = 0;

    const broker: BrokerGateway = BrokerRegistry.get(brokerId);

    // 2. Cancel Open Orders
    await AuditService.logEvent({
      userId,
      eventType: 'PANIC_CANCEL_STARTED',
      source: 'emergency_control_service',
      actor: initiatedBy,
      metadata: { runId, brokerId },
      result: 'SUCCESS',
    });

    try {
      const openOrders = await broker.getOpenOrders(userId);
      for (const ord of openOrders) {
        try {
          await broker.cancelOrder(userId, ord.clientOrderId, ord.symbol);
          cancelledOrdersCount++;
        } catch (cancelErr: any) {
          logger.error(`[PanicSquareOff] Failed to cancel open order ${ord.clientOrderId}: ${cancelErr.message}`);
          errors.push(`Cancel failed for ${ord.clientOrderId}: ${cancelErr.message}`);
        }
      }
    } catch (fetchErr: any) {
      logger.error(`[PanicSquareOff] Failed to fetch open orders: ${fetchErr.message}`);
      errors.push(`Open orders fetch failed: ${fetchErr.message}`);
    }

    await AuditService.logEvent({
      userId,
      eventType: 'PANIC_CANCEL_COMPLETED',
      source: 'emergency_control_service',
      actor: initiatedBy,
      metadata: { runId, brokerId, cancelledOrdersCount },
      result: 'SUCCESS',
    });

    // 3. Controlled Position Square-Off
    if (broker.getPositions) {
      try {
        const positions = await broker.getPositions(userId);
        positionsEvaluatedCount = positions.length;

        // Check if market is open for equity broker
        const isMarketOpen = brokerId === 'upstox' ? IndianMarketCalendar.isMarketOpen() : true;

        for (const pos of positions) {
          const qtyExact = ExactDecimal.from(pos.quantity);
          if (qtyExact.isZero()) {
            continue; // Position already flat
          }

          // Invariant: If market is closed, cannot execute market square-off
          if (!isMarketOpen) {
            skippedPositionsCount++;
            errors.push(`Cannot square off ${pos.symbol}: Indian market is closed outside regular trading hours.`);
            continue;
          }

          const isLong = qtyExact.isPositive();
          const closeSide = isLong ? 'SELL' : 'BUY';
          const absQty = qtyExact.abs().toNumber();

          // Authoritative registry check for Upstox
          let freezeQty = 10000;
          let tickSize = 0.05;
          let price = Number(pos.currentPrice || pos.averagePrice || 0);

          if (brokerId === 'upstox') {
            const inst = UpstoxInstrumentRegistry.get(pos.symbol);
            if (inst) {
              freezeQty = inst.freezeQuantity;
              tickSize = inst.tickSize;
              price = inst.lastPrice || price;

              // Ensure price is within circuit limits
              if (inst.lowerCircuitLimit && price < inst.lowerCircuitLimit) {
                price = inst.lowerCircuitLimit;
              } else if (inst.upperCircuitLimit && price > inst.upperCircuitLimit) {
                price = inst.upperCircuitLimit;
              }
            }
          }

          // Invariant: Auto-slicing for positions exceeding exchange freeze limits
          const shouldSlice = absQty > freezeQty;
          const closeClientOrderId = `panic_close_${runId}_${pos.symbol.replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}`;

          try {
            await broker.placeOrder({
              userId,
              broker: brokerId as any,
              symbol: pos.symbol,
              side: closeSide,
              type: 'MARKET',
              quantity: absQty,
              price: price > 0 ? price : undefined,
              product: pos.product || 'D',
              slice: shouldSlice,
              idempotencyKey: `idemp_${closeClientOrderId}`,
              clientOrderId: closeClientOrderId,
              accountMode: 'live',
            });
            closeOrdersSubmittedCount++;
          } catch (orderErr: any) {
            logger.error(`[PanicSquareOff] Failed to submit close order for ${pos.symbol}: ${orderErr.message}`);
            errors.push(`Close order failed for ${pos.symbol}: ${orderErr.message}`);
          }
        }
      } catch (posErr: any) {
        logger.error(`[PanicSquareOff] Failed to evaluate positions: ${posErr.message}`);
        errors.push(`Positions fetch failed: ${posErr.message}`);
      }
    }

    const completedAt = Date.now();
    const finalStatus = errors.length === 0 ? 'COMPLETED' : (closeOrdersSubmittedCount > 0 || cancelledOrdersCount > 0 ? 'PARTIAL' : 'FAILED');

    await db.execute(
      `UPDATE panic_squareoff_runs SET
         status = ?,
         cancelled_orders_count = ?,
         positions_evaluated_count = ?,
         close_orders_submitted_count = ?,
         errors = ?,
         completed_at = ?
       WHERE id = ?`,
      [
        finalStatus,
        cancelledOrdersCount,
        positionsEvaluatedCount,
        closeOrdersSubmittedCount,
        errors.length > 0 ? JSON.stringify(errors) : null,
        completedAt,
        runId,
      ]
    );

    return {
      runId,
      userId,
      broker: brokerId,
      status: finalStatus,
      cancelledOrdersCount,
      positionsEvaluatedCount,
      closeOrdersSubmittedCount,
      skippedPositionsCount,
      errors,
      startedAt,
      completedAt,
    };
  }
}
