import crypto from 'node:crypto';
import {
  BrokerFunds,
  BrokerHolding,
  BrokerId,
  BrokerMarketQuote,
  BrokerOrder,
  BrokerPosition,
  BrokerTrade,
} from '../brokerTypes';
import { StandardBrokerError } from '../brokerGateway';
import { StoredBrokerSession } from '../shared/sessionCredentialStore';
import { ReadOnlySessionBrokerAdapter } from '../shared/readOnlySessionBrokerAdapter';
import { ExactDecimal } from '../../precision';
import { FlattradeClient, FlattradeSession } from './flattradeClient';
import { FlattradeCandle, FlattradeMarketDataService, FlattradeOptionContract, FlattradeOptionGreeks } from './flattradeMarketDataService';
import { FlattradeInstrumentMasterService } from './flattradeInstrumentMasterService';
import { FlattradeUserStreamTransport } from './flattradeUserStreamTransport';

export class FlattradeAdapter extends ReadOnlySessionBrokerAdapter<FlattradeSession> {
  readonly id: BrokerId = 'flattrade';
  readonly name = 'Flattrade Pi';

  protected createSession(credentials: any): StoredBrokerSession<FlattradeSession> {
    const accessToken = String(credentials.accessToken || credentials.sessionToken || '').trim();
    const userId = String(credentials.userId || credentials.ucc || credentials.accountId || '').trim();
    const accountId = String(credentials.accountId || credentials.ucc || userId).trim();
    if (!accessToken || !userId || !accountId) {
      throw new StandardBrokerError('Flattrade requires a current Pi access token, user ID, and account ID after browser authorization.', {
        code: 'AUTHENTICATION_FAILED', category: 'AUTH_FAILED', retryable: false,
      });
    }
    return {
      session: { accessToken, userId, accountId },
      environment: 'production',
      accountId,
      accountName: String(credentials.accountName || '').trim() || undefined,
      canTrade: false,
      expiresAt: this.nextSixAmIst(),
    };
  }

  protected async verifySession(session: FlattradeSession): Promise<void> {
    await FlattradeClient.getLimits(session);
  }

  protected async fetchFunds(session: FlattradeSession): Promise<BrokerFunds> {
    const response = await FlattradeClient.getLimits(session);
    const data = response?.data || response || {};
    const available = data.cash ?? data.availablecash ?? data.AvailableCash ?? 0;
    const used = data.marginused ?? data.marginUsed ?? data.MarginUsed ?? 0;
    const total = data.net ?? data.Net ?? ExactDecimal.from(String(available)).plus(String(used)).toString();
    return {
      broker: this.id,
      currency: 'INR',
      availableCash: ExactDecimal.from(String(available)),
      usedMargin: ExactDecimal.from(String(used)),
      totalEquity: ExactDecimal.from(String(total)),
      updatedAt: Date.now(),
    };
  }

  protected async fetchPositions(session: FlattradeSession): Promise<BrokerPosition[]> {
    const response = await FlattradeClient.getPositions(session);
    return this.list(response).map((item: any) => ({
      instrumentKey: String(item.token ?? item.tsym ?? ''),
      symbol: String(item.tsym ?? ''),
      quantity: String(item.netqty ?? item.netQty ?? 0),
      averagePrice: String(item.netavgprc ?? item.netAvgPrc ?? 0),
      currentPrice: item.lp !== undefined ? String(item.lp) : undefined,
      unrealizedPnl: item.urmtom !== undefined ? String(item.urmtom) : undefined,
      realizedPnl: item.rpnl !== undefined ? String(item.rpnl) : undefined,
      product: item.prd,
    }));
  }

  protected async fetchHoldings(session: FlattradeSession): Promise<BrokerHolding[]> {
    const response = await FlattradeClient.getHoldings(session);
    return this.list(response).map((item: any) => ({
      instrumentKey: String(item.token ?? item.tsym ?? ''),
      symbol: String(item.tsym ?? ''),
      isin: item.isin,
      quantity: String(item.holdqty ?? item.qty ?? 0),
      authorizedQuantity: String(item.btstqty ?? item.holdqty ?? item.qty ?? 0),
      averagePrice: String(item.upldprc ?? item.avgprc ?? 0),
      currentPrice: item.lp !== undefined ? String(item.lp) : undefined,
      pnl: item.pnl !== undefined ? String(item.pnl) : undefined,
    }));
  }

  protected async fetchOrders(session: FlattradeSession): Promise<BrokerOrder[]> {
    const response = await FlattradeClient.getOrders(session);
    return this.list(response).map((item: any) => this.toOrder(item, session.userId));
  }

  protected async fetchTrades(session: FlattradeSession): Promise<BrokerTrade[]> {
    const response = await FlattradeClient.getTrades(session);
    return this.list(response).map((item: any) => ({
      tradeId: String(item.flid ?? item.norenordno ?? crypto.randomUUID()),
      orderId: String(item.norenordno ?? ''),
      symbol: String(item.tsym ?? ''),
      side: String(item.flattrade ?? item.trantype ?? 'B').toUpperCase() === 'S' ? 'SELL' : 'BUY',
      price: String(item.flprc ?? item.prc ?? 0),
      qty: String(item.flqty ?? item.qty ?? 0),
      quoteQty: String(item.flqty && item.flprc ? Number(item.flqty) * Number(item.flprc) : 0),
      commission: '0',
      commissionAsset: 'INR',
      time: Date.now(),
    }));
  }

  async getMarketQuote(symbol: string, userId?: string): Promise<BrokerMarketQuote | null> {
    const stored = userId ? await this.getCredentials(userId) : null;
    if (!stored) return null;
    return FlattradeMarketDataService.getQuote(stored.session, symbol);
  }

  async getMarketQuotesBatch(symbols: string[], userId: string, exchange = 'NSE'): Promise<Record<string, BrokerMarketQuote>> {
    const stored = await this.getCredentials(userId);
    if (!stored) return {};
    return FlattradeMarketDataService.getQuotesBatch(stored.session, symbols, exchange);
  }

  async getCandles(
    userId: string,
    input: { symbol: string; exchange?: string; intervalMinutes?: number; from?: Date; to?: Date; instrumentToken?: string },
  ): Promise<FlattradeCandle[]> {
    const stored = await this.getCredentials(userId);
    if (!stored) return [];
    return FlattradeMarketDataService.getCandles(stored.session, input);
  }

  async getOptionChain(
    userId: string,
    input: { exchange: string; symbol: string; strikePrice: string; count?: number },
  ): Promise<FlattradeOptionContract[]> {
    const stored = await this.getCredentials(userId);
    if (!stored) return [];
    return FlattradeMarketDataService.getOptionChain(stored.session, input);
  }

  async getOptionGreeks(
    userId: string,
    input: { expiryDate: string; strikePrice: string; spotPrice: string; interestRate: string; volatility: string; optionType: 'CE' | 'PE' },
  ): Promise<FlattradeOptionGreeks | null> {
    const stored = await this.getCredentials(userId);
    if (!stored) return null;
    return FlattradeMarketDataService.getOptionGreeks(stored.session, input);
  }

  async getOrderHistory(userId: string, orderId: string): Promise<any[]> {
    const stored = await this.getCredentials(userId);
    if (!stored) return [];
    const response = await FlattradeClient.getSingleOrderHistory(stored.session, orderId);
    return this.list(response);
  }

  async getOrderMargin(userId: string, input: Record<string, string>): Promise<any | null> {
    const stored = await this.getCredentials(userId);
    if (!stored) return null;
    return FlattradeClient.getOrderMargin(stored.session, input);
  }

  async getMultiLegOrders(userId: string): Promise<any[]> {
    const stored = await this.getCredentials(userId);
    if (!stored) return [];
    return this.list(await FlattradeClient.getMultiLegOrders(stored.session));
  }

  async getGttOrders(userId: string): Promise<{ pending: any[]; enabled: any[] }> {
    const stored = await this.getCredentials(userId);
    if (!stored) return { pending: [], enabled: [] };
    const [pending, enabled] = await Promise.all([
      FlattradeClient.getPendingGttOrders(stored.session),
      FlattradeClient.getEnabledGtts(stored.session),
    ]);
    return { pending: this.list(pending), enabled: this.list(enabled) };
  }

  async getStreamReadiness(userId: string): Promise<{ health: string; lastEventAt: number; reason: string }> {
    const stored = await this.getCredentials(userId);
    if (!stored) return { health: 'DISABLED', lastEventAt: 0, reason: 'No active Flattrade session is stored.' };
    const transport = new FlattradeUserStreamTransport(stored.session);
    return {
      health: transport.getHealth(),
      lastEventAt: transport.getLastEventAt(),
      reason: transport.getCertificationReadiness().reason,
    };
  }

  getInstrumentMasterStatus() {
    return FlattradeInstrumentMasterService.getStatus();
  }

  protected override executionLockedError(): StandardBrokerError {
    return new StandardBrokerError('Flattrade execution is locked pending its separate live-order gate and sandbox drill. Its retail API route permits limit and stop-limit orders only; market orders will remain blocked.', {
      code: 'BROKER_LIVE_EXECUTION_LOCKED', category: 'REJECTED', retryable: false,
    });
  }

  private toOrder(item: any, userId: string): BrokerOrder {
    const quantity = String(item.qty ?? item.prcqty ?? 0);
    const filled = String(item.fillshares ?? item.filledqty ?? 0);
    return {
      id: String(item.norenordno ?? item.orderno ?? ''),
      exchangeOrderId: String(item.norenordno ?? item.orderno ?? ''),
      clientOrderId: String(item.remarks ?? item.norenordno ?? item.orderno ?? ''),
      userId,
      broker: this.id,
      symbol: String(item.tsym ?? ''),
      instrumentKey: String(item.token ?? ''),
      side: String(item.trantype ?? 'B').toUpperCase() === 'S' ? 'SELL' : 'BUY',
      type: this.normalizeOrderType(String(item.prctyp ?? 'LMT')),
      status: this.normalizeOrderStatus(String(item.status ?? item.rpt ?? 'UNKNOWN')),
      origQty: Number(quantity), origQtyExact: quantity,
      executedQty: Number(filled), executedQtyExact: filled,
      price: Number(item.prc ?? 0), priceExact: String(item.prc ?? 0),
      avgPrice: Number(item.avgprc ?? 0), avgPriceExact: String(item.avgprc ?? 0),
      cumulativeQuoteQty: 0, cumulativeQuoteExact: '0', quoteAsset: 'INR', notional: 0, fee: 0,
      reservedCash: 0, reservedQty: 0, time: Date.now(), updateTime: Date.now(),
    };
  }

  private list(response: any): any[] {
    const data = response?.data ?? response;
    return Array.isArray(data) ? data : Array.isArray(data?.values) ? data.values : [];
  }

  private nextSixAmIst(): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const target = new Date(`${values.year}-${values.month}-${values.day}T00:30:00.000Z`);
    if (target.getTime() <= Date.now()) target.setUTCDate(target.getUTCDate() + 1);
    return target.getTime();
  }
}
