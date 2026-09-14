/**
 * LUMEN-ASTRA-FIN 1.0: CAUSAL FINANCIAL GRAPH ENGINE
 * Computes cross-asset propagation and 2nd-order sector ripple effects.
 */

import { Asset } from '../../../types';
import { CAUSAL_EDGES } from './contagionMatrix';

export interface ContagionImpact {
  affectedAsset: Asset;
  elasticityBeta: number;
  mechanism: string;
  netImpactScore: number; // -1.0 to +1.0
}

export class FinancialGraphEngine {
  /**
   * Traverses causal graph to find cross-sector ripple impacts of an event headline.
   */
  public static evaluateContagion(headline: string, matchedDirectTickers: Asset[]): Map<Asset, ContagionImpact> {
    const impacts = new Map<Asset, ContagionImpact>();
    const upper = headline.toUpperCase();

    // 1. Detect Macro Shock Triggers
    let activeMacroSource: string | null = null;
    let shockMagnitude = 1.0;

    if (/CRUDE|BRENT|OIL\s+PRICES?|PETROL|DIESEL/i.test(upper)) {
      activeMacroSource = 'BRENT_CRUDE_SURGE';
      if (/FALL|DROP|SLUMP|CRASH|PLUNGE/i.test(upper)) shockMagnitude = -1.0;
    } else if (/US\s+TECH|NASDAQ|AI\s+SPENDING|CLOUD\s+DEMAND|IT\s+SPEND/i.test(upper)) {
      activeMacroSource = 'US_TECH_SPEND_EXPANSION';
      if (/CUT|SLOWDOWN|DOWNGRADE|WARN/i.test(upper)) shockMagnitude = -1.0;
    } else if (/DEFEN[SC]E|MOD\s+ORDER|INDIAN\s+NAVY|INDIAN\s+AIR\s+FORCE|ARMY\s+ORDER/i.test(upper)) {
      activeMacroSource = 'DEFENSE_PROCUREMENT_EXPANSION';
    } else if (/REPO\s+RATE|RBI\s+POLICY|MPC|RATE\s+HIKE/i.test(upper)) {
      activeMacroSource = 'RBI_RATE_HIKE';
      if (/RATE\s+CUT|PAUSE|EASING/i.test(upper)) shockMagnitude = -1.0;
    } else if (/STEEL|METALS?|ALUMIN[IU]M|COPPER\s+PRICES?/i.test(upper)) {
      activeMacroSource = 'METAL_DEMAND_EXPANSION';
      if (/FALL|DUMP|DOWN|WEAK/i.test(upper)) shockMagnitude = -1.0;
    }

    if (activeMacroSource) {
      const edges = CAUSAL_EDGES.filter((e) => e.source === activeMacroSource);
      for (const edge of edges) {
        const netScore = Number((edge.elasticityBeta * shockMagnitude).toFixed(2));
        impacts.set(edge.target as Asset, {
          affectedAsset: edge.target as Asset,
          elasticityBeta: edge.elasticityBeta,
          mechanism: edge.mechanism,
          netImpactScore: netScore,
        });
      }
    }

    // 2. Intra-Sector Peer Contagion (e.g. Major negative news on TCS creates mild headwinds for INFY)
    if (matchedDirectTickers.includes('TCS') && /SEBI|FRAUD|MISCONDUCT|PROBE/i.test(upper)) {
      impacts.set('INFY', {
        affectedAsset: 'INFY',
        elasticityBeta: 0.35,
        mechanism: 'Indian IT governance contagion risk',
        netImpactScore: -0.35,
      });
    }

    return impacts;
  }
}
