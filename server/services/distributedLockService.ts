import { getDb, DBClient } from '../db';
import crypto from 'node:crypto';

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

    // 1. PostgreSQL Advisory Lock Check (fail-fast without DB writes if locked)
    if (isPostgres && db.tryAdvisoryLock) {
      const lockKey = this.getAdvisoryLockKey(workerName);
      const acquired = await db.tryAdvisoryLock(lockKey);
      if (!acquired) {
        return null; // Another Postgres session actively holds the lock
      }
    }

    // 2. Durable worker_leases Record with Atomic Compare-and-Swap
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
          if (db.releaseAdvisoryLock) {
            const lockKey = this.getAdvisoryLockKey(workerName);
            await db.releaseAdvisoryLock(lockKey).catch(() => {});
          }
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
      if (isPostgres && db.releaseAdvisoryLock) {
        const lockKey = this.getAdvisoryLockKey(workerName);
        await db.releaseAdvisoryLock(lockKey).catch(() => {});
      }
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
    const isPostgres = db.isPostgres();

    try {
      const res = await db.execute(
        `UPDATE worker_leases SET expires_at = 0 WHERE worker_name = ? AND instance_id = ?`,
        [workerName, leaseId]
      );

      return res.changes > 0;
    } finally {
      if (isPostgres && db.releaseAdvisoryLock) {
        const lockKey = this.getAdvisoryLockKey(workerName);
        await db.releaseAdvisoryLock(lockKey).catch(() => {});
      }
    }
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
   */
  static async withLock<T>(
    workerName: string,
    ttlMs: number,
    fn: (leaseId: string) => Promise<T>,
    db: DBClient = getDb()
  ): Promise<T | null> {
    const leaseId = await this.acquireLease(workerName, ttlMs, db);
    if (!leaseId) {
      return null;
    }

    try {
      return await fn(leaseId);
    } finally {
      await this.releaseLease(workerName, leaseId, db).catch((err) => {
        console.warn(`[DistributedLockService] Error releasing lease for ${workerName}:`, err.message);
      });
    }
  }
}
