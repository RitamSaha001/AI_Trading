import crypto from 'node:crypto';
import {
  BrokerFunds,
  BrokerHolding,
  BrokerId,
  BrokerOrder,
  BrokerPosition,
  BrokerTrade,
} from '../brokerTypes';
import { StandardBrokerError } from '../brokerGateway';
import { StoredBrokerSession } from '../shared/sessionCredentialStore';
import { ReadOnlySessionBrokerAdapter } from '../shared/readOnlySessionBrokerAdapter';
import { ExactDecimal } from '../../precision';
import { KotakNeoClient, KotakNeoSession } from './kotakNeoClient';

export class KotakNeoAdapter extends ReadOnlySessionBrokerAdapter<KotakNeoSession> {
  readonly id: BrokerId = 'kotak_neo';
  readonly name = 'Kotak Neo';

  protected createSession(credentials: any): StoredBrokerSession<KotakNeoSession> {
    const consumerKey = String(credentials.consumerKey || credentials.apiKey || '').trim();
    const sessionToken = String(credentials.sessionToken || credentials.accessToken || '').trim();
    const sid = String(credentials.sid || '').trim();
    const ucc = String(credentials.ucc || credentials.accountId || '').trim();
    if (!consumerKey || !sessionToken || !sid || !ucc) {
      throw new StandardBrokerError('Kotak Neo requires Consumer Key, UCC, session token, and SID from an authenticated Neo session.', {
        code: 'AUTHENTICATION_FAILED', category: 'AUTH_FAILED', retryable: false,
      });
    }
    return {
      session: { consumerKey, sessionToken, sid, ucc },
      environment: 'production',
      accountId: ucc,
      accountName: String(credentials.accountName || '').trim() || undefined,
      canTrade: false,
      expiresAt: this.endOfDayIst(),
    };
  }

  protected async verifySession(session: KotakNeoSession): Promise<void> {
    await KotakNeoClient.getLimits(session);
  }

  protected async fetchFunds(session: KotakNeoSession): Promise<BrokerFunds> {
    const response = await KotakNeoClient.getLimits(session);
    const data = response?.data || response || {};
    const available = data.Net ?? data.net ?? data.AvailableMargin ?? data.availableMargin ?? 0;
    const used = data.MarginUsed ?? data.marginUsed ?? 0;
    return {
      broker: this.id,
      currency: 'INR',
      availableCash: ExactDecimal.from(String(available)),
      usedMargin: ExactDecimal.from(String(used)),
      totalEquity: ExactDecimal.from(String(available)).plus(String(used)),
      updatedAt: Date.now(),
    };
  }

  protected async fetchPositions(session: KotakNeoSession): Promise<BrokerPosition[]> {
    const response = await KotakNeoClient.getPositions(session);
    const items = this.list(response);
    return items.map((item: any) => ({
      instrumentKey: String(item.tok ?? item.token ?? item.trdSym ?? item.ts ?? ''),
      symbol: String(item.trdSym ?? item.ts ?? ''),
      quantity: String(item.netQty ?? item.netqty ?? item.qty ?? 0),
      averagePrice: String(item.netAvgPrc ?? item.avgPrc ?? item.avgprc ?? 0),
      currentPrice: item.ltp !== undefined ? String(item.ltp) : undefined,
      unrealizedPnl: item.unRealizedPnl !== undefined ? String(item.unRealizedPnl) : undefined,
      realizedPnl: item.realizedPnl !== undefined ? String(item.realizedPnl) : undefined,
      product: item.prod ?? item.product,
    }));
  }

  protected async fetchHoldings(session: KotakNeoSession): Promise<BrokerHolding[]> {
    const response = await KotakNeoClient.getHoldings(session);
    return this.list(response).map((item: any) => ({
      instrumentKey: String(item.instrumentToken ?? item.token ?? item.tradingSymbol ?? item.ts ?? ''),
      symbol: String(item.tradingSymbol ?? item.ts ?? ''),
      isin: item.isin,
      quantity: String(item.quantity ?? item.qty ?? 0),
      authorizedQuantity: String(item.authorizedQuantity ?? item.quantity ?? item.qty ?? 0),
      averagePrice: String(item.avgPrice ?? item.avgprc ?? 0),
      currentPrice: item.ltp !== undefined ? String(item.ltp) : undefined,
      pnl: item.pnl !== undefined ? String(item.pnl) : undefined,
    }));
  }

  protected async fetchOrders(session: KotakNeoSession): Promise<BrokerOrder[]> {
    const response = await KotakNeoClient.getOrders(session);
    return this.list(response).map((item: any) => this.toOrder(item, session.ucc));
  }

  protected async fetchTrades(session: KotakNeoSession): Promise<BrokerTrade[]> {
    const response = await KotakNeoClient.getTrades(session);
    return this.list(response).map((item: any) => ({
      tradeId: String(item.trdNo ?? item.tradeNo ?? item.nOrdNo ?? crypto.randomUUID()),
      orderId: String(item.nOrdNo ?? item.orderId ?? ''),
      symbol: String(item.trdSym ?? item.ts ?? ''),
      side: String(item.trnsTp ?? item.tt ?? 'B').toUpperCase() === 'S' ? 'SELL' : 'BUY',
      price: String(item.flPrc ?? item.price ?? 0),
      qty: String(item.flQty ?? item.qty ?? 0),
      quoteQty: String(item.flAmt ?? 0),
      commission: '0',
      commissionAsset: 'INR',
      time: Date.now(),
    }));
  }

  private toOrder(item: any, userId: string): BrokerOrder {
    const quantity = String(item.qty ?? 0);
    const filled = String(item.fldQty ?? item.filledQty ?? 0);
    return {
      id: String(item.nOrdNo ?? item.orderId ?? item.GuiOrdId ?? ''),
      exchangeOrderId: String(item.nOrdNo ?? item.orderId ?? ''),
      clientOrderId: String(item.GuiOrdId ?? item.nOrdNo ?? item.orderId ?? ''),
      userId,
      broker: this.id,
      symbol: String(item.trdSym ?? item.ts ?? ''),
      instrumentKey: String(item.token ?? item.tok ?? ''),
      side: String(item.trnsTp ?? item.tt ?? 'B').toUpperCase() === 'S' ? 'SELL' : 'BUY',
      type: this.normalizeOrderType(String(item.prcTp ?? item.pt ?? 'L')),
      status: this.normalizeOrderStatus(String(item.ordSt ?? item.status ?? 'UNKNOWN')),
      origQty: Number(quantity), origQtyExact: quantity,
      executedQty: Number(filled), executedQtyExact: filled,
      price: Number(item.prc ?? item.price ?? 0), priceExact: String(item.prc ?? item.price ?? 0),
      avgPrice: Number(item.avgPrc ?? 0), avgPriceExact: String(item.avgPrc ?? 0),
      cumulativeQuoteQty: 0, cumulativeQuoteExact: '0', quoteAsset: 'INR', notional: 0, fee: 0,
      reservedCash: 0, reservedQty: 0, time: Date.now(), updateTime: Date.now(),
    };
  }

  private list(response: any): any[] {
    const data = response?.data ?? response;
    return Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
  }

  private endOfDayIst(): number {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    ist.setHours(23, 59, 0, 0);
    return Date.now() + Math.max(60_000, ist.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getTime());
  }
}
