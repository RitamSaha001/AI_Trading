import { getDb } from '../db';
import { AuditService, logger } from './auditService';
import { ClockSyncService } from './clockSyncService';
import { RateLimitTracker } from './rateLimitTracker';
import { CircuitBreakerService } from './circuitBreakerService';
import { SymbolRulesService } from './symbolRules';
import { ReconciliationWorker } from './reconciliationWorker';
import { config } from '../config';
import crypto from 'node:crypto';

export type KillSwitchScope = 'GLOBAL' | 'ACCOUNT' | 'SYMBOL';
export type ExchangeHealthState = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'RECONCILING' | 'BLOCKED';

export interface OperationalHealthReport {
  overallState: ExchangeHealthState;
  clockSync: {
    offsetMs: number;
    isHealthy: boolean;
  };
  rateLimit: {
    usedWeight1m: number;
    isThrottled: boolean;
    isBlocked: boolean;
  };
  killSwitch: {
    isGlobalFrozen: boolean;
    activeFreezes: Array<{ scope: string; target: string; reason: string }>;
  };
  circuitBreakers: {
    openCount: number;
    breakers: Array<{ name: string; scope: string; reason?: string }>;
  };
  unresolvedMismatches: number;
  timestamp: number;
}

export class OperationalSafetyService {
  /**
   * Activates an emergency freeze for a specific scope and target atomically in a transaction.
   */
  static async freeze(
    scope: KillSwitchScope,
    target: string = '*',
    reason: string,
    frozenBy: string = 'system'
  ): Promise<void> {
    const db = getDb();
    const now = Date.now();
    const id = `ks_${crypto.randomBytes(6).toString('hex')}`;

    try {
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO operational_kill_switches (
            id, scope, target, is_frozen, freeze_reason, frozen_by, frozen_at
          ) VALUES (?, ?, ?, 1, ?, ?, ?)`,
          [id, scope, target, reason, frozenBy, now]
        );

        // Synchronize with account_limits for backward compatibility if account scope
        if (scope === 'ACCOUNT') {
          await tx.execute(
            `UPDATE account_limits SET is_emergency_frozen = 1, freeze_reason = ?, updated_at = ? WHERE user_id = ?`,
            [reason, now, target]
          );
        }
      });

      logger.warn(`[OperationalSafetyService] Activated EMERGENCY FREEZE for ${scope}:${target} - Reason: ${reason}`);

      await AuditService.logEvent({
        userId: scope === 'ACCOUNT' ? target : undefined,
        eventType: 'EMERGENCY_FREEZE_ACTIVATED',
        source: 'operational_safety_service',
        actor: frozenBy,
        externalId: id,
        metadata: { scope, target, reason },
        result: 'BLOCKED',
      });
    } catch (err: any) {
      logger.error(`[OperationalSafetyService] Failed to activate freeze: ${err.message}`);
      throw err;
    }
  }

  /**
   * Deactivates an emergency freeze atomically in a transaction.
   */
  static async unfreeze(
    scope: KillSwitchScope,
    target: string = '*',
    reason: string,
    unfrozenBy: string = 'system'
  ): Promise<void> {
    const db = getDb();
    const now = Date.now();

    try {
      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE operational_kill_switches
           SET is_frozen = 0, unfrozen_at = ?
           WHERE scope = ? AND target = ? AND is_frozen = 1`,
          [now, scope, target]
        );

        // Synchronize with account_limits if account scope
        if (scope === 'ACCOUNT') {
          await tx.execute(
            `UPDATE account_limits SET is_emergency_frozen = 0, freeze_reason = NULL, updated_at = ? WHERE user_id = ?`,
            [now, target]
          );
        }
      });

      logger.info(`[OperationalSafetyService] Deactivated EMERGENCY FREEZE for ${scope}:${target} - Reason: ${reason}`);

      await AuditService.logEvent({
        userId: scope === 'ACCOUNT' ? target : undefined,
        eventType: 'EMERGENCY_FREEZE_DEACTIVATED',
        source: 'operational_safety_service',
        actor: unfrozenBy,
        externalId: `${scope}:${target}`,
        metadata: { scope, target, reason },
        result: 'SUCCESS',
      });
    } catch (err: any) {
      logger.error(`[OperationalSafetyService] Failed to deactivate freeze: ${err.message}`);
      throw err;
    }
  }

  /**
   * Checks whether trading is frozen for the specified user or symbol.
   */
  static async isFrozen(
    userId?: string,
    symbol?: string
  ): Promise<{ isFrozen: boolean; scope?: string; reason?: string }> {
    const db = getDb();

    // 1. Check active operational kill switches
    const activeFreezes = await db.query<any>(
      `SELECT * FROM operational_kill_switches WHERE is_frozen = 1 ORDER BY frozen_at DESC`
    );

    for (const f of activeFreezes) {
      if (f.scope === 'GLOBAL') {
        return { isFrozen: true, scope: 'GLOBAL', reason: f.freeze_reason };
      }
      if (userId && f.scope === 'ACCOUNT' && f.target === userId) {
        return { isFrozen: true, scope: 'ACCOUNT', reason: f.freeze_reason };
      }
      if (symbol && f.scope === 'SYMBOL' && f.target === symbol) {
        return { isFrozen: true, scope: 'SYMBOL', reason: f.freeze_reason };
      }
    }

    // 2. Backward compatibility check on account_limits table
    if (userId) {
      const limits = await db.queryOne<any>(
        `SELECT is_emergency_frozen, freeze_reason FROM account_limits WHERE user_id = ?`,
        [userId]
      );
      if (limits && limits.is_emergency_frozen) {
        return { isFrozen: true, scope: 'ACCOUNT', reason: limits.freeze_reason || 'Account under emergency freeze' };
      }
    }

    return { isFrozen: false };
  }

  /**
   * Generates a comprehensive operational health assessment.
   */
  static async getHealthReport(userId?: string): Promise<OperationalHealthReport> {
    const db = getDb();
    const clockStatus = ClockSyncService.getStatus();
    const rateLimitStatus = RateLimitTracker.getStatus();
    const activeBreakers = await CircuitBreakerService.listActiveBreakers();

    const activeFreezes = await db.query<any>(
      `SELECT scope, target, freeze_reason FROM operational_kill_switches WHERE is_frozen = 1`
    );

    const isGlobalFrozen = activeFreezes.some((f) => f.scope === 'GLOBAL');

    // Query unresolved critical mismatches
    const criticalMismatches = await db.query<any>(
      `SELECT COUNT(*) as cnt FROM reconciliation_mismatches WHERE severity = 'CRITICAL' AND resolved = 0`
    );
    const unresolvedMismatches = Number(criticalMismatches[0]?.cnt || 0);

    // Determine overall state
    let overallState: ExchangeHealthState = 'HEALTHY';
    if (isGlobalFrozen || activeBreakers.some((b) => b.scope === 'GLOBAL')) {
      overallState = 'BLOCKED';
    } else if (unresolvedMismatches > 0 || rateLimitStatus.isBlocked) {
      overallState = 'UNAVAILABLE';
    } else if (!clockStatus.isHealthy || rateLimitStatus.isThrottled || activeBreakers.length > 0) {
      overallState = 'DEGRADED';
    }

    return {
      overallState,
      clockSync: {
        offsetMs: clockStatus.offsetMs,
        isHealthy: clockStatus.isHealthy,
      },
      rateLimit: {
        usedWeight1m: rateLimitStatus.usedWeight1m,
        isThrottled: rateLimitStatus.isThrottled,
        isBlocked: rateLimitStatus.isBlocked,
      },
      killSwitch: {
        isGlobalFrozen,
        activeFreezes: activeFreezes.map((f) => ({
          scope: f.scope,
          target: f.target,
          reason: f.freeze_reason,
        })),
      },
      circuitBreakers: {
        openCount: activeBreakers.length,
        breakers: activeBreakers.map((b) => ({
          name: b.name,
          scope: b.scope,
          reason: b.reason,
        })),
      },
      unresolvedMismatches,
      timestamp: Date.now(),
    };
  }
}

/**
 * Operational Safety Gate: Executed immediately before submitting any live order.
 * Strictly verifies all critical preconditions.
 */
export class OperationalSafetyGate {
  static async verifyOrderSubmission(params: {
    userId: string;
    symbol: string;
    quoteAsset: string;
    side: 'BUY' | 'SELL';
    type: string;
    quantity: string;
    price?: string;
    isLive: boolean;
  }): Promise<{ allowed: boolean; reason?: string; checks: Record<string, boolean> }> {
    const checks: Record<string, boolean> = {
      databaseHealthy: false,
      killSwitchOff: false,
      circuitBreakerClosed: false,
      reconciliationHealthy: false,
      reconciliationFresh: false,
      clockSyncValid: false,
      rulesFresh: false,
    };

    const db = getDb();

    // 1. Database Health Check
    try {
      await db.query(`SELECT 1`);
      checks.databaseHealthy = true;
    } catch (dbErr: any) {
      return { allowed: false, reason: 'Database health check failed.', checks };
    }

    // 2. Kill Switch (Global, Account, Symbol)
    const freezeCheck = await OperationalSafetyService.isFrozen(params.userId, params.symbol);
    if (freezeCheck.isFrozen) {
      return {
        allowed: false,
        reason: `Trading blocked by ${freezeCheck.scope} emergency freeze: ${freezeCheck.reason}`,
        checks,
      };
    }
    checks.killSwitchOff = true;

    // 3. Circuit Breaker Evaluation (Hierarchical)
    const globalBreaker = await CircuitBreakerService.isOpen(undefined, 'GLOBAL');
    if (globalBreaker.isOpen) {
      return {
        allowed: false,
        reason: `Trading blocked globally by circuit breaker '${globalBreaker.breaker?.name}': ${globalBreaker.breaker?.reason}`,
        checks,
      };
    }

    const accountBreaker = await CircuitBreakerService.isOpen(undefined, 'ACCOUNT', params.userId);
    if (accountBreaker.isOpen) {
      return {
        allowed: false,
        reason: `Trading blocked for account by circuit breaker '${accountBreaker.breaker?.name}': ${accountBreaker.breaker?.reason}`,
        checks,
      };
    }

    const symbolBreaker = await CircuitBreakerService.isOpen(undefined, 'SYMBOL', params.symbol);
    if (symbolBreaker.isOpen) {
      return {
        allowed: false,
        reason: `Trading blocked for symbol ${params.symbol} by circuit breaker: ${symbolBreaker.breaker?.reason}`,
        checks,
      };
    }
    checks.circuitBreakerClosed = true;

    // 4. Reconciliation Health (No unresolved CRITICAL mismatches for user or symbol)
    const criticalMismatches = await db.query<any>(
      `SELECT id, notes FROM reconciliation_mismatches 
       WHERE severity = 'CRITICAL' AND resolved = 0 AND (user_id = ? OR entity_id = ?)`,
      [params.userId, params.symbol]
    );
    if (criticalMismatches.length > 0) {
      return {
        allowed: false,
        reason: `Trading blocked: Unresolved CRITICAL reconciliation mismatch exists (${criticalMismatches[0].notes})`,
        checks,
      };
    }
    checks.reconciliationHealthy = true;

    // 5. Exchange Rules Freshness Check
    try {
      const rule = await SymbolRulesService.getAuthoritativeRule(params.symbol, params.isLive ? 'live' : 'paper');
      if (!rule) {
        return { allowed: false, reason: `Exchange rules unavailable for symbol ${params.symbol}.`, checks };
      }
      checks.rulesFresh = true;
    } catch (err: any) {
      return { allowed: false, reason: `Could not retrieve valid exchange rules for ${params.symbol}: ${err.message}`, checks };
    }

    // 6. Live-only checks: Clock Synchronization, Rate Limit & Reconciliation Freshness SLA
    if (params.isLive) {
      const clockStatus = ClockSyncService.getStatus();
      if (!clockStatus.isHealthy) {
        return {
          allowed: false,
          reason: `Exchange clock drift exceeds tolerance (${clockStatus.offsetMs}ms > 1000ms).`,
          checks,
        };
      }
      checks.clockSyncValid = true;

      // Ensure latest rate limit state is loaded from DB
      await RateLimitTracker.syncFromDb();
      const rateLimitCheck = RateLimitTracker.canExecute('AMBIGUOUS_WRITE');
      if (!rateLimitCheck.allowed) {
        return {
          allowed: false,
          reason: `Exchange rate limit restriction: ${rateLimitCheck.reason}`,
          checks,
        };
      }

      // Reconciliation Freshness SLA (Reconciliation must have completed within SLA for this user)
      const RECONCILIATION_SLA_MS = config.RECONCILIATION_SLA_MS ?? 300_000;
      const syncState = await db.queryOne<any>(
        `SELECT last_sync_at FROM exchange_sync_state WHERE account_id = ? LIMIT 1`,
        [`rec_${params.userId}`]
      );
      const dbLastSyncAt = syncState?.last_sync_at ? Number(syncState.last_sync_at) : 0;
      const userMemSyncAt = ReconciliationWorker.getLastSuccessfulRunAt(params.userId);
      const effectiveLastSyncAt = Math.max(dbLastSyncAt, userMemSyncAt);

      if (effectiveLastSyncAt === 0) {
        return {
          allowed: false,
          reason: 'Trading blocked: No exchange reconciliation has ever completed for this user account.',
          checks,
        };
      }
      if (Date.now() - effectiveLastSyncAt > RECONCILIATION_SLA_MS) {
        const slaSec = Math.round(RECONCILIATION_SLA_MS / 1000);
        return {
          allowed: false,
          reason: `Trading blocked: Exchange reconciliation is overdue for this user account (last run ${Math.round((Date.now() - effectiveLastSyncAt) / 1000)}s ago > ${slaSec}s SLA).`,
          checks,
        };
      }
      checks.reconciliationFresh = true;
    } else {
      checks.clockSyncValid = true;
      checks.reconciliationFresh = true;
    }

    return { allowed: true, checks };
  }
}
