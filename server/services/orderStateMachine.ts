/**
 * Financial Order State Machine & Transition Validator
 * 
 * Enforces authoritative transition invariants across the entire order lifecycle.
 * Prevents impossible transitions, double fills, unreserved submissions, and
 * invalid resurrection of terminal orders without explicit reconciliation.
 */

export type OrderStatus =
  | 'CREATED'
  | 'RESERVING'
  | 'RESERVED'
  | 'SUBMITTING'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  | 'CANCELED' // Alias for backward compatibility
  | 'REJECTED'
  | 'UNKNOWN'
  | 'RECONCILING'
  | 'RECONCILED'
  | 'EXPIRED'
  | 'FAILED';

export class InvalidOrderStateTransitionError extends Error {
  readonly fromStatus: OrderStatus;
  readonly toStatus: OrderStatus;
  readonly orderId?: string;

  constructor(fromStatus: OrderStatus, toStatus: OrderStatus, orderId?: string, reason?: string) {
    const msg = `Invalid financial order transition from ${fromStatus} to ${toStatus}${orderId ? ` for order ${orderId}` : ''}${reason ? `: ${reason}` : ''}`;
    super(msg);
    this.name = 'InvalidOrderStateTransitionError';
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
    this.orderId = orderId;
  }
}

// Canonical transitions map
const VALID_TRANSITIONS: Record<string, string[]> = {
  CREATED: ['RESERVING', 'RESERVED', 'REJECTED', 'FAILED'],
  RESERVING: ['RESERVED', 'REJECTED', 'FAILED'],
  RESERVED: ['SUBMITTING', 'CANCEL_REQUESTED', 'CANCELLED', 'CANCELED', 'REJECTED', 'FAILED'],
  SUBMITTING: ['OPEN', 'PARTIALLY_FILLED', 'FILLED', 'REJECTED', 'UNKNOWN', 'RECONCILING', 'FAILED', 'CANCEL_REQUESTED'],
  OPEN: ['PARTIALLY_FILLED', 'FILLED', 'CANCEL_REQUESTED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'UNKNOWN', 'RECONCILING'],
  PARTIALLY_FILLED: ['PARTIALLY_FILLED', 'FILLED', 'CANCEL_REQUESTED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'UNKNOWN', 'RECONCILING'],
  CANCEL_REQUESTED: ['CANCELLED', 'CANCELED', 'FILLED', 'PARTIALLY_FILLED', 'UNKNOWN', 'RECONCILING'],
  UNKNOWN: ['RECONCILING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCEL_REQUESTED', 'CANCELLED', 'CANCELED', 'REJECTED', 'FAILED'],
  RECONCILING: ['OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCEL_REQUESTED', 'CANCELLED', 'CANCELED', 'REJECTED', 'RECONCILED', 'FAILED'],
  RECONCILED: [], // Terminal
  FILLED: [],     // Terminal
  CANCELLED: [],  // Terminal
  CANCELED: [],   // Terminal
  REJECTED: [],   // Terminal
  EXPIRED: [],    // Terminal
  FAILED: [],     // Terminal
};

import { getDb, DBClient } from '../db';
import { AuditService } from './auditService';
import { LedgerService } from './ledgerService';

export interface TransitionOrderOptions {
  tx?: DBClient;
  reason?: string;
  actor?: string;
  source?: string;
  extraFields?: Record<string, any>;
  releaseReservationOnTerminal?: boolean;
}

export class OrderStateMachine {
  /**
   * Normalizes status string (maps CANCELED to CANCELLED canonical, uppercase).
   */
  static normalizeStatus(status: string): OrderStatus {
    const s = status.toUpperCase().trim();
    if (s === 'CANCELED') return 'CANCELLED';
    return s as OrderStatus;
  }

  /**
   * Checks if an order status transition is mathematically and operationally permitted.
   */
  static canTransition(from: string, to: string): boolean {
    const fromNorm = this.normalizeStatus(from);
    const toNorm = this.normalizeStatus(to);

    if (fromNorm === toNorm) {
      // Re-entrant transition allowed only for PARTIALLY_FILLED (additional fills) or RECONCILING (repeated sweeps)
      return fromNorm === 'PARTIALLY_FILLED' || fromNorm === 'RECONCILING';
    }

    const allowed = VALID_TRANSITIONS[fromNorm];
    if (!allowed) return false;

    return allowed.includes(toNorm) || (toNorm === 'CANCELLED' && allowed.includes('CANCELED'));
  }

  /**
   * Asserts valid transition; throws InvalidOrderStateTransitionError if prohibited.
   */
  static validateTransition(from: string, to: string, orderId?: string, reason?: string): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidOrderStateTransitionError(
        from as OrderStatus,
        to as OrderStatus,
        orderId,
        reason
      );
    }
  }

  /**
   * Returns true if status represents a terminal state.
   */
  static isTerminal(status: string): boolean {
    const norm = this.normalizeStatus(status);
    return ['FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'RECONCILED'].includes(norm);
  }

  /**
   * Returns true if order currently holds an active reservation.
   */
  static hasActiveReservation(status: string): boolean {
    const norm = this.normalizeStatus(status);
    return ['RESERVING', 'RESERVED', 'SUBMITTING', 'OPEN', 'PARTIALLY_FILLED', 'CANCEL_REQUESTED', 'UNKNOWN', 'RECONCILING'].includes(norm);
  }

  /**
   * Authoritatively transitions an order's status in the database with strict invariant validation,
   * audit trail emission, and transactional consistency.
   * 
   * This is the SOLE AUTHORITATIVE MUTATOR for order lifecycle transitions.
   */
  static async transitionOrder(
    clientOrderId: string,
    toStatus: OrderStatus | string,
    options: TransitionOrderOptions = {}
  ): Promise<any> {
    const rawTarget = String(toStatus).toUpperCase().trim();
    const targetStatus = this.normalizeStatus(toStatus);

    const executeTransition = async (client: DBClient) => {
      // 1. Fetch current order state under transaction
      const selectSql = client.isPostgres?.()
        ? `SELECT * FROM exchange_orders WHERE client_order_id = ? FOR UPDATE`
        : `SELECT * FROM exchange_orders WHERE client_order_id = ?`;

      const currentOrder = await client.queryOne<any>(selectSql, [clientOrderId]);
      if (!currentOrder) {
        throw new Error(
          `Order '${clientOrderId}' not found in exchange_orders for state transition to ${targetStatus}`
        );
      }

      const fromStatus = currentOrder.status;
      const fromNorm = this.normalizeStatus(fromStatus);

      // Idempotent: Order is already in the target state
      if (fromNorm === targetStatus) {
        if (options.extraFields && Object.keys(options.extraFields).length > 0) {
          const setClauses: string[] = ['updated_at = ?'];
          const params: any[] = [Date.now()];
          for (const [key, value] of Object.entries(options.extraFields)) {
            if (key !== 'status' && key !== 'updated_at' && key !== 'client_order_id') {
              setClauses.push(`${key} = ?`);
              params.push(value);
            }
          }
          params.push(clientOrderId);
          await client.execute(
            `UPDATE exchange_orders SET ${setClauses.join(', ')} WHERE client_order_id = ?`,
            params
          );
        }

        if (
          options.releaseReservationOnTerminal &&
          ['CANCELLED', 'CANCELED', 'REJECTED', 'EXPIRED', 'FAILED'].includes(targetStatus)
        ) {
          await LedgerService.releaseOrderReservation({ orderId: clientOrderId, tx: client });
        }

        return await client.queryOne<any>(
          `SELECT * FROM exchange_orders WHERE client_order_id = ?`,
          [clientOrderId]
        );
      }

      // 2. Validate state transition invariant
      this.validateTransition(fromStatus, targetStatus, clientOrderId, options.reason);

      // 3. Build parameterized update (preserve CANCELED if caller explicitly provided it)
      const statusToPersist = rawTarget === 'CANCELED' ? 'CANCELED' : targetStatus;
      const now = Date.now();
      const setClauses: string[] = ['status = ?', 'updated_at = ?'];
      const params: any[] = [statusToPersist, now];

      if (options.extraFields) {
        for (const [key, value] of Object.entries(options.extraFields)) {
          if (key !== 'status' && key !== 'updated_at' && key !== 'client_order_id') {
            setClauses.push(`${key} = ?`);
            params.push(value);
          }
        }
      }
      params.push(clientOrderId);

      await client.execute(
        `UPDATE exchange_orders SET ${setClauses.join(', ')} WHERE client_order_id = ?`,
        params
      );

      // 4. Optionally release reservations on terminal non-filled states
      if (
        options.releaseReservationOnTerminal &&
        ['CANCELLED', 'CANCELED', 'REJECTED', 'EXPIRED', 'FAILED'].includes(targetStatus)
      ) {
        await LedgerService.releaseOrderReservation({ orderId: clientOrderId, tx: client });
      }

      // 5. Emit structured audit log
      await AuditService.logEvent({
        userId: currentOrder.user_id,
        eventType: 'ORDER_STATE_TRANSITION',
        source: options.source || 'order_state_machine',
        actor: options.actor || 'system',
        result: 'SUCCESS',
        beforeState: { status: fromStatus },
        afterState: { status: targetStatus, ...(options.extraFields || {}) },
        metadata: {
          clientOrderId,
          symbol: currentOrder.symbol,
          fromStatus,
          toStatus: targetStatus,
          reason: options.reason,
        },
      }).catch(() => {});

      // 6. Return updated record
      return await client.queryOne<any>(
        `SELECT * FROM exchange_orders WHERE client_order_id = ?`,
        [clientOrderId]
      );
    };

    if (options.tx) {
      return await executeTransition(options.tx);
    } else {
      return await getDb().transaction(async (tx) => {
        return await executeTransition(tx);
      });
    }
  }
}
