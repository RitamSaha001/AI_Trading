#!/usr/bin/env tsx
/**
 * High-Speed Concurrent 5-Year Historical Candle Ingestion Engine
 * 
 * Ingests 1-minute and 30-minute historical intraday candles from Upstox API
 * for all 100 Indian equities from 2022-01-03 to 2026-09-10 (~1,214 trading days).
 * 
 * Features:
 * - Persistent HTTP Keep-Alive connection pooling
 * - Multi-worker concurrency (configurable, default 6 concurrent stocks)
 * - Daily slicing into .cache/upstox-candles/{safeKey}_{YYYY-MM-DD}_1m.json
 * - Resumability: skips days/chunks already present on disk
 * - Cloudflare rate-limit / 429 exponential backoff handling
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import https from 'node:https';
import { UPSTOX_FLEET_ASSETS } from '../src/domain/autonomousPilotEngine';
import { UpstoxInstrumentRegistry } from '../server/services/brokers/upstox/upstoxInstrumentRegistry';
import { IndianMarketCalendar } from '../server/services/brokers/upstox/indianMarketCalendar';

const CACHE_DIR = join(process.cwd(), '.cache', 'upstox-candles');

// Persistent HTTPS agent to reuse TLS sockets and eliminate handshake latency
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 25,
  maxFreeSockets: 10,
  timeout: 30000,
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = 5): Promise<{ ok: boolean; candles: any[] }> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        // @ts-ignore
        agent: httpsAgent,
      });

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 30;
        console.log(`\n  [Rate Limit 429] Backing off for ${retryAfter + 2}s...`);
        await sleep((retryAfter + 2) * 1000);
        continue;
      }

      attempt++;
      if (res.status >= 500) {
        await sleep(1500 * attempt);
        continue;
      }

      if (!res.ok) {
        if (res.status === 400 || res.status === 404) {
          return { ok: true, candles: [] };
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data: any = await res.json();
      return { ok: true, candles: data?.data?.candles || [] };
    } catch (err: any) {
      attempt++;
      if (attempt >= retries) {
        console.warn(`  [Warning] Failed to fetch ${url}: ${err.message}`);
        return { ok: false, candles: [] };
      }
      await sleep(1500 * attempt);
    }
  }
  return { ok: false, candles: [] };
}

async function prefetchAsset(
  asset: string,
  startDt: Date,
  endDt: Date,
  tradingDays: string[],
  intervals1m: { from: string; to: string }[],
  chunks30m: { from: string; to: string }[]
): Promise<void> {
  const inst = UpstoxInstrumentRegistry.get(asset);
  if (!inst) {
    console.warn(`[Skip] No instrument found for ${asset}`);
    return;
  }

  const safeKey = inst.instrumentKey.replace(/[^a-zA-Z0-9]/g, '_');
  const encoded = encodeURIComponent(inst.instrumentKey);

  // Check how many days are missing
  const missing1m = tradingDays.filter((d) => !existsSync(join(CACHE_DIR, `${safeKey}_${d}_1m.json`)));
  const missing30m = tradingDays.filter((d) => !existsSync(join(CACHE_DIR, `${safeKey}_${d}_30m.json`)));

  if (missing1m.length === 0 && missing30m.length === 0) {
    console.log(`[Cache Hit] ${asset} is already 100% cached (${tradingDays.length} days). Skipping.`);
    return;
  }

  console.log(`[Syncing] ${asset} -> missing ${missing1m.length} 1m days, ${missing30m.length} 30m days...`);

  // 1. Fetch 30m baseline candles if needed
  if (missing30m.length > 0) {
    const all30mCandles: any[] = [];
    let fetchSuccess = true;
    for (const ch of chunks30m) {
      const url30m = `https://api.upstox.com/v2/historical-candle/${encoded}/30minute/${ch.to}/${ch.from}`;
      const { ok, candles: raw30 } = await fetchWithRetry(url30m);
      if (!ok) {
        fetchSuccess = false;
        break;
      }
      if (raw30 && raw30.length > 0) {
        all30mCandles.push(...raw30);
      }
      await sleep(350);
    }

    if (fetchSuccess) {
      const parsed30m = all30mCandles
        .map((c: any[]) => ({
          timeStr: c[0],
          timestamp: new Date(c[0]).getTime(),
          open: Number(c[1]),
          high: Number(c[2]),
          low: Number(c[3]),
          close: Number(c[4]),
          volume: Number(c[5]),
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

      for (const day of tradingDays) {
        const cachePath = join(CACHE_DIR, `${safeKey}_${day}_30m.json`);
        if (existsSync(cachePath)) continue;

        const dayEndTs = new Date(`${day}T15:30:00+05:30`).getTime();
        const dayStart35Ts = dayEndTs - 35 * 86400000;
        const daySlice = parsed30m.filter((c) => c.timestamp >= dayStart35Ts && c.timestamp <= dayEndTs);
        await writeFile(cachePath, JSON.stringify(daySlice), 'utf-8');
      }
    }
  }

  // 2. Fetch 1m candles across intervals
  let cachedChunks = 0;
  for (let iIdx = 0; iIdx < intervals1m.length; iIdx++) {
    const iv = intervals1m[iIdx];
    const daysInIv = tradingDays.filter((d) => d >= iv.from && d <= iv.to);
    const allCached = daysInIv.every((d) => existsSync(join(CACHE_DIR, `${safeKey}_${d}_1m.json`)));
    if (allCached && daysInIv.length > 0) {
      cachedChunks++;
      continue;
    }

    const url1m = `https://api.upstox.com/v2/historical-candle/${encoded}/1minute/${iv.to}/${iv.from}`;
    const { ok, candles: raw1m } = await fetchWithRetry(url1m);
    if (!ok) {
      console.warn(`  [Warning] Interval ${iv.from} -> ${iv.to} failed. Skipping chunk.`);
      continue;
    }

    const byDay: Record<string, any[]> = {};
    for (const c of raw1m) {
      const dStr = c[0].substring(0, 10);
      if (!byDay[dStr]) byDay[dStr] = [];
      byDay[dStr].push({
        timeStr: c[0],
        timestamp: new Date(c[0]).getTime(),
        open: Number(c[1]),
        high: Number(c[2]),
        low: Number(c[3]),
        close: Number(c[4]),
        volume: Number(c[5]),
      });
    }

    for (const d of daysInIv) {
      const targetFile = join(CACHE_DIR, `${safeKey}_${d}_1m.json`);
      if (!existsSync(targetFile)) {
        const candles = byDay[d] || [];
        candles.sort((a, b) => a.timestamp - b.timestamp);
        await writeFile(targetFile, JSON.stringify(candles), 'utf-8');
      }
    }

    await sleep(350);
  }

  console.log(`[Done] ${asset} sync complete.`);
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });

  const args = process.argv.slice(2);
  let startDate = '2022-01-03';
  let endDate = '2026-09-10';
  let concurrency = 2;
  let targetAssets = [...UPSTOX_FLEET_ASSETS];

  for (const arg of args) {
    if (arg.startsWith('--start=')) startDate = arg.split('=')[1].trim();
    if (arg.startsWith('--end=')) endDate = arg.split('=')[1].trim();
    if (arg.startsWith('--concurrency=')) concurrency = Number(arg.split('=')[1].trim());
    if (arg.startsWith('--symbol=')) {
      const sym = arg.split('=')[1].trim().toUpperCase();
      targetAssets = [sym as any];
    }
    if (arg.startsWith('--limit=')) {
      const lim = Number(arg.split('=')[1].trim());
      targetAssets = targetAssets.slice(0, lim);
    }
  }

  const startDt = new Date(`${startDate}T12:00:00+05:30`);
  const endDt = new Date(`${endDate}T12:00:00+05:30`);
  const tradingDays: string[] = [];
  let dIter = new Date(startDt);
  while (dIter <= endDt) {
    const isWk = IndianMarketCalendar.isWeekend(dIter);
    const ist = IndianMarketCalendar.toIST(dIter);
    if (!isWk) {
      tradingDays.push(ist.dateStr);
    }
    dIter.setDate(dIter.getDate() + 1);
  }

  // Build 25-day intervals for 1m candles
  const intervals1m: { from: string; to: string }[] = [];
  let curr = new Date(startDt);
  while (curr <= endDt) {
    const fromStr = curr.toISOString().split('T')[0];
    const next = new Date(curr.getTime() + 24 * 86400000);
    const toDate = next > endDt ? endDt : next;
    const toStr = toDate.toISOString().split('T')[0];
    intervals1m.push({ from: fromStr, to: toStr });
    curr = new Date(toDate.getTime() + 86400000);
  }

  // Build 90-day intervals for 30m baseline candles
  const pre35Dt = new Date(startDt.getTime() - 40 * 86400000);
  const chunks30m: { from: string; to: string }[] = [];
  let c30 = new Date(pre35Dt);
  while (c30 <= endDt) {
    const fromStr = c30.toISOString().split('T')[0];
    const next = new Date(c30.getTime() + 89 * 86400000);
    const toDate = next > endDt ? endDt : next;
    const toStr = toDate.toISOString().split('T')[0];
    chunks30m.push({ from: fromStr, to: toStr });
    c30 = new Date(toDate.getTime() + 86400000);
  }

  console.log('='.repeat(80));
  console.log('  5-YEAR TOP 100 EQUITIES INGESTION ENGINE');
  console.log('='.repeat(80));
  console.log(`Window:       ${tradingDays.length} Weekdays (${startDate} → ${endDate})`);
  console.log(`Fleet Size:   ${targetAssets.length} Indian Equities`);
  console.log(`Concurrency:  ${concurrency} Parallel Asset Workers`);
  console.log(`Target Cache: ${CACHE_DIR}`);
  console.log('='.repeat(80));

  // Worker pool queue
  let currentIndex = 0;
  const total = targetAssets.length;

  async function worker(workerId: number): Promise<void> {
    while (currentIndex < total) {
      const idx = currentIndex++;
      const asset = targetAssets[idx];
      console.log(`[Worker ${workerId}] Starting asset [${idx + 1}/${total}]: ${asset}`);
      const t0 = Date.now();
      try {
        await prefetchAsset(asset, startDt, endDt, tradingDays, intervals1m, chunks30m);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`[Worker ${workerId}] Finished ${asset} in ${elapsed}s.`);
      } catch (err: any) {
        console.error(`[Worker ${workerId}] Error on ${asset}:`, err.message);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  console.log('\n================================================================================');
  console.log('  5-YEAR HISTORICAL CANDLE CACHING COMPLETE FOR ALL TARGET ASSETS');
  console.log('================================================================================');
}

main().catch((err) => {
  console.error('Fatal prefetch error:', err);
  process.exit(1);
});
