export const ASSETS = ['BTC', 'ETH', 'SOL', 'ADA'] as const;
export type Asset = (typeof ASSETS)[number];
export type Side = 'buy' | 'sell';

export type AssetState = { current: number; history: number[] };
export type Order = { id: string; ts: number; side: Side; sym: Asset; amount: number; price: number; fee: number; notional: number; auto: boolean };
export type PortfolioState = { cash: number; positions: Record<Asset, number>; prices: Record<Asset, AssetState>; startValue: number; orderHistory: Order[]; autoTrade: Record<Asset, boolean>; notifications: { title: string; body: string; ts: number }[] };

export const META: Record<Asset, { name: string; letter: string; mu: number; sigma: number }> = {
  BTC: { name: 'Bitcoin', letter: '₿', mu: 0.10, sigma: 0.55 },
  ETH: { name: 'Ethereum', letter: 'Ξ', mu: 0.08, sigma: 0.65 },
  SOL: { name: 'Solana', letter: 'S', mu: 0.14, sigma: 0.90 },
  ADA: { name: 'Cardano', letter: 'A', mu: 0.02, sigma: 0.75 },
};

export const START_PRICE: Record<Asset, number> = { BTC: 67240.55, ETH: 3481.20, SOL: 168.94, ADA: 0.612 };
export const FEE_RATE = 0.0008;
export const MAX_HISTORY = 320;
export const TICK_MS = 3000;
export const AUTOTRADE_COOLDOWN_MS = 30000;
export const VOL_BREAKER_THRESHOLD = 0.028;

export function gbmStep(price: number, mu: number, sigma: number, dt = 1 / 2000): number {
  const shock = (Math.random() * 2 - 1 + Math.random() * 2 - 1 + Math.random() * 2 - 1 + Math.random() * 2 - 1 + Math.random() * 2 - 1 + Math.random() * 2 - 1) / 1.5;
  return Math.max(0.0001, price * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * shock));
}

export function computeReturns(history: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < history.length; i += 1) returns.push((history[i] - history[i - 1]) / history[i - 1]);
  return returns;
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / period;
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function rsi(history: number[], period = 14): number {
  if (history.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = history.length - period; i < history.length; i += 1) {
    const delta = history[i] - history[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export type Indicators = { sma10: number | null; sma30: number | null; rsi: number; vol: number; pctChange: number; score: number };

export function indicatorsFor(asset: Asset, state: PortfolioState): Indicators {
  const history = state.prices[asset].history;
  const sma10 = sma(history, 10);
  const sma30 = sma(history, Math.min(30, history.length));
  const currentRsi = rsi(history);
  const vol = stdev(computeReturns(history.slice(-20)));
  const base = history.length > 25 ? history[history.length - 25] : history[0];
  const pctChange = ((history[history.length - 1] - base) / base) * 100;
  let score = 0;
  if (sma10 !== null && sma30 !== null) score += sma10 > sma30 ? 1 : -1;
  if (currentRsi > 60) score += 1;
  else if (currentRsi < 40) score -= 1;
  return { sma10, sma30, rsi: currentRsi, vol, pctChange, score };
}

export function portfolioValue(state: PortfolioState): number {
  return ASSETS.reduce((total, asset) => total + (state.positions[asset] ?? 0) * state.prices[asset].current, state.cash);
}

export function computeRisk(state: PortfolioState) {
  const value = portfolioValue(state);
  const weights = Object.fromEntries(ASSETS.map((asset) => [asset, value > 0 ? ((state.positions[asset] ?? 0) * state.prices[asset].current) / value : 0])) as Record<Asset, number>;
  const maxWeight = Math.max(...Object.values(weights));
  const vol = ASSETS.reduce((sum, asset) => sum + weights[asset] * stdev(computeReturns(state.prices[asset].history.slice(-20))), 0);
  const score = Math.max(4, Math.min(96, Math.round(maxWeight * 100 * 0.55 + Math.min(vol * 3200, 45))));
  const label = score < 35 ? 'Conservative' : score < 65 ? 'Moderate' : 'Aggressive';
  return { score, label, maxWeight, vol, weights };
}
