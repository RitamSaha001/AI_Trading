/**
 * Upstox API Domain Types, Wire Protocol & Runtime Validation Schemas
 *
 * Provides typed definitions and Zod validation schemas matching official Upstox API
 * specifications (v2/v3) for profile, registered IPs, funds/margins, positions,
 * holdings, orders, trades, and quotes.
 */

import { z } from 'zod';

export interface UpstoxRegisteredIpsData {
  primary_ip: string;
  secondary_ip?: string | null;
  primary_ip_updated_at?: string;
  secondary_ip_updated_at?: string;
}

export const UpstoxRegisteredIpsSchema = z.object({
  primary_ip: z.string().min(1),
  secondary_ip: z.string().nullable().optional(),
  primary_ip_updated_at: z.string().optional(),
  secondary_ip_updated_at: z.string().optional(),
});

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

export const UpstoxProfileSchema = z.object({
  user_id: z.string().min(1),
  user_name: z.string().optional().default(''),
  email: z.string().optional().default(''),
  is_active: z.boolean().optional().default(true),
  exchanges: z.array(z.string()).optional().default([]),
  products: z.array(z.string()).optional().default([]),
  broker: z.string().optional().default('UPSTOX'),
  order_types: z.array(z.string()).optional().default([]),
  user_type: z.string().optional(),
});

export interface UpstoxMarginData {
  available_margin: number;
  used_margin: number;
  payin_amount?: number;
  span_margin?: number;
  adhoc_margin?: number;
  notional_cash?: number;
  exposure_margin?: number;
}

export const UpstoxMarginSchema = z.object({
  available_margin: z.number(),
  used_margin: z.number(),
  payin_amount: z.number().optional(),
  span_margin: z.number().optional(),
  adhoc_margin: z.number().optional(),
  notional_cash: z.number().optional(),
  exposure_margin: z.number().optional(),
});

export interface UpstoxFundsData {
  equity: UpstoxMarginData;
  commodity?: UpstoxMarginData;
}

export const UpstoxFundsSchema = z.object({
  equity: UpstoxMarginSchema,
  commodity: UpstoxMarginSchema.optional(),
});

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

export const UpstoxPositionSchema = z.object({
  instrument_token: z.string().min(1),
  symbol: z.string().optional(),
  trading_symbol: z.string().optional().default(''),
  exchange: z.string().optional().default(''),
  product: z.string().optional().default(''),
  quantity: z.number(),
  buy_amount: z.number().optional(),
  sell_amount: z.number().optional(),
  buy_price: z.number().optional(),
  sell_price: z.number().optional(),
  unrealised_pnl: z.number().optional(),
  realised_pnl: z.number().optional(),
  value: z.number().optional(),
  pnl: z.number().optional(),
  close_price: z.number().optional(),
  last_price: z.number().optional(),
  average_price: z.number().optional(),
});

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

export const UpstoxHoldingSchema = z.object({
  isin: z.string().optional(),
  instrument_token: z.string().min(1),
  symbol: z.string().optional(),
  trading_symbol: z.string().optional().default(''),
  exchange: z.string().optional().default(''),
  quantity: z.number(),
  average_price: z.number(),
  last_price: z.number(),
  close_price: z.number().optional(),
  pnl: z.number().optional().default(0),
  day_change: z.number().optional(),
  day_change_percentage: z.number().optional(),
  company_name: z.string().optional(),
  collateral_quantity: z.number().optional(),
});

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
  slice?: boolean;
}

export interface UpstoxModifyOrderPayload {
  order_id: string;
  quantity?: number;
  price: number;
  order_type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  validity: 'DAY' | 'IOC';
  trigger_price?: number;
  disclosed_quantity?: number;
  market_protection?: number;
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

export const UpstoxOrderBookItemSchema = z.object({
  order_id: z.string().min(1),
  exchange: z.string().optional().default(''),
  product: z.string().optional().default(''),
  price: z.number().optional().default(0),
  quantity: z.number().optional().default(0),
  status: z.string(),
  order_type: z.string().optional().default(''),
  transaction_type: z.string().optional().default(''),
  average_price: z.number().optional().default(0),
  filled_quantity: z.number().optional().default(0),
  pending_quantity: z.number().optional().default(0),
  status_message: z.string().optional(),
  order_timestamp: z.string().optional().default(''),
  tag: z.string().optional(),
  instrument_token: z.string().optional().default(''),
  trading_symbol: z.string().optional().default(''),
  disclosed_quantity: z.number().optional(),
  trigger_price: z.number().optional(),
});

export interface UpstoxTradeItem {
  trade_id: string;
  order_id: string;
  exchange: string;
  trading_symbol: string;
  exchange_order_id?: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  price?: number;
  average_price: number;
  exchange_timestamp?: string;
  trade_timestamp?: string;
}

export const UpstoxTradeItemSchema = z
  .object({
    trade_id: z.string().min(1),
    order_id: z.string().min(1),
    exchange: z.string().optional().default(''),
    trading_symbol: z.string().optional().default(''),
    exchange_order_id: z.string().optional(),
    transaction_type: z.enum(['BUY', 'SELL']),
    quantity: z.number(),
    price: z.number().optional(),
    average_price: z.number().optional(),
    exchange_timestamp: z.string().optional(),
    trade_timestamp: z.string().optional(),
  })
  .transform((t) => ({
    ...t,
    average_price: t.average_price ?? t.price ?? 0,
  }));

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

export const UpstoxQuoteDataSchema = z.object({
  ohlc: z
    .object({
      open: z.number().optional().default(0),
      high: z.number().optional().default(0),
      low: z.number().optional().default(0),
      close: z.number().optional().default(0),
    })
    .optional(),
  depth: z
    .object({
      buy: z.array(z.object({ quantity: z.number(), price: z.number(), orders: z.number() })).optional().default([]),
      sell: z.array(z.object({ quantity: z.number(), price: z.number(), orders: z.number() })).optional().default([]),
    })
    .optional(),
  timestamp: z.string().optional(),
  last_price: z.number(),
  volume: z.number().optional(),
  average_price: z.number().optional(),
  instrument_token: z.string().optional(),
});

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
  metadata?: {
    latency?: number;
  };
}

export const UpstoxPlaceOrderResponseSchema = z
  .object({
    order_id: z.string().optional(),
    order_ids: z.array(z.string()).optional(),
  })
  .refine(
    (data) => Boolean((data.order_id && data.order_id.trim()) || (data.order_ids && data.order_ids.length > 0)),
    {
      message: 'Expected at least one valid order_id or non-empty order_ids array in Upstox response',
    }
  )
  .transform((data) => {
    const primary = (data.order_id && data.order_id.trim()) || (data.order_ids && data.order_ids[0]) || '';
    const all = data.order_ids && data.order_ids.length > 0 ? data.order_ids : (primary ? [primary] : []);
    return {
      order_id: primary,
      order_ids: all,
    };
  });

export type UpstoxPlaceOrderResponse = z.infer<typeof UpstoxPlaceOrderResponseSchema>;

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

export const UpstoxOAuthTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  extended_token: z.string().optional(),
  user_id: z.string().min(1),
  user_name: z.string().optional().default(''),
  email: z.string().optional(),
  is_active: z.boolean().optional(),
  exchanges: z.array(z.string()).optional(),
  products: z.array(z.string()).optional(),
});
