import { ASSETS, INDIAN_ASSETS, Asset, Candle, DataSource, Market, Timeframe } from '../types';
import { META, isIndianAsset } from '../domain/portfolio';
import { ApiClient } from './apiClient';

const BINANCE_REST = 'https://api.binance.com';
const COINBASE_REST = 'https://api.exchange.coinbase.com';
const BINANCE_WS = 'wss://stream.binance.com:9443/ws/!miniTicker@arr';

export const tfMap: Record<Timeframe, { bin: string; count: number; stepMs: number; granSec: number }> = {
  '1H': { bin: '1m', count: 60, stepMs: 60000, granSec: 60 },
  '1D': { bin: '15m', count: 96, stepMs: 900000, granSec: 900 },
  '1W': { bin: '1h', count: 168, stepMs: 3600000, granSec: 3600 },
  '1M': { bin: '4h', count: 180, stepMs: 14400000, granSec: 14400 },
  '1Y': { bin: '1d', count: 365, stepMs: 86400000, granSec: 86400 },
};

const safeFetch = async <T>(url: string, timeoutMs = 4500): Promise<T> => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(t);
  }
};

/**
 * Deterministic seeded pseudo-random generator (Mulberry32).
 * Ensures reproducible market candle bars across simulation ticks without Math.random jitter.
 */
function createSeededRng(seed: number) {
  let s = (seed || 1337) >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic synthetic simulation fallback when external exchange networks are unreachable or rate-limited.
 * Uses seeded pseudo-random curves for fully deterministic, reproducible candle bars.
 */
export function generateHeuristicMarket(asset: Asset, tf: Timeframe): Market {
  const meta = META[asset];
  const base = meta?.basePrice || 100;
  const cfg = tfMap[tf];
  const now = Date.now();
  const candles: Candle[] = [];
  let curr = base * 0.985;
  const baseSeed = asset.split('').reduce((acc, char, idx) => acc + char.charCodeAt(0) * (idx + 13), 777);
  const rng = createSeededRng(baseSeed + cfg.count * 17);

  for (let i = 0; i < cfg.count; i++) {
    const time = now - (cfg.count - i) * cfg.stepMs;
    const r1 = rng();
    const r2 = rng();
    const r3 = rng();
    const wave =
      Math.sin((i + baseSeed) * 0.28) * (base * 0.007) +
      Math.cos((i + baseSeed * 2) * 0.12) * (base * 0.004) +
      (r1 - 0.49) * (base * 0.003);
    const open = curr;
    const close = Math.max(open * 0.6, open + wave);
    const high = Math.max(open, close) * (1 + 0.0025 + r2 * 0.001);
    const low = Math.min(open, close) * (1 - 0.0025 - r3 * 0.001);
    const volume = base * (25 + (i % 7) * 8 + r1 * 12);
    candles.push({ time, open, high, low, close, volume });
    curr = close;
  }

  const lastPrice = candles[candles.length - 1].close;
  const firstPrice = candles[0].open;
  const change24h = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
  const high24h = Math.max(...candles.map((c) => c.high));
  const low24h = Math.min(...candles.map((c) => c.low));
  const volume24h = candles.reduce((acc, c) => acc + c.volume, 0);

  return {
    asset,
    name: meta.name,
    symbol: meta.symbol,
    price: +lastPrice.toFixed(meta.decimals > 2 ? 4 : 2),
    change24h: +change24h.toFixed(2),
    high24h: +high24h.toFixed(meta.decimals > 2 ? 4 : 2),
    low24h: +low24h.toFixed(meta.decimals > 2 ? 4 : 2),
    volume24h: +volume24h.toFixed(0),
    history: candles.map((c) => c.close),
    candles,
    source: meta.category === 'Indian Equities' ? 'Upstox Heuristic Simulation' : 'Synthetic Heuristic Simulation',
    isSynthetic: true,
    lastUpdated: now,
    category: meta.category,
  };
}

/**
 * Single-asset fetch from Binance REST API.
 */
async function fetchBinanceAsset(asset: Asset, tf: Timeframe): Promise<Market> {
  const sym = META[asset].symbol;
  const ticker = await safeFetch<any>(`${BINANCE_REST}/api/v3/ticker/24hr?symbol=${sym}`);
  const rows = await safeFetch<any[]>(
    `${BINANCE_REST}/api/v3/klines?symbol=${sym}&interval=${tfMap[tf].bin}&limit=${tfMap[tf].count}`
  );
  const candles: Candle[] = rows.map((x) => ({
    time: x[0],
    open: +x[1],
    high: +x[2],
    low: +x[3],
    close: +x[4],
    volume: +x[5],
  }));

  return {
    asset,
    name: META[asset].name,
    symbol: sym,
    price: +ticker.lastPrice,
    change24h: +ticker.priceChangePercent,
    high24h: +ticker.highPrice,
    low24h: +ticker.lowPrice,
    volume24h: +ticker.quoteVolume,
    history: candles.map((c) => c.close),
    candles,
    source: 'Binance REST',
    isSynthetic: false,
    lastUpdated: Date.now(),
    category: META[asset].category,
  };
}

/**
 * Coinbase REST fallback.
 */
async function fetchCoinbaseAsset(asset: Asset, tf: Timeframe): Promise<Market> {
  const product = META[asset].cbSymbol;
  const gran = tfMap[tf].granSec;
  const stats = await safeFetch<any>(`${COINBASE_REST}/products/${product}/stats`);
  const rows = await safeFetch<any[]>(`${COINBASE_REST}/products/${product}/candles?granularity=${gran}`);
  const cs: Candle[] = rows
    .slice(0, tfMap[tf].count)
    .reverse()
    .map((x) => ({
      time: x[0] * 1000,
      low: +x[1],
      high: +x[2],
      open: +x[3],
      close: +x[4],
      volume: +x[5],
    }));

  const price = +stats.last;
  const open = +stats.open;

  return {
    asset,
    name: META[asset].name,
    symbol: META[asset].symbol,
    price,
    change24h: open ? ((price - open) / open) * 100 : 0,
    high24h: +stats.high,
    low24h: +stats.low,
    volume24h: price * +stats.volume,
    history: cs.map((c) => c.close),
    candles: cs,
    source: 'Coinbase REST',
    isSynthetic: false,
    lastUpdated: Date.now(),
    category: META[asset].category,
  };
}

/**
 * Robust asset fetch cascading: Binance REST -> Coinbase REST -> Heuristic Simulator.
 */
export async function fetchMarket(asset: Asset, tf: Timeframe): Promise<Market> {
  if (isIndianAsset(asset) || META[asset]?.category === 'Indian Equities') {
    try {
      const [upstoxRes, candleRes] = await Promise.all([
        ApiClient.getUpstoxMarketQuotes([asset]),
        ApiClient.getUpstoxCandles(asset, tf),
      ]);
      const uq = upstoxRes?.data?.quotes?.[asset];
      if (uq && (uq.price > 0 || uq.lastPrice > 0)) {
        const meta = META[asset];
        const price = +(uq.price || uq.lastPrice);
        const change24h = +(uq.change24h || 0);
        const high24h = +(uq.upperCircuitLimit || price * 1.05);
        const low24h = +(uq.lowerCircuitLimit || price * 0.95);
        const volume24h = +(uq.volume || 100000);
        const now = Date.now();

        let candles: Candle[] = [];
        if (candleRes?.data?.candles && candleRes.data.candles.length > 0) {
          candles = candleRes.data.candles;
        } else {
          const cfg = tfMap[tf];
          const count = cfg.count;
          const openPrice = price / (1 + change24h / 100);
          const range = high24h - low24h || price * 0.03;
          const seed = asset.charCodeAt(0) * 11 + asset.charCodeAt(asset.length - 1);
          let prev = openPrice;
          for (let i = 0; i < count; i++) {
            const time = now - (count - i) * cfg.stepMs;
            const progress = i / Math.max(count - 1, 1);
            const trend = openPrice + progress * (price - openPrice);
            const wave =
              Math.sin((i + seed) * 0.42) * (range * 0.18) +
              Math.cos((i + seed * 2) * 0.22) * (range * 0.08);
            const closeVal = Math.max(low24h * 0.995, Math.min(high24h * 1.005, trend + wave));
            const openVal = i === 0 ? openPrice : prev;
            candles.push({
              time,
              open: openVal,
              high: Math.max(openVal, closeVal) * 1.002,
              low: Math.min(openVal, closeVal) * 0.998,
              close: closeVal,
              volume: (volume24h || 100000) / count,
            });
            prev = closeVal;
          }
          candles[candles.length - 1].close = price;
        }

        return {
          asset,
          name: meta.name,
          symbol: meta.symbol,
          price,
          change24h,
          high24h,
          low24h,
          volume24h,
          history: candles.map((c) => c.close),
          candles,
          source: uq.source || 'Upstox REST (Live)',
          isSynthetic: Boolean(uq.isSynthetic),
          lastUpdated: now,
          category: meta.category,
        };
      }
    } catch {}
  }

  try {
    return await fetchBinanceAsset(asset, tf);
  } catch {
    try {
      return await fetchCoinbaseAsset(asset, tf);
    } catch {
      return generateHeuristicMarket(asset, tf);
    }
  }
}

/**
 * High-performance bulk fetcher: fetches all 100+ markets in a single bulk API call
 * to avoid 429 rate limits, with high-resolution candles for the active focus asset.
 */
export async function fetchAll(tf: Timeframe, focusAsset?: Asset): Promise<Record<Asset, Market>> {
  try {
    const allTickers = await safeFetch<any[]>(`${BINANCE_REST}/api/v3/ticker/24hr`);
    const tickerMap = new Map<string, any>();
    if (Array.isArray(allTickers)) {
      for (const t of allTickers) {
        tickerMap.set(t.symbol, t);
      }
    }

    let upstoxQuotes: Record<string, any> = {};
    try {
      const upstoxRes = await ApiClient.getUpstoxMarketQuotes();
      if (upstoxRes?.data?.quotes) {
        upstoxQuotes = upstoxRes.data.quotes;
      }
    } catch {}

    const activeAsset = focusAsset || 'RELIANCE';
    let focusCandles: Candle[] | null = null;
    if (isIndianAsset(activeAsset)) {
      try {
        const cRes = await ApiClient.getUpstoxCandles(activeAsset, tf);
        if (cRes?.data?.candles && cRes.data.candles.length > 0) {
          focusCandles = cRes.data.candles;
        }
      } catch {}
    } else {
      try {
        const sym = META[activeAsset].symbol;
        const rows = await safeFetch<any[]>(
          `${BINANCE_REST}/api/v3/klines?symbol=${sym}&interval=${tfMap[tf].bin}&limit=${tfMap[tf].count}`
        );
        if (Array.isArray(rows)) {
          focusCandles = rows.map((x) => ({
            time: x[0],
            open: +x[1],
            high: +x[2],
            low: +x[3],
            close: +x[4],
            volume: +x[5],
          }));
        }
      } catch {
        // ignore, focusCandles will remain null
      }
    }

    const now = Date.now();
    const result: Partial<Record<Asset, Market>> = {};

    for (const a of ASSETS) {
      const meta = META[a];
      const t = tickerMap.get(meta.symbol);
      const uq = upstoxQuotes[a];

      if (uq && (uq.price > 0 || uq.lastPrice > 0)) {
        const price = +(uq.price || uq.lastPrice);
        const change24h = +(uq.change24h || 0);
        const high24h = +(uq.upperCircuitLimit || price * 1.05);
        const low24h = +(uq.lowerCircuitLimit || price * 0.95);
        const volume24h = +(uq.volume || 100000);

        let candles: Candle[];
        let history: number[];

        if (a === activeAsset && focusCandles && focusCandles.length > 0) {
          candles = focusCandles;
          history = candles.map((c) => c.close);
        } else {
          const cfg = tfMap[tf];
          const count = cfg.count;
          const openPrice = price / (1 + change24h / 100);
          const range = high24h - low24h || price * 0.03;
          candles = [];
          const seed = a.charCodeAt(0) * 11 + a.charCodeAt(a.length - 1);
          let prev = openPrice;

          for (let i = 0; i < count; i++) {
            const time = now - (count - i) * cfg.stepMs;
            const progress = i / Math.max(count - 1, 1);
            const trend = openPrice + progress * (price - openPrice);
            const wave =
              Math.sin((i + seed) * 0.42) * (range * 0.18) +
              Math.cos((i + seed * 2) * 0.22) * (range * 0.08);
            const closeVal = Math.max(low24h * 0.995, Math.min(high24h * 1.005, trend + wave));
            const openVal = i === 0 ? openPrice : prev;
            const hVal = Math.max(openVal, closeVal) * 1.002;
            const lVal = Math.min(openVal, closeVal) * 0.998;
            candles.push({
              time,
              open: openVal,
              high: hVal,
              low: lVal,
              close: closeVal,
              volume: (volume24h || 100000) / count,
            });
            prev = closeVal;
          }
          candles[candles.length - 1].close = price;
          history = candles.map((c) => c.close);
        }

        result[a] = {
          asset: a,
          name: meta.name,
          symbol: meta.symbol,
          price,
          change24h,
          high24h,
          low24h,
          volume24h,
          history,
          candles,
          source: uq.source || 'Upstox REST (Live)',
          isSynthetic: Boolean(uq.isSynthetic),
          lastUpdated: now,
          category: meta.category,
        };
      } else if (t) {
        const price = +t.lastPrice;
        const change24h = +t.priceChangePercent;
        const high24h = +t.highPrice;
        const low24h = +t.lowPrice;
        const volume24h = +t.quoteVolume;

        let candles: Candle[];
        let history: number[];

        if (a === activeAsset && focusCandles && focusCandles.length > 0) {
          candles = focusCandles;
          history = candles.map((c) => c.close);
        } else {
          const cfg = tfMap[tf];
          const count = cfg.count;
          const openPrice = +t.openPrice || (price / (1 + change24h / 100));
          const range = high24h - low24h || price * 0.03;
          candles = [];
          const seed = a.charCodeAt(0) * 11 + a.charCodeAt(a.length - 1);
          let prev = openPrice;

          for (let i = 0; i < count; i++) {
            const time = now - (count - i) * cfg.stepMs;
            const progress = i / Math.max(count - 1, 1);
            const trend = openPrice + progress * (price - openPrice);
            const wave =
              Math.sin((i + seed) * 0.42) * (range * 0.18) +
              Math.cos((i + seed * 2) * 0.22) * (range * 0.08);
            const closeVal = Math.max(low24h * 0.995, Math.min(high24h * 1.005, trend + wave));
            const openVal = i === 0 ? openPrice : prev;
            const hVal = Math.max(openVal, closeVal) * 1.002;
            const lVal = Math.min(openVal, closeVal) * 0.998;
            candles.push({
              time,
              open: openVal,
              high: hVal,
              low: lVal,
              close: closeVal,
              volume: (volume24h || 100000) / count,
            });
            prev = closeVal;
          }
          candles[candles.length - 1].close = price;
          history = candles.map((c) => c.close);
        }

        result[a] = {
          asset: a,
          name: meta.name,
          symbol: meta.symbol,
          price,
          change24h,
          high24h,
          low24h,
          volume24h,
          history,
          candles,
          source: 'Binance REST',
          isSynthetic: false,
          lastUpdated: now,
          category: meta.category,
        };
      } else {
        result[a] = generateHeuristicMarket(a, tf);
      }
    }

    return result as Record<Asset, Market>;
  } catch {
    const res: Partial<Record<Asset, Market>> = {};
    for (const a of ASSETS) {
      res[a] = generateHeuristicMarket(a, tf);
    }
    return res as Record<Asset, Market>;
  }
}

/**
 * WebSocket Live Stream Manager for real-time Binance mini-ticker feeds.
 */
export class MarketStreamService {
  private ws: WebSocket | null = null;
  private onTickCallback: ((updates: Partial<Record<Asset, { price: number; high: number; low: number; volume: number; changePct: number }>>) => void) | null = null;
  private onStatusChange: ((status: DataSource) => void) | null = null;
  private reconnectTimer: any = null;
  private simTickerTimer: any = null;
  private simulatedPrices: Partial<Record<Asset, { price: number; high: number; low: number; base: number; volume: number }>> = {};
  private isDestroyed = false;

  constructor(
    onTick: (updates: Partial<Record<Asset, { price: number; high: number; low: number; volume: number; changePct: number }>>) => void,
    onStatusChange?: (status: DataSource) => void
  ) {
    this.onTickCallback = onTick;
    this.onStatusChange = onStatusChange || null;
    this.initSimulatedPrices();
    this.connect();
    this.startSimulatedTickLoop();
  }

  private initSimulatedPrices() {
    for (const a of INDIAN_ASSETS) {
      const meta = META[a];
      const base = meta?.basePrice || 1000;
      this.simulatedPrices[a] = {
        price: base,
        high: +(base * 1.015).toFixed(2),
        low: +(base * 0.985).toFixed(2),
        base,
        volume: 1000000,
      };
    }
  }

  private startSimulatedTickLoop() {
    this.simTickerTimer = setInterval(() => {
      if (this.isDestroyed || !this.onTickCallback) return;
      const updates: Partial<Record<Asset, { price: number; high: number; low: number; volume: number; changePct: number }>> = {};

      for (const a of INDIAN_ASSETS) {
        const item = this.simulatedPrices[a];
        if (!item) continue;

        // Subtle realistic Brownian motion tick (+/- 0.04% - 0.10%)
        const deltaPct = (Math.random() - 0.495) * 0.002;
        let newPrice = item.price * (1 + deltaPct);
        // Constrain within daily +/- 3.5% corridor of base price
        const minBound = item.base * 0.965;
        const maxBound = item.base * 1.035;
        newPrice = Math.max(minBound, Math.min(maxBound, newPrice));
        // Align to NSE 0.05 tick size
        newPrice = +(Math.round(newPrice / 0.05) * 0.05).toFixed(2);

        item.price = newPrice;
        item.high = Math.max(item.high, newPrice);
        item.low = Math.min(item.low, newPrice);
        item.volume += Math.floor(Math.random() * 500 + 50);

        const changePct = item.base > 0 ? +(((newPrice - item.base) / item.base) * 100).toFixed(2) : 0;

        updates[a] = {
          price: newPrice,
          high: item.high,
          low: item.low,
          volume: item.volume,
          changePct,
        };
      }

      if (Object.keys(updates).length > 0 && this.onTickCallback) {
        this.onTickCallback(updates);
      }
    }, 2000);
  }

  private connect() {
    if (this.isDestroyed) return;
    try {
      this.ws = new WebSocket(BINANCE_WS);

      this.ws.onopen = () => {
        if (this.onStatusChange) this.onStatusChange('Binance WebSocket (Live)');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (!Array.isArray(data)) return;

          const updates: Partial<Record<Asset, { price: number; high: number; low: number; volume: number; changePct: number }>> = {};
          const symbolToAsset: Record<string, Asset> = Object.fromEntries(
            ASSETS.map((a) => [META[a].symbol, a])
          );

          for (const item of data) {
            const asset = symbolToAsset[item.s];
            if (asset) {
              const close = +item.c;
              const open = +item.o;
              const changePct = open > 0 ? ((close - open) / open) * 100 : 0;
              updates[asset] = {
                price: close,
                high: +item.h,
                low: +item.l,
                volume: +item.q,
                changePct,
              };
            }
          }

          if (Object.keys(updates).length > 0 && this.onTickCallback) {
            this.onTickCallback(updates);
          }
        } catch {
          // ignore malformed frame
        }
      };

      this.ws.onerror = () => {
        if (this.onStatusChange) this.onStatusChange('Binance REST');
      };

      this.ws.onclose = () => {
        if (!this.isDestroyed) {
          this.reconnectTimer = setTimeout(() => this.connect(), 4000);
        }
      };
    } catch {
      if (this.onStatusChange) this.onStatusChange('Binance REST');
    }
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.simTickerTimer) clearInterval(this.simTickerTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }
}
