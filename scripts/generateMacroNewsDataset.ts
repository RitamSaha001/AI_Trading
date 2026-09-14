#!/usr/bin/env npx tsx
/**
 * LUMEN ASTRA: 1-MILLION GLOBAL MACRO & GEOPOLITICAL DATASET GENERATOR
 * 
 * Synthesizes a massive, concentrated 1,000,000-scenario dataset across 5 core pillars:
 * 1. Stocks & Equity Markets (200,000 scenarios)
 * 2. Commerce & Global Trade (200,000 scenarios)
 * 3. Governments & Central Banks (200,000 scenarios)
 * 4. Wars, Geopolitics & Military Defense (200,000 scenarios)
 * 5. Commodities & Energy (Crude Oil, Gas, Strategic Reserves) (200,000 scenarios)
 * 
 * Incorporates:
 * - Real-world harvested articles from `artifacts/macro-datasets/harvested_news_feed.json`
 * - DeepSeek-R1 test-time <think> deliberation traces
 * - Exchange invariants (₹0.05 tick size, cash reserve floor)
 * - Domain tokenization
 * 
 * Usage:
 *   npx tsx scripts/generateMacroNewsDataset.ts [--total=1000000] [--chunks=5] [--out-dir=artifacts/macro-datasets]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import {
  MacroDomain,
  generateSyntheticMacroScenario,
  DEFENSE_ENTITIES,
  COMMODITY_ENTITIES,
  CENTRAL_BANK_ENTITIES,
  COMMERCE_ENTITIES,
  EQUITY_ENTITIES,
} from '../src/domain/macroIntelligence/macroCausalTaxonomy';
import { DomainTokenizer } from '../src/domain/indigenousQuantLLM/neural/vocabulary';

function parseArgs() {
  const args = process.argv.slice(2);
  let total = 1000000;
  let chunks = 5;
  let outDir = path.resolve(process.cwd(), 'artifacts/macro-datasets');

  for (const a of args) {
    if (a.startsWith('--total=')) total = parseInt(a.split('=')[1], 10);
    if (a.startsWith('--chunks=')) chunks = parseInt(a.split('=')[1], 10);
    if (a.startsWith('--out-dir=')) outDir = path.resolve(process.cwd(), a.split('=')[1]);
  }

  return { total, chunks, outDir };
}

const DOMAINS: MacroDomain[] = [
  'STOCKS_AND_EQUITIES',
  'COMMERCE_AND_GLOBAL_TRADE',
  'GOVERNMENTS_AND_CENTRAL_BANKS',
  'WARS_GEOPOLITICS_AND_DEFENSE',
  'COMMODITIES_AND_OIL',
];

const ACTION_MAP: Record<string, number> = {
  BUY_BREAKOUT: 0,
  VWAP_PULLBACK: 1,
  MEAN_REVERT: 2,
  DEFENSIVE_EXIT: 3,
  STAND_ASIDE: 4,
  PROFIT_HARVEST: 5,
  EMERGENCY_VETO: 6,
  ACCUMULATE: 7,
  REDUCE: 8,
  HOLD: 9,
  ASSESS_FUNDAMENTALS: 10,
  VERIFIED_SAFE: 11,
  QUANT_VERIFIED: 12,
  COMMUNICATE: 13,
  COMMUNICATE_DIALOGUE: 14,
  EXPLAIN_CONCEPT: 15,
  CLARIFY_CONTEXT: 16,
  EMPATHETIC_RESPONSE: 17,
};

async function generateChunk(
  chunkIdx: number,
  samplesPerChunk: number,
  outPath: string,
  harvestedArticles: any[]
): Promise<number> {
  const fileWriteStream = fs.createWriteStream(outPath);
  const gzipStream = zlib.createGzip({ level: 6 });
  gzipStream.pipe(fileWriteStream);

  const domainIdx = (chunkIdx - 1) % DOMAINS.length;
  const primaryDomain = DOMAINS[domainIdx];
  let written = 0;

  console.log(`[Chunk ${chunkIdx}] Generating ${samplesPerChunk.toLocaleString()} scenarios for ${primaryDomain} -> ${path.basename(outPath)}`);

  for (let i = 0; i < samplesPerChunk; i++) {
    const seed = (chunkIdx - 1) * samplesPerChunk + i;
    const domain = i % 10 === 0 ? DOMAINS[i % DOMAINS.length] : primaryDomain;

    const scenario = generateSyntheticMacroScenario(domain, seed);

    // If we have harvested articles for this domain, occasionally ground the headline
    if (harvestedArticles.length > 0 && i % 4 === 0) {
      const art = harvestedArticles[(seed + i) % harvestedArticles.length];
      if (art && art.headline) {
        scenario.headline = art.headline;
        if (art.entities && art.entities.length > 0) {
          scenario.entities = art.entities;
        }
      }
    }

    const promptText = `<scenario> [${scenario.domain}] ${scenario.headline} | Entities: ${scenario.entities.join(', ')} </scenario>`;
    const targetText = `<think> ${scenario.thoughtTrace} </think> <action> ${scenario.action} </action> <verdict> ${scenario.verdictText} </verdict>`;

    const actionIdx = ACTION_MAP[scenario.action] ?? 4; // default STAND_ASIDE

    const record = {
      id: `macro_${domain.toLowerCase()}_${seed}`,
      domain: scenario.domain,
      prompt: promptText,
      target: targetText,
      thoughtText: scenario.thoughtTrace,
      action: scenario.action,
      targetActionIdx: actionIdx,
      urgency: scenario.urgency,
      entities: scenario.entities,
      channel: scenario.transmission.channel,
      marketImpact: scenario.transmission.finalMarketImpact,
    };

    const ok = gzipStream.write(JSON.stringify(record) + '\n');
    written++;

    if (!ok) {
      await new Promise((resolve) => gzipStream.once('drain', resolve));
    }

    if (written % 50000 === 0) {
      process.stdout.write(`  • Chunk ${chunkIdx}: ${written.toLocaleString()} / ${samplesPerChunk.toLocaleString()} records written\n`);
    }
  }

  gzipStream.end();
  await new Promise((resolve) => fileWriteStream.on('finish', resolve));
  return written;
}

async function main() {
  const { total, chunks, outDir } = parseArgs();

  console.log('================================================================================');
  console.log('     LUMEN ASTRA: 1-MILLION GLOBAL MACRO & GEOPOLITICAL DATASET GENERATOR       ');
  console.log('================================================================================');
  console.log(`[Config] Total Scenarios: ${total.toLocaleString()} across ${chunks} streaming chunks`);
  console.log(`[Target Directory]: ${outDir}`);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Load harvested live articles if present
  let harvestedArticles: any[] = [];
  const harvestPath = path.join(outDir, 'harvested_news_feed.json');
  if (fs.existsSync(harvestPath)) {
    try {
      harvestedArticles = JSON.parse(fs.readFileSync(harvestPath, 'utf8'));
      console.log(`[Seed Ingestion] Loaded ${harvestedArticles.length} live harvested articles as real-time seeds.`);
    } catch {}
  }

  const samplesPerChunk = Math.ceil(total / chunks);
  let totalGenerated = 0;
  const startTime = Date.now();

  for (let c = 1; c <= chunks; c++) {
    const chunkFile = path.join(outDir, `macro_1m_chunk_${c}_of_${chunks}.jsonl.gz`);
    const count = await generateChunk(c, samplesPerChunk, chunkFile, harvestedArticles);
    totalGenerated += count;
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('================================================================================');
  console.log(`✅ [Dataset Generation Complete] Successfully synthesized ${totalGenerated.toLocaleString()} scenarios!`);
  console.log(`   Time Taken: ${durationSec}s`);
  console.log(`   Location: ${outDir}`);
  console.log('================================================================================');
}

main().catch(console.error);
