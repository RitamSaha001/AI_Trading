import { AppState } from '../types';

export interface RiskPolicy {
  /** Minimum liquid cash reserve percentage required for capital defense (0.15 = 15%) */
  minCashReservePct: number;
  /** Hard cap: maximum allowed allocation in a single cryptocurrency asset (0.50 = 50%) */
  maxSingleAssetPct: number;
  /** Soft warning threshold for asset concentration (0.35 = 35%) */
  warnSingleAssetPct: number;
  /** Maximum portfolio equity at risk on a single trade (0.02 = 2.0%) */
  maxTradeRiskPct: number;
  /** Maximum single trade notional size as percentage of total portfolio equity (0.40 = 40%) */
  maxSingleOrderPortfolioPct: number;
  /** Maximum volatile asset exposure across total portfolio (0.85 = 85%, leaving min 15% cash) */
  maxPortfolioExposurePct: number;
  /** Maximum allowable leverage (1.0 = spot paper trading only, no borrowing/margin) */
  maxLeverage: number;
  /** Maximum allowable execution slippage (0.01 = 1.0% or 100 bps) */
  maxSlippagePct: number;
  /** Maximum single-day allowable portfolio drawdown loss threshold before circuit breaker (0.05 = 5.0%) */
  maxDailyLossPct: number;
  /** Data freshness threshold in milliseconds before market quotes are flagged as stale (45,000ms = 45s) */
  staleDataThresholdMs: number;
  /** Minimum order notional in USD ($10) */
  minOrderNotionalUsd: number;
  /** Minimum distance to stop-loss in percentage (0.005 = 0.5%) */
  minStopDistancePct: number;
  /** Maximum distance to stop-loss in percentage (0.15 = 15%) */
  maxStopDistancePct: number;
  /** Maximum Herfindahl-Hirschman concentration index before flagged as hazard (0.25) */
  maxHerfindahlIndex: number;
}

export const DEFAULT_RISK_POLICY: Readonly<RiskPolicy> = Object.freeze({
  minCashReservePct: 0.15,
  maxSingleAssetPct: 0.50,
  warnSingleAssetPct: 0.35,
  maxTradeRiskPct: 0.02,
  maxSingleOrderPortfolioPct: 0.40,
  maxPortfolioExposurePct: 0.85,
  maxLeverage: 1.0,
  maxSlippagePct: 0.01,
  maxDailyLossPct: 0.05,
  staleDataThresholdMs: 45_000,
  minOrderNotionalUsd: 10,
  minStopDistancePct: 0.005,
  maxStopDistancePct: 0.15,
  maxHerfindahlIndex: 0.25,
});

/**
 * Derives the active risk policy, incorporating user-level loss prevention overrides if configured.
 */
export function getRiskPolicy(state?: AppState): RiskPolicy {
  const policy = { ...DEFAULT_RISK_POLICY };

  if (state?.settings?.maxSlippageBps) {
    policy.maxSlippagePct = Math.min(0.05, Math.max(0.0001, state.settings.maxSlippageBps / 10000));
  }

  if (state?.lossPreventionMode === 'strict') {
    policy.minCashReservePct = 0.25;
    policy.maxSingleAssetPct = 0.35;
    policy.maxTradeRiskPct = 0.01;
    policy.maxSingleOrderPortfolioPct = 0.25;
    policy.maxDailyLossPct = 0.03;
  } else if (state?.lossPreventionMode === 'aggressive') {
    policy.minCashReservePct = 0.10;
    policy.maxSingleAssetPct = 0.60;
    policy.maxTradeRiskPct = 0.035;
    policy.maxSingleOrderPortfolioPct = 0.50;
    policy.maxDailyLossPct = 0.08;
  }

  return policy;
}
