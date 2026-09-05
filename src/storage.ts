import { AppState, ASSETS, Asset, StrategyConfig } from './types';
import { META } from './domain/portfolio';
import { createDefaultWallet } from './domain/wallet';
import { createDefaultAutonomousPilotState } from './domain/autonomousPilot';

export const SCHEMA_VERSION = 7;
const STORAGE_KEY = 'lumen_cockpit_state_v7';
const LEGACY_STORAGE_KEY = 'lumen_cockpit_state_v6';

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
      id: 'strat_titan_quantum_btc',
      asset: 'BTC',
      kind: 'titan_quantum',
      name: 'Titan Quantum Apex Sentinel (Zero-Loss Armor)',
      enabled: true,
      maxAllocation: 0.30,
      cooldownSec: 180,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      consecutiveLosses: 0,
      maxConsecutiveLossesAllowed: 2,
      zeroLossMode: true,
      scaleOutEnabled: true,
      targetProfitPct: 6.5,
      trailingStopPct: 2.0,
      params: {
        atrMultiplierTP: 3.8,
        atrMultiplierSL: 1.15,
        scaleOutTp1AtrMult: 2.2,
        minAlphaScore: 35,
        maxChoppinessThreshold: 60.0,
        minAdxThreshold: 18,
        regimeFilterEnabled: true,
      },
    },
    {
      id: 'strat_titan_btc',
      asset: 'BTC',
      kind: 'titan_adaptive',
      name: 'Titan Adaptive Multi-Regime Sentinel (BTC)',
      enabled: true,
      maxAllocation: 0.25,
      cooldownSec: 180,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      consecutiveLosses: 0,
      maxConsecutiveLossesAllowed: 2,
      targetProfitPct: 5.5,
      trailingStopPct: 2.2,
      params: { atrMultiplierTP: 3.5, atrMultiplierSL: 1.35, minAlphaScore: 35, regimeFilterEnabled: true },
    },
    {
      id: 'strat_titan_sol',
      asset: 'SOL',
      kind: 'titan_adaptive',
      name: 'Titan Adaptive Multi-Regime Sentinel (SOL)',
      enabled: true,
      maxAllocation: 0.20,
      cooldownSec: 180,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      consecutiveLosses: 0,
      maxConsecutiveLossesAllowed: 2,
      targetProfitPct: 7.0,
      trailingStopPct: 2.8,
      params: { atrMultiplierTP: 3.5, atrMultiplierSL: 1.4, minAlphaScore: 35, regimeFilterEnabled: true },
    },
    {
      id: 'strat_btc_vwap',
      asset: 'BTC',
      kind: 'vwap_trend',
      name: 'Bitcoin Institutional VWAP Trend Engine',
      enabled: false,
      maxAllocation: 0.25,
      cooldownSec: 120,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      consecutiveLosses: 0,
      maxConsecutiveLossesAllowed: 2,
      targetProfitPct: 5.5,
      trailingStopPct: 2.0,
      params: { atrMultiplierTP: 3.0, atrMultiplierSL: 1.25 },
    },
    {
      id: 'strat_eth_alpha',
      asset: 'ETH',
      kind: 'ai_multi_factor',
      name: 'Ethereum Composite Multi-Factor Alpha Engine',
      enabled: true,
      maxAllocation: 0.25,
      cooldownSec: 30,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      targetProfitPct: 6.2,
      trailingStopPct: 2.2,
      params: { minAlphaScore: 40, atrMultiplierTP: 3.2, atrMultiplierSL: 1.3 },
    },
    {
      id: 'strat_sol_breakout',
      asset: 'SOL',
      kind: 'breakout_volatility',
      name: 'Solana Adaptive Volatility & Squeeze Breakout',
      enabled: true,
      maxAllocation: 0.25,
      cooldownSec: 20,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      targetProfitPct: 8.5,
      trailingStopPct: 2.8,
      params: { atrMultiplierTP: 3.5, atrMultiplierSL: 1.4 },
    },
    {
      id: 'strat_sui_mom',
      asset: 'SUI',
      kind: 'momentum',
      name: 'Sui High-Velocity Trend Surfer',
      enabled: false,
      maxAllocation: 0.15,
      cooldownSec: 25,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      targetProfitPct: 7.0,
      trailingStopPct: 2.5,
      params: { rsiThresholdBuy: 68, rsiThresholdSell: 38 },
    },
    {
      id: 'strat_link_grid',
      asset: 'LINK',
      kind: 'grid_scalp',
      name: 'Chainlink Dynamic ATR Grid Scalper',
      enabled: false,
      maxAllocation: 0.15,
      cooldownSec: 40,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      targetProfitPct: 3.5,
      trailingStopPct: 1.5,
      params: { gridLevels: 5, gridSpacingPct: 1.2 },
    },
    {
      id: 'strat_near_breakout',
      asset: 'NEAR',
      kind: 'breakout_volatility',
      name: 'Near Protocol AI & Compute Squeeze Breakout',
      enabled: false,
      maxAllocation: 0.15,
      cooldownSec: 30,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      targetProfitPct: 9.0,
      trailingStopPct: 3.0,
      params: { atrMultiplierTP: 3.8, atrMultiplierSL: 1.5 },
    },
    {
      id: 'strat_avax_dca',
      asset: 'AVAX',
      kind: 'dca',
      name: 'Avalanche Smart Value-Weighted DCA',
      enabled: false,
      maxAllocation: 0.15,
      cooldownSec: 60,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      params: { dcaAmountUsd: 150 },
    },
    {
      id: 'strat_pepe_scalp',
      asset: 'PEPE',
      kind: 'breakout_volatility',
      name: 'Pepe High-Beta Volatility Scalper',
      enabled: false,
      maxAllocation: 0.1,
      cooldownSec: 15,
      tradesExecuted: 0,
      totalPnl: 0,
      realizedPnl: 0,
      feesPaid: 0,
      targetProfitPct: 12.0,
      trailingStopPct: 4.0,
      params: { atrMultiplierTP: 4.0, atrMultiplierSL: 2.0 },
    },
  ];

  return {
    schemaVersion: SCHEMA_VERSION,
    accountMode: 'paper',
    wallet: createDefaultWallet(),
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
    pausedMarkets: [],
    lossPreventionMode: 'strict',
    autonomousPilot: createDefaultAutonomousPilotState(startingEquity),
    settings: {
      geminiApiKey: '',
      geminiModel: 'gemini-3.8-flash',
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
    accountMode: rawState.accountMode === 'upstox' ? 'upstox' : (rawState.accountMode === 'exchange' ? 'exchange' : (rawState.accountMode === 'web3' ? 'web3' : 'paper')),
    upstoxAccount: rawState.upstoxAccount || undefined,
    exchangeAccount: rawState.exchangeAccount || undefined,
    exchangeOrders: Array.isArray(rawState.exchangeOrders) ? rawState.exchangeOrders : [],
    wallet: rawState.wallet && typeof rawState.wallet === 'object' ? rawState.wallet : base.wallet,
    cash: typeof rawState.cash === 'number' && Number.isFinite(rawState.cash) ? rawState.cash : base.cash,
    initialCash: typeof rawState.initialCash === 'number' ? rawState.initialCash : base.initialCash,
    startingEquity: (() => {
      if (typeof rawState.startingEquity === 'number' && rawState.startingEquity > 0) {
        return rawState.startingEquity;
      }
      const cashPart = typeof rawState.cash === 'number' ? rawState.cash : base.cash;
      const positionsObj = rawState.positions || {};
      const positionsVal = ASSETS.reduce((sum, a) => {
        const units = positionsObj[a] || 0;
        const bp = META[a]?.basePrice || 0;
        return sum + (units > 0 ? units * bp : 0);
      }, 0);
      return cashPart + positionsVal > 0 ? cashPart + positionsVal : base.startingEquity;
    })(),
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
    strategies: (() => {
      if (!Array.isArray(rawState.strategies) || rawState.strategies.length === 0) {
        return base.strategies;
      }
      const existing = rawState.strategies.map((s: any) => ({
        ...s,
        realizedPnl: typeof s.realizedPnl === 'number' ? s.realizedPnl : 0,
        feesPaid: typeof s.feesPaid === 'number' ? s.feesPaid : 0,
        consecutiveLosses: typeof s.consecutiveLosses === 'number' ? s.consecutiveLosses : 0,
        circuitBreakerTriggered: Boolean(s.circuitBreakerTriggered),
        circuitBreakerReason: s.circuitBreakerReason || undefined,
        quarantineActive: Boolean(s.quarantineActive),
        quarantineShadowWins: typeof s.quarantineShadowWins === 'number' ? s.quarantineShadowWins : 0,
        zeroLossMode: s.zeroLossMode !== undefined ? Boolean(s.zeroLossMode) : true,
        scaleOutEnabled: s.scaleOutEnabled !== undefined ? Boolean(s.scaleOutEnabled) : true,
      }));
      const existingIds = new Set(existing.map((x: any) => x.id));
      const additions = base.strategies.filter((b) => !existingIds.has(b.id));
      return [...existing, ...additions];
    })(),
    pausedMarkets: Array.isArray(rawState.pausedMarkets) ? rawState.pausedMarkets : [],
    lossPreventionMode: rawState.lossPreventionMode === 'aggressive' || rawState.lossPreventionMode === 'balanced' ? rawState.lossPreventionMode : 'strict',
    autonomousPilot: rawState.autonomousPilot && typeof rawState.autonomousPilot === 'object'
      ? { ...createDefaultAutonomousPilotState(base.startingEquity), ...rawState.autonomousPilot }
      : createDefaultAutonomousPilotState(base.startingEquity),
    settings: {
      ...base.settings,
      ...(rawState.settings || {}),
      geminiApiKey: rawState.settings?.geminiApiKey ?? '',
      geminiModel:
        rawState.settings?.geminiModel && String(rawState.settings.geminiModel).includes('gemini-3')
          ? rawState.settings.geminiModel
          : 'gemini-3.8-flash',
    },
    notifications: (() => {
      const notifs = Array.isArray(rawState.notifications) ? [...rawState.notifications.slice(0, 100)] : [...base.notifications];
      const rawOrders = Array.isArray(rawState.orders) ? rawState.orders : [];
      if (rawOrders.length > 300) {
        const archivedCount = rawOrders.length - 300;
        const archiveNotif = {
          id: `notif_archive_${Date.now()}`,
          ts: Date.now(),
          title: 'Order History Archived',
          body: `Archived ${archivedCount} older orders for performance.`,
          type: 'system' as const,
        };
        return [archiveNotif, ...notifs].slice(0, 100);
      }
      return notifs;
    })(),
    timeframe: rawState.timeframe ?? '1D',
    selectedAsset: ASSETS.includes(rawState.selectedAsset) ? rawState.selectedAsset : 'BTC',
    authSession: rawState.authSession || undefined,
    grievanceTickets: Array.isArray(rawState.grievanceTickets) ? rawState.grievanceTickets : [],
    ledgerHistory: Array.isArray(rawState.ledgerHistory) ? rawState.ledgerHistory : [],
  };

  return migrated;
}

export function getUserStorageKey(userUid?: string): string {
  if (userUid && userUid.trim()) {
    return `${STORAGE_KEY}_${userUid.trim()}`;
  }
  return STORAGE_KEY;
}

export function loadState(userUid?: string): AppState {
  const key = getUserStorageKey(userUid);
  try {
    const raw = localStorage.getItem(key) || (key === STORAGE_KEY ? localStorage.getItem(LEGACY_STORAGE_KEY) : null);
    if (raw) {
      const parsed = JSON.parse(raw);
      return migrateState(parsed);
    }
  } catch (e) {
    console.warn(`Failed to parse stored state for ${key}. Resetting to clean slate:`, e);
  }
  return freshState();
}

export function saveState(state: AppState, userUid?: string): void {
  const key = getUserStorageKey(userUid || state.authSession?.user?.uid);
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (e: any) {
    if (e?.name === 'QuotaExceededError' || e?.code === 22) {
      try {
        const pruned: AppState = {
          ...state,
          orders: state.orders.slice(0, 100),
          notifications: state.notifications.slice(0, 100),
        };
        localStorage.setItem(key, JSON.stringify(pruned));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('lumen_storage_warning', {
              detail: 'Storage full — older history purged.',
            })
          );
        }
        return;
      } catch (retryErr) {
        console.error('Failed to persist pruned state after quota exceeded:', retryErr);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('lumen_storage_warning', {
              detail: 'Storage quota critically exceeded — unable to persist state.',
            })
          );
        }
      }
    }
    console.warn('Failed to persist simulation state to localStorage:', e);
  }
}

export function initCrossTabSync(
  onExternalUpdate: (newState: AppState) => void,
  activeUserUid?: string
): () => void {
  if (typeof window === 'undefined') return () => {};
  const targetKey = getUserStorageKey(activeUserUid);
  const handler = (e: StorageEvent) => {
    if (e.key === targetKey && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        const migrated = migrateState(parsed);
        onExternalUpdate(migrated);
      } catch (err) {
        console.warn('Failed to parse cross-tab storage update:', err);
      }
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
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
