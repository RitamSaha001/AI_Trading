import { describe, it, expect } from 'vitest';
import {
  encodeSensoryNeurons,
  computeCrossAttentionWeights,
  evaluateStatutoryFeeArmor,
  evaluateMicrostructureAdverseDrift,
  evaluateSynapticNeuralWeb,
  SynapticNeuralWebInputs,
} from '../synapticNeuralWeb';
import { FleetMacroBreadthResult } from '../macroRegimeEngine';

describe('Synaptic Neural Web Engine (Prototype 3: Synaptic Neural Mesh)', () => {
  const sampleBreadth: FleetMacroBreadthResult = {
    totalAssetsEvaluated: 100,
    assetsAboveVwapCount: 70,
    breadthAboveVwapPct: 70,
    advancingAssetsCount: 65,
    decliningAssetsCount: 35,
    advanceDeclineRatio: 1.85,
    fleetMeanChangePct: 0.65,
    macroRegime: 'BULL_MOMENTUM',
    directionalPermission: 'LONG_ONLY',
    convictionAdjustment: 5,
    rationale: 'Strong institutional breadth',
  };

  describe('1. Sensory Neuron Encoders', () => {
    it('normalizes all 8 sensory neurons within mathematical bounds', () => {
      const inputs: SynapticNeuralWebInputs = {
        istMinutes: 9 * 60 + 45, // 09:45 AM
        marketPrice: 1500,
        dayOpenPrice: 1485,
        vwap: 1492,
        atr: 15,
        hurst: 0.64,
        squeezeStatus: 'SQUEEZE_OFF',
        volumeSurgeRatio: 2.2,
        hasInstitutionalVolume: true,
        ouZScore: 0.1,
        macroBreadth: sampleBreadth,
        sectorRank: 1,
        sectorAvgChange: 1.5,
        sectorAdvanceRatio: 0.80,
        reputationScore: 90,
      };

      const neurons = encodeSensoryNeurons(inputs);

      expect(neurons.macroBreadth).toBeGreaterThanOrEqual(-1.0);
      expect(neurons.macroBreadth).toBeLessThanOrEqual(1.0);

      expect(neurons.fractalPersistence).toBeGreaterThan(0.5); // High Hurst + squeeze off
      expect(neurons.fractalPersistence).toBeLessThanOrEqual(1.0);

      expect(neurons.orderFlowSurge).toBeGreaterThanOrEqual(0.0);
      expect(neurons.orderFlowSurge).toBeLessThanOrEqual(1.0);

      expect(neurons.sectorTailwind).toBeGreaterThan(0.5); // Sector leader
      expect(neurons.sectorTailwind).toBeLessThanOrEqual(1.0);

      expect(neurons.assetReputation).toBe(0.9);
    });

    it('penalizes fractal persistence during extreme volatility shocks (ATR/P > 4.5%)', () => {
      const inputs: SynapticNeuralWebInputs = {
        istMinutes: 10 * 60,
        marketPrice: 100,
        dayOpenPrice: 95,
        vwap: 98,
        atr: 6.0, // 6.0% ATR/Price shock!
        hurst: 0.68,
        squeezeStatus: 'SQUEEZE_OFF',
        volumeSurgeRatio: 1.5,
        ouZScore: 0,
        macroBreadth: sampleBreadth,
        sectorRank: 3,
        sectorAvgChange: 0.2,
        sectorAdvanceRatio: 0.5,
      };

      const neurons = encodeSensoryNeurons(inputs);
      expect(neurons.fractalPersistence).toBeLessThan(0.60); // Halved by volatility shock dampener
    });
  });

  describe('2. Synaptic Cross-Attention & Gating Mesh', () => {
    it('ensures attention weights sum to 1.0 (softmax normalization)', () => {
      const attMorning = computeCrossAttentionWeights(9 * 60 + 45, 0.5, 0.2);
      const sumMorning = Object.values(attMorning).reduce((a, b) => a + b, 0);
      expect(sumMorning).toBeCloseTo(1.0, 4);

      const attMidday = computeCrossAttentionWeights(12 * 60, 0.1, -0.1);
      const sumMidday = Object.values(attMidday).reduce((a, b) => a + b, 0);
      expect(sumMidday).toBeCloseTo(1.0, 4);
    });

    it('suppresses breakout persistence and elevates VWAP curvature during midday chop (11:30 - 13:15 IST)', () => {
      const attMorning = computeCrossAttentionWeights(9 * 60 + 45, 0.5, 0.2);
      const attMidday = computeCrossAttentionWeights(12 * 60 + 15, 0.1, 0.0);

      expect(attMidday.fractalAttention).toBeLessThan(attMorning.fractalAttention);
      expect(attMidday.vwapAttention).toBeGreaterThan(attMorning.vwapAttention);
    });
  });

  describe('3. Statutory Fee Armor Evaluator', () => {
    it('approves trades with high expected net alpha above statutory hurdle', () => {
      const result = evaluateStatutoryFeeArmor(
        1500, // Price
        25,   // Quantity (Notional ₹37,500)
        18,   // ATR
        0.70, // 70% win rate
        1.5,  // 1.5 ATR target
        1.2   // 1.2 ATR stop
      );

      expect(result.allowsTrade).toBe(true);
      expect(result.expectedNetAlphaInr).toBeGreaterThan(65);
      expect(result.roundtripFrictionInr).toBeGreaterThan(0);
    });

    it('vetoes trades where statutory fees consume expected alpha (sub-₹65 hurdle)', () => {
      const result = evaluateStatutoryFeeArmor(
        150,  // Low price
        5,    // Tiny quantity (Notional ₹750)
        1.2,  // ATR
        0.52, // 52% win rate
        1.0,
        1.0
      );

      expect(result.allowsTrade).toBe(false);
      expect(result.rationale).toContain('Fee Armor Veto');
    });
  });

  describe('4. Microstructure Adverse Drift Synapse (MADS)', () => {
    it('triggers immediate scratch exit when trade drops >= 0.35 ATR below entry in first 25m and breaks VWAP', () => {
      const entryPrice = 1000;
      const atr = 10;
      const currentPrice = 996; // -4 points = -0.40 ATR loss
      const elapsedMinutes = 18; // In the 10-25m window
      const vwap = 998;          // Below VWAP
      const highWaterMark = 1001;

      const res = evaluateMicrostructureAdverseDrift(
        entryPrice,
        currentPrice,
        atr,
        elapsedMinutes,
        vwap,
        highWaterMark,
        0
      );

      expect(res.shouldScratch).toBe(true);
      expect(res.scratchType).toBe('IMMEDIATE_REJECTION');
      expect(res.lossAtrMultiples).toBeCloseTo(0.40, 2);
      expect(res.reason).toContain('MADS Micro-Loss Scratch');
    });

    it('does not scratch if the trade has already locked in profit or risk-free stage', () => {
      const res = evaluateMicrostructureAdverseDrift(
        1000,
        995,
        10,
        15,
        997,
        1015,
        1 // Tranche stage 1 (breakeven locked)
      );

      expect(res.shouldScratch).toBe(false);
    });
  });

  describe('5. Authoritative Neural Web Forward Pass', () => {
    it('activates Super-Trend Highway mode and expands leverage up to 4.0x+ on high-confluence leaders', () => {
      const inputs: SynapticNeuralWebInputs = {
        istMinutes: 9 * 60 + 48, // Morning expansion
        marketPrice: 2400,
        dayOpenPrice: 2360,
        vwap: 2385,
        atr: 28,
        hurst: 0.66,
        squeezeStatus: 'SQUEEZE_OFF',
        volumeSurgeRatio: 2.8,
        hasInstitutionalVolume: true,
        ouZScore: 0.2,
        macroBreadth: sampleBreadth,
        sectorRank: 1, // Sector leader
        sectorAvgChange: 1.8,
        sectorAdvanceRatio: 0.85,
        reputationScore: 95,
        projectedNotional: 35000,
        projectedQuantity: 14,
      };

      const directive = evaluateSynapticNeuralWeb(inputs);

      expect(directive.actionPermission).toBe('PERMITTED');
      expect(directive.neuralAlphaScore).toBeGreaterThanOrEqual(70);
      expect(directive.highwayMode).toBe('SUPER_TREND_HIGHWAY');
      expect(directive.marginMultiplier).toBeGreaterThanOrEqual(3.5);
      expect(directive.trancheTargets.tranche2Atr).toBe(3.00); // Expanded target
      expect(directive.maxRiskRupees).toBeGreaterThanOrEqual(300);
    });

    it('blocks marginal setups below the neural conviction threshold', () => {
      const poorBreadth: FleetMacroBreadthResult = {
        ...sampleBreadth,
        advanceDeclineRatio: 0.4,
        breadthAboveVwapPct: 30,
        advancingAssetsCount: 25,
        decliningAssetsCount: 75,
        macroRegime: 'BEAR_MOMENTUM',
      };

      const inputs: SynapticNeuralWebInputs = {
        istMinutes: 12 * 60, // Midday chop
        marketPrice: 500,
        dayOpenPrice: 502,
        vwap: 501,
        atr: 5,
        hurst: 0.44, // Mean-reverting / choppy
        squeezeStatus: 'SQUEEZE_ON',
        volumeSurgeRatio: 0.9,
        ouZScore: -0.5,
        macroBreadth: poorBreadth,
        sectorRank: 6, // Laggard sector
        sectorAvgChange: -0.8,
        sectorAdvanceRatio: 0.2,
        reputationScore: 60,
      };

      const directive = evaluateSynapticNeuralWeb(inputs);

      expect(directive.actionPermission).toBe('BLOCKED_LOW_NEURAL_CONVICTION');
      expect(directive.neuralAlphaScore).toBeLessThan(60.0);
    });
  });
});
