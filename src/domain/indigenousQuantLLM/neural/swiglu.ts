/**
 * LUMEN-ASTRA-FIN NEURAL: SWIGLU GATED FEED-FORWARD NETWORK
 * Modern frontier gated MLP layer (used in LLaMA 3, PaLM, Mistral).
 * Implements SwiGLU(x) = (Swish(x * W_gate) ⊙ (x * W_up)) * W_down.
 */

import { TensorOps, Matrix } from './tensor';

export class SwiGLUFFN {
  public dModel: number;
  public dHidden: number;
  public W_gate: Matrix; // [dModel x dHidden]
  public W_up: Matrix; // [dModel x dHidden]
  public W_down: Matrix; // [dHidden x dModel]

  constructor(dModel: number, dHidden?: number) {
    this.dModel = dModel;
    // Standard frontier ratio is 8/3 * dModel or 4 * dModel
    this.dHidden = dHidden || Math.floor((8 * dModel) / 3);

    this.W_gate = TensorOps.randomMatrix(this.dModel, this.dHidden);
    this.W_up = TensorOps.randomMatrix(this.dModel, this.dHidden);
    this.W_down = TensorOps.randomMatrix(this.dHidden, this.dModel);
  }

  /**
   * Numerically stable Sigmoid: sigma(z) = 1 / (1 + exp(-z)).
   */
  public static sigmoid(z: number): number {
    if (z >= 0) {
      return 1.0 / (1.0 + Math.exp(-z));
    } else {
      const ez = Math.exp(z);
      return ez / (1.0 + ez);
    }
  }

  /**
   * Swish / SiLU activation: Swish(z) = z * sigma(z).
   */
  public static swish(z: number): number {
    return z * this.sigmoid(z);
  }

  /**
   * Derivative of Swish: d/dz [z * sigma(z)] = sigma(z) * (1 + z * (1 - sigma(z))).
   */
  public static swishDerivative(z: number): number {
    const s = this.sigmoid(z);
    return s * (1.0 + z * (1.0 - s));
  }

  /**
   * Forward pass through SwiGLU block.
   */
  public forward(X: Matrix): {
    out: Matrix;
    gateLinear: Matrix;
    upLinear: Matrix;
    gateActivated: Matrix;
    swigluHidden: Matrix;
  } {
    const seqLen = X.length;
    const gateLinear = TensorOps.matmul(X, this.W_gate); // [seqLen x dHidden]
    const upLinear = TensorOps.matmul(X, this.W_up); // [seqLen x dHidden]

    const gateActivated = TensorOps.zeros(seqLen, this.dHidden);
    const swigluHidden = TensorOps.zeros(seqLen, this.dHidden);

    for (let t = 0; t < seqLen; t++) {
      for (let h = 0; h < this.dHidden; h++) {
        const g = SwiGLUFFN.swish(gateLinear[t][h]);
        gateActivated[t][h] = g;
        swigluHidden[t][h] = g * upLinear[t][h]; // Element-wise multiplication
      }
    }

    const out = TensorOps.matmul(swigluHidden, this.W_down); // [seqLen x dModel]

    return { out, gateLinear, upLinear, gateActivated, swigluHidden };
  }

  /**
   * Backward pass gradient computation for SwiGLU.
   */
  public backward(
    dOut: Matrix,
    X: Matrix,
    gateLinear: Matrix,
    upLinear: Matrix,
    gateActivated: Matrix,
    swigluHidden: Matrix
  ): {
    dX: Matrix;
    dW_gate: Matrix;
    dW_up: Matrix;
    dW_down: Matrix;
  } {
    const seqLen = X.length;

    // dW_down = swigluHidden^T * dOut
    const dW_down = TensorOps.matmul(TensorOps.transpose(swigluHidden), dOut); // [dHidden x dModel]

    // Backprop into swigluHidden: dOut * W_down^T
    const dSwigluHidden = TensorOps.matmul(dOut, TensorOps.transpose(this.W_down)); // [seqLen x dHidden]

    const dGateLinear = TensorOps.zeros(seqLen, this.dHidden);
    const dUpLinear = TensorOps.zeros(seqLen, this.dHidden);

    for (let t = 0; t < seqLen; t++) {
      for (let h = 0; h < this.dHidden; h++) {
        const dH = dSwigluHidden[t][h];
        // dUp = dH * gateActivated
        dUpLinear[t][h] = dH * gateActivated[t][h];
        // dGate = dH * upLinear * dSwish(gateLinear)
        const dSwish = SwiGLUFFN.swishDerivative(gateLinear[t][h]);
        dGateLinear[t][h] = dH * upLinear[t][h] * dSwish;
      }
    }

    const dW_up = TensorOps.matmul(TensorOps.transpose(X), dUpLinear); // [dModel x dHidden]
    const dW_gate = TensorOps.matmul(TensorOps.transpose(X), dGateLinear); // [dModel x dHidden]

    // Backprop into input X from both branches
    const dX_up = TensorOps.matmul(dUpLinear, TensorOps.transpose(this.W_up));
    const dX_gate = TensorOps.matmul(dGateLinear, TensorOps.transpose(this.W_gate));
    const dX = TensorOps.add(dX_up, dX_gate);

    return { dX, dW_gate, dW_up, dW_down };
  }
}
