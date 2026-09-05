/**
 * Upstox API v2 HTTP Client & Wire Transport
 *
 * Implements server-side REST communication with Upstox API v2.
 * Enforces timeouts, normalizes errors into StandardBrokerError,
 * provides static-IP diagnostics, and supports pluggable transports for deterministic unit tests.
 */

import crypto from 'crypto';
import { config } from '../../../config';
import { getDb } from '../../../db';
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

export type UpstoxIpDiagnosticStatus = 'PASS' | 'FAIL' | 'BYPASS_SANDBOX';

export interface UpstoxIpDiagnostic {
  status: UpstoxIpDiagnosticStatus;
  outboundIp: string | null;
  matchesRegistered: boolean;
  registeredIps: string[];
  isProduction: boolean;
  probedAt: number;
  error?: string;
}

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
    this.cachedIpDiagnostic = null;
  }

  private static cachedIpDiagnostic: { result: UpstoxIpDiagnostic; expiresAt: number } | null = null;

  /**
   * Generates the OAuth 2.0 authorization dialog URL.
   * Executed strictly server-side; never leaks client secrets.
   */
  public static getAuthorizationUrl(state: string, redirectUri?: string): string {
    const clientId = config.UPSTOX_CLIENT_ID || '';
    const rUri = redirectUri || config.UPSTOX_REDIRECT_URI || '';
    const baseUrl = config.UPSTOX_API_BASE_URL.replace(/\/v2\/?$/, '');
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: rUri,
      state,
    });
    return `${baseUrl}/v2/login/authorization/dialog?${query.toString()}`;
  }

  /**
   * Generates a cryptographically random OAuth state, persists it in broker_oauth_states,
   * and returns the authorization URL. Never accepts client-selected states.
   */
  public static async generateOAuthState(
    userId: string,
    redirectUri?: string
  ): Promise<{ state: string; authUrl: string; expiresAt: number }> {
    const state = crypto.randomBytes(32).toString('hex');
    const rUri = redirectUri || config.UPSTOX_REDIRECT_URI || '';
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes TTL

    const db = getDb();
    await db.execute(
      `INSERT INTO broker_oauth_states (id, user_id, broker, redirect_uri, expires_at, created_at)
       VALUES (?, ?, 'upstox', ?, ?, ?)`,
      [state, userId, rUri, expiresAt, now]
    );

    const authUrl = this.getAuthorizationUrl(state, rUri);
    return { state, authUrl, expiresAt };
  }

  /**
   * Validates and atomically consumes an OAuth state for an authenticated user.
   * Enforces single-use to prevent replay attacks and rejects expired states.
   */
  public static async validateAndConsumeOAuthState(
    userId: string,
    state: string
  ): Promise<{ valid: boolean; redirectUri?: string; reason?: string }> {
    if (!state || typeof state !== 'string' || !state.trim()) {
      return { valid: false, reason: 'Missing OAuth state token.' };
    }

    const db = getDb();
    const row = await db.queryOne<{
      id: string;
      user_id: string;
      expires_at: number | string;
      consumed_at: number | string | null;
      redirect_uri: string | null;
    }>(
      `SELECT * FROM broker_oauth_states WHERE id = ? AND user_id = ? AND broker = 'upstox'`,
      [state.trim(), userId]
    );

    if (!row) {
      return { valid: false, reason: 'Invalid or unrecognized OAuth state token.' };
    }

    if (row.consumed_at) {
      return { valid: false, reason: 'OAuth state token has already been consumed (replay attempt blocked).' };
    }

    const now = Date.now();
    if (Number(row.expires_at) < now) {
      return { valid: false, reason: 'OAuth state token has expired (exceeded 10-minute validity window).' };
    }

    // Atomically consume state
    const res = await db.execute(
      `UPDATE broker_oauth_states SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`,
      [now, state.trim()]
    );

    const affected = (res as any)?.changes ?? (res as any)?.rowCount ?? 1;
    if (affected === 0) {
      return { valid: false, reason: 'Concurrent state consumption conflict.' };
    }

    return { valid: true, redirectUri: row.redirect_uri || undefined };
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
   * Probes outbound public IP and evaluates semantic match against registered static IPs.
   * Returns PASS, FAIL, or BYPASS_SANDBOX with a 60-second in-memory cache.
   */
  public static async checkOutboundIp(forceRefresh = false): Promise<UpstoxIpDiagnostic> {
    const now = Date.now();
    if (!forceRefresh && this.cachedIpDiagnostic && this.cachedIpDiagnostic.expiresAt > now) {
      return this.cachedIpDiagnostic.result;
    }

    const registered = [
      config.UPSTOX_STATIC_IP,
      config.UPSTOX_SECONDARY_STATIC_IP,
    ].filter(Boolean) as string[];

    const isProduction = config.NODE_ENV === 'production' || Boolean(config.UPSTOX_LIVE_TRADING_ENABLED);

    if (this.mockOutboundIp) {
      const matches = registered.length === 0 || registered.includes(this.mockOutboundIp);
      const result: UpstoxIpDiagnostic = {
        status: matches ? (registered.length > 0 ? 'PASS' : 'BYPASS_SANDBOX') : 'FAIL',
        outboundIp: this.mockOutboundIp,
        matchesRegistered: matches,
        registeredIps: registered,
        isProduction,
        probedAt: now,
        error: !matches
          ? `Detected outbound egress IP (${this.mockOutboundIp}) does not match registered static IPs [${registered.join(', ')}].`
          : undefined,
      };
      return result;
    }

    // If no static IP is configured:
    if (registered.length === 0) {
      const isHardFail = config.NODE_ENV === 'production';
      const result: UpstoxIpDiagnostic = {
        status: isHardFail ? 'FAIL' : 'BYPASS_SANDBOX',
        outboundIp: null,
        matchesRegistered: !isHardFail,
        registeredIps: [],
        isProduction,
        probedAt: now,
        error: isHardFail ? 'UPSTOX_STATIC_IP must be configured in production.' : undefined,
      };
      return result;
    }

    try {
      let outboundIp: string | null = null;
      try {
        const res = await this.executeRaw('https://api.ipify.org?format=json', 'GET', { Accept: 'application/json' }, undefined, 3000);
        outboundIp = res?.ip || null;
      } catch {
        const res2 = await this.executeRaw('https://icanhazip.com', 'GET', { Accept: 'text/plain' }, undefined, 3000);
        outboundIp = typeof res2 === 'string' ? res2.trim() : (res2?.ip || null);
      }

      const matches = Boolean(outboundIp && registered.includes(outboundIp));
      const result: UpstoxIpDiagnostic = {
        status: matches ? 'PASS' : 'FAIL',
        outboundIp,
        matchesRegistered: matches,
        registeredIps: registered,
        isProduction,
        probedAt: now,
        error: !matches
          ? `Detected outbound egress IP (${outboundIp || 'unknown'}) does not match registered static IPs [${registered.join(', ')}].`
          : undefined,
      };

      this.cachedIpDiagnostic = { result, expiresAt: now + 60 * 1000 };
      return result;
    } catch (err: any) {
      const result: UpstoxIpDiagnostic = {
        status: 'FAIL',
        outboundIp: null,
        matchesRegistered: false,
        registeredIps: registered,
        isProduction,
        probedAt: now,
        error: `Failed to detect outbound IP: ${err.message}`,
      };
      return result;
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
