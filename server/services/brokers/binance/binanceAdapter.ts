/**
 * Production Binance Broker Adapter for Lumen
 * 
 * Implements BrokerGateway by adapting BinanceGateway, bridging normalized
 * domain types and Binance-specific API protocols without modifying BinanceGateway's
 * battle-tested financial and order state logic.
 */

import { BrokerGateway, StandardBrokerError } from '../brokerGateway';
import {
  BrokerAccount,
  BrokerBalance,
  BrokerCapabilities,
  BrokerError,
  BrokerFill,
  BrokerFunds,
  BrokerId,
  BrokerInstrument,
  BrokerMarketQuote,
  BrokerOrder,
  BrokerOrderRequest,
  BrokerOrderStatus,
  BrokerPosition,
  BrokerTrade,
  ReconcileVenueResult,
} from '../brokerTypes';
import { BinanceGateway, PlaceOrderInput } from '../../binanceGateway';
import { ClockSyncService } from '../../clockSyncService';
import { ExactDecimal } from '../../precision';
import { getDb } from '../../../db';

export class BinanceAdapter implements BrokerGateway {
  public readonly id: BrokerId = 'binance';
  public readonly name: string = 'Binance';

  public readonly capabilities: BrokerCapabilities = {
    supportsTrading: true,
    supportsMarketData: true,
    supportsHistoricalData: true,
    supportsPortfolioStream: true,
    supportsMarketStream: true,
    supportsModifyOrder: false,
    supportsCancelOrder: true,
    supportsSandbox: true,
    supportsOAuth: false,
    supportsApiKeyAuth: true,
    supportsStaticIpRequirement: false,
    supportsClockSync: true,
  };

  /**
   * Returns unified account details and security audit for the user.
   */
  async getAccount(userId: string): Promise<BrokerAccount | null> {
    const audit = await BinanceGateway.getExchangeAccountInfo(userId);
    if (!audit) return null;

    const normalizedBalances: Record<string, BrokerBalance> = {};
    if (audit.balances) {
      for (const [asset, b] of Object.entries(audit.balances)) {
        normalizedBalances[asset] = {
          asset: b.asset || asset,
          free: b.free,
          locked: b.locked,
          total: (Number(b.free) || 0) + (Number(b.locked) || 0),
        };
      }
    }

    return {
      broker: this.id,
      userId,
      environment: audit.environment,
      connected: audit.connected,
      canTrade: audit.canTrade,
      canWithdraw: audit.canWithdraw,
      canDeposit: audit.canDeposit,
      permissions: audit.permissions,
      isSafe: audit.isSafe,
      securityBadge: audit.securityBadge,
      securityWarning: audit.securityWarning,
      balances: normalizedBalances,
      latencyMs: audit.latencyMs,
      lastSyncAt: Date.now(),
    };
  }

  /**
   * Derives funds/capital available in Binance quote asset (default USDT).
   */
  async getFunds(userId: string): Promise<BrokerFunds | null> {
    const account = await this.getAccount(userId);
    if (!account) return null;

    const usdtBalance = account.balances['USDT'];
    const freeCash = usdtBalance ? ExactDecimal.from(usdtBalance.free) : ExactDecimal.zero();
    const lockedCash = usdtBalance ? ExactDecimal.from(usdtBalance.locked) : ExactDecimal.zero();

    return {
      broker: this.id,
      currency: 'USDT',
      availableCash: freeCash,
      usedMargin: lockedCash,
      totalEquity: freeCash.add(lockedCash),
      updatedAt: Date.now(),
    };
  }

  /**
   * Fetches free and locked balances for all assets.
   */
  async getBalances(userId: string): Promise<Record<string, BrokerBalance>> {
    const account = await this.getAccount(userId);
    return account ? account.balances : {};
  }

  /**
   * Returns open orders for the user from authoritative database state.
   */
  async getOpenOrders(userId: string, symbol?: string): Promise<BrokerOrder[]> {
    const db = getDb();
    const query = symbol
      ? `SELECT * FROM exchange_orders WHERE user_id = ? AND symbol = ? AND status IN ('SUBMITTING', 'OPEN', 'PARTIALLY_FILLED') ORDER BY created_at DESC`
      : `SELECT * FROM exchange_orders WHERE user_id = ? AND status IN ('SUBMITTING', 'OPEN', 'PARTIALLY_FILLED') ORDER BY created_at DESC`;
    const params = symbol ? [userId, symbol] : [userId];
    const rows = await db.query<any>(query, params);

    return rows.map((r) => this.mapOrderRecord(r));
  }

  /**
   * Retrieves an order by clientOrderId or exchangeOrderId.
   */
  async getOrder(userId: string, orderId: string, symbol?: string): Promise<BrokerOrder | null> {
    const db = getDb();
    const row = await db.queryOne<any>(
      `SELECT * FROM exchange_orders WHERE user_id = ? AND (client_order_id = ? OR exchange_order_id = ?)`,
      [userId, orderId, orderId]
    );
    if (!row) return null;
    return this.mapOrderRecord(row);
  }

  /**
   * Fetches executed trades for user.
   */
  async getTrades(userId: string, symbol?: string): Promise<BrokerTrade[]> {
    const db = getDb();
    const query = symbol
      ? `SELECT f.*, o.side FROM exchange_fills f JOIN exchange_orders o ON f.order_id = o.client_order_id WHERE o.user_id = ? AND f.symbol = ? ORDER BY f.executed_at DESC LIMIT 100`
      : `SELECT f.*, o.side FROM exchange_fills f JOIN exchange_orders o ON f.order_id = o.client_order_id WHERE o.user_id = ? ORDER BY f.executed_at DESC LIMIT 100`;
    const params = symbol ? [userId, symbol] : [userId];
    const rows = await db.query<any>(query, params);

    return rows.map((r) => ({
      tradeId: r.exchange_trade_id || r.id,
      orderId: r.order_id,
      symbol: r.symbol,
      side: r.side || 'BUY',
      price: r.price_exact || String(r.price || '0'),
      qty: r.qty_exact || String(r.qty || '0'),
      quoteQty: r.quote_qty_exact || String(r.quote_qty || '0'),
      commission: r.commission_exact || String(r.commission || '0'),
      commissionAsset: r.commission_asset || 'USDT',
      time: Number(r.executed_at || Date.now()),
    }));
  }

  /**
   * Submits order through BinanceGateway with server-side validation and risk approval.
   */
  async placeOrder(order: BrokerOrderRequest): Promise<BrokerOrder> {
    const quoteAsset = order.quoteAsset || 'USDT';
    const baseAsset =
      order.baseAsset ||
      order.asset ||
      (order.symbol.endsWith(quoteAsset) ? order.symbol.slice(0, -quoteAsset.length) : order.symbol);

    const input: PlaceOrderInput = {
      userId: order.userId,
      symbol: order.symbol,
      asset: baseAsset,
      quoteAsset,
      side: order.side,
      type: (order.type as any) || 'MARKET',
      quantity: order.quantity,
      price: order.price,
      stopPrice: order.stopPrice,
      quoteOrderQty: order.quoteOrderQty,
      marketQuoteAgeMs: order.marketQuoteAgeMs || 0,
      idempotencyKey: order.idempotencyKey,
      accountMode: order.accountMode || 'live',
    };

    const record = await BinanceGateway.submitOrder(input);
    return this.mapOrderRecord(record);
  }

  /**
   * Cancels active order via BinanceGateway.
   */
  async cancelOrder(userId: string, clientOrderId: string, symbol?: string): Promise<BrokerOrder> {
    const record = await BinanceGateway.cancelOrder(userId, clientOrderId);
    return this.mapOrderRecord(record);
  }

  /**
   * Reconciles ambiguous order status directly with Binance venue.
   */
  async reconcileUnknownOrder(
    clientOrderId: string,
    symbol?: string,
    userId?: string
  ): Promise<ReconcileVenueResult> {
    return BinanceGateway.reconcileUnknownOrder(clientOrderId, symbol, userId);
  }

  /**
   * Fetches authoritative fills from Binance trade history.
   */
  async fetchOrderFills(
    userId: string,
    symbol: string,
    exchangeOrderId?: string,
    clientOrderId?: string
  ): Promise<BrokerFill[]> {
    return BinanceGateway.fetchOrderFillsFromVenue(userId, symbol, exchangeOrderId, clientOrderId);
  }

  /**
   * Saves encrypted credentials for the user.
   */
  async saveCredentials(userId: string, credentials: any): Promise<any> {
    return BinanceGateway.saveExchangeCredentials(userId, credentials);
  }

  /**
   * Wipes credentials and disconnects user exchange connection.
   */
  async disconnectAccount(userId: string): Promise<void> {
    await BinanceGateway.disconnectExchange(userId);
  }

  /**
   * Creates a user data stream listenKey.
   */
  async createListenKey(userId: string): Promise<string | null> {
    return BinanceGateway.createListenKey(userId);
  }

  /**
   * Retrieves decrypted exchange credentials for the user.
   */
  async getCredentials(userId: string): Promise<any> {
    return BinanceGateway.getCredentials(userId);
  }

  /**
   * Verifies health of Binance gateway and clock synchronization.
   */
  async healthCheck(): Promise<{ isHealthy: boolean; latencyMs: number; message?: string }> {
    const clockStatus = ClockSyncService.getStatus();
    return {
      isHealthy: clockStatus.isHealthy,
      latencyMs: clockStatus.roundTripMs,
      message: clockStatus.isHealthy
        ? 'Binance connection and clock sync healthy'
        : `Binance clock sync degraded: offset=${clockStatus.offsetMs}ms`,
    };
  }

  /**
   * Normalizes Binance order status to unified BrokerOrderStatus.
   */
  normalizeOrderStatus(providerStatus: string): BrokerOrderStatus {
    const s = providerStatus.toUpperCase();
    switch (s) {
      case 'NEW':
        return 'OPEN';
      case 'PARTIALLY_FILLED':
        return 'PARTIALLY_FILLED';
      case 'FILLED':
        return 'FILLED';
      case 'CANCELED':
      case 'CANCELLED':
        return 'CANCELLED';
      case 'PENDING_CANCEL':
        return 'CANCEL_REQUESTED';
      case 'REJECTED':
        return 'REJECTED';
      case 'EXPIRED':
        return 'EXPIRED';
      case 'SUBMITTING':
        return 'SUBMITTING';
      case 'RECONCILING':
        return 'RECONCILING';
      case 'UNKNOWN':
        return 'UNKNOWN';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Normalizes Binance order type.
   */
  normalizeOrderType(providerType: string): string {
    const t = providerType.toUpperCase();
    switch (t) {
      case 'LIMIT':
      case 'MARKET':
      case 'STOP_LOSS':
      case 'STOP_LOSS_LIMIT':
      case 'TAKE_PROFIT':
      case 'TAKE_PROFIT_LIMIT':
        return t;
      default:
        return t;
    }
  }

  /**
   * Categorizes raw Binance errors into StandardBrokerError.
   */
  normalizeError(err: any): BrokerError {
    const message = err?.message || String(err);
    const code = String(err?.code || 'UNKNOWN');

    // Binance error codes mapping
    if (code === '-1021' || message.includes('Timestamp')) {
      return new StandardBrokerError(message, {
        code,
        category: 'REJECTED',
        retryable: true,
        raw: err,
      });
    }
    if (code === '-2010' || message.includes('insufficient balance')) {
      return new StandardBrokerError(message, {
        code,
        category: 'INSUFFICIENT_FUNDS',
        retryable: false,
        raw: err,
      });
    }
    if (code === '-1003' || message.includes('Too many requests') || message.includes('rate limit')) {
      return new StandardBrokerError(message, {
        code,
        category: 'RATE_LIMITED',
        retryable: true,
        raw: err,
      });
    }
    if (code === '-2011' || message.includes('Unknown order')) {
      return new StandardBrokerError(message, {
        code,
        category: 'INVALID_ORDER',
        retryable: false,
        raw: err,
      });
    }
    if (code === '-2014' || code === '-2015' || message.includes('API-key')) {
      return new StandardBrokerError(message, {
        code,
        category: 'AUTH_FAILED',
        retryable: false,
        raw: err,
      });
    }
    if (message.includes('timeout') || message.includes('ETIMEDOUT') || message.includes('ECONNREFUSED')) {
      return new StandardBrokerError(message, {
        code: 'TIMEOUT',
        category: 'NETWORK_TIMEOUT',
        retryable: true,
        raw: err,
      });
    }

    return new StandardBrokerError(message, {
      code,
      category: 'UNKNOWN',
      retryable: false,
      raw: err,
    });
  }

  private mapOrderRecord(r: any): BrokerOrder {
    return {
      id: r.id,
      userId: r.user_id || r.userId,
      broker: this.id,
      clientOrderId: r.client_order_id || r.clientOrderId,
      exchangeOrderId: r.exchange_order_id || r.exchangeOrderId,
      symbol: r.symbol,
      side: r.side,
      type: r.type,
      status: (r.status as BrokerOrderStatus) || 'UNKNOWN',
      origQty: Number(r.orig_qty || r.origQty || 0),
      origQtyExact: r.orig_qty_exact || r.origQtyExact,
      executedQty: Number(r.executed_qty || r.executedQty || 0),
      executedQtyExact: r.executed_qty_exact || r.executedQtyExact,
      price: Number(r.price || 0),
      priceExact: r.price_exact || r.priceExact,
      avgPrice: Number(r.avg_price || r.avgPrice || 0),
      avgPriceExact: r.avg_price_exact || r.avgPriceExact,
      cumulativeQuoteQty: Number(r.cumulative_quote_qty || r.cumulativeQuoteQty || 0),
      cumulativeQuoteExact: r.cumulative_quote_exact || r.cumulativeQuoteExact,
      quoteAsset: r.quote_asset || r.quoteAsset || 'USDT',
      notional: Number(r.notional || 0),
      notionalExact: r.notional_exact || r.notionalExact,
      fee: Number(r.fee || 0),
      feeExact: r.fee_exact || r.feeExact,
      feeAsset: r.fee_asset || r.feeAsset,
      estimatedFeeExact: r.estimated_fee_exact || r.estimatedFeeExact,
      actualCommissionExact: r.actual_commission_exact || r.actualCommissionExact,
      actualCommissionAsset: r.actual_commission_asset || r.actualCommissionAsset,
      commissionStatus: r.commission_status || r.commissionStatus,
      executedNotionalExact: r.executed_notional_exact || r.executedNotionalExact,
      reservedCash: Number(r.reserved_cash || r.reservedCash || 0),
      reservedCashMinor: r.reserved_cash_minor || r.reservedCashMinor,
      reservedQty: Number(r.reserved_qty || r.reservedQty || 0),
      reservedQtyMinor: r.reserved_qty_minor || r.reservedQtyMinor,
      rejectReason: r.reject_reason || r.rejectReason,
      createdAt: Number(r.created_at || r.createdAt || Date.now()),
      updatedAt: Number(r.updated_at || r.updatedAt || Date.now()),
    };
  }
}
