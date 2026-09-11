import { StandardBrokerError } from '../brokerGateway';

export interface KotakNeoSession {
  consumerKey: string;
  sessionToken: string;
  sid: string;
  ucc: string;
}

export type KotakNeoTransport = (
  url: string,
  options: { method: string; headers: Record<string, string>; body?: string; timeoutMs?: number },
) => Promise<{ ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string> }>;

class KotakNeoRateLimiter {
  private static requestTimestamps: number[] = [];
  private static orderTimestamps: number[] = [];

  static async throttle(isOrder = false): Promise<void> {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter((timestamp) => now - timestamp < 1_000);
    this.orderTimestamps = this.orderTimestamps.filter((timestamp) => now - timestamp < 1_000);
    const limit = isOrder ? this.orderTimestamps : this.requestTimestamps;
    if (limit.length >= 10) {
      throw new StandardBrokerError('Kotak Neo API rate limit reached; retry after one second.', {
        code: 'RATE_LIMITED', category: 'RATE_LIMITED', retryable: true,
      });
    }
    this.requestTimestamps.push(now);
    if (isOrder) this.orderTimestamps.push(now);
  }

  static resetForTesting(): void {
    this.requestTimestamps = [];
    this.orderTimestamps = [];
  }
}

export class KotakNeoClient {
  private static transport: KotakNeoTransport | null = null;
  private static readonly baseUrl = 'https://mis.kotaksecurities.com';

  static setTransport(transport: KotakNeoTransport | null): void { this.transport = transport; }
  static resetForTesting(): void { this.transport = null; KotakNeoRateLimiter.resetForTesting(); }

  static async getLimits(session: KotakNeoSession): Promise<any> {
    return this.request('quick/user/limits', session, 'GET');
  }

  static async getPositions(session: KotakNeoSession): Promise<any> {
    return this.request('quick/user/positions', session, 'GET');
  }

  static async getHoldings(session: KotakNeoSession): Promise<any> {
    return this.request('portfolio/v1/holdings', session, 'GET');
  }

  static async getOrders(session: KotakNeoSession): Promise<any> {
    return this.request('quick/user/orders', session, 'GET');
  }

  static async getTrades(session: KotakNeoSession): Promise<any> {
    return this.request('quick/user/trades', session, 'GET');
  }

  static async getScripMasterFilePaths(session: KotakNeoSession): Promise<any> {
    return this.request('script-details/1.0/masterscrip/file-paths', session, 'GET');
  }

  static async placeOrder(session: KotakNeoSession, payload: Record<string, string>): Promise<any> {
    return this.request('quick/order/rule/ms/place', session, 'POST', payload, true);
  }

  static async modifyOrder(session: KotakNeoSession, payload: Record<string, string>): Promise<any> {
    return this.request('quick/order/vr/modify', session, 'POST', payload, true);
  }

  static async cancelOrder(session: KotakNeoSession, orderId: string): Promise<any> {
    return this.request('quick/order/cancel', session, 'POST', { on: orderId, am: 'NO' }, true);
  }

  private static async request(
    endpoint: string,
    session: KotakNeoSession,
    method: 'GET' | 'POST',
    body?: Record<string, string>,
    isOrder = false,
  ): Promise<any> {
    await KotakNeoRateLimiter.throttle(isOrder);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await (this.transport || ((url, options) => fetch(url, { ...options, signal: controller.signal }) as any))(
        `${this.baseUrl}/${endpoint}`,
        {
          method,
          headers: {
            Authorization: session.consumerKey,
            Sid: session.sid,
            Auth: session.sessionToken,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body ? new URLSearchParams(body).toString() : undefined,
          timeoutMs: 10_000,
        },
      );
      const data = await response.json().catch(async () => ({ message: await response.text() }));
      if (!response.ok || data?.stat === 'Not_Ok' || data?.error || data?.errMsg) {
        throw new StandardBrokerError(data?.errMsg || data?.message || 'Kotak Neo request was rejected.', {
          code: response.status === 401 ? 'AUTHENTICATION_FAILED' : 'BROKER_REJECTED',
          category: response.status === 401 ? 'AUTH_FAILED' : 'REJECTED',
          retryable: response.status >= 500,
          raw: data,
        });
      }
      return data;
    } catch (error) {
      if (error instanceof StandardBrokerError) throw error;
      throw new StandardBrokerError('Kotak Neo network request failed.', {
        code: 'NETWORK_ERROR', category: 'NETWORK_TIMEOUT', retryable: true, raw: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
