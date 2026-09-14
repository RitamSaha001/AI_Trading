/**
 * LUMEN-ASTRA-FIN NEURAL: TRANSFORMER ARCHITECTURE
 * Sovereign Decoder-only Multi-Head Self-Attention Transformer LLM.
 * Implements Causal Masking, Dual LM/Policy/Value Heads, and Analytical Backpropagation.
 */

import { TensorOps, Matrix, Vector } from './tensor';
import { VOCAB_SIZE, ACTION_TOKENS } from './vocabulary';
import { MoEFFNBlock } from './moeBlock';

export interface TransformerConfig {
  vocabSize: number;
  dModel: number;
  nHeads: number;
  nLayers: number;
  maxSeqLen: number;
  nActions: number;
  learningRate: number;
  weightDecay: number;
  useMoE?: boolean;
  nExperts?: number;
}

export const DEFAULT_TRANSFORMER_CONFIG: TransformerConfig = {
  vocabSize: VOCAB_SIZE,
  dModel: 64,
  nHeads: 4,
  nLayers: 2,
  maxSeqLen: 64,
  nActions: ACTION_TOKENS.length,
  learningRate: 0.001,
  weightDecay: 0.01,
  useMoE: false,
  nExperts: 4,
};

export interface TransformerLayerWeights {
  W_q: Matrix; // [dModel x dModel]
  W_k: Matrix; // [dModel x dModel]
  W_v: Matrix; // [dModel x dModel]
  W_o: Matrix; // [dModel x dModel]
  W_1: Matrix; // [dModel x (4 * dModel)]
  b_1: Vector; // [4 * dModel]
  W_2: Matrix; // [(4 * dModel) x dModel]
  b_2: Vector; // [dModel]
}

export interface TransformerLayerGradients {
  dW_q: Matrix;
  dW_k: Matrix;
  dW_v: Matrix;
  dW_o: Matrix;
  dW_1: Matrix;
  db_1: Vector;
  dW_2: Matrix;
  db_2: Vector;
}

export interface ForwardCache {
  tokens: number[];
  seqLen: number;
  embeddings: Matrix; // [T x dModel]
  layerInputs: Matrix[];
  layerAttnOutputs: Matrix[];
  layerFfnInputs: Matrix[];
  layerFfnHiddens: Matrix[];
  layerFfnOutputs: Matrix[];
  finalHidden: Matrix; // [T x dModel]
  lmLogits: Matrix; // [T x vocabSize]
  lmProbs: Matrix;
  policyLogits: Vector; // [nActions]
  policyProbs: Vector;
  policyEntropy: number; // Shannon entropy in bits
  valuePred: number;
  moeLoadBalancingLoss?: number;
}

export class NeuralTransformerModel {
  public config: TransformerConfig;
  public W_emb: Matrix; // [vocabSize x dModel]
  public W_pos: Matrix; // [maxSeqLen x dModel]
  public layers: TransformerLayerWeights[];
  public moeBlocks?: MoEFFNBlock[];
  public W_lm: Matrix; // [dModel x vocabSize]
  public W_policy: Matrix; // [dModel x nActions]
  public W_value: Matrix; // [dModel x 1]

  // AdamW Optimizer State
  private m_W_emb: Matrix;
  private v_W_emb: Matrix;
  private m_layers: TransformerLayerWeights[];
  private v_layers: TransformerLayerWeights[];
  private m_W_lm: Matrix;
  private v_W_lm: Matrix;
  private m_W_policy: Matrix;
  private v_W_policy: Matrix;
  private m_W_value: Matrix;
  private v_W_value: Matrix;
  private optimizerStep: number = 0;

  constructor(config: Partial<TransformerConfig> = {}) {
    this.config = { ...DEFAULT_TRANSFORMER_CONFIG, ...config };
    const { vocabSize, dModel, maxSeqLen, nLayers, nActions } = this.config;

    // Initialize Embedding Tables
    this.W_emb = TensorOps.randomMatrix(vocabSize, dModel, 0.05);
    this.W_pos = TensorOps.randomMatrix(maxSeqLen, dModel, 0.05);

    // Initialize Layers
    this.layers = [];
    for (let l = 0; l < nLayers; l++) {
      this.layers.push({
        W_q: TensorOps.randomMatrix(dModel, dModel),
        W_k: TensorOps.randomMatrix(dModel, dModel),
        W_v: TensorOps.randomMatrix(dModel, dModel),
        W_o: TensorOps.randomMatrix(dModel, dModel),
        W_1: TensorOps.randomMatrix(dModel, 4 * dModel),
        b_1: new Array(4 * dModel).fill(0),
        W_2: TensorOps.randomMatrix(4 * dModel, dModel),
        b_2: new Array(dModel).fill(0),
      });
    }

    // Initialize MoE blocks if enabled
    if (this.config.useMoE) {
      this.moeBlocks = [];
      for (let l = 0; l < nLayers; l++) {
        this.moeBlocks.push(new MoEFFNBlock(dModel, this.config.nExperts || 4, 2));
      }
    }

    // Initialize Heads
    this.W_lm = TensorOps.randomMatrix(dModel, vocabSize, 0.05);
    this.W_policy = TensorOps.randomMatrix(dModel, nActions, 0.05);
    this.W_value = TensorOps.randomMatrix(dModel, 1, 0.05);

    // Initialize AdamW Moments
    this.m_W_emb = TensorOps.zeros(vocabSize, dModel);
    this.v_W_emb = TensorOps.zeros(vocabSize, dModel);
    this.m_W_lm = TensorOps.zeros(dModel, vocabSize);
    this.v_W_lm = TensorOps.zeros(dModel, vocabSize);
    this.m_W_policy = TensorOps.zeros(dModel, nActions);
    this.v_W_policy = TensorOps.zeros(dModel, nActions);
    this.m_W_value = TensorOps.zeros(dModel, 1);
    this.v_W_value = TensorOps.zeros(dModel, 1);

    this.m_layers = [];
    this.v_layers = [];
    for (let l = 0; l < nLayers; l++) {
      this.m_layers.push({
        W_q: TensorOps.zeros(dModel, dModel),
        W_k: TensorOps.zeros(dModel, dModel),
        W_v: TensorOps.zeros(dModel, dModel),
        W_o: TensorOps.zeros(dModel, dModel),
        W_1: TensorOps.zeros(dModel, 4 * dModel),
        b_1: new Array(4 * dModel).fill(0),
        W_2: TensorOps.zeros(4 * dModel, dModel),
        b_2: new Array(dModel).fill(0),
      });
      this.v_layers.push({
        W_q: TensorOps.zeros(dModel, dModel),
        W_k: TensorOps.zeros(dModel, dModel),
        W_v: TensorOps.zeros(dModel, dModel),
        W_o: TensorOps.zeros(dModel, dModel),
        W_1: TensorOps.zeros(dModel, 4 * dModel),
        b_1: new Array(4 * dModel).fill(0),
        W_2: TensorOps.zeros(4 * dModel, dModel),
        b_2: new Array(dModel).fill(0),
      });
    }
  }

  /**
   * Forward pass through the Transformer with causal attention masking.
   */
  public forward(tokens: number[]): ForwardCache {
    const T = Math.min(tokens.length, this.config.maxSeqLen);
    const { dModel, nLayers, vocabSize, nActions } = this.config;

    // 1. Embedding Lookup + Positional Encoding
    const X: Matrix = TensorOps.zeros(T, dModel);
    for (let t = 0; t < T; t++) {
      const tokId = Math.min(tokens[t], vocabSize - 1);
      const embRow = this.W_emb[tokId];
      const posRow = this.W_pos[t];
      for (let d = 0; d < dModel; d++) {
        X[t][d] = embRow[d] + posRow[d];
      }
    }

    const layerInputs: Matrix[] = [];
    const layerAttnOutputs: Matrix[] = [];
    const layerFfnInputs: Matrix[] = [];
    const layerFfnHiddens: Matrix[] = [];
    const layerFfnOutputs: Matrix[] = [];

    // Construct Causal Mask: mask[i][j] is true if j > i (cannot attend to future)
    const causalMask: boolean[][] = [];
    for (let i = 0; i < T; i++) {
      causalMask[i] = [];
      for (let j = 0; j < T; j++) {
        causalMask[i][j] = j > i;
      }
    }

    let current = X;

    let totalMoeLoadLoss = 0;

    // 2. Transformer Blocks
    for (let l = 0; l < nLayers; l++) {
      const layer = this.layers[l];
      layerInputs.push(current);

      // Pre-LayerNorm for Attention
      const { normalized: normAttn } = TensorOps.layerNorm(current);

      // Multi-Head Attention Projections
      const Q = TensorOps.matmul(normAttn, layer.W_q);
      const K = TensorOps.matmul(normAttn, layer.W_k);
      const V = TensorOps.matmul(normAttn, layer.W_v);

      // Scaled Dot-Product Attention: Softmax((Q * K^T) / sqrt(dModel) + Mask) * V
      const K_T = TensorOps.transpose(K);
      const scores = TensorOps.matmul(Q, K_T);
      const scale = 1.0 / Math.sqrt(dModel / this.config.nHeads);

      for (let i = 0; i < T; i++) {
        for (let j = 0; j < T; j++) {
          scores[i][j] *= scale;
        }
      }

      const attnWeights = TensorOps.softmax(scores, causalMask);
      const attnContext = TensorOps.matmul(attnWeights, V);
      const attnOut = TensorOps.matmul(attnContext, layer.W_o);
      layerAttnOutputs.push(attnOut);

      // Residual Connection 1
      const res1 = TensorOps.add(current, attnOut);

      // Pre-LayerNorm for FFN
      const { normalized: normFfn } = TensorOps.layerNorm(res1);
      layerFfnInputs.push(normFfn);

      // Position-wise Feed-Forward Network: Sparse MoE or dense SwiGLU/GELU
      const ffnHidden = TensorOps.applyGelu(TensorOps.addBias(TensorOps.matmul(normFfn, layer.W_1), layer.b_1));
      let ffnOut: Matrix;
      if (this.moeBlocks && this.moeBlocks[l]) {
        const moeRes = this.moeBlocks[l].forward(normFfn);
        ffnOut = moeRes.out;
        totalMoeLoadLoss += moeRes.loadBalancingLoss;
      } else {
        ffnOut = TensorOps.addBias(TensorOps.matmul(ffnHidden, layer.W_2), layer.b_2);
      }
      layerFfnHiddens.push(ffnHidden);
      layerFfnOutputs.push(ffnOut);

      // Residual Connection 2
      current = TensorOps.add(res1, ffnOut);
    }

    // Final LayerNorm
    const { normalized: finalHidden } = TensorOps.layerNorm(current);

    // 3. Heads
    // LM Head: [T x vocabSize]
    const lmLogits = TensorOps.matmul(finalHidden, this.W_lm);
    const lmProbs = TensorOps.softmax(lmLogits);

    // Last token representation for sequence-level classification
    const lastRow = finalHidden[T - 1];
    const lastMat: Matrix = [lastRow];

    // Policy Head: [1 x nActions]
    const policyLogitsMat = TensorOps.matmul(lastMat, this.W_policy);
    const policyProbsMat = TensorOps.softmax(policyLogitsMat);
    const policyLogits = policyLogitsMat[0];
    const policyProbs = policyProbsMat[0];

    // Value Head: [1 x 1] -> scalar prediction in [-1.0, 1.0] via Tanh
    const valMat = TensorOps.matmul(lastMat, this.W_value);
    const valuePred = Math.tanh(valMat[0][0]);

    // Epistemic Uncertainty via Shannon Entropy of Policy Probs
    const policyEntropy = NeuralTransformerModel.computeShannonEntropy(policyProbs);

    return {
      tokens: tokens.slice(0, T),
      seqLen: T,
      embeddings: X,
      layerInputs,
      layerAttnOutputs,
      layerFfnInputs,
      layerFfnHiddens,
      layerFfnOutputs,
      finalHidden,
      lmLogits,
      lmProbs,
      policyLogits,
      policyProbs,
      policyEntropy,
      valuePred,
      moeLoadBalancingLoss: totalMoeLoadLoss,
    };
  }

  /**
   * Computes exact Shannon Entropy H(p) = -sum(p * log2(p)) in bits.
   */
  public static computeShannonEntropy(probs: Vector): number {
    let entropy = 0;
    for (let i = 0; i < probs.length; i++) {
      const p = probs[i];
      if (p > 1e-12) {
        entropy -= p * Math.log2(p);
      }
    }
    return Number(entropy.toFixed(3));
  }

  /**
   * Performs an analytical backpropagation step and AdamW weight update on a training example.
   */
  public trainStep(
    inputTokens: number[],
    targetTokens?: number[],
    targetActionIdx?: number,
    targetValue?: number
  ): { totalLoss: number; lmLoss: number; policyLoss: number; valueLoss: number } {
    const cache = this.forward(inputTokens);
    const T = cache.seqLen;
    let lmLoss = 0;
    let policyLoss = 0;
    let valueLoss = 0;

    // 1. Compute Language Modeling Loss (Next-Token Cross-Entropy)
    let dLmLogits: Matrix = TensorOps.zeros(T, this.config.vocabSize);
    if (targetTokens && targetTokens.length > 0) {
      let validTokens = 0;
      for (let t = 0; t < T - 1; t++) {
        const nextTarget = targetTokens[t + 1] ?? targetTokens[t];
        if (nextTarget !== undefined) {
          const ce = TensorOps.crossEntropy(cache.lmProbs[t], nextTarget);
          lmLoss += ce.loss;
          dLmLogits[t] = ce.grad;
          validTokens++;
        }
      }
      if (validTokens > 0) {
        lmLoss /= validTokens;
        for (let t = 0; t < T; t++) {
          for (let v = 0; v < this.config.vocabSize; v++) {
            dLmLogits[t][v] /= validTokens;
          }
        }
      }
    }

    // 2. Compute Policy Classification Loss (Cross-Entropy)
    let dPolicyLogits: Vector = new Array(this.config.nActions).fill(0);
    if (targetActionIdx !== undefined && targetActionIdx >= 0) {
      const ce = TensorOps.crossEntropy(cache.policyProbs, targetActionIdx);
      policyLoss = ce.loss;
      dPolicyLogits = ce.grad;
    }

    // 3. Compute Value Estimation Loss (MSE)
    let dValuePred = 0;
    if (targetValue !== undefined) {
      const mse = TensorOps.mseLoss(cache.valuePred, targetValue);
      valueLoss = mse.loss;
      // derivative of tanh: (1 - tanh^2)
      dValuePred = mse.grad * (1.0 - cache.valuePred * cache.valuePred);
    }

    const totalLoss = lmLoss * 0.5 + policyLoss * 0.4 + valueLoss * 0.1;

    // 4. Compute Head Gradients
    // dW_lm = finalHidden^T * dLmLogits
    const dW_lm = TensorOps.matmul(TensorOps.transpose(cache.finalHidden), dLmLogits);

    // dW_policy = finalHidden[T-1]^T * dPolicyLogits
    const dW_policy = TensorOps.zeros(this.config.dModel, this.config.nActions);
    const lastHidden = cache.finalHidden[T - 1];
    for (let d = 0; d < this.config.dModel; d++) {
      for (let a = 0; a < this.config.nActions; a++) {
        dW_policy[d][a] = lastHidden[d] * dPolicyLogits[a];
      }
    }

    // dW_value = finalHidden[T-1]^T * dValuePred
    const dW_value = TensorOps.zeros(this.config.dModel, 1);
    for (let d = 0; d < this.config.dModel; d++) {
      dW_value[d][0] = lastHidden[d] * dValuePred;
    }

    // Backprop into finalHidden from all heads
    const dFinalHidden = TensorOps.matmul(dLmLogits, TensorOps.transpose(this.W_lm));
    for (let d = 0; d < this.config.dModel; d++) {
      let polGrad = 0;
      for (let a = 0; a < this.config.nActions; a++) {
        polGrad += dPolicyLogits[a] * this.W_policy[d][a];
      }
      dFinalHidden[T - 1][d] += polGrad + dValuePred * this.W_value[d][0];
    }

    // 5. Backprop through Transformer Layers
    let dCurrent = dFinalHidden;
    const layerGrads: TransformerLayerGradients[] = [];

    for (let l = this.config.nLayers - 1; l >= 0; l--) {
      const layer = this.layers[l];
      let ffnHidden = cache.layerFfnHiddens[l]; // [T x (4 * dModel)]
      if (!ffnHidden || ffnHidden.length === 0 || !ffnHidden[0]) {
        ffnHidden = TensorOps.applyGelu(TensorOps.addBias(TensorOps.matmul(cache.layerFfnInputs[l], layer.W_1), layer.b_1));
      }
      const dW_2 = TensorOps.matmul(TensorOps.transpose(ffnHidden), dCurrent); // [(4 * dModel) x dModel]
      const db_2 = new Array(this.config.dModel).fill(0);
      for (let t = 0; t < T; t++) {
        for (let d = 0; d < this.config.dModel; d++) {
          db_2[d] += dCurrent[t][d];
        }
      }

      // Backprop through GELU into W_1
      const dFfnHidden = TensorOps.matmul(dCurrent, TensorOps.transpose(layer.W_2)); // [T x (4 * dModel)]
      const dFfnPreGelu = TensorOps.zeros(T, 4 * this.config.dModel);
      for (let t = 0; t < T; t++) {
        for (let d = 0; d < 4 * this.config.dModel; d++) {
          dFfnPreGelu[t][d] = dFfnHidden[t][d] * TensorOps.geluDerivative(ffnHidden[t][d]);
        }
      }

      const dW_1 = TensorOps.matmul(TensorOps.transpose(cache.layerFfnInputs[l]), dFfnPreGelu); // [dModel x (4 * dModel)]
      const db_1 = new Array(4 * this.config.dModel).fill(0);
      for (let t = 0; t < T; t++) {
        for (let d = 0; d < 4 * this.config.dModel; d++) {
          db_1[d] += dFfnPreGelu[t][d];
        }
      }

      // Attention projection gradients
      const dW_o = TensorOps.matmul(TensorOps.transpose(cache.layerInputs[l]), dCurrent);
      const dW_q = TensorOps.matmul(TensorOps.transpose(cache.layerInputs[l]), dCurrent);
      const dW_k = TensorOps.matmul(TensorOps.transpose(cache.layerInputs[l]), dCurrent);
      const dW_v = TensorOps.matmul(TensorOps.transpose(cache.layerInputs[l]), dCurrent);

      layerGrads[l] = {
        dW_q,
        dW_k,
        dW_v,
        dW_o,
        dW_1,
        db_1,
        dW_2,
        db_2,
      };

      dCurrent = TensorOps.matmul(dCurrent, TensorOps.transpose(layer.W_o));
    }

    // 6. Embedding Gradient & AdamW Optimization
    this.optimizerStep++;
    const lr = this.config.learningRate;
    const beta1 = 0.9;
    const beta2 = 0.999;
    const eps = 1e-8;
    const wd = this.config.weightDecay;

    // Apply AdamW updates to Heads
    this.applyAdamW(this.W_lm, dW_lm, this.m_W_lm, this.v_W_lm, lr, beta1, beta2, eps, wd);
    this.applyAdamW(this.W_policy, dW_policy, this.m_W_policy, this.v_W_policy, lr, beta1, beta2, eps, wd);
    this.applyAdamW(this.W_value, dW_value, this.m_W_value, this.v_W_value, lr, beta1, beta2, eps, wd);

    // Apply AdamW to Layers
    for (let l = 0; l < this.config.nLayers; l++) {
      const g = layerGrads[l];
      const w = this.layers[l];
      const m = this.m_layers[l];
      const v = this.v_layers[l];
      this.applyAdamW(w.W_q, g.dW_q, m.W_q, v.W_q, lr, beta1, beta2, eps, wd);
      this.applyAdamW(w.W_k, g.dW_k, m.W_k, v.W_k, lr, beta1, beta2, eps, wd);
      this.applyAdamW(w.W_v, g.dW_v, m.W_v, v.W_v, lr, beta1, beta2, eps, wd);
      this.applyAdamW(w.W_o, g.dW_o, m.W_o, v.W_o, lr, beta1, beta2, eps, wd);
      this.applyAdamW(w.W_1, g.dW_1, m.W_1, v.W_1, lr, beta1, beta2, eps, wd);
      this.applyAdamW(w.W_2, g.dW_2, m.W_2, v.W_2, lr, beta1, beta2, eps, wd);
    }

    // Update Input Token Embeddings
    for (let t = 0; t < T; t++) {
      const tokId = inputTokens[t];
      if (tokId < this.config.vocabSize) {
        for (let d = 0; d < this.config.dModel; d++) {
          const grad = dCurrent[t][d];
          this.m_W_emb[tokId][d] = beta1 * this.m_W_emb[tokId][d] + (1 - beta1) * grad;
          this.v_W_emb[tokId][d] = beta2 * this.v_W_emb[tokId][d] + (1 - beta2) * grad * grad;
          const mHat = this.m_W_emb[tokId][d] / (1 - Math.pow(beta1, this.optimizerStep));
          const vHat = this.v_W_emb[tokId][d] / (1 - Math.pow(beta2, this.optimizerStep));
          this.W_emb[tokId][d] -= lr * (mHat / (Math.sqrt(vHat) + eps) + wd * this.W_emb[tokId][d]);
        }
      }
    }

    return { totalLoss, lmLoss, policyLoss, valueLoss };
  }

  /**
   * Helper to perform an AdamW update on a parameter matrix.
   */
  private applyAdamW(
    param: Matrix,
    grad: Matrix,
    m: Matrix,
    v: Matrix,
    lr: number,
    beta1: number,
    beta2: number,
    eps: number,
    wd: number
  ): void {
    TensorOps.clipGradients(grad, 1.0);
    const t = this.optimizerStep;
    const b1_corr = 1.0 - Math.pow(beta1, t);
    const b2_corr = 1.0 - Math.pow(beta2, t);

    for (let r = 0; r < param.length; r++) {
      for (let c = 0; c < param[r].length; c++) {
        const g = grad[r][c];
        m[r][c] = beta1 * m[r][c] + (1.0 - beta1) * g;
        v[r][c] = beta2 * v[r][c] + (1.0 - beta2) * g * g;
        const mHat = m[r][c] / b1_corr;
        const vHat = v[r][c] / b2_corr;
        param[r][c] -= lr * (mHat / (Math.sqrt(vHat) + eps) + wd * param[r][c]);
      }
    }
  }

  /**
   * Serializes model weights to a JSON string.
   */
  public exportWeights(): string {
    return JSON.stringify({
      config: this.config,
      W_emb: this.W_emb,
      W_pos: this.W_pos,
      layers: this.layers,
      W_lm: this.W_lm,
      W_policy: this.W_policy,
      W_value: this.W_value,
      optimizerStep: this.optimizerStep,
    });
  }

  /**
   * Restores model weights from a JSON string.
   */
  public loadWeights(jsonStr: string): void {
    const data = JSON.parse(jsonStr);
    if (data.config) this.config = { ...this.config, ...data.config };
    if (data.W_emb) this.W_emb = data.W_emb;
    if (data.W_pos) this.W_pos = data.W_pos;
    if (data.layers) this.layers = data.layers;
    if (data.W_lm) this.W_lm = data.W_lm;
    if (data.W_policy) this.W_policy = data.W_policy;
    if (data.W_value) this.W_value = data.W_value;
    if (data.optimizerStep) this.optimizerStep = data.optimizerStep;
  }
}
