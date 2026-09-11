#!/usr/bin/env tsx
/**
 * Universal Fleet Intraday Chronological Replay Harness
 *
 * Allows replaying ANY Indian market trading session (today, yesterday, or any YYYY-MM-DD)
 * across all 15 institutional fleet bluechips timestamp-by-timestamp.
 *
 * Usage:
 *   npx tsx scripts/replayFleetSession.ts [date] [--capital=100000] [--profile=balanced]
 *
 * Examples:
 *   npx tsx scripts/replayFleetSession.ts today
 *   npx tsx scripts/replayFleetSession.ts yesterday
 *   npx tsx scripts/replayFleetSession.ts 2026-09-10
 *   npx tsx scripts/replayFleetSession.ts 2026-09-08 --capital=50000 --profile=momentum
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { UPSTOX_FLEET_ASSETS } from '../src/domain/autonomousPilot';
import { UpstoxInstrumentRegistry } from '../server/services/brokers/upstox/upstoxInstrumentRegistry';
import { IndianMarketCalendar } from '../server/services/brokers/upstox/indianMarketCalendar';
import { tickAutonomousPilot, initializeFleetStatus, createDefaultRateLimitStatus } from '../src/domain/autonomousPilotEngine';
import { createDefaultAutonomousPilotState, PILOT_PROFILES } from '../src/domain/autonomousPilot';
import { AppState, Asset, Market, Order, AutonomousPilotProfile } from '../src/types';

interface RawCandle {
  timeStr: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ReplayTrade {
  asset: string;
  strategy: string;
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPct: number;
  exitReason: string;
}

interface ReplayEvent {
  minute: number;
  timeStr: string;
  asset: string;
  type: string;
  price: number;
  qty: number;
  detail: string;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

function getTodayIstDateStr(): string {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 3600000 * 5.5);
  return ist.toISOString().split('T')[0];
}

function getPreviousTradingDayStr(fromDateStr: string): string {
  let cur = new Date(`${fromDateStr}T12:00:00+05:30`);
  while (true) {
    cur = new Date(cur.getTime() - 86400000);
    const day = cur.getDay();
    if (day === 0 || day === 6) continue; // skip weekend
    const dateStr = cur.toISOString().split('T')[0];
    if (IndianMarketCalendar.HOLIDAYS_2026[dateStr]) continue; // skip exchange holiday
    return dateStr;
  }
}

async function fetchBaseline30m(instrumentKey: string, targetDateStr: string): Promise<RawCandle[]> {
  const encoded = encodeURIComponent(instrumentKey);
  const targetDateObj = new Date(`${targetDateStr}T15:30:00+05:30`);
  const fromDate30mObj = new Date(targetDateObj.getTime() - 35 * 86400000);
  const fromDateStr = fromDate30mObj.toISOString().split('T')[0];

  const url = `https://api.upstox.com/v2/historical-candle/${encoded}/30minute/${targetDateStr}/${fromDateStr}`;
  try {
    const data = await fetchJson(url);
    const candles = data?.data?.candles || [];
    return candles.reverse().map((c: any[]) => ({
      timeStr: c[0],
      timestamp: new Date(c[0]).getTime(),
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5]),
    }));
  } catch {
    return [];
  }
}

async function fetchIntraday1m(instrumentKey: string, targetDateStr: string, isToday: boolean): Promise<RawCandle[]> {
  const encoded = encodeURIComponent(instrumentKey);
  const url = isToday
    ? `https://api.upstox.com/v2/historical-candle/intraday/${encoded}/1minute`
    : `https://api.upstox.com/v2/historical-candle/${encoded}/1minute/${targetDateStr}/${targetDateStr}`;

  try {
    const data = await fetchJson(url);
    const candles = data?.data?.candles || [];
    return candles.reverse().map((c: any[]) => ({
      timeStr: c[0],
      timestamp: new Date(c[0]).getTime(),
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5]),
    }));
  } catch {
    return [];
  }
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  let dateInput = 'today';
  let capital = 100000.0;
  let profile: AutonomousPilotProfile = 'balanced';

  for (const arg of args) {
    if (arg.startsWith('--capital=')) {
      capital = Number(arg.split('=')[1]) || 100000;
    } else if (arg.startsWith('--profile=')) {
      const p = arg.split('=')[1].toLowerCase();
      if (p === 'conservative' || p === 'balanced' || p === 'momentum') {
        profile = p as AutonomousPilotProfile;
      }
    } else if (arg.startsWith('--date=')) {
      dateInput = arg.split('=')[1].trim();
    } else if (!arg.startsWith('--')) {
      dateInput = arg.trim();
    }
  }

  const todayIst = getTodayIstDateStr();
  let resolvedDateStr = todayIst;
  let isToday = false;

  if (dateInput.toLowerCase() === 'today') {
    resolvedDateStr = todayIst;
    isToday = true;
  } else if (dateInput.toLowerCase() === 'yesterday') {
    resolvedDateStr = getPreviousTradingDayStr(todayIst);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    resolvedDateStr = dateInput;
    isToday = resolvedDateStr === todayIst;
  } else {
    console.warn(`Unrecognized date format "${dateInput}". Falling back to today (${todayIst}).`);
    resolvedDateStr = todayIst;
    isToday = true;
  }

  return { targetDate: resolvedDateStr, isToday, capital, profile };
}

async function runUniversalFleetReplay() {
  const { targetDate, isToday, capital, profile } = parseCliArgs();

  console.log('='.repeat(75));
  console.log('  AUTONOMOUS QUANT PILOT - UNIVERSAL INTRADAY CHRONOLOGICAL REPLAY');
  console.log('='.repeat(75));
  console.log(`Target Session:        ${targetDate} ${isToday ? '(Today - Live Stream)' : '(Historical Archive)'}`);
  console.log(`Starting Capital:      ₹${capital.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`Risk Profile:          ${PILOT_PROFILES[profile].name} (${PILOT_PROFILES[profile].maxRiskPerTradePct}% risk/trade)`);
  console.log(`Monitored Fleet:       ${UPSTOX_FLEET_ASSETS.length} Institutional Bluechips`);
  console.log('='.repeat(75));

  // Check holiday or weekend
  const parsedTargetDate = new Date(`${targetDate}T12:00:00+05:30`);
  const dayOfWeek = parsedTargetDate.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    console.warn(`\n[Notice] ${targetDate} is a weekend (Indian markets closed). No intraday trading data exists for weekends.`);
    return;
  }
  if (IndianMarketCalendar.HOLIDAYS_2026[targetDate]) {
    console.warn(`\n[Notice] ${targetDate} is an official exchange holiday (${IndianMarketCalendar.HOLIDAYS_2026[targetDate].description}).`);
    return;
  }

  console.log(`\nFetching 1-minute intraday and 30-minute baseline data from Upstox...\n`);

  const assetHistoricalMap: Map<Asset, RawCandle[]> = new Map();
  const assetIntradayMap: Map<Asset, RawCandle[]> = new Map();
  const candleMapByTime: Map<number, Map<Asset, RawCandle>> = new Map();
  const allTimestampsSet: Set<number> = new Set();
  const timeToStringMap: Map<number, string> = new Map();

  for (const asset of UPSTOX_FLEET_ASSETS) {
    const inst = UpstoxInstrumentRegistry.get(asset);
    if (!inst) continue;

    process.stdout.write(`  [${asset.padEnd(11)}] Downloading market candles... `);
    const [hist30m, intraday1m] = await Promise.all([
      fetchBaseline30m(inst.instrumentKey, targetDate),
      fetchIntraday1m(inst.instrumentKey, targetDate, isToday),
    ]);

    assetHistoricalMap.set(asset, hist30m);
    assetIntradayMap.set(asset, intraday1m);

    for (const c of intraday1m) {
      allTimestampsSet.add(c.timestamp);
      timeToStringMap.set(c.timestamp, c.timeStr);
      if (!candleMapByTime.has(c.timestamp)) {
        candleMapByTime.set(c.timestamp, new Map());
      }
      candleMapByTime.get(c.timestamp)!.set(asset, c);
    }

    console.log(`Done! (${intraday1m.length} 1-min bars, ${hist30m.length} 30-min baseline bars)`);
  }

  const sortedTimestamps = Array.from(allTimestampsSet).sort((a, b) => a - b);
  if (sortedTimestamps.length === 0) {
    console.error(`\nError: Zero intraday candles returned for ${targetDate}. Ensure date was an active market day.`);
    return;
  }

  console.log(`\nTimeline assembled: ${sortedTimestamps.length} chronological 1-minute bars.`);
  console.log(`Session Window:     ${timeToStringMap.get(sortedTimestamps[0])} → ${timeToStringMap.get(sortedTimestamps[sortedTimestamps.length - 1])}\n`);

  // Simulation State Setup
  let currentCash = capital;
  let realizedPnl = 0;
  let totalFeeBurn = 0;
  let peakNav = capital;
  let maxDrawdownPct = 0;

  const positions: Partial<Record<Asset, number>> = {};
  const avgBuyPrices: Partial<Record<Asset, number>> = {};
  const openEntryOrders: Map<string, { order: Order; candleEntered: number }> = new Map();
  const entryTimestamps: Partial<Record<Asset, number>> = {};
  const entryStrategies: Partial<Record<Asset, string>> = {};
  const closedTrades: ReplayTrade[] = [];
  const replayEvents: ReplayEvent[] = [];

  const appState: AppState = {
    schemaVersion: 1,
    cash: currentCash,
    initialCash: capital,
    startingEquity: capital,
    realizedPnl: 0,
    totalFees: 0,
    positions: positions as any,
    avgBuyPrice: avgBuyPrices as any,
    averageBuyPrices: avgBuyPrices as any,
    watchlist: [...UPSTOX_FLEET_ASSETS],
    orders: [],
    alerts: [],
    strategies: [],
    accountMode: 'upstox',
    upstoxAccount: {
      connected: true,
      environment: 'production',
      accountId: '87BSJ2',
      accountName: 'Replay Simulation',
      canTrade: true,
      lastSyncAt: Date.now(),
      funds: {
        currency: 'INR',
        availableCash: currentCash,
        usedMargin: 0,
        totalEquity: capital,
      },
      holdings: [],
      positions: [],
    },
    autonomousPilot: {
      ...createDefaultAutonomousPilotState(capital),
      enabled: true,
      executionMode: 'full_autonomous',
      profile,
      dailyStartingValue: capital,
      peakPortfolioValue: capital,
      activeFleet: initializeFleetStatus(),
      rateLimitStatus: createDefaultRateLimitStatus(),
    },
    settings: {
      geminiApiKey: '',
      geminiModel: 'gemini-3.1-pro-preview',
      soundEnabled: false,
      theme: 'glass',
      maxSlippageBps: 20,
      enableWebSocket: false,
    },
    notifications: [],
    timeframe: '1D',
    selectedAsset: 'RELIANCE',
  };

  const cumulativeIntradayCandles: Map<Asset, RawCandle[]> = new Map();
  for (const asset of UPSTOX_FLEET_ASSETS) cumulativeIntradayCandles.set(asset, []);

  // Minute-by-Minute Replay Loop
  for (let minuteIdx = 0; minuteIdx < sortedTimestamps.length; minuteIdx++) {
    const timestamp = sortedTimestamps[minuteIdx];
    const timeStr = timeToStringMap.get(timestamp) || '';
    const minuteCandles = candleMapByTime.get(timestamp);
    if (!minuteCandles) continue;

    for (const [asset, c] of minuteCandles.entries()) {
      cumulativeIntradayCandles.get(asset)!.push(c);
    }

    // Build Market records
    const currentMarkets: Partial<Record<Asset, Market>> = {};
    for (const asset of UPSTOX_FLEET_ASSETS) {
      const c = minuteCandles.get(asset);
      const accumulated = cumulativeIntradayCandles.get(asset) || [];
      const hist30m = assetHistoricalMap.get(asset) || [];
      if (!c) continue;

      // Aggregate accumulated 1m bars of today into running 30m institutional bars
      const today30mBars: { time: string; open: number; high: number; low: number; close: number; volume: number }[] = [];
      let current30m: { time: string; open: number; high: number; low: number; close: number; volume: number } | null = null;
      let currentWindow = -1;

      for (const bar of accumulated) {
        const d = new Date(bar.timestamp);
        const mins = d.getHours() * 60 + d.getMinutes();
        const windowIdx = Math.floor((mins - (9 * 60 + 15)) / 30);
        if (windowIdx !== currentWindow) {
          if (current30m) today30mBars.push(current30m);
          currentWindow = windowIdx;
          current30m = { time: bar.timeStr, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume };
        } else if (current30m) {
          current30m.high = Math.max(current30m.high, bar.high);
          current30m.low = Math.min(current30m.low, bar.low);
          current30m.close = bar.close;
          current30m.volume += bar.volume;
        }
      }
      if (current30m) today30mBars.push(current30m);

      const institutionalCandles = [
        ...hist30m.map((h) => ({ time: h.timeStr, open: h.open, high: h.high, low: h.low, close: h.close, volume: h.volume })),
        ...today30mBars,
      ];
      const institutionalHistory = institutionalCandles.map((c) => c.close);
      const high24h = Math.max(...accumulated.map((a) => a.high), c.high);
      const low24h = Math.min(...accumulated.map((a) => a.low), c.low);
      const volume24h = accumulated.reduce((sum, a) => sum + a.volume, 0);

      currentMarkets[asset] = {
        asset,
        name: asset,
        symbol: asset,
        price: c.close,
        change24h: ((c.close - (accumulated[0]?.open || c.open)) / (accumulated[0]?.open || c.open)) * 100,
        high24h,
        low24h,
        volume24h,
        history: institutionalHistory,
        candles: institutionalCandles,
        source: 'upstox',
        isSynthetic: false,
        lastUpdated: timestamp,
      };
    }

    // Match Pending Buy Limit Orders
    for (const [orderId, { order }] of Array.from(openEntryOrders.entries())) {
      const c = minuteCandles.get(order.asset);
      if (!c) continue;

      const limitP = order.limitPrice || order.price;
      if (c.low <= limitP) {
        const fillPrice = Math.min(limitP, c.open);
        const cost = fillPrice * order.amount;
        const fee = cost * 0.0008;

        currentCash -= (cost + fee);
        totalFeeBurn += fee;
        positions[order.asset] = (positions[order.asset] || 0) + order.amount;
        avgBuyPrices[order.asset] = fillPrice;
        entryTimestamps[order.asset] = timestamp;
        entryStrategies[order.asset] = order.strategyName || 'Quantitative Pilot';
        openEntryOrders.delete(orderId);

        appState.orders = appState.orders.map((o) =>
          o.id === orderId ? { ...o, status: 'filled', price: fillPrice } : o
        );

        replayEvents.push({
          minute: minuteIdx,
          timeStr,
          asset: order.asset,
          type: 'ORDER_FILLED',
          price: fillPrice,
          qty: order.amount,
          detail: `Limit BUY filled at ₹${fillPrice.toFixed(2)} (bar: ₹${c.low.toFixed(2)} - ₹${c.high.toFixed(2)})`,
        });
      }
    }

    // Mark to Market NAV
    let positionsValue = 0;
    for (const [asset, qty] of Object.entries(positions)) {
      if (qty && qty > 0) {
        const m = currentMarkets[asset as Asset];
        positionsValue += qty * (m?.price || avgBuyPrices[asset as Asset] || 0);
      }
    }
    const currentNav = currentCash + positionsValue;
    if (currentNav > peakNav) peakNav = currentNav;
    const currentDrawdownPct = ((peakNav - currentNav) / peakNav) * 100;
    if (currentDrawdownPct > maxDrawdownPct) maxDrawdownPct = currentDrawdownPct;

    appState.cash = currentCash;
    appState.positions = { ...positions } as any;
    appState.avgBuyPrice = { ...avgBuyPrices } as any;
    appState.averageBuyPrices = { ...avgBuyPrices } as any;
    appState.upstoxAccount!.funds!.availableCash = currentCash;
    appState.upstoxAccount!.funds!.totalEquity = currentNav;
    appState.autonomousPilot!.dailyStartingValue = capital;
    appState.autonomousPilot!.peakPortfolioValue = peakNav;

    // Track stops before tick
    const prevFleetStops = new Map<string, number>();
    for (const [asset, fleet] of Object.entries(appState.autonomousPilot!.activeFleet)) {
      if (fleet.trailingStopPrice) prevFleetStops.set(asset, fleet.trailingStopPrice);
    }

    // Run Quantitative Pilot Master Cycle
    const tickResult = tickAutonomousPilot(appState, currentMarkets as any, timestamp);

    // Apply fleet state & action logs
    appState.autonomousPilot!.activeFleet = tickResult.updatedFleet;
    appState.autonomousPilot!.actionLogs = [
      ...tickResult.newActionLogs,
      ...(appState.autonomousPilot!.actionLogs || []),
    ].slice(0, 100);

    for (const log of tickResult.newActionLogs) {
      replayEvents.push({
        minute: minuteIdx,
        timeStr,
        asset: log.asset,
        type: log.action,
        price: log.price || 0,
        qty: 0,
        detail: `[${log.strategy}] ${log.detail}`,
      });
    }

    // Detect Trailing Stop Ratchet Movements
    for (const [asset, fleet] of Object.entries(tickResult.updatedFleet)) {
      const prevStop = prevFleetStops.get(asset);
      const newStop = fleet.trailingStopPrice;
      if (prevStop && newStop && newStop > prevStop && (fleet.unitsHeld || 0) > 0) {
        replayEvents.push({
          minute: minuteIdx,
          timeStr,
          asset,
          type: 'TRAILING_RATCHET',
          price: newStop,
          qty: fleet.unitsHeld || 0,
          detail: `Trailing ratchet lifted stop from ₹${prevStop.toFixed(2)} → ₹${newStop.toFixed(2)} (lock-in: +${(((newStop - fleet.entryPrice!) / fleet.entryPrice!) * 100).toFixed(2)}%)`,
        });
      }
    }

    // Handle Stale Order Cancellations
    for (const cancelId of tickResult.ordersToCancel) {
      if (openEntryOrders.has(cancelId)) {
        const removed = openEntryOrders.get(cancelId)!;
        openEntryOrders.delete(cancelId);
        replayEvents.push({
          minute: minuteIdx,
          timeStr,
          asset: removed.order.asset,
          type: 'ORDER_CANCELLED',
          price: removed.order.limitPrice || removed.order.price,
          qty: removed.order.amount,
          detail: `Stale limit order cancelled after price drifted away.`,
        });
      }
    }

    // Process Dispatched Orders
    for (const prop of tickResult.ordersToDispatch) {
      if (prop.side === 'buy') {
        const clientOrderId = `ord_${minuteIdx}_${prop.asset}`;
        const newOrder: Order = {
          id: clientOrderId,
          ts: timestamp,
          side: 'buy',
          type: prop.type,
          asset: prop.asset,
          amount: prop.amount,
          price: prop.price,
          limitPrice: prop.price,
          fee: prop.price * prop.amount * 0.0008,
          notional: prop.price * prop.amount,
          auto: true,
          strategyName: prop.strategyName,
          status: 'pending',
          stopLoss: prop.stopLoss,
          takeProfit: prop.takeProfit,
          product: 'MIS',
          broker: 'upstox',
          accountMode: 'upstox',
        };

        openEntryOrders.set(clientOrderId, { order: newOrder, candleEntered: minuteIdx });
        appState.orders.push(newOrder);

        replayEvents.push({
          minute: minuteIdx,
          timeStr,
          asset: prop.asset,
          type: 'ENTRY_QUEUED',
          price: prop.price,
          qty: prop.amount,
          detail: `Queued Limit BUY ${prop.amount} @ ₹${prop.price.toFixed(2)} [${prop.strategyName}] SL: ₹${prop.stopLoss?.toFixed(2)} TP: ₹${prop.takeProfit?.toFixed(2)}`,
        });
      } else if (prop.side === 'sell') {
        const currentHolding = positions[prop.asset] || 0;
        const exitQty = Math.min(prop.amount, currentHolding);
        if (exitQty <= 0) continue;

        const entryP = avgBuyPrices[prop.asset] || prop.price;
        const exitPrice = prop.price;
        const proceeds = exitPrice * exitQty;
        const fee = proceeds * 0.0008;
        const tradePnl = (exitPrice - entryP) * exitQty - fee;
        const tradePnlPct = ((exitPrice - entryP) / entryP) * 100;

        currentCash += (proceeds - fee);
        totalFeeBurn += fee;

        const remaining = currentHolding - exitQty;
        if (remaining <= 0) {
          delete positions[prop.asset];
          delete avgBuyPrices[prop.asset];
        } else {
          positions[prop.asset] = remaining;
        }

        realizedPnl += tradePnl;
        const isProfit = tradePnl > 0;

        const closedRecord: ReplayTrade = {
          asset: prop.asset,
          strategy: entryStrategies[prop.asset] || prop.strategyName,
          entryTime: entryTimestamps[prop.asset] ? new Date(entryTimestamps[prop.asset]!).toLocaleTimeString('en-IN') : 'N/A',
          exitTime: new Date(timestamp).toLocaleTimeString('en-IN'),
          entryPrice: entryP,
          exitPrice,
          quantity: exitQty,
          pnl: tradePnl,
          pnlPct: tradePnlPct,
          exitReason: prop.reason || (isProfit ? 'Profit Target' : 'Protective Stop'),
        };
        closedTrades.push(closedRecord);

        replayEvents.push({
          minute: minuteIdx,
          timeStr,
          asset: prop.asset,
          type: isProfit ? 'PROFIT_HARVEST' : 'STOP_LOSS_EXIT',
          price: exitPrice,
          qty: exitQty,
          detail: `${closedRecord.exitReason} on ${exitQty} shs @ ₹${exitPrice.toFixed(2)}: P&L ${tradePnl >= 0 ? '+' : ''}₹${tradePnl.toFixed(2)} (${tradePnlPct.toFixed(2)}%)`,
        });
      }
    }
  }

  // Final Valuation
  let finalPositionsValue = 0;
  for (const [asset, qty] of Object.entries(positions)) {
    if (qty && qty > 0) {
      const lastCandle = assetIntradayMap.get(asset as Asset)?.slice(-1)[0];
      const p = lastCandle?.close || avgBuyPrices[asset as Asset] || 0;
      finalPositionsValue += qty * p;
    }
  }

  const finalEquity = currentCash + finalPositionsValue;
  const netPnl = finalEquity - capital;
  const netReturnPct = (netPnl / capital) * 100;
  const wins = closedTrades.filter((t) => t.pnl > 0);
  const losses = closedTrades.filter((t) => t.pnl <= 0);
  const winRatePct = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;

  console.log('='.repeat(75));
  console.log('  SESSION REPLAY COMPLETE - SUMMARY AUDIT');
  console.log('='.repeat(75));
  console.log(`Replayed Date:         ${targetDate}`);
  console.log(`Bars Evaluated:        ${sortedTimestamps.length} consecutive 1-minute bars`);
  console.log(`Starting NAV:          ₹${capital.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`Ending NAV:            ₹${finalEquity.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`Net Return:            ${netPnl >= 0 ? '+' : ''}₹${netPnl.toFixed(2)} (${netReturnPct >= 0 ? '+' : ''}${netReturnPct.toFixed(3)}%)`);
  console.log(`Realized P&L:          ${realizedPnl >= 0 ? '+' : ''}₹${realizedPnl.toFixed(2)}`);
  console.log(`Total Fee Burn:        ₹${totalFeeBurn.toFixed(2)}`);
  console.log(`Max Intraday DD:       ${maxDrawdownPct.toFixed(2)}%`);
  console.log(`Trades Closed:         ${closedTrades.length} (Wins: ${wins.length}, Losses: ${losses.length})`);
  console.log(`Win Rate:              ${winRatePct.toFixed(1)}%`);
  console.log(`Total Events Logged:   ${replayEvents.length}`);
  console.log('='.repeat(75));

  if (closedTrades.length > 0) {
    console.log('\nCLOSED TRADES EXECUTED DURING SESSION:');
    console.log('-'.repeat(75));
    for (const t of closedTrades) {
      console.log(`[${t.entryTime} → ${t.exitTime}] ${t.asset.padEnd(10)} Entry: ₹${t.entryPrice.toFixed(2)} | Exit: ₹${t.exitPrice.toFixed(2)} | P&L: ${t.pnl >= 0 ? '+' : ''}₹${t.pnl.toFixed(2)} (${t.pnlPct.toFixed(2)}%) | ${t.exitReason}`);
    }
    console.log('-'.repeat(75));
  } else {
    console.log('\nZero trade actions dispatched: The fleet remained in STAND_ASIDE (defensive cash mode) or no setups satisfied the multi-factor conviction & net profit hurdle.');
  }

  // Save audit artifact
  const outputDir = join('artifacts', 'fleet-replay-audit');
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, `replay-${targetDate}.json`);
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        sessionDate: targetDate,
        isToday,
        profile,
        replayedAt: new Date().toISOString(),
        totalBars: sortedTimestamps.length,
        startingCapital: capital,
        endingNav: finalEquity,
        netPnl,
        netReturnPct,
        maxDrawdownPct,
        totalFeeBurn,
        closedTrades,
        eventsCount: replayEvents.length,
        events: replayEvents,
      },
      null,
      2
    ),
    'utf-8'
  );

  console.log(`\nDetailed JSON audit artifact saved: ${outputPath}`);
}

runUniversalFleetReplay().catch((err) => {
  console.error('Universal replay error:', err);
  process.exit(1);
});
