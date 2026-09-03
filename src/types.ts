export const ASSETS = ['BTC', 'ETH', 'SOL', 'ADA', 'XRP', 'AVAX', 'LINK', 'DOGE'] as const;
export type Asset = typeof ASSETS[number];

export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type Timeframe = '1H' | '1D' | '1W' | '1M' | '1Y';

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Market = {
  asset: Asset;
  name: string;
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  history: number[];
  candles: Candle[];
  source: 'Binance' | 'Coinbase' | 'Heuristic Feed';
};

export type Order = {
  id: string;
  ts: number;
  side: Side;
  type: OrderType;
  asset: Asset;
  amount: number;
  price: number;
  fee: number;
  notional: number;
  auto: boolean;
  strategyName?: string;
  status: 'filled' | 'open' | 'cancelled';
  takeProfit?: number;
  stopLoss?: number;
};

export type AlertRule = {
  id: string;
  asset: Asset;
  type: 'above' | 'below' | 'changeUp' | 'changeDown';
  value: number;
  enabled: boolean;
  triggered: boolean;
  lastTriggeredAt?: number;
  createdAt: number;
};

export type StrategyKind = 'momentum' | 'mean_reversion' | 'dca';

export type StrategyConfig = {
  id: string;
  asset: Asset;
  kind: StrategyKind;
  name: string;
  enabled: boolean;
  maxAllocation: number; // 0.05 = 5%
  cooldownSec: number;
  lastExecutedAt?: number;
  tradesExecuted: number;
  totalPnl: number;
  params: {
    rsiThresholdBuy?: number;
    rsiThresholdSell?: number;
    dcaAmountUsd?: number;
    bollingerBandStdDev?: number;
  };
};

export type Settings = {
  geminiApiKey: string;
  geminiModel: string;
  soundEnabled: boolean;
  theme: 'light' | 'glass';
};

export type NotificationItem = {
  id: string;
  ts: number;
  title: string;
  body: string;
  type: 'order' | 'alert' | 'strategy' | 'system';
  read?: boolean;
};

export type AppState = {
  cash: number;
  initialCash: number;
  positions: Record<Asset, number>;
  avgBuyPrice: Record<Asset, number>;
  watchlist: Asset[];
  orders: Order[];
  alerts: AlertRule[];
  strategies: StrategyConfig[];
  settings: Settings;
  notifications: NotificationItem[];
  timeframe: Timeframe;
  selectedAsset: Asset;
};
