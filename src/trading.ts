// Re-export domain logic from modular domain architecture
export * from './domain/portfolio';
export * from './domain/indicators';
export * from './domain/trading';
export * from './domain/risk';

import { ASSETS, AppState, Asset, Market } from './types';
import { portfolioValue, positionValue } from './domain/portfolio';
import { returns, stdev } from './domain/indicators';
import { calculatePortfolioRisk } from './domain/risk';

export const FEE = 0.0008;

/**
 * Backward-compatible risk function adaptor matching legacy signature
 */
export function risk(s: AppState, markets: Record<Asset, Market | undefined>) {
  const analysis = calculatePortfolioRisk(s, markets);
  return {
    score: analysis.portfolioRiskScore,
    label: analysis.riskLabel,
    weights: analysis.assetWeights,
    vol: analysis.weightedVolatility,
    cashRatio: analysis.cashRatioPct / 100,
    concentration: analysis.topAssetConcentrationPct,
    topAsset: analysis.topAsset,
    herfindahlIndex: analysis.herfindahlIndex,
    strategyExposure: analysis.strategyExposurePct,
    riskFactors: analysis.riskFactors,
  };
}
