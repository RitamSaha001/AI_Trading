/**
 * Broker-Neutral Domain Types for Lumen Execution Engine
 * 
 * Provides unified, venue-agnostic representations of broker accounts,
 * instruments, orders, fills, funds, and capabilities across crypto exchanges
 * (e.g. Binance) and traditional stock brokers (e.g. Upstox).
 */

import { ExactDecimal } from '../precision';

export type BrokerId = 'binance' | 'upstox' | (string & {});

export type BrokerEnvironment = 'testnet' | 'mainnet' | 'sandbox' | 'production';

export interface BrokerCapabilities {
  supportsTrading: boolean;
  supportsMarketData: boolean;
  supportsHistoricalData: boolean;
  supportsPortfolioStream: boolean;
  supportsMarketStream: boolean;
  supportsModifyOrder: boolean;
  supportsCancelOrder: boolean;
  supportsSandbox: boolean;
  supportsOAuth: boolean;
  supportsApiKeyAuth: boolean;
  supportsStaticIpRequirement: boolean;
  supportsClockSync: boolean;
}

export interface BrokerBalance {
  asset: string;
  free: number | string;
  locked: number | string;
  total?: number | string;
}

export interface BrokerAccount {
  broker: BrokerId;
  userId: string;
  environment: BrokerEnvironment;
  connected: boolean;
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  permissions: string[];
  isSafe: boolean;
  accountReference?: string;
  securityBadge: string;
  securityWarning?: string;
  tokenHealth?: any;
  balances: Record<string, BrokerBalance>;
  latencyMs: number;
  lastSyncAt: number;
}

export interface BrokerFunds {
  broker: BrokerId;
  currency: string;
  availableCash: ExactDecimal;
  usedMargin?: ExactDecimal;
  totalEquity: ExactDecimal;
  updatedAt: number;
}

export interface BrokerPosition {
  instrumentKey: string;
  symbol: string;
  quantity: string;
  averagePrice: string;
  currentPrice?: string;
  unrealizedPnl?: string;
  realizedPnl?: string;
  product?: string;
}

export interface BrokerHolding {
  instrumentKey: string;
  symbol: string;
  isin?: string;
  quantity: string;
  authorizedQuantity?: string;
  averagePrice: string;
  currentPrice?: string;
  pnl?: string;
}

export interface BrokerInstrument {
  broker: BrokerId;
  exchange: string;       // e.g. 'BINANCE', 'NSE', 'BSE', 'NFO'
  segment: string;        // e.g. 'SPOT', 'NSE_EQ', 'NSE_FO', 'BSE_EQ'
  instrumentKey: string;  // e.g. 'BINANCE:BTCUSDT' or 'NSE_EQ|INE002A01018'
  tradingSymbol: string;  // e.g. 'BTCUSDT', 'RELIANCE'
  instrumentToken?: string;
  instrumentType: string; // e.g. 'CRYPTO_SPOT', 'EQUITY', 'FUTURES', 'OPTIONS'
  currency: string;       // e.g. 'USDT', 'INR', 'USD'
  baseAsset?: string;     // e.g. 'BTC'
  quoteAsset?: string;    // e.g. 'USDT'
  lotSize?: number;
  tickSize?: string;
  minQuantity?: string;
  maxQuantity?: string;
  minNotional?: string;
  stepSize?: string;
  pricePrecision?: number;
  quantityPrecision?: number;
  expiry?: string;
  strike?: string;
  optionType?: 'CE' | 'PE';
  isin?: string;
  active: boolean;
}

export type BrokerOrderStatus =
  | 'CREATED'
  | 'VALIDATING'
  | 'RISK_APPROVED'
  | 'RESERVING'
  | 'RESERVED'
  | 'SUBMITTING'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELED'
  | 'CANCELLED'
  | 'CANCEL_REQUESTED'
  | 'CANCEL_PENDING'
  | 'REJECTED'
  | 'EXPIRED'
  | 'UNKNOWN'
  | 'RECONCILING'
  | 'RECONCILED'
  | 'FAILED';

export type BrokerOrderType =
  | 'MARKET'
  | 'LIMIT'
  | 'STOP_LOSS'
  | 'STOP_LOSS_LIMIT'
  | 'TAKE_PROFIT'
  | 'TAKE_PROFIT_LIMIT'
  | 'SL'
  | 'SL_M';

export type BrokerOrderSide = 'BUY' | 'SELL';

export interface BrokerOrderRequest {
  userId: string;
  broker?: BrokerId;
  symbol: string;
  instrumentKey?: string;
  asset?: string;
  baseAsset?: string;
  quoteAsset?: string;
  side: BrokerOrderSide;
  type: BrokerOrderType | string;
  quantity: number | string | ExactDecimal;
  price?: number | string | ExactDecimal;
  stopPrice?: number | string | ExactDecimal;
  quoteOrderQty?: number | string | ExactDecimal;
  product?: string; // 'CNC' | 'MIS' | 'NRML' | 'MTF' | 'D' | 'I'
  validity?: string; // 'DAY' | 'IOC'
  triggerPrice?: number | string | ExactDecimal;
  disclosedQuantity?: number;
  slice?: boolean;
  isAmo?: boolean;
  confirmationId?: string;
  isSystemPanic?: boolean;
  marketQuoteAgeMs?: number;
  idempotencyKey: string;
  clientOrderId?: string;
  accountMode?: 'live' | 'paper';
}

export interface BrokerFill {
  tradeId: string;
  price: string;
  qty: string;
  commission: string;
  commissionAsset: string;
  commissionStatus?: 'ESTIMATED' | 'AUTHORITATIVE' | 'PENDING' | 'UNRESOLVED';
  time?: number;
}

export interface BrokerTrade {
  tradeId: string;
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
}

export interface BrokerOrder {
  id: string;
  userId: string;
  broker?: BrokerId;
  clientOrderId: string;
  exchangeOrderId?: string;
  symbol: string;
  instrumentKey?: string;
  side: BrokerOrderSide;
  type: string;
  status: BrokerOrderStatus;
  origQty: number;
  origQtyExact?: string;
  executedQty: number;
  executedQtyExact?: string;
  price: number;
  priceExact?: string;
  avgPrice: number;
  avgPriceExact?: string;
  cumulativeQuoteQty: number;
  cumulativeQuoteExact?: string;
  quoteAsset: string;
  notional: number;
  notionalExact?: string;
  fee: number;
  feeExact?: string;
  feeAsset?: string;
  estimatedFeeExact?: string;
  actualCommissionExact?: string;
  actualCommissionAsset?: string;
  commissionStatus?: 'ESTIMATED' | 'AUTHORITATIVE' | 'PENDING' | 'UNRESOLVED';
  executedNotionalExact?: string;
  reservedCash: number;
  reservedCashMinor?: bigint;
  reservedQty: number;
  reservedQtyMinor?: bigint;
  rejectReason?: string;
  createdAt: number;
  updatedAt: number;
}

export type BrokerErrorCategory =
  | 'NETWORK_TIMEOUT'
  | 'INSUFFICIENT_FUNDS'
  | 'RATE_LIMITED'
  | 'INVALID_ORDER'
  | 'AUTH_FAILED'
  | 'REJECTED'
  | 'MAINTENANCE'
  | 'UNKNOWN';

export interface BrokerError extends Error {
  code: string;
  category: BrokerErrorCategory;
  retryable: boolean;
  raw?: any;
}

export interface BrokerMarketQuote {
  instrumentKey: string;
  symbol: string;
  price: number;
  bidPrice?: number;
  askPrice?: number;
  timestamp: number;
  source: string;
  isSynthetic: boolean;
}

export interface ReconcileVenueResult {
  found: boolean;
  notFoundConfirmed?: boolean;
  status?: string;
  executedQty?: number;
  executedQtyExact?: string;
  exchangeOrderId?: string;
  avgPrice?: number;
  avgPriceExact?: string;
  fills?: BrokerFill[];
}
