/**
 * Upstox API v2 HTTP Client & Wire Transport
 *
 * Implements server-side REST communication with Upstox API v2.
 * Enforces timeouts, normalizes errors into StandardBrokerError,
 * provides static-IP diagnostics, and supports pluggable transports for deterministic unit tests.
 */

import { config } from '../../../config';
import { StandardBrokerError } from '../brokerGateway';
import { BrokerErrorCode } from '../brokerTypes';
import {
  UpstoxApiResponse,
  UpstoxFundsData,
  UpstoxHoldingData,
  UpstoxOAuthTokenResponse,
  UpstoxOrderBookItem,
  UpstoxPlaceOrderPayload,
  UpstoxPositionData,
  UpstoxProfileData,
  UpstoxQuoteData,
  UpstoxTradeItem,
} from './upstoxTypes';

export type UpstoxTransport = (
  url: string,
  options: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  }
) => Promise<{ status: number; ok: boolean; json: () => Promise<any>; text: () => Promise<string> }>;

export class UpstoxClient {
  private static customTransport: UpstoxTransport | null = null;
  private static mockOutboundIp: string | null = null;

  public static setTransport(transport: UpstoxTransport | null): void {
    this.customTransport = transport;
  }

  public static setMockOutboundIp(ip: string | null): void {
    this.mockOutboundIp = ip;
  }

  public static resetForTesting(): void {
    this.customTransport = null;
    this.mockOutboundIp = null;
  }

  /**
   * Generates the OAuth 2.0 authorization dialog URL.
   * Executed strictly server-side; never leaks client secrets.
   */
  public static getAuthorizationUrl(state?: string): string {
    const clientId = config.UPSTOX_CLIENT_ID || '';
    const redirectUri = config.UPSTOX_REDIRECT_URI || '';
    const baseUrl = config.UPSTOX_API_BASE_URL.replace(/\/v2\/?$/, '');
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      ...(state ? { state } : {}),
    });
    return `${baseUrl}/v2/login/authorization/dialog?${query.toString()}`;
  }

  /**
   * Exchanges authorization code for access token via server-to-server POST.
   */
  public static async exchangeAuthorizationCode(
    code: string,
    redirectUri?: string
  ): Promise<UpstoxOAuthTokenResponse> {
    const clientId = config.UPSTOX_CLIENT_ID || '';
    const clientSecret = config.UPSTOX_CLIENT_SECRET || '';
    const rUri = redirectUri || config.UPSTOX_REDIRECT_URI || '';

    if (!clientId || !clientSecret) {
      throw new StandardBrokerError(
        'AUTHENTICATION_FAILED',
        'Upstox client credentials are not configured on server.',
        'upstox'
      );
    }

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: rUri,
      grant_type: 'authorization_code',
    });

    const res = await this.executeRaw(
      `${config.UPSTOX_API_BASE_URL}/login/authorization/token`,
      'POST',
      {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body.toString()
    );

    return res.data || res;
  }

  /**
   * Verifies that the outbound traffic originates from the registered static IP.
   */
  public static async checkOutboundIp(): Promise<{
    outboundIp: string | null;
    matchesRegistered: boolean;
    registeredIps: string[];
    error?: string;
  }> {
    const registered = [
      config.UPSTOX_STATIC_IP,
      config.UPSTOX_SECONDARY_STATIC_IP,
    ].filter(Boolean) as string[];

    if (this.mockOutboundIp) {
      const matches = registered.length === 0 || registered.includes(this.mockOutboundIp);
      return {
        outboundIp: this.mockOutboundIp,
        matchesRegistered: matches,
        registeredIps: registered,
      };
    }

    // If no static IP is configured, pass as unconstrained (dev/sandbox)
    if (registered.length === 0) {
      return {
        outboundIp: null,
        matchesRegistered: true,
        registeredIps: [],
      };
    }

    try {
      // In production, query an IP reflect check or resolve interface
      const res = await this.executeRaw('https://api.ipify.org?format=json', 'GET', { Accept: 'application/json' }, undefined, 3000);
      const outboundIp = res?.ip || null;
      const matches = Boolean(outboundIp && registered.includes(outboundIp));
      return {
        outboundIp,
        matchesRegistered: matches,
        registeredIps: registered,
      };
    } catch (err: any) {
      return {
        outboundIp: null,
        matchesRegistered: false,
        registeredIps: registered,
        error: `Failed to detect outbound IP: ${err.message}`,
      };
    }
  }

  /**
   * Fetches user profile data (/user/profile).
   */
  public static async getProfile(accessToken: string): Promise<UpstoxProfileData> {
    const res = await this.request<UpstoxProfileData>('/user/profile', 'GET', accessToken);
    return res.data!;
  }

  /**
   * Fetches user funds and margins (/user/get-funds-and-margin?segment=SEC).
   */
  public static async getFunds(accessToken: string): Promise<UpstoxFundsData> {
    const res = await this.request<UpstoxFundsData>('/user/get-funds-and-margin?segment=SEC', 'GET', accessToken);
    return res.data!;
  }

  /**
   * Fetches short-term positions (/portfolio/short-term-positions).
   */
  public static async getPositions(accessToken: string): Promise<UpstoxPositionData[]> {
    const res = await this.request<UpstoxPositionData[]>('/portfolio/short-term-positions', 'GET', accessToken);
    return res.data || [];
  }

  /**
   * Fetches long-term holdings (/portfolio/long-term-holdings).
   */
  public static async getHoldings(accessToken: string): Promise<UpstoxHoldingData[]> {
    const res = await this.request<UpstoxHoldingData[]>('/portfolio/long-term-holdings', 'GET', accessToken);
    return res.data || [];
  }

  /**
   * Places an order with Upstox (/order/place).
   */
  public static async placeOrder(
    accessToken: string,
    payload: UpstoxPlaceOrderPayload
  ): Promise<{ order_id: string }> {
    const res = await this.request<{ order_id: string }>('/order/place', 'POST', accessToken, payload);
    return res.data!;
  }

  /**
   * Cancels an order with Upstox (/order/cancel?order_id=...).
   */
  public static async cancelOrder(
    accessToken: string,
    orderId: string
  ): Promise<{ order_id: string }> {
    const query = new URLSearchParams({ order_id: orderId });
    const res = await this.request<{ order_id: string }>(`/order/cancel?${query.toString()}`, 'DELETE', accessToken);
    return res.data!;
  }

  /**
   * Retrieves all orders for the trading day (/order/retrieve-all).
   */
  public static async getOrderBook(accessToken: string): Promise<UpstoxOrderBookItem[]> {
    const res = await this.request<UpstoxOrderBookItem[]>('/order/retrieve-all', 'GET', accessToken);
    return res.data || [];
  }

  /**
   * Retrieves order history for a specific order (/order/history?order_id=...).
   */
  public static async getOrderHistory(
    accessToken: string,
    orderId: string
  ): Promise<UpstoxOrderBookItem[]> {
    const query = new URLSearchParams({ order_id: orderId });
    const res = await this.request<UpstoxOrderBookItem[]>(`/order/history?${query.toString()}`, 'GET', accessToken);
    return res.data || [];
  }

  /**
   * Retrieves trades for a specific order (/order/trades?order_id=...).
   */
  public static async getOrderTrades(
    accessToken: string,
    orderId: string
  ): Promise<UpstoxTradeItem[]> {
    const query = new URLSearchParams({ order_id: orderId });
    const res = await this.request<UpstoxTradeItem[]>(`/order/trades?${query.toString()}`, 'GET', accessToken);
    return res.data || [];
  }

  /**
   * Retrieves all trades for the trading day (/order/trades/get-trades-for-day).
   */
  public static async getTradesForDay(accessToken: string): Promise<UpstoxTradeItem[]> {
    const res = await this.request<UpstoxTradeItem[]>('/order/trades/get-trades-for-day', 'GET', accessToken);
    return res.data || [];
  }

  /**
   * Retrieves live quote (/market-quote/quotes?instrument_key=...).
   */
  public static async getQuote(
    accessToken: string,
    instrumentKey: string
  ): Promise<Record<string, UpstoxQuoteData>> {
    const query = new URLSearchParams({ instrument_key: instrumentKey });
    const res = await this.request<Record<string, UpstoxQuoteData>>(
      `/market-quote/quotes?${query.toString()}`,
      'GET',
      accessToken
    );
    return res.data || {};
  }

  /**
   * Core authenticated request wrapper with error normalization.
   */
  private static async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    accessToken: string,
    bodyPayload?: any,
    timeoutMs: number = 6000
  ): Promise<UpstoxApiResponse<T>> {
    if (!accessToken || !accessToken.trim()) {
      throw new StandardBrokerError(
        'AUTHENTICATION_FAILED',
        'Missing Upstox access token. User must authenticate.',
        'upstox'
      );
    }

    const url = endpoint.startsWith('http')
      ? endpoint
      : `${config.UPSTOX_API_BASE_URL.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken.trim()}`,
      Accept: 'application/json',
      'Api-Version': '2.0',
    };

    let bodyString: string | undefined;
    if (bodyPayload) {
      headers['Content-Type'] = 'application/json';
      bodyString = JSON.stringify(bodyPayload);
    }

    const data = await this.executeRaw(url, method, headers, bodyString, timeoutMs);
    return data as UpstoxApiResponse<T>;
  }

  /**
   * Low-level HTTP executor dispatching to customTransport or native fetch.
   */
  private static async executeRaw(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: string,
    timeoutMs: number = 6000
  ): Promise<any> {
    try {
      let status: number;
      let ok: boolean;
      let rawJson: any;

      if (this.customTransport) {
        const resp = await this.customTransport(url, { method, headers, body, timeoutMs });
        status = resp.status;
        ok = resp.ok;
        rawJson = await resp.json().catch(() => ({}));
      } else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const resp = await fetch(url, {
            method,
            headers,
            body,
            signal: controller.signal,
          });
          status = resp.status;
          ok = resp.ok;
          rawJson = await resp.json().catch(() => ({}));
        } finally {
          clearTimeout(timer);
        }
      }

      if (!ok) {
        this.handleHttpError(status, rawJson);
      }

      if (rawJson?.status === 'error') {
        this.handleProviderError(rawJson);
      }

      return rawJson;
    } catch (err: any) {
      if (err instanceof StandardBrokerError) {
        throw err;
      }
      this.handleNetworkError(err);
    }
  }

  /**
   * Maps HTTP 4xx/5xx responses to normalized StandardBrokerError.
   */
  private static handleHttpError(status: number, data: any): never {
    const errorDetail = data?.errors?.[0]?.message || data?.message || `HTTP ${status}`;
    const errorCodeRaw = data?.errors?.[0]?.errorCode || data?.errors?.[0]?.error_code || '';

    if (status === 401 || status === 403 || /token|unauthorized|auth/i.test(errorDetail)) {
      throw new StandardBrokerError(
        'AUTHENTICATION_FAILED',
        `Upstox authentication failed: ${errorDetail}`,
        'upstox',
        errorCodeRaw || status
      );
    }

    if (status === 429) {
      throw new StandardBrokerError(
        'RATE_LIMITED',
        `Upstox rate limit exceeded: ${errorDetail}`,
        'upstox',
        errorCodeRaw || status
      );
    }

    if (status === 404) {
      throw new StandardBrokerError(
        'ORDER_NOT_FOUND',
        `Resource or order not found on Upstox: ${errorDetail}`,
        'upstox',
        errorCodeRaw || status
      );
    }

    if (status >= 500) {
      throw new StandardBrokerError(
        'VENUE_DOWN',
        `Upstox exchange service unavailable: ${errorDetail}`,
        'upstox',
        errorCodeRaw || status
      );
    }

    // 400 Bad Request or business logic rejections
    this.handleProviderError(data);
  }

  /**
   * Maps Upstox UDAPI error codes to canonical BrokerErrorCode.
   */
  private static handleProviderError(data: any): never {
    const firstError = data?.errors?.[0];
    const message = firstError?.message || data?.message || 'Upstox rejected request';
    const code = firstError?.errorCode || firstError?.error_code || '';

    let normalizedCode: BrokerErrorCode = 'ORDER_REJECTED';

    if (/insufficient|funds|margin/i.test(message) || code === 'UDAPI100050') {
      normalizedCode = 'INSUFFICIENT_FUNDS';
    } else if (/rate limit|too many/i.test(message) || code === 'UDAPI100069') {
      normalizedCode = 'RATE_LIMITED';
    } else if (/market.*(closed|session)|outside trading hours/i.test(message) || code === 'UDAPI100057') {
      normalizedCode = 'MARKET_CLOSED';
    } else if (/not found/i.test(message) || code === 'UDAPI100054') {
      normalizedCode = 'ORDER_NOT_FOUND';
    } else if (/token|session expired|invalid auth/i.test(message) || code === 'UDAPI10001' || code === 'UDAPI10005') {
      normalizedCode = 'AUTHENTICATION_FAILED';
    }

    throw new StandardBrokerError(normalizedCode, message, 'upstox', code || undefined);
  }

  /**
   * Maps network timeouts, connection resets, and DNS failures.
   */
  private static handleNetworkError(err: any): never {
    const isTimeout = err.name === 'AbortError' || /timeout|timed out|ETIMEDOUT/i.test(err.message);
    const isConnRefused = /ECONNREFUSED|ECONNRESET|network/i.test(err.message);

    const code: BrokerErrorCode = isTimeout || isConnRefused ? 'NETWORK_ERROR' : 'UNKNOWN';
    throw new StandardBrokerError(
      code,
      `Upstox communication failure: ${err.message}`,
      'upstox',
      err.code || undefined
    );
  }
}
