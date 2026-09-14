/**
 * LUMEN-ASTRA-FIN NEURAL: SPARSE MIXTURE-OF-EXPERTS (MoE) FFN BLOCK
 * Implements Top-2 routed Sparse MoE FFN with load-balancing auxiliary loss.
 * Scales parameter capacity while maintaining constant compute per token.
 */

import { TensorOps, Matrix } from './tensor';
import { SwiGLUFFN } from './swiglu';

export class MoEFFNBlock {
  public dModel: number;
  public nExperts: number;
  public topK: number;
  public dHidden: number;
  public experts: SwiGLUFFN[];
  public W_router: Matrix; // [dModel x nExperts]

  constructor(dModel: number, nExperts: number = 4, topK: number = 2, dHidden?: number) {
    this.dModel = dModel;
    this.nExperts = nExperts;
    this.topK = topK;
    this.dHidden = dHidden || Math.floor((8 * dModel) / 3);

    this.W_router = TensorOps.randomMatrix(dModel, nExperts);
    this.experts = [];
    // For compact memory on large topologies (e.g. 1B scale with dModel >= 768),
    // allocate active Top-K base experts eagerly and lazily instantiate additional experts on demand.
    const initialEager = dModel >= 768 ? Math.min(nExperts, 2) : nExperts;
    for (let e = 0; e < initialEager; e++) {
      this.experts.push(new SwiGLUFFN(dModel, this.dHidden));
    }
  }

  public getExpert(idx: number): SwiGLUFFN {
    const clampedIdx = Math.max(0, Math.min(idx, this.nExperts - 1));
    if (!this.experts[clampedIdx]) {
      this.experts[clampedIdx] = new SwiGLUFFN(this.dModel, this.dHidden);
    }
    return this.experts[clampedIdx];
  }

  /**
   * Forward pass: routes each token to Top-K experts and computes weighted combination.
   */
  public forward(X: Matrix): {
    out: Matrix;
    routerWeights: Matrix; // [seqLen x nExperts]
    expertAssignments: { expert1: number; expert2: number; p1: number; p2: number }[];
    loadBalancingLoss: number;
  } {
    const seqLen = X.length;
    const routerLogits = TensorOps.matmul(X, this.W_router); // [seqLen x nExperts]
    const routerWeights = TensorOps.softmax(routerLogits);

    const out: Matrix = TensorOps.zeros(seqLen, this.dModel);
    const expertAssignments: { expert1: number; expert2: number; p1: number; p2: number }[] = [];
    const expertCounts = new Array(this.nExperts).fill(0);

    for (let t = 0; t < seqLen; t++) {
      const row = routerWeights[t];
      // Find Top-2 Experts
      const indexed = row.map((p, idx) => ({ prob: p, idx })).sort((a, b) => b.prob - a.prob);
      const e1 = indexed[0].idx;
      const e2 = indexed[1]?.idx ?? e1;
      const rawP1 = indexed[0].prob;
      const rawP2 = indexed[1]?.prob ?? 0;
      const normSum = Math.max(1e-7, rawP1 + rawP2);
      const p1 = rawP1 / normSum;
      const p2 = rawP2 / normSum;

      expertAssignments.push({ expert1: e1, expert2: e2, p1, p2 });
      expertCounts[e1]++;
      expertCounts[e2]++;

      // Evaluate Expert 1
      const tokenMat: Matrix = [X[t]];
      const outE1 = this.getExpert(e1).forward(tokenMat).out[0];
      // Evaluate Expert 2
      const outE2 = this.getExpert(e2).forward(tokenMat).out[0];

      for (let d = 0; d < this.dModel; d++) {
        out[t][d] = p1 * outE1[d] + p2 * outE2[d];
      }
    }

    // Auxiliary Load Balancing Loss: alpha * nExperts * sum(f_i * P_i)
    let loadBalancingLoss = 0;
    const targetFreq = 1.0 / this.nExperts;
    for (let e = 0; e < this.nExperts; e++) {
      const f_i = expertCounts[e] / (seqLen * 2 || 1);
      const diff = f_i - targetFreq;
      loadBalancingLoss += diff * diff;
    }

    return { out, routerWeights, expertAssignments, loadBalancingLoss };
  }
}
