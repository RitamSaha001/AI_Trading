import { getDb } from '../db';
import { AuditService, logger } from './auditService';
import crypto from 'node:crypto';

export type CircuitBreakerScope = 'GLOBAL' | 'ACCOUNT' | 'SYMBOL';
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerRecord {
  id: string;
  name: string;
  scope: CircuitBreakerScope;
  scopeId: string;
  state: CircuitBreakerState;
  openedAt?: number;
  reason?: string;
  triggerCount: number;
  recoveryCondition?: string;
  updatedAt: number;
}

export class CircuitBreakerService {
  /**
   * Trips a circuit breaker to OPEN state, persisting durably in the database.
   */
  static async trip(
    name: string,
    scope: CircuitBreakerScope = 'GLOBAL',
    scopeId: string = '*',
    reason: string = 'Operational anomaly triggered breaker',
    recoveryCondition?: string
  ): Promise<void> {
    const db = getDb();
    const now = Date.now();
    const id = `cb_${crypto.randomBytes(6).toString('hex')}`;

    try {
      await db.execute(
        `INSERT INTO circuit_breakers (
          id, name, scope, scope_id, state, opened_at, reason, trigger_count, recovery_condition, updated_at
        ) VALUES (?, ?, ?, ?, 'OPEN', ?, ?, 1, ?, ?)
        ON CONFLICT(name, scope, scope_id) DO UPDATE SET
          state = 'OPEN',
          opened_at = excluded.opened_at,
          reason = excluded.reason,
          trigger_count = circuit_breakers.trigger_count + 1,
          recovery_condition = excluded.recovery_condition,
          updated_at = excluded.updated_at`,
        [id, name, scope, scopeId, now, reason, recoveryCondition || null, now]
      );

      logger.warn(`[CircuitBreakerService] Tripped breaker ${name} (${scope}:${scopeId}): ${reason}`);

      await AuditService.logEvent({
        userId: scope === 'ACCOUNT' ? scopeId : undefined,
        eventType: 'CIRCUIT_BREAKER_OPENED',
        source: 'circuit_breaker_service',
        actor: 'system',
        externalId: `${name}:${scope}:${scopeId}`,
        metadata: { name, scope, scopeId, reason, recoveryCondition },
        result: 'BLOCKED',
      });
    } catch (err: any) {
      logger.error(`[CircuitBreakerService] Error tripping breaker ${name}: ${err.message}`);
    }
  }

  /**
   * Resets a circuit breaker back to CLOSED.
   */
  static async reset(
    name: string,
    scope: CircuitBreakerScope = 'GLOBAL',
    scopeId: string = '*',
    actor: string = 'system',
    notes?: string
  ): Promise<void> {
    const db = getDb();
    const now = Date.now();

    try {
      await db.execute(
        `UPDATE circuit_breakers
         SET state = 'CLOSED', opened_at = NULL, reason = NULL, updated_at = ?
         WHERE name = ? AND scope = ? AND scope_id = ?`,
        [now, name, scope, scopeId]
      );

      logger.info(`[CircuitBreakerService] Reset breaker ${name} (${scope}:${scopeId}) by ${actor}`);

      await AuditService.logEvent({
        userId: scope === 'ACCOUNT' ? scopeId : undefined,
        eventType: 'CIRCUIT_BREAKER_CLOSED',
        source: 'circuit_breaker_service',
        actor,
        externalId: `${name}:${scope}:${scopeId}`,
        metadata: { name, scope, scopeId, notes },
        result: 'SUCCESS',
      });
    } catch (err: any) {
      logger.error(`[CircuitBreakerService] Error resetting breaker ${name}: ${err.message}`);
    }
  }

  /**
   * Evaluates whether trading is blocked by an open circuit breaker for given context.
   * Hierarchical: Any matching GLOBAL breaker blocks all accounts/symbols.
   */
  static async isOpen(
    name?: string,
    scope?: CircuitBreakerScope,
    scopeId?: string
  ): Promise<{ isOpen: boolean; breaker?: CircuitBreakerRecord }> {
    const db = getDb();

    let query = `SELECT * FROM circuit_breakers WHERE state = 'OPEN'`;
    const params: any[] = [];

    if (name) {
      query += ` AND name = ?`;
      params.push(name);
    }

    const openBreakers = await db.query<any>(query, params);

    for (const b of openBreakers) {
      // 1. Any open GLOBAL breaker matches everything
      if (b.scope === 'GLOBAL') {
        return { isOpen: true, breaker: this.mapRecord(b) };
      }

      // 2. Account level match
      if (scope === 'ACCOUNT' && b.scope === 'ACCOUNT' && b.scope_id === scopeId) {
        return { isOpen: true, breaker: this.mapRecord(b) };
      }

      // 3. Symbol level match
      if (scope === 'SYMBOL' && b.scope === 'SYMBOL' && b.scope_id === scopeId) {
        return { isOpen: true, breaker: this.mapRecord(b) };
      }
    }

    return { isOpen: false };
  }

  /**
   * Returns all currently open circuit breakers across the deployment.
   */
  static async listActiveBreakers(): Promise<CircuitBreakerRecord[]> {
    const db = getDb();
    const rows = await db.query<any>(`SELECT * FROM circuit_breakers WHERE state = 'OPEN' ORDER BY opened_at DESC`);
    return rows.map((r) => this.mapRecord(r));
  }

  private static mapRecord(r: any): CircuitBreakerRecord {
    return {
      id: r.id,
      name: r.name,
      scope: r.scope,
      scopeId: r.scope_id,
      state: r.state,
      openedAt: r.opened_at ? Number(r.opened_at) : undefined,
      reason: r.reason || undefined,
      triggerCount: Number(r.trigger_count || 0),
      recoveryCondition: r.recovery_condition || undefined,
      updatedAt: Number(r.updated_at),
    };
  }
}
