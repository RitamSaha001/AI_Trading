/**
 * LUMEN-ASTRA-FIN NEURAL: ROOT MEAN SQUARE NORMALIZATION (RMSNorm)
 * Modern frontier normalization standard (used in LLaMA 3, Mistral, Gemma).
 * Scales activations by Root Mean Square without mean-centering for superior stability.
 */

import { Matrix, Vector } from './tensor';

export class RMSNorm {
  public dim: number;
  public eps: number;
  public gamma: Vector; // Learnable scaling weight

  constructor(dim: number, eps: number = 1e-6) {
    this.dim = dim;
    this.eps = eps;
    this.gamma = new Array(dim).fill(1.0);
  }

  /**
   * Forward pass: RMSNorm(X) = (X / RMS(X)) * gamma.
   */
  public forward(X: Matrix): { normalized: Matrix; rms: Vector } {
    const rows = X.length;
    const cols = this.dim;
    const normalized: Matrix = new Array(rows);
    const rms: Vector = new Array(rows);

    for (let r = 0; r < rows; r++) {
      const row = X[r];
      let sumSq = 0;
      for (let c = 0; c < cols; c++) {
        sumSq += row[c] * row[c];
      }
      const rootMeanSq = Math.sqrt(sumSq / cols + this.eps);
      rms[r] = rootMeanSq;
      const invRms = 1.0 / rootMeanSq;

      const normRow = new Array(cols);
      for (let c = 0; c < cols; c++) {
        normRow[c] = row[c] * invRms * this.gamma[c];
      }
      normalized[r] = normRow;
    }

    return { normalized, rms };
  }

  /**
   * Backward pass gradient computation for RMSNorm.
   */
  public backward(dOut: Matrix, X: Matrix, rms: Vector): { dX: Matrix; dGamma: Vector } {
    const rows = X.length;
    const cols = this.dim;
    const dX: Matrix = new Array(rows);
    const dGamma: Vector = new Array(cols).fill(0);

    for (let r = 0; r < rows; r++) {
      const row = X[r];
      const dRow = dOut[r];
      const invRms = 1.0 / rms[r];
      const invRms3 = invRms * invRms * invRms;

      let dotX_dOutGamma = 0;
      for (let c = 0; c < cols; c++) {
        dotX_dOutGamma += row[c] * (dRow[c] * this.gamma[c]);
        dGamma[c] += dRow[c] * (row[c] * invRms);
      }

      const dXRow = new Array(cols);
      for (let c = 0; c < cols; c++) {
        dXRow[c] = (dRow[c] * this.gamma[c]) * invRms - (row[c] / cols) * invRms3 * dotX_dOutGamma;
      }
      dX[r] = dXRow;
    }

    return { dX, dGamma };
  }
}
