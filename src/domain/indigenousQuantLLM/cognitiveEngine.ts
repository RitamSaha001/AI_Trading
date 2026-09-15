/**
 * LUMEN-ASTRA-FIN 1.0: DUAL-SPEED COGNITIVE ORCHESTRATOR
 * Unifies System 1 (Sub-millisecond Reflex) and System 2 (Deep Causal Deliberation).
 */

import { Asset } from '../../types';
import {
  AstraFinDirective,
  AstraFinReasoningTrajectory,
  ModelActionDirective,
  ExpertContribution,
} from './types';
import { FinancialTokenizer } from './tokenizer/financialTokenizer';
import { FinancialGraphEngine } from './causalGraph/financialGraph';
import { MoERouter } from './experts/moeRouter';
import { MacroMonetaryExpert } from './experts/macroMonetaryExpert';
import { EarningsSurpriseExpert } from './experts/earningsSurpriseExpert';
import { RegulatoryForensicExpert } from './experts/regulatoryForensicExpert';
import { MicrostructureExpert } from './experts/microstructureExpert';
import { CrossAssetContagionExpert } from './experts/crossAssetContagionExpert';
import { ExecutionHorizonCritic } from './experts/executionHorizonCritic';
import { ProcessRewardCritic } from './verification/prmCritic';
import { UncertaintyCalibrator } from './verification/uncertaintyCalibrator';

export class AstraFinCognitiveEngine {
  /**
   * System 1: Sub-millisecond Reflex Gate (< 0.1 ms)
   * Synchronous circuit breaker for SEBI raids, regulatory bans, and immediate disaster exits.
   */
  public static reflexGuard(headline: string): { hasEmergencyVeto: boolean; reason?: string } {
    if (!headline || typeof headline !== 'string') {
      return { hasEmergencyVeto: false };
    }
    const upper = headline.toUpperCase();

    if (/SEBI\s+(?:BAN|ORDER|RAID|PENALTY|PROBE|NOTICE|SEARCH|SEIZURE|INVESTIGATION)|SEARCH\s+(?:AND|&)\s+SEIZURE|ED\s+RAID|CBI\s+PROBE|ACCOUNTING\s+FRAUD|FORENSIC\s+AUDIT/i.test(upper)) {
      return {
        hasEmergencyVeto: true,
        reason: `[Lumen-Astra System 1 Reflex Veto] Severe regulatory/forensic enforcement action detected: "${headline}"`,
      };
    }

    if (/(?:USFDA|FDA).*(?:IMPORT\s+ALERT|WARNING\s+LETTER)/i.test(upper)) {
      return {
        hasEmergencyVeto: true,
        reason: `[Lumen-Astra System 1 Reflex Veto] USFDA compliance disaster (Import Alert / Warning Letter): "${headline}"`,
      };
    }

    return { hasEmergencyVeto: false };
  }

  /**
   * System 2: Deep Causal Deliberation Pipeline
   * Multi-step test-time compute with MoE routing, causal graph contagion, and PRM verification.
   */
  public static deliberate(headline: string, now: number = Date.now()): AstraFinDirective[] {
    if (!headline || typeof headline !== 'string') {
      return [];
    }
    const startTime = performance.now();
    const matchedTickers = FinancialTokenizer.extractAssets(headline);
    const upper = headline.toUpperCase();

    // 1. Fast Reflex Check
    const reflex = this.reflexGuard(headline);
    if (reflex.hasEmergencyVeto && matchedTickers.length > 0) {
      return matchedTickers.map((sym) => ({
        symbol: sym,
        hasEmergencyVeto: true,
        hasAlphaCatalyst: false,
        action: 'EMERGENCY_VETO',
        aciBoost: 0,
        riskMultiplier: 0.0,
        runnerAtrMultiplier: 2.0,
        uncertaintySigma: 0.05,
        confidenceScore: 98,
        rationale: reflex.reason || 'Emergency System 1 Regulatory Veto.',
        publishedAt: now,
      }));
    }

    // 2. MoE Routing across 6 Financial Expert Heads
    const { weights, topExperts } = MoERouter.route(headline);
    const contributions: ExpertContribution[] = [];
    const expertScores: number[] = [];

    // Evaluate Expert 1: Macro & Monetary
    const macroRes = MacroMonetaryExpert.evaluate(headline, weights.macroMonetary);
    contributions.push(macroRes);
    if (macroRes.directionScore !== 0) expertScores.push(macroRes.directionScore);

    // Evaluate Expert 2: Earnings Surprise Delta
    const earningsRes = EarningsSurpriseExpert.evaluate(headline, weights.earningsSurprise);
    contributions.push(earningsRes.contribution);
    if (earningsRes.contribution.directionScore !== 0) expertScores.push(earningsRes.contribution.directionScore);

    // Evaluate Expert 3: Regulatory & Forensic Law
    const regRes = RegulatoryForensicExpert.evaluate(headline, weights.regulatoryForensic);
    contributions.push(regRes.contribution);
    if (regRes.contribution.directionScore !== 0) expertScores.push(regRes.contribution.directionScore);

    // Evaluate Expert 4: Order Flow Microstructure
    const microRes = MicrostructureExpert.evaluate(headline, weights.microstructure);
    contributions.push(microRes);
    if (microRes.directionScore !== 0) expertScores.push(microRes.directionScore);

    // Evaluate Expert 5: Cross-Asset Contagion & Commodities
    const contagionRes = CrossAssetContagionExpert.evaluate(headline, weights.crossAssetContagion);
    contributions.push(contagionRes);
    if (contagionRes.directionScore !== 0) expertScores.push(contagionRes.directionScore);

    // Compute Intermediate Composite Direction Score (-100 to +100)
    let weightedSum = 0;
    let totalWeight = 0;
    for (const c of contributions) {
      weightedSum += c.directionScore * c.weight;
      totalWeight += c.weight;
    }
    const rawScore = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
    const compositeScore = Number(rawScore.toFixed(1));

    // Evaluate Expert 6: Execution Horizon Critic
    const horizonRes = ExecutionHorizonCritic.evaluate(headline, weights.executionHorizon, compositeScore);
    contributions.push(horizonRes.contribution);

    // 3. Causal Financial Graph Traversal (2nd-Order Sector Ripples)
    const graphImpacts = FinancialGraphEngine.evaluateContagion(headline, matchedTickers);
    const contagionEffectsRecord: Record<string, number> = {};
    for (const [asset, imp] of graphImpacts.entries()) {
      contagionEffectsRecord[asset] = imp.netImpactScore;
    }

    // 4. Determine Proposed Action & Sizing
    let proposedAction: ModelActionDirective = 'NEUTRAL';
    let aciBonus = 0;
    let riskMultiplier = 1.0;
    let hasCatalyst = false;
    let hasVeto = false;

    if (regRes.isCriticalEmergencyVeto || compositeScore <= -60) {
      proposedAction = 'EMERGENCY_VETO';
      hasVeto = true;
      riskMultiplier = 0.0;
    } else if (compositeScore >= 45) {
      proposedAction = 'STRONG_BUY';
      hasCatalyst = true;
      aciBonus = compositeScore >= 70 ? 14 : compositeScore >= 55 ? 11 : 8;
      riskMultiplier = 1.25;
    } else if (compositeScore >= 20) {
      proposedAction = 'ACCUMULATE';
      hasCatalyst = true;
      aciBonus = 6;
      riskMultiplier = 1.10;
    } else if (compositeScore <= -25) {
      proposedAction = 'STAND_ASIDE';
      hasVeto = true;
      riskMultiplier = 0.0;
    }

    // 5. Process Reward Model (PRM) Verification & Hallucination Defense
    const prmResult = ProcessRewardCritic.verify(headline, matchedTickers, proposedAction, compositeScore);
    if (!prmResult.passedVerification) {
      // PRM caught a reasoning contradiction or hallucination: downgrade to safe defense
      proposedAction = 'STAND_ASIDE';
      aciBonus = 0;
      hasCatalyst = false;
    }

    // 6. Epistemic Uncertainty Estimation (Sigma)
    const uncertaintySigma = UncertaintyCalibrator.calibrate(headline, expertScores);
    // If uncertainty is elevated, scale down risk multiplier
    if (uncertaintySigma > 0.40 && riskMultiplier > 1.0) {
      riskMultiplier = Number((riskMultiplier * (1.0 - (uncertaintySigma - 0.40))).toFixed(2));
    }

    const latencyMs = Number((performance.now() - startTime).toFixed(2));

    // Compile Deliberation Thought Trace
    const deliberationTokens = [
      `<thought> Routing headline to top experts: ${topExperts.join(', ')}</thought>`,
      `<causal_synthesis> Composite financial direction score: ${compositeScore}/100 (Uncertainty σ: ${uncertaintySigma})</causal_synthesis>`,
      `<prm_critique> PRM factual confidence: ${(prmResult.overallFactualConfidence * 100).toFixed(0)}% (Passed: ${prmResult.passedVerification})</prm_critique>`,
      `<action_verdict> Final action: ${proposedAction} | ACI bonus: +${aciBonus} | Runner ATR: ${horizonRes.recommendedRunnerAtr}x</action_verdict>`,
    ];

    const trajectory: AstraFinReasoningTrajectory = {
      rawInputHeadline: headline,
      matchedTickers,
      systemTier: 'SYSTEM_2_DELIBERATION',
      inferenceLatencyMs: latencyMs,
      deliberationTokens,
      causalChains: contributions.flatMap((c) => c.keyInsights),
      routerWeights: weights,
      activeExperts: topExperts,
      expertOutputs: contributions,
      consensusDeltaPct: earningsRes.consensusDeltaPct,
      contagionEffects: contagionEffectsRecord,
      prmVerification: prmResult,
      uncertaintySigma,
      action: proposedAction,
      compositeScore,
      aciBonus,
      riskMultiplier,
      runnerAtrTarget: horizonRes.recommendedRunnerAtr,
      rationale: contributions.flatMap((c) => c.keyInsights).slice(0, 2).join(' | ') || `Lumen-Astra: ${proposedAction}`,
    };

    // Target Directives: Apply to matched direct tickers
    const directives: AstraFinDirective[] = [];
    const directSet = new Set<Asset>(matchedTickers);

    for (const sym of matchedTickers) {
      directives.push({
        symbol: sym,
        hasEmergencyVeto: hasVeto,
        hasAlphaCatalyst: hasCatalyst,
        action: proposedAction,
        aciBoost: aciBonus,
        riskMultiplier,
        runnerAtrMultiplier: horizonRes.recommendedRunnerAtr,
        uncertaintySigma,
        confidenceScore: Math.round(prmResult.overallFactualConfidence * 100),
        rationale: trajectory.rationale,
        publishedAt: now,
        reasoningTrace: trajectory,
      });
    }

    // Also generate 2nd-order contagion directives for affected supply-chain peers
    for (const [affAsset, contagion] of graphImpacts.entries()) {
      if (!directSet.has(affAsset)) {
        const isPeerPositive = contagion.netImpactScore > 0.30;
        const isPeerNegative = contagion.netImpactScore < -0.30;
        directives.push({
          symbol: affAsset,
          hasEmergencyVeto: isPeerNegative,
          hasAlphaCatalyst: isPeerPositive,
          action: isPeerPositive ? 'ACCUMULATE' : isPeerNegative ? 'STAND_ASIDE' : 'NEUTRAL',
          aciBoost: isPeerPositive ? 7 : 0,
          riskMultiplier: isPeerPositive ? 1.15 : isPeerNegative ? 0.0 : 1.0,
          runnerAtrMultiplier: 4.4,
          uncertaintySigma: Number((uncertaintySigma + 0.15).toFixed(2)), // Peer contagion has slightly higher uncertainty
          confidenceScore: Math.round(prmResult.overallFactualConfidence * 85),
          rationale: `[2nd-Order Contagion] ${contagion.mechanism} (Elasticity: ${contagion.elasticityBeta})`,
          publishedAt: now,
        });
      }
    }

    return directives;
  }
}
