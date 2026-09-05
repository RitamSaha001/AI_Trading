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
  private static inMemoryFallbackBreakers: Map<string, CircuitBreakerRecord> = new Map();

  /**
   * Resets in-memory fallback state (tests).
   */
  static resetForTesting(): void {
    this.inMemoryFallbackBreakers.clear();
  }

  /**
   * Trips a circuit breaker to OPEN state, persisting durably in the database.
   * Maintains in-memory fallback to ensure fail-closed behavior even if DB fails.
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
    const fallbackKey = `${name}:${scope}:${scopeId}`;

    const record: CircuitBreakerRecord = {
      id,
      name,
      scope,
      scopeId,
      state: 'OPEN',
      openedAt: now,
      reason,
      triggerCount: 1,
      recoveryCondition,
      updatedAt: now,
    };

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

      this.inMemoryFallbackBreakers.delete(fallbackKey);

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
      this.inMemoryFallbackBreakers.set(fallbackKey, record);
      logger.error(`[CircuitBreakerService] DB error tripping breaker ${name}: ${err.message}. Retaining in-memory fail-closed state.`);
      // Re-throw so caller knows persistence degraded, but in-memory breaker remains active
      throw err;
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
    const fallbackKey = `${name}:${scope}:${scopeId}`;
    this.inMemoryFallbackBreakers.delete(fallbackKey);

    // Also remove any wildcard fallback matches for this breaker
    for (const [key, b] of this.inMemoryFallbackBreakers.entries()) {
      if (b.name === name && (b.scope === scope || scope === 'GLOBAL')) {
        this.inMemoryFallbackBreakers.delete(key);
      }
    }

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
   * Fail-Closed: If database query fails or in-memory fallback is tripped, returns isOpen: true.
   */
  static async isOpen(
    name?: string,
    scope?: CircuitBreakerScope,
    scopeId?: string
  ): Promise<{ isOpen: boolean; breaker?: CircuitBreakerRecord }> {
    // 1. Check in-memory fallback breakers first (fail-closed protection)
    for (const b of this.inMemoryFallbackBreakers.values()) {
      if (b.state !== 'OPEN') continue;
      if (name && b.name !== name) continue;
      if (b.scope === 'GLOBAL') {
        return { isOpen: true, breaker: b };
      }
      if (scope === 'ACCOUNT' && b.scope === 'ACCOUNT' && b.scopeId === scopeId) {
        return { isOpen: true, breaker: b };
      }
      if (scope === 'SYMBOL' && b.scope === 'SYMBOL' && b.scopeId === scopeId) {
        return { isOpen: true, breaker: b };
      }
    }

    // 2. Query durable DB with fail-closed error handling
    try {
      const db = getDb();
      let query = `SELECT * FROM circuit_breakers WHERE state = 'OPEN'`;
      const params: any[] = [];

      if (name) {
        query += ` AND name = ?`;
        params.push(name);
      }

      const openBreakers = await db.query<any>(query, params);

      for (const b of openBreakers) {
        // Any open GLOBAL breaker matches everything
        if (b.scope === 'GLOBAL') {
          return { isOpen: true, breaker: this.mapRecord(b) };
        }

        // Account level match
        if (scope === 'ACCOUNT' && b.scope === 'ACCOUNT' && b.scope_id === scopeId) {
          return { isOpen: true, breaker: this.mapRecord(b) };
        }

        // Symbol level match
        if (scope === 'SYMBOL' && b.scope === 'SYMBOL' && b.scope_id === scopeId) {
          return { isOpen: true, breaker: this.mapRecord(b) };
        }
      }

      return { isOpen: false };
    } catch (err: any) {
      logger.error(`[CircuitBreakerService] DB query failed in isOpen(): ${err.message}. Enforcing FAIL-CLOSED state.`);
      return {
        isOpen: true,
        breaker: {
          id: 'cb_db_fail_closed',
          name: name || 'DATABASE_FAILURE',
          scope: scope || 'GLOBAL',
          scopeId: scopeId || '*',
          state: 'OPEN',
          triggerCount: 1,
          updatedAt: Date.now(),
          reason: `Database failure during safety evaluation — fail-closed protection engaged: ${err.message}`,
        },
      };
    }
  }

  /**
   * Returns all currently open circuit breakers across the deployment (DB + in-memory fallback).
   */
  static async listActiveBreakers(): Promise<CircuitBreakerRecord[]> {
    const list: CircuitBreakerRecord[] = [];
    const seen = new Set<string>();

    // In-memory fallbacks
    for (const b of this.inMemoryFallbackBreakers.values()) {
      if (b.state === 'OPEN') {
        list.push(b);
        seen.add(`${b.name}:${b.scope}:${b.scopeId}`);
      }
    }

    try {
      const db = getDb();
      const rows = await db.query<any>(`SELECT * FROM circuit_breakers WHERE state = 'OPEN' ORDER BY opened_at DESC`);
      for (const r of rows) {
        const record = this.mapRecord(r);
        const key = `${record.name}:${record.scope}:${record.scopeId}`;
        if (!seen.has(key)) {
          list.push(record);
          seen.add(key);
        }
      }
    } catch (err: any) {
      logger.warn(`[CircuitBreakerService] Could not list DB breakers: ${err.message}`);
    }

    return list;
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
