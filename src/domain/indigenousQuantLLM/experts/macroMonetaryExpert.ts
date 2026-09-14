/**
 * LUMEN-ASTRA-FIN 1.0: EXPERT 1 - MACRO & MONETARY POLICY
 * Evaluates interest rate trajectories, liquidity, currency shocks, and inflation dynamics.
 */

import { ExpertContribution } from '../types';

export class MacroMonetaryExpert {
  public static readonly name = 'MacroMonetaryExpert';

  public static evaluate(headline: string, weight: number): ExpertContribution {
    const upper = headline.toUpperCase();
    let directionScore = 0;
    const insights: string[] = [];
    let sizingMult = 1.0;

    if (/RATE\s+CUT|DOVISH|LIQUIDITY\s+INJECTION|STIMULUS|CRR\s+CUT/i.test(upper)) {
      directionScore = 0.75;
      sizingMult = 1.20;
      insights.push('Dovish monetary accommodation expands equity valuation multiples and corporate borrowing power.');
    } else if (/RATE\s+HIKE|HAWKISH|INFLATION\s+SURGE|TIGHTENING/i.test(upper)) {
      directionScore = -0.65;
      sizingMult = 0.85;
      insights.push('Hawkish liquidity tightening compresses equity risk premia.');
    } else if (/RUPEE\s+FALLS?|RUPEE\s+HITS\s+RECORD\s+LOW|DEPRECIATION/i.test(upper)) {
      directionScore = 0.30; // IT / Exporters benefit
      insights.push('Rupee depreciation delivers margin tailwind for net export sectors (IT, Pharma).');
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
