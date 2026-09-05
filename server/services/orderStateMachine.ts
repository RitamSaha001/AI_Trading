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
  UNKNOWN: ['RECONCILING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'CANCELED', 'REJECTED', 'FAILED'],
  RECONCILING: ['OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'CANCELED', 'REJECTED', 'RECONCILED', 'FAILED'],
  RECONCILED: [], // Terminal
  FILLED: [],     // Terminal
  CANCELLED: [],  // Terminal
  CANCELED: [],   // Terminal
  REJECTED: [],   // Terminal
  EXPIRED: [],    // Terminal
  FAILED: [],     // Terminal
};

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
}
