/**
 * LUMEN-ASTRA-FIN 1.0: EXPERT 5 - CROSS-ASSET CONTAGION & COMMODITY MATRIX
 * Maps 2nd-order sector effects from commodities, FX, and global demand.
 */

import { ExpertContribution } from '../types';

export class CrossAssetContagionExpert {
  public static readonly name = 'CrossAssetContagionExpert';

  public static evaluate(headline: string, weight: number): ExpertContribution {
    const upper = headline.toUpperCase();
    let directionScore = 0;
    const insights: string[] = [];
    let sizingMult = 1.0;

    if (/CRUDE|BRENT|PETROL|DIESEL/i.test(upper)) {
      if (/SURGE|JUMP|SPIKE|CLIMB|HIGH/i.test(upper)) {
        directionScore = -0.50; // Net drag on Indian headline index (oil importer)
        insights.push('Elevated crude acts as systemic cost inflation across manufacturing, transport, and consumer sectors.');
      } else if (/FALL|DROP|SLUMP|EASE/i.test(upper)) {
        directionScore = 0.50;
        sizingMult = 1.15;
        insights.push('Crude decline provides broad margin relief for Indian domestic corporate consumers.');
      }
    } else if (/DEFEN[SC]E/i.test(upper)) {
      directionScore = 0.80;
      sizingMult = 1.25;
      insights.push('Indigenous defense procurement pipeline expansion directly benefits PSU defense contractors.');
    }

    return {
      expertName: this.name,
      weight,
      directionScore,
      keyInsights: insights,
      recommendedSizingMult: sizingMult,
    };
  }
}
