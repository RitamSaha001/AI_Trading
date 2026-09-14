/**
 * LUMEN-ASTRA-FIN 1.0: PROCESS REWARD MODEL (PRM) & VERIFICATION CRITIC
 * Step-by-step fact-checking and hallucination detection for trading decisions.
 */

import { Asset } from '../../../types';
import { PRMVerificationResult, PRMCritiqueStep } from '../types';

export class ProcessRewardCritic {
  /**
   * Evaluates the reasoning steps of the LLM trajectory and computes a step-level verification score.
   */
  public static verify(
    headline: string,
    matchedTickers: Asset[],
    proposedAction: string,
    compositeScore: number
  ): PRMVerificationResult {
    const steps: PRMCritiqueStep[] = [];
    let penalty = 0;
    const upper = headline.toUpperCase();

    // Step 1: Entity Grounding
    const hasEntities = matchedTickers.length > 0 || /NIFTY|MARKET|ECONOMY|RBI|INFLATION|SEBI|BROKER|FRAUD/i.test(upper);
    steps.push({
      stepNumber: 1,
      claim: `Identified target entities: ${matchedTickers.join(', ') || 'Macro Fleet'}`,
      isFactuallyGrounded: hasEntities,
      critiqueScore: hasEntities ? 1.0 : 0.4,
      reasoningFlawDetected: hasEntities ? undefined : 'Unanchored entity hallucination detected.',
    });
    if (!hasEntities) penalty += 0.3;

    // Step 2: Semantic Polarity & Contradiction Detection
    const hasNegativeWords = /FALLS?|DROPS?|SLUMPS?|MISSES?|PENALTY|BAN|SEBI|LOSS|CRASH/i.test(upper);
    const hasPositiveWords = /SURGES?|RISES?|BEATS?|ORDER\s+WIN|RECORD|EXPANDS?|HIGHEST/i.test(upper);
    let polarityValid = true;
    let flaw: string | undefined = undefined;

    if (hasNegativeWords && !hasPositiveWords && compositeScore > 25) {
      polarityValid = false;
      flaw = 'Severe Contradiction: Proposed bullish score on headline with exclusively negative events.';
      penalty += 0.5;
    } else if (hasPositiveWords && !hasNegativeWords && compositeScore < -25) {
      polarityValid = false;
      flaw = 'Severe Contradiction: Proposed bearish score on headline with exclusively positive events.';
      penalty += 0.5;
    }

    steps.push({
      stepNumber: 2,
      claim: `Evaluated semantic direction: score ${compositeScore >= 0 ? '+' : ''}${compositeScore}`,
      isFactuallyGrounded: polarityValid,
      critiqueScore: polarityValid ? 1.0 : 0.2,
      reasoningFlawDetected: flaw,
    });

    // Step 3: Proportionality of Proposed Action
    let actionValid = true;
    let actionFlaw: string | undefined = undefined;
    const isDefensiveAction = proposedAction === 'STAND_ASIDE' || proposedAction === 'DEFENSIVE_EXIT' || proposedAction === 'EMERGENCY_VETO';
    if (/SEBI|RAID|PENALTY|BAN|FRAUD|CRASH/i.test(upper) && !isDefensiveAction) {
      actionValid = false;
      actionFlaw = `Safety Hazard: Proposed non-defensive action '${proposedAction}' during active regulatory threat or fraud event.`;
      penalty += 0.5;
    } else if (proposedAction === 'STRONG_BUY' && compositeScore < 40) {
      actionValid = false;
      actionFlaw = 'Action Disproportion: STRONG_BUY recommended without sufficient alpha conviction score (>= 40).';
      penalty += 0.2;
    } else if (proposedAction === 'EMERGENCY_VETO' && compositeScore > -50) {
      actionValid = false;
      actionFlaw = 'False Alarm: EMERGENCY_VETO recommended without critical negative threshold (<= -50).';
      penalty += 0.2;
    }

    steps.push({
      stepNumber: 3,
      claim: `Validated operational action recommendation: ${proposedAction}`,
      isFactuallyGrounded: actionValid,
      critiqueScore: actionValid ? 1.0 : 0.5,
      reasoningFlawDetected: actionFlaw,
    });

    const overallConfidence = Math.max(0.0, Number((1.0 - penalty).toFixed(2)));
    const passed = overallConfidence >= 0.70;

    return {
      overallFactualConfidence: overallConfidence,
      passedVerification: passed,
      critiqueSteps: steps,
      hallucinationPenaltyApplied: penalty,
    };
  }
}
