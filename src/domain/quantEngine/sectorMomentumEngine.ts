import { Market, Asset } from '../../types';
import { getAssetSector } from './alphaSignalEngine';

export interface SectorMomentumStats {
  sector: string;
  constituentCount: number;
  averageChangePct: number;
  advanceRatio: number;
  rank: number;
}

export interface SectorRankingResult {
  rankedSectors: SectorMomentumStats[];
  topSectors: string[];
  bottomSectors: string[];
  sectorStatsMap: Map<string, SectorMomentumStats>;
}

/**
 * Calculates cross-sectional sector momentum across all monitored fleet equities.
 * Identifies leading institutional money-flow sectors and laggards.
 */
export function calculateSectorMomentumRanking(
  markets: Partial<Record<Asset, Market>>,
  activeAssets: Asset[]
): SectorRankingResult {
  const sectorMap = new Map<string, { totalChange: number; advances: number; count: number }>();

  for (const asset of activeAssets) {
    const m = markets[asset];
    if (!m || !m.price || m.price <= 0) continue;

    const sector = getAssetSector(asset);
    const change = m.change24h || 0;

    let stats = sectorMap.get(sector);
    if (!stats) {
      stats = { totalChange: 0, advances: 0, count: 0 };
      sectorMap.set(sector, stats);
    }

    stats.count++;
    stats.totalChange += change;
    if (change > 0) stats.advances++;
  }

  const list: SectorMomentumStats[] = [];
  for (const [sector, stats] of sectorMap.entries()) {
    if (stats.count === 0) continue;
    list.push({
      sector,
      constituentCount: stats.count,
      averageChangePct: +(stats.totalChange / stats.count).toFixed(2),
      advanceRatio: +(stats.advances / stats.count).toFixed(2),
      rank: 0,
    });
  }

  // Sort descending by average change percentage
  list.sort((a, b) => b.averageChangePct - a.averageChangePct);

  list.forEach((item, idx) => {
    item.rank = idx + 1;
  });

  const sectorStatsMap = new Map<string, SectorMomentumStats>();
  list.forEach((item) => sectorStatsMap.set(item.sector, item));

  const topSectors = list.slice(0, 2).map((s) => s.sector);
  const bottomSectors = list.slice(-2).map((s) => s.sector);

  return {
    rankedSectors: list,
    topSectors,
    bottomSectors,
    sectorStatsMap,
  };
}

/**
 * Evaluates sector alignment bonus or penalty for an individual asset setup.
 */
export function evaluateSectorAlignmentBonus(
  sector: string,
  sectorRanking: SectorRankingResult,
  isLong: boolean = true
): { scoreDelta: number; rationale: string } {
  const stats = sectorRanking.sectorStatsMap.get(sector);
  if (!stats) return { scoreDelta: 0, rationale: 'Sector neutral' };

  if (isLong) {
    if (stats.rank <= 2 && stats.averageChangePct > 0) {
      return {
        scoreDelta: +8,
        rationale: `Sector Leader: ${sector} is Rank #${stats.rank} (+${stats.averageChangePct}% avg). Institutional money inflow.`,
      };
    }
    if (sectorRanking.bottomSectors.includes(sector) || stats.averageChangePct < -0.10 || stats.advanceRatio < 0.40) {
      return {
        scoreDelta: -8,
        rationale: `Sector Laggard: ${sector} is Rank #${stats.rank} (${stats.averageChangePct}% avg, ${Math.round(stats.advanceRatio * 100)}% advances). Fighting sector headwind.`,
      };
    }
  } else {
    // For shorts: leading sectors get penalized, lagging sectors get bonus
    if (sectorRanking.bottomSectors.includes(sector)) {
      return {
        scoreDelta: +8,
        rationale: `Sector Laggard Breakdown: ${sector} is Rank #${stats.rank} (${stats.averageChangePct}% avg). Short tailwind.`,
      };
    }
    if (stats.rank <= 2) {
      return {
        scoreDelta: -8,
        rationale: `Avoid Shorting Leader: ${sector} is Rank #${stats.rank} (+${stats.averageChangePct}% avg).`,
      };
    }
  }

  return { scoreDelta: 0, rationale: `Sector ${sector} is neutral (Rank #${stats.rank}).` };
}
