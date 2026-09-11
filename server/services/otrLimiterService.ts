/**
 * SEBI Algorithmic Compliance & Order-to-Trade Ratio (OTR) Limiter
 * 
 * Enforces SEBI Order-to-Trade Ratio (OTR) limits to protect trading accounts from
 * steep exchange penalties resulting from runaway algorithmic modification/cancellation loops.
 * Formats and injects pre-trade SEBI strategy identifiers into broker order payloads.
 */

import crypto from 'node:crypto';
import { DBClient, getDb } from '../db';
import { StandardBrokerError } from './brokers/brokerGateway';
import { logger, AuditService } from './auditService';

export interface OtrStats {
  ordersPlaced: number;
  ordersModified: number;
  ordersCancelled: number;
  ordersFilled: number;
  ratio: number;
}

export class OtrLimiterService {
  // Map of key `${userId}:${symbol}` -> list of timestamped events
  private static events: Map<
    string,
    Array<{ type: 'PLACE' | 'MODIFY' | 'CANCEL' | 'FILL'; timestamp: number }>
  > = new Map();

  private static readonly WINDOW_MS = 15 * 60 * 1000; // 15-minute rolling window
  public static readonly MAX_SAFE_OTR_RATIO = 20; // 20:1 modifications/cancellations to fills
  public static readonly MIN_ORDERS_FOR_THROTTLE = 10;

  /**
   * Resets all in-memory stats (useful for tests).
   */
  public static reset(): void {
    this.events.clear();
  }

  /**
   * Records an order event in the rolling window both in-memory and in durable database storage.
   */
  public static recordEvent(
    userId: string,
    symbol: string,
    type: 'PLACE' | 'MODIFY' | 'CANCEL' | 'FILL'
  ): void {
    const sym = symbol.toUpperCase();
    const key = `${userId}:${sym}`;
    const now = Date.now();
    const list = this.events.get(key) || [];

    // Purge expired events outside the window
    const cutoff = now - this.WINDOW_MS;
    const active = list.filter((e) => e.timestamp >= cutoff);
    active.push({ type, timestamp: now });

    this.events.set(key, active);

    // Durably record in otr_events table across server restarts and cluster nodes
    try {
      const eventId = `otr_${now}_${crypto.randomBytes(4).toString('hex')}`;
      void getDb().execute(
        `INSERT INTO otr_events (id, user_id, symbol, event_type, created_at) VALUES (?, ?, ?, ?, ?)`,
        [eventId, userId, sym, type, now]
      ).catch(() => {});
    } catch {
      // Ignore if DB not yet initialized
    }
  }

  /**
   * Computes the current OTR stats for a user and symbol.
   */
  public static getStats(userId: string, symbol: string): OtrStats {
    const key = `${userId}:${symbol.toUpperCase()}`;
    const now = Date.now();
    const list = this.events.get(key) || [];
    const cutoff = now - this.WINDOW_MS;
    const active = list.filter((e) => e.timestamp >= cutoff);

    let placed = 0;
    let modified = 0;
    let cancelled = 0;
    let filled = 0;

    for (const ev of active) {
      if (ev.type === 'PLACE') placed++;
      else if (ev.type === 'MODIFY') modified++;
      else if (ev.type === 'CANCEL') cancelled++;
      else if (ev.type === 'FILL') filled++;
    }

    const nonExecutionCount = modified + cancelled;
    const ratio = filled > 0 ? nonExecutionCount / filled : nonExecutionCount;

    return {
      ordersPlaced: placed,
      ordersModified: modified,
      ordersCancelled: cancelled,
      ordersFilled: filled,
      ratio,
    };
  }

  /**
   * Computes authoritative OTR stats directly from durable database storage.
   */
  public static async getDurableStats(userId: string, symbol: string, db: DBClient = getDb()): Promise<OtrStats> {
    try {
      const cutoff = Date.now() - this.WINDOW_MS;
      const rows = await db.query<{ event_type: string; count: number }>(
        `SELECT event_type, COUNT(*) as count FROM otr_events 
         WHERE user_id = ? AND symbol = ? AND created_at >= ? 
         GROUP BY event_type`,
        [userId, symbol.toUpperCase(), cutoff]
      );

      let placed = 0;
      let modified = 0;
      let cancelled = 0;
      let filled = 0;

      for (const r of rows) {
        const cnt = Number(r.count || 0);
        if (r.event_type === 'PLACE') placed = cnt;
        else if (r.event_type === 'MODIFY') modified = cnt;
        else if (r.event_type === 'CANCEL') cancelled = cnt;
        else if (r.event_type === 'FILL') filled = cnt;
      }

      const nonExecutionCount = modified + cancelled;
      const ratio = filled > 0 ? nonExecutionCount / filled : nonExecutionCount;

      return {
        ordersPlaced: placed,
        ordersModified: modified,
        ordersCancelled: cancelled,
        ordersFilled: filled,
        ratio,
      };
    } catch {
      return this.getStats(userId, symbol);
    }
  }

  /**
   * Asserts that a proposed order placement, modification or cancellation does not breach safe OTR limits.
   * Throws a StandardBrokerError if throttled.
   */
  public static assertOtrLimit(userId: string, symbol: string, action: 'PLACE' | 'MODIFY' | 'CANCEL'): void {
    this.assertStatsWithinLimit(userId, symbol, action, this.getStats(userId, symbol));
  }

  public static async assertDurableOtrLimit(
    userId: string,
    symbol: string,
    action: 'PLACE' | 'MODIFY' | 'CANCEL',
    db: DBClient = getDb()
  ): Promise<void> {
    const durableStats = await this.getDurableStats(userId, symbol, db);
    const localStats = this.getStats(userId, symbol);
    const stats = this.combineStats(durableStats, localStats);
    this.assertStatsWithinLimit(userId, symbol, action, stats);
  }

  private static combineStats(first: OtrStats, second: OtrStats): OtrStats {
    const ordersPlaced = Math.max(first.ordersPlaced, second.ordersPlaced);
    const ordersModified = Math.max(first.ordersModified, second.ordersModified);
    const ordersCancelled = Math.max(first.ordersCancelled, second.ordersCancelled);
    const ordersFilled = Math.max(first.ordersFilled, second.ordersFilled);
    const nonExecutionCount = ordersModified + ordersCancelled;

    return {
      ordersPlaced,
      ordersModified,
      ordersCancelled,
      ordersFilled,
      ratio: ordersFilled > 0 ? nonExecutionCount / ordersFilled : nonExecutionCount,
    };
  }

  private static assertStatsWithinLimit(
    userId: string,
    symbol: string,
    action: 'PLACE' | 'MODIFY' | 'CANCEL',
    stats: OtrStats
  ): void {

    if (action === 'PLACE') {
      const placementRatio = stats.ordersFilled > 0 ? stats.ordersPlaced / stats.ordersFilled : stats.ordersPlaced;
      if (stats.ordersPlaced >= 20 && placementRatio >= 20) {
        const msg = `SEBI OTR Guard: Order placement ratio (${placementRatio.toFixed(1)}:1) breached safe ceiling (20:1) for ${symbol}. PLACE throttled to prevent runaway order penalties.`;
        logger.warn(`[OtrLimiterService] ${msg}`);

        void AuditService.logEvent({
          userId,
          eventType: 'OTR_LIMIT_THROTTLED',
          source: 'otr_limiter_service',
          actor: 'sebi_compliance_guard',
          result: 'BLOCKED',
          metadata: { symbol, stats, action, placementRatio },
        });

        throw new StandardBrokerError('OTR_LIMIT_EXCEEDED', msg, 'upstox');
      }
      return;
    }

    const totalActions = stats.ordersPlaced + stats.ordersModified + stats.ordersCancelled;
    if (totalActions >= this.MIN_ORDERS_FOR_THROTTLE && stats.ratio >= this.MAX_SAFE_OTR_RATIO) {
      const msg = `SEBI OTR Guard: Order-to-Trade Ratio (${stats.ratio.toFixed(1)}:1) breached safe ceiling (${this.MAX_SAFE_OTR_RATIO}:1) for ${symbol}. ${action} throttled to prevent exchange penalty fines.`;
      logger.warn(`[OtrLimiterService] ${msg}`);

      void AuditService.logEvent({
        userId,
        eventType: 'OTR_LIMIT_THROTTLED',
        source: 'otr_limiter_service',
        actor: 'sebi_compliance_guard',
        result: 'BLOCKED',
        metadata: { symbol, stats, action },
      });

      throw new StandardBrokerError('OTR_LIMIT_EXCEEDED', msg, 'upstox');
    }
  }

  /**
   * Generates a sanitized SEBI algorithmic strategy tag.
   * Upstox limits tags to 30 characters (or up to 40 characters for extended tags).
   */
  public static formatStrategyTag(rawStrategyId?: string, clientOrderId?: string, maxLen: number = 30): string {
    const cleanId = (rawStrategyId || 'quant_core').replace(/[^a-zA-Z0-9_]/g, '');
    const limit = Math.max(10, Math.min(maxLen, 40));
    const cleanClient = clientOrderId?.replace(/[^a-zA-Z0-9_]/g, '') || '';

    if (!cleanClient) {
      return `algo_${cleanId.slice(0, Math.max(1, limit - 5))}`;
    }

    const clientSuffixLength = Math.min(12, Math.max(1, limit - 7));
    const clientSuffix = cleanClient.slice(-clientSuffixLength);
    const suffix = `_${clientSuffix}`;
    const strategyLimit = Math.max(1, limit - 5 - suffix.length);
    return `algo_${cleanId.slice(0, strategyLimit) || 'q'}${suffix}`.slice(0, limit);
  }
}
