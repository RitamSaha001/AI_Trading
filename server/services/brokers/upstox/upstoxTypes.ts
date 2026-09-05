/**
 * Raw Upstox API v2 Domain Types and Wire Protocol
 *
 * Provides typed definitions matching the Upstox API v2 specifications
 * for profile, funds/margins, positions, holdings, orders, trades, and quotes.
 */

export interface UpstoxProfileData {
  user_id: string;
  user_name: string;
  email: string;
  is_active: boolean;
  exchanges: string[];
  products: string[];
  broker: string;
  order_types: string[];
  user_type?: string;
}

export interface UpstoxMarginData {
  available_margin: number;
  used_margin: number;
  payin_amount?: number;
  span_margin?: number;
  adhoc_margin?: number;
  notional_cash?: number;
  exposure_margin?: number;
}

export interface UpstoxFundsData {
  equity: UpstoxMarginData;
  commodity?: UpstoxMarginData;
}

export interface UpstoxPositionData {
  instrument_token: string;
  symbol?: string;
  trading_symbol: string;
  exchange: string;
  product: string;
  quantity: number;
  buy_amount?: number;
  sell_amount?: number;
  buy_price?: number;
  sell_price?: number;
  unrealised_pnl?: number;
  realised_pnl?: number;
  value?: number;
  pnl?: number;
  close_price?: number;
  last_price?: number;
  average_price?: number;
}

export interface UpstoxHoldingData {
  isin?: string;
  instrument_token: string;
  symbol?: string;
  trading_symbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  last_price: number;
  close_price?: number;
  pnl: number;
  day_change?: number;
  day_change_percentage?: number;
  company_name?: string;
  collateral_quantity?: number;
}

export interface UpstoxPlaceOrderPayload {
  quantity: number;
  product: 'I' | 'D';
  validity: 'DAY' | 'IOC';
  price: number;
  tag?: string;
  instrument_token: string;
  order_type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  transaction_type: 'BUY' | 'SELL';
  disclosed_quantity?: number;
  trigger_price?: number;
  is_amo?: boolean;
}

export interface UpstoxOrderBookItem {
  order_id: string;
  exchange: string;
  product: string;
  price: number;
  quantity: number;
  status: string;
  order_type: string;
  transaction_type: string;
  average_price: number;
  filled_quantity: number;
  pending_quantity: number;
  status_message?: string;
  order_timestamp: string;
  tag?: string;
  instrument_token: string;
  trading_symbol: string;
  disclosed_quantity?: number;
  trigger_price?: number;
}

export interface UpstoxTradeItem {
  trade_id: string;
  order_id: string;
  exchange: string;
  trading_symbol: string;
  exchange_order_id?: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  average_price: number;
  exchange_timestamp?: string;
  trade_timestamp?: string;
}

export interface UpstoxQuoteData {
  ohlc?: { open: number; high: number; low: number; close: number };
  depth?: {
    buy: Array<{ quantity: number; price: number; orders: number }>;
    sell: Array<{ quantity: number; price: number; orders: number }>;
  };
  timestamp?: string;
  last_price: number;
  volume?: number;
  average_price?: number;
  instrument_token?: string;
}

export interface UpstoxApiErrorDetail {
  errorCode?: string;
  error_code?: string;
  message: string;
  propertyPath?: string;
  invalidValue?: any;
}

export interface UpstoxApiResponse<T = any> {
  status: 'success' | 'error';
  data?: T;
  errors?: UpstoxApiErrorDetail[];
}

export interface UpstoxOAuthTokenResponse {
  access_token: string;
  extended_token?: string;
  user_id: string;
  user_name: string;
  email?: string;
  is_active?: boolean;
  exchanges?: string[];
  products?: string[];
}
