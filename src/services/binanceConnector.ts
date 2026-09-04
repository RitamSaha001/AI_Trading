/**
 * Binance Spot Connector & Private User Stream
 *
 * Supports Binance Testnet and Mainnet with:
 * - Cryptographic HMAC-SHA256 request signing
 * - Clock synchronization via GET /api/v3/time (prevents -1021 INVALID_TIMESTAMP)
 * - Automated Security & Withdrawal permission audit (Strict safety: canWithdraw === false)
 * - REST methods: account balances, open orders, place order, cancel order
 * - WebSocket user data stream (listenKey acquisition, 30-min keepalive, balance/fill events)
 * - Typed errors mapping official Binance error codes
 */

import { ExchangeCredentials, ExchangeEnvironment } from './keyVault';

export interface BinanceAccountBalance {
  asset: string;
  free: number;
  locked: number;
}

export interface BinanceAccountAudit {
  connected: boolean;
  environment: ExchangeEnvironment;
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  permissions: string[];
  isSafe: boolean;
  securityBadge: string;
  securityWarning?: string;
  balances: Record<string, BinanceAccountBalance>;
  latencyMs: number;
}

export interface BinanceOrder {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  transactTime?: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string; // 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'REJECTED' | 'EXPIRED'
  timeInForce: string; // 'GTC' | 'IOC' | 'FOK'
  type: string; // 'LIMIT' | 'MARKET' | 'STOP_LOSS_LIMIT'
  side: string; // 'BUY' | 'SELL'
  stopPrice?: string;
  time?: number;
  updateTime?: number;
}

export interface PlaceOrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET' | 'STOP_LOSS_LIMIT';
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  newClientOrderId?: string;
}

export interface UserStreamHandlers {
  onBalanceUpdate?: (balances: Record<string, BinanceAccountBalance>) => void;
  onExecutionReport?: (report: {
    symbol: string;
    orderId: number;
    clientOrderId: string;
    side: string;
    orderType: string;
    orderStatus: string;
    origQty: number;
    executedQty: number;
    lastPrice: number;
    commission?: number;
  }) => void;
  onError?: (err: Error) => void;
}

// Typed Errors
export class BinanceApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(`[Binance Error ${code}] ${message}`);
    this.name = 'BinanceApiError';
    this.code = code;
  }
}

export class BinanceInvalidTimestampError extends BinanceApiError {
  constructor(msg = 'Timestamp for this request was 1000ms ahead, behind, or outside recvWindow') {
    super(-1021, msg);
    this.name = 'BinanceInvalidTimestampError';
  }
}

export class BinanceFilterFailureError extends BinanceApiError {
  constructor(msg = 'Filter failure: order rejected due to price, lot size, or minimum notional limit') {
    super(-1013, msg);
    this.name = 'BinanceFilterFailureError';
  }
}

export class BinanceInsufficientBalanceError extends BinanceApiError {
  constructor(msg = 'Account has insufficient balance for requested action') {
    super(-2010, msg);
    this.name = 'BinanceInsufficientBalanceError';
  }
}

export class BinanceInvalidApiKeyOrPermissionsError extends BinanceApiError {
  constructor(msg = 'Invalid API-key, IP, or permissions for action') {
    super(-2015, msg);
    this.name = 'BinanceInvalidApiKeyOrPermissionsError';
  }
}

export class BinanceWithdrawalPermissionError extends Error {
  constructor(msg = 'CRITICAL SECURITY VIOLATION: API Key has withdrawal permissions enabled! Refusing live trading authorization. Restrict API key to Trading only on Binance.') {
    super(msg);
    this.name = 'BinanceWithdrawalPermissionError';
  }
}

export class BinanceNetworkError extends Error {
  constructor(msg: string) {
    super(`Binance network error: ${msg}`);
    this.name = 'BinanceNetworkError';
  }
}

/**
 * Creates HMAC-SHA256 signature matching Binance specification.
 */
export async function createSignature(queryString: string, apiSecret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(apiSecret);
  const dataBytes = encoder.encode(queryString);

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, dataBytes);
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function parseBinanceError(code: number, msg: string): BinanceApiError {
  switch (code) {
    case -1021:
      return new BinanceInvalidTimestampError(msg);
    case -1013:
      return new BinanceFilterFailureError(msg);
    case -2010:
      return new BinanceInsufficientBalanceError(msg);
    case -2015:
      return new BinanceInvalidApiKeyOrPermissionsError(msg);
    default:
      return new BinanceApiError(code, msg);
  }
}

export class BinanceConnector {
  private credentials: ExchangeCredentials;
  private serverTimeOffset: number = 0; // serverTime - localTime
  private lastTimeSync: number = 0;
  private customBaseUrl?: string;

  constructor(credentials: ExchangeCredentials, customBaseUrl?: string) {
    this.credentials = credentials;
    this.customBaseUrl = customBaseUrl;
  }

  public getEnvironment(): ExchangeEnvironment {
    return this.credentials.environment;
  }

  public getBaseUrl(): string {
    if (this.customBaseUrl) return this.customBaseUrl;
    const env = this.credentials.environment;
    // If in browser on localhost, use Vite proxy to avoid CORS
    if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
      return env === 'testnet' ? '/api/binance-testnet' : '/api/binance-mainnet';
    }
    return env === 'testnet' ? 'https://testnet.binance.vision' : 'https://api.binance.com';
  }

  public getWsBaseUrl(): string {
    const env = this.credentials.environment;
    return env === 'testnet'
      ? 'wss://stream.testnet.binance.vision/ws'
      : 'wss://stream.binance.com:9443/ws';
  }

  /**
   * Synchronizes local clock with Binance server clock using GET /api/v3/time.
   */
  public async syncTime(): Promise<number> {
    const t0 = Date.now();
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/v3/time`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = (await res.json()) as { serverTime: number };
      const roundTrip = Date.now() - t0;
      // Offset accounting for 1/2 round trip latency
      this.serverTimeOffset = Math.round(data.serverTime - (t0 + roundTrip / 2));
      this.lastTimeSync = Date.now();
      return this.serverTimeOffset;
    } catch (err: any) {
      throw new BinanceNetworkError(`Failed to sync server time: ${err?.message || err}`);
    }
  }

  public getServerTimeOffset(): number {
    return this.serverTimeOffset;
  }

  public setServerTimeOffset(offset: number): void {
    this.serverTimeOffset = offset;
  }

  /**
   * Returns current calibrated timestamp.
   */
  public getTimestamp(): number {
    return Date.now() + this.serverTimeOffset;
  }

  /**
   * Performs an authenticated signed Binance request.
   */
  private async signedRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' | 'PUT',
    params: Record<string, string | number | boolean | undefined> = {}
  ): Promise<T> {
    // If clock has never been synced or older than 10 minutes, sync time
    if (this.lastTimeSync === 0 || Date.now() - this.lastTimeSync > 10 * 60 * 1000) {
      try {
        await this.syncTime();
      } catch (e) {
        // Continue if sync fails, will fail with -1021 if drift is large
      }
    }

    const cleanParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) {
        cleanParams[k] = String(v);
      }
    }

    cleanParams.timestamp = String(this.getTimestamp());
    cleanParams.recvWindow = '5000';

    const searchParams = new URLSearchParams(cleanParams);
    const queryString = searchParams.toString();
    const signature = await createSignature(queryString, this.credentials.apiSecret);
    const fullQuery = `${queryString}&signature=${signature}`;

    const url = `${this.getBaseUrl()}${endpoint}${method === 'GET' || method === 'DELETE' ? `?${fullQuery}` : ''}`;

    const headers: Record<string, string> = {
      'X-MBX-APIKEY': this.credentials.apiKey,
    };

    let body: string | undefined = undefined;
    if (method === 'POST' || method === 'PUT') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = fullQuery;
    }

    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
      });

      const responseJson = await res.json();

      if (!res.ok) {
        const code = typeof responseJson.code === 'number' ? responseJson.code : -9999;
        const msg = responseJson.msg || res.statusText;
        throw parseBinanceError(code, msg);
      }

      return responseJson as T;
    } catch (err: any) {
      if (err instanceof BinanceApiError || err instanceof BinanceWithdrawalPermissionError) {
        throw err;
      }
      throw new BinanceNetworkError(err?.message || String(err));
    }
  }

  /**
   * Performs an automated security & permissions audit of the API credentials.
   * STRICT SAFETY ENFORCEMENT:
   * If canWithdraw === true, flags an immediate critical warning and disables safety authorization!
   */
  public async testConnection(): Promise<BinanceAccountAudit> {
    const t0 = Date.now();
    await this.syncTime();
    const latencyMs = Date.now() - t0;

    const rawAccount = await this.signedRequest<any>('/api/v3/account', 'GET');

    const canTrade = Boolean(rawAccount.canTrade);
    const canWithdraw = Boolean(rawAccount.canWithdraw);
    const canDeposit = Boolean(rawAccount.canDeposit);
    const permissions: string[] = Array.isArray(rawAccount.permissions) ? rawAccount.permissions : [];

    const balances: Record<string, BinanceAccountBalance> = {};
    if (Array.isArray(rawAccount.balances)) {
      for (const b of rawAccount.balances) {
        const free = parseFloat(b.free);
        const locked = parseFloat(b.locked);
        if (free > 0 || locked > 0) {
          balances[b.asset] = {
            asset: b.asset,
            free,
            locked,
          };
        }
      }
    }

    // Safety Audit evaluation
    let isSafe = true;
    let securityBadge = '🛡️ Trading: ENABLED | Withdrawals: DISABLED (Safe)';
    let securityWarning: string | undefined = undefined;

    if (canWithdraw) {
      isSafe = false;
      securityBadge = '🚨 HIGH RISK: Withdrawals Enabled';
      securityWarning =
        'CRITICAL SECURITY VIOLATION: API Key has withdrawal permissions enabled! Refusing live trading authorization. Restrict API key to Trading only on Binance.';
    } else if (!canTrade) {
      isSafe = false;
      securityBadge = '⚠️ Trading Disabled';
      securityWarning = 'Trading permission is disabled on this API key. Enable Spot & Margin Trading in Binance API Management.';
    }

    return {
      connected: true,
      environment: this.credentials.environment,
      canTrade,
      canWithdraw,
      canDeposit,
      permissions,
      isSafe,
      securityBadge,
      securityWarning,
      balances,
      latencyMs,
    };
  }

  /**
   * Fetches parsed positive account balances from GET /api/v3/account.
   */
  public async fetchAccountBalances(): Promise<Record<string, BinanceAccountBalance>> {
    const rawAccount = await this.signedRequest<any>('/api/v3/account', 'GET');
    const result: Record<string, BinanceAccountBalance> = {};
    if (Array.isArray(rawAccount.balances)) {
      for (const b of rawAccount.balances) {
        const free = parseFloat(b.free);
        const locked = parseFloat(b.locked);
        if (free > 0 || locked > 0) {
          result[b.asset] = {
            asset: b.asset,
            free,
            locked,
          };
        }
      }
    }
    return result;
  }

  /**
   * Fetches open orders for symbol or all symbols from GET /api/v3/openOrders.
   */
  public async fetchOpenOrders(symbol?: string): Promise<BinanceOrder[]> {
    const params = symbol ? { symbol } : {};
    return this.signedRequest<BinanceOrder[]>('/api/v3/openOrders', 'GET', params);
  }

  /**
   * Places a validated order on Binance Spot.
   */
  public async placeOrder(req: PlaceOrderRequest): Promise<BinanceOrder> {
    const params: Record<string, string | number | undefined> = {
      symbol: req.symbol,
      side: req.side,
      type: req.type,
      quantity: req.quantity,
    };

    if (req.type === 'LIMIT') {
      if (req.price === undefined) throw new Error('Price is required for LIMIT order');
      params.price = req.price;
      params.timeInForce = req.timeInForce || 'GTC';
    } else if (req.type === 'STOP_LOSS_LIMIT') {
      if (req.price === undefined || req.stopPrice === undefined) {
        throw new Error('Price and stopPrice are required for STOP_LOSS_LIMIT order');
      }
      params.price = req.price;
      params.stopPrice = req.stopPrice;
      params.timeInForce = req.timeInForce || 'GTC';
    }

    if (req.newClientOrderId) {
      params.newClientOrderId = req.newClientOrderId;
    }

    return this.signedRequest<BinanceOrder>('/api/v3/order', 'POST', params);
  }

  /**
   * Cancels an order on Binance Spot.
   */
  public async cancelOrder(symbol: string, orderId: number | string): Promise<any> {
    return this.signedRequest<any>('/api/v3/order', 'DELETE', {
      symbol,
      orderId,
    });
  }

  /**
   * Acquires a new listenKey for private WebSocket user data stream.
   */
  public async startUserDataStream(): Promise<string> {
    const url = `${this.getBaseUrl()}/api/v3/userDataStream`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': this.credentials.apiKey,
      },
    });
    if (!res.ok) {
      throw new BinanceNetworkError(`Failed to acquire listenKey: ${res.statusText}`);
    }
    const data = (await res.json()) as { listenKey: string };
    return data.listenKey;
  }

  /**
   * Sends 30-minute keepalive ping for userDataStream listenKey.
   */
  public async keepAliveUserDataStream(listenKey: string): Promise<void> {
    const url = `${this.getBaseUrl()}/api/v3/userDataStream?listenKey=${encodeURIComponent(listenKey)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'X-MBX-APIKEY': this.credentials.apiKey,
      },
    });
    if (!res.ok) {
      throw new BinanceNetworkError(`Failed to keepalive listenKey: ${res.statusText}`);
    }
  }

  /**
   * Closes the userDataStream listenKey.
   */
  public async closeUserDataStream(listenKey: string): Promise<void> {
    const url = `${this.getBaseUrl()}/api/v3/userDataStream?listenKey=${encodeURIComponent(listenKey)}`;
    await fetch(url, {
      method: 'DELETE',
      headers: {
        'X-MBX-APIKEY': this.credentials.apiKey,
      },
    }).catch(() => {});
  }

  /**
   * Connects to private WebSocket user data stream for real-time balance & order fills.
   * Returns a cleanup / disconnect function.
   */
  public connectUserStream(listenKey: string, handlers: UserStreamHandlers): () => void {
    if (typeof WebSocket === 'undefined') {
      return () => {};
    }

    const wsUrl = `${this.getWsBaseUrl()}/${listenKey}`;
    let ws: WebSocket | null = null;
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    try {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const eventType = msg.e;

          // outboundAccountPosition: Balance updates
          if (eventType === 'outboundAccountPosition') {
            const balances: Record<string, BinanceAccountBalance> = {};
            if (Array.isArray(msg.B)) {
              for (const item of msg.B) {
                const asset = item.a;
                const free = parseFloat(item.f);
                const locked = parseFloat(item.l);
                balances[asset] = { asset, free, locked };
              }
            }
            handlers.onBalanceUpdate?.(balances);
          }

          // executionReport: Order lifecycle events
          if (eventType === 'executionReport') {
            handlers.onExecutionReport?.({
              symbol: msg.s,
              orderId: msg.i,
              clientOrderId: msg.c,
              side: msg.S,
              orderType: msg.o,
              orderStatus: msg.X,
              origQty: parseFloat(msg.q),
              executedQty: parseFloat(msg.z),
              lastPrice: parseFloat(msg.L || '0'),
              commission: msg.n ? parseFloat(msg.n) : undefined,
            });
          }
        } catch (err: any) {
          handlers.onError?.(err);
        }
      };

      ws.onerror = (event) => {
        handlers.onError?.(new Error('Binance WebSocket error'));
      };

      // Set 30-minute keepalive timer
      keepAliveTimer = setInterval(() => {
        if (!closed) {
          this.keepAliveUserDataStream(listenKey).catch((err) => {
            handlers.onError?.(err);
          });
        }
      }, 30 * 60 * 1000);
    } catch (err: any) {
      handlers.onError?.(err);
    }

    // Return disconnect function
    return () => {
      closed = true;
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (ws) {
        try {
          ws.close();
        } catch {}
      }
      this.closeUserDataStream(listenKey).catch(() => {});
    };
  }
}
