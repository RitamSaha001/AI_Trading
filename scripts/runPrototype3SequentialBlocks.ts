/**
 * runPrototype3SequentialBlocks.ts
 *
 * Runs Prototype 3 (Synaptic Neural Web) sequentially in 2-year blocks:
 *   - Block 1 (2 Years): 2022-01-03 to 2023-12-29
 *   - Block 2 (2 Years): 2024-01-01 to 2025-12-31
 *   - Block 3 (Remaining): 2026-01-01 to 2026-09-11
 *
 * Each block runs sequentially with low CPU priority (/usr/bin/nice -n 10)
 * ensuring zero MacBook lag, zero overheating, and minimal memory footprint.
 * Finally, compiles the unified 5-year performance audit across all 57 months.
 */

import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

interface BlockConfig {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  tag: string;
}

const BLOCKS: BlockConfig[] = [
  {
    id: 'block1',
    name: 'Block 1: 2-Year Cycle (2022 — 2023)',
    startDate: '2022-01-03',
    endDate: '2023-12-29',
    tag: 'p3-block1-2022-2023',
  },
  {
    id: 'block2',
    name: 'Block 2: 2-Year Cycle (2024 — 2025)',
    startDate: '2024-01-01',
    endDate: '2025-12-31',
    tag: 'p3-block2-2024-2025',
  },
  {
    id: 'block3',
    name: 'Block 3: 2026 Year-to-Date (2026)',
    startDate: '2026-01-01',
    endDate: '2026-09-11',
    tag: 'p3-block3-2026',
  },
];

interface MonthlyStats {
  month: string;
  blockId: string;
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

function runBlockProcess(
  block: BlockConfig,
  capital: number,
  profile: string,
  broker: string
): Promise<{ outputPath: string; blockData: any }> {
  return new Promise((resolve, reject) => {
    console.log('\n' + '='.repeat(90));
    console.log(`  STARTING SEQUENTIAL EXECUTION: ${block.name.toUpperCase()}`);
    console.log(`  Dates: ${block.startDate} → ${block.endDate} | Prototype: Prototype 3 (Synaptic Neural Web)`);
    console.log('='.repeat(90) + '\n');

    const args = [
      'scripts/replayFleetWindow.ts',
      `--start=${block.startDate}`,
      `--end=${block.endDate}`,
      `--capital=${capital}`,
      `--profile=${profile}`,
      `--broker=${broker}`,
      `--tag=${block.tag}`,
      '--prototype=prototype_3_neural_mesh',
    ];

    const child = spawn('/usr/bin/nice', ['-n', '10', 'npx', 'tsx', ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=4096`.trim(),
      },
    });

    let buffer = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (
          trimmed.startsWith('[Day') ||
          trimmed.startsWith('🌟 [Month') ||
          trimmed.includes('Done') ||
          trimmed.includes('MADS') ||
          trimmed.includes('HIGHWAY') ||
          trimmed.startsWith('Initial Capital:') ||
          trimmed.startsWith('Final NAV:') ||
          trimmed.startsWith('Net Return:') ||
          trimmed.startsWith('Profit Factor:')
        ) {
          console.log(`[${block.id.toUpperCase()}] ${trimmed}`);
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      if (!text.includes('ExperimentalWarning')) {
        process.stderr.write(`[${block.id.toUpperCase()} ERR] ${text}`);
      }
    });

    child.on('close', async (code) => {
      if (code !== 0) {
        return reject(new Error(`Block ${block.name} exited with status ${code}`));
      }

      const auditDir = join(process.cwd(), 'artifacts', 'fleet-replay-audit');
      const allFiles = await readdir(auditDir);
      const targetFile = allFiles.find((f) => f.includes(block.tag) && f.endsWith('.json'));

      if (!targetFile) {
        return reject(new Error(`Could not find output json for ${block.tag}`));
      }

      const fullPath = join(auditDir, targetFile);
      const raw = await readFile(fullPath, 'utf-8');
      const blockData = JSON.parse(raw);

      console.log(`\n[SUCCESS] ${block.name} completed successfully!`);
      console.log(`  -> Ending NAV: ₹${blockData.endingNav.toFixed(2)} | Net P&L: ₹${blockData.totalNetPnl.toFixed(2)} (${blockData.totalNetReturnPct.toFixed(2)}%)`);
      console.log(`  -> Closed Trades: ${blockData.totalTrades} (Win Rate: ${blockData.winRatePct.toFixed(1)}%) | Fees: ₹${blockData.totalFeeBurn.toFixed(2)}\n`);

      resolve({ outputPath: fullPath, blockData });
    });
  });
}

async function main() {
  const capital = 40000;
  const profile = 'balanced';
  const broker = 'flattrade';
  const startTime = Date.now();

  console.log('='.repeat(95));
  console.log('  PROTOTYPE 3 (SYNAPTIC NEURAL WEB) — 5-YEAR SEQUENTIAL 2-YEAR BLOCK EXECUTION');
  console.log('='.repeat(95));
  console.log('Model:              Prototype 3 (Synaptic Neural Web Mesh)');
  console.log('Target Edge:        ₹1,000+ Average Monthly Net Profit on ₹40,000 Baseline');
  console.log('Sequence Structure: 2 Years (2022-23) → 2 Years (2024-25) → Remaining (2026)');
  console.log('Execution:          Strictly Sequential (1 Core, low priority nice -n 10, cool CPU)');
  console.log('Fee Structure:      FlatTrade Zero Brokerage Engine (~2.5 bps taxes)');
  console.log('='.repeat(95));

  const blockResults: any[] = [];

  for (const block of BLOCKS) {
    try {
      const res = await runBlockProcess(block, capital, profile, broker);
      blockResults.push({ block, ...res });
    } catch (err: any) {
      console.error(`Error executing ${block.name}:`, err.message);
      process.exit(1);
    }
  }

  // Compile Unified 5-Year Monthly Performance Audit
  console.log('\n' + '='.repeat(95));
  console.log('  COMPILING UNIFIED 5-YEAR MONTHLY AUDIT FOR PROTOTYPE 3 (SYNAPTIC NEURAL WEB)');
  console.log('='.repeat(95));

  const allMonthlyStats: MonthlyStats[] = [];
  let total5YearNetPnl = 0;
  let total5YearTrades = 0;
  let total5YearWins = 0;
  let total5YearLosses = 0;
  let total5YearFeeBurn = 0;
  let max5YearDrawdownPct = 0;

  for (const res of blockResults) {
    const data = res.blockData;
    total5YearNetPnl += data.totalNetPnl;
    total5YearTrades += data.totalTrades;
    total5YearWins += data.totalWins;
    total5YearLosses += data.totalLosses;
    total5YearFeeBurn += data.totalFeeBurn;
    if (data.maxWindowDrawdownPct > max5YearDrawdownPct) {
      max5YearDrawdownPct = data.maxWindowDrawdownPct;
    }

    const monthlyGroups: Record<string, any[]> = {};
    for (const d of data.dailyBreakdown || []) {
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
      const mStartNav = days[0].startingNav;
      const mEndNav = days[days.length - 1].endingNav;
      const returnPct = mStartNav > 0 ? (mNetPnl / mStartNav) * 100 : 0;

      allMonthlyStats.push({
        month: mKey,
        blockId: res.block.id,
        daysCount,
        startNav: mStartNav,
        endNav: mEndNav,
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
  console.log('  PROTOTYPE 3 — 5-YEAR UNIFIED MONTHLY PERFORMANCE AUDIT (JAN 2022 — SEP 2026)');
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
  console.log('  PROTOTYPE 3 — 5-YEAR MACRO PERFORMANCE METRICS & TARGET ATTAINMENT VERDICT');
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
  console.log(`Total Runtime Elapsed:        ${((Date.now() - startTime) / 60000).toFixed(2)} minutes`);
  console.log('='.repeat(95));

  const targetVerdict =
    avgMonthlyProfit >= 1000
      ? `VERDICT: CLEARS TARGET! Average monthly return is ₹${avgMonthlyProfit.toFixed(2)} (within/exceeding ₹1,000 - ₹2,000 target).`
      : `VERDICT: Average monthly return is ₹${avgMonthlyProfit.toFixed(2)} / month.`;
  console.log(`\n>>> ${targetVerdict} <<<\n`);

  const auditDir = join(process.cwd(), 'artifacts', 'fleet-replay-audit');
  const finalJsonPath = join(auditDir, 'replay-5years-p3-neural-blocks.json');
  await writeFile(
    finalJsonPath,
    JSON.stringify(
      {
        prototype: 'prototype_3_neural_mesh',
        capital,
        profile,
        broker,
        blocks: blockResults.map((r) => ({
          blockId: r.block.id,
          name: r.block.name,
          startDate: r.block.startDate,
          endDate: r.block.endDate,
          endingNav: r.blockData.endingNav,
          netPnl: r.blockData.totalNetPnl,
          returnPct: r.blockData.totalNetReturnPct,
          trades: r.blockData.totalTrades,
          winRatePct: r.blockData.winRatePct,
          feeBurn: r.blockData.totalFeeBurn,
          maxDrawdownPct: r.blockData.maxWindowDrawdownPct,
        })),
        total5YearNetPnl,
        total5YearTrades,
        total5YearWins,
        total5YearLosses,
        overallWinRatePct,
        total5YearFeeBurn,
        max5YearDrawdownPct,
        avgMonthlyProfit,
        medianMonthlyProfit,
        monthsClearing1000,
        monthsClearing2000,
        positiveMonths,
        losingMonths,
        allMonthlyStats,
      },
      null,
      2
    ),
    'utf-8'
  );

  console.log(`Saved comprehensive Prototype 3 audit artifact: ${finalJsonPath}\n`);
}

main().catch((err) => {
  console.error('Fatal error in sequential blocks runner:', err);
  process.exit(1);
});
