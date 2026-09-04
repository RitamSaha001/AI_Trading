import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createSignature,
  parseBinanceError,
  BinanceConnector,
  BinanceInvalidTimestampError,
  BinanceFilterFailureError,
  BinanceInsufficientBalanceError,
  BinanceInvalidApiKeyOrPermissionsError,
  BinanceWithdrawalPermissionError,
  BinanceApiError,
} from './binanceConnector';
import { ExchangeCredentials } from './keyVault';

describe('Binance Spot Connector & Private Data Stream', () => {
  const mockCreds: ExchangeCredentials = {
    apiKey: 'vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zvsw0MuIgwCIPy6utIco14y7Ju91duEh8A',
    apiSecret: 'NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j',
    environment: 'testnet',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates mathematically verified HMAC-SHA256 signatures matching official Binance API documentation test vectors', async () => {
    // Official Binance API documentation example test vector
    const secret = 'NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j';
    const queryString = 'symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559';
    const expectedSignature = 'c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71';

    const signature = await createSignature(queryString, secret);
    expect(signature).toBe(expectedSignature);
  });

  it('maps Binance error codes to typed, descriptive error classes', () => {
    expect(parseBinanceError(-1021, 'Timestamp outside recvWindow')).toBeInstanceOf(BinanceInvalidTimestampError);
    expect(parseBinanceError(-1013, 'Filter failure: MIN_NOTIONAL')).toBeInstanceOf(BinanceFilterFailureError);
    expect(parseBinanceError(-2010, 'Account has insufficient balance')).toBeInstanceOf(BinanceInsufficientBalanceError);
    expect(parseBinanceError(-2015, 'Invalid API-key, IP, or permissions')).toBeInstanceOf(BinanceInvalidApiKeyOrPermissionsError);
    expect(parseBinanceError(-9999, 'Unknown system error')).toBeInstanceOf(BinanceApiError);
  });

  it('calibrates local clock offset using GET /api/v3/time', async () => {
    const connector = new BinanceConnector(mockCreds, 'https://mock.binance.test');
    const mockServerTime = 1710000005000;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (String(url).includes('/api/v3/time')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ serverTime: mockServerTime }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    const now = 1710000000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const offset = await connector.syncTime();
    expect(offset).toBeGreaterThan(0);
    expect(connector.getTimestamp()).toBe(now + offset);
  });

  it('testConnection audits permissions and flags CRITICAL warning if canWithdraw is true', async () => {
    const connector = new BinanceConnector(mockCreds, 'https://mock.binance.test');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v3/time')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ serverTime: Date.now() }),
        } as any;
      }
      if (urlStr.includes('/api/v3/account')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            canTrade: true,
            canWithdraw: true, // DANGEROUS!
            canDeposit: true,
            permissions: ['SPOT'],
            balances: [
              { asset: 'USDT', free: '1000.50', locked: '0.00' },
              { asset: 'BTC', free: '0.05', locked: '0.00' },
            ],
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    const audit = await connector.testConnection();
    expect(audit.canTrade).toBe(true);
    expect(audit.canWithdraw).toBe(true);
    expect(audit.isSafe).toBe(false); // Must be flagged unsafe!
    expect(audit.securityWarning).toContain('CRITICAL SECURITY VIOLATION');
    expect(audit.securityBadge).toContain('HIGH RISK');
  });

  it('testConnection validates safe account when canWithdraw is false and canTrade is true', async () => {
    const connector = new BinanceConnector(mockCreds, 'https://mock.binance.test');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v3/time')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ serverTime: Date.now() }),
        } as any;
      }
      if (urlStr.includes('/api/v3/account')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            canTrade: true,
            canWithdraw: false, // SAFE!
            canDeposit: true,
            permissions: ['SPOT'],
            balances: [
              { asset: 'USDT', free: '15000.00', locked: '500.00' },
              { asset: 'BTC', free: '0.125', locked: '0.00' },
              { asset: 'ETH', free: '0.00', locked: '0.00' }, // Should be discarded
            ],
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    const audit = await connector.testConnection();
    expect(audit.isSafe).toBe(true);
    expect(audit.canWithdraw).toBe(false);
    expect(audit.canTrade).toBe(true);
    expect(audit.securityBadge).toContain('Trading: ENABLED | Withdrawals: DISABLED (Safe)');
    expect(audit.securityWarning).toBeUndefined();

    // Check balance filtering
    expect(audit.balances['USDT']).toEqual({ asset: 'USDT', free: 15000, locked: 500 });
    expect(audit.balances['BTC']).toEqual({ asset: 'BTC', free: 0.125, locked: 0 });
    expect(audit.balances['ETH']).toBeUndefined(); // Zero balance discarded
  });

  it('placeOrder correctly serializes parameters and headers for signed order placement', async () => {
    const connector = new BinanceConnector(mockCreds, 'https://mock.binance.test');
    let capturedUrl = '';
    let capturedHeaders: any = {};
    let capturedBody = '';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers;
      capturedBody = init?.body || '';

      if (capturedUrl.includes('/api/v3/time')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ serverTime: 1700000000000 }),
        } as any;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          symbol: 'BTCUSDT',
          orderId: 12345678,
          orderListId: -1,
          clientOrderId: 'test-order-1',
          price: '65000.00',
          origQty: '0.05',
          executedQty: '0.00',
          cummulativeQuoteQty: '0.00',
          status: 'NEW',
          timeInForce: 'GTC',
          type: 'LIMIT',
          side: 'BUY',
        }),
      } as any;
    });

    const order = await connector.placeOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 0.05,
      price: 65000,
      newClientOrderId: 'test-order-1',
    });

    expect(order.orderId).toBe(12345678);
    expect(order.status).toBe('NEW');
    expect(capturedHeaders['X-MBX-APIKEY']).toBe(mockCreds.apiKey);
    expect(capturedBody).toContain('symbol=BTCUSDT');
    expect(capturedBody).toContain('side=BUY');
    expect(capturedBody).toContain('type=LIMIT');
    expect(capturedBody).toContain('quantity=0.05');
    expect(capturedBody).toContain('price=65000');
    expect(capturedBody).toContain('signature=');
  });
});
