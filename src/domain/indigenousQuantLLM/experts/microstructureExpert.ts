/**
 * LUMEN-ASTRA-FIN 1.0: EXPERT 4 - ORDER FLOW & MICROSTRUCTURE
 * Evaluates volume surges, block deals, institutional positioning, and liquidity absorption.
 */

import { ExpertContribution } from '../types';

export class MicrostructureExpert {
  public static readonly name = 'MicrostructureExpert';

  public static evaluate(headline: string, weight: number): ExpertContribution {
    const upper = headline.toUpperCase();
    let directionScore = 0;
    const insights: string[] = [];
    let sizingMult = 1.0;

    if (/BLOCK\s+DEAL|BULK\s+DEAL|INSTITUTIONAL\s+BUYING|FII\s+INFLOW/i.test(upper)) {
      directionScore = 0.65;
      sizingMult = 1.20;
      insights.push('Large institutional block deal signals institutional accumulation and liquidity floor.');
    } else if (/PROMOTER\s+SELLS?|OFFER\s+FOR\s+SALE|OFS|FII\s+SELLING/i.test(upper)) {
      directionScore = -0.55;
      sizingMult = 0.80;
      insights.push('Secondary supply overhang or institutional distribution detected.');
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
