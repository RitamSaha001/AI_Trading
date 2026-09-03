import { ASSETS, Asset, AppState, Market } from '../types';
import { portfolioValue, positionValue } from './portfolio';
import { returns, stdev } from './indicators';

export interface PortfolioRiskAnalysis {
  portfolioRiskScore: number; // 0 - 100
  riskLabel: 'Conservative' | 'Moderate' | 'Elevated' | 'Aggressive';
  totalExposurePct: number; // % of total portfolio invested in volatile assets
  cashRatioPct: number; // % of portfolio held in liquid cash buffer
  topAssetConcentrationPct: number; // Largest single holding as % of portfolio
  topAsset: Asset | null;
  assetWeights: Record<Asset, number>;
  weightedVolatility: number; // 20-period annualized or relative volatility
  herfindahlIndex: number; // Quantitative measure of portfolio concentration (0 = perfectly diversified, 1 = concentrated)
  strategyExposurePct: number; // % of portfolio capital allocated across active automated strategies
  riskFactors: { name: string; score: number; description: string }[];
}

/**
 * Evaluates comprehensive portfolio-level financial risk.
 * Strictly separated from individual asset momentum signals.
 */
export function calculatePortfolioRisk(
  state: Pick<AppState, 'cash' | 'positions' | 'strategies'>,
  markets: Record<Asset, Market | undefined>
): PortfolioRiskAnalysis {
  const totalVal = portfolioValue(state, markets);

  if (totalVal <= 0) {
    return {
      portfolioRiskScore: 0,
      riskLabel: 'Conservative',
      totalExposurePct: 0,
      cashRatioPct: 100,
      topAssetConcentrationPct: 0,
      topAsset: null,
      assetWeights: Object.fromEntries(ASSETS.map((a) => [a, 0])) as Record<Asset, number>,
      weightedVolatility: 0,
      herfindahlIndex: 0,
      strategyExposurePct: 0,
      riskFactors: [],
    };
  }

  // 1. Asset weights
  const assetWeights = Object.fromEntries(
    ASSETS.map((a) => [a, positionValue(state, markets, a) / totalVal])
  ) as Record<Asset, number>;

  // 2. Liquid cash ratio & exposure
  const cashRatio = Math.max(0, Math.min(1, state.cash / totalVal));
  const cashRatioPct = cashRatio * 100;
  const totalExposurePct = (1 - cashRatio) * 100;

  // 3. Top asset concentration
  let topAsset: Asset | null = null;
  let maxWeight = 0;
  let hhi = 0; // Herfindahl-Hirschman index: sum of squared weights

  for (const a of ASSETS) {
    const w = assetWeights[a];
    hhi += w * w;
    if (w > maxWeight) {
      maxWeight = w;
      topAsset = a;
    }
  }

  const topAssetConcentrationPct = maxWeight * 100;

  // 4. Weighted portfolio asset volatility
  let weightedVol = 0;
  for (const a of ASSETS) {
    const w = assetWeights[a];
    if (w > 0) {
      const hist = markets[a]?.history || [];
      const assetVol = stdev(returns(hist.slice(-20)));
      weightedVol += w * assetVol;
    }
  }

  // 5. Active strategy capital exposure
  const activeStrategies = (state.strategies || []).filter((s) => s.enabled);
  const strategyExposurePct = activeStrategies.reduce((sum, s) => sum + (s.maxAllocation || 0) * 100, 0);

  // 6. Transparent, multi-factor composite risk scoring (0 - 100)
  // - Concentration penalty: High single-asset exposure creates vulnerability (0 to 45 pts)
  const concentrationScore = Math.min(45, maxWeight * 50);

  // - Exposure penalty: Low cash buffer increases drawdown vulnerability (0 to 30 pts)
  const exposureScore = Math.min(30, (1 - cashRatio) * 30);

  // - Volatility contribution: Price instability across open positions (0 to 25 pts)
  const volScore = Math.min(25, weightedVol * 1200);

  const rawScore = Math.round(concentrationScore + exposureScore + volScore);
  const portfolioRiskScore = Math.max(5, Math.min(95, rawScore));

  let riskLabel: PortfolioRiskAnalysis['riskLabel'] = 'Conservative';
  if (portfolioRiskScore >= 72) riskLabel = 'Aggressive';
  else if (portfolioRiskScore >= 45) riskLabel = 'Elevated';
  else if (portfolioRiskScore >= 25) riskLabel = 'Moderate';

  const riskFactors = [
    {
      name: 'Concentration Risk',
      score: Math.round(concentrationScore),
      description: topAsset
        ? `Top holding (${topAsset}) comprises ${topAssetConcentrationPct.toFixed(1)}% of total equity.`
        : 'Portfolio is 100% liquid cash.',
    },
    {
      name: 'Capital Exposure',
      score: Math.round(exposureScore),
      description: `${totalExposurePct.toFixed(1)}% invested in volatile assets, with a ${cashRatioPct.toFixed(1)}% liquid cash buffer.`,
    },
    {
      name: 'Asset Volatility',
      score: Math.round(volScore),
      description: `Weighted 20-period return volatility of ${(weightedVol * 100).toFixed(2)}%.`,
    },
  ];

  return {
    portfolioRiskScore,
    riskLabel,
    totalExposurePct,
    cashRatioPct,
    topAssetConcentrationPct,
    topAsset,
    assetWeights,
    weightedVolatility: weightedVol,
    herfindahlIndex: hhi,
    strategyExposurePct,
    riskFactors,
  };
}
