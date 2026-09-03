import { ASSETS, AppState, Asset, Market, Order, Side, OrderType } from './types';

export const META: Record<Asset, { name: string; symbol: string; cbSymbol: string; basePrice: number; decimals: number; iconColor: string }> = {
  BTC: { name: 'Bitcoin', symbol: 'BTCUSDT', cbSymbol: 'BTC-USD', basePrice: 67850, decimals: 5, iconColor: '#f7931a' },
  ETH: { name: 'Ethereum', symbol: 'ETHUSDT', cbSymbol: 'ETH-USD', basePrice: 3520, decimals: 4, iconColor: '#627eea' },
  SOL: { name: 'Solana', symbol: 'SOLUSDT', cbSymbol: 'SOL-USD', basePrice: 152.4, decimals: 3, iconColor: '#14f195' },
  ADA: { name: 'Cardano', symbol: 'ADAUSDT', cbSymbol: 'ADA-USD', basePrice: 0.482, decimals: 2, iconColor: '#0033ad' },
  XRP: { name: 'XRP', symbol: 'XRPUSDT', cbSymbol: 'XRP-USD', basePrice: 0.584, decimals: 2, iconColor: '#23292f' },
  AVAX: { name: 'Avalanche', symbol: 'AVAXUSDT', cbSymbol: 'AVAX-USD', basePrice: 28.6, decimals: 3, iconColor: '#e84142' },
  LINK: { name: 'Chainlink', symbol: 'LINKUSDT', cbSymbol: 'LINK-USD', basePrice: 14.8, decimals: 3, iconColor: '#375bd2' },
  DOGE: { name: 'Dogecoin', symbol: 'DOGEUSDT', cbSymbol: 'DOGE-USD', basePrice: 0.124, decimals: 1, iconColor: '#c2a633' },
};

export const FEE = 0.0008; // 0.08% standard institutional paper taker fee

export const money = (n: number, minDec = 2, maxDec = 2) => {
  if (!Number.isFinite(n)) return '$0.00';
  if (Math.abs(n) < 0.01 && Math.abs(n) > 0) {
    return '$' + n.toFixed(4);
  }
  return (
    '$' +
    n.toLocaleString('en-US', {
      minimumFractionDigits: minDec,
      maximumFractionDigits: maxDec,
    })
  );
};

export const formatQty = (qty: number, asset: Asset) => {
  const dec = META[asset]?.decimals ?? 4;
  return qty.toLocaleString('en-US', { maximumFractionDigits: dec });
};

export function portfolioValue(s: AppState, markets: Record<Asset, Market | undefined>): number {
  return s.cash + ASSETS.reduce((sum, a) => sum + (s.positions[a] || 0) * (markets[a]?.price || 0), 0);
}

export function positionValue(s: AppState, markets: Record<Asset, Market | undefined>, a: Asset): number {
  return (s.positions[a] || 0) * (markets[a]?.price || 0);
}

export function positionPnl(s: AppState, markets: Record<Asset, Market | undefined>, a: Asset) {
  const units = s.positions[a] || 0;
  const currentPrice = markets[a]?.price || 0;
  const avgBuy = s.avgBuyPrice?.[a] || currentPrice;
  if (units <= 0 || !currentPrice) return { amount: 0, pct: 0 };
  const cost = units * avgBuy;
  const currentVal = units * currentPrice;
  const amount = currentVal - cost;
  const pct = cost > 0 ? (amount / cost) * 100 : 0;
  return { amount, pct };
}

export function totalPortfolioPnl(s: AppState, markets: Record<Asset, Market | undefined>) {
  const totalVal = portfolioValue(s, markets);
  const diff = totalVal - s.initialCash;
  const pct = s.initialCash > 0 ? (diff / s.initialCash) * 100 : 0;
  return { amount: diff, pct };
}

export function returns(h: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < h.length; i++) {
    if (h[i - 1] > 0) {
      r.push((h[i] - h[i - 1]) / h[i - 1]);
    }
  }
  return r;
}

export function stdev(v: number[]): number {
  if (v.length < 2) return 0;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}

export function sma(v: number[], p: number): number | null {
  if (v.length < p) return null;
  return v.slice(-p).reduce((a, b) => a + b, 0) / p;
}

export function ema(v: number[], p: number): number | null {
  if (v.length < p) return null;
  const k = 2 / (p + 1);
  let currentEma = v.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < v.length; i++) {
    currentEma = v[i] * k + currentEma * (1 - k);
  }
  return currentEma;
}

export function bollingerBands(v: number[], p = 20, mult = 2) {
  if (v.length < p) return null;
  const slice = v.slice(-p);
  const mid = slice.reduce((a, b) => a + b, 0) / p;
  const dev = Math.sqrt(slice.reduce((a, b) => a + (b - mid) ** 2, 0) / p);
  return {
    upper: mid + dev * mult,
    middle: mid,
    lower: mid - dev * mult,
    bandwidth: mid > 0 ? ((dev * mult * 2) / mid) * 100 : 0,
  };
}

export function rsi(v: number[], p = 14): number {
  if (v.length < p + 1) return 50;
  let g = 0, l = 0;
  for (let i = v.length - p; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    if (d >= 0) g += d;
    else l -= d;
  }
  const ag = g / p, al = l / p;
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

export function indicators(h: number[]) {
  if (!h || h.length < 5) {
    return { s10: null, s30: null, rsi: 50, vol: 0.02, chg: 0, score: 0, bb: null };
  }
  const s10 = sma(h, 10);
  const s30 = sma(h, 30);
  const rr = rsi(h);
  const vol = stdev(returns(h.slice(-20)));
  const base = h[Math.max(0, h.length - 25)];
  const chg = base ? ((h[h.length - 1] - base) / base) * 100 : 0;
  const bb = bollingerBands(h, 20);

  let score = 0;
  if (s10 != null && s30 != null) {
    if (s10 > s30 * 1.002) score += 1;
    else if (s10 < s30 * 0.998) score -= 1;
  }
  if (rr > 62) score += 1;
  else if (rr < 38) score -= 1;

  if (bb && h.length > 0) {
    const lastP = h[h.length - 1];
    if (lastP < bb.lower) score += 1; // oversold bounce candidate
    else if (lastP > bb.upper) score -= 1; // overbought
  }

  return { s10, s30, rsi: rr, vol, chg, score, bb };
}

export function risk(s: AppState, markets: Record<Asset, Market | undefined>) {
  const value = portfolioValue(s, markets);
  const weights = Object.fromEntries(
    ASSETS.map((a) => [a, value > 0 ? positionValue(s, markets, a) / value : 0])
  ) as Record<Asset, number>;

  const vol = ASSETS.reduce(
    (sum, a) => sum + weights[a] * stdev(returns((markets[a]?.history || []).slice(-20))),
    0
  );

  const top = Math.max(0, ...ASSETS.map((a) => weights[a]));
  const cashRatio = value > 0 ? s.cash / value : 1;

  // Score formula: heavily penalized by concentrated single-asset exposure, moderated by cash buffer
  const concentrationRisk = top * 55;
  const volatilityRisk = Math.min(vol * 3500, 35);
  const cashShield = (1 - cashRatio) * 15;

  const score = Math.max(5, Math.min(95, Math.round(concentrationRisk + volatilityRisk + cashShield)));

  let label = 'Conservative';
  if (score >= 68) label = 'Aggressive';
  else if (score >= 40) label = 'Moderate';

  return {
    score,
    label,
    weights,
    vol,
    cashRatio,
  };
}

export function executeOrder(
  s: AppState,
  markets: Record<Asset, Market | undefined>,
  side: Side,
  asset: Asset,
  amount: number,
  options?: {
    type?: OrderType;
    limitPrice?: number;
    auto?: boolean;
    strategyName?: string;
    takeProfit?: number;
    stopLoss?: number;
  }
): { ok: boolean; error?: string; order?: Order } {
  const qty = Math.abs(Number(amount));
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: 'Please enter a positive trade quantity.' };
  }

  const marketPrice = markets[asset]?.price || 0;
  if (!marketPrice) {
    return { ok: false, error: `Live quote for ${asset} is not yet available.` };
  }

  const type = options?.type || 'market';
  const auto = options?.auto ?? false;
  const strategyName = options?.strategyName;

  // Modeled realistic execution slippage and liquidity impact
  const rawNotional = marketPrice * qty;
  const impact = Math.min(0.0003 + rawNotional / 5000000, 0.015);
  const executionPrice = side === 'buy' ? marketPrice * (1 + impact) : marketPrice * (1 - impact);

  const notional = executionPrice * qty;
  const fee = notional * FEE;

  if (side === 'buy') {
    const totalRequired = notional + fee;
    if (totalRequired > s.cash + 0.01) {
      return {
        ok: false,
        error: `Insufficient cash. Need ${money(totalRequired)}, available ${money(s.cash)}.`,
      };
    }

    const priorQty = s.positions[asset] || 0;
    const priorAvg = s.avgBuyPrice?.[asset] || executionPrice;
    const newQty = priorQty + qty;
    const newAvg = (priorQty * priorAvg + notional) / Math.max(newQty, 1e-6);

    s.cash -= totalRequired;
    s.positions[asset] = newQty;
    if (!s.avgBuyPrice) s.avgBuyPrice = {} as Record<Asset, number>;
    s.avgBuyPrice[asset] = newAvg;
  } else {
    const currentHolding = s.positions[asset] || 0;
    if (qty > currentHolding + 1e-8) {
      return {
        ok: false,
        error: `Insufficient ${asset} balance. Holding ${formatQty(currentHolding, asset)}, attempted to sell ${formatQty(qty, asset)}.`,
      };
    }

    s.positions[asset] = Math.max(0, currentHolding - qty);
    s.cash += notional - fee;
  }

  const order: Order = {
    id: 'ord_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
    ts: Date.now(),
    side,
    type,
    asset,
    amount: qty,
    price: executionPrice,
    fee,
    notional,
    auto,
    strategyName,
    status: 'filled',
    takeProfit: options?.takeProfit,
    stopLoss: options?.stopLoss,
  };

  s.orders = [order, ...s.orders].slice(0, 300);

  return { ok: true, order };
}
