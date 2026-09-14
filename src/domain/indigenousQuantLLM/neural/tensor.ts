/**
 * LUMEN-ASTRA-FIN NEURAL: TENSOR & MATRIX ALGEBRA
 * High-performance typed matrix and tensor math optimized for in-process Transformer forward/backward passes.
 */

export type Matrix = number[][]; // [rows x cols]
export type Vector = number[];

export class TensorOps {
  /**
   * Creates a zero-filled matrix of [rows x cols].
   */
  public static zeros(rows: number, cols: number): Matrix {
    const mat: Matrix = new Array(rows);
    for (let r = 0; r < rows; r++) {
      mat[r] = new Array(cols).fill(0);
    }
    return mat;
  }

  /**
   * Creates a matrix initialized with Gaussian random values scaled by Xavier/Glorot variance.
   */
  public static randomMatrix(rows: number, cols: number, scale?: number): Matrix {
    const s = scale !== undefined ? scale : Math.sqrt(2.0 / (rows + cols));
    const mat: Matrix = new Array(rows);
    for (let r = 0; r < rows; r++) {
      const row = new Array(cols);
      for (let c = 0; c < cols; c++) {
        // Box-Muller transform for standard normal distribution
        const u1 = Math.max(1e-7, Math.random());
        const u2 = Math.random();
        const randStd = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        row[c] = randStd * s;
      }
      mat[r] = row;
    }
    return mat;
  }

  /**
   * Matrix multiplication: C = A [M x K] * B [K x N] -> C [M x N].
   */
  public static matmul(A: Matrix, B: Matrix): Matrix {
    const M = A.length;
    const K = A[0].length;
    const N = B[0].length;
    const C = this.zeros(M, N);

    for (let i = 0; i < M; i++) {
      const rowA = A[i];
      const rowC = C[i];
      for (let k = 0; k < K; k++) {
        const a_ik = rowA[k];
        if (a_ik === 0) continue;
        const rowB = B[k];
        for (let j = 0; j < N; j++) {
          rowC[j] += a_ik * rowB[j];
        }
      }
    }
    return C;
  }

  /**
   * Transpose of matrix: A [M x N] -> A^T [N x M].
   */
  public static transpose(A: Matrix): Matrix {
    const M = A.length;
    const N = A[0].length;
    const T = this.zeros(N, M);
    for (let i = 0; i < M; i++) {
      const row = A[i];
      for (let j = 0; j < N; j++) {
        T[j][i] = row[j];
      }
    }
    return T;
  }

  /**
   * Adds two matrices element-wise: C = A + B.
   */
  public static add(A: Matrix, B: Matrix): Matrix {
    const M = A.length;
    const N = A[0].length;
    const C = this.zeros(M, N);
    for (let i = 0; i < M; i++) {
      for (let j = 0; j < N; j++) {
        C[i][j] = A[i][j] + B[i][j];
      }
    }
    return C;
  }

  /**
   * Adds a bias vector to each row of a matrix: C[i][j] = A[i][j] + bias[j].
   */
  public static addBias(A: Matrix, bias: Vector): Matrix {
    const M = A.length;
    const N = A[0].length;
    const C = this.zeros(M, N);
    for (let i = 0; i < M; i++) {
      for (let j = 0; j < N; j++) {
        C[i][j] = A[i][j] + bias[j];
      }
    }
    return C;
  }

  /**
   * Gaussian Error Linear Unit (GELU) activation function.
   */
  public static gelu(x: number): number {
    return 0.5 * x * (1.0 + Math.tanh(Math.sqrt(2.0 / Math.PI) * (x + 0.044715 * Math.pow(x, 3))));
  }

  /**
   * Derivative of GELU with respect to x.
   */
  public static geluDerivative(x: number): number {
    const c = Math.sqrt(2.0 / Math.PI);
    const inner = c * (x + 0.044715 * Math.pow(x, 3));
    const tanhVal = Math.tanh(inner);
    const sech2 = 1.0 - tanhVal * tanhVal;
    const dInner = c * (1.0 + 3.0 * 0.044715 * x * x);
    return 0.5 * (1.0 + tanhVal) + 0.5 * x * sech2 * dInner;
  }

  /**
   * Element-wise GELU applied across a matrix.
   */
  public static applyGelu(A: Matrix): Matrix {
    const M = A.length;
    const N = A[0].length;
    const res = this.zeros(M, N);
    for (let i = 0; i < M; i++) {
      for (let j = 0; j < N; j++) {
        res[i][j] = this.gelu(A[i][j]);
      }
    }
    return res;
  }

  /**
   * Layer Normalization across rows of a matrix with learnable gamma/beta or standard unit scaling.
   */
  public static layerNorm(A: Matrix, eps: number = 1e-5): { normalized: Matrix; means: Vector; stds: Vector } {
    const M = A.length;
    const N = A[0].length;
    const normalized = this.zeros(M, N);
    const means = new Array(M);
    const stds = new Array(M);

    for (let i = 0; i < M; i++) {
      let sum = 0;
      for (let j = 0; j < N; j++) sum += A[i][j];
      const mean = sum / N;
      means[i] = mean;

      let varSum = 0;
      for (let j = 0; j < N; j++) {
        const diff = A[i][j] - mean;
        varSum += diff * diff;
      }
      const std = Math.sqrt(varSum / N + eps);
      stds[i] = std;

      for (let j = 0; j < N; j++) {
        normalized[i][j] = (A[i][j] - mean) / std;
      }
    }

    return { normalized, means, stds };
  }

  /**
   * Numerically stable Softmax applied row-wise with optional causal mask.
   * If mask[i][j] is true (masked out), score is set to -1e9.
   */
  public static softmax(A: Matrix, mask?: boolean[][]): Matrix {
    const M = A.length;
    const N = A[0].length;
    const res = this.zeros(M, N);

    for (let i = 0; i < M; i++) {
      // Find row max for numerical stability
      let maxVal = -Infinity;
      for (let j = 0; j < N; j++) {
        if (mask && mask[i]?.[j]) continue;
        if (A[i][j] > maxVal) maxVal = A[i][j];
      }

      if (maxVal === -Infinity) maxVal = 0;

      let expSum = 0;
      for (let j = 0; j < N; j++) {
        if (mask && mask[i]?.[j]) {
          res[i][j] = 0;
        } else {
          const e = Math.exp(A[i][j] - maxVal);
          res[i][j] = e;
          expSum += e;
        }
      }

      const invSum = expSum > 0 ? 1.0 / expSum : 0;
      for (let j = 0; j < N; j++) {
        res[i][j] *= invSum;
      }
    }

    return res;
  }

  /**
   * Computes Cross-Entropy Loss and gradient for a single categorical prediction vs target index.
   */
  public static crossEntropy(probs: Vector, targetIdx: number): { loss: number; grad: Vector } {
    const p = Math.max(1e-12, Math.min(1.0 - 1e-12, probs[targetIdx] || 1e-12));
    const loss = -Math.log(p);
    const grad = new Array(probs.length);
    for (let i = 0; i < probs.length; i++) {
      grad[i] = probs[i] - (i === targetIdx ? 1.0 : 0.0);
    }
    return { loss, grad };
  }

  /**
   * Computes Mean Squared Error (MSE) Loss and gradient for scalar target.
   */
  public static mseLoss(predicted: number, target: number): { loss: number; grad: number } {
    const diff = predicted - target;
    return {
      loss: 0.5 * diff * diff,
      grad: diff,
    };
  }

  /**
   * Clips all gradients in a matrix by global maximum norm.
   */
  public static clipGradients(mat: Matrix, maxNorm: number = 1.0): void {
    let sumSq = 0;
    for (let r = 0; r < mat.length; r++) {
      for (let c = 0; c < mat[r].length; c++) {
        sumSq += mat[r][c] * mat[r][c];
      }
    }
    const norm = Math.sqrt(sumSq);
    if (norm > maxNorm && norm > 0) {
      const scale = maxNorm / norm;
      for (let r = 0; r < mat.length; r++) {
        for (let c = 0; c < mat[r].length; c++) {
          mat[r][c] *= scale;
        }
      }
    }
  }
}
