#!/usr/bin/env tsx
/**
 * Polite Fleet Historical Candle Pre-fetcher & Cache Warmer
 * 
 * Downloads and caches 1-minute and 30-minute historical candle data for the
 * 15 institutional fleet assets across N trading days, respecting Cloudflare
 * rate limits, pacing requests, and handling 429 retry-after headers gracefully.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { UPSTOX_FLEET_ASSETS } from '../src/domain/autonomousPilot';
import { UpstoxInstrumentRegistry } from '../server/services/brokers/upstox/upstoxInstrumentRegistry';
import { IndianMarketCalendar } from '../server/services/brokers/upstox/indianMarketCalendar';

const CACHE_DIR = join(process.cwd(), '.cache', 'upstox-candles');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLastNTradingDays(n = 250, fromDateStr = '2026-09-11', includeTodayIfPastClose = false): string[] {
  const days: string[] = [];
  let d = new Date(`${fromDateStr}T12:00:00+05:30`);
  const todayStr = '2026-09-11';
  if (fromDateStr === todayStr && !includeTodayIfPastClose) {
    d.setDate(d.getDate() - 1);
  }
  while (days.length < n) {
    const ist = IndianMarketCalendar.toIST(d);
    const isWk = IndianMarketCalendar.isWeekend(d);
    const isHol = IndianMarketCalendar.isHoliday(d).isHoliday;
    if (!isWk && !isHol) {
      days.push(ist.dateStr);
    }
    d.setDate(d.getDate() - 1);
  }
  return days.reverse();
}

async function fetchWithRetry(url: string, retries = 5): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 15;
        console.log(`\n  [Cloudflare 429 Rate Limit] Pausing for ${retryAfter + 2}s before retrying...`);
        await sleep((retryAfter + 2) * 1000);
        continue;
      }
      if (res.status >= 500) {
        await sleep(1000 * attempt);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      return data?.data?.candles || [];
    } catch (err: any) {
      if (attempt === retries) {
        console.warn(`  [Fetch Failed after ${retries} attempts] ${url}: ${err.message}`);
        return [];
      }
      await sleep(1000 * attempt);
    }
  }
  return [];
}

async function main() {
  const args = process.argv.slice(2);
  let daysCount = 250;
  for (const a of args) {
    if (a.startsWith('--days=')) daysCount = Number(a.split('=')[1]) || 250;
  }

  await mkdir(CACHE_DIR, { recursive: true });
  const tradingDays = getLastNTradingDays(daysCount);

  console.log('='.repeat(80));
  console.log(`  FLEET CANDLE PRE-FETCHER & CACHE BUILDER`);
  console.log('='.repeat(80));
  console.log(`Scope:           ${daysCount} Trading Days (${tradingDays[0]} to ${tradingDays[tradingDays.length - 1]})`);
  console.log(`Assets:          ${UPSTOX_FLEET_ASSETS.length} Institutional Bluechips`);
  console.log(`Target Cache:    ${CACHE_DIR}`);
  console.log('='.repeat(80));

  // Determine what is already cached vs missing
  interface MissingTask {
    day: string;
    asset: string;
    type: '30m' | '1m';
    url: string;
    cacheFile: string;
  }

  const tasks: MissingTask[] = [];

  for (const day of tradingDays) {
    const targetDateObj = new Date(`${day}T15:30:00+05:30`);
    const fromDate30mObj = new Date(targetDateObj.getTime() - 35 * 86400000);
    const fromDate30mStr = fromDate30mObj.toISOString().split('T')[0];

    for (const asset of UPSTOX_FLEET_ASSETS) {
      const inst = UpstoxInstrumentRegistry.get(asset);
      if (!inst) continue;
      const safeKey = inst.instrumentKey.replace(/[^a-zA-Z0-9]/g, '_');
      const encoded = encodeURIComponent(inst.instrumentKey);

      const f30 = `${safeKey}_${day}_30m.json`;
      const p30 = join(CACHE_DIR, f30);
      if (!existsSync(p30)) {
        tasks.push({
          day,
          asset,
          type: '30m',
          url: `https://api.upstox.com/v2/historical-candle/${encoded}/30minute/${day}/${fromDate30mStr}`,
          cacheFile: p30,
        });
      }

      const f1 = `${safeKey}_${day}_1m.json`;
      const p1 = join(CACHE_DIR, f1);
      if (!existsSync(p1)) {
        tasks.push({
          day,
          asset,
          type: '1m',
          url: `https://api.upstox.com/v2/historical-candle/${encoded}/1minute/${day}/${day}`,
          cacheFile: p1,
        });
      }
    }
  }

  console.log(`Already Cached:  ${tradingDays.length * UPSTOX_FLEET_ASSETS.length * 2 - tasks.length} candle sets`);
  console.log(`Pending Tasks:   ${tasks.length} candle sets to fetch\n`);

  if (tasks.length === 0) {
    console.log('All fleet candle data is already 100% cached! Ready to run instant offline replay.');
    return;
  }

  let completed = 0;
  const startTime = Date.now();

  for (const task of tasks) {
    const raw = await fetchWithRetry(task.url);
    if (raw && raw.length > 0) {
      const parsed = raw.reverse().map((c: any[]) => ({
        timeStr: c[0],
        timestamp: new Date(c[0]).getTime(),
        open: Number(c[1]),
        high: Number(c[2]),
        low: Number(c[3]),
        close: Number(c[4]),
        volume: Number(c[5]),
      }));
      await writeFile(task.cacheFile, JSON.stringify(parsed), 'utf-8');
    }

    completed++;
    if (completed % 10 === 0 || completed === tasks.length) {
      const pct = ((completed / tasks.length) * 100).toFixed(1);
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(0);
      process.stdout.write(`\r  Progress: ${completed}/${tasks.length} (${pct}%) | Elapsed: ${elapsedSec}s | Current: ${task.day} ${task.asset} [${task.type}]    `);
    }

    // Gentle 100ms throttle between requests to prevent triggering Cloudflare burst detection
    await sleep(120);
  }

  console.log(`\n\n[Cache Built] All ${tasks.length} files successfully processed.`);
}

main().catch((err) => {
  console.error('Prefetch error:', err);
  process.exit(1);
});
