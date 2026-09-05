import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UpstoxClient, UpstoxRateLimiter } from '../services/brokers/upstox/upstoxClient';
import { UpstoxAdapter } from '../services/brokers/upstox/upstoxAdapter';
import { UpstoxInstrumentRegistry } from '../services/brokers/upstox/upstoxInstrumentRegistry';
import { initDb, closeDb, getDb } from '../db';
import { LedgerService } from '../services/ledgerService';
import { IndianMarketCalendar } from '../services/brokers/upstox/indianMarketCalendar';
import { config } from '../config';

describe('Upstox V3 HFT & Execution Hardening Suite', () => {
  let db: any;
  let adapter: UpstoxAdapter;
  const testUserId = 'usr_upstox_hft_test';

  beforeEach(async () => {
    UpstoxClient.resetForTesting();
    UpstoxRateLimiter.resetForTesting();
    await initDb();
    db = getDb();
    adapter = new UpstoxAdapter();

    // Clean test tables
    await db.execute(`DELETE FROM exchange_orders WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM live_order_confirmations WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM broker_credentials WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM order_reservations WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM account_limits WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM kyc_records WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [testUserId]);

    const now = Date.now();
    // Insert test user
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, 'upstox_tester@lumen.io', 'Upstox Tester', 'email', 'prov_test', 'TRADER', ?, ?)`,
      [testUserId, now, now]
    );

    await db.execute(
      `INSERT INTO kyc_records (id, user_id, tier, status, country, updated_at)
       VALUES (?, ?, 'tier2_verified', 'verified', 'IN', ?)`,
      [`kyc_${testUserId}`, testUserId, now]
    );

    await db.execute(
      `INSERT INTO account_limits (id, user_id, is_emergency_frozen, max_single_order_pct, max_asset_concentration_pct, min_cash_reserve_pct, updated_at)
       VALUES (?, ?, 0, 0.50, 0.50, 0.10, ?)`,
      [`lim_${testUserId}`, testUserId, now]
    );

    // Seed liquid INR balance (₹10,00,000)
    await db.execute(
      `INSERT INTO ledger_accounts (id, user_id, account_mode, account_type, asset_or_currency, balance_minor, reserved_minor, created_at, updated_at)
       VALUES ('acc_live_inr_test', ?, 'live', 'trading_allocated', 'INR', 100000000, 0, ?, ?)`,
      [testUserId, now, now]
    );
  });

  afterEach(async () => {
    IndianMarketCalendar.setMockMarketOpen(null);
    UpstoxClient.resetForTesting();
    UpstoxRateLimiter.resetForTesting();
    await closeDb();
  });

  it('Requirement 1: placeOrder, cancelOrder, and modifyOrder route to HFT endpoint https://api-hft.upstox.com/v3', async () => {
    const requestedUrls: string[] = [];

    UpstoxClient.setTransport(async (url, options) => {
      requestedUrls.push(url);
      if (url.includes('/order/place')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            status: 'success',
            data: { order_ids: ['24090500123456'] },
          }),
          text: async () => '',
        };
      }
      if (url.includes('/order/cancel')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            status: 'success',
            data: { order_id: '24090500123456' },
          }),
          text: async () => '',
        };
      }
      if (url.includes('/order/modify')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            status: 'success',
            data: { order_id: '24090500123456' },
          }),
          text: async () => '',
        };
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ status: 'success', data: {} }),
        text: async () => '',
      };
    });

    const placeRes = await UpstoxClient.placeOrder('test_access_token', {
      quantity: 10,
      product: 'D',
      validity: 'DAY',
      price: 2800,
      instrument_token: 'NSE_EQ|INE002A01018',
      order_type: 'LIMIT',
      transaction_type: 'BUY',
    });

    expect(placeRes.order_id).toBe('24090500123456');
    expect(requestedUrls[0]).toBe('https://api-hft.upstox.com/v3/order/place');

    const cancelRes = await UpstoxClient.cancelOrder('test_access_token', '24090500123456');
    expect(cancelRes.order_id).toBe('24090500123456');
    expect(requestedUrls[1]).toBe('https://api-hft.upstox.com/v3/order/cancel?order_id=24090500123456');

    const modifyRes = await UpstoxClient.modifyOrder('test_access_token', {
      order_id: '24090500123456',
      price: 2810,
      order_type: 'LIMIT',
      validity: 'DAY',
    });
    expect(modifyRes.order_id).toBe('24090500123456');
    expect(requestedUrls[2]).toBe('https://api-hft.upstox.com/v3/order/modify');
  });

  it('Requirement 2: Sliced orders returning multiple order_ids are parsed and tracked with venue_order_ids', async () => {
    UpstoxClient.setTransport(async (url) => {
      if (url.includes('/order/place')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            status: 'success',
            data: { order_ids: ['child_ord_1', 'child_ord_2', 'child_ord_3'] },
          }),
          text: async () => '',
        };
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ status: 'success', data: {} }),
        text: async () => '',
      };
    });

    const res = await UpstoxClient.placeOrder('test_token', {
      quantity: 30000,
      product: 'D',
      validity: 'DAY',
      price: 2800,
      instrument_token: 'NSE_EQ|INE002A01018',
      order_type: 'LIMIT',
      transaction_type: 'BUY',
      slice: true,
    });

    expect(res.order_id).toBe('child_ord_1');
    expect(res.order_ids).toEqual(['child_ord_1', 'child_ord_2', 'child_ord_3']);
  });

  it('Requirement 3: Broker acceptance followed by local DB failure transitions to UNKNOWN without releasing reservations', async () => {
    IndianMarketCalendar.setMockMarketOpen(true);
    UpstoxClient.setMockOutboundIp('87.76.191.49');
    UpstoxClient.setMockRegisteredIps({ primary_ip: '87.76.191.49' });

    UpstoxClient.setTransport(async (url) => {
      if (url.includes('/order/place')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            status: 'success',
            data: { order_ids: ['venue_240905_001'] },
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
            data: { user_id: 'acc_upstox_001', user_name: 'Tester', is_active: true },
          }),
          text: async () => '',
        };
      }
      if (url.includes('/market-quote/quotes')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            status: 'success',
            data: {
              'NSE_EQ:RELIANCE': {
                last_price: 2800,
                timestamp: Date.now(),
                volume: 10000,
                depth: { buy: [{ price: 2800, quantity: 100 }], sell: [{ price: 2800, quantity: 100 }] },
              },
            },
          }),
          text: async () => '',
        };
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ status: 'success', data: {} }),
        text: async () => '',
      };
    });

    // Mock DB failure during post-placement state update
    const origExecute = db.execute.bind(db);
    let firstUpdateDone = false;
    db.execute = async (sql: string, params: any[]) => {
      if (sql.includes('UPDATE exchange_orders') && sql.includes("'OPEN'")) {
        firstUpdateDone = true;
        throw new Error('Simulated database connection drop after broker acceptance');
      }
      return origExecute(sql, params);
    };

    // Save encrypted production credentials
    await adapter.saveCredentials(testUserId, {
      accessToken: 'test_token',
      environment: 'production',
      accountId: 'acc_upstox_001',
      canTrade: true,
    });

    // Propose an order to get confirmationId
    // Enable live trading briefly for pre-submission gate
    const origLiveGate = config.UPSTOX_LIVE_TRADING_ENABLED;
    (config as any).UPSTOX_LIVE_TRADING_ENABLED = true;

    try {
      // Mock static IP match
      UpstoxClient.setMockOutboundIp('87.76.191.49');
      UpstoxClient.setMockRegisteredIps({ primary_ip: '87.76.191.49' });

      // Propose live order
      const prop = await import('../services/liveOrderConfirmationService').then((m) =>
        m.LiveOrderConfirmationService.proposeLiveOrder({
          userId: testUserId,
          broker: 'upstox',
          symbol: 'RELIANCE',
          side: 'BUY',
          type: 'LIMIT',
          quantity: 1,
          price: 2800,
          product: 'CNC',
        })
      );

      // Attempt place order (LiveOrderGateService will reserve funds during pre-submission gate)
      const placed = await adapter.placeOrder({
        userId: testUserId,
        broker: 'upstox',
        symbol: 'RELIANCE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1,
        price: 2800,
        product: 'CNC',
        confirmationId: prop.confirmationId,
        clientOrderId: prop.clientOrderId,
        idempotencyKey: prop.idempotencyKey,
        accountMode: 'live',
      });

      // Must be marked UNKNOWN, NOT REJECTED
      expect(placed.status).toBe('UNKNOWN');
      expect(placed.exchangeOrderId).toBe('venue_240905_001');

      // Verify DB record is UNKNOWN with exchange_order_id stored
      const orderInDb = await db.queryOne(
        `SELECT status, exchange_order_id FROM exchange_orders WHERE client_order_id = ?`,
        [prop.clientOrderId]
      );
      expect(orderInDb.status).toBe('UNKNOWN');
      expect(orderInDb.exchange_order_id).toBe('venue_240905_001');

      // Verify reservation was NOT released and remains ACTIVE
      const activeRes = await db.queryOne(
        `SELECT status, amount_minor FROM order_reservations WHERE order_id = ?`,
        [prop.clientOrderId]
      );
      expect(activeRes).not.toBeNull();
      expect(activeRes?.status).toBe('ACTIVE');
    } finally {
      (config as any).UPSTOX_LIVE_TRADING_ENABLED = origLiveGate;
      db.execute = origExecute;
    }
  });

  it('Requirement 4: UpstoxRateLimiter enforces 10 req/s rate limiting', async () => {
    UpstoxRateLimiter.resetForTesting();
    const start = Date.now();

    // Fire 25 sequential throttle requests (capacity is 20, 10/s refill)
    for (let i = 0; i < 25; i++) {
      await UpstoxRateLimiter.throttleRequest();
    }

    const elapsed = Date.now() - start;
    // Beyond burst capacity of 20, remaining 5 tokens at 10/s take >= 400ms
    expect(elapsed).toBeGreaterThanOrEqual(300);
  });
});
