/**
 * LUMEN-ASTRA-FIN FRONTIER CAPABILITIES TEST SUITE
 * Validates frontier LLM features:
 * 1. NTK-aware RoPE context expansion (LLaMA 3.1 / CodeLlama style).
 * 2. Grammar-constrained logit masking (SGLang / Outlines style).
 * 3. DeepSeek-R1 style test-time reflection and self-correction.
 * 4. OpenAI o1 style Best-of-N policy rollouts and reranking.
 * 5. Sparse MoE Top-2 routing inside the transformer backbone.
 * 6. Epistemic uncertainty via Shannon entropy of policy logits.
 */

import { describe, it, expect } from 'vitest';
import {
  RotaryPositionEmbedding,
  GrammarLogitMask,
  NeuralTransformerModel,
  AstraFinGenerator,
  DomainTokenizer,
  ACTION_TOKENS,
} from '../neural';

describe('Frontier LLM Capabilities: Lumen-Astra-Fin 2.0', () => {
  describe('1. NTK-Aware RoPE Context Expansion', () => {
    it('dynamically rescales frequencies for long context windows', () => {
      const rope = new RotaryPositionEmbedding(64, 64, 10000.0, 1.0);
      expect(rope.maxSeqLen).toBe(64);
      expect(rope.scalingFactor).toBe(1.0);

      // Expand context dynamically to 256 tokens using NTK scaling
      rope.ensureCapacity(256);
      expect(rope.maxSeqLen).toBeGreaterThanOrEqual(256);
      expect(rope.scalingFactor).toBeGreaterThan(1.0);

      // Verify that applying RoPE to a 128-token matrix preserves vector norms
      const testMat = Array.from({ length: 128 }, () => Array.from({ length: 64 }, () => 1.0));
      const rotated = rope.applyRoPE(testMat, 0);
      expect(rotated.length).toBe(128);
      expect(rotated[0].length).toBe(64);

      // Check norm preservation on first token pair
      const origNorm = Math.hypot(testMat[0][0], testMat[0][1]);
      const rotNorm = Math.hypot(rotated[0][0], rotated[0][1]);
      expect(rotNorm).toBeCloseTo(origNorm, 5);
    });
  });

  describe('2. Grammar & Schema-Constrained Logit Masking', () => {
    it('masks out invalid tokens during action emission', () => {
      const mask = new GrammarLogitMask();
      const mockTokens = DomainTokenizer.encode('<scenario> RELIANCE BREAKOUT </scenario> <action>');
      const state = mask.detectState(mockTokens, (id) => DomainTokenizer.decode([id]));
      expect(state).toBe('ACTION_SELECTION');

      const rawLogits = new Array(DomainTokenizer.vocabSize).fill(1.0);
      const masked = mask.applyMask(rawLogits, state);

      // Action tokens should remain unmasked (1.0)
      const buyBreakoutId = DomainTokenizer.encode('BUY_BREAKOUT')[0];
      expect(masked[buyBreakoutId]).toBe(1.0);

      // Non-action tokens (e.g. random text, special tokens) should be set to -1e9
      const scenarioTagId = DomainTokenizer.encode('<scenario>')[0];
      expect(masked[scenarioTagId]).toBe(-1e9);
    });
  });

  describe('3. DeepSeek-R1 Style Dynamic Reflection & Backtracking', () => {
    it('detects reasoning contradictions and self-corrects action to safe defense', () => {
      const model = new NeuralTransformerModel({ dModel: 32, nHeads: 2, nLayers: 1, maxSeqLen: 48 });
      const generator = new AstraFinGenerator(model);

      // Input headline with severe regulatory threat where a naive guess would be hazardous
      const severeThreat = 'SEBI raids broker offices, imposes total ban and freezes funds amid massive accounting fraud';
      const inference = generator.generate(severeThreat, { enableReflection: true, maxNewTokens: 16 });

      expect(inference).toBeDefined();
      expect(['STAND_ASIDE', 'EMERGENCY_VETO', 'DEFENSIVE_EXIT']).toContain(inference.predictedAction);
      expect(inference.suggestedRiskMultiplier).toBe(0.0);
    });
  });

  describe('4. OpenAI o1 Style Best-of-N Policy Rollouts', () => {
    it('generates N candidate trajectories and selects the optimal path', () => {
      const model = new NeuralTransformerModel({ dModel: 32, nHeads: 2, nLayers: 1, maxSeqLen: 48 });
      const generator = new AstraFinGenerator(model);

      const prompt = '<scenario> TATAPOWER REGIME_BULL_TREND ACI_EXEMPLARY_85_PLUS ABOVE_VWAP </scenario>';
      const rolloutResult = generator.generateBestOfN(prompt, 3, { maxNewTokens: 16 });

      expect(rolloutResult.rolloutsEvaluated).toBe(3);
      expect(rolloutResult.candidates.length).toBe(3);
      expect(rolloutResult.predictedAction).toBeDefined();
      expect(ACTION_TOKENS).toContain(rolloutResult.predictedAction);
      expect(typeof rolloutResult.candidateRankScore).toBe('number');
      // The best candidate score should be >= other candidate scores
      expect(rolloutResult.candidates[0].candidateRankScore).toBeGreaterThanOrEqual(
        rolloutResult.candidates[1].candidateRankScore ?? -Infinity
      );
    });
  });

  describe('5. Sparse Mixture-of-Experts (MoE) in Transformer Backbone', () => {
    it('initializes and executes forward pass with Top-2 MoE routing and auxiliary loss', () => {
      const moeModel = new NeuralTransformerModel({
        dModel: 32,
        nHeads: 2,
        nLayers: 2,
        maxSeqLen: 32,
        useMoE: true,
        nExperts: 4,
      });

      expect(moeModel.moeBlocks).toBeDefined();
      expect(moeModel.moeBlocks?.length).toBe(2);

      const tokens = DomainTokenizer.encode('<scenario> RELIANCE REGIME_BULL_TREND </scenario>');
      const cache = moeModel.forward(tokens);

      expect(cache.seqLen).toBe(tokens.length);
      expect(cache.policyProbs.length).toBe(ACTION_TOKENS.length);
      expect(cache.moeLoadBalancingLoss).toBeDefined();
      expect(cache.moeLoadBalancingLoss).toBeGreaterThanOrEqual(0);
      expect(cache.policyEntropy).toBeGreaterThanOrEqual(0);
    });
  });

  describe('6. Epistemic Shannon Entropy Calibration', () => {
    it('computes exact Shannon entropy in bits', () => {
      // Uniform probability across 4 states = log2(4) = 2 bits
      const uniformProbs = [0.25, 0.25, 0.25, 0.25];
      const entropy = NeuralTransformerModel.computeShannonEntropy(uniformProbs);
      expect(entropy).toBeCloseTo(2.0, 2);

      // Deterministic certainty (p=1.0 for state 0) = 0 bits
      const certainProbs = [1.0, 0.0, 0.0, 0.0];
      const certainEntropy = NeuralTransformerModel.computeShannonEntropy(certainProbs);
      expect(certainEntropy).toBeCloseTo(0.0, 2);
    });
  });
});
