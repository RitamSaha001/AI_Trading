#!/usr/bin/env tsx
/**
 * Today's Fleet Intraday Chronological Replay Harness
 *
 * 1. Fetches authentic 30m historical baseline candles from Upstox V2 API.
 * 2. Fetches today's entire 1-minute intraday candle stream (09:15:00 IST to present)
 *    for all 15 institutional fleet assets.
 * 3. Replays every minute timestamp-by-timestamp through the Autonomous Quant Pilot engine.
 * 4. Simulates order matching, dynamic position sizing, stepped breakeven defense,
 *    trailing ratchets, multi-tranche profit harvests, and capital preservation.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { UPSTOX_FLEET_ASSETS } from '../src/domain/autonomousPilot';
import { UpstoxInstrumentRegistry } from '../server/services/brokers/upstox/upstoxInstrumentRegistry';
import { tickAutonomousPilot, initializeFleetStatus } from '../src/domain/autonomousPilotEngine';
import { createDefaultAutonomousPilotState, PILOT_PROFILES } from '../src/domain/autonomousPilot';
import { AppState, Asset, Market, Order } from '../src/types';

interface RawCandle {
  timeStr: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ReplayEvent {
  minute: number;
  timeStr: string;
  asset: string;
  type: 'ENTRY_QUEUED' | 'ORDER_FILLED' | 'STOP_LOSS_EXIT' | 'PROFIT_HARVEST' | 'TRAILING_RATCHET' | 'STAGNATION_EXIT' | 'ORDER_CANCELLED';
  price: number;
  qty: number;
  pnl?: number;
  pnlPct?: number;
  detail: string;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

async function loadHistorical30m(instrumentKey: string): Promise<RawCandle[]> {
  const encoded = encodeURIComponent(instrumentKey);
  const now = new Date();
  const toDate = now.toISOString().split('T')[0];
  const fromDate = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
  const url = `https://api.upstox.com/v2/historical-candle/${encoded}/30minute/${toDate}/${fromDate}`;
  try {
    const data = await fetchJson(url);
    const candles = data?.data?.candles || [];
    // Upstox returns newest first: reverse to chronological order
    return candles.reverse().map((c: any[]) => ({
      timeStr: c[0],
      timestamp: new Date(c[0]).getTime(),
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5]),
    }));
  } catch (err: any) {
    return [];
  }
}

async function loadTodaysIntraday1m(instrumentKey: string): Promise<RawCandle[]> {
  const encoded = encodeURIComponent(instrumentKey);
  const url = `https://api.upstox.com/v2/historical-candle/intraday/${encoded}/1minute`;
  try {
    const data = await fetchJson(url);
    const candles = data?.data?.candles || [];
    // Upstox returns newest first: reverse to chronological order
    return candles.reverse().map((c: any[]) => ({
      timeStr: c[0],
      timestamp: new Date(c[0]).getTime(),
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5]),
    }));
  } catch (err: any) {
    return [];
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  AUTONOMOUS QUANT PILOT - TODAY INTRADAY CHRONOLOGICAL REPLAY');
  console.log('='.repeat(70));
  console.log(`Loading market data for ${UPSTOX_FLEET_ASSETS.length} fleet bluechips...\n`);

  const assetHistoricalMap: Map<Asset, RawCandle[]> = new Map();
  const assetTodayMap: Map<Asset, RawCandle[]> = new Map();
  const candleMapByTime: Map<number, Map<Asset, RawCandle>> = new Map();
  const allTimestampsSet: Set<number> = new Set();
  const timeToStringMap: Map<number, string> = new Map();

  for (const asset of UPSTOX_FLEET_ASSETS) {
    const inst = UpstoxInstrumentRegistry.get(asset);
    if (!inst) {
      console.warn(`[Skip] ${asset}: No registry instrument key found.`);
      continue;
    }

    process.stdout.write(`Fetching ${asset.padEnd(12)}... `);
    const [hist30m, today1m] = await Promise.all([
      loadHistorical30m(inst.instrumentKey),
      loadTodaysIntraday1m(inst.instrumentKey),
    ]);

    assetHistoricalMap.set(asset, hist30m);
    assetTodayMap.set(asset, today1m);

    for (const c of today1m) {
      allTimestampsSet.add(c.timestamp);
      timeToStringMap.set(c.timestamp, c.timeStr);
      if (!candleMapByTime.has(c.timestamp)) {
        candleMapByTime.set(c.timestamp, new Map());
      }
      candleMapByTime.get(c.timestamp)!.set(asset, c);
    }

    console.log(`Done! (Hist 30m: ${hist30m.length}, Today 1m: ${today1m.length} bars)`);
  }

  const sortedTimestamps = Array.from(allTimestampsSet).sort((a, b) => a - b);
  console.log(`\nTimeline ready: ${sortedTimestamps.length} chronological 1-minute bars.`);
  console.log(`From: ${timeToStringMap.get(sortedTimestamps[0])}`);
  console.log(`To:   ${timeToStringMap.get(sortedTimestamps[sortedTimestamps.length - 1])}\n`);

  // Initialize Simulation Environment
  const initialEquity = 100000.0; // ₹1,00,000 INR
  let currentCash = initialEquity;
  let realizedPnl = 0;
  let totalTradesExecuted = 0;
  let winningTrades = 0;
  let losingTrades = 0;

  const positions: Partial<Record<Asset, number>> = {};
  const avgBuyPrices: Partial<Record<Asset, number>> = {};
  const openEntryOrders: Map<string, { order: Order; candleEntered: number }> = new Map();
  const entryTimestamps: Partial<Record<Asset, number>> = {};
  const replayEvents: ReplayEvent[] = [];

  const appState: AppState = {
    schemaVersion: 1,
    cash: currentCash,
    initialCash: initialEquity,
    startingEquity: initialEquity,
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
        totalEquity: initialEquity,
      },
      holdings: [],
      positions: [],
    },
    autonomousPilot: {
      ...createDefaultAutonomousPilotState(initialEquity),
      enabled: true,
      executionMode: 'full_autonomous',
      profile: 'balanced',
      dailyStartingValue: initialEquity,
      activeFleet: initializeFleetStatus(),
      rateLimitStatus: {
        requestsThisMinute: 0,
        minuteWindowStart: sortedTimestamps[0],
        lastDispatchedAt: 0,
        circuitBreakerCooloffUntil: 0,
      },
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
  for (const asset of UPSTOX_FLEET_ASSETS) {
    cumulativeIntradayCandles.set(asset, []);
  }

  // Minute-by-Minute Replay Loop
  for (let minuteIdx = 0; minuteIdx < sortedTimestamps.length; minuteIdx++) {
    const timestamp = sortedTimestamps[minuteIdx];
    const timeStr = timeToStringMap.get(timestamp) || '';
    const minuteCandles = candleMapByTime.get(timestamp);
    if (!minuteCandles) continue;

    // 1. Accumulate intraday candles for indicators
    for (const [asset, c] of minuteCandles.entries()) {
      cumulativeIntradayCandles.get(asset)!.push(c);
    }

    // 2. Build Market structures for this minute
    const currentMarkets: Partial<Record<Asset, Market>> = {};
    for (const asset of UPSTOX_FLEET_ASSETS) {
      const c = minuteCandles.get(asset);
      const accumulated = cumulativeIntradayCandles.get(asset) || [];
      const hist30m = assetHistoricalMap.get(asset) || [];

      if (!c) continue;

      const fullHistory = [
        ...hist30m.map((h) => h.close),
        ...accumulated.map((a) => a.close),
      ];

      const high24h = Math.max(...accumulated.map((a) => a.high), c.high);
      const low24h = Math.min(...accumulated.map((a) => a.low), c.low);
      const volume24h = accumulated.reduce((sum, a) => sum + a.volume, 0);

      currentMarkets[asset] = {
        asset,
        name: asset,
        symbol: asset,
        price: c.close,
        change24h: ((c.close - accumulated[0]?.open || c.open) / (accumulated[0]?.open || c.open)) * 100,
        high24h,
        low24h,
        volume24h,
        history: fullHistory,
        candles: [
          ...hist30m.map((h) => ({
            time: h.timeStr,
            open: h.open,
            high: h.high,
            low: h.low,
            close: h.close,
            volume: h.volume,
          })),
          ...accumulated.map((a) => ({
            time: a.timeStr,
            open: a.open,
            high: a.high,
            low: a.low,
            close: a.close,
            volume: a.volume,
          })),
        ],
        source: 'upstox',
        isSynthetic: false,
        lastUpdated: timestamp,
      };
    }

    // 3. Process Pending Orders for Fills Against This Minute's Bar
    for (const [orderId, { order }] of Array.from(openEntryOrders.entries())) {
      const c = minuteCandles.get(order.asset);
      if (!c) continue;

      const limitP = order.limitPrice || order.price;
      // Buy limit fills if the minute's low touches or crosses below limit price
      if (c.low <= limitP) {
        const fillPrice = Math.min(limitP, c.open);
        const cost = fillPrice * order.amount;
        const fee = cost * 0.0008;

        currentCash -= (cost + fee);
        positions[order.asset] = (positions[order.asset] || 0) + order.amount;
        avgBuyPrices[order.asset] = fillPrice;
        entryTimestamps[order.asset] = timestamp;
        openEntryOrders.delete(orderId);

        // Update appState orders array
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
          detail: `Limit BUY filled at ₹${fillPrice.toFixed(2)} (bar range: ₹${c.low.toFixed(2)} - ₹${c.high.toFixed(2)})`,
        });
      }
    }

    // 4. Update AppState with current NAV and positions
    let positionsValue = 0;
    for (const [asset, qty] of Object.entries(positions)) {
      if (qty && qty > 0) {
        const m = currentMarkets[asset as Asset];
        positionsValue += qty * (m?.price || avgBuyPrices[asset as Asset] || 0);
      }
    }
    const currentNav = currentCash + positionsValue;

    appState.cash = currentCash;
    appState.positions = { ...positions } as any;
    appState.avgBuyPrice = { ...avgBuyPrices } as any;
    appState.averageBuyPrices = { ...avgBuyPrices } as any;
    appState.upstoxAccount!.funds!.availableCash = currentCash;
    appState.upstoxAccount!.funds!.totalEquity = currentNav;

    // Track trailing stops that changed before tick
    const prevFleetStops = new Map<string, number>();
    for (const [asset, fleet] of Object.entries(appState.autonomousPilot!.activeFleet)) {
      if (fleet.trailingStopPrice) prevFleetStops.set(asset, fleet.trailingStopPrice);
    }

    // 5. Run the Master Quantitative Pilot Cycle
    const tickResult = tickAutonomousPilot(appState, currentMarkets as any, timestamp);

    // Apply fleet status updates and action logs
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
        type: (log.action as any) || 'RISK_GUARD',
        price: log.price || 0,
        qty: 0,
        detail: `[${log.strategy}] ${log.detail}`,
      });
    }

    // Detect Trailing Ratchet movements
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

    // 6. Handle Stale Order Cancellations
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
          detail: `Stale limit order cancelled after rally away from limit entry.`,
        });
      }
    }

    // 7. Dispatch Dispatched Orders (Entries and Exits)
    for (const prop of tickResult.ordersToDispatch) {
      if (prop.side === 'buy') {
        const clientOrderId = `ord_sim_${minuteIdx}_${prop.asset}`;
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
        // Exit triggered by engine (Stop-Loss, Tranche Profit Harvest, or Dead Trade Exit)
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
        const remaining = currentHolding - exitQty;
        if (remaining <= 0) {
          delete positions[prop.asset];
          delete avgBuyPrices[prop.asset];
          delete entryTimestamps[prop.asset];
        } else {
          positions[prop.asset] = remaining;
        }

        realizedPnl += tradePnl;
        totalTradesExecuted++;
        if (tradePnl > 0) winningTrades++;
        else losingTrades++;

        const isProfit = tradePnl > 0;
        replayEvents.push({
          minute: minuteIdx,
          timeStr,
          asset: prop.asset,
          type: isProfit ? 'PROFIT_HARVEST' : 'STOP_LOSS_EXIT',
          price: exitPrice,
          qty: exitQty,
          pnl: tradePnl,
          pnlPct: tradePnlPct,
          detail: `${isProfit ? 'Profit Target / Harvest' : 'Capital Defense Stop'} on ${exitQty} shs @ ₹${exitPrice.toFixed(2)}: P&L ${tradePnl >= 0 ? '+' : ''}₹${tradePnl.toFixed(2)} (${tradePnlPct.toFixed(2)}%)`,
        });
      }
    }
  }

  // Final Portfolio Valuation at Latest Minute
  let finalPositionsValue = 0;
  const latestMarkets: Record<string, { price: number; qty: number; unrealizedPnl: number }> = {};
  for (const [asset, qty] of Object.entries(positions)) {
    if (qty && qty > 0) {
      const lastCandle = assetTodayMap.get(asset as Asset)?.slice(-1)[0];
      const p = lastCandle?.close || avgBuyPrices[asset as Asset] || 0;
      const uPnl = (p - (avgBuyPrices[asset as Asset] || p)) * qty;
      finalPositionsValue += qty * p;
      latestMarkets[asset] = { price: p, qty, unrealizedPnl: uPnl };
    }
  }

  const finalEquity = currentCash + finalPositionsValue;
  const netPnl = finalEquity - initialEquity;
  const netReturnPct = (netPnl / initialEquity) * 100;

  console.log('='.repeat(70));
  console.log('  CHRONOLOGICAL INTRADAY REPLAY COMPLETE');
  console.log('='.repeat(70));
  console.log(`Starting NAV:          ₹${initialEquity.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`Ending NAV:            ₹${finalEquity.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`Net Return:            ${netPnl >= 0 ? '+' : ''}₹${netPnl.toFixed(2)} (${netReturnPct >= 0 ? '+' : ''}${netReturnPct.toFixed(3)}%)`);
  console.log(`Realized P&L:          ${realizedPnl >= 0 ? '+' : ''}₹${realizedPnl.toFixed(2)}`);
  console.log(`Unrealized P&L:        ₹${(finalEquity - currentCash - (initialEquity - currentCash)).toFixed(2)}`);
  console.log(`Trades Closed:         ${totalTradesExecuted} (Wins: ${winningTrades}, Losses: ${losingTrades})`);
  console.log(`Events Logged:         ${replayEvents.length}`);
  console.log('='.repeat(70));

  if (replayEvents.length > 0) {
    console.log('\nCHRONOLOGICAL ACTION LOGS (SAMPLE OF REPLAYED EVENTS):');
    console.log('-'.repeat(70));
    for (const ev of replayEvents) {
      const timeOnly = ev.timeStr.split('T')[1]?.slice(0, 8) || ev.timeStr;
      console.log(`[${timeOnly}] [${ev.asset.padEnd(10)}] [${ev.type.padEnd(16)}] ${ev.detail}`);
    }
    console.log('-'.repeat(70));
  } else {
    console.log('\nZero trade actions dispatched: The fleet remained in STAND_ASIDE or no candidate met the strict multi-factor alpha conviction / Hurst threshold during this session.');
  }

  // Save full replay audit artifact
  const outputDir = join('artifacts', 'today-replay-audit');
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, `replay-${new Date().toISOString().split('T')[0]}.json`);
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        replayedAt: new Date().toISOString(),
        totalBars: sortedTimestamps.length,
        startingEquity: initialEquity,
        endingEquity: finalEquity,
        netReturnPct,
        realizedPnl,
        eventsCount: replayEvents.length,
        events: replayEvents,
        openPositionsAtEnd: latestMarkets,
      },
      null,
      2
    ),
    'utf-8'
  );
  console.log(`\nDetailed JSON audit saved to: ${outputPath}`);
}

main().catch((err) => {
  console.error('Replay failure:', err);
  process.exit(1);
});
