/**
 * Architecture & Real-Money Safety Boundary Tests
 *
 * Enforces architectural invariants:
 * 1. LIVE_TRADING_ENABLED & UPSTOX_LIVE_TRADING_ENABLED remain false by default.
 * 2. Read-only diagnostics, market data, and OAuth flows are structurally incapable of placing orders.
 * 3. Only the explicit placeOrder execution pipeline can ever invoke broker order submission.
 * 4. Zero real orders can be submitted during automated test execution.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { config } from '../config';
import { UpstoxClient } from '../services/brokers/upstox/upstoxClient';
import { UpstoxAdapter } from '../services/brokers/upstox/upstoxAdapter';
import { UpstoxConnectivityValidator } from '../services/brokers/upstox/upstoxConnectivityValidator';

describe('Architecture & Real-Money Safety Boundary Invariants', () => {
  let placeOrderSpy: any;

  beforeEach(() => {
    UpstoxClient.resetForTesting();
    placeOrderSpy = vi.spyOn(UpstoxClient, 'placeOrder');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    UpstoxClient.resetForTesting();
  });

  it('Invariant 1: live trading safety gate is locked by default', () => {
    expect(config.UPSTOX_LIVE_TRADING_ENABLED).toBe(false);
  });

  it('Invariant 2: UpstoxConnectivityValidator is structurally incapable of placing orders', async () => {
    // Setup mock transport to return valid read-only responses
    UpstoxClient.setTransport(async (url) => {
      if (url.includes('/user/profile')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ status: 'success', data: { user_id: 'TEST_UCC', user_name: 'Test', is_active: true } }),
          text: async () => '',
        };
      }
      if (url.includes('/user/get-funds-and-margin')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ status: 'success', data: { equity: { available_margin: 10000, used_margin: 0 } } }),
          text: async () => '',
        };
      }
      if (url.includes('/portfolio/short-term-positions')) {
        return { status: 200, ok: true, json: async () => ({ status: 'success', data: [] }), text: async () => '' };
      }
      if (url.includes('/portfolio/long-term-holdings')) {
        return { status: 200, ok: true, json: async () => ({ status: 'success', data: [] }), text: async () => '' };
      }
      if (url.includes('/order/retrieve-all')) {
        return { status: 200, ok: true, json: async () => ({ status: 'success', data: [] }), text: async () => '' };
      }
      if (url.includes('/order/trades/get-trades-for-day')) {
        return { status: 200, ok: true, json: async () => ({ status: 'success', data: [] }), text: async () => '' };
      }
      if (url.includes('/market-quote/quotes')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            status: 'success',
            data: { 'NSE_EQ|INE002A01018': { last_price: 2950.0, volume: 1000 } },
          }),
          text: async () => '',
        };
      }
      if (url.includes('/user/ip')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ status: 'success', data: { primary_ip: '198.51.100.1' } }),
          text: async () => '',
        };
      }
      return { status: 404, ok: false, json: async () => ({}), text: async () => '' };
    });

    UpstoxClient.setMockOutboundIp('198.51.100.1');

    const report = await UpstoxConnectivityValidator.runDiagnostics(undefined, 'mock_test_token_123');
    expect(report.checks.length).toBe(11);

    // CRITICAL: verify zero order placement calls were invoked during entire validation run
    expect(placeOrderSpy).not.toHaveBeenCalled();
  });

  it('Invariant 3: market data query cannot place orders', async () => {
    UpstoxClient.setTransport(async (url) => {
      if (url.includes('/market-quote/quotes')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            status: 'success',
            data: { 'NSE_EQ|INE002A01018': { last_price: 2950.0 } },
          }),
          text: async () => '',
        };
      }
      return { status: 404, ok: false, json: async () => ({}), text: async () => '' };
    });

    const quote = await UpstoxClient.getQuote('mock_token', 'NSE_EQ|INE002A01018');
    expect(quote['NSE_EQ|INE002A01018'].last_price).toBe(2950.0);
    expect(placeOrderSpy).not.toHaveBeenCalled();
  });

  it('Invariant 4: OAuth code exchange & profile verification cannot place orders', async () => {
    UpstoxClient.setTransport(async (url) => {
      if (url.includes('/token')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            access_token: 'test_token',
            user_id: 'UCC_TEST',
            user_name: 'Test',
          }),
          text: async () => '',
        };
      }
      if (url.includes('/user/profile')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            status: 'success',
            data: { user_id: 'UCC_TEST', user_name: 'Test', is_active: true },
          }),
          text: async () => '',
        };
      }
      return { status: 404, ok: false, json: async () => ({}), text: async () => '' };
    });

    (config as any).UPSTOX_CLIENT_ID = 'test_client_id';
    (config as any).UPSTOX_CLIENT_SECRET = 'test_client_secret';

    const token = await UpstoxClient.exchangeAuthorizationCode('mock_code');
    expect(token.access_token).toBe('test_token');
    const profile = await UpstoxClient.getProfile(token.access_token);
    expect(profile.user_id).toBe('UCC_TEST');

    expect(placeOrderSpy).not.toHaveBeenCalled();
  });

  it('Invariant 5: live orders are rejected by safety gate when live trading is disabled', async () => {
    const { RiskEngine } = await import('../services/riskEngine');
    vi.spyOn(RiskEngine, 'evaluateTrade').mockResolvedValue({ approved: true } as any);

    const adapter = new UpstoxAdapter();
    await expect(
      adapter.placeOrder({
        userId: 'usr_safety_test',
        symbol: 'RELIANCE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1,
        price: 2500,
        idempotencyKey: 'test_safety_key',
        accountMode: 'live',
      })
    ).rejects.toThrow(/UPSTOX_LIVE_TRADING_DISABLED/);

    expect(placeOrderSpy).not.toHaveBeenCalled();
  });
});
