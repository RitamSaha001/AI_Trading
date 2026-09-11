#!/usr/bin/env tsx
/**
 * Universal Multi-Day Fleet Chronological Replay Harness
 *
 * Runs an authentic, minute-by-minute backtest across the last N working days
 * for the 15 institutional bluechip fleet stocks on Upstox.
 *
 * Usage:
 *   npx tsx scripts/replayFleetWindow.ts [--days 10] [--capital 40000] [--profile balanced] [--reset-daily]
 *
 * Examples:
 *   npm run replay:window
 *   npx tsx scripts/replayFleetWindow.ts --days 10 --capital 40000 --profile balanced
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { UPSTOX_FLEET_ASSETS, createDefaultAutonomousPilotState, PILOT_PROFILES } from '../src/domain/autonomousPilot';
import { UpstoxInstrumentRegistry } from '../server/services/brokers/upstox/upstoxInstrumentRegistry';
import { IndianMarketCalendar } from '../server/services/brokers/upstox/indianMarketCalendar';
import { tickAutonomousPilot, initializeFleetStatus, createDefaultRateLimitStatus } from '../src/domain/autonomousPilotEngine';
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
  day: string;
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

interface DayReplaySummary {
  date: string;
  dayOfWeek: string;
  barsEvaluated: number;
  startingNav: number;
  endingNav: number;
  netPnl: number;
  netReturnPct: number;
  feeBurn: number;
  tradesCount: number;
  winsCount: number;
  lossesCount: number;
  maxDrawdownPct: number;
  closedTrades: ReplayTrade[];
  eventsCount: number;
}

const CACHE_DIR = join(process.cwd(), '.cache', 'upstox-candles');

async function getCachedJson(filename: string): Promise<any | null> {
  const filePath = join(CACHE_DIR, filename);
  if (!existsSync(filePath)) return null;
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setCachedJson(filename: string, data: any): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const filePath = join(CACHE_DIR, filename);
    await writeFile(filePath, JSON.stringify(data), 'utf-8');
  } catch {}
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

function getLastNTradingDays(n = 10, fromDateStr = getTodayIstDateStr(), includeTodayIfPastClose = false): string[] {
  const days: string[] = [];
  let d = new Date(`${fromDateStr}T12:00:00+05:30`);
  
  const todayStr = getTodayIstDateStr();
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

async function fetchBaseline30m(instrumentKey: string, targetDateStr: string): Promise<RawCandle[]> {
  const safeKey = instrumentKey.replace(/[^a-zA-Z0-9]/g, '_');
  const cacheFile = `${safeKey}_${targetDateStr}_30m.json`;
  const cached = await getCachedJson(cacheFile);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return cached;
  }

  const encoded = encodeURIComponent(instrumentKey);
  const targetDateObj = new Date(`${targetDateStr}T15:30:00+05:30`);
  const fromDate30mObj = new Date(targetDateObj.getTime() - 35 * 86400000);
  const fromDateStr = fromDate30mObj.toISOString().split('T')[0];

  const url = `https://api.upstox.com/v2/historical-candle/${encoded}/30minute/${targetDateStr}/${fromDateStr}`;
  try {
    const data = await fetchJson(url);
    const candles = data?.data?.candles || [];
    const parsed = candles.reverse().map((c: any[]) => ({
      timeStr: c[0],
      timestamp: new Date(c[0]).getTime(),
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5]),
    }));
    if (parsed.length > 0) {
      await setCachedJson(cacheFile, parsed);
    }
    return parsed;
  } catch {
    return [];
  }
}

async function fetchIntraday1m(instrumentKey: string, targetDateStr: string): Promise<RawCandle[]> {
  const safeKey = instrumentKey.replace(/[^a-zA-Z0-9]/g, '_');
  const cacheFile = `${safeKey}_${targetDateStr}_1m.json`;
  const cached = await getCachedJson(cacheFile);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return cached;
  }

  const encoded = encodeURIComponent(instrumentKey);
  const url = `https://api.upstox.com/v2/historical-candle/${encoded}/1minute/${targetDateStr}/${targetDateStr}`;

  try {
    const data = await fetchJson(url);
    const candles = data?.data?.candles || [];
    const parsed = candles.reverse().map((c: any[]) => ({
      timeStr: c[0],
      timestamp: new Date(c[0]).getTime(),
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5]),
    }));
    if (parsed.length > 0) {
      await setCachedJson(cacheFile, parsed);
    }
    return parsed;
  } catch {
    return [];
  }
}

async function replaySingleDay(
  targetDate: string,
  startingCapital: number,
  profile: AutonomousPilotProfile
): Promise<DayReplaySummary> {
  const assetHistoricalMap: Map<Asset, RawCandle[]> = new Map();
  const assetIntradayMap: Map<Asset, RawCandle[]> = new Map();
  const candleMapByTime: Map<number, Map<Asset, RawCandle>> = new Map();
  const allTimestampsSet: Set<number> = new Set();
  const timeToStringMap: Map<number, string> = new Map();

  // Download/Load fleet data in parallel
  await Promise.all(
    UPSTOX_FLEET_ASSETS.map(async (asset) => {
      const inst = UpstoxInstrumentRegistry.get(asset);
      if (!inst) return;
      const [hist30m, intraday1m] = await Promise.all([
        fetchBaseline30m(inst.instrumentKey, targetDate),
        fetchIntraday1m(inst.instrumentKey, targetDate),
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
    })
  );

  const sortedTimestamps = Array.from(allTimestampsSet).sort((a, b) => a - b);
  const d = new Date(`${targetDate}T12:00:00+05:30`);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (sortedTimestamps.length === 0) {
    return {
      date: targetDate,
      dayOfWeek: dayNames[d.getDay()],
      barsEvaluated: 0,
      startingNav: startingCapital,
      endingNav: startingCapital,
      netPnl: 0,
      netReturnPct: 0,
      feeBurn: 0,
      tradesCount: 0,
      winsCount: 0,
      lossesCount: 0,
      maxDrawdownPct: 0,
      closedTrades: [],
      eventsCount: 0,
    };
  }

  let currentCash = startingCapital;
  let realizedPnl = 0;
  let totalFeeBurn = 0;
  let peakNav = startingCapital;
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
    initialCash: startingCapital,
    startingEquity: startingCapital,
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
        totalEquity: startingCapital,
      },
      holdings: [],
      positions: [],
    },
    autonomousPilot: {
      ...createDefaultAutonomousPilotState(startingCapital),
      enabled: true,
      executionMode: 'full_autonomous',
      profile,
      dailyStartingValue: startingCapital,
      peakPortfolioValue: startingCapital,
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

    const currentMarkets: Partial<Record<Asset, Market>> = {};
    for (const asset of UPSTOX_FLEET_ASSETS) {
      const c = minuteCandles.get(asset);
      const accumulated = cumulativeIntradayCandles.get(asset) || [];
      const hist30m = assetHistoricalMap.get(asset) || [];
      if (!c) continue;

      const today30mBars: { time: string; open: number; high: number; low: number; close: number; volume: number }[] = [];
      let current30m: { time: string; open: number; high: number; low: number; close: number; volume: number } | null = null;
      let currentWindow = -1;

      for (const bar of accumulated) {
        const dBar = new Date(bar.timestamp);
        const mins = dBar.getHours() * 60 + dBar.getMinutes();
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
      const institutionalHistory = institutionalCandles.map((cand) => cand.close);
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
      const candle = minuteCandles.get(order.asset as Asset);
      if (!candle) continue;

      if (candle.low <= (order.limitPrice || order.price)) {
        const fillPrice = Math.min(order.limitPrice || order.price, candle.open);
        const fillQty = order.amount;
        const totalCost = fillPrice * fillQty;
        const fee = totalCost * 0.0008;

        currentCash -= (totalCost + fee);
        totalFeeBurn += fee;

        const prevQty = positions[order.asset as Asset] || 0;
        const prevAvg = avgBuyPrices[order.asset as Asset] || fillPrice;
        const newQty = prevQty + fillQty;
        const newAvg = (prevQty * prevAvg + fillQty * fillPrice) / newQty;

        positions[order.asset as Asset] = newQty;
        avgBuyPrices[order.asset as Asset] = newAvg;
        entryTimestamps[order.asset as Asset] = timestamp;
        entryStrategies[order.asset as Asset] = order.strategyName || 'Algorithmic Alpha';

        openEntryOrders.delete(orderId);
        const orderInApp = appState.orders.find((o) => o.id === orderId);
        if (orderInApp) orderInApp.status = 'filled';

        replayEvents.push({
          minute: minuteIdx,
          timeStr,
          asset: order.asset,
          type: 'ORDER_FILLED',
          price: fillPrice,
          qty: fillQty,
          detail: `Limit Buy FILLED for ${fillQty} shs @ ₹${fillPrice.toFixed(2)} (Limit was ₹${order.limitPrice?.toFixed(2)}). Fee: ₹${fee.toFixed(2)}`,
        });
      }
    }

    // Check Open Position Trailing Stops & Profit Targets
    for (const [assetStr, qty] of Object.entries(positions)) {
      const asset = assetStr as Asset;
      if (!qty || qty <= 0) continue;
      const candle = minuteCandles.get(asset);
      if (!candle) continue;

      const fleetStatus = appState.autonomousPilot?.activeFleet?.[asset];
      const entryPrice = avgBuyPrices[asset] || candle.close;
      const stopLoss = fleetStatus?.stopLossPrice;
      const takeProfit = fleetStatus?.takeProfitPrice;

      let exitPrice: number | null = null;
      let exitReason = '';

      if (stopLoss && candle.low <= stopLoss) {
        exitPrice = Math.min(candle.open, stopLoss);
        exitReason = 'Trailing Stop Triggered';
      } else if (takeProfit && candle.high >= takeProfit) {
        exitPrice = Math.max(candle.open, takeProfit);
        exitReason = 'Profit Target Triggered';
      }

      if (exitPrice !== null) {
        const proceeds = exitPrice * qty;
        const fee = proceeds * 0.0008;
        const tradePnl = (exitPrice - entryPrice) * qty - fee;
        const tradePnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;

        currentCash += (proceeds - fee);
        totalFeeBurn += fee;
        realizedPnl += tradePnl;

        const closedRecord: ReplayTrade = {
          day: targetDate,
          asset,
          strategy: entryStrategies[asset] || fleetStatus?.assignedStrategy || 'Quant Alpha',
          entryTime: entryTimestamps[asset] ? new Date(entryTimestamps[asset]!).toLocaleTimeString('en-IN') : 'N/A',
          exitTime: new Date(timestamp).toLocaleTimeString('en-IN'),
          entryPrice,
          exitPrice,
          quantity: qty,
          pnl: tradePnl,
          pnlPct: tradePnlPct,
          exitReason,
        };
        closedTrades.push(closedRecord);

        delete positions[asset];
        delete avgBuyPrices[asset];

        replayEvents.push({
          minute: minuteIdx,
          timeStr,
          asset,
          type: tradePnl >= 0 ? 'PROFIT_HARVEST' : 'STOP_LOSS_EXIT',
          price: exitPrice,
          qty,
          detail: `${exitReason} on ${qty} shs @ ₹${exitPrice.toFixed(2)}: P&L ${tradePnl >= 0 ? '+' : ''}₹${tradePnl.toFixed(2)} (${tradePnlPct.toFixed(2)}%)`,
        });
      }
    }

    // Portfolio NAV & Drawdown
    let currentEquity = currentCash;
    for (const [assetStr, qty] of Object.entries(positions)) {
      if (qty && qty > 0) {
        const c = minuteCandles.get(assetStr as Asset);
        const price = c?.close || avgBuyPrices[assetStr as Asset] || 0;
        currentEquity += qty * price;
      }
    }

    if (currentEquity > peakNav) peakNav = currentEquity;
    const currentDdPct = peakNav > 0 ? ((peakNav - currentEquity) / peakNav) * 100 : 0;
    if (currentDdPct > maxDrawdownPct) maxDrawdownPct = currentDdPct;

    appState.cash = currentCash;
    appState.upstoxAccount!.funds.availableCash = currentCash;
    appState.upstoxAccount!.funds.totalEquity = currentEquity;

    // Engine Tick
    const tickResult = tickAutonomousPilot(
      appState,
      currentMarkets as any,
      timestamp
    );

    appState.autonomousPilot!.activeFleet = tickResult.updatedFleet;
    appState.autonomousPilot!.actionLogs = [
      ...tickResult.newActionLogs,
      ...(appState.autonomousPilot!.actionLogs || []),
    ].slice(0, 100);

    for (const log of tickResult.newActionLogs) {
      if (log.action === 'VOLATILITY_SHOCK' || log.action === 'CIRCUIT_FREEZE' || log.action === 'SKIPPED') {
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
          day: targetDate,
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

  let finalPositionsValue = 0;
  for (const [asset, qty] of Object.entries(positions)) {
    if (qty && qty > 0) {
      const lastCandle = assetIntradayMap.get(asset as Asset)?.slice(-1)[0];
      const p = lastCandle?.close || avgBuyPrices[asset as Asset] || 0;
      finalPositionsValue += qty * p;
    }
  }

  const finalEquity = currentCash + finalPositionsValue;
  const netPnl = finalEquity - startingCapital;
  const netReturnPct = (netPnl / startingCapital) * 100;
  const wins = closedTrades.filter((t) => t.pnl > 0);
  const losses = closedTrades.filter((t) => t.pnl <= 0);

  return {
    date: targetDate,
    dayOfWeek: dayNames[d.getDay()],
    barsEvaluated: sortedTimestamps.length,
    startingNav: startingCapital,
    endingNav: finalEquity,
    netPnl,
    netReturnPct,
    feeBurn: totalFeeBurn,
    tradesCount: closedTrades.length,
    winsCount: wins.length,
    lossesCount: losses.length,
    maxDrawdownPct,
    closedTrades,
    eventsCount: replayEvents.length,
    events: replayEvents,
  };
}

async function runMultiDayWindowReplay() {
  const args = process.argv.slice(2);
  let daysCount = 10;
  let capital = 40000.0;
  let profile: AutonomousPilotProfile = 'balanced';
  let compounding = true;
  let tag = '';
  let fromDate: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--days=')) {
      daysCount = Number(arg.split('=')[1]) || 10;
    } else if (arg === '--days' && i + 1 < args.length) {
      daysCount = Number(args[++i]) || 10;
    } else if (arg.startsWith('--capital=')) {
      capital = Number(arg.split('=')[1]) || 40000;
    } else if (arg === '--capital' && i + 1 < args.length) {
      capital = Number(args[++i]) || 40000;
    } else if (arg.startsWith('--profile=')) {
      const p = arg.split('=')[1].toLowerCase();
      if (p === 'conservative' || p === 'balanced' || p === 'momentum') {
        profile = p as AutonomousPilotProfile;
      }
    } else if (arg === '--profile' && i + 1 < args.length) {
      const p = args[++i].toLowerCase();
      if (p === 'conservative' || p === 'balanced' || p === 'momentum') {
        profile = p as AutonomousPilotProfile;
      }
    } else if (arg.startsWith('--from=')) {
      fromDate = arg.split('=')[1].trim();
    } else if (arg === '--from' && i + 1 < args.length) {
      fromDate = args[++i].trim();
    } else if (arg.startsWith('--tag=')) {
      tag = arg.split('=')[1].trim();
    } else if (arg === '--tag' && i + 1 < args.length) {
      tag = args[++i].trim();
    } else if (arg === '--reset-daily') {
      compounding = false;
    }
  }

  const tradingDays = fromDate ? getLastNTradingDays(daysCount, fromDate, true) : getLastNTradingDays(daysCount);

  console.log('='.repeat(80));
  console.log('  AUTONOMOUS QUANT PILOT — 10-DAY ROLLING FLEET AUDIT');
  console.log('='.repeat(80));
  console.log(`Window Scope:         ${daysCount} Completed Indian Market Trading Sessions`);
  console.log(`Dates Range:          ${tradingDays[0]} → ${tradingDays[tradingDays.length - 1]}`);
  console.log(`Initial Capital:      ₹${capital.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`Capital Mode:         ${compounding ? 'Compounding NAV (Equity carries over daily)' : 'Static Daily Re-allocation'}`);
  console.log(`Risk Profile:         ${PILOT_PROFILES[profile].name} (${PILOT_PROFILES[profile].maxRiskPerTradePct}% risk/trade)`);
  console.log(`Monitored Fleet:      ${UPSTOX_FLEET_ASSETS.length} Institutional Bluechips`);
  console.log('='.repeat(80));
  console.log('\nStarting sequential intraday simulation across all 15 fleet assets...\n');

  let currentNav = capital;
  let peakWindowNav = capital;
  let maxWindowDrawdownPct = 0;
  const dayResults: DayReplaySummary[] = [];
  const allClosedTrades: ReplayTrade[] = [];

  for (let idx = 0; idx < tradingDays.length; idx++) {
    const day = tradingDays[idx];
    const sessionCapital = compounding ? currentNav : capital;
    process.stdout.write(`  [Day ${String(idx + 1).padStart(2)}/${daysCount}] ${day} ... `);

    const startTime = Date.now();
    const result = await replaySingleDay(day, sessionCapital, profile);
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

    dayResults.push(result);
    allClosedTrades.push(...result.closedTrades);
    currentNav = result.endingNav;

    if (currentNav > peakWindowNav) peakWindowNav = currentNav;
    const windowDd = peakWindowNav > 0 ? ((peakWindowNav - currentNav) / peakWindowNav) * 100 : 0;
    if (windowDd > maxWindowDrawdownPct) maxWindowDrawdownPct = windowDd;

    const pnlSign = result.netPnl >= 0 ? '+' : '';
    console.log(
      `Done (${elapsedSec}s) | NAV: ₹${result.endingNav.toFixed(2)} | Net P&L: ${pnlSign}₹${result.netPnl.toFixed(2)} (${pnlSign}${result.netReturnPct.toFixed(2)}%) | Trades: ${result.tradesCount}`
    );
  }

  // Summary Metrics
  const totalNetPnl = currentNav - capital;
  const totalNetReturnPct = (totalNetPnl / capital) * 100;
  const totalFeeBurn = dayResults.reduce((sum, d) => sum + d.feeBurn, 0);
  const totalTrades = allClosedTrades.length;
  const totalWins = allClosedTrades.filter((t) => t.pnl > 0).length;
  const totalLosses = allClosedTrades.filter((t) => t.pnl <= 0).length;
  const winRatePct = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
  const winningTradesPnl = allClosedTrades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const losingTradesPnl = Math.abs(allClosedTrades.filter((t) => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0));
  const profitFactor = losingTradesPnl > 0 ? winningTradesPnl / losingTradesPnl : winningTradesPnl > 0 ? 999 : 0;
  const greenDays = dayResults.filter((d) => d.netPnl > 0).length;
  const flatDays = dayResults.filter((d) => Math.abs(d.netPnl) < 0.01).length;
  const redDays = dayResults.filter((d) => d.netPnl < -0.01).length;

  console.log('\n' + '='.repeat(80));
  console.log('  10-DAY ROLLING AUDIT PERFORMANCE SUMMARY');
  console.log('='.repeat(80));
  console.log(`Initial Capital:       ₹${capital.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`Final NAV:             ₹${currentNav.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`Net Return:            ${totalNetPnl >= 0 ? '+' : ''}₹${totalNetPnl.toFixed(2)} (${totalNetReturnPct >= 0 ? '+' : ''}${totalNetReturnPct.toFixed(3)}%)`);
  console.log(`Peak NAV:              ₹${peakWindowNav.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`Max Window Drawdown:   ${maxWindowDrawdownPct.toFixed(2)}%`);
  console.log(`Total Roundtrip Fees:  ₹${totalFeeBurn.toFixed(2)}`);
  console.log(`Total Trades Closed:   ${totalTrades} (Wins: ${totalWins}, Losses: ${totalLosses})`);
  console.log(`Overall Win Rate:      ${winRatePct.toFixed(1)}%`);
  console.log(`Profit Factor:         ${profitFactor === 999 ? '∞' : profitFactor.toFixed(2)}`);
  console.log(`Daily Distribution:    ${greenDays} Green / ${flatDays} Flat (Cash Preserved) / ${redDays} Red`);
  console.log('='.repeat(80));

  console.log('\nDAILY BREAKDOWN:');
  console.log('-'.repeat(80));
  console.log(' Date       Day  Start NAV    End NAV      Net P&L    Return %  Trades  Fees');
  console.log('-'.repeat(80));
  for (const d of dayResults) {
    const sign = d.netPnl >= 0 ? '+' : '';
    console.log(
      ` ${d.date}  ${d.dayOfWeek.padEnd(3)}  ₹${d.startingNav.toFixed(2).padStart(10)}  ₹${d.endingNav.toFixed(2).padStart(10)}  ${(sign + '₹' + d.netPnl.toFixed(2)).padStart(10)}  ${(sign + d.netReturnPct.toFixed(2) + '%').padStart(8)}  ${String(d.tradesCount).padStart(6)}  ₹${d.feeBurn.toFixed(2).padStart(6)}`
    );
  }
  console.log('-'.repeat(80));

  if (allClosedTrades.length > 0) {
    console.log('\nALL CLOSED TRADES EXECUTED IN 10-DAY WINDOW:');
    console.log('-'.repeat(80));
    for (const t of allClosedTrades) {
      const sign = t.pnl >= 0 ? '+' : '';
      console.log(`[${t.day} ${t.entryTime} → ${t.exitTime}] ${t.asset.padEnd(10)} Entry: ₹${t.entryPrice.toFixed(2)} | Exit: ₹${t.exitPrice.toFixed(2)} | P&L: ${sign}₹${t.pnl.toFixed(2)} (${sign}${t.pnlPct.toFixed(2)}%) | ${t.exitReason}`);
    }
    console.log('-'.repeat(80));
  }

  // Save audit artifact
  const outputDir = join('artifacts', 'fleet-replay-audit');
  await mkdir(outputDir, { recursive: true });
  const filename = tag ? `replay-window-${daysCount}days-${tag}.json` : `replay-window-${daysCount}days.json`;
  const outputPath = join(outputDir, filename);
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        windowDays: daysCount,
        startDate: tradingDays[0],
        endDate: tradingDays[tradingDays.length - 1],
        profile,
        startingCapital: capital,
        endingNav: currentNav,
        totalNetPnl,
        totalNetReturnPct,
        maxWindowDrawdownPct,
        totalFeeBurn,
        totalTrades,
        totalWins,
        totalLosses,
        winRatePct,
        profitFactor,
        dailyDistribution: { greenDays, flatDays, redDays },
        dailyBreakdown: dayResults,
        allClosedTrades,
      },
      null,
      2
    ),
    'utf-8'
  );

  console.log(`\nDetailed JSON audit artifact saved: ${outputPath}`);
}

runMultiDayWindowReplay().catch((err) => {
  console.error('Multi-day replay error:', err);
  process.exit(1);
});
