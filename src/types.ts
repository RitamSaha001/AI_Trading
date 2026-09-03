export const ASSETS = ['BTC', 'ETH', 'SOL', 'ADA', 'XRP', 'AVAX', 'LINK', 'DOGE'] as const;
export type Asset = typeof ASSETS[number];

export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop_loss' | 'take_profit';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'rejected';
export type Timeframe = '1H' | '1D' | '1W' | '1M' | '1Y';

export type DataSource =
  | 'Binance WebSocket (Live)'
  | 'Binance REST'
  | 'Coinbase REST'
  | 'Simulated Heuristic';

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
  source: DataSource;
  isSynthetic: boolean;
  lastUpdated: number;
};

export type Order = {
  id: string;
  ts: number;
  side: Side;
  type: OrderType;
  asset: Asset;
  amount: number;
  price: number; // For market orders: executed price. For limit: target limit price
  limitPrice?: number;
  stopPrice?: number;
  fee: number;
  notional: number;
  slippageImpact?: number;
  auto: boolean;
  strategyName?: string;
  status: OrderStatus;
  rejectReason?: string;
  filledAt?: number;
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
  isRecurring: boolean;
  cooldownSec: number;
  lastTriggeredAt?: number;
  createdAt: number;
  triggerHistory?: { ts: number; price: number; message: string }[];
};

export type StrategyKind = 'momentum' | 'mean_reversion' | 'dca';

export type StrategyConfig = {
  id: string;
  asset: Asset;
  kind: StrategyKind;
  name: string;
  enabled: boolean;
  maxAllocation: number; // e.g. 0.25 = 25% max portfolio allocation
  cooldownSec: number;
  lastExecutedAt?: number;
  tradesExecuted: number;
  totalPnl: number; // Historical cumulative attributed P&L
  realizedPnl: number;
  feesPaid: number;
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
  maxSlippageBps: number; // default 50 bps (0.5%)
  enableWebSocket: boolean;
  guardianMode?: boolean; // Autonomous danger sentinel & capital preservation shield
  dangerThreshold?: 'moderate' | 'high' | 'critical';
  autoRebalanceDefend?: boolean;
};

export type NotificationItem = {
  id: string;
  ts: number;
  title: string;
  body: string;
  type: 'order' | 'alert' | 'strategy' | 'system' | 'risk';
  read?: boolean;
};

export type RebalanceStep = {
  asset: Asset;
  action: 'buy' | 'sell';
  amount: number;
  estimatedPrice: number;
  estimatedNotional: number;
};

export type AIActionProposal = {
  type: 'order' | 'alert' | 'rebalance' | 'emergency_defend';
  asset: Asset;
  side?: Side;
  amount?: number;
  orderType?: OrderType;
  limitPrice?: number;
  alertType?: 'above' | 'below' | 'changeUp' | 'changeDown';
  value?: number;
  rationale: string;
  confidence: 'low' | 'medium' | 'high';
  riskSummary: string;
  requiresConfirmation: boolean;
  // Agentic & Danger Sensing extensions
  dangerLevel?: 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
  hazardSource?: string;
  formulaLatex?: string;
  rebalanceTargets?: Partial<Record<Asset, number>>;
  cashTargetPct?: number;
  rebalanceSteps?: RebalanceStep[];
};

export type AISafetyValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  preview?: {
    side: Side;
    asset: Asset;
    amount: number;
    estPrice: number;
    slippage: number;
    estFee: number;
    notional: number;
    currentCash: number;
    resultingCash: number;
    currentPosition: number;
    resultingPosition: number;
    allocationPct: number;
    maxAllowedAllocationPct: number;
  };
};

export type AppState = {
  schemaVersion: number;
  cash: number;
  initialCash: number;
  startingEquity: number;
  realizedPnl: number;
  totalFees: number;
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
