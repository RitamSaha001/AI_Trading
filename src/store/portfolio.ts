import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  ASSETS, Asset, AssetState, AUTOTRADE_COOLDOWN_MS, FEE_RATE, gbmStep, indicatorsFor,
  MAX_HISTORY, META, Order, PortfolioState, START_PRICE, TICK_MS, VOL_BREAKER_THRESHOLD,
  computeRisk, portfolioValue,
} from '../domain/trading';

type AppState = PortfolioState & {
  selectedAsset: Asset;
  breakerActive: boolean;
  lastAutoTradeAt: Partial<Record<Asset, number>>;
  setSelectedAsset: (asset: Asset) => void;
  tick: () => void;
  executeOrder: (input: { side: 'buy' | 'sell'; sym: Asset; amount: number; auto?: boolean }) => { ok: boolean; error?: string; order?: Order };
  toggleAutoTrade: (asset: Asset) => void;
  resetSimulation: () => void;
};

function initialPortfolio(): PortfolioState {
  const prices = {} as Record<Asset, AssetState>;
  ASSETS.forEach((asset) => {
    let current = START_PRICE[asset];
    const history = [current];
    for (let i = 0; i < 40; i += 1) {
      current = gbmStep(current, META[asset].mu, META[asset].sigma);
      history.push(current);
    }
    prices[asset] = { current, history };
  });
  const base = { cash: 30000, positions: { BTC: 1.842, ETH: 12.4, SOL: 210, ADA: 8200 }, prices, startValue: 0, orderHistory: [], autoTrade: { BTC: false, ETH: false, SOL: false, ADA: false }, notifications: [] } satisfies PortfolioState;
  base.startValue = portfolioValue(base);
  return base;
}

export const usePortfolioStore = create<AppState>()(persist((set, get) => ({
  ...initialPortfolio(),
  selectedAsset: 'BTC',
  breakerActive: false,
  lastAutoTradeAt: {},

  setSelectedAsset: (selectedAsset) => set({ selectedAsset }),

  executeOrder: ({ side, sym, amount, auto = false }) => {
    const current = get();
    const qty = Math.abs(Number(amount));
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: 'Enter a valid amount.' };
    const price = current.prices[sym].current;
    const notionalRaw = price * qty;
    const impact = Math.min(0.0004 + notionalRaw / 4_500_000, 0.02);
    const fillPrice = side === 'buy' ? price * (1 + impact) : price * (1 - impact);
    const notional = fillPrice * qty;
    const fee = notional * FEE_RATE;

    if (side === 'buy') {
      const cost = notional + fee;
      if (cost > current.cash) return { ok: false, error: 'Insufficient cash balance for this order.' };
      set({ cash: current.cash - cost, positions: { ...current.positions, [sym]: current.positions[sym] + qty } });
    } else {
      const held = current.positions[sym];
      if (qty > held + 1e-9) return { ok: false, error: `Insufficient ${sym} balance for this order.` };
      set({ cash: current.cash + notional - fee, positions: { ...current.positions, [sym]: held - qty } });
    }

    const order: Order = { id: `ord_${Math.random().toString(36).slice(2, 9)}`, ts: Date.now(), side, sym, amount: qty, price: fillPrice, fee, notional, auto };
    set((state) => ({ orderHistory: [order, ...state.orderHistory].slice(0, 60) }));
    return { ok: true, order };
  },

  toggleAutoTrade: (asset) => set((state) => ({ autoTrade: { ...state.autoTrade, [asset]: !state.autoTrade[asset] } })),

  tick: () => {
    const current = get();
    const prices = { ...current.prices };
    ASSETS.forEach((asset) => {
      const next = gbmStep(prices[asset].current, META[asset].mu, META[asset].sigma);
      prices[asset] = { current: next, history: [...prices[asset].history, next].slice(-MAX_HISTORY) };
    });

    const draft: PortfolioState = { cash: current.cash, positions: current.positions, prices, startValue: current.startValue, orderHistory: current.orderHistory, autoTrade: current.autoTrade, notifications: current.notifications };
    let breakerActive = current.breakerActive;
    const worstVol = Math.max(...ASSETS.map((asset) => indicatorsFor(asset, draft).vol));
    breakerActive = worstVol > VOL_BREAKER_THRESHOLD;

    set({ prices, breakerActive });

    ASSETS.forEach((asset) => {
      const latest = get();
      if (!latest.autoTrade[asset] || latest.breakerActive) return;
      const now = Date.now();
      if (latest.lastAutoTradeAt[asset] && now - latest.lastAutoTradeAt[asset]! < AUTOTRADE_COOLDOWN_MS) return;
      const ind = indicatorsFor(asset, { ...draft, prices: get().prices });
      const value = portfolioValue(get());
      const maxNotional = value * 0.004;
      const amount = Number((maxNotional / get().prices[asset].current).toFixed(6));
      if (ind.score >= 1 && ind.rsi < 72) {
        const result = get().executeOrder({ side: 'buy', sym: asset, amount, auto: true });
        if (result.ok) set((state) => ({ lastAutoTradeAt: { ...state.lastAutoTradeAt, [asset]: now }, notifications: [{ title: 'AI auto-trade executed', body: `Bought ${amount} ${asset}`, ts: now }, ...state.notifications].slice(0, 20) }));
      } else if (ind.score <= -1 && ind.rsi > 28 && (get().positions[asset] ?? 0) > amount) {
        const result = get().executeOrder({ side: 'sell', sym: asset, amount, auto: true });
        if (result.ok) set((state) => ({ lastAutoTradeAt: { ...state.lastAutoTradeAt, [asset]: now }, notifications: [{ title: 'AI auto-trade executed', body: `Sold ${amount} ${asset}`, ts: now }, ...state.notifications].slice(0, 20) }));
      }
    });
  },

  resetSimulation: () => set({ ...initialPortfolio(), selectedAsset: 'BTC', breakerActive: false, lastAutoTradeAt: {} }),
})), {
  name: 'lumen-portfolio-v2',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (state) => ({ cash: state.cash, positions: state.positions, startValue: state.startValue, orderHistory: state.orderHistory, autoTrade: state.autoTrade, notifications: state.notifications, prices: state.prices }),
}));

export const selectRisk = (state: AppState) => computeRisk(state);
export const selectPortfolioValue = (state: AppState) => portfolioValue(state);
export { TICK_MS };
