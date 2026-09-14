/**
 * LUMEN-ASTRA-FIN NEURAL: ROTARY POSITION EMBEDDINGS (RoPE)
 * Implements Rotary Position Embedding as used in modern frontier LLMs (LLaMA 3, Gemma, Mistral).
 * Dynamically rotates Query and Key vector pairs as a function of position m * theta.
 */

import { Matrix } from './tensor';

export class RotaryPositionEmbedding {
  public dim: number;
  public maxSeqLen: number;
  public base: number;
  public scalingFactor: number;
  private cosTable: Matrix; // [maxSeqLen x dim/2]
  private sinTable: Matrix; // [maxSeqLen x dim/2]

  constructor(
    dim: number,
    maxSeqLen: number = 2048,
    base: number = 10000.0,
    scalingFactor: number = 1.0
  ) {
    this.dim = dim;
    this.maxSeqLen = maxSeqLen;
    this.base = base;
    this.scalingFactor = scalingFactor;

    this.cosTable = [];
    this.sinTable = [];
    this.recomputeTables(maxSeqLen, scalingFactor);
  }

  /**
   * Recomputes RoPE tables with NTK-aware frequency scaling:
   * base' = base * alpha^(dim / (dim - 2))
   */
  public recomputeTables(maxSeqLen: number, scalingFactor: number = 1.0): void {
    this.maxSeqLen = maxSeqLen;
    this.scalingFactor = scalingFactor;
    const halfDim = Math.floor(this.dim / 2);
    this.cosTable = new Array(maxSeqLen);
    this.sinTable = new Array(maxSeqLen);

    // NTK-aware base scaling (CodeLlama / LLaMA 3.1 method)
    const effectiveBase =
      scalingFactor > 1.0
        ? this.base * Math.pow(scalingFactor, this.dim / Math.max(1, this.dim - 2))
        : this.base;

    // Precompute theta frequencies: theta_i = effectiveBase^(-2i / dim)
    const thetas: number[] = new Array(halfDim);
    for (let i = 0; i < halfDim; i++) {
      thetas[i] = Math.pow(effectiveBase, -(2 * i) / this.dim);
    }

    // Precompute cos and sin tables across positions m
    for (let m = 0; m < maxSeqLen; m++) {
      this.cosTable[m] = new Array(halfDim);
      this.sinTable[m] = new Array(halfDim);
      for (let i = 0; i < halfDim; i++) {
        const angle = m * thetas[i];
        this.cosTable[m][i] = Math.cos(angle);
        this.sinTable[m][i] = Math.sin(angle);
      }
    }
  }

  /**
   * Dynamically extends context capacity using NTK scaling if sequence exceeds current maxSeqLen.
   */
  public ensureCapacity(requiredLen: number): void {
    if (requiredLen > this.maxSeqLen) {
      const newMax = Math.max(requiredLen, this.maxSeqLen * 2);
      const ratio = newMax / this.maxSeqLen;
      this.recomputeTables(newMax, ratio);
    }
  }

  /**
   * Applies RoPE in-place to an activations matrix [seqLen x dim] at a given offset position.
   */
  public applyRoPE(X: Matrix, offset: number = 0): Matrix {
    const seqLen = X.length;
    const halfDim = Math.floor(this.dim / 2);
    const out: Matrix = new Array(seqLen);

    for (let t = 0; t < seqLen; t++) {
      const pos = Math.min(offset + t, this.maxSeqLen - 1);
      const row = X[t];
      const newRow = new Array(this.dim);
      const cosRow = this.cosTable[pos];
      const sinRow = this.sinTable[pos];

      for (let i = 0; i < halfDim; i++) {
        const x1 = row[2 * i];
        const x2 = row[2 * i + 1];
        const cosVal = cosRow[i];
        const sinVal = sinRow[i];

        // 2D Rotation: [x1*cos - x2*sin, x1*sin + x2*cos]
        newRow[2 * i] = x1 * cosVal - x2 * sinVal;
        newRow[2 * i + 1] = x1 * sinVal + x2 * cosVal;
      }

      // If dim is odd, preserve the last dimension unchanged
      if (this.dim % 2 !== 0) {
        newRow[this.dim - 1] = row[this.dim - 1];
      }

      out[t] = newRow;
    }

    return out;
  }
}
