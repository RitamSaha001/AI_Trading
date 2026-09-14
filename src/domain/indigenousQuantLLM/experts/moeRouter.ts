/**
 * LUMEN-ASTRA-FIN 1.0: SPARSE MIXTURE-OF-EXPERTS (MoE) ROUTER
 * Computes softmax routing weights across 6 specialized financial neural heads.
 */

import { MoERouterWeights } from '../types';

export class MoERouter {
  /**
   * Computes normalized routing weights across all 6 financial expert heads.
   */
  public static route(headline: string): { weights: MoERouterWeights; topExperts: string[] } {
    const upper = headline.toUpperCase();

    // Raw logits based on specialized financial domain keywords
    let lMacro = 0.5;
    let lEarnings = 0.5;
    let lRegulatory = 0.5;
    let lMicro = 0.5;
    let lContagion = 0.5;
    let lHorizon = 0.5;

    // Domain logit boosts
    if (/RATE|RBI|REPO|MONETARY|INFLATION|DOVISH|HAWKISH|CURRENCY|RUPEE/i.test(upper)) {
      lMacro += 3.5;
    }
    if (/PROFIT|REVENUE|NET|Q[1-4]|RESULTS?|EARNINGS?|BEATS?|MISSES?|EBITDA|MARGIN|ORDER|CONTRACT|WINS?|BAGS?/i.test(upper)) {
      lEarnings += 4.0;
    }
    if (/SEBI|ED\s+RAID|CBI|PROBE|NOTICE|PENALTY|BAN|FRAUD|AUDIT|USFDA|WARNING|OBSERVATION/i.test(upper)) {
      lRegulatory += 4.5;
    }
    if (/BLOCK\s+DEAL|BULK\s+DEAL|FII|DII|VOLUMES?|ACCUMULATION|DISTRIBUTION/i.test(upper)) {
      lMicro += 3.0;
    }
    if (/CRUDE|BRENT|OIL|COMMODITY|STEEL|COPPER|GLOBAL|NASDAQ|CHINA/i.test(upper)) {
      lContagion += 3.5;
    }
    if (/TARGET|BUY|SELL|HOLD|RUNNER|EXPANSION|SPIKE|SURGE/i.test(upper)) {
      lHorizon += 2.0;
    }

    // Softmax normalization
    const maxL = Math.max(lMacro, lEarnings, lRegulatory, lMicro, lContagion, lHorizon);
    const expMacro = Math.exp(lMacro - maxL);
    const expEarnings = Math.exp(lEarnings - maxL);
    const expRegulatory = Math.exp(lRegulatory - maxL);
    const expMicro = Math.exp(lMicro - maxL);
    const expContagion = Math.exp(lContagion - maxL);
    const expHorizon = Math.exp(lHorizon - maxL);

    const sumExp = expMacro + expEarnings + expRegulatory + expMicro + expContagion + expHorizon;

    const weights: MoERouterWeights = {
      macroMonetary: Number((expMacro / sumExp).toFixed(3)),
      earningsSurprise: Number((expEarnings / sumExp).toFixed(3)),
      regulatoryForensic: Number((expRegulatory / sumExp).toFixed(3)),
      microstructure: Number((expMicro / sumExp).toFixed(3)),
      crossAssetContagion: Number((expContagion / sumExp).toFixed(3)),
      executionHorizon: Number((expHorizon / sumExp).toFixed(3)),
    };

    // Determine Top-2 Experts
    const entries = [
      { name: 'MacroMonetaryExpert', weight: weights.macroMonetary },
      { name: 'EarningsSurpriseExpert', weight: weights.earningsSurprise },
      { name: 'RegulatoryForensicExpert', weight: weights.regulatoryForensic },
      { name: 'MicrostructureExpert', weight: weights.microstructure },
      { name: 'CrossAssetContagionExpert', weight: weights.crossAssetContagion },
      { name: 'ExecutionHorizonCritic', weight: weights.executionHorizon },
    ];
    entries.sort((a, b) => b.weight - a.weight);
    const topExperts = entries.slice(0, 2).map((e) => e.name);

    return { weights, topExperts };
  }
}
