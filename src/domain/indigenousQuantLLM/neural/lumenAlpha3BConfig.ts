/**
 * LUMEN-ALPHA 3B FLAGSHIP: ARCHITECTURE CONFIGURATION
 * 
 * Formal parameter definitions and memory allocation invariants for
 * Lumen-Alpha (3B Flagship) - Sovereign 3.02-Billion parameter Mixture-of-Experts (MoE) LLM.
 * 
 * Architectural Topology:
 * - dModel: 1024
 * - nLayers: 16
 * - nHeads: 16 (Head dim = 64)
 * - nExperts: 22 routed experts per layer (SwiGLU FFN)
 * - topK: 2 active experts per token
 * - dHidden: 2730 (floor(8 * 1024 / 3))
 * - maxSeqLen: 512 tokens (extendable to 2048 with circular KV cache)
 * - Total Trainable Parameters: 3,024,272,384 (3.02 Billion)
 * - Active Parameters per Token: ~340,573,184 (~340 Million)
 */

import { TransformerConfig } from './transformerModel';
import { ACTION_TOKENS } from './vocabulary';

export const LUMEN_ALPHA_3B_CONFIG: TransformerConfig = {
  vocabSize: 2048,
  dModel: 1024,
  nHeads: 16,
  nLayers: 16,
  maxSeqLen: 512,
  nActions: ACTION_TOKENS.length,
  learningRate: 0.00015,
  weightDecay: 0.01,
  useMoE: true,
  nExperts: 22,
  topK: 2,
  isVirtual1B: false,
  virtualTotalParams: 3_024_272_384,
};

export interface ParameterBreakdown {
  embeddings: number;
  attention: number;
  moeFFN: number;
  heads: number;
  total: number;
  activePerToken: number;
  expertCount: number;
  activeExperts: number;
}

export interface MemoryFootprint {
  fp16Bytes: number;
  fp16Gigabytes: number;
  int8Bytes: number;
  int8Gigabytes: number;
  int4Bytes: number;
  int4Gigabytes: number;
  kvCacheMbPerUser: number;
  activeLayerWorkingSetMb: number;
}

/**
 * Calculates the exact mathematical parameter breakdown for Lumen-Alpha 3B.
 */
export function calculateLumenAlphaExactParams(
  config: TransformerConfig = LUMEN_ALPHA_3B_CONFIG
): ParameterBreakdown {
  const dModel = config.dModel;
  const vocabSize = config.vocabSize;
  const maxSeqLen = config.maxSeqLen;
  const nLayers = config.nLayers;
  const nExperts = config.nExperts || 22;
  const topK = config.topK || 2;
  const nActions = config.nActions;

  const dHidden = Math.floor((8 * dModel) / 3);

  // 1. Embeddings: Token Embedding + Positional Encoding
  const embParams = vocabSize * dModel + maxSeqLen * dModel;

  // 2. Multi-Head Self-Attention: W_q, W_k, W_v, W_o
  const attnPerLayer = 4 * dModel * dModel;
  const totalAttn = nLayers * attnPerLayer;

  // 3. Sparse Mixture of Experts:
  // Router: dModel x nExperts
  // Each Expert: SwiGLU (W_gate, W_up, W_down) -> 3 * dModel * dHidden
  const routerPerLayer = dModel * nExperts;
  const paramsPerExpert = 3 * dModel * dHidden;
  const moePerLayer = routerPerLayer + nExperts * paramsPerExpert;
  const totalMoE = nLayers * moePerLayer;

  // 4. Output Heads: LM Head + Policy Head + Value Head
  const lmHead = dModel * vocabSize;
  const policyHead = dModel * nActions;
  const valueHead = dModel * 1;
  const totalHeads = lmHead + policyHead + valueHead;

  const grandTotal = embParams + totalAttn + totalMoE + totalHeads;

  // Active parameter calculation per token
  const activeAttnPerLayer = attnPerLayer;
  const activeMoEPerLayer = routerPerLayer + topK * paramsPerExpert;
  const activePerLayer = activeAttnPerLayer + activeMoEPerLayer;
  const activeTotal = embParams + totalHeads + nLayers * activePerLayer;

  return {
    embeddings: embParams,
    attention: totalAttn,
    moeFFN: totalMoE,
    heads: totalHeads,
    total: grandTotal,
    activePerToken: activeTotal,
    expertCount: nExperts,
    activeExperts: topK,
  };
}

/**
 * Calculates memory requirements for model execution and demand paging.
 */
export function calculateLumenAlphaMemoryFootprint(
  seqLen: number = 512,
  config: TransformerConfig = LUMEN_ALPHA_3B_CONFIG
): MemoryFootprint {
  const breakdown = calculateLumenAlphaExactParams(config);
  const totalParams = breakdown.total;

  const fp16Bytes = totalParams * 2;
  const int8Bytes = totalParams * 1;
  const int4Bytes = Math.round(totalParams * 0.5); // 4-bit / Q4_K_S

  // KV Cache: 2 (K and V) * nLayers * seqLen * dModel * 2 bytes (FP16)
  const kvCacheBytes = 2 * config.nLayers * seqLen * config.dModel * 2;
  const kvCacheMb = kvCacheBytes / (1024 * 1024);

  // Active layer working set: Multi-Head Attention + Top-2 Experts in FP16/INT4
  const dHidden = Math.floor((8 * config.dModel) / 3);
  const layerAttnWeights = 4 * config.dModel * config.dModel;
  const layerTopKWeights = 2 * (3 * config.dModel * dHidden);
  const activeLayerWeights = layerAttnWeights + layerTopKWeights;
  const activeLayerWorkingSetMb = (activeLayerWeights * 0.5) / (1024 * 1024); // in INT4

  return {
    fp16Bytes,
    fp16Gigabytes: fp16Bytes / (1024 * 1024 * 1024),
    int8Bytes,
    int8Gigabytes: int8Bytes / (1024 * 1024 * 1024),
    int4Bytes,
    int4Gigabytes: int4Bytes / (1024 * 1024 * 1024),
    kvCacheMbPerUser: kvCacheMb,
    activeLayerWorkingSetMb,
  };
}
