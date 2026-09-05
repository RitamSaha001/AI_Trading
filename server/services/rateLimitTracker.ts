import { logger } from './auditService';
import { CircuitBreakerService } from './circuitBreakerService';

export type RequestClassification = 'READ_ONLY' | 'IDEMPOTENT_WRITE' | 'AMBIGUOUS_WRITE' | 'NON_RETRYABLE';

export interface RateLimitStatus {
  usedWeight1m: number;
  maxWeight1m: number;
  isThrottled: boolean;
  isBlocked: boolean;
  retryAfterMs: number;
  blockedUntil: number;
}

export class RateLimitTracker {
  private static readonly MAX_WEIGHT_1M = 1200;
  private static readonly WARNING_THRESHOLD = 960; // 80%
  private static readonly CRITICAL_THRESHOLD = 1140; // 95%

  private static usedWeight1m: number = 0;
  private static blockedUntil: number = 0;
  private static lastUpdated: number = Date.now();

  /**
   * Records response headers from Binance REST calls.
   */
  static recordResponse(headers: Headers | Record<string, string | string[] | undefined>, statusCode: number): void {
    this.lastUpdated = Date.now();

    // Parse X-MBX-USED-WEIGHT-1M
    let weightHeader: string | null = null;
    if (typeof (headers as any).get === 'function') {
      weightHeader = (headers as Headers).get('x-mbx-used-weight-1m');
    } else {
      const obj = headers as Record<string, any>;
      weightHeader = obj['x-mbx-used-weight-1m'] || obj['X-MBX-USED-WEIGHT-1M'] || null;
    }

    if (weightHeader) {
      const parsedWeight = parseInt(weightHeader, 10);
      if (!isNaN(parsedWeight)) {
        this.usedWeight1m = parsedWeight;
      }
    }

    // Handle 429 (Rate Limit Exceeded) and 418 (IP Auto-Banned)
    if (statusCode === 429 || statusCode === 418) {
      let retryAfterSeconds = 60; // Default fallback to 60s
      let retryHeader: string | null = null;
      if (typeof (headers as any).get === 'function') {
        retryHeader = (headers as Headers).get('retry-after');
      } else {
        const obj = headers as Record<string, any>;
        retryHeader = obj['retry-after'] || obj['Retry-After'] || null;
      }

      if (retryHeader) {
        const parsedRetry = parseInt(retryHeader, 10);
        if (!isNaN(parsedRetry) && parsedRetry > 0) {
          retryAfterSeconds = parsedRetry;
        }
      }

      this.blockedUntil = Date.now() + retryAfterSeconds * 1000;
      logger.error(
        `[RateLimitTracker] Binance Rate Limit hit (HTTP ${statusCode}). Backing off for ${retryAfterSeconds}s.`
      );

      // Automatically trip rate-limit circuit breaker
      void CircuitBreakerService.trip(
        'rate_limit_exceeded',
        'GLOBAL',
        '*',
        `Binance returned HTTP ${statusCode} (weight=${this.usedWeight1m}). Backoff required for ${retryAfterSeconds}s.`,
        `Wait until retry-after expires (${new Date(this.blockedUntil).toISOString()})`
      );
    } else if (this.usedWeight1m >= this.CRITICAL_THRESHOLD) {
      logger.warn(
        `[RateLimitTracker] Binance 1m used weight critical: ${this.usedWeight1m}/${this.MAX_WEIGHT_1M}`
      );
    }
  }

  /**
   * Checks if an operation can be safely executed against the exchange.
   */
  static canExecute(classification: RequestClassification): {
    allowed: boolean;
    waitMs?: number;
    reason?: string;
  } {
    const now = Date.now();
    if (now < this.blockedUntil) {
      const waitMs = this.blockedUntil - now;
      return {
        allowed: false,
        waitMs,
        reason: `Rate limit backoff active. Must wait ${Math.ceil(waitMs / 1000)}s.`,
      };
    }

    if (this.usedWeight1m >= this.CRITICAL_THRESHOLD) {
      if (classification !== 'READ_ONLY') {
        return {
          allowed: false,
          reason: `Binance request weight near exhaustion (${this.usedWeight1m}/${this.MAX_WEIGHT_1M}). Write operations paused.`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Executes a request adhering strictly to retry rules:
   * - READ_ONLY: retry with exponential backoff & jitter
   * - AMBIGUOUS_WRITE: NEVER retry blindly on timeout/network error
   */
  static async executeWithPolicy<T>(
    fn: () => Promise<{ res: Response; data: T }>,
    classification: RequestClassification,
    maxRetries: number = 3
  ): Promise<{ res: Response; data: T }> {
    const check = this.canExecute(classification);
    if (!check.allowed) {
      throw new Error(`Rate limit check failed: ${check.reason}`);
    }

    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const result = await fn();
        this.recordResponse(result.res.headers, result.res.status);

        if (result.res.status === 429 || result.res.status === 418) {
          const waitMs = Math.max(1000, this.blockedUntil - Date.now());
          if (classification === 'READ_ONLY' && attempt < maxRetries) {
            attempt++;
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            continue;
          }
          throw new Error(`Binance Rate Limit HTTP ${result.res.status}: retry-after active`);
        }

        return result;
      } catch (err: any) {
        if (classification === 'AMBIGUOUS_WRITE') {
          // Rule 16 & 17: NEVER automatically retry ambiguous writes (order placements, cancellations)
          logger.error(
            `[RateLimitTracker] Ambiguous write failed on attempt ${attempt + 1}. Refusing blind retry: ${err.message}`
          );
          throw err;
        }

        if (classification === 'NON_RETRYABLE') {
          throw err;
        }

        // Safe retry for READ_ONLY
        attempt++;
        if (attempt > maxRetries) {
          throw err;
        }

        // Exponential backoff with jitter
        const backoffMs = Math.min(5000, 200 * Math.pow(2, attempt) + Math.random() * 100);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw new Error(`Exceeded max retries for ${classification} request`);
  }

  /**
   * Returns current rate limit status.
   */
  static getStatus(): RateLimitStatus {
    const now = Date.now();
    const retryAfterMs = Math.max(0, this.blockedUntil - now);
    return {
      usedWeight1m: this.usedWeight1m,
      maxWeight1m: this.MAX_WEIGHT_1M,
      isThrottled: this.usedWeight1m >= this.WARNING_THRESHOLD,
      isBlocked: retryAfterMs > 0,
      retryAfterMs,
      blockedUntil: this.blockedUntil,
    };
  }

  /**
   * Resets rate limit state (useful for tests).
   */
  static reset(): void {
    this.usedWeight1m = 0;
    this.blockedUntil = 0;
    this.lastUpdated = Date.now();
  }
}
