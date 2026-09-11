import { ExactDecimal } from '../../precision';
import {
  BrokerAccount,
  BrokerBalance,
  BrokerCapabilities,
  BrokerError,
  BrokerExecutionReadiness,
  BrokerFill,
  BrokerFunds,
  BrokerHolding,
  BrokerId,
  BrokerOrder,
  BrokerOrderRequest,
  BrokerOrderStatus,
  BrokerPosition,
  BrokerTrade,
  ReconcileVenueResult,
} from '../brokerTypes';
import { BrokerGateway, StandardBrokerError } from '../brokerGateway';
import { SessionCredentialStore, StoredBrokerSession } from './sessionCredentialStore';
import { BrokerInstrumentCatalogService, CatalogInstrument } from './brokerInstrumentCatalogService';

export abstract class ReadOnlySessionBrokerAdapter<T extends Record<string, unknown>> implements BrokerGateway {
  abstract readonly id: BrokerId;
  abstract readonly name: string;
  readonly capabilities: BrokerCapabilities = {
    supportsTrading: false,
    supportsMarketData: false,
    supportsHistoricalData: false,
    supportsPortfolioStream: false,
    supportsMarketStream: false,
    supportsModifyOrder: false,
    supportsCancelOrder: false,
    supportsSandbox: false,
    supportsOAuth: false,
    supportsApiKeyAuth: true,
    supportsStaticIpRequirement: true,
    supportsClockSync: false,
  };

  protected abstract createSession(credentials: any): StoredBrokerSession<T>;
  protected abstract verifySession(session: T): Promise<void>;
  protected abstract fetchFunds(session: T): Promise<BrokerFunds>;
  protected abstract fetchPositions(session: T): Promise<BrokerPosition[]>;
  protected abstract fetchHoldings(session: T): Promise<BrokerHolding[]>;
  protected abstract fetchOrders(session: T): Promise<BrokerOrder[]>;
  protected abstract fetchTrades(session: T): Promise<BrokerTrade[]>;

  async saveCredentials(userId: string, credentials: any): Promise<any> {
    const stored = this.createSession(credentials);
    await this.verifySession(stored.session);
    await SessionCredentialStore.save(userId, this.id, stored);
    return {
      connected: true,
      broker: this.id,
      environment: stored.environment,
      accountId: stored.accountId,
      userName: stored.accountName,
      canTrade: false,
      executionStatus: 'READ_ONLY_PENDING_LIVE_GATE',
      tokenExpiresAt: stored.expiresAt,
    };
  }

  async getCredentials(userId: string): Promise<StoredBrokerSession<T> | null> {
    return SessionCredentialStore.load<T>(userId, this.id);
  }

  async disconnectAccount(userId: string): Promise<void> {
    await SessionCredentialStore.remove(userId, this.id);
  }

  async getExecutionReadiness(userId: string): Promise<BrokerExecutionReadiness> {
    const stored = await this.getCredentials(userId);
    if (!stored) {
      return {
        broker: this.id,
        state: 'NOT_CONNECTED',
        executionEnabled: false,
        connected: false,
        checks: [
          { name: 'authenticated-session', passed: false, detail: 'No active broker session is stored.' },
          { name: 'execution-gate', passed: false, detail: 'This broker is intentionally configured as read-only.' },
        ],
      };
    }
    return {
      broker: this.id,
      state: 'READ_ONLY',
      executionEnabled: false,
      connected: true,
      environment: stored.environment,
      checks: [
        { name: 'authenticated-session', passed: true, detail: 'An encrypted broker session is available.' },
        { name: 'portfolio-reconciliation', passed: true, detail: 'Funds, holdings, positions, orders, and trades can be read.' },
        { name: 'authoritative-instruments', passed: false, detail: 'Reference mappings cannot be used for execution.' },
        { name: 'execution-gate', passed: false, detail: 'Order placement, modification, and cancellation remain server-locked.' },
      ],
    };
  }

  async getAccount(userId: string): Promise<BrokerAccount | null> {
    const stored = await this.getCredentials(userId);
    if (!stored) {
      return this.disconnectedAccount(userId);
    }
    const startedAt = Date.now();
    try {
      const funds = await this.fetchFunds(stored.session);
      return {
        broker: this.id,
        userId,
        environment: stored.environment,
        connected: true,
        canTrade: false,
        canWithdraw: false,
        canDeposit: false,
        permissions: ['READ_ACCOUNT', 'READ_PORTFOLIO'],
        isSafe: true,
        accountReference: stored.accountId,
        securityBadge: 'READ_ONLY_PENDING_LIVE_GATE',
        securityWarning: `${this.name} is connected for read-only reconciliation. Trading remains server-locked until its separate live execution gate passes verification.`,
        tokenHealth: {
          status: 'ACTIVE',
          expiresAt: stored.expiresAt,
          timeRemainingMs: Math.max(0, stored.expiresAt - Date.now()),
          reauthRequired: false,
        },
        balances: this.fundsToBalances(funds),
        latencyMs: Date.now() - startedAt,
        lastSyncAt: Date.now(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Broker session verification failed.';
      return {
        ...this.disconnectedAccount(userId),
        environment: stored.environment,
        securityBadge: 'AUTH_OR_CONNECTIVITY_FAILED',
        securityWarning: message,
      };
    }
  }

  async getFunds(userId: string): Promise<BrokerFunds | null> {
    const stored = await this.getCredentials(userId);
    return stored ? this.fetchFunds(stored.session) : null;
  }

  async getBalances(userId: string): Promise<Record<string, BrokerBalance>> {
    const funds = await this.getFunds(userId);
    return funds ? this.fundsToBalances(funds) : {};
  }

  async getPositions(userId: string): Promise<BrokerPosition[]> {
    const stored = await this.getCredentials(userId);
    return stored ? this.fetchPositions(stored.session) : [];
  }

  async getHoldings(userId: string): Promise<BrokerHolding[]> {
    const stored = await this.getCredentials(userId);
    return stored ? this.fetchHoldings(stored.session) : [];
  }

  async listInstruments(options?: { query?: string; exchange?: string; segment?: string; limit?: number }): Promise<CatalogInstrument[]> {
    return BrokerInstrumentCatalogService.list(this.id, options);
  }

  async bootstrapInstrumentCatalog(): Promise<number> {
    if (this.id !== 'kotak_neo' && this.id !== 'flattrade') {
      return 0;
    }
    return BrokerInstrumentCatalogService.bootstrapReferenceEquities(this.id);
  }

  async getOpenOrders(userId: string, symbol?: string): Promise<BrokerOrder[]> {
    const stored = await this.getCredentials(userId);
    if (!stored) return [];
    const orders = await this.fetchOrders(stored.session);
    return orders.filter((order) => ['OPEN', 'PARTIALLY_FILLED', 'SUBMITTING'].includes(order.status))
      .filter((order) => !symbol || order.symbol === symbol);
  }

  async getOrder(userId: string, orderId: string, symbol?: string): Promise<BrokerOrder | null> {
    const stored = await this.getCredentials(userId);
    if (!stored) return null;
    const orders = await this.fetchOrders(stored.session);
    return orders.find((order) => (order.exchangeOrderId === orderId || order.id === orderId || order.clientOrderId === orderId) && (!symbol || order.symbol === symbol)) || null;
  }

  async getTrades(userId: string, symbol?: string): Promise<BrokerTrade[]> {
    const stored = await this.getCredentials(userId);
    if (!stored) return [];
    const trades = await this.fetchTrades(stored.session);
    return symbol ? trades.filter((trade) => trade.symbol === symbol) : trades;
  }

  async placeOrder(_order: BrokerOrderRequest): Promise<BrokerOrder> {
    throw this.executionLockedError();
  }

  async modifyOrder(_orderId: string, _updates: Partial<BrokerOrderRequest>): Promise<BrokerOrder> {
    throw this.executionLockedError();
  }

  async cancelOrder(_userId: string, _clientOrderId: string, _symbol?: string): Promise<BrokerOrder> {
    throw this.executionLockedError();
  }

  async reconcileUnknownOrder(clientOrderId: string, symbol?: string, userId?: string): Promise<ReconcileVenueResult> {
    if (!userId) return { found: false, notFoundConfirmed: false };
    const order = await this.getOrder(userId, clientOrderId, symbol);
    return order ? {
      found: true,
      status: order.status,
      exchangeOrderId: order.exchangeOrderId,
      executedQty: Number(order.executedQty),
      executedQtyExact: order.executedQtyExact,
      avgPrice: Number(order.avgPrice),
      avgPriceExact: order.avgPriceExact,
    } : { found: false, notFoundConfirmed: true };
  }

  async fetchOrderFills(userId: string, symbol: string, exchangeOrderId?: string): Promise<BrokerFill[]> {
    const trades = await this.getTrades(userId, symbol);
    return trades.filter((trade) => !exchangeOrderId || trade.orderId === exchangeOrderId).map((trade) => ({
      tradeId: trade.tradeId,
      price: trade.price,
      qty: trade.qty,
      commission: trade.commission,
      commissionAsset: trade.commissionAsset,
      commissionStatus: 'UNRESOLVED',
      time: trade.time,
    }));
  }

  async healthCheck(): Promise<{ isHealthy: boolean; latencyMs: number; message?: string }> {
    return { isHealthy: true, latencyMs: 0, message: `${this.name} adapter registered; execution is intentionally locked.` };
  }

  normalizeOrderStatus(providerStatus: string): BrokerOrderStatus {
    const value = providerStatus.toUpperCase().replace(/[\s-]+/g, '_');
    if (['OPEN', 'TRIGGER_PENDING', 'PENDING'].includes(value)) return 'OPEN';
    if (['COMPLETE', 'COMPLETED', 'FILLED'].includes(value)) return 'FILLED';
    if (['PARTIAL', 'PARTIALLY_FILLED'].includes(value)) return 'PARTIALLY_FILLED';
    if (['CANCELLED', 'CANCELED'].includes(value)) return 'CANCELLED';
    if (['REJECTED', 'REJECT'].includes(value)) return 'REJECTED';
    if (['EXPIRED'].includes(value)) return 'EXPIRED';
    return 'UNKNOWN';
  }

  normalizeOrderType(providerType: string): string {
    const value = providerType.toUpperCase();
    if (['L', 'LMT', 'LIMIT'].includes(value)) return 'LIMIT';
    if (['MKT', 'MARKET'].includes(value)) return 'MARKET';
    if (['SL', 'SL-LMT'].includes(value)) return 'STOP_LOSS_LIMIT';
    if (['SL-M', 'SL_M', 'SLM'].includes(value)) return 'STOP_LOSS';
    return providerType;
  }

  normalizeError(error: any): BrokerError {
    if (error instanceof StandardBrokerError) return error;
    const message = error?.message || String(error);
    return new StandardBrokerError(message, {
      code: /rate/i.test(message) ? 'RATE_LIMITED' : 'BROKER_ERROR',
      category: /rate/i.test(message) ? 'RATE_LIMITED' : 'UNKNOWN',
      retryable: /timeout|network|rate/i.test(message),
      raw: error,
    });
  }

  protected executionLockedError(): StandardBrokerError {
    return new StandardBrokerError(`${this.name} execution is disabled until its live-order gate, reconciliation, and sandbox drills are complete.`, {
      code: 'BROKER_LIVE_EXECUTION_LOCKED', category: 'REJECTED', retryable: false,
    });
  }

  private disconnectedAccount(userId: string): BrokerAccount {
    return {
      broker: this.id,
      userId,
      environment: 'production',
      connected: false,
      canTrade: false,
      canWithdraw: false,
      canDeposit: false,
      permissions: [],
      isSafe: true,
      securityBadge: 'DISCONNECTED',
      balances: {},
      latencyMs: 0,
      lastSyncAt: 0,
    };
  }

  private fundsToBalances(funds: BrokerFunds): Record<string, BrokerBalance> {
    return {
      INR: {
        asset: 'INR',
        free: funds.availableCash.toString(),
        locked: (funds.usedMargin || ExactDecimal.zero()).toString(),
        total: funds.totalEquity.toString(),
      },
    };
  }
}
