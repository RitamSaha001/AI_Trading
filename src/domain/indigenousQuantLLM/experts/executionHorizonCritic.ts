/**
 * LUMEN-ASTRA-FIN 1.0: EXPERT 6 - EXECUTION HORIZON & RUNNER CRITIC
 * Recommends optimal holding horizon and profit-target ATR expansion factor.
 */

import { ExpertContribution } from '../types';

export interface HorizonRecommendation {
  contribution: ExpertContribution;
  recommendedRunnerAtr: number; // e.g. 4.0 to 5.8 ATR
  expectedHoldingMins: number;   // e.g. 30 to 180 mins
}

export class ExecutionHorizonCritic {
  public static readonly name = 'ExecutionHorizonCritic';

  public static evaluate(headline: string, weight: number, compositeScore: number): HorizonRecommendation {
    const upper = headline.toUpperCase();
    let runnerAtr = 4.4; // Default balanced baseline
    let holdingMins = 90;
    const insights: string[] = [];

    // Major multi-year order wins or record blowout earnings warrant multi-ATR runners
    if (/ORDER\s+WIN|WINS?.*ORDER|BAGS?.*ORDER|CONTRACT|RECORD\s+PROFIT|ALL-TIME\s+HIGH|MEGA/i.test(upper) && compositeScore > 50) {
      runnerAtr = 5.6; // Expand runner target by ~25%
      holdingMins = 180;
      insights.push('Strong structural tailwind: expands Target 2 runner to 5.6 ATR with extended 180-minute holding horizon.');
    } else if (/SEBI|WARNING|PROBE|NOTICE|ED\s+RAID/i.test(upper) || compositeScore < -40) {
      runnerAtr = 2.0;
      holdingMins = 15;
      insights.push('High execution risk / adverse event: emergency exit priority with 0 holding tolerance.');
    }

    return {
      contribution: {
        expertName: this.name,
        weight,
        directionScore: compositeScore / 100,
        keyInsights: insights,
        recommendedSizingMult: compositeScore > 50 ? 1.25 : compositeScore < -30 ? 0.5 : 1.0,
      },
      recommendedRunnerAtr: runnerAtr,
      expectedHoldingMins: holdingMins,
    };
  }
}
