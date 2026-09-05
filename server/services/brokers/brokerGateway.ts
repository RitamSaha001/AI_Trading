/**
 * Unified Broker Gateway Interface for Lumen
 * 
 * Defines the contract that all broker adapters (Binance, future Upstox, etc.)
 * must satisfy. Core execution, risk, recovery, and reconciliation services
 * interact exclusively with this abstraction.
 */

import {
  BrokerAccount,
  BrokerBalance,
  BrokerCapabilities,
  BrokerError,
  BrokerFill,
  BrokerFunds,
  BrokerHolding,
  BrokerId,
  BrokerInstrument,
  BrokerMarketQuote,
  BrokerOrder,
  BrokerOrderRequest,
  BrokerOrderStatus,
  BrokerPosition,
  BrokerTrade,
  ReconcileVenueResult,
} from './brokerTypes';

export interface BrokerGateway {
  readonly id: BrokerId;
  readonly name: string;
  readonly capabilities: BrokerCapabilities;

  // Account & Portfolio Lifecycle
  getAccount(userId: string): Promise<BrokerAccount | null>;
  getFunds?(userId: string): Promise<BrokerFunds | null>;
  getBalances(userId: string): Promise<Record<string, BrokerBalance>>;
  getPositions?(userId: string): Promise<BrokerPosition[]>;
  getHoldings?(userId: string): Promise<BrokerHolding[]>;
  getCredentials?(userId: string): Promise<any>;
  saveCredentials?(userId: string, credentials: any): Promise<any>;
  disconnectAccount?(userId: string): Promise<void>;
  createListenKey?(userId: string): Promise<string | null>;

  // Orders & Trading
  getOpenOrders(userId: string, symbol?: string): Promise<BrokerOrder[]>;
  getOrder(userId: string, orderId: string, symbol?: string): Promise<BrokerOrder | null>;
  getTrades(userId: string, symbol?: string): Promise<BrokerTrade[]>;
  placeOrder(order: BrokerOrderRequest): Promise<BrokerOrder>;
  modifyOrder?(orderId: string, updates: Partial<BrokerOrderRequest>): Promise<BrokerOrder>;
  cancelOrder(userId: string, clientOrderId: string, symbol?: string): Promise<BrokerOrder>;

  // Reconciliation & Recovery
  reconcileUnknownOrder(
    clientOrderId: string,
    symbol?: string,
    userId?: string
  ): Promise<ReconcileVenueResult>;
  fetchOrderFills(
    userId: string,
    symbol: string,
    exchangeOrderId?: string,
    clientOrderId?: string
  ): Promise<BrokerFill[]>;

  // Market Data
  getMarketQuote?(instrument: string | BrokerInstrument): Promise<BrokerMarketQuote | null>;

  // Health, Normalization & Validation
  healthCheck(): Promise<{ isHealthy: boolean; latencyMs: number; message?: string }>;
  normalizeOrderStatus(providerStatus: string): BrokerOrderStatus;
  normalizeOrderType(providerType: string): string;
  normalizeError(err: any): BrokerError;
  validateInstrument?(instrument: string | BrokerInstrument): Promise<boolean>;
}

export class StandardBrokerError extends Error implements BrokerError {
  public code: string;
  public category: BrokerError['category'];
  public retryable: boolean;
  public raw?: any;

  constructor(
    messageOrCode: string,
    optionsOrMessage?:
      | {
          code?: string;
          category?: BrokerError['category'];
          retryable?: boolean;
          raw?: any;
        }
      | string,
    broker?: string,
    rawError?: any
  ) {
    if (typeof optionsOrMessage === 'string') {
      super(optionsOrMessage);
      this.name = 'StandardBrokerError';
      this.code = messageOrCode || 'UNKNOWN_ERROR';
      this.category = 'UNKNOWN';
      this.retryable = false;
      this.raw = rawError || broker;
    } else {
      super(messageOrCode);
      this.name = 'StandardBrokerError';
      this.code = optionsOrMessage?.code || 'UNKNOWN_ERROR';
      this.category = optionsOrMessage?.category || 'UNKNOWN';
      this.retryable = optionsOrMessage?.retryable ?? false;
      this.raw = optionsOrMessage?.raw;
    }
  }
}
