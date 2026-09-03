import { ASSETS, Asset, Market, Timeframe } from './types';
import { META } from './trading';

const BINANCE = 'https://api.binance.com';
const COINBASE = 'https://api.exchange.coinbase.com';

const tfMap: Record<Timeframe, { bin: string; count: number; stepMs: number; granSec: number }> = {
  '1H': { bin: '1m', count: 60, stepMs: 60000, granSec: 60 },
  '1D': { bin: '15m', count: 96, stepMs: 900000, granSec: 900 },
  '1W': { bin: '1h', count: 168, stepMs: 3600000, granSec: 3600 },
  '1M': { bin: '4h', count: 180, stepMs: 14400000, granSec: 14400 },
  '1Y': { bin: '1d', count: 365, stepMs: 86400000, granSec: 86400 },
};

const safe = async <T>(u: string): Promise<T> => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 3500);
  try {
    const r = await fetch(u, { signal: controller.signal });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  } finally {
    clearTimeout(t);
  }
};

async function binance(asset: Asset, tf: Timeframe): Promise<Market> {
  const sym = META[asset].symbol;
  const t = await safe<any>(`${BINANCE}/api/v3/ticker/24hr?symbol=${sym}`);
  const rows = await safe<any[]>(
    `${BINANCE}/api/v3/klines?symbol=${sym}&interval=${tfMap[tf].bin}&limit=${tfMap[tf].count}`
  );
  const candles = rows.map((x) => ({
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
    symbol: META[asset].symbol,
    price: +t.lastPrice,
    change24h: +t.priceChangePercent,
    high24h: +t.highPrice,
    low24h: +t.lowPrice,
    volume24h: +t.quoteVolume,
    history: candles.map((c) => c.close),
    candles,
    source: 'Binance',
  };
}

async function coinbase(asset: Asset, tf: Timeframe): Promise<Market> {
  const product = META[asset].cbSymbol;
  const gran = tfMap[tf].granSec;
  const stats = await safe<any>(`${COINBASE}/products/${product}/stats`);
  const rows = await safe<any[]>(`${COINBASE}/products/${product}/candles?granularity=${gran}`);
  const cs = rows
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
    source: 'Coinbase',
  };
}

function fallbackMarket(asset: Asset, tf: Timeframe): Market {
  const base = META[asset]?.basePrice || 100;
  const cfg = tfMap[tf];
  const now = Date.now();
  const candles: any[] = [];
  let curr = base * 0.985;
  const seed = asset.charCodeAt(0) * 7 + asset.charCodeAt(asset.length - 1);

  for (let i = 0; i < cfg.count; i++) {
    const time = now - (cfg.count - i) * cfg.stepMs;
    const wave =
      Math.sin((i + seed) * 0.28) * (base * 0.007) +
      Math.cos((i + seed * 2) * 0.12) * (base * 0.004) +
      ((Math.random() - 0.49) * (base * 0.003));
    const open = curr;
    const close = Math.max(open * 0.7, open + wave);
    const high = Math.max(open, close) * (1 + 0.0025 + Math.random() * 0.001);
    const low = Math.min(open, close) * (1 - 0.0025 - Math.random() * 0.001);
    const volume = base * (25 + (i % 7) * 8 + Math.random() * 12);
    candles.push({ time, open, high, low, close, volume });
    curr = close;
  }

  const lastPrice = candles[candles.length - 1].close;
  const firstPrice = candles[0].open;
  const change24h = ((lastPrice - firstPrice) / firstPrice) * 100;
  const high24h = Math.max(...candles.map((c) => c.high));
  const low24h = Math.min(...candles.map((c) => c.low));
  const volume24h = candles.reduce((acc, c) => acc + c.volume, 0);

  return {
    asset,
    name: META[asset].name,
    symbol: META[asset].symbol,
    price: +lastPrice.toFixed(META[asset].decimals > 2 ? 4 : 2),
    change24h: +change24h.toFixed(2),
    high24h: +high24h.toFixed(META[asset].decimals > 2 ? 4 : 2),
    low24h: +low24h.toFixed(META[asset].decimals > 2 ? 4 : 2),
    volume24h: +volume24h.toFixed(0),
    history: candles.map((c) => c.close),
    candles,
    source: 'Heuristic Feed',
  };
}

export async function fetchMarket(asset: Asset, tf: Timeframe): Promise<Market> {
  try {
    return await binance(asset, tf);
  } catch {
    try {
      return await coinbase(asset, tf);
    } catch {
      return fallbackMarket(asset, tf);
    }
  }
}

export async function fetchAll(tf: Timeframe): Promise<Record<Asset, Market>> {
  const results = await Promise.all(ASSETS.map((a) => fetchMarket(a, tf)));
  return Object.fromEntries(results.map((m) => [m.asset, m])) as Record<Asset, Market>;
}
