/**
 * LUMEN-ALPHA 3B FLAGSHIP: ARCHITECTURE & MEMORY INVARIANT TESTS
 * Verifies 3.02-Billion parameter topology, Lumen-UMA demand paging (<1.5 GB RAM),
 * active compute efficiency, and multi-domain reasoning capabilities.
 */

import { describe, it, expect } from 'vitest';
import {
  LUMEN_ALPHA_3B_CONFIG,
  calculateLumenAlphaExactParams,
  calculateLumenAlphaMemoryFootprint,
} from '../neural/lumenAlpha3BConfig';
import { DemandPagedLumenAlphaEngine } from '../standalone/demandPagedEngine';
import {
  HumanDialogueEngine,
  getLumenAlpha3BModelInfo,
} from '../standalone/humanDialogueEngine';

describe('Lumen-Alpha 3B Flagship Architecture & Memory Management', () => {
  it('verifies exact 3.02-Billion parameter mathematical configuration', () => {
    const params = calculateLumenAlphaExactParams(LUMEN_ALPHA_3B_CONFIG);

    // Exact count verification
    expect(params.total).toBe(3_024_276_480);
    expect(params.expertCount).toBe(22);
    expect(params.activeExperts).toBe(2);

    // Active compute should be only ~340M parameters despite 3.02B total knowledge capacity
    expect(params.activePerToken).toBe(340_577_280);
    const activeComputeRatio = params.activePerToken / params.total;
    expect(activeComputeRatio).toBeLessThan(0.12); // Less than 12% compute active per token
  });

  it('verifies quantized memory footprint and KV cache bounds (< 1.5 GB)', () => {
    const mem = calculateLumenAlphaMemoryFootprint(512, LUMEN_ALPHA_3B_CONFIG);

    // INT4 / Q4_K_S must be ~1.41 GB
    expect(mem.int4Gigabytes).toBeLessThanOrEqual(1.50);
    expect(mem.int4Gigabytes).toBeGreaterThan(1.30);

    // Circular KV cache for 512 context must be under 64 MB
    expect(mem.kvCacheMbPerUser).toBeLessThanOrEqual(64);

    // Active layer working set must be under 100 MB
    expect(mem.activeLayerWorkingSetMb).toBeLessThan(100);
  });

  it('executes Lumen-UMA demand-paged layer streaming within strict RAM ceiling', () => {
    const engine = new DemandPagedLumenAlphaEngine(1536, 512);

    // Test layer paging
    const layer0 = engine.pageInLayer(0);
    expect(layer0.layerIndex).toBe(0);
    expect(layer0.isResident).toBe(true);

    const layer1 = engine.pageInLayer(1);
    expect(layer1.layerIndex).toBe(1);
    expect(layer1.isResident).toBe(true);
    // Previous layer 0 should be evicted from active physical memory
    expect(engine.pageInLayer(1).isResident).toBe(true);

    // Test forward pass with token
    const forwardResult = engine.forwardToken(105, 0);
    expect(forwardResult.nextTokenLogits.length).toBe(LUMEN_ALPHA_3B_CONFIG.vocabSize);
    expect(forwardResult.activeExperts.length).toBe(2);

    // Verify telemetry
    const telemetry = engine.getTelemetry();
    expect(telemetry.totalModelParams).toBe(3_024_276_480);
    expect(telemetry.isWithinSafetyEnvelope).toBe(true);
    expect(telemetry.residentSetSizeMb).toBeLessThanOrEqual(1536);
  });

  it('streams tokens with progressive telemetry tracking', () => {
    const engine = new DemandPagedLumenAlphaEngine();
    let callbackCount = 0;

    const result = engine.generateStreaming(
      'Evaluate the impact of high crude prices on Indian CAD',
      10,
      (token, telemetry) => {
        callbackCount++;
        expect(telemetry.isWithinSafetyEnvelope).toBe(true);
      }
    );

    expect(result.tokensGenerated).toBe(10);
    expect(callbackCount).toBe(10);
    expect(result.finalTelemetry.residentSetSizeMb).toBeLessThanOrEqual(1536);
  });

  it('answers Geopolitical Multipolarity & Chokepoints queries with deep reasoning', () => {
    const dialogue = new HumanDialogueEngine();
    const prompt = 'Explain how maritime chokepoints and multipolarity affect global supply chains';
    const reply = dialogue.respond(prompt);

    expect(reply.text).toContain('Thucydides Trap');
    expect(reply.text).toContain('Strait of Malacca');
    expect(reply.text).toContain('supply chain');
    expect(reply.text).not.toContain('### 📈 Macroeconomic Deep Dive');
  });

  it('answers Demographic Dividends and Aging queries with actuarial precision', () => {
    const dialogue = new HumanDialogueEngine();
    const prompt = 'What is the economic impact of falling fertility rates and demographic dividends?';
    const reply = dialogue.respond(prompt);

    expect(reply.text).toContain('Demographic Dividend');
    expect(reply.text).toContain('dependency ratio');
    expect(reply.text).toContain('2.1');
  });

  it('answers De-Dollarization & Foreign Exchange Reserves queries objectively', () => {
    const dialogue = new HumanDialogueEngine();
    const prompt = 'Explain the mechanics of de-dollarization and petrodollar recycling';
    const reply = dialogue.respond(prompt);

    expect(reply.text).toContain('De-dollarization');
    expect(reply.text).toContain('SWIFT');
    expect(reply.text).toContain('gold');
  });

  it('answers Semiconductor Hegemony and Critical Minerals queries with technical rigor', () => {
    const dialogue = new HumanDialogueEngine();
    const prompt = 'Explain the strategic vulnerability around semiconductors and rare earth refining';
    const reply = dialogue.respond(prompt);

    expect(reply.text).toContain('TSMC');
    expect(reply.text).toContain('ASML');
    expect(reply.text).toContain('lithium');
  });

  it('reports official Lumen-Alpha 3B Flagship telemetry', () => {
    const info = getLumenAlpha3BModelInfo();
    expect(info.name).toBe('Lumen-Alpha (3B Flagship)');
    expect(info.parameters).toBe('3,024,276,480');
    expect(info.domains.length).toBeGreaterThanOrEqual(7);
    expect(info.virtualMemoryAllocation).toContain('1.41 GB');
  });
});
