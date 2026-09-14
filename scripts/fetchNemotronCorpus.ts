#!/usr/bin/env npx tsx
/**
 * NVIDIA NEMOTRON DATASET INGESTOR & STREAMING CORPUS BUILDER
 *
 * Pulls authentic, unadulterated datasets directly from NVIDIA's official repositories on Hugging Face:
 * 1. nvidia/Nemotron-SpecializedDomains-Finance-v1:
 *    - SEC 10-K/10-Q corporate financial statements, balance sheets, revenues, profit margins.
 * 2. nvidia/Nemotron-Content-Safety-Reasoning-Dataset:
 *    - Threat sensing, risk taxonomy, regulatory violation, and DeepSeek-R1/GPT-OSS <think> safety reasoning.
 * 3. nvidia/Nemotron-Math-Proofs-v3-SFT:
 *    - Multi-step mathematical proof traces, quantitative arithmetic, formal logic.
 * 4. nvidia/HelpSteer2:
 *    - Open-source (CC-BY-4.0) helpfulness, factual communication, linguistic complexity, and coherence.
 *
 * Usage:
 *   npx tsx scripts/fetchNemotronCorpus.ts [--samples-per-domain=600]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as zlib from 'zlib';
import * as readline from 'readline';
import { Readable } from 'stream';

const OUTPUT_DIR = path.resolve(process.cwd(), 'artifacts/nemotron-data');

interface DomainConfig {
  name: string;
  url: string;
  outputFile: string;
  isGzip?: boolean;
  format: 'messages' | 'chatml' | 'safety' | 'helpsteer';
}

const DOMAINS: DomainConfig[] = [
  {
    name: 'Nemotron-Finance',
    url: 'https://huggingface.co/datasets/nvidia/Nemotron-SpecializedDomains-Finance-v1/resolve/main/data/train.jsonl',
    outputFile: 'nemotron_finance.jsonl',
    format: 'messages',
  },
  {
    name: 'Nemotron-Safety-Danger',
    url: 'https://huggingface.co/datasets/nvidia/Nemotron-Content-Safety-Reasoning-Dataset/resolve/main/aegis_v2_efficient_reasoning.jsonl',
    outputFile: 'nemotron_safety.jsonl',
    format: 'safety',
  },
  {
    name: 'Nemotron-Math-Proofs',
    url: 'https://huggingface.co/datasets/nvidia/Nemotron-Math-Proofs-v3-SFT/resolve/main/data/train-00000-of-00010.jsonl',
    outputFile: 'nemotron_math.jsonl',
    format: 'messages',
  },
  {
    name: 'Nemotron-HelpSteer2-Communication',
    url: 'https://huggingface.co/datasets/nvidia/HelpSteer2/resolve/main/train.jsonl.gz',
    outputFile: 'nemotron_communication.jsonl',
    isGzip: true,
    format: 'helpsteer',
  },
];

function fetchWithRedirects(url: string, maxRedirects = 6): Promise<Readable> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error(`Too many redirects for URL: ${url}`));
    }

    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
          Accept: '*/*',
        },
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          let nextUrl = res.headers.location;
          if (!nextUrl.startsWith('http')) {
            const parsed = new URL(url);
            nextUrl = `${parsed.origin}${nextUrl}`;
          }
          res.resume();
          fetchWithRedirects(nextUrl, maxRedirects - 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for URL: ${url}`));
        }

        resolve(res);
      }
    );

    req.on('error', reject);
    req.setTimeout(45000, () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

async function fetchDomainCorpus(domain: DomainConfig, targetSamples: number): Promise<number> {
  console.log(`\n================================================================================`);
  console.log(`[Fetching] ${domain.name} (Target: ${targetSamples} samples)`);
  console.log(`  Source: ${domain.url}`);
  console.log(`================================================================================`);

  const destPath = path.join(OUTPUT_DIR, domain.outputFile);
  const outStream = fs.createWriteStream(destPath, { encoding: 'utf8' });

  let fetchedCount = 0;
  let isClosed = false;
  let rawStream: Readable;

  try {
    rawStream = await fetchWithRedirects(domain.url);
  } catch (err: any) {
    console.error(`Failed to connect to ${domain.name}:`, err.message);
    outStream.close();
    return 0;
  }

  const inputStream = domain.isGzip ? rawStream.pipe(zlib.createGunzip()) : rawStream;
  const rl = readline.createInterface({
    input: inputStream,
    crlfDelay: Infinity,
  });

  return new Promise<number>((resolve) => {
    rl.on('line', (line: string) => {
      if (isClosed) return;
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const parsed = JSON.parse(trimmed);
        if (domain.format === 'messages' && !parsed.messages) return;
        if (domain.format === 'helpsteer' && !parsed.prompt) return;
        if (domain.format === 'safety' && !parsed.prompt) return;

        outStream.write(`${JSON.stringify(parsed)}\n`);
        fetchedCount++;

        if (fetchedCount % 100 === 0 || fetchedCount === targetSamples) {
          process.stdout.write(`  ↳ Ingested ${fetchedCount}/${targetSamples} records...\r`);
        }

        if (fetchedCount >= targetSamples) {
          isClosed = true;
          rl.close();
          rawStream.destroy();
          outStream.end();
          console.log(`\n  ✅ Successfully captured ${fetchedCount} samples -> ${destPath}`);
          resolve(fetchedCount);
        }
      } catch {
        // Skip partial or corrupted lines
      }
    });

    rl.on('close', () => {
      if (!isClosed) {
        isClosed = true;
        outStream.end();
        console.log(`\n  ℹ️ Stream completed with ${fetchedCount} samples -> ${destPath}`);
        resolve(fetchedCount);
      }
    });

    rl.on('error', (err) => {
      if (!isClosed) {
        isClosed = true;
        console.warn(`Stream warning for ${domain.name}:`, err.message);
        outStream.end();
        resolve(fetchedCount);
      }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  let samplesPerDomain = 600;
  for (const a of args) {
    if (a.startsWith('--samples-per-domain=')) {
      samplesPerDomain = parseInt(a.split('=')[1], 10);
    }
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('################################################################################');
  console.log('          NVIDIA NEMOTRON AUTHENTIC CORPUS INGESTION PIPELINE                  ');
  console.log('################################################################################');
  console.log(`Target Samples per Domain: ${samplesPerDomain}`);
  console.log(`Output Directory:          ${OUTPUT_DIR}`);

  const startTime = Date.now();
  const summary: Record<string, number> = {};

  for (const domain of DOMAINS) {
    const count = await fetchDomainCorpus(domain, samplesPerDomain);
    summary[domain.name] = count;
  }

  console.log('\n================================================================================');
  console.log('                      NVIDIA NEMOTRON INGESTION SUMMARY                         ');
  console.log('================================================================================');
  let totalRecords = 0;
  for (const [name, count] of Object.entries(summary)) {
    totalRecords += count;
    console.log(`  • ${name.padEnd(35)}: ${String(count).padStart(6)} verified records`);
  }
  console.log('--------------------------------------------------------------------------------');
  console.log(`  TOTAL REAL NEMOTRON SAMPLES:         ${String(totalRecords).padStart(6)}`);
  console.log(`  Total Duration:                      ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log('================================================================================\n');
}

main().catch((err) => {
  console.error('Fatal ingestion error:', err);
  process.exit(1);
});
