/**
 * LUMEN-ASTRA-FIN NEURAL: AUTO-REGRESSIVE REASONING GENERATOR
 * Generates chain-of-thought reasoning tokens and structured quant directives using temperature / nucleus sampling.
 */

import { NeuralTransformerModel } from './transformerModel';
import { DomainTokenizer, ACTION_TOKENS, EOS_TOKEN_ID, TOKEN_TO_ID } from './vocabulary';
import { GrammarLogitMask } from './grammarMask';
import { ProcessRewardCritic } from '../verification/prmCritic';

export interface GenerationOptions {
  maxNewTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  repetitionPenalty?: number;
  enableGrammarMask?: boolean;
  enableReflection?: boolean;
}

export const DEFAULT_GEN_OPTIONS: GenerationOptions = {
  maxNewTokens: 32,
  temperature: 0.7,
  topP: 0.9,
  topK: 20,
  repetitionPenalty: 1.35,
  enableGrammarMask: true,
  enableReflection: true,
};

export interface AstraFinNeuralInference {
  promptText: string;
  generatedThought: string;
  predictedAction: string;
  policyConfidence: number; // 0.0 - 1.0
  policyEntropy: number; // Shannon entropy in bits
  expectedReturnValue: number; // -1.0 to 1.0
  suggestedRiskMultiplier: number;
  recommendedRunnerAtr: number;
  tokensGeneratedCount: number;
  inferenceLatencyMs: number;
  hasReflected?: boolean;
  reflectionNote?: string;
  candidateRankScore?: number;
}

export class AstraFinGenerator {
  public model: NeuralTransformerModel;
  private grammarMask: GrammarLogitMask;

  constructor(model: NeuralTransformerModel) {
    this.model = model;
    this.grammarMask = new GrammarLogitMask();
  }

  /**
   * Generates step-by-step reasoning tokens auto-regressively with grammar constraints & test-time reflection.
   */
  public generate(promptText: string, options: GenerationOptions = {}): AstraFinNeuralInference {
    const startTime = performance.now();
    const opts = { ...DEFAULT_GEN_OPTIONS, ...options };
    const promptTokens = DomainTokenizer.encode(promptText);
    const tokens = [...promptTokens];
    const newTokens: number[] = [];

    const stopTokenId1 = EOS_TOKEN_ID;
    const stopTokenId2 = TOKEN_TO_ID['</action>'] ?? -1;
    const stopTokenId3 = TOKEN_TO_ID['</verdict>'] ?? -1;

    for (let step = 0; step < (opts.maxNewTokens || 32); step++) {
      if (tokens.length >= this.model.config.maxSeqLen) break;

      const cache = this.model.forward(tokens);
      const T = cache.seqLen;
      let logits = [...cache.lmLogits[T - 1]];

      // Optional Grammar-Constrained Logit Masking
      if (opts.enableGrammarMask) {
        const state = this.grammarMask.detectState(tokens, (id) => DomainTokenizer.decode([id]));
        logits = this.grammarMask.applyMask(logits, state);
      }

      // Repetition Penalty to prevent degenerate token loops
      const repPenalty = opts.repetitionPenalty ?? 1.35;
      if (repPenalty > 1.0) {
        const recentTokens = new Set(tokens.slice(-16));
        for (const prevTok of recentTokens) {
          if (logits[prevTok] !== undefined && logits[prevTok] > -1e8) {
            if (logits[prevTok] > 0) {
              logits[prevTok] /= repPenalty;
            } else {
              logits[prevTok] *= repPenalty;
            }
          }
        }
      }

      // Sample next token ID using temperature & top-p
      const nextTokenId = this.sampleNextToken(logits, opts.temperature ?? 0.7, opts.topP ?? 0.9, opts.topK ?? 20);

      tokens.push(nextTokenId);
      newTokens.push(nextTokenId);

      if (
        nextTokenId === stopTokenId1 ||
        (stopTokenId2 !== -1 && nextTokenId === stopTokenId2) ||
        (stopTokenId3 !== -1 && nextTokenId === stopTokenId3)
      ) {
        break;
      }
    }

    // Run final evaluation on the generated sequence to get policy & value heads
    let finalCache = this.model.forward(tokens);

    // Extract Policy Action
    let { predictedAction, policyConfidence } = this.extractPolicyAction(finalCache.policyProbs);
    let expectedReturnValue = Number(finalCache.valuePred.toFixed(3));
    let hasReflected = false;
    let reflectionNote: string | undefined;

    // DeepSeek-R1 Style Dynamic Test-Time Compute & Backtracking Reflection
    if (opts.enableReflection) {
      const prm = ProcessRewardCritic.verify(promptText, [], predictedAction, expectedReturnValue * 100);
      if (!prm.passedVerification) {
        hasReflected = true;
        reflectionNote = prm.critiqueSteps.find((s) => s.reasoningFlawDetected)?.reasoningFlawDetected || 'Contradiction detected';
        
        // Inject reflection tokens and self-correct action to safe defense
        const reflectionText = ` <reflection> ${reflectionNote} - Auto-correcting to STAND_ASIDE </reflection> <action> STAND_ASIDE </action>`;
        const reflectionTokens = DomainTokenizer.encode(reflectionText);
        for (const rTok of reflectionTokens) {
          if (tokens.length < this.model.config.maxSeqLen) {
            tokens.push(rTok);
            newTokens.push(rTok);
          }
        }
        finalCache = this.model.forward(tokens);
        predictedAction = 'STAND_ASIDE';
        policyConfidence = 0.95;
        expectedReturnValue = 0.0;
      }
    }

    // Dynamic Sizing based on Value & Policy Confidence
    let suggestedRiskMultiplier = 1.0;
    if (predictedAction === 'BUY_BREAKOUT' && expectedReturnValue > 0.3) {
      suggestedRiskMultiplier = 1.25;
    } else if (predictedAction === 'VWAP_PULLBACK' || predictedAction === 'ACCUMULATE') {
      suggestedRiskMultiplier = 1.10;
    } else if (predictedAction === 'DEFENSIVE_EXIT' || predictedAction === 'EMERGENCY_VETO' || predictedAction === 'STAND_ASIDE') {
      suggestedRiskMultiplier = 0.0;
    } else if (
      predictedAction === 'ASSESS_FUNDAMENTALS' ||
      predictedAction === 'QUANT_VERIFIED' ||
      predictedAction === 'VERIFIED_SAFE' ||
      predictedAction === 'COMMUNICATE'
    ) {
      suggestedRiskMultiplier = 1.0;
    }

    const recommendedRunnerAtr = expectedReturnValue > 0.5 ? 4.5 : 2.5;
    const generatedThought = DomainTokenizer.decode(newTokens);
    const latency = Number((performance.now() - startTime).toFixed(2));
    const policyEntropy = finalCache.policyEntropy;

    return {
      promptText,
      generatedThought,
      predictedAction,
      policyConfidence,
      policyEntropy,
      expectedReturnValue,
      suggestedRiskMultiplier,
      recommendedRunnerAtr,
      tokensGeneratedCount: newTokens.length,
      inferenceLatencyMs: latency,
      hasReflected,
      reflectionNote,
    };
  }

  /**
   * OpenAI o1 / DeepSeek-R1 Style Best-of-N Policy Rollouts (MCTS-style Search).
   * Generates N candidate trajectories with slight temperature exploration and reranks by composite value.
   */
  public generateBestOfN(
    promptText: string,
    nCandidates: number = 3,
    options: GenerationOptions = {}
  ): AstraFinNeuralInference & { candidates: AstraFinNeuralInference[]; bestIndex: number; rolloutsEvaluated: number } {
    const candidates: AstraFinNeuralInference[] = [];
    const baseTemp = options.temperature ?? 0.7;

    for (let i = 0; i < nCandidates; i++) {
      // Mild temperature jitter per rollout
      const temp = Math.max(0.2, baseTemp + (i - Math.floor(nCandidates / 2)) * 0.15);
      const cand = this.generate(promptText, { ...options, temperature: temp });
      
      // Score trajectory: Expected Return (weight: 1.5) + Confidence (weight: 1.0) - Entropy penalty (weight: 0.2)
      const rankScore = cand.expectedReturnValue * 1.5 + cand.policyConfidence - cand.policyEntropy * 0.2;
      cand.candidateRankScore = Number(rankScore.toFixed(3));
      candidates.push(cand);
    }

    // Sort descending by candidateRankScore
    candidates.sort((a, b) => (b.candidateRankScore ?? 0) - (a.candidateRankScore ?? 0));
    const best = candidates[0];

    return {
      ...best,
      candidates,
      bestIndex: 0,
      rolloutsEvaluated: nCandidates,
    };
  }

  private extractPolicyAction(policyProbs: number[]): { predictedAction: string; policyConfidence: number } {
    let bestActIdx = 0;
    let bestActProb = -1;
    for (let a = 0; a < policyProbs.length; a++) {
      if (policyProbs[a] > bestActProb) {
        bestActProb = policyProbs[a];
        bestActIdx = a;
      }
    }
    return {
      predictedAction: ACTION_TOKENS[bestActIdx] || 'STAND_ASIDE',
      policyConfidence: Number(bestActProb.toFixed(3)),
    };
  }

  /**
   * Temperature, Top-K, and Nucleus (Top-P) token sampling.
   */
  private sampleNextToken(logits: number[], temperature: number, topP: number, topK: number): number {
    // Suppress special structural tokens from being generated as text
    logits[0] = -Infinity; // <pad>
    logits[1] = -Infinity; // <bos>
    logits[3] = -Infinity; // <unk>

    // Greedy fallback if temperature is extremely low
    if (temperature < 0.05) {
      let maxIdx = 0;
      let maxVal = -Infinity;
      for (let i = 0; i < logits.length; i++) {
        if (logits[i] > maxVal) {
          maxVal = logits[i];
          maxIdx = i;
        }
      }
      return maxIdx;
    }

    // Apply Temperature
    const scaled = logits.map((l) => l / temperature);
    const maxVal = Math.max(...scaled);
    const exps = scaled.map((s) => Math.exp(s - maxVal));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map((e) => e / (sumExps || 1));

    // Sort indices by probability descending for Top-K & Top-P filtering
    const indexed = probs.map((p, i) => ({ prob: p, id: i })).sort((a, b) => b.prob - a.prob);

    // Filter Top-K
    const topKItems = indexed.slice(0, Math.min(topK, indexed.length));

    // Filter Top-P (Nucleus)
    let cumSum = 0;
    const nucleus: { prob: number; id: number }[] = [];
    for (const item of topKItems) {
      nucleus.push(item);
      cumSum += item.prob;
      if (cumSum >= topP) break;
    }

    // Re-normalize nucleus probabilities
    const nucleusSum = nucleus.reduce((acc, it) => acc + it.prob, 0);
    const r = Math.random() * nucleusSum;
    let running = 0;
    for (const item of nucleus) {
      running += item.prob;
      if (r <= running) {
        return item.id;
      }
    }

    return nucleus[0]?.id ?? 0;
  }
}
