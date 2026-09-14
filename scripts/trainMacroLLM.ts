#!/usr/bin/env npx tsx
/**
 * LUMEN ASTRA: GLOBAL MACRO & GEOPOLITICAL STREAMING TRAINER
 * 
 * Trains the 4,289,288 parameter Sparse MoE Neural Transformer on the
 * 1-Million Macro, Geopolitical, Defense, Oil, and Commerce Dataset.
 * 
 * Usage:
 *   npx tsx scripts/trainMacroLLM.ts [--epochs=3] [--batch-size=16] [--lr=0.0003] [--max-samples=20000]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as zlib from 'zlib';
import {
  NeuralTransformerModel,
  LARGE_1M_TRANSFORMER_CONFIG,
  AstraFinTrainer,
  ScenarioExample,
} from '../src/domain/indigenousQuantLLM/neural';
import { DomainTokenizer } from '../src/domain/indigenousQuantLLM/neural/vocabulary';

function parseArgs() {
  const args = process.argv.slice(2);
  let epochs = 3;
  let batchSize = 16;
  let lr = 0.0002;
  let maxSamples = 5000;
  let datasetDir = path.resolve(process.cwd(), 'artifacts/macro-datasets');
  let checkpointPath = path.resolve(process.cwd(), 'artifacts/fleet-replay-audit/lumen-astra-fin-weights-1m.json');

  for (const a of args) {
    if (a.startsWith('--epochs=')) epochs = parseInt(a.split('=')[1], 10);
    if (a.startsWith('--batch-size=')) batchSize = parseInt(a.split('=')[1], 10);
    if (a.startsWith('--lr=')) lr = parseFloat(a.split('=')[1]);
    if (a.startsWith('--max-samples=')) maxSamples = parseInt(a.split('=')[1], 10);
    if (a.startsWith('--dataset-dir=')) datasetDir = path.resolve(process.cwd(), a.split('=')[1]);
    if (a.startsWith('--checkpoint=')) checkpointPath = path.resolve(process.cwd(), a.split('=')[1]);
  }

  return { epochs, batchSize, lr, maxSamples, datasetDir, checkpointPath };
}

async function loadStreamingScenarios(datasetDir: string, maxSamples: number): Promise<ScenarioExample[]> {
  const scenarios: ScenarioExample[] = [];
  if (!fs.existsSync(datasetDir)) return scenarios;

  const files = fs.readdirSync(datasetDir).filter((f) => f.endsWith('.jsonl') || f.endsWith('.jsonl.gz')).sort();
  const perFileQuota = Math.ceil(maxSamples / Math.max(1, files.length));
  console.log(`[Dataset Stream] Ingesting ~${perFileQuota} samples from each of ${files.length} chunk domains...`);

  for (const file of files) {
    if (scenarios.length >= maxSamples) break;
    const fullPath = path.join(datasetDir, file);
    const rawStream = fs.createReadStream(fullPath);
    const inputStream = file.endsWith('.gz') ? rawStream.pipe(zlib.createGunzip()) : rawStream;
    const rl = readline.createInterface({ input: inputStream, crlfDelay: Infinity });
    let fileCount = 0;

    for await (const line of rl) {
      if (fileCount >= perFileQuota || scenarios.length >= maxSamples) {
        rl.close();
        rawStream.destroy();
        break;
      }
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const item = JSON.parse(trimmed);
        const inputTokens = DomainTokenizer.encode(item.prompt || '');
        const targetTokens = DomainTokenizer.encode(item.target || item.thoughtText || '');
        const targetActionIdx = typeof item.targetActionIdx === 'number' ? item.targetActionIdx : 4;
        const targetValue = typeof item.urgency === 'number' ? (item.urgency / 100) * 2 - 1 : 0.2;

        scenarios.push({
          id: item.id || `macro_sample_${scenarios.length}`,
          inputTokens,
          targetTokens,
          targetActionIdx,
          targetValue,
          thoughtText: item.thoughtText || '',
          category: 'macro_intelligence',
        });
        fileCount++;
      } catch {}
    }
  }

  return scenarios;
}

async function main() {
  const { epochs, batchSize, lr, maxSamples, datasetDir, checkpointPath } = parseArgs();

  console.log('================================================================================');
  console.log('    LUMEN ASTRA: GLOBAL MACRO, DEFENSE & COMMODITY NEURAL MODEL TRAINER         ');
  console.log('================================================================================');
  console.log(`[Model] 4,289,288 Parameter MoE Transformer (LARGE_1M_TRANSFORMER_CONFIG)`);
  console.log(`[Hyperparameters] Epochs: ${epochs} | Batch: ${batchSize} | LR: ${lr} | Target Samples: ${maxSamples.toLocaleString()}`);

  const model = new NeuralTransformerModel(LARGE_1M_TRANSFORMER_CONFIG);

  // Load existing fine-tuned weights if present
  if (fs.existsSync(checkpointPath)) {
    try {
      const rawWeights = fs.readFileSync(checkpointPath, 'utf8');
      model.loadWeights(rawWeights);
      console.log(`✅ [Checkpoint Loaded] Successfully restored pre-trained weights from:`);
      console.log(`   ${checkpointPath} (${model.countParameters().toLocaleString()} parameters)`);
    } catch (err: any) {
      console.warn(`⚠️ [Checkpoint Warning] Failed to load checkpoint: ${err?.message}. Training from base.`);
    }
  }

  // Load streaming dataset
  const dataset = await loadStreamingScenarios(datasetDir, maxSamples);
  console.log(`[Dataset Ingestion Complete] Loaded ${dataset.length.toLocaleString()} rich macro scenarios into training memory.`);

  if (dataset.length === 0) {
    console.error('❌ No dataset found. Run `scripts/generateMacroNewsDataset.ts` first!');
    process.exit(1);
  }

  // Execute Training
  console.log('\n================================================================================');
  console.log('      COMMENCING MACRO & GEOPOLITICAL ADAPTATION (AdamW Optimization)           ');
  console.log('================================================================================');
  console.log(' Epoch | Train Loss | Val Loss  | Policy Acc | Perplexity | Step Time (ms) ');
  console.log('--------------------------------------------------------------------------------');

  let lastTime = Date.now();
  const trainer = new AstraFinTrainer(model);
  const summary = trainer.train(dataset, {
    epochs,
    batchSize,
    learningRate: lr,
    valSplitPct: 0.15,
    saveWeightsCallback: (weightsJson) => {
      try {
        fs.writeFileSync(checkpointPath, weightsJson, 'utf8');
      } catch (err) {
        console.warn('Failed to write checkpoint:', err);
      }
    },
    onEpochEnd: (ep, tLoss, vLoss, acc) => {
      const stepTime = Date.now() - lastTime;
      lastTime = Date.now();
      const ppl = Math.exp(Math.min(10, tLoss)).toFixed(2);
      console.log(
        `   ${String(ep).padStart(2)}  |   ${tLoss.toFixed(4)}   |  ${vLoss.toFixed(4)}   |   ${acc.toFixed(1).padStart(5)}%   |   ${ppl.padStart(6)}   |    ${stepTime} ms`
      );
    },
  });

  console.log('--------------------------------------------------------------------------------');
  console.log(`✅ [Macro Adaptation Complete] Training Duration: ${(summary.trainingDurationMs / 1000).toFixed(2)}s`);
  console.log(`  • Final Train Loss:       ${summary.finalTrainLoss.toFixed(4)}`);
  console.log(`  • Final Val Loss:         ${summary.finalValLoss.toFixed(4)}`);
  console.log(`  • Final Policy Accuracy:  ${summary.finalPolicyAccuracyPct}%`);
  console.log(`  • Updated Checkpoint:     ${checkpointPath}`);
  console.log('================================================================================');
}

main().catch(console.error);
