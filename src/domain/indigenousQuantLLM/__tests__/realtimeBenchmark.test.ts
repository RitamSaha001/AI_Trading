import { describe, it, expect } from 'vitest';
import {
  RealtimeModelBenchmark,
  STANDARD_BENCHMARK_SCENARIOS,
} from '../benchmarking/realtimeBenchmark';
import { globalAstraNexusBridge } from '../neural/nexusAstraBridge';
import { AppState, Market } from '../../../types';
import { NeuralTransformerModel, LARGE_1M_TRANSFORMER_CONFIG } from '../neural/transformerModel';

describe('RealtimeModelBenchmark Suite', () => {
  it('verifies LARGE_1M_TRANSFORMER_CONFIG parameter count exceeds 1,000,000 parameters', () => {
    const model = new NeuralTransformerModel(LARGE_1M_TRANSFORMER_CONFIG);
    const count = model.countParameters();
    // 4.32M Sparse MoE parameters (+525,768 parameters scaling for conversational & geopolitical intelligence)
    expect(count).toBeGreaterThan(1_000_000);
    expect(count).toBe(4_315_128);
  });

  it('verifies STANDARD_BENCHMARK_SCENARIOS contains 6 institutional quantitative domains', () => {
    expect(STANDARD_BENCHMARK_SCENARIOS.length).toBe(6);
    const categories = STANDARD_BENCHMARK_SCENARIOS.map((s) => s.category);
    expect(categories).toContain('NSE Microstructure & Lot Sizing');
    expect(categories).toContain('Derivatives & Hedging');
    expect(categories).toContain('Quantitative Mathematics');
    expect(categories).toContain('Autonomous Risk & Sentinel Defense');
    expect(categories).toContain('Corporate Finance & Statement Analysis');
    expect(categories).toContain('Statistical Arbitrage & Cointegration');
  });

  it('runs real-time multi-model benchmark and produces complete 6-factor report', () => {
    // Run benchmark on first 2 scenarios for fast unit testing
    const testScenarios = STANDARD_BENCHMARK_SCENARIOS.slice(0, 2);
    const report = RealtimeModelBenchmark.runBenchmark(testScenarios);

    expect(report).toBeDefined();
    expect(report.models.length).toBe(5);
    expect(report.summary.totalScenariosTested).toBe(2);

    const modelIds = report.models.map((m) => m.modelId);
    expect(modelIds).toContain('lumen-astra-fin-2.0');
    expect(modelIds).toContain('gpt-6-astra');
    expect(modelIds).toContain('fable-5.1');
    expect(modelIds).toContain('deepseek-r1-quant');
    expect(modelIds).toContain('heuristic-baseline');

    // Check Lumen-Astra-Fin 2.0 evaluation
    const lumen = report.models.find((m) => m.modelId === 'lumen-astra-fin-2.0')!;
    expect(lumen.quantIntelligenceIndex).toBeGreaterThanOrEqual(90);
    expect(lumen.grade).toBe('A+');
    expect(lumen.invariantsPassedCount).toBe(2);
    expect(lumen.factorAverages.microstructureCompliance).toBeGreaterThanOrEqual(90);
    expect(lumen.factorAverages.mathematicalPrecision).toBeGreaterThanOrEqual(90);
    expect(lumen.factorAverages.latencyEfficiency).toBeGreaterThanOrEqual(80);
  }, 25000);

  it('verifies factor weights strictly sum to 1.00', () => {
    const sc = STANDARD_BENCHMARK_SCENARIOS[0];
    const evalResult = RealtimeModelBenchmark.evaluateModelOnScenario('lumen-astra-fin-2.0', sc);
    const f = evalResult.factors;
    const totalWeight =
      f.microstructureCompliance.weight +
      f.mathematicalPrecision.weight +
      f.hallucinationResistance.weight +
      f.reasoningDepth.weight +
      f.riskDefenseEntropy.weight +
      f.latencyEfficiency.weight;
    expect(Math.abs(totalWeight - 1.0)).toBeLessThan(1e-6);
  });

  it(
    'integrates /benchmark command seamlessly into globalAstraNexusBridge chatbox',
    () => {
    const mockState: AppState = {
      schemaVersion: 2,
      cash: 25000,
      initialCash: 40000,
      startingEquity: 40000,
      realizedPnl: 1200,
      totalFees: 35,
      positions: {} as any,
      avgBuyPrice: {} as any,
      watchlist: ['RELIANCE', 'TATAPOWER'],
      orders: [],
      alerts: [],
      strategies: [],
      notifications: [],
      timeframe: '1D',
      selectedAsset: 'RELIANCE',
      settings: {
        geminiApiKey: '',
        geminiModel: 'gemini-3.8-flash',
        soundEnabled: false,
        theme: 'glass',
        maxSlippageBps: 20,
        enableWebSocket: true,
      },
    };

    const res = globalAstraNexusBridge.query('/benchmark', mockState, {});
    expect(res.reply).toContain('### 🏆 Real-Time Quantitative LLM Benchmark Report');
    expect(res.reply).toContain('Quantitative Model Leaderboard');
    expect(res.reply).toContain('Lumen-Astra-Fin 2.0');
    expect(res.reply).toContain('<think>');
    expect(res.reply).toContain('</think>');
    expect(res.telemetry.toolsUsed).toContain('realtime_model_benchmark');
  }, 25000);
});
