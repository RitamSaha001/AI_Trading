export const ASSETS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'SUI', 'SHIB',
  'TON', 'LINK', 'NEAR', 'DOT', 'BCH', 'PEPE', 'UNI', 'APT', 'LTC', 'ICP',
  'FET', 'KAS', 'POL', 'XLM', 'XMR', 'TIA', 'RENDER', 'STX', 'TAO', 'AAVE',
  'ARB', 'OP', 'INJ', 'FIL', 'OKB', 'IMX', 'VET', 'MNT', 'CRO', 'FTM',
  'WIF', 'FLOKI', 'BONK', 'GRT', 'THETA', 'SEI', 'JUP', 'RUNE', 'PYTH', 'HBAR',
  'OM', 'LDO', 'ALGO', 'MKR', 'BSV', 'JASMY', 'ENA', 'AR', 'CORE', 'BTT',
  'NOT', 'ONDO', 'WLD', 'PENDLE', 'BEAM', 'DYDX', 'STRK', 'GALA', 'BLUR', 'CRV',
  'CHZ', 'SNX', 'AXS', 'SAND', 'MANA', 'ENJ', 'FLOW', 'QNT', 'NEO', 'EOS',
  'IOTA', 'KAVA', 'MINA', 'ROSE', 'ZIL', 'KLAY', 'CFX', 'RON', 'APE', '1INCH',
  'COMP', 'OSMO', 'GMX', 'RAY', 'JTO', 'ORDI', 'SATS', 'W', 'TNSR', 'EIGEN',
  'NEIRO', 'TURBO', 'POPCAT', 'MEME', 'ME', 'ZK', 'MORPHO', 'COW'
] as const;
export type Asset = typeof ASSETS[number];

export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop_loss' | 'take_profit';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'rejected';
export type Timeframe = '1H' | '1D' | '1W' | '1M' | '1Y';

export type DataSource =
  | 'Binance WebSocket (Live)'
  | 'Binance REST'
  | 'Coinbase REST'
  | 'Simulated Heuristic'
  | 'Synthetic Heuristic Simulation';

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketCategory = 'All' | 'Layer 1' | 'DeFi' | 'AI & Compute' | 'Meme' | 'Infra' | 'Gaming';

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
  category?: MarketCategory;
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
  bracketId?: string;
  positionLotId?: string;
  parentOrderId?: string;
  tradeGroupId?: string;
  reservedCash?: number;
  reservedAmount?: number;
  partialHarvested?: boolean;
  zeroLossLocked?: boolean;
  accountMode?: 'paper' | 'exchange' | 'web3';
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

export type StrategyKind =
  | 'titan_quantum'
  | 'titan_adaptive'
  | 'vwap_trend'
  | 'breakout_volatility'
  | 'ai_multi_factor'
  | 'grid_scalp'
  | 'momentum'
  | 'mean_reversion'
  | 'dca';

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
  winCount?: number;
  lossCount?: number;
  consecutiveLosses?: number;
  maxConsecutiveLossesAllowed?: number; // default 2
  circuitBreakerTriggered?: boolean;
  circuitBreakerReason?: string;
  quarantineActive?: boolean;
  quarantineShadowWins?: number;
  zeroLossMode?: boolean;
  scaleOutEnabled?: boolean;
  pausedReason?: string;
  targetProfitPct?: number; // Target Take Profit % (e.g. 5.0)
  trailingStopPct?: number; // Trailing Stop % (e.g. 2.0)
  params: {
    rsiThresholdBuy?: number;
    rsiThresholdSell?: number;
    dcaAmountUsd?: number;
    bollingerBandStdDev?: number;
    vwapBandMultiplier?: number;
    breakoutThresholdPct?: number;
    minAlphaScore?: number;
    gridLevels?: number;
    gridSpacingPct?: number;
    atrMultiplierTP?: number;
    atrMultiplierSL?: number;
    dynamicRiskSizing?: boolean;
    oversoldMultiplier?: number;
    pauseThresholdRsi?: number;
    regimeFilterEnabled?: boolean;
    lossCutoffUsd?: number;
    maxChoppinessThreshold?: number;
    minAdxThreshold?: number;
    scaleOutTp1AtrMult?: number;
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

export type ExecutionReceipt = {
  receiptId: string;
  actionType: 'order' | 'alert' | 'rebalance' | 'emergency_defend' | 'deploy_strategy' | 'stress_test' | 'smart_dca' | 'token_compare';
  title: string;
  summary: string;
  stateDiff?: string;
  executedAt: number;
  details: string[];
  badges?: { label: string; color: 'emerald' | 'indigo' | 'amber' | 'rose' | 'zinc' }[];
  jumpRoute?: string;
  jumpLabel?: string;
  metricsDiff?: {
    cashDelta?: number;
    portfolioDelta?: number;
    allocationDelta?: string;
  };
};

export type StressTestScenario = {
  scenarioId: 'btc_flash_crash_20' | 'macro_rate_shock' | 'high_beta_liquidation' | 'crypto_winter_cascade';
  title: string;
  description: string;
  simulatedDrawdownPct: number;
  simulatedLossUsd: number;
  postShockPortfolioVal: number;
  var95Pct: number;
  survivabilityScore: number; // 0 - 100
  survivabilityRating: 'Robust' | 'Moderate' | 'Vulnerable' | 'Critical';
  assetImpacts: {
    asset: Asset;
    priceShockPct: number;
    simulatedLossUsd: number;
  }[];
  mitigationSteps: string[];
};

export type SmartDCAPlan = {
  asset: Asset;
  frequency: 'Daily' | 'Weekly' | 'Hourly';
  baseAmountUsd: number;
  oversoldMultiplier: number;
  pauseThresholdRsi: number;
  targetProfitPct: number;
  trailingStopPct?: number;
};

export type TokenComparisonMetric = {
  asset: Asset;
  name: string;
  price: number;
  change24h: number;
  rsi: number;
  volAnnualizedPct: number;
  sharpeEstimate: number;
  momentumScore: number;
  betaToBtc: number;
  regime: string;
};

export type TokenComparison = {
  tokens: TokenComparisonMetric[];
  verdict: string;
  topAlphaAsset: Asset;
};

export type AIActionProposal = {
  type: 'order' | 'alert' | 'rebalance' | 'emergency_defend' | 'deploy_strategy' | 'stress_test' | 'smart_dca' | 'token_compare';
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
  accountMode?: AccountMode;
  // Agentic & Danger Sensing extensions
  dangerLevel?: 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
  hazardSource?: string;
  formulaLatex?: string;
  rebalanceTargets?: Partial<Record<Asset, number>>;
  cashTargetPct?: number;
  rebalanceSteps?: RebalanceStep[];
  allowOverride?: boolean;
  executionPlan?: {
    estimatedPostSellCash: number;
    estimatedTotalFees: number;
    residualCash: number;
    isCashFeasible: boolean;
  };
  // New Agentic extensions
  strategyParams?: {
    kind: StrategyKind;
    name: string;
    maxAllocation: number;
    cooldownSec: number;
    targetProfitPct?: number;
    trailingStopPct?: number;
    params?: Record<string, any>;
  };
  stressTest?: StressTestScenario;
  dcaPlan?: SmartDCAPlan;
  tokenComparison?: TokenComparison;
  executionReceipt?: ExecutionReceipt;
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

export type AccountMode = 'paper' | 'exchange' | 'web3';

export type ExchangeBalance = {
  asset: string;
  free: number;
  locked: number;
};

export type ExchangeAccountInfo = {
  connected: boolean;
  environment: 'testnet' | 'mainnet';
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  permissions: string[];
  isSafe: boolean;
  securityBadge: string;
  securityWarning?: string;
  balances: Record<string, ExchangeBalance>;
  lastSyncAt: number;
  latencyMs?: number;
  listenKey?: string;
};

export type Web3Network = 'polygon' | 'arbitrum' | 'amoy';

export type Web3AccountInfo = {
  connected: boolean;
  address: string;
  network: Web3Network;
  nativeBalance: number;
  nativeSymbol: string;
  balances: Record<string, number>; // Token balances (e.g. USDT, USDC, POL, ETH)
  totalValueUsd: number;
  lastSyncAt: number;
  isUnlocked: boolean;
};

export type WalletCurrency = 'USD' | 'INR' | 'EUR' | 'GBP';
export type PaymentMethodType = 'card' | 'upi' | 'bank_transfer';

export type SavedPaymentMethod = {
  id: string;
  type: PaymentMethodType;
  label: string;
  last4?: string;
  brand?: 'visa' | 'mastercard' | 'rupay' | 'amex' | 'discover' | 'unknown';
  vpa?: string;
  bankName?: string;
  createdAt: number;
  isDefault: boolean;
};

export type WalletTransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'allocate_to_trading'
  | 'recall_from_trading'
  | 'swap_crypto';

export type WalletTransactionStatus = 'completed' | 'processing' | 'failed' | 'cancelled';

export type WalletTransaction = {
  id: string;
  timestamp: number;
  type: WalletTransactionType;
  amount: number;
  currency: WalletCurrency;
  amountUSD: number;
  status: WalletTransactionStatus;
  method: PaymentMethodType | 'internal_transfer';
  description: string;
  txHash: string;
  paymentDetails?: {
    cardBrand?: string;
    cardLast4?: string;
    upiVpa?: string;
    referenceNumber?: string;
  };
  failureReason?: string;
};

export type NativeWalletSecurity = {
  pinConfigured: boolean;
  pinHash?: string;
  requirePinForWithdrawal: boolean;
  requirePinForAllocation: boolean;
  dailyDepositLimitUSD: number;
  dailyWithdrawLimitUSD: number;
};

export type NativeWalletState = {
  walletId: string;
  currency: WalletCurrency;
  balanceUSD: number;
  allocatedToTradingUSD: number;
  totalDepositedUSD: number;
  totalWithdrawnUSD: number;
  savedPaymentMethods: SavedPaymentMethod[];
  transactions: WalletTransaction[];
  security: NativeWalletSecurity;
  createdAt: number;
  lastActiveAt: number;
};

export type AppState = {
  schemaVersion: number;
  accountMode?: AccountMode;
  authSession?: AuthSession;
  grievanceTickets?: GrievanceTicket[];
  ledgerHistory?: UnifiedLedgerEntry[];
  exchangeAccount?: ExchangeAccountInfo;
  exchangeOrders?: Order[];
  web3Account?: Web3AccountInfo;
  web3Orders?: Order[];
  web3Positions?: Record<Asset, number>;
  wallet?: NativeWalletState;
  cash: number;
  reservedCash?: number;
  reservedPositions?: Partial<Record<Asset, number>>;
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
  pausedMarkets?: Asset[];
  lossPreventionMode?: 'strict' | 'balanced' | 'aggressive';
  settings: Settings;
  notifications: NotificationItem[];
  timeframe: Timeframe;
  selectedAsset: Asset;
};

// ---------------------------------------------------------------------------
// AUTHENTICATION & USER PROFILE TYPES
// ---------------------------------------------------------------------------

export type AuthProvider = 'google' | 'apple' | 'email';
export type KYCTier = 'tier0_unverified' | 'tier1_basic' | 'tier2_verified';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  provider: AuthProvider;
  providerId: string;
  verified: boolean;
  createdAt: number;
  lastLoginAt: number;
  twoFactorEnabled: boolean;
  kycTier: KYCTier;
  panNumberMasked?: string;   // e.g. "ABCDE****F" for Indian financial compliance
  phoneMasked?: string;       // e.g. "+91 98765*****"
  country: string;
  currencyPreference: 'USD' | 'INR';
  isEmergencyLocked?: boolean;
}

export interface AuthSession {
  user: UserProfile | null;
  token?: string;
  expiresAt: number;
  isAuthenticated: boolean;
}

// ---------------------------------------------------------------------------
// GRIEVANCE REDRESSAL & FINANCIAL DISPUTE TYPES
// ---------------------------------------------------------------------------

export type GrievanceCategory =
  | 'upi_deposit_pending'
  | 'dex_swap_revert'
  | 'binance_execution_error'
  | 'card_double_charge'
  | 'unauthorized_activity'
  | 'general_inquiry';

export type GrievanceStatus =
  | 'submitted'
  | 'under_investigation'
  | 'reconciliation_in_progress'
  | 'resolved'
  | 'refund_credited'
  | 'closed';

export type GrievancePriority = 'low' | 'medium' | 'high' | 'urgent';

export interface GrievanceMessage {
  id: string;
  sender: 'user' | 'support_officer' | 'system';
  senderName: string;
  timestamp: number;
  text: string;
  attachments?: string[];
}

export interface GrievanceTicket {
  ticketId: string;           // e.g. "GRV-2026-98124"
  userUid: string;
  category: GrievanceCategory;
  title: string;
  description: string;
  status: GrievanceStatus;
  priority: GrievancePriority;
  createdAt: number;
  updatedAt: number;
  slaDeadline: number;        // Epoch ms by which resolution is guaranteed
  relatedTxId?: string;       // Associated transaction ID
  relatedUtr?: string;        // 12-digit Indian UTR
  relatedTxHash?: string;     // EVM tx hash
  amountUSD?: number;
  amountINR?: number;
  cryptographicDossierHash: string; // SHA-256 tamper-evident evidence checksum
  officerAssigned?: string;
  escalationLevel: 1 | 2 | 3; // 1: Automated Reconciliation, 2: Nodal Officer, 3: Banking Ombudsman
  resolutionNotes?: string;
  messages: GrievanceMessage[];
}

// ---------------------------------------------------------------------------
// UNIFIED LEDGER TRANSACTION TYPE
// ---------------------------------------------------------------------------

export interface UnifiedLedgerEntry {
  id: string;
  timestamp: number;
  userUid: string;
  desk: 'fiat_wallet' | 'web3_dex' | 'binance_exchange';
  channel: 'upi' | 'card' | 'polygon' | 'arbitrum' | 'binance_spot' | 'internal';
  direction: 'inflow' | 'outflow' | 'swap' | 'transfer';
  asset: string;
  amount: number;
  amountUSD: number;
  amountINR: number;
  feeUSD: number;
  status: 'completed' | 'pending' | 'failed' | 'disputed' | 'refunded';
  reference: string;          // Bank UTR, UPI RRN, or TxHash
  description: string;
  blockExplorerUrl?: string;
  sha256Proof: string;        // Hash chain verification
  grievanceTicketId?: string; // If disputed
}

