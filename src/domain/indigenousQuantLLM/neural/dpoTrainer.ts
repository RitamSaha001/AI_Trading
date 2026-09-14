/**
 * LUMEN-ASTRA-FIN NEURAL: DIRECT PREFERENCE OPTIMIZATION (DPO)
 * Implements Direct Preference Optimization for financial quant trading.
 * Directly aligns the Transformer on winning vs losing trade trajectories from historical replays.
 */

import { NeuralTransformerModel } from './transformerModel';
import { DomainTokenizer } from './vocabulary';

export interface PreferencePair {
  scenarioPrompt: string;
  promptTokens?: number[];
  winningThought: string;
  winningTokens?: number[];
  winningActionIdx: number;
  losingThought: string;
  losingTokens?: number[];
  losingActionIdx: number;
  marginBenefit: number; // e.g. difference in P&L
}

export interface DPOSummary {
  pairsTrained: number;
  initialDpoLoss: number;
  finalDpoLoss: number;
  winPreferenceAccuracyPct: number;
}

export class DPOTrainer {
  public model: NeuralTransformerModel;
  public refModel: NeuralTransformerModel;
  public beta: number; // Temperature parameter (typically 0.1)

  constructor(model: NeuralTransformerModel, beta: number = 0.1) {
    this.model = model;
    this.beta = beta;

    // Create frozen reference model clone
    this.refModel = new NeuralTransformerModel(model.config);
    this.refModel.loadWeights(model.exportWeights());
  }

  /**
   * Sigmoid function: sigma(z) = 1 / (1 + exp(-z)).
   */
  private sigmoid(z: number): number {
    return 1.0 / (1.0 + Math.exp(-Math.max(-15, Math.min(15, z))));
  }

  /**
   * Computes log-probability of an action given a prompt: log pi(y | x).
   */
  private computeActionLogProb(targetModel: NeuralTransformerModel, promptTokens: number[], actionIdx: number): number {
    const cache = targetModel.forward(promptTokens);
    const p = Math.max(1e-12, cache.policyProbs[actionIdx] || 1e-12);
    return Math.log(p);
  }

  /**
   * Executes a DPO optimization step across pairs of winning vs losing trade trajectories.
   */
  public trainDPO(pairs: PreferencePair[], epochs: number = 3, lr: number = 0.0005): DPOSummary {
    if (pairs.length === 0) {
      return { pairsTrained: 0, initialDpoLoss: 0, finalDpoLoss: 0, winPreferenceAccuracyPct: 100 };
    }

    let initialDpoLoss = 0;
    let finalDpoLoss = 0;
    let preferredWins = 0;

    for (let ep = 0; ep < epochs; ep++) {
      let epochLoss = 0;

      for (const pair of pairs) {
        const promptTokens = DomainTokenizer.encode(pair.scenarioPrompt);

        // 1. Policy Model Log-Probs
        const logPiW = this.computeActionLogProb(this.model, promptTokens, pair.winningActionIdx);
        const logPiL = this.computeActionLogProb(this.model, promptTokens, pair.losingActionIdx);

        // 2. Reference Model Log-Probs
        const logRefW = this.computeActionLogProb(this.refModel, promptTokens, pair.winningActionIdx);
        const logRefL = this.computeActionLogProb(this.refModel, promptTokens, pair.losingActionIdx);

        // 3. Implicit Reward & DPO Logit: beta * [log(pi_w/ref_w) - log(pi_l/ref_l)]
        const logRatioW = logPiW - logRefW;
        const logRatioL = logPiL - logRefL;
        const h = this.beta * (logRatioW - logRatioL);

        // Loss = -log(sigmoid(h))
        const pSig = this.sigmoid(h);
        const loss = -Math.log(Math.max(1e-12, pSig));
        epochLoss += loss;

        if (ep === 0) initialDpoLoss += loss;
        if (logPiW > logPiL) preferredWins++;

        // 4. Update Policy Model using DPO gradient-scaled winning trajectory
        const gradScale = Math.min(1.0, Math.max(0.01, 1.0 - pSig));
        const winTokens = pair.winningTokens || DomainTokenizer.encode(pair.winningThought || '');
        this.model.trainStep(promptTokens, winTokens, pair.winningActionIdx, 1.0 * gradScale);
      }

      finalDpoLoss = epochLoss / pairs.length;
    }

    initialDpoLoss /= pairs.length;

    let finalPreferredWins = 0;
    for (const pair of pairs) {
      const promptTokens = DomainTokenizer.encode(pair.scenarioPrompt);
      const logPiW = this.computeActionLogProb(this.model, promptTokens, pair.winningActionIdx);
      const logPiL = this.computeActionLogProb(this.model, promptTokens, pair.losingActionIdx);
      if (logPiW > logPiL) finalPreferredWins++;
    }
    const winPreferenceAccuracyPct = Number(((finalPreferredWins / pairs.length) * 100).toFixed(1));

    return {
      pairsTrained: pairs.length,
      initialDpoLoss,
      finalDpoLoss,
      winPreferenceAccuracyPct,
    };
  }
}
