import { StandardBrokerError } from '../brokerGateway';

export interface FlattradeSession {
  accessToken: string;
  userId: string;
  accountId: string;
}

export type FlattradeTransport = (
  url: string,
  options: { method: string; headers: Record<string, string>; body?: string; timeoutMs?: number },
) => Promise<{ ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string> }>;

class FlattradeRateLimiter {
  private static api: number[] = [];
  private static orders: number[] = [];

  static async throttle(isOrder = false): Promise<void> {
    const now = Date.now();
    this.api = this.api.filter((timestamp) => now - timestamp < 1_000);
    this.orders = this.orders.filter((timestamp) => now - timestamp < 60_000);
    const ordersInLastSecond = this.orders.filter((timestamp) => now - timestamp < 1_000).length;
    if (this.api.length >= 40 || (isOrder && (ordersInLastSecond >= 10 || this.orders.length >= 40))) {
      throw new StandardBrokerError('Flattrade API rate limit reached; request deferred.', {
        code: 'RATE_LIMITED', category: 'RATE_LIMITED', retryable: true,
      });
    }
    this.api.push(now);
    if (isOrder) this.orders.push(now);
  }

  static resetForTesting(): void { this.api = []; this.orders = []; }
}

export class FlattradeClient {
  private static transport: FlattradeTransport | null = null;
  private static readonly baseUrl = 'https://piconnect.flattrade.in/PiConnectAPI';

  static setTransport(transport: FlattradeTransport | null): void { this.transport = transport; }
  static resetForTesting(): void { this.transport = null; FlattradeRateLimiter.resetForTesting(); }

  static getLimits(session: FlattradeSession): Promise<any> { return this.request('Limits', session, {}); }
  static getHoldings(session: FlattradeSession): Promise<any> { return this.request('Holdings', session, {}); }
  static getPositions(session: FlattradeSession): Promise<any> { return this.request('PositionBook', session, {}); }
  static getOrders(session: FlattradeSession): Promise<any> { return this.request('OrderBook', session, {}); }
  static getTrades(session: FlattradeSession): Promise<any> { return this.request('TradeBook', session, {}); }
  static getSingleOrderHistory(session: FlattradeSession, orderId: string): Promise<any> {
    return this.request('SingleOrdHist', session, { norenordno: orderId });
  }
  static getMultiLegOrders(session: FlattradeSession): Promise<any> { return this.request('MultiLegOrderBook', session, {}); }
  static getPendingGttOrders(session: FlattradeSession): Promise<any> { return this.request('GetPendingGTTOrder', session, {}); }
  static getEnabledGtts(session: FlattradeSession): Promise<any> { return this.request('GetEnabledGTTs', session, {}); }
  static searchScrip(session: FlattradeSession, exchange: string, searchText: string): Promise<any> {
    return this.request('SearchScrip', session, { exch: exchange, stext: searchText });
  }
  static getQuotes(session: FlattradeSession, exchange: string, token: string): Promise<any> {
    return this.request('GetQuotes', session, { exch: exchange, token });
  }
  static getTimePriceData(
    session: FlattradeSession,
    exchange: string,
    token: string,
    startTimeSeconds: number,
    endTimeSeconds: number,
    intervalMinutes: number,
  ): Promise<any> {
    return this.request('TPSeries', session, {
      exch: exchange,
      token,
      st: String(startTimeSeconds),
      et: String(endTimeSeconds),
      intrv: String(intervalMinutes),
    });
  }
  static getEodChartData(session: FlattradeSession, symbol: string, fromDate: string, toDate: string): Promise<any> {
    return this.request('EODChartData', session, { sym: symbol, from: fromDate, to: toDate });
  }
  static getOptionChain(session: FlattradeSession, exchange: string, symbol: string, strikePrice: string, count = 5): Promise<any> {
    return this.request('GetOptionChain', session, { exch: exchange, tsym: symbol, strprc: strikePrice, cnt: String(count) });
  }
  static getOptionGreek(
    session: FlattradeSession,
    input: { expiryDate: string; strikePrice: string; spotPrice: string; interestRate: string; volatility: string; optionType: 'CE' | 'PE' },
  ): Promise<any> {
    return this.request('GetOptionGreek', session, {
      exd: input.expiryDate,
      strprc: input.strikePrice,
      sptprc: input.spotPrice,
      int_rate: input.interestRate,
      volatility: input.volatility,
      optt: input.optionType,
    });
  }
  static getOrderMargin(session: FlattradeSession, input: Record<string, string>): Promise<any> {
    return this.request('GetOrderMargin', session, input);
  }
  static getBasketMargin(session: FlattradeSession, input: Record<string, string>): Promise<any> {
    return this.request('GetBasketMargin', session, input);
  }
  static placeOrder(session: FlattradeSession, data: Record<string, string>): Promise<any> { return this.request('PlaceOrder', session, data, true); }
  static modifyOrder(session: FlattradeSession, data: Record<string, string>): Promise<any> { return this.request('ModifyOrder', session, data, true); }
  static cancelOrder(session: FlattradeSession, orderId: string): Promise<any> { return this.request('CancelOrder', session, { norenordno: orderId }, true); }

  private static async request(endpoint: string, session: FlattradeSession, values: Record<string, string>, isOrder = false): Promise<any> {
    await FlattradeRateLimiter.throttle(isOrder);
    const payload = { uid: session.userId, actid: session.accountId, ...values };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await (this.transport || ((url, options) => fetch(url, { ...options, signal: controller.signal }) as any))(
        `${this.baseUrl}/${endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ jData: JSON.stringify(payload), jKey: session.accessToken }).toString(),
          timeoutMs: 10_000,
        },
      );
      const data = await response.json().catch(async () => ({ message: await response.text() }));
      if (!response.ok || data?.stat === 'Not_Ok' || data?.emsg) {
        throw new StandardBrokerError(data?.emsg || data?.message || 'Flattrade request was rejected.', {
          code: /session|token|auth/i.test(String(data?.emsg || '')) ? 'AUTHENTICATION_FAILED' : 'BROKER_REJECTED',
          category: /session|token|auth/i.test(String(data?.emsg || '')) ? 'AUTH_FAILED' : 'REJECTED',
          retryable: response.status >= 500,
          raw: data,
        });
      }
      return data;
    } catch (error) {
      if (error instanceof StandardBrokerError) throw error;
      throw new StandardBrokerError('Flattrade network request failed.', {
        code: 'NETWORK_ERROR', category: 'NETWORK_TIMEOUT', retryable: true, raw: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
