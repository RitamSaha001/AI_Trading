import { AppState, ASSETS, Asset, StrategyConfig } from './types';
import { META } from './domain/portfolio';

export const SCHEMA_VERSION = 5;
const STORAGE_KEY = 'lumen_cockpit_state_v5';
const LEGACY_STORAGE_KEY = 'lumen_cockpit_state_v4';

export type SimulationMode = 'clean' | 'seeded';

/**
 * Creates a pristine, mathematically verified initial state.
 * @param mode 'clean' starts with 100% liquid paper cash and zero holdings; 'seeded' starts with starter holdings where starting equity matches initial portfolio valuation.
 */
export function freshState(customCash = 50000, mode: SimulationMode = 'clean'): AppState {
  const initialPositions: Record<Asset, number> = Object.fromEntries(
    ASSETS.map((a) => [a, 0])
  ) as Record<Asset, number>;

  const initialAvgBuy: Record<Asset, number> = {} as Record<Asset, number>;

  let startingEquity = customCash;

  if (mode === 'seeded') {
    initialPositions.BTC = 0.25;
    initialPositions.ETH = 2.0;
    initialPositions.SOL = 15.0;

    initialAvgBuy.BTC = META.BTC.basePrice;
    initialAvgBuy.ETH = META.ETH.basePrice;
    initialAvgBuy.SOL = META.SOL.basePrice;

    const seedCryptoValue =
      0.25 * META.BTC.basePrice + 2.0 * META.ETH.basePrice + 15.0 * META.SOL.basePrice;
    startingEquity = customCash + seedCryptoValue;
  }

  const initialStrategies: StrategyConfig[] = [
    {
      id: 'strat_btc_mom',
      asset: 'BTC',
      kind: 'momentum',
      name: 'Bitcoin Momentum Surfer (SMA Cross + RSI)',
      enabled: true,
      maxAllocation: 0.3,
      cooldownSec: 30,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      params: { rsiThresholdBuy: 65, rsiThresholdSell: 35 },
    },
    {
      id: 'strat_eth_mr',
      asset: 'ETH',
      kind: 'mean_reversion',
      name: 'Ethereum Bollinger Mean-Reversion',
      enabled: false,
      maxAllocation: 0.2,
      cooldownSec: 45,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      params: { bollingerBandStdDev: 2, rsiThresholdBuy: 32 },
    },
    {
      id: 'strat_sol_mom',
      asset: 'SOL',
      kind: 'momentum',
      name: 'Solana High-Beta Momentum Breakout',
      enabled: false,
      maxAllocation: 0.2,
      cooldownSec: 30,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      params: { rsiThresholdBuy: 68, rsiThresholdSell: 38 },
    },
    {
      id: 'strat_link_dca',
      asset: 'LINK',
      kind: 'dca',
      name: 'Chainlink Dollar-Cost Average (DCA)',
      enabled: false,
      maxAllocation: 0.15,
      cooldownSec: 60,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      params: { dcaAmountUsd: 100 },
    },
  ];

  return {
    schemaVersion: SCHEMA_VERSION,
    cash: customCash,
    initialCash: customCash,
    startingEquity,
    realizedPnl: 0,
    totalFees: 0,
    positions: initialPositions,
    avgBuyPrice: initialAvgBuy,
    watchlist: ['BTC', 'ETH', 'SOL', 'AVAX'],
    orders: [],
    alerts: [
      {
        id: 'alt_1',
        asset: 'BTC',
        type: 'above',
        value: 72000,
        enabled: true,
        triggered: false,
        isRecurring: false,
        cooldownSec: 300,
        createdAt: Date.now(),
        triggerHistory: [],
      },
      {
        id: 'alt_2',
        asset: 'ETH',
        type: 'below',
        value: 3200,
        enabled: true,
        triggered: false,
        isRecurring: false,
        cooldownSec: 300,
        createdAt: Date.now(),
        triggerHistory: [],
      },
    ],
    strategies: initialStrategies,
    settings: {
      geminiApiKey: '',
      geminiModel: 'gemini-1.5-flash',
      soundEnabled: true,
      theme: 'glass',
      maxSlippageBps: 50,
      enableWebSocket: true,
    },
    notifications: [
      {
        id: 'notif_welcome',
        ts: Date.now(),
        title: 'Simulation Ready',
        body: `Paper trading initialized with $${customCash.toLocaleString()} cash. Real-time market feeds and algorithmic safeguards active.`,
        type: 'system',
      },
    ],
    timeframe: '1D',
    selectedAsset: 'BTC',
  };
}

/**
 * Robust schema migration utility ensuring user configuration (such as API keys)
 * is preserved while upgrading internal accounting and state schemas.
 */
export function migrateState(rawState: any): AppState {
  if (!rawState || typeof rawState !== 'object') {
    return freshState();
  }

  const base = freshState();

  const migrated: AppState = {
    ...base,
    schemaVersion: SCHEMA_VERSION,
    cash: typeof rawState.cash === 'number' && Number.isFinite(rawState.cash) ? rawState.cash : base.cash,
    initialCash: typeof rawState.initialCash === 'number' ? rawState.initialCash : base.initialCash,
    startingEquity: typeof rawState.startingEquity === 'number' && rawState.startingEquity > 0
      ? rawState.startingEquity
      : (typeof rawState.cash === 'number' ? rawState.cash : base.startingEquity),
    realizedPnl: typeof rawState.realizedPnl === 'number' ? rawState.realizedPnl : 0,
    totalFees: typeof rawState.totalFees === 'number' ? rawState.totalFees : 0,
    positions: { ...base.positions, ...(rawState.positions || {}) },
    avgBuyPrice: { ...(rawState.avgBuyPrice || {}) },
    watchlist: Array.isArray(rawState.watchlist) && rawState.watchlist.length > 0 ? rawState.watchlist : base.watchlist,
    orders: Array.isArray(rawState.orders) ? rawState.orders.slice(0, 300) : [],
    alerts: Array.isArray(rawState.alerts)
      ? rawState.alerts.map((a: any) => ({
          ...a,
          isRecurring: a.isRecurring ?? false,
          cooldownSec: a.cooldownSec ?? 300,
          triggerHistory: Array.isArray(a.triggerHistory) ? a.triggerHistory : [],
        }))
      : base.alerts,
    strategies: Array.isArray(rawState.strategies) && rawState.strategies.length > 0
      ? rawState.strategies.map((s: any) => ({
          ...s,
          realizedPnl: typeof s.realizedPnl === 'number' ? s.realizedPnl : 0,
          feesPaid: typeof s.feesPaid === 'number' ? s.feesPaid : 0,
        }))
      : base.strategies,
    settings: {
      ...base.settings,
      ...(rawState.settings || {}),
      geminiApiKey: rawState.settings?.geminiApiKey ?? '',
      geminiModel: rawState.settings?.geminiModel ?? 'gemini-1.5-flash',
    },
    notifications: Array.isArray(rawState.notifications) ? rawState.notifications.slice(0, 100) : base.notifications,
    timeframe: rawState.timeframe ?? '1D',
    selectedAsset: ASSETS.includes(rawState.selectedAsset) ? rawState.selectedAsset : 'BTC',
  };

  return migrated;
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return migrateState(parsed);
    }
  } catch (e) {
    console.warn('Failed to parse stored simulation state. Resetting to clean slate:', e);
  }
  return freshState();
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to persist simulation state to localStorage:', e);
  }
}

export function resetState(startingBalance = 50000, mode: SimulationMode = 'clean'): AppState {
  const s = freshState(startingBalance, mode);
  saveState(s);
  return s;
}

export function exportStateJson(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function importStateJson(jsonString: string): AppState {
  const parsed = JSON.parse(jsonString);
  const migrated = migrateState(parsed);
  saveState(migrated);
  return migrated;
}
