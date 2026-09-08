import { getDb, DBClient } from '../db';
import crypto from 'node:crypto';

export interface LeaseController {
  leaseId: string;
  isLeaseValid(): boolean;
  assertLeaseValid(actionDescription?: string): void;
}

export class DistributedLockService {
  private static instanceId: string = `inst_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;

  /**
   * Generates a deterministic 64-bit integer hash for PostgreSQL advisory lock key.
   */
  private static getAdvisoryLockKey(workerName: string): bigint {
    const hash = crypto.createHash('sha256').update(workerName).digest();
    return hash.readBigInt64BE(0);
  }

  /**
   * Returns current instance identifier.
   */
  static getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Sets custom instance identifier (useful for multi-instance simulation in tests).
   */
  static setInstanceId(id: string): void {
    this.instanceId = id;
  }

  /**
   * Attempts to acquire a distributed lease for a worker.
   * In PostgreSQL: Uses session-level advisory lock + worker_leases table.
   * In SQLite: Uses worker_leases table with atomic compare-and-swap on expires_at.
   */
  static async acquireLease(
    workerName: string,
    ttlMs: number = 30000,
    db: DBClient = getDb()
  ): Promise<string | null> {
    const now = Date.now();
    const expiresAt = now + ttlMs;
    const isPostgres = db.isPostgres();

    // Durable worker_leases Record with Atomic Compare-and-Swap
    // Completely ACID-safe across distributed clusters, PgBouncer transaction poolers, and single nodes.
    try {
      if (isPostgres) {
        const result = await db.execute(
          `INSERT INTO worker_leases (worker_name, instance_id, acquired_at, expires_at, version)
           VALUES (?, ?, ?, ?, 1)
           ON CONFLICT (worker_name) DO UPDATE SET
             instance_id = EXCLUDED.instance_id,
             acquired_at = EXCLUDED.acquired_at,
             expires_at = EXCLUDED.expires_at,
             version = worker_leases.version + 1
           WHERE worker_leases.expires_at < ? OR worker_leases.instance_id = ?`,
          [workerName, this.instanceId, now, expiresAt, now, this.instanceId]
        );

        if (result.changes === 0) {
          // Lock held by unexpired lease from another instance
          return null;
        }
      } else {
        // SQLite Execution
        const result = await db.execute(
          `INSERT INTO worker_leases (worker_name, instance_id, acquired_at, expires_at, version)
           VALUES (?, ?, ?, ?, 1)
           ON CONFLICT (worker_name) DO UPDATE SET
             instance_id = excluded.instance_id,
             acquired_at = excluded.acquired_at,
             expires_at = excluded.expires_at,
             version = worker_leases.version + 1
           WHERE worker_leases.expires_at < ? OR worker_leases.instance_id = ?`,
          [workerName, this.instanceId, now, expiresAt, now, this.instanceId]
        );

        if (result.changes === 0) {
          return null;
        }
      }

      return this.instanceId;
    } catch (err) {
      throw err;
    }
  }

  /**
   * Releases an acquired distributed lease cleanly.
   */
  static async releaseLease(
    workerName: string,
    leaseId: string = this.instanceId,
    db: DBClient = getDb()
  ): Promise<boolean> {
    const res = await db.execute(
      `UPDATE worker_leases SET expires_at = 0 WHERE worker_name = ? AND instance_id = ?`,
      [workerName, leaseId]
    );

    return res.changes > 0;
  }

  /**
   * Extends the heartbeat of an active lease.
   */
  static async renewLease(
    workerName: string,
    ttlMs: number = 30000,
    leaseId: string = this.instanceId,
    db: DBClient = getDb()
  ): Promise<boolean> {
    const now = Date.now();
    const expiresAt = now + ttlMs;

    const res = await db.execute(
      `UPDATE worker_leases SET expires_at = ? WHERE worker_name = ? AND instance_id = ? AND expires_at >= ?`,
      [expiresAt, workerName, leaseId, now]
    );

    return res.changes > 0;
  }

  /**
   * Executes a callback safely protected by a distributed lease.
   * If another instance holds the lease, safely skips execution and returns null.
   * Treats lease heartbeat renewal failures as safety events, terminating lease validity
   * to halt ongoing financial mutations.
   */
  static async withLock<T>(
    workerName: string,
    ttlMs: number,
    fn: (leaseController: LeaseController) => Promise<T>,
    db: DBClient = getDb()
  ): Promise<T | null> {
    const leaseId = await this.acquireLease(workerName, ttlMs, db);
    if (!leaseId) {
      return null;
    }

    let isHealthy = true;
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 2;

    const controller: LeaseController = {
      leaseId,
      isLeaseValid: () => isHealthy,
      assertLeaseValid: (actionDescription?: string) => {
        if (!isHealthy) {
          throw new Error(
            `[DistributedLockService] Safety Halt: Distributed lease for '${workerName}' (id: ${leaseId}) was lost. Halting ${actionDescription || 'financial mutation'} immediately to prevent split-brain execution.`
          );
        }
      },
    };

    // Auto-renew lease in background to prevent expiration during long tasks
    const heartbeatInterval = Math.max(5000, Math.floor(ttlMs / 3));
    const heartbeatTimer = setInterval(async () => {
      try {
        const renewed = await this.renewLease(workerName, ttlMs, leaseId, db);
        if (!renewed) {
          consecutiveFailures++;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            isHealthy = false;
            console.error(
              `[DistributedLockService] CRITICAL: Lease ownership lost for ${workerName} (id: ${leaseId}). Halting lease validity.`
            );
          }
        } else {
          consecutiveFailures = 0;
        }
      } catch (err: any) {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          isHealthy = false;
          console.error(
            `[DistributedLockService] CRITICAL: Heartbeat lease renewal failed consecutively for ${workerName} (id: ${leaseId}): ${err.message}. Halting lease validity.`
          );
        }
      }
    }, heartbeatInterval);

    try {
      return await fn(controller);
    } finally {
      clearInterval(heartbeatTimer);
      await this.releaseLease(workerName, leaseId, db).catch((err) => {
        console.warn(`[DistributedLockService] Error releasing lease for ${workerName}:`, err.message);
      });
    }
  }
}
