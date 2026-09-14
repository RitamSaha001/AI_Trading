#!/usr/bin/env npx tsx
/**
 * LUMEN-ASTRA-FIN 2.0: MULTI-TASK NEURAL TRANSFORMER TRAINING ENGINE
 *
 * Trains the Sovereign Neural Transformer on:
 * 1. Authentic NVIDIA Nemotron Datasets:
 *    - Nemotron-Finance (SEC 10-K & 10-Q balance sheets, solvency, revenue analysis)
 *    - Nemotron-Safety-Danger (Threat sensing, risk taxonomy, DeepSeek-R1 <think> reasoning)
 *    - Nemotron-Math-Proofs (Quantitative mathematics, arithmetic, and formal proofs)
 *    - Nemotron-HelpSteer2 (Instruction following, clarity, and coherent communication)
 * 2. Real Quant Trading Trajectories from 5-Year Replay Audits & Stress Suites.
 * 3. Direct Preference Optimization (DPO) on winning vs losing trade trajectories.
 *
 * Usage:
 *   npx tsx scripts/trainAstraFinLLM.ts [--epochs=5] [--batch-size=16] [--lr=0.001] [--max-scenarios=3000] [--dpo-epochs=3]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import {
  NeuralTransformerModel,
  ScenarioDatasetBuilder,
  AstraFinTrainer,
  AstraFinGenerator,
  DPOTrainer,
  ScenarioExample,
  DPOPreferencePair,
} from '../src/domain/indigenousQuantLLM/neural';

function parseArgs(): {
  epochs: number;
  batchSize: number;
  lr: number;
  maxScenarios: number;
  dpoEpochs: number;
} {
  const args = process.argv.slice(2);
  let epochs = 5;
  let batchSize = 16;
  let lr = 0.001;
  let maxScenarios = 3000;
  let dpoEpochs = 3;

  for (const a of args) {
    if (a.startsWith('--epochs=')) epochs = parseInt(a.split('=')[1], 10);
    if (a.startsWith('--batch-size=')) batchSize = parseInt(a.split('=')[1], 10);
    if (a.startsWith('--lr=')) lr = parseFloat(a.split('=')[1]);
    if (a.startsWith('--max-scenarios=')) maxScenarios = parseInt(a.split('=')[1], 10);
    if (a.startsWith('--dpo-epochs=')) dpoEpochs = parseInt(a.split('=')[1], 10);
  }

  return { epochs, batchSize, lr, maxScenarios, dpoEpochs };
}

function compactRecord(parsed: any): any {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const out: any = {};
  if (Array.isArray(parsed.messages)) {
    out.messages = parsed.messages.map((m: any) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content.slice(0, 1000) : '',
    }));
  }
  if (typeof parsed.prompt === 'string') out.prompt = parsed.prompt.slice(0, 1000);
  if (typeof parsed.response === 'string') out.response = parsed.response.slice(0, 1000);
  if (typeof parsed.problem === 'string') out.problem = parsed.problem.slice(0, 1000);
  if (typeof parsed.solution === 'string') out.solution = parsed.solution.slice(0, 1000);
  if (typeof parsed.question === 'string') out.question = parsed.question.slice(0, 1000);
  if (typeof parsed.proof === 'string') out.proof = parsed.proof.slice(0, 1000);
  if (typeof parsed.label === 'string' || typeof parsed.label === 'boolean') out.label = parsed.label;
  if (typeof parsed.response_harmful === 'boolean') out.response_harmful = parsed.response_harmful;
  if (typeof parsed.prompt_harmful === 'boolean') out.prompt_harmful = parsed.prompt_harmful;
  return out;
}

async function loadJsonlFile(filePath: string, maxLines = 1000): Promise<any[]> {
  if (!fs.existsSync(filePath)) return [];
  const records: any[] = [];
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (records.length >= maxLines) {
      rl.close();
      fileStream.destroy();
      break;
    }
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      records.push(compactRecord(parsed));
    } catch {
      // skip partial
    }
  }
  return records;
}

async function main() {
  const { epochs, batchSize, lr, maxScenarios, dpoEpochs } = parseArgs();

  console.log('================================================================================');
  console.log('           LUMEN-ASTRA-FIN 2.0: SOVEREIGN NEURAL TRANSFORMER TRAINING           ');
  console.log('                 (Real NVIDIA Nemotron Multi-Task + DPO Alignment)              ');
  console.log('================================================================================');
  console.log(`[Config] Epochs: ${epochs} | Batch Size: ${batchSize} | Learning Rate: ${lr} | Target Samples: ${maxScenarios}`);

  const nemotronDir = path.resolve(process.cwd(), 'artifacts/nemotron-data');
  const auditDir = path.resolve(process.cwd(), 'artifacts/fleet-replay-audit');

  const perDomainLimit = Math.ceil(maxScenarios / 3.2);
  console.log(`\n[Dataset Ingestion] Loading genuine NVIDIA Nemotron corpora from ${nemotronDir} (limit: ${perDomainLimit}/domain)...`);
  const finRecords = await loadJsonlFile(path.join(nemotronDir, 'nemotron_finance.jsonl'), perDomainLimit);
  const safeRecords = await loadJsonlFile(path.join(nemotronDir, 'nemotron_safety.jsonl'), perDomainLimit);
  const mathRecords = await loadJsonlFile(path.join(nemotronDir, 'nemotron_math.jsonl'), perDomainLimit);
  const commRecords = await loadJsonlFile(path.join(nemotronDir, 'nemotron_communication.jsonl'), perDomainLimit);

  console.log(`  • Nemotron-Finance records loaded:       ${finRecords.length}`);
  console.log(`  • Nemotron-Safety records loaded:        ${safeRecords.length}`);
  console.log(`  • Nemotron-Math records loaded:          ${mathRecords.length}`);
  console.log(`  • Nemotron-Communication records loaded: ${commRecords.length}`);

  // Ingest 5-Year Replay Audits
  console.log(`\n[Dataset Ingestion] Ingesting 5-year trading replay audits from ${auditDir} ...`);
  const rawAudits: any[] = [];
  const allClosedTrades: any[] = [];

  if (fs.existsSync(auditDir)) {
    try {
      const files = fs.readdirSync(auditDir).filter((f) => f.endsWith('.json') && !f.includes('weights'));
      for (const file of files) {
        const fullPath = path.join(auditDir, file);
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.length > 35 * 1024 * 1024) continue;
          const parsed = JSON.parse(content);
          rawAudits.push(parsed);
          if (Array.isArray(parsed.allClosedTrades)) {
            allClosedTrades.push(...parsed.allClosedTrades);
          } else if (Array.isArray(parsed.dailyBreakdown)) {
            for (const d of parsed.dailyBreakdown) {
              if (Array.isArray(d.closedTrades)) {
                allClosedTrades.push(...d.closedTrades);
              }
            }
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }
  console.log(`  • Audit replay snapshots loaded: ${rawAudits.length} files (${allClosedTrades.length} closed trades)`);

  // Assemble Multi-Task Dataset
  console.log('\n[Dataset Builder] Synthesizing balanced multi-task training corpus...');
  const dataset = ScenarioDatasetBuilder.buildMultiTaskNemotronCorpus({
    nemotronFinance: finRecords,
    nemotronSafety: safeRecords,
    nemotronMath: mathRecords,
    nemotronCommunication: commRecords,
    rawAuditDataList: rawAudits,
    maxTotal: maxScenarios,
  });

  console.log(`[Dataset] Successfully assembled ${dataset.length} authentic multi-task training sequences!`);

  // Analyze Domain Breakdown
  const domainCounts: Record<string, number> = {};
  const actionCounts: Record<string, number> = {};
  for (const ex of dataset) {
    const d = ex.domain || 'quant_trading';
    domainCounts[d] = (domainCounts[d] || 0) + 1;
    actionCounts[ex.actionName] = (actionCounts[ex.actionName] || 0) + 1;
  }

  console.log('\n[Multi-Task Dataset Breakdown by Domain]:');
  for (const [dom, cnt] of Object.entries(domainCounts)) {
    const pct = ((cnt / dataset.length) * 100).toFixed(1);
    console.log(`  • ${dom.padEnd(20)}: ${String(cnt).padStart(5)} (${pct}%)`);
  }

  console.log('\n[Policy Action Target Breakdown]:');
  for (const [act, cnt] of Object.entries(actionCounts)) {
    const pct = ((cnt / dataset.length) * 100).toFixed(1);
    console.log(`  • ${act.padEnd(22)}: ${String(cnt).padStart(5)} (${pct}%)`);
  }

  // Initialize Model & Trainer
  console.log('\n[Model] Initializing Decoder-only Multi-Head Self-Attention Transformer with Sparse MoE:');
  const model = new NeuralTransformerModel({
    dModel: 64,
    nHeads: 4,
    nLayers: 2,
    maxSeqLen: 64,
    learningRate: lr,
    useMoE: true,
    nExperts: 4,
  });
  console.log(`  • Embedding Dimension (d_model): ${model.config.dModel}`);
  console.log(`  • Attention Heads (h):          ${model.config.nHeads}`);
  console.log(`  • Transformer Layers (L):       ${model.config.nLayers}`);
  console.log(`  • Sparse MoE Experts:           ${model.config.nExperts} routed experts (Top-2)`);
  console.log(`  • Context Window (T):           ${model.config.maxSeqLen} tokens (NTK-extensible)`);
  console.log(`  • Vocabulary Size:              ${model.config.vocabSize} tokens (BPE + 256 byte-fallback)`);
  console.log(`  • Policy Actions:               ${model.config.nActions} classes`);

  const checkpointPath = path.join(auditDir, 'lumen-astra-fin-weights.json');

  // ============================================================================
  // STAGE 1: MULTI-TASK SUPERVISED PRETRAINING / SFT
  // ============================================================================
  console.log('\n================================================================================');
  console.log(' STAGE 1: MULTI-TASK SUPERVISED INSTRUCTION PRETRAINING (AdamW Optimization)   ');
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
  console.log(`[Stage 1 Complete] Duration: ${(summary.trainingDurationMs / 1000).toFixed(2)}s`);
  console.log(`  • Final Train Loss:       ${summary.finalTrainLoss.toFixed(4)}`);
  console.log(`  • Final Val Loss:         ${summary.finalValLoss.toFixed(4)}`);
  console.log(`  • Final Policy Accuracy:  ${summary.finalPolicyAccuracyPct}%`);

  // ============================================================================
  // STAGE 2: DIRECT PREFERENCE OPTIMIZATION (DPO) ON TRADE TRAJECTORIES
  // ============================================================================
  console.log('\n================================================================================');
  console.log(' STAGE 2: DIRECT PREFERENCE OPTIMIZATION (DPO) ON HISTORICAL TRADE TRAJECTORIES ');
  console.log('================================================================================');

  const dpoPairs = ScenarioDatasetBuilder.buildDPOPreferencePairs(allClosedTrades, undefined, 400);
  console.log(`[DPO] Extracted ${dpoPairs.length} paired winning vs losing trade trajectories.`);

  if (dpoPairs.length > 0) {
    const dpoTrainer = new DPOTrainer(model, 0.1);
    const dpoSummary = dpoTrainer.trainDPO(dpoPairs, dpoEpochs, 0.0005);
    console.log(`[DPO Complete]`);
    console.log(`  • Pairs Optimized:             ${dpoSummary.pairsTrained}`);
    console.log(`  • Initial DPO Loss:            ${dpoSummary.initialDpoLoss.toFixed(4)}`);
    console.log(`  • Final DPO Loss:              ${dpoSummary.finalDpoLoss.toFixed(4)}`);
    console.log(`  • Win Preference Accuracy:     ${dpoSummary.winPreferenceAccuracyPct.toFixed(1)}%`);

    // Save aligned checkpoint
    fs.writeFileSync(checkpointPath, model.exportWeights(), 'utf8');
    console.log(`  • Updated Checkpoint saved to: ${checkpointPath}`);
  }

  // ============================================================================
  // STAGE 3: MULTI-DOMAIN GENERATIVE REASONING INFERENCE BENCHMARK
  // ============================================================================
  console.log('\n================================================================================');
  console.log('     MULTI-DOMAIN GENERATIVE INFERENCE & REASONING VALIDATION BENCHMARK        ');
  console.log('================================================================================');

  const generator = new AstraFinGenerator(model);

  const testPrompts = [
    {
      domain: 'Nemotron Finance (SEC 10-K Solvency Analysis)',
      prompt: '<scenario> DOMAIN_FINANCE_SEC General Dynamics: Net interest expense fell in 2021. Assess operating solvency and balance sheet health. </scenario>',
    },
    {
      domain: 'Nemotron Safety / Threat Sensing (Adversarial Danger)',
      prompt: '<scenario> DOMAIN_RISK_SAFETY Threat detected: malicious spoofing and unauthorized capital liquidation attempt. </scenario>',
    },
    {
      domain: 'Nemotron Mathematics (Quantitative Proof & Arithmetic)',
      prompt: '<scenario> DOMAIN_QUANT_MATH Let a,b,c be positive reals. Prove that a/(b+c) + b/(a+c) + c/(a+b) >= 3/2. </scenario>',
    },
    {
      domain: 'Live Quant Trading (NSE/BSE Bull Breakout Signal)',
      prompt: '<scenario> TATAPOWER REGIME_BULL_TREND ACI_EXEMPLARY_85_PLUS ABOVE_VWAP_EXPANSION VOLUME_SURGE_STRONG_2X </scenario>',
    },
    {
      domain: 'Live Quant Trading (NSE/BSE Volatility Shock Risk Defense)',
      prompt: '<scenario> INFY REGIME_VOLATILITY_SHOCK ACI_SUBPAR_BELOW_65 BELOW_VWAP_FAILED VOLUME_SURGE_EXTREME_3X </scenario>',
    },
  ];

  for (const t of testPrompts) {
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`[Domain]: ${t.domain}`);
    console.log(`[Prompt]: ${t.prompt}`);
    const inference = generator.generateBestOfN(t.prompt, 3, { maxNewTokens: 32, temperature: 0.2 });
    console.log(`[Generated Chain-of-Thought Reasoning]:\n  ${inference.generatedThought}`);
    if (inference.hasReflected) {
      console.log(`[Test-Time Reflection]: ${inference.reflectionNote}`);
    }
    console.log(
      `[Policy Directive]: Action: ${inference.predictedAction.padEnd(16)} | Confidence: ${(inference.policyConfidence * 100).toFixed(1)}% | Entropy: ${inference.policyEntropy} bits | Expected Return: ${inference.expectedReturnValue} | Rank Score: ${inference.candidateRankScore} | Sizing: ${inference.suggestedRiskMultiplier}x | Latency: ${inference.inferenceLatencyMs}ms`
    );
  }

  console.log('\n================================================================================');
  console.log('✅ LUMEN-ASTRA-FIN 2.0 IS FULLY TRAINED ON REAL NVIDIA NEMOTRON & REPLAY DATA!');
  console.log('================================================================================\n');
}

main().catch((err) => {
  console.error('Fatal error during training:', err);
  process.exit(1);
});
