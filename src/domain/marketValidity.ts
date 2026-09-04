import { Asset, Market } from '../types';
import { DEFAULT_RISK_POLICY, RiskPolicy } from './riskPolicy';

export interface MarketValidityResult {
  isValid: boolean;
  canExecute: boolean;
  ageMs: number;
  ageSec: number;
  isStale: boolean;
  isSynthetic: boolean;
  qualityScore: number; // 0 to 100
  errors: string[];
  warnings: string[];
}

export class MarketDataValidityGuard {
  /**
   * Evaluates the integrity, freshness, and completeness of an asset's market feed.
   * For analysis or trade execution, missing or severely invalid data strictly rejects executable proposals.
   */
  static validate(
    market: Market | undefined,
    asset: Asset,
    policy: RiskPolicy = DEFAULT_RISK_POLICY,
    options?: { requireExecutionGrade?: boolean; maxAgeMs?: number }
  ): MarketValidityResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const maxAge = options?.maxAgeMs ?? policy.staleDataThresholdMs;
    const requireExec = options?.requireExecutionGrade ?? false;

    // 1. Existence check
    if (!market) {
      return {
        isValid: false,
        canExecute: false,
        ageMs: Infinity,
        ageSec: Infinity,
        isStale: true,
        isSynthetic: false,
        qualityScore: 0,
        errors: [`Missing market feed for ${asset}: No quote data received from exchanges.`],
        warnings: [],
      };
    }

    // 2. Numerical sanity
    if (!Number.isFinite(market.price) || market.price <= 0) {
      errors.push(`Invalid spot price for ${asset} (${market.price}). Must be a positive finite number.`);
    }

    if (!Array.isArray(market.history) || market.history.length === 0) {
      errors.push(`Missing price history for ${asset}. Technical indicators cannot be computed.`);
    } else if (market.history.length < 14) {
      warnings.push(`Abbreviated history for ${asset} (${market.history.length} ticks). RSI & volatility require >= 14 samples.`);
    }

    // 3. Freshness check
    const now = Date.now();
    const lastUpdated = market.lastUpdated || 0;
    const ageMs = Math.max(0, now - lastUpdated);
    const ageSec = Math.round(ageMs / 1000);
    const isStale = ageMs > maxAge;

    if (isStale) {
      const msg = `Market data for ${asset} is stale (${ageSec}s old, threshold: ${Math.round(maxAge / 1000)}s).`;
      warnings.push(msg);
      if (requireExec) {
        errors.push(`${msg} Executable proposals are strictly disabled.`);
      }
    }

    // 4. Synthetic simulation flag
    const isSynthetic = Boolean(market.isSynthetic);
    if (isSynthetic) {
      warnings.push(`Market feed for ${asset} is currently operating on heuristic simulation.`);
    }

    // 5. Data Quality Scoring (0 - 100)
    let quality = 100;
    if (errors.length > 0) {
      quality = 0;
    } else {
      if (isSynthetic) quality -= 25;
      if (ageSec > 10) quality -= Math.min(30, (ageSec - 10) * 2);
      if (isStale) quality -= 20;
      if (!market.candles || market.candles.length === 0) quality -= 10;
      if (!market.history || market.history.length < 20) quality -= 15;
    }
    const qualityScore = Math.max(0, Math.min(100, Math.round(quality)));

    const isValid = errors.length === 0;
    // Execution is blocked if invalid, if stale, or if quality is below minimum threshold
    const canExecute = isValid && !isStale && (!requireExec || qualityScore >= 50);

    return {
      isValid,
      canExecute,
      ageMs,
      ageSec,
      isStale,
      isSynthetic,
      qualityScore,
      errors,
      warnings,
    };
  }

  /**
   * Asserts that market data is valid for execution; otherwise throws a structured error.
   */
  static assertExecutionGrade(
    market: Market | undefined,
    asset: Asset,
    policy: RiskPolicy = DEFAULT_RISK_POLICY
  ): void {
    const result = this.validate(market, asset, policy, { requireExecutionGrade: true });
    if (!result.canExecute) {
      throw new Error(
        `[MarketDataValidityGuard] Execution blocked for ${asset}: ${result.errors.join('; ') || 'Data quality insufficient'}`
      );
    }
  }
}
