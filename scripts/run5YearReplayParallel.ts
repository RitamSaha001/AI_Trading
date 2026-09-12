#!/usr/bin/env tsx
/**
 * 5-Year Parallel Fleet Replay Orchestrator & Monthly Target Auditor (2022 - 2026)
 *
 * Runs all 5 years of historical 1-minute market data (1,230 trading sessions across 100 bluechip equities)
 * in parallel child processes, parses the output artifacts, and compiles an authoritative monthly
 * audit to determine whether the ₹1,000 to ₹2,000/month baseline clears consistently.
 *
 * Usage:
 *   npx tsx scripts/run5YearReplayParallel.ts [--capital 40000] [--profile balanced] [--broker flattrade]
 */

import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

interface YearConfig {
  year: number;
  startDate: string;
  endDate: string;
  totalDays: number;
  tag: string;
}

const YEARS: YearConfig[] = [
  { year: 2022, startDate: '2022-01-03', endDate: '2022-12-30', totalDays: 260, tag: '5yr-2022' },
  { year: 2023, startDate: '2023-01-02', endDate: '2023-12-29', totalDays: 261, tag: '5yr-2023' },
  { year: 2024, startDate: '2024-01-01', endDate: '2024-12-31', totalDays: 265, tag: '5yr-2024' },
  { year: 2025, startDate: '2025-01-01', endDate: '2025-12-31', totalDays: 262, tag: '5yr-2025' },
  { year: 2026, startDate: '2026-01-01', endDate: '2026-09-10', totalDays: 182, tag: '5yr-2026' },
];

interface MonthlyStats {
  month: string;
  year: number;
  daysCount: number;
  startNav: number;
  endNav: number;
  netPnl: number;
  returnPct: number;
  tradesCount: number;
  winsCount: number;
  lossesCount: number;
  winRatePct: number;
  feeBurn: number;
  cleared1000: boolean;
  cleared2000: boolean;
}

function runYearProcess(cfg: YearConfig, capital: number, profile: string, broker: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[Launch] Starting replay for ${cfg.year} (${cfg.startDate} → ${cfg.endDate}, ~${cfg.totalDays} days)...`);
    const args = [
      'scripts/replayFleetWindow.ts',
      `--start=${cfg.startDate}`,
      `--end=${cfg.endDate}`,
      `--capital=${capital}`,
      `--profile=${profile}`,
      `--broker=${broker}`,
      `--tag=${cfg.tag}`,
      '--reset-daily',
    ];

    const child = spawn('npx', ['tsx', ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdoutData = '';
    let stderrData = '';
    let lastProgressTime = Date.now();

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdoutData += text;
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.includes('[Day ') && line.includes('Done')) {
          const now = Date.now();
          if (now - lastProgressTime > 8000) {
            console.log(`  [${cfg.year}] ${line.trim()}`);
            lastProgressTime = now;
          }
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[Success] Year ${cfg.year} finished successfully!`);
        resolve(stdoutData);
      } else {
        console.error(`[Error] Year ${cfg.year} exited with code ${code}`);
        console.error(stderrData);
        reject(new Error(`Year ${cfg.year} process failed with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  console.log('='.repeat(85));
  console.log('  AUTONOMOUS QUANT MASTER BRAIN — 5-YEAR COMPREHENSIVE HISTORICAL AUDIT');
  console.log('='.repeat(85));
  console.log('Historical Scope:   2022-01-03 → 2026-09-10 (~1,230 Sessions across 5 Years)');
  console.log('Fleet Universe:     100 NIFTY Liquid Equities (1-Minute Historical Candles)');
  console.log('Capital Baseline:   ₹40,000 per session with 5x MIS Intraday Leverage');
  console.log('Execution Model:    FlatTrade Zero-Brokerage Engine (Statutory Taxes ~ 2.5 bps)');
  console.log('Parallel Workers:   5 Concurrent Processing Streams');
  console.log('='.repeat(85));

  const capital = 40000;
  const profile = 'balanced';
  const broker = 'flattrade';

  const startTime = Date.now();

  console.log('\nSpawning 5 parallel simulation streams...\n');
  try {
    await Promise.all(YEARS.map((cfg) => runYearProcess(cfg, capital, profile, broker)));
  } catch (err: any) {
    console.error('Parallel execution encountered an error:', err.message);
    process.exit(1);
  }

  const elapsedMins = ((Date.now() - startTime) / 60000).toFixed(2);
  console.log(`\nAll 5 simulation streams completed in ${elapsedMins} minutes! Compiling unified audit...\n`);

  const auditDir = join(process.cwd(), 'artifacts', 'fleet-replay-audit');
  const allMonthlyStats: MonthlyStats[] = [];
  const yearSummaries: Record<number, any> = {};

  let total5YearNetPnl = 0;
  let total5YearTrades = 0;
  let total5YearWins = 0;
  let total5YearLosses = 0;
  let total5YearFeeBurn = 0;
  let max5YearDrawdownPct = 0;

  for (const cfg of YEARS) {
    let loadedData: any = null;
    const allFiles = readdirSync(auditDir);
    const taggedFile = allFiles.find((f: string) => f.includes(cfg.tag) && f.endsWith('.json'));
    if (taggedFile) {
      const raw = await readFile(join(auditDir, taggedFile), 'utf-8');
      loadedData = JSON.parse(raw);
    }

    if (!loadedData) {
      console.warn(`[Warning] Could not locate output artifact for year ${cfg.year}`);
      continue;
    }

    yearSummaries[cfg.year] = loadedData;
    total5YearNetPnl += loadedData.totalNetPnl;
    total5YearTrades += loadedData.totalTrades;
    total5YearWins += loadedData.totalWins;
    total5YearLosses += loadedData.totalLosses;
    total5YearFeeBurn += loadedData.totalFeeBurn;
    if (loadedData.maxWindowDrawdownPct > max5YearDrawdownPct) {
      max5YearDrawdownPct = loadedData.maxWindowDrawdownPct;
    }

    const monthlyGroups: Record<string, any[]> = {};
    for (const d of loadedData.dailyBreakdown || []) {
      const mKey = d.date.substring(0, 7);
      if (!monthlyGroups[mKey]) monthlyGroups[mKey] = [];
      monthlyGroups[mKey].push(d);
    }

    for (const [mKey, days] of Object.entries(monthlyGroups)) {
      const daysCount = days.length;
      const mNetPnl = days.reduce((sum, d) => sum + d.netPnl, 0);
      const mTrades = days.reduce((sum, d) => sum + d.tradesCount, 0);
      const mWins = days.reduce((sum, d) => sum + d.winsCount, 0);
      const mLosses = days.reduce((sum, d) => sum + d.lossesCount, 0);
      const mFees = days.reduce((sum, d) => sum + d.feeBurn, 0);
      const mWinRate = mTrades > 0 ? (mWins / mTrades) * 100 : 0;
      const returnPct = (mNetPnl / capital) * 100;

      allMonthlyStats.push({
        month: mKey,
        year: cfg.year,
        daysCount,
        startNav: capital,
        endNav: capital + mNetPnl,
        netPnl: mNetPnl,
        returnPct,
        tradesCount: mTrades,
        winsCount: mWins,
        lossesCount: mLosses,
        winRatePct: mWinRate,
        feeBurn: mFees,
        cleared1000: mNetPnl >= 1000,
        cleared2000: mNetPnl >= 2000,
      });
    }
  }

  allMonthlyStats.sort((a, b) => a.month.localeCompare(b.month));

  const totalMonths = allMonthlyStats.length;
  const avgMonthlyProfit = totalMonths > 0 ? total5YearNetPnl / totalMonths : 0;
  const pnlList = allMonthlyStats.map((m) => m.netPnl).sort((a, b) => a - b);
  const medianMonthlyProfit =
    pnlList.length % 2 === 0
      ? (pnlList[pnlList.length / 2 - 1] + pnlList[pnlList.length / 2]) / 2
      : pnlList[Math.floor(pnlList.length / 2)];

  const monthsClearing1000 = allMonthlyStats.filter((m) => m.cleared1000).length;
  const monthsClearing2000 = allMonthlyStats.filter((m) => m.cleared2000).length;
  const positiveMonths = allMonthlyStats.filter((m) => m.netPnl > 0).length;
  const flatMonths = allMonthlyStats.filter((m) => Math.abs(m.netPnl) < 1).length;
  const losingMonths = allMonthlyStats.filter((m) => m.netPnl < -1).length;

  const pctClearing1000 = totalMonths > 0 ? (monthsClearing1000 / totalMonths) * 100 : 0;
  const pctClearing2000 = totalMonths > 0 ? (monthsClearing2000 / totalMonths) * 100 : 0;
  const winRateMonths = totalMonths > 0 ? (positiveMonths / totalMonths) * 100 : 0;
  const overallWinRatePct = total5YearTrades > 0 ? (total5YearWins / total5YearTrades) * 100 : 0;

  console.log('='.repeat(95));
  console.log('  5-YEAR UNIFIED MONTHLY PERFORMANCE AUDIT (JAN 2022 — SEP 2026)');
  console.log('='.repeat(95));
  console.log(
    ' Month    Days   Start NAV     End NAV      Net P&L    Return %  Trades  Win Rate    Status'
  );
  console.log('-'.repeat(95));

  for (const m of allMonthlyStats) {
    const sign = m.netPnl >= 0 ? '+' : '';
    let statusLabel = '🔴 LOSS';
    if (m.netPnl >= 2000) statusLabel = '🌟 HIGH (≥₹2000)';
    else if (m.netPnl >= 1000) statusLabel = '✅ PASS (≥₹1000)';
    else if (m.netPnl > 0) statusLabel = '🟢 MODEST (>0)';
    else if (Math.abs(m.netPnl) < 1) statusLabel = '⚪ FLAT';

    console.log(
      ` ${m.month}   ${String(m.daysCount).padStart(2)}   ₹${m.startNav.toFixed(0).padStart(7)}  ₹${m.endNav.toFixed(2).padStart(10)}  ${(sign + '₹' + m.netPnl.toFixed(2)).padStart(11)}  ${(sign + m.returnPct.toFixed(2) + '%').padStart(8)}  ${String(m.tradesCount).padStart(6)}  ${(m.winRatePct.toFixed(1) + '%').padStart(8)}   ${statusLabel}`
    );
  }

  console.log('='.repeat(95));
  console.log('  5-YEAR MACRO PERFORMANCE METRICS & TARGET ATTAINMENT VERDICT');
  console.log('='.repeat(95));
  console.log(`Starting Portfolio Capital:   ₹${capital.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`Total 5-Year Net Profit:      ${total5YearNetPnl >= 0 ? '+' : ''}₹${total5YearNetPnl.toFixed(2)} (${((total5YearNetPnl / capital) * 100).toFixed(2)}% Cumulative Return)`);
  console.log(`Total Evaluated Months:       ${totalMonths} Months`);
  console.log(`Average Monthly Profit:       ${avgMonthlyProfit >= 0 ? '+' : ''}₹${avgMonthlyProfit.toFixed(2)} / month`);
  console.log(`Median Monthly Profit:        ${medianMonthlyProfit >= 0 ? '+' : ''}₹${medianMonthlyProfit.toFixed(2)} / month`);
  console.log(`Months Clearing ≥ ₹1,000:     ${monthsClearing1000} of ${totalMonths} (${pctClearing1000.toFixed(1)}%)`);
  console.log(`Months Clearing ≥ ₹2,000:     ${monthsClearing2000} of ${totalMonths} (${pctClearing2000.toFixed(1)}%)`);
  console.log(`Monthly Win Consistency:      ${positiveMonths} Green (${winRateMonths.toFixed(1)}%) / ${flatMonths} Flat / ${losingMonths} Red`);
  console.log(`Total Trades Executed:        ${total5YearTrades} (Wins: ${total5YearWins}, Losses: ${total5YearLosses})`);
  console.log(`Overall Trade Win Rate:       ${overallWinRatePct.toFixed(1)}%`);
  console.log(`Max Portfolio Drawdown:       ${max5YearDrawdownPct.toFixed(2)}%`);
  console.log(`Total Statutory Fees Paid:    ₹${total5YearFeeBurn.toFixed(2)}`);
  console.log('='.repeat(95));

  const targetVerdict =
    avgMonthlyProfit >= 1000
      ? `VERDICT: CLEARS TARGET! Average monthly return is ₹${avgMonthlyProfit.toFixed(2)} (within/exceeding ₹1,000 - ₹2,000 range).`
      : `VERDICT: BELOW TARGET. Average monthly return is ₹${avgMonthlyProfit.toFixed(2)} (below ₹1,000 baseline).`;
  console.log(`\n>>> ${targetVerdict} <<<\n`);

  const finalJsonPath = join(auditDir, 'replay-5years-full-audit.json');
  await writeFile(
    finalJsonPath,
    JSON.stringify(
      {
        scope: '5-Year Unified Master Brain Backtest',
        period: '2022-01-03 → 2026-09-10',
        capital,
        totalMonths,
        total5YearNetPnl,
        avgMonthlyProfit,
        medianMonthlyProfit,
        monthsClearing1000,
        pctClearing1000,
        monthsClearing2000,
        pctClearing2000,
        positiveMonths,
        flatMonths,
        losingMonths,
        total5YearTrades,
        total5YearWins,
        total5YearLosses,
        overallWinRatePct,
        max5YearDrawdownPct,
        total5YearFeeBurn,
        yearlySummaries: yearSummaries,
        allMonthlyStats,
      },
      null,
      2
    ),
    'utf-8'
  );
  console.log(`Saved comprehensive 5-year JSON report to: ${finalJsonPath}`);
}

main().catch((err) => {
  console.error('Fatal error in 5-year replay:', err);
  process.exit(1);
});
