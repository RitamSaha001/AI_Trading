import { getDb } from '../db';
import { logger } from './auditService';
import { config } from '../config';

export interface ClockSyncStatus {
  offsetMs: number;
  lastSyncAt: number;
  isHealthy: boolean;
  roundTripMs: number;
  serverTime: number;
  localTime: number;
}

export class ClockSyncService {
  public static readonly MAX_DRIFT_MS = 1000;
  private static readonly SYNC_INTERVAL_MS = 60_000; // 1 minute

  private static offsetMs: number = 0;
  private static lastSyncAt: number = 0;
  private static roundTripMs: number = 0;
  private static syncTimer: NodeJS.Timeout | null = null;
  private static simulatedOffsetMs: number | null = null;

  /**
   * Returns authoritative exchange-synchronized timestamp for signed queries.
   */
  static getExchangeTime(): number {
    if (this.simulatedOffsetMs !== null) {
      return Date.now() + this.simulatedOffsetMs;
    }
    return Date.now() + this.offsetMs;
  }

  /**
   * Returns current clock sync status.
   */
  static getStatus(): ClockSyncStatus {
    const currentOffset = this.simulatedOffsetMs !== null ? this.simulatedOffsetMs : this.offsetMs;
    const isHealthy =
      Math.abs(currentOffset) <= this.MAX_DRIFT_MS &&
      (this.lastSyncAt === 0 || Date.now() - this.lastSyncAt <= this.SYNC_INTERVAL_MS * 5);

    return {
      offsetMs: currentOffset,
      lastSyncAt: this.lastSyncAt,
      isHealthy,
      roundTripMs: this.roundTripMs,
      serverTime: Date.now() + currentOffset,
      localTime: Date.now(),
    };
  }

  /**
   * Checks if clock sync is healthy enough for live signed trading.
   */
  static isClockHealthy(): boolean {
    return this.getStatus().isHealthy;
  }

  /**
   * Allows setting a simulated offset for testing drift detection and recovery.
   */
  static setSimulatedOffset(offset: number | null): void {
    this.simulatedOffsetMs = offset;
  }

  /**
   * Synchronizes server clock with Binance API.
   */
  static async synchronize(baseUrl: string = 'https://api.binance.com'): Promise<ClockSyncStatus> {
    const tStart = Date.now();
    try {
      if (config.NODE_ENV === 'test' && this.simulatedOffsetMs !== null) {
        this.lastSyncAt = Date.now();
        return this.getStatus();
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${baseUrl}/api/v3/time`, {
        signal: controller.signal,
      });
      clearTimeout(timer);

      const tEnd = Date.now();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as { serverTime: number };
      const roundTrip = Math.max(0, tEnd - tStart);
      const estimatedLocalAtServer = tStart + Math.floor(roundTrip / 2);
      this.offsetMs = data.serverTime - estimatedLocalAtServer;
      this.roundTripMs = roundTrip;
      this.lastSyncAt = Date.now();

      // Persist sync state
      await this.persistState();

      if (Math.abs(this.offsetMs) > this.MAX_DRIFT_MS) {
        logger.warn(
          `[ClockSyncService] Significant exchange clock drift detected: offset=${this.offsetMs}ms > max=${this.MAX_DRIFT_MS}ms`
        );
      }

      return this.getStatus();
    } catch (err: any) {
      logger.warn(`[ClockSyncService] Failed to synchronize clock with Binance: ${err.message}`);
      return this.getStatus();
    }
  }

  /**
   * Handles Binance -1021 timestamp error by forcing immediate clock resynchronization.
   */
  static async handleTimestampError(baseUrl?: string): Promise<void> {
    logger.warn('[ClockSyncService] Received -1021 timestamp rejection from Binance. Forcing resync.');
    await this.synchronize(baseUrl);
  }

  /**
   * Persists sync state to database for cross-instance visibility.
   */
  private static async persistState(): Promise<void> {
    try {
      const db = getDb();
      const now = Date.now();
      await db.execute(
        `INSERT INTO exchange_sync_state (
          account_id, server_time_offset_ms, last_sync_at, rest_health, ws_health, updated_at
        ) VALUES ('global_binance', ?, ?, 'HEALTHY', 'HEALTHY', ?)
        ON CONFLICT(account_id) DO UPDATE SET
          server_time_offset_ms = excluded.server_time_offset_ms,
          last_sync_at = excluded.last_sync_at,
          updated_at = excluded.updated_at`,
        [this.offsetMs, this.lastSyncAt, now]
      );
    } catch (err: any) {
      // Non-fatal if DB write fails
      logger.warn(`[ClockSyncService] Could not persist sync state: ${err.message}`);
    }
  }

  /**
   * Starts periodic clock synchronization loop.
   */
  static startPeriodicSync(intervalMs: number = this.SYNC_INTERVAL_MS): void {
    if (this.syncTimer) return;
    this.syncTimer = setInterval(() => {
      void this.synchronize();
    }, intervalMs);
    // Initial sync
    void this.synchronize();
  }

  /**
   * Stops periodic synchronization.
   */
  static stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Resets internal state (useful for tests).
   */
  static reset(): void {
    this.offsetMs = 0;
    this.lastSyncAt = 0;
    this.roundTripMs = 0;
    this.simulatedOffsetMs = null;
  }
}
