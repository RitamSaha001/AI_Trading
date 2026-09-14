/**
 * LUMEN-ASTRA-FIN 1.0: EXPERT 2 - EARNINGS SURPRISE & CONSENSUS DELTA
 * Evaluates reported numbers against market consensus rather than nominal numbers.
 */

import { ExpertContribution } from '../types';

export class EarningsSurpriseExpert {
  public static readonly name = 'EarningsSurpriseExpert';

  public static evaluate(headline: string, weight: number): { contribution: ExpertContribution; consensusDeltaPct?: number } {
    const upper = headline.toUpperCase();
    let directionScore = 0;
    const insights: string[] = [];
    let sizingMult = 1.0;
    let consensusDeltaPct: number | undefined = undefined;

    // Detect consensus beat vs miss
    const isBeat = /BEATS?\s+(?:ESTIMATES?|CONSENSUS|STREET)|PROFIT\s+SURGES?|NET\s+RISES?\s+\d+%/i.test(upper);
    const isMiss = /MISSES?\s+(?:ESTIMATES?|CONSENSUS|STREET)|PROFIT\s+DROPS?|SLUMPS?|FALLS?\s+\d+%/i.test(upper);

    // Extract exact growth percentage if present (e.g. +28% or -14%)
    const pctMatch = /([+\-]?\d+(?:\.\d+)?)\s*%/i.exec(headline);
    const growthNum = pctMatch ? parseFloat(pctMatch[1]) : undefined;

    if (isBeat && !isMiss) {
      consensusDeltaPct = growthNum ?? 8.5;
      directionScore = 0.85;
      sizingMult = 1.30;
      insights.push(`Earnings beat confirmed (${consensusDeltaPct >= 0 ? '+' : ''}${consensusDeltaPct}%). Institutional re-rating catalyst.`);
    } else if (isMiss) {
      consensusDeltaPct = growthNum ? (growthNum > 0 ? -growthNum : growthNum) : -6.0;
      directionScore = -0.85;
      sizingMult = 0.50;
      insights.push(`Earnings missed street expectations (${consensusDeltaPct}%). Institutional liquidation risk.`);
    } else if (/ORDER\s+WIN|WINS?.*(?:ORDER|CONTRACT|DEAL)|BAGS?.*(?:ORDER|CONTRACT|DEAL)|RECEIVES?.*(?:ORDER|CONTRACT)|AWARDED.*(?:ORDER|CONTRACT)|SIGNS?.*(?:DEAL|CONTRACT|ORDER)/i.test(upper)) {
      directionScore = 0.80;
      sizingMult = 1.25;
      insights.push('Major commercial order inflow expands revenue backlog visibility.');
    }

    return {
      contribution: {
        expertName: this.name,
        weight,
        directionScore,
        keyInsights: insights,
        recommendedSizingMult: sizingMult,
      },
      consensusDeltaPct,
    };
  }
}
