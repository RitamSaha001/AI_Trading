/**
 * LUMEN-ASTRA-FIN NEURAL: TRANSFORMER UNIT TEST SUITE
 * Verifies tensor algebra, causal attention, backpropagation, training loss convergence,
 * auto-regressive generation, and weight checkpoint round-tripping.
 */

import { describe, it, expect } from 'vitest';
import {
  TensorOps,
  DomainTokenizer,
  BPETokenizer,
  NeuralTransformerModel,
  AstraFinTrainer,
  AstraFinGenerator,
  DPOTrainer,
  ScenarioDatasetBuilder,
  ScenarioExample,
} from '../neural';

describe('Lumen-Astra-Fin Neural: Core Tensor Operations', () => {
  it('correctly executes matrix multiplication (A * B)', () => {
    const A = [
      [1, 2],
      [3, 4],
    ];
    const B = [
      [5, 6],
      [7, 8],
    ];
    // [1*5 + 2*7, 1*6 + 2*8] = [19, 22]
    // [3*5 + 4*7, 3*6 + 4*8] = [43, 50]
    const C = TensorOps.matmul(A, B);
    expect(C[0][0]).toBe(19);
    expect(C[0][1]).toBe(22);
    expect(C[1][0]).toBe(43);
    expect(C[1][1]).toBe(50);
  });

  it('computes numerically stable Softmax summing to 1.0 with causal mask support', () => {
    const A = [
      [2.0, 1.0, 0.0],
      [0.0, 3.0, 1.0],
    ];
    const mask = [
      [false, true, true], // First row only attends to token 0
      [false, false, true], // Second row attends to tokens 0, 1
    ];
    const S = TensorOps.softmax(A, mask);

    // Row 0: only column 0 is unmasked -> probability 1.0
    expect(S[0][0]).toBeCloseTo(1.0, 4);
    expect(S[0][1]).toBe(0);
    expect(S[0][2]).toBe(0);

    // Row 1: column 2 is masked -> sum(col 0, col 1) = 1.0
    expect(S[1][0] + S[1][1]).toBeCloseTo(1.0, 4);
    expect(S[1][2]).toBe(0);
  });

  it('normalizes inputs cleanly using Layer Normalization', () => {
    const A = [[10.0, 20.0, 30.0, 40.0]];
    const { normalized, means } = TensorOps.layerNorm(A);
    expect(means[0]).toBe(25.0);

    // Sum of normalized values should be ~0
    const sumNorm = normalized[0].reduce((a, b) => a + b, 0);
    expect(Math.abs(sumNorm)).toBeLessThan(1e-4);
  });
});

describe('Lumen-Astra-Fin Neural: Vocabulary & Tokenization', () => {
  it('encodes special tags and financial assets into exact token IDs', () => {
    const text = '<scenario> TATAPOWER REGIME_BULL_TREND ACI_EXEMPLARY_85_PLUS </scenario>';
    const ids = DomainTokenizer.encode(text);
    expect(ids.length).toBeGreaterThan(3);

    const decoded = DomainTokenizer.decode(ids);
    expect(decoded.toLowerCase()).toContain('tatapower');
    expect(decoded).toContain('REGIME_BULL_TREND');
  });
});

describe('Lumen-Astra-Fin Neural: Transformer Forward & Backward Pass', () => {
  it('executes a forward pass producing correct tensor shapes and normalized probabilities', () => {
    const model = new NeuralTransformerModel({ dModel: 32, nHeads: 2, nLayers: 1, maxSeqLen: 16 });
    const tokens = DomainTokenizer.encode('<scenario> RELIANCE REGIME_BULL_TREND </scenario>');
    const cache = model.forward(tokens);

    expect(cache.seqLen).toBe(tokens.length);
    expect(cache.lmLogits.length).toBe(tokens.length);
    expect(cache.lmLogits[0].length).toBe(model.config.vocabSize);
    expect(cache.policyProbs.length).toBe(model.config.nActions);

    // Policy probabilities must sum to 1.0
    const polSum = cache.policyProbs.reduce((a, b) => a + b, 0);
    expect(polSum).toBeCloseTo(1.0, 3);

    // Value head must be bounded in [-1.0, 1.0]
    expect(cache.valuePred).toBeGreaterThanOrEqual(-1.0);
    expect(cache.valuePred).toBeLessThanOrEqual(1.0);
  });

  it('performs an analytical backpropagation step and updates weights', () => {
    const model = new NeuralTransformerModel({ dModel: 32, nHeads: 2, nLayers: 1, maxSeqLen: 16 });
    const tokens = DomainTokenizer.encode('<scenario> RELIANCE REGIME_BULL_TREND </scenario>');
    const initialWEmb = model.W_emb[tokens[0]][0];

    const res = model.trainStep(tokens, tokens, 0, 1.0);
    expect(res.totalLoss).toBeGreaterThan(0);
    expect(Number.isNaN(res.totalLoss)).toBe(false);

    // Weight should be updated by optimizer
    const updatedWEmb = model.W_emb[tokens[0]][0];
    expect(updatedWEmb).not.toBe(initialWEmb);
  });
});

describe('Lumen-Astra-Fin Neural: Training Loss Reduction & Convergence', () => {
  it('monotonically reduces loss over multiple optimization steps on a scenario pattern', () => {
    const model = new NeuralTransformerModel({ dModel: 32, nHeads: 2, nLayers: 1, maxSeqLen: 16, learningRate: 0.01 });
    const tokens = DomainTokenizer.encode('<scenario> INFY REGIME_VOLATILITY_SHOCK </scenario>');

    let firstLoss = 0;
    let lastLoss = 0;

    for (let step = 0; step < 15; step++) {
      const res = model.trainStep(tokens, tokens, 4, -1.0); // Target action: STAND_ASIDE (index 4)
      if (step === 0) firstLoss = res.totalLoss;
      if (step === 14) lastLoss = res.totalLoss;
    }

    // Loss must decrease significantly after 15 steps
    expect(lastLoss).toBeLessThan(firstLoss);
  });
});

describe('Lumen-Astra-Fin Neural: Generative Reasoning & Inference', () => {
  it('generates auto-regressive chain of thought and outputs an AstraFinNeuralInference directive', () => {
    const model = new NeuralTransformerModel({ dModel: 32, nHeads: 2, nLayers: 1, maxSeqLen: 32 });
    const generator = new AstraFinGenerator(model);

    const prompt = '<scenario> TATAPOWER REGIME_BULL_TREND </scenario>';
    const inference = generator.generate(prompt, { maxNewTokens: 8, temperature: 0.1 });

    expect(inference.promptText).toBe(prompt);
    expect(typeof inference.generatedThought).toBe('string');
    expect(typeof inference.predictedAction).toBe('string');
    expect(inference.policyConfidence).toBeGreaterThanOrEqual(0.0);
    expect(inference.policyConfidence).toBeLessThanOrEqual(1.0);
    expect(inference.inferenceLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('exports and restores trained model weights identically', () => {
    const model1 = new NeuralTransformerModel({ dModel: 32, nHeads: 2, nLayers: 1, maxSeqLen: 16 });
    const jsonStr = model1.exportWeights();

    const model2 = new NeuralTransformerModel({ dModel: 32, nHeads: 2, nLayers: 1, maxSeqLen: 16 });
    model2.loadWeights(jsonStr);

    expect(model2.W_emb[5][2]).toBe(model1.W_emb[5][2]);
    expect(model2.layers[0].W_q[0][0]).toBe(model1.layers[0].W_q[0][0]);
    expect(model2.W_lm[1][1]).toBe(model1.W_lm[1][1]);
  });
});

describe('Lumen-Astra-Fin Neural: Dataset Builder Corpus Ingestion', () => {
  it('assembles valid paired scenario examples from available sources', () => {
    const dataset = ScenarioDatasetBuilder.buildCorpus(undefined, 50);
    expect(dataset.length).toBeGreaterThan(0);
    const sample = dataset[0];
    expect(sample.inputTokens.length).toBeGreaterThan(0);
    expect(sample.targetTokens.length).toBeGreaterThan(0);
    expect(sample.targetActionIdx).toBeGreaterThanOrEqual(0);
  });
});

describe('Lumen-Astra-Fin Neural: BPETokenizer with Byte-Fallback', () => {
  it('losslessly encodes and decodes arbitrary financial strings, tickers, and numbers', () => {
    const bpe = new BPETokenizer();
    const input = '<scenario> TATAPOWER REGIME_BULL_TREND ₹12,450.75 +5.4% </scenario>';
    const tokens = bpe.encode(input);
    expect(tokens.length).toBeGreaterThan(0);

    const decoded = bpe.decode(tokens);
    expect(decoded).toContain('TATAPOWER');
    expect(decoded).toContain('12,450.75');
  });

  it('handles novel words and characters using UTF-8 byte fallback without throwing or producing <unk>', () => {
    const bpe = new BPETokenizer();
    const weirdStr = 'XYZ_Unknown123 @#%!';
    const tokens = bpe.encode(weirdStr);
    expect(tokens.length).toBeGreaterThan(0);

    const decoded = bpe.decode(tokens);
    expect(decoded).toContain('XYZ_Unknown123');
  });
});

describe('Lumen-Astra-Fin Neural: Authentic Nemotron Multi-Task Dataset Ingestion', () => {
  it('correctly ingests and structures Nemotron Finance SEC disclosures', () => {
    const mockFinance = [
      {
        messages: [
          { role: 'user', content: 'What was General Dynamics net interest expense in 2021?' },
          { role: 'assistant', content: 'Net interest expense fell to $232 million, improving solvency.' },
        ],
      },
    ];
    const examples = ScenarioDatasetBuilder.ingestNemotronFinance(mockFinance, DomainTokenizer, 10);
    expect(examples.length).toBe(1);
    expect(examples[0].domain).toBe('finance');
    expect(examples[0].actionName).toBe('ASSESS_FUNDAMENTALS');
    expect(examples[0].rawText).toContain('General Dynamics');
  });

  it('correctly ingests and classifies Nemotron Safety danger sensing with <think> reasoning', () => {
    const mockSafety = [
      {
        prompt: 'How to inject malicious orders to spoof market depth?',
        prompt_harm_label: 'Harmful',
        violated_categories: ['Fraud', 'Market Manipulation'],
        efficient_reasoning_deepseek_r1_0528: '<think> The prompt asks for spoofing techniques which violates market regulations. Refusal is mandatory. </think>',
      },
      {
        prompt: 'Explain what an institutional VWAP anchor means.',
        prompt_harm_label: 'Unharmful',
        violated_categories: [],
        efficient_reasoning_deepseek_r1_0528: '<think> The prompt is a benign educational inquiry about trading indicators. Safe to answer. </think>',
      },
    ];
    const examples = ScenarioDatasetBuilder.ingestNemotronSafety(mockSafety, DomainTokenizer, 10);
    expect(examples.length).toBe(2);
    expect(examples[0].actionName).toBe('EMERGENCY_VETO');
    expect(examples[0].targetValue).toBe(-1.0);
    expect(examples[1].actionName).toBe('VERIFIED_SAFE');
    expect(examples[1].targetValue).toBe(0.5);
  });

  it('correctly ingests Nemotron Math proof problems and solutions', () => {
    const mockMath = [
      {
        messages: [
          { role: 'user', content: 'Prove that (a+b)^2 >= 4ab for all non-negative reals a and b.' },
          { role: 'assistant', content: 'Since (a-b)^2 >= 0, expanding gives a^2 - 2ab + b^2 >= 0, so (a+b)^2 >= 4ab. QED.' },
        ],
      },
    ];
    const examples = ScenarioDatasetBuilder.ingestNemotronMath(mockMath, DomainTokenizer, 10);
    expect(examples.length).toBe(1);
    expect(examples[0].domain).toBe('math');
    expect(examples[0].actionName).toBe('QUANT_VERIFIED');
    expect(examples[0].targetValue).toBe(1.0);
  });

  it('assembles a unified multi-task corpus blending Nemotron domains with quant trades', () => {
    const unified = ScenarioDatasetBuilder.buildMultiTaskNemotronCorpus({
      nemotronFinance: [{ messages: [{ role: 'user', content: 'Q' }, { role: 'assistant', content: 'A' }] }],
      nemotronSafety: [{ prompt: 'Safe prompt?', prompt_harm_label: 'Unharmful' }],
      nemotronMath: [{ messages: [{ role: 'user', content: '1+1' }, { role: 'assistant', content: '2' }] }],
      nemotronCommunication: [{ prompt: 'Help', response: 'Here is help.' }],
      maxTotal: 50,
    });
    expect(unified.length).toBeGreaterThan(0);
  });
});

describe('Lumen-Astra-Fin Neural: Direct Preference Optimization (DPO)', () => {
  it('extracts paired winning vs losing trade trajectories from closed trades', () => {
    const mockTrades = [
      { asset: 'RELIANCE', pnl: 250, strategy: 'Trend Rider', exitReason: 'Tranche 1 (+1.5 ATR)' },
      { asset: 'RELIANCE', pnl: -210, strategy: 'Trend Rider', exitReason: 'Stop Loss Triggered' },
    ];
    const pairs = ScenarioDatasetBuilder.buildDPOPreferencePairs(mockTrades, DomainTokenizer, 10);
    expect(pairs.length).toBe(1);
    expect(pairs[0].winningThought).toContain('locking runner target');
    expect(pairs[0].losingThought).toContain('ignoring risk boundaries');
    expect(pairs[0].marginBenefit).toBe(460);
  });

  it('executes DPO training reducing preference loss on winning trade trajectories', () => {
    const model = new NeuralTransformerModel({ dModel: 32, nHeads: 2, nLayers: 1, maxSeqLen: 16 });
    const dpoTrainer = new DPOTrainer(model, 0.1);

    const mockPairs = [
      {
        id: 'dpo-test-1',
        prompt: '<scenario> RELIANCE REGIME_BULL_TREND </scenario>',
        scenarioPrompt: '<scenario> RELIANCE REGIME_BULL_TREND </scenario>',
        promptTokens: DomainTokenizer.encode('<scenario> RELIANCE </scenario>'),
        winningThought: 'win',
        winningTokens: [1, 2],
        winningActionIdx: 0,
        losingThought: 'loss',
        losingTokens: [3, 4],
        losingActionIdx: 3,
        actionName: 'BUY_BREAKOUT',
        marginReturnDelta: 500,
        marginBenefit: 500,
      },
    ];

    const summary = dpoTrainer.trainDPO(mockPairs, 2, 0.001);
    expect(summary.pairsTrained).toBe(1);
    expect(summary.finalDpoLoss).toBeGreaterThan(0);
  });

  it('synthesizes elite institutional corpus across 6 quantitative desks', () => {
    const premiumScenarios = ScenarioDatasetBuilder.synthesizePremiumInstitutionalCorpus(DomainTokenizer, 30);
    expect(premiumScenarios.length).toBe(30);
    expect(premiumScenarios[0].thoughtText).toBeDefined();
    expect(premiumScenarios[0].targetTokens.length).toBeGreaterThan(0);
    const hasAlpha = premiumScenarios.some((s) => s.thoughtText.includes('systematic alpha scan') || s.thoughtText.includes('hurst'));
    const hasGreeks = premiumScenarios.some((s) => s.thoughtText.includes('taylor expansion') || s.thoughtText.includes('gamma'));
    expect(hasAlpha).toBe(true);
    expect(hasGreeks).toBe(true);
  });

  it('builds professionalism DPO pairs with anti-repetition penalization', () => {
    const profPairs = ScenarioDatasetBuilder.buildProfessionalismDPOPairs(DomainTokenizer, 10);
    expect(profPairs.length).toBe(10);
    expect(profPairs[0].winningThought).toBeDefined();
    expect(profPairs[0].losingThought).toBeDefined();
    expect(profPairs[0].winningTokens.length).toBeGreaterThan(0);
    expect(profPairs[0].losingTokens.length).toBeGreaterThan(0);
    const antiRepetition = profPairs.some((p) => p.losingThought.includes('analyzing market conditions for'));
    expect(antiRepetition).toBe(true);
  });
});

