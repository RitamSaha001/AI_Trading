/**
 * Bounded In-Memory Rate Limiter for Authentication Abuse Protection
 * Tracks request counts across bounded sliding windows and cleans up automatically.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class AuthRateLimiter {
  private static limits = new Map<string, RateLimitEntry>();
  private static lastCleanup = Date.now();
  private static readonly CLEANUP_INTERVAL_MS = 60_000; // 1 minute

  /**
   * Checks if an action is allowed for a given key within a window.
   * Increments the attempt counter if allowed.
   */
  static isAllowed(key: string, maxAttempts: number, windowMs: number): boolean {
    const now = Date.now();
    this.maybeCleanup(now);

    const entry = this.limits.get(key);
    if (!entry || now > entry.resetTime) {
      this.limits.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (entry.count >= maxAttempts) {
      return false;
    }

    entry.count += 1;
    return true;
  }

  /**
   * Resets rate limit for a key (useful on successful verification or in tests).
   */
  static reset(key: string): void {
    this.limits.delete(key);
  }

  /**
   * Periodically prunes expired rate limit entries to prevent memory leaks.
   */
  private static maybeCleanup(now: number): void {
    if (now - this.lastCleanup < this.CLEANUP_INTERVAL_MS) return;
    this.lastCleanup = now;

    for (const [key, entry] of this.limits.entries()) {
      if (now > entry.resetTime) {
        this.limits.delete(key);
      }
    }
  }

  /**
   * Clears all limits (for testing).
   */
  static clearAll(): void {
    this.limits.clear();
  }
}
