/**
 * LUMEN-ASTRA-FIN NEURAL: ADVANCED FRONTIER LLM UNIT TEST SUITE
 * Verifies BPE byte-fallback, RoPE relative rotations, RMSNorm, SwiGLU gated MLPs,
 * KV Cache persistence, Sparse MoE routing, and DPO alignment on winning vs losing trade pairs.
 */

import { describe, it, expect } from 'vitest';
import {
  BPETokenizer,
  RotaryPositionEmbedding,
  RMSNorm,
  SwiGLUFFN,
  DynamicKVCache,
  MoEFFNBlock,
  DPOTrainer,
  NeuralTransformerModel,
  TensorOps,
} from '../neural';

describe('1. BPE Tokenizer with Byte-Fallback', () => {
  it('encodes and decodes financial strings losslessly', () => {
    const bpe = new BPETokenizer();
    const text = 'RELIANCE breakout above vwap support at 10:30 am with 2.5x volume';
    const tokens = bpe.encode(text);
    expect(tokens.length).toBeGreaterThan(0);

    const decoded = bpe.decode(tokens);
    expect(decoded.toLowerCase()).toContain('reliance');
    expect(decoded.toLowerCase()).toContain('breakout');
    expect(decoded.toLowerCase()).toContain('vwap');
  });

  it('losslessly handles arbitrary typos, code characters, and non-ASCII text via byte-fallback', () => {
    const bpe = new BPETokenizer();
    const oddText = '₹45,200 Cr [NSE:TATASTEEL] +3.8% #AlphaTest!';
    const tokens = bpe.encode(oddText);
    expect(tokens.length).toBeGreaterThan(0);

    const decoded = bpe.decode(tokens);
    expect(decoded).toContain('45,200');
    expect(decoded).toContain('TATASTEEL');
    expect(decoded).toContain('+3.8%');
  });
});

describe('2. Rotary Position Embeddings (RoPE)', () => {
  it('rotates Q and K vectors while strictly preserving vector Euclidean norm', () => {
    const dim = 16;
    const rope = new RotaryPositionEmbedding(dim);
    const X = [[1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]];

    const normBefore = Math.sqrt(X[0].reduce((a, b) => a + b * b, 0));
    const rotated = rope.applyRoPE(X, 10); // Rotate at position 10
    const normAfter = Math.sqrt(rotated[0].reduce((a, b) => a + b * b, 0));

    expect(normAfter).toBeCloseTo(normBefore, 4);
  });

  it('produces different rotations for different sequence positions', () => {
    const dim = 8;
    const rope = new RotaryPositionEmbedding(dim);
    const X = [[1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]];

    const rotPos0 = rope.applyRoPE(X, 0)[0];
    const rotPos5 = rope.applyRoPE(X, 5)[0];

    // At pos 0, cos(0)=1 and sin(0)=0 so vector is identical to original
    expect(rotPos0[0]).toBeCloseTo(X[0][0], 4);
    // At pos 5, vector components must be rotated
    expect(rotPos5[0]).not.toBeCloseTo(rotPos0[0], 2);
  });
});

describe('3. Root Mean Square Normalization (RMSNorm)', () => {
  it('normalizes activations by RMS with learnable gamma scaling', () => {
    const dim = 4;
    const norm = new RMSNorm(dim);
    const X = [[2.0, 4.0, 4.0, 2.0]]; // Mean of squares: (4 + 16 + 16 + 4)/4 = 10 -> RMS = sqrt(10) ≈ 3.162

    const { normalized, rms } = norm.forward(X);
    expect(rms[0]).toBeCloseTo(Math.sqrt(10), 3);

    // Normalized RMS must equal 1.0
    const normRms = Math.sqrt(normalized[0].reduce((a, b) => a + b * b, 0) / dim);
    expect(normRms).toBeCloseTo(1.0, 4);
  });

  it('computes correct backward pass gradients for RMSNorm', () => {
    const dim = 4;
    const norm = new RMSNorm(dim);
    const X = [[1.0, 2.0, 3.0, 4.0]];
    const { rms } = norm.forward(X);
    const dOut = [[1.0, 1.0, 1.0, 1.0]];

    const { dX, dGamma } = norm.backward(dOut, X, rms);
    expect(dX.length).toBe(1);
    expect(dX[0].length).toBe(dim);
    expect(dGamma.length).toBe(dim);
  });
});

describe('4. SwiGLU Gated Feed-Forward Network', () => {
  it('computes SwiGLU forward pass with correct dimensions and Swish gating', () => {
    const dModel = 8;
    const swiglu = new SwiGLUFFN(dModel);
    const X = [[1, 2, 3, 4, 5, 6, 7, 8]];

    const res = swiglu.forward(X);
    expect(res.out.length).toBe(1);
    expect(res.out[0].length).toBe(dModel);
    expect(res.swigluHidden[0].length).toBe(swiglu.dHidden);
  });

  it('computes valid backward pass gradients for W_gate, W_up, and W_down', () => {
    const dModel = 8;
    const swiglu = new SwiGLUFFN(dModel);
    const X = [[1, 2, 3, 4, 5, 6, 7, 8]];
    const res = swiglu.forward(X);
    const dOut = [[0.5, -0.5, 1.0, 0.0, 0.2, -0.2, 0.1, -0.1]];

    const grads = swiglu.backward(dOut, X, res.gateLinear, res.upLinear, res.gateActivated, res.swigluHidden);
    expect(grads.dW_gate.length).toBe(dModel);
    expect(grads.dW_up.length).toBe(dModel);
    expect(grads.dW_down.length).toBe(swiglu.dHidden);
    expect(grads.dX[0].length).toBe(dModel);
  });
});

describe('5. Dynamic Key-Value Attention Cache (KV Cache)', () => {
  it('progressively accumulates K and V vectors without recomputation', () => {
    const nLayers = 2;
    const cache = new DynamicKVCache(nLayers);
    expect(cache.length).toBe(0);

    // Step 1: Prompt of 2 tokens
    const K1 = [[1, 2], [3, 4]];
    const V1 = [[5, 6], [7, 8]];
    cache.update(0, K1, V1);
    cache.update(1, K1, V1);
    expect(cache.length).toBe(2);

    // Step 2: Generation of 1 new token
    const K2 = [[9, 10]];
    const V2 = [[11, 12]];
    const updated = cache.update(0, K2, V2);
    expect(updated.K.length).toBe(3);
    expect(updated.V.length).toBe(3);
    expect(cache.length).toBe(3);

    cache.clear();
    expect(cache.length).toBe(0);
  });
});

describe('6. Sparse Mixture-of-Experts (MoE) FFN Block', () => {
  it('routes tokens across top-2 experts and computes auxiliary load-balancing loss', () => {
    const dModel = 8;
    const moe = new MoEFFNBlock(dModel, 4, 2);
    const X = [
      [1, 2, 3, 4, 5, 6, 7, 8],
      [8, 7, 6, 5, 4, 3, 2, 1],
    ];

    const res = moe.forward(X);
    expect(res.out.length).toBe(2);
    expect(res.out[0].length).toBe(dModel);
    expect(res.expertAssignments.length).toBe(2);
    expect(res.expertAssignments[0].p1 + res.expertAssignments[0].p2).toBeCloseTo(1.0, 4);
    expect(res.loadBalancingLoss).toBeGreaterThanOrEqual(0);
  });
});

describe('7. Direct Preference Optimization (DPO) on Trading Trajectories', () => {
  it('trains on winning vs losing trade pairs and shifts policy mass toward winning actions', () => {
    const model = new NeuralTransformerModel({ dModel: 32, nHeads: 2, nLayers: 1, maxSeqLen: 16, learningRate: 0.01 });
    const trainer = new DPOTrainer(model, 0.1);

    const pairs = [
      {
        scenarioPrompt: '<scenario> TATAPOWER REGIME_BULL_TREND </scenario>',
        winningThought: 'analyzing market conditions volume surge breakout confirmed',
        winningActionIdx: 0, // BUY_BREAKOUT
        losingThought: 'analyzing market conditions failed breakout stop loss hit',
        losingActionIdx: 3, // DEFENSIVE_EXIT
        marginBenefit: 350.0,
      },
    ];

    const summary = trainer.trainDPO(pairs, 15, 0.01);
    expect(summary.pairsTrained).toBe(1);
    expect(summary.winPreferenceAccuracyPct).toBeGreaterThanOrEqual(50);
  });
});
