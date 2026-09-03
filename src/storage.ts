import { AppState, ASSETS, StrategyConfig } from './types';

const KEY = 'lumen_cockpit_state_v4';

export function freshState(customCash = 50000): AppState {
  const initialPositions = {
    BTC: 0.85,
    ETH: 6.2,
    SOL: 45.0,
    ADA: 2400.0,
    XRP: 1800.0,
    AVAX: 35.0,
    LINK: 60.0,
    DOGE: 5000.0,
  };

  const initialAvgBuy = {
    BTC: 64200,
    ETH: 3380,
    SOL: 142.5,
    ADA: 0.45,
    XRP: 0.54,
    AVAX: 26.5,
    LINK: 13.9,
    DOGE: 0.115,
  };

  const initialStrategies: StrategyConfig[] = [
    {
      id: 'strat_btc_mom',
      asset: 'BTC',
      kind: 'momentum',
      name: 'Bitcoin Trend Surfer (SMA Crossover + RSI)',
      enabled: true,
      maxAllocation: 0.25,
      cooldownSec: 20,
      tradesExecuted: 14,
      totalPnl: 1420.5,
      params: { rsiThresholdBuy: 65, rsiThresholdSell: 35 },
    },
    {
      id: 'strat_eth_mr',
      asset: 'ETH',
      kind: 'mean_reversion',
      name: 'Ethereum Bollinger Mean-Reversion',
      enabled: false,
      maxAllocation: 0.18,
      cooldownSec: 30,
      tradesExecuted: 8,
      totalPnl: 640.2,
      params: { bollingerBandStdDev: 2, rsiThresholdBuy: 32 },
    },
    {
      id: 'strat_sol_mom',
      asset: 'SOL',
      kind: 'momentum',
      name: 'Solana High-Beta Momentum Breakout',
      enabled: true,
      maxAllocation: 0.15,
      cooldownSec: 15,
      tradesExecuted: 22,
      totalPnl: 890.8,
      params: { rsiThresholdBuy: 68, rsiThresholdSell: 38 },
    },
    {
      id: 'strat_link_dca',
      asset: 'LINK',
      kind: 'dca',
      name: 'Chainlink Algorithmic Dollar-Cost Average',
      enabled: false,
      maxAllocation: 0.1,
      cooldownSec: 60,
      tradesExecuted: 5,
      totalPnl: 110.0,
      params: { dcaAmountUsd: 150 },
    },
  ];

  return {
    cash: customCash,
    initialCash: customCash,
    positions: initialPositions,
    avgBuyPrice: initialAvgBuy,
    watchlist: ['BTC', 'ETH', 'SOL', 'AVAX'],
    orders: [
      {
        id: 'ord_init_1',
        ts: Date.now() - 3600000 * 5,
        side: 'buy',
        type: 'market',
        asset: 'BTC',
        amount: 0.25,
        price: 66400,
        fee: 13.28,
        notional: 16600,
        auto: false,
        status: 'filled',
      },
      {
        id: 'ord_init_2',
        ts: Date.now() - 3600000 * 2,
        side: 'buy',
        type: 'market',
        asset: 'SOL',
        amount: 15,
        price: 148.5,
        fee: 1.78,
        notional: 2227.5,
        auto: true,
        strategyName: 'Solana High-Beta Momentum Breakout',
        status: 'filled',
      },
    ],
    alerts: [
      {
        id: 'alt_1',
        asset: 'BTC',
        type: 'above',
        value: 71000,
        enabled: true,
        triggered: false,
        createdAt: Date.now() - 86400000,
      },
      {
        id: 'alt_2',
        asset: 'ETH',
        type: 'below',
        value: 3300,
        enabled: true,
        triggered: false,
        createdAt: Date.now() - 43200000,
      },
      {
        id: 'alt_3',
        asset: 'SOL',
        type: 'changeUp',
        value: 5,
        enabled: true,
        triggered: false,
        createdAt: Date.now() - 20000000,
      },
    ],
    strategies: initialStrategies,
    settings: {
      geminiApiKey: '',
      geminiModel: 'gemini-3.8-flash',
      soundEnabled: true,
      theme: 'glass',
    },
    notifications: [
      {
        id: 'notif_welcome',
        ts: Date.now() - 1000,
        title: 'Lumen Cockpit Activated',
        body: 'Welcome to your paper trading cockpit. Live feeds, algorithmic strategies, and AI Copilot are initialized.',
        type: 'system',
      },
    ],
    timeframe: '1D',
    selectedAsset: 'BTC',
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...freshState(), ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load local state:', e);
  }
  return freshState();
}

export function saveState(s: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    console.warn('Failed to persist state:', e);
  }
}

export function resetState(startingBalance = 50000): AppState {
  const s = freshState(startingBalance);
  saveState(s);
  return s;
}
