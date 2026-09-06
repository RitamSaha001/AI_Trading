/**
 * SEBI Algorithmic Compliance & Order-to-Trade Ratio (OTR) Limiter
 * 
 * Enforces SEBI Order-to-Trade Ratio (OTR) limits to protect trading accounts from
 * steep exchange penalties resulting from runaway algorithmic modification/cancellation loops.
 * Formats and injects pre-trade SEBI strategy identifiers into broker order payloads.
 */

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
   * Records an order event in the rolling window.
   */
  public static recordEvent(
    userId: string,
    symbol: string,
    type: 'PLACE' | 'MODIFY' | 'CANCEL' | 'FILL'
  ): void {
    const key = `${userId}:${symbol.toUpperCase()}`;
    const now = Date.now();
    const list = this.events.get(key) || [];

    // Purge expired events outside the window
    const cutoff = now - this.WINDOW_MS;
    const active = list.filter((e) => e.timestamp >= cutoff);
    active.push({ type, timestamp: now });

    this.events.set(key, active);
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
   * Asserts that a proposed modification or cancellation does not breach safe OTR limits.
   * Throws a StandardBrokerError if throttled.
   */
  public static assertOtrLimit(userId: string, symbol: string, action: 'MODIFY' | 'CANCEL'): void {
    const stats = this.getStats(userId, symbol);
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
   * Upstox limits tags to 30 alphanumeric characters.
   */
  public static formatStrategyTag(rawStrategyId?: string): string {
    const cleanId = (rawStrategyId || 'quant_core').replace(/[^a-zA-Z0-9_]/g, '');
    const tag = `algo_${cleanId}`;
    return tag.slice(0, 30);
  }
}
