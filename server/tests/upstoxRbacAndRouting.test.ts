import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildServer } from '../index';
import { ServerAuthService } from '../services/authService';
import { initDb, closeDb, getDb } from '../db';
import { BrokerRegistry } from '../services/brokers';
import { UpstoxClient } from '../services/brokers/upstox/upstoxClient';
import { IndianMarketCalendar } from '../services/brokers/upstox/indianMarketCalendar';
import { LiveOrderConfirmationService } from '../services/liveOrderConfirmationService';
import { LiveOrderGateService } from '../services/liveOrderGateService';
import { UpstoxAdapter } from '../services/brokers/upstox/upstoxAdapter';
import { ServerRiskEngine } from '../services/riskEngine';
import { config } from '../config';

describe('Upstox RBAC, Broker Routing & Execution Integrity Suite', () => {
  let server: ReturnType<typeof buildServer>;
  let db: any;
  let traderUserId: string;
  let otherUserId: string;
  let adminUserId: string;
  let traderToken: string;
  let otherToken: string;
  let adminToken: string;

  beforeEach(async () => {
    await initDb();
    db = getDb();

    // Clean test tables
    await db.execute(`DELETE FROM live_order_confirmations`);
    await db.execute(`DELETE FROM exchange_orders`);
    await db.execute(`DELETE FROM operational_kill_switches`);
    await db.execute(`DELETE FROM broker_credentials`);
    await db.execute(`DELETE FROM order_reservations`);
    await db.execute(`DELETE FROM ledger_accounts`);
    await db.execute(`DELETE FROM account_limits`);
    await db.execute(`DELETE FROM kyc_records`);
    await db.execute(`DELETE FROM sessions`);
    await db.execute(`DELETE FROM users`);

    const now = Date.now();

    // Create regular trader
    const traderUser = await ServerAuthService.getOrCreateUser({
      email: 'trader@lumen.io',
      displayName: 'Trader User',
      provider: 'email',
      providerId: 'prov_trader',
    });
    traderUserId = traderUser.id;
    const traderSession = await ServerAuthService.createSession(traderUserId, '127.0.0.1', 'Vitest');
    traderToken = traderSession.rawToken;

    // Create other trader
    const otherUser = await ServerAuthService.getOrCreateUser({
      email: 'other@lumen.io',
      displayName: 'Other User',
      provider: 'email',
      providerId: 'prov_other',
    });
    otherUserId = otherUser.id;
    const otherSession = await ServerAuthService.createSession(otherUserId, '127.0.0.1', 'Vitest');
    otherToken = otherSession.rawToken;

    // Create admin user
    const adminUser = await ServerAuthService.getOrCreateUser({
      email: 'admin@lumen.io',
      displayName: 'System Admin',
      provider: 'email',
      providerId: 'prov_admin',
    });
    adminUserId = adminUser.id;
    await db.execute(`UPDATE users SET role = 'ADMIN' WHERE id = ?`, [adminUserId]);
    const adminSession = await ServerAuthService.createSession(adminUserId, '127.0.0.1', 'Vitest');
    adminToken = adminSession.rawToken;

    // Seed KYC & limits for trader
    await db.execute(
      `UPDATE kyc_records SET tier = 'tier2_verified', status = 'verified', country = 'IN', updated_at = ? WHERE user_id = ?`,
      [now, traderUserId]
    );
    await db.execute(
      `UPDATE account_limits SET is_emergency_frozen = 0, max_single_order_pct = 0.50, max_asset_concentration_pct = 0.50, min_cash_reserve_pct = 0.10, updated_at = ? WHERE user_id = ?`,
      [now, traderUserId]
    );

    // Seed liquid INR balance (₹10,00,000)
    await db.execute(
      `INSERT INTO ledger_accounts (id, user_id, account_mode, account_type, asset_or_currency, balance_minor, reserved_minor, created_at, updated_at)
       VALUES ('acc_live_inr_trader', ?, 'live', 'trading_allocated', 'INR', 100000000, 0, ?, ?)`,
      [traderUserId, now, now]
    );

    server = buildServer();
  });

  afterEach(async () => {
    IndianMarketCalendar.setMockMarketOpen(null);
    UpstoxClient.resetForTesting();
    vi.restoreAllMocks();
    await closeDb();
  });

  describe('1. Broker-Authoritative Cancel Routing from DB', () => {
    it('routes order cancellation to the broker specified in DB exchange_orders table', async () => {
      const now = Date.now();
      const testOrderId = 'lmn_ord_cancel_authoritative_01';

      // Insert order in DB registered with broker='upstox'
      await db.execute(
        `INSERT INTO exchange_orders (
          id, user_id, client_order_id, exchange_order_id, idempotency_key, broker, symbol,
          side, type, status, price, orig_qty, executed_qty, quote_asset, notional, created_at, updated_at
        ) VALUES ('ord_1', ?, ?, 'venue_upstox_999', ?, 'upstox', 'RELIANCE', 'BUY', 'LIMIT', 'OPEN', '2800', '1', '0', 'INR', '2800', ?, ?)`,
        [traderUserId, testOrderId, `idemp_${testOrderId}`, now, now]
      );

      // Track which broker adapter cancelOrder was invoked on
      const upstoxBroker = BrokerRegistry.get('upstox');
      const binanceBroker = BrokerRegistry.get('binance');

      const cancelUpstoxSpy = vi.spyOn(upstoxBroker, 'cancelOrder').mockResolvedValue({
        id: testOrderId,
        clientOrderId: testOrderId,
        exchangeOrderId: 'venue_upstox_999',
        broker: 'upstox',
        symbol: 'RELIANCE',
        side: 'BUY',
        type: 'LIMIT',
        status: 'CANCELED',
        origQty: '1',
        executedQty: '0',
        price: '2800',
        avgPrice: '0',
        quoteAsset: 'INR',
        time: now,
        updateTime: Date.now(),
      });

      const cancelBinanceSpy = vi.spyOn(binanceBroker, 'cancelOrder');

      // Client attempts to claim broker is 'binance' in body, but DB record has 'upstox'
      const res = await server.inject({
        method: 'POST',
        url: '/api/orders/cancel',
        headers: { authorization: `Bearer ${traderToken}` },
        payload: {
          clientOrderId: testOrderId,
          broker: 'binance', // Tampered / misleading broker from client
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.success).toBe(true);
      expect(data.order.status).toBe('CANCELED');

      // Upstox cancelOrder was called because DB is authoritative!
      expect(cancelUpstoxSpy).toHaveBeenCalledWith(traderUserId, testOrderId);
      expect(cancelBinanceSpy).not.toHaveBeenCalled();
    });
  });

  describe('2. Kill-Switch Freeze/Unfreeze Role-Based Access Control (RBAC)', () => {
    it('forbids standard TRADER from executing GLOBAL emergency freeze', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/operational/kill-switch/freeze',
        headers: { authorization: `Bearer ${traderToken}` },
        payload: {
          scope: 'GLOBAL',
          reason: 'Attempted unauthorized global freeze',
        },
      });

      expect(res.statusCode).toBe(403);
      const data = JSON.parse(res.body);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Administrative privilege required');
    });

    it('forbids standard TRADER from executing SYMBOL emergency freeze', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/operational/kill-switch/freeze',
        headers: { authorization: `Bearer ${traderToken}` },
        payload: {
          scope: 'SYMBOL',
          target: 'RELIANCE',
          reason: 'Attempted unauthorized symbol freeze',
        },
      });

      expect(res.statusCode).toBe(403);
      const data = JSON.parse(res.body);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Administrative privilege required');
    });

    it('forbids standard TRADER from freezing another user account', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/operational/kill-switch/freeze',
        headers: { authorization: `Bearer ${traderToken}` },
        payload: {
          scope: 'ACCOUNT',
          target: otherUserId, // Trying to freeze victim's account
          reason: 'Malicious freeze attempt on rival trader',
        },
      });

      expect(res.statusCode).toBe(403);
      const data = JSON.parse(res.body);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Cannot freeze other user accounts');
    });

    it('allows standard TRADER to freeze and unfreeze their own account', async () => {
      // Freeze own account
      const freezeRes = await server.inject({
        method: 'POST',
        url: '/api/operational/kill-switch/freeze',
        headers: { authorization: `Bearer ${traderToken}` },
        payload: {
          scope: 'ACCOUNT',
          reason: 'User self-requested circuit breaker',
        },
      });

      expect(freezeRes.statusCode).toBe(200);
      const freezeData = JSON.parse(freezeRes.body);
      expect(freezeData.success).toBe(true);

      // Unfreeze own account
      const unfreezeRes = await server.inject({
        method: 'POST',
        url: '/api/operational/kill-switch/unfreeze',
        headers: { authorization: `Bearer ${traderToken}` },
        payload: {
          scope: 'ACCOUNT',
          reason: 'User self-unfreeze after review',
        },
      });

      expect(unfreezeRes.statusCode).toBe(200);
      const unfreezeData = JSON.parse(unfreezeRes.body);
      expect(unfreezeData.success).toBe(true);
    });

    it('allows ADMIN to freeze and unfreeze GLOBAL scope', async () => {
      // Global freeze by Admin
      const freezeRes = await server.inject({
        method: 'POST',
        url: '/api/operational/kill-switch/freeze',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          scope: 'GLOBAL',
          reason: 'Exchange connectivity outage - admin kill switch',
        },
      });

      expect(freezeRes.statusCode).toBe(200);
      const freezeData = JSON.parse(freezeRes.body);
      expect(freezeData.success).toBe(true);

      // Global unfreeze by Admin
      const unfreezeRes = await server.inject({
        method: 'POST',
        url: '/api/operational/kill-switch/unfreeze',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          scope: 'GLOBAL',
          reason: 'Exchange connectivity restored - admin resuming',
        },
      });

      expect(unfreezeRes.statusCode).toBe(200);
      const unfreezeData = JSON.parse(unfreezeRes.body);
      expect(unfreezeData.success).toBe(true);
    });
  });

  describe('3. Live Order Confirmation Parameter Tamper-Proofing', () => {
    it('executes frozen proposal from DB and ignores client-submitted price/quantity modifications', async () => {
      // Save valid production credentials for trader
      const upstoxAdapter = new UpstoxAdapter();
      UpstoxClient.setTransport(async (url) => {
        if (url.includes('/user/profile')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({ status: 'success', data: { user_id: 'acc_upstox_tamper', is_active: true } }),
            text: async () => '',
          };
        }
        return { status: 200, ok: true, json: async () => ({ status: 'success', data: {} }), text: async () => '' };
      });

      await upstoxAdapter.saveCredentials(traderUserId, {
        accessToken: 'valid_token',
        environment: 'production',
        accountId: 'acc_upstox_tamper',
        canTrade: true,
      });

      // 1. Propose valid order: BUY 10 RELIANCE @ 2800.00
      const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
        userId: traderUserId,
        broker: 'upstox',
        symbol: 'RELIANCE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 10,
        price: 2800.0,
        product: 'CNC',
      });

      // Spy on BrokerGateway.placeOrder
      const upstoxBroker = BrokerRegistry.get('upstox');
      let capturedPlaceOrderParams: any = null;
      vi.spyOn(upstoxBroker, 'placeOrder').mockImplementation(async (params: any) => {
        capturedPlaceOrderParams = params;
        return {
          id: params.clientOrderId,
          clientOrderId: params.clientOrderId,
          exchangeOrderId: 'venue_ord_777',
          broker: 'upstox',
          symbol: params.symbol,
          side: params.side,
          type: params.type,
          status: 'OPEN',
          origQty: String(params.quantity),
          executedQty: '0',
          price: String(params.price),
          avgPrice: '0',
          quoteAsset: 'INR',
          time: Date.now(),
          updateTime: Date.now(),
        };
      });

      // 2. Client attempts to TAMPER with the order payload during /api/orders/confirm
      // by changing quantity to 500 and price to 1.0
      const res = await server.inject({
        method: 'POST',
        url: '/api/orders/confirm',
        headers: { authorization: `Bearer ${traderToken}` },
        payload: {
          confirmationId: proposal.confirmationId,
          symbol: 'RELIANCE',
          side: 'BUY',
          type: 'LIMIT',
          quantity: 500, // TAMPERED! (Original was 10)
          price: 1.0, // TAMPERED! (Original was 2800.0)
          product: 'CNC',
          isSystemPanic: true, // TAMPERED! (Attempting to bypass gates)
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.success).toBe(true);

      // Verify that server executed FROZEN proposal values, NOT tampered values!
      expect(capturedPlaceOrderParams).not.toBeNull();
      expect(capturedPlaceOrderParams.quantity).toBe(10); // Frozen: 10
      expect(capturedPlaceOrderParams.price).toBe(2800.0); // Frozen: 2800.0
      expect(capturedPlaceOrderParams.confirmationId).toBe(proposal.confirmationId);
      expect(capturedPlaceOrderParams.clientOrderId).toBe(proposal.clientOrderId);
    });
  });

  describe('4. Fail-Closed IP Verification & Server Quote Freshness', () => {
    it('fails closed when outbound IP does not match registered static IP in production', async () => {
      const origNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      vi.spyOn(config, 'UPSTOX_STATIC_IP', 'get').mockReturnValue('87.76.191.49');

      try {
        // Outbound IP is spoofed or dynamic NAT
        UpstoxClient.setMockOutboundIp('10.0.0.99');
        UpstoxClient.setMockRegisteredIps({ primary_ip: '87.76.191.49' });

        const diagnostic = await UpstoxClient.checkOutboundIp(true);
        expect(diagnostic.status).toBe('FAIL');
        expect(diagnostic.matchesRegistered).toBe(false);
        expect(diagnostic.outboundIp).toBe('10.0.0.99');
      } finally {
        process.env.NODE_ENV = origNodeEnv;
      }
    });

    it('rejects quotes older than max quote age calculated server-authoritatively', async () => {
      const riskResult = await ServerRiskEngine.evaluateTrade({
        userId: traderUserId,
        broker: 'upstox',
        symbol: 'RELIANCE',
        assetClass: 'EQUITY',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 1,
        price: 2800,
        currency: 'INR',
        quoteAsset: 'INR',
        accountMode: 'live',
        marketQuoteAgeMs: 50_000,
      });

      expect(riskResult.approved).toBe(false);
      expect(riskResult.rejectReason).toContain('Execution market data is stale');
    });
  });
});
