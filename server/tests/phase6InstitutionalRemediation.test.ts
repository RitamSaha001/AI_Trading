import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb } from '../db';
import crypto from 'node:crypto';
import { UpstoxClient } from '../services/brokers/upstox/upstoxClient';
import { UpstoxUserStreamTransport } from '../services/brokers/upstox/upstoxUserStreamTransport';
import { UpstoxTotpAuthService } from '../services/brokers/upstox/upstoxTotpAuthService';
import { InFlightMtmService } from '../services/inFlightMtmService';
import { OtrLimiterService } from '../services/otrLimiterService';
import { EmergencyControlService } from '../services/emergencyControlService';
import { BrokerRegistry } from '../services/brokers/brokerRegistry';

describe('Phase 6 Institutional Real-Money Remediation Suite', () => {
  const testUserId = `usr_p6_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = Date.now();

  beforeEach(async () => {
    OtrLimiterService.reset();
    const db = getDb();

    // Reset emergency state
    await EmergencyControlService.setState('TRADING_NORMAL', 'Phase 6 Test Reset', 'test_runner');

    // Seed test user
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, ?, 'Phase 6 Test Trader', 'email', ?, 'TRADER', ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [testUserId, `${testUserId}@example.com`, `prov_${testUserId}`, now, now]
    );

    // Seed KYC record
    await db.execute(
      `INSERT INTO kyc_records (id, user_id, tier, status, pan_masked, country, verified_at, updated_at)
       VALUES (?, ?, 'tier2_verified', 'verified', 'ABCDE1234F', 'IN', ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [`kyc_${testUserId}`, testUserId, now, now]
    );

    // Seed Account Limits
    await db.execute(
      `INSERT INTO account_limits (
        id, user_id, account_mode, is_emergency_frozen,
        max_asset_concentration_pct, min_cash_reserve_pct, max_single_order_pct,
        max_daily_loss_usd, updated_at
      ) VALUES (?, ?, 'live', 0, 0.50, 0.15, 0.30, 10000.0, ?)
      ON CONFLICT (id) DO NOTHING`,
      [`lim_${testUserId}`, testUserId, now]
    );

    // Seed trading_allocated ledger account with ₹1,000,000 (100,000,000 paise)
    await db.execute(
      `INSERT INTO ledger_accounts (
        id, user_id, account_mode, account_type, asset_or_currency,
        balance_minor, reserved_minor, created_at, updated_at
      ) VALUES (?, ?, 'live', 'trading_allocated', 'INR', 100000000, 0, ?, ?)
      ON CONFLICT (id) DO UPDATE SET balance_minor = 100000000, reserved_minor = 0`,
      [`leg_cash_${testUserId}`, testUserId, now, now]
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  describe('1. Upstox Authorized Feed URI Resolution & Algo Tagging', () => {
    it('obtains authorized feed URI via /feed/portfolio-stream-feed/authorize', async () => {
      const mockRedirectUri = 'wss://api.upstox.com/v2/feed/portfolio-stream-feed?code=auth_code_123&requestId=req_456';
      
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes('/feed/portfolio-stream-feed/authorize')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'success',
              data: {
                authorized_redirect_uri: mockRedirectUri,
              },
            }),
          } as any;
        }
        return { ok: false, status: 404, json: async () => ({}) } as any;
      });

      const feedUri = await UpstoxClient.getAuthorizedFeedUri('valid_token_xyz');
      expect(feedUri).toBe(mockRedirectUri);
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('injects X-Algo-Name header and formats compliant strategy tag on order placement', async () => {
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any = null;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, opts: any) => {
        if (String(url).includes('/order/place')) {
          capturedHeaders = opts?.headers || {};
          capturedBody = JSON.parse(opts?.body || '{}');
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'success',
              data: {
                order_id: 'upstox_ord_algo_1',
              },
            }),
          } as any;
        }
        return { ok: false, status: 404, json: async () => ({}) } as any;
      });

      const res = await UpstoxClient.placeOrder(
        'mock_token',
        {
          quantity: 10,
          product: 'D',
          validity: 'DAY',
          price: 2500,
          tag: 'algo_arbitrage_strat',
          instrument_token: 'NSE_EQ|INE002A01018',
          order_type: 'LIMIT',
          transaction_type: 'BUY',
        },
        'SEBI_APPROVED_ALGO_99'
      );

      expect(res.order_id).toBe('upstox_ord_algo_1');
      expect(capturedHeaders['X-Algo-Name']).toBe('SEBI_APPROVED_ALGO_99');
      expect(capturedBody.tag).toBe('algo_arbitrage_strat');
    });
  });

  describe('2. De-Faked Token Health & No Fake Expiry Extension', () => {
    it('fails closed when token is expired and does not arbitrarily extend database expiry', async () => {
      const db = getDb();
      const expiredTimestamp = Date.now() - 3600000; // 1 hour in the past

      await db.execute(
        `INSERT INTO broker_credentials (
          id, user_id, broker, environment, auth_type, access_token_encrypted, refresh_token_encrypted, token_expires_at, can_trade, last_sync_at, created_at, updated_at
        ) VALUES (?, ?, 'upstox', 'sandbox', 'oauth2', 'expired_token', 'rt_123', ?, 1, ?, ?, ?)
        ON CONFLICT (user_id, broker, environment) DO UPDATE SET token_expires_at = ?, can_trade = 1`,
        [`cred_${testUserId}`, testUserId, expiredTimestamp, expiredTimestamp, expiredTimestamp, expiredTimestamp, expiredTimestamp]
      );

      // Verify session fails closed
      const isHealthy = await UpstoxTotpAuthService.verifyAndEnforceTokenHealth(testUserId);
      expect(isHealthy).toBe(false);

      // Verify can_trade was revoked to 0
      const credRow = await db.queryOne<{ can_trade: number; token_expires_at: number }>(
        `SELECT can_trade, token_expires_at FROM broker_credentials WHERE user_id = ? AND broker = 'upstox'`,
        [testUserId]
      );
      expect(credRow?.can_trade).toBe(0);
      // The expiry must NOT be updated into the future
      expect(Number(credRow?.token_expires_at)).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('3. Atomic Partial Fill Delta Settlement', () => {
    it('settles incremental deltas correctly across consecutive partial and full execution updates', async () => {
      const db = getDb();
      const clientOrderId = `cli_p6_${Date.now()}`;
      const venueOrderId = `ven_p6_${Date.now()}`;
      const internalOrderId = `ord_p6_${Date.now()}`;

      // Insert open buy order for 100 shares at ₹1,000 (reserved ₹100,000 = 10,000,000 paise)
      await db.execute(
        `INSERT INTO exchange_orders (
          id, client_order_id, exchange_order_id, user_id, broker, symbol,
          side, type, status, orig_qty, executed_qty, price, notional, quote_asset, reserved_cash,
          idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'upstox', 'RELIANCE', 'BUY', 'LIMIT', 'OPEN', 100, 0, 1000, 100000, 'INR', 100000, ?, ?, ?)`,
        [internalOrderId, clientOrderId, venueOrderId, testUserId, `idem_${clientOrderId}`, now, now]
      );

      // Create dummy reservation in ledger_accounts
      await db.execute(
        `UPDATE ledger_accounts SET reserved_minor = 10000000 WHERE user_id = ? AND account_type = 'trading_allocated'`,
        [testUserId]
      );

      const transport = new UpstoxUserStreamTransport(testUserId, 'valid_token');

      // 1. First partial fill: 40 shares @ 1000
      await (transport as any).handleOrderUpdate({
        order_id: venueOrderId,
        tag: clientOrderId,
        status: 'partially filled',
        filled_quantity: 40,
        average_price: 1000,
        exchange_timestamp: new Date().toISOString(),
      });

      // Verify order executed_qty is 40 and status is PARTIALLY_FILLED
      let orderRow = await db.queryOne<any>(
        `SELECT status, executed_qty FROM exchange_orders WHERE id = ?`,
        [internalOrderId]
      );
      expect(orderRow.status).toBe('PARTIALLY_FILLED');
      expect(Number(orderRow.executed_qty)).toBe(40);

      // Verify fill recorded in exchange_fills for delta of 40
      const fills = await db.query<any>(
        `SELECT qty, price FROM exchange_fills WHERE order_id = ? ORDER BY executed_at ASC`,
        [internalOrderId]
      );
      expect(fills.length).toBe(1);
      expect(Number(fills[0].qty)).toBe(40);

      // 2. Second partial fill: cumulative 70 shares (delta = 30 shares)
      await (transport as any).handleOrderUpdate({
        order_id: venueOrderId,
        tag: clientOrderId,
        status: 'partially filled',
        filled_quantity: 70,
        average_price: 1000,
        exchange_timestamp: new Date().toISOString(),
      });

      orderRow = await db.queryOne<any>(
        `SELECT status, executed_qty FROM exchange_orders WHERE id = ?`,
        [internalOrderId]
      );
      expect(Number(orderRow.executed_qty)).toBe(70);

      const fillsAfterSecond = await db.query<any>(
        `SELECT qty, price FROM exchange_fills WHERE order_id = ? ORDER BY executed_at ASC`,
        [internalOrderId]
      );
      expect(fillsAfterSecond.length).toBe(2);
      expect(Number(fillsAfterSecond[1].qty)).toBe(30); // incremental delta

      // 3. Final execution: cumulative 100 shares (delta = 30 shares) -> FILLED
      await (transport as any).handleOrderUpdate({
        order_id: venueOrderId,
        tag: clientOrderId,
        status: 'complete',
        filled_quantity: 100,
        average_price: 1000,
        exchange_timestamp: new Date().toISOString(),
      });

      orderRow = await db.queryOne<any>(
        `SELECT status, executed_qty FROM exchange_orders WHERE id = ?`,
        [internalOrderId]
      );
      expect(orderRow.status).toBe('FILLED');
      expect(Number(orderRow.executed_qty)).toBe(100);

      const allFills = await db.query<any>(
        `SELECT qty FROM exchange_fills WHERE order_id = ? ORDER BY executed_at ASC`,
        [internalOrderId]
      );
      expect(allFills.length).toBe(3);
      expect(Number(allFills[2].qty)).toBe(30); // final incremental delta
    });
  });

  describe('4. In-Flight MTM Fail-Closed & Authoritative Margin', () => {
    it('fails closed and halts trading when broker position query errors', async () => {
      const mockBroker = {
        name: 'upstox',
        getPositions: vi.fn().mockRejectedValue(new Error('Broker network timeout or 503 Gateway Down')),
        getFunds: vi.fn().mockResolvedValue({ totalCash: 500000, availableCash: 300000, usedMargin: 200000 }),
      };

      vi.spyOn(BrokerRegistry, 'get').mockReturnValue(mockBroker as any);

      const result = await InFlightMtmService.evaluateUserPositions(testUserId, 'upstox');

      expect(result.marginHealthRatio).toBe(0);
      expect(result.isRiskDegraded).toBe(true);
      expect(result.reason).toContain('Broker position data unavailable');

      // Emergency status must be set to TRADING_HALTED
      const state = await EmergencyControlService.getState();
      expect(state.state).toBe('TRADING_HALTED');
      expect(state.reason).toContain('Live risk evaluation degraded');
    });

    it('uses authoritative usedMargin from broker funds for maintenance evaluation', async () => {
      // Restore state
      await EmergencyControlService.setState('TRADING_NORMAL', 'Test Normal', 'test_runner');

      const mockBroker = {
        name: 'upstox',
        getPositions: vi.fn().mockResolvedValue([
          {
            symbol: 'NSE_EQ|INE002A01018',
            quantity: 100,
            averagePrice: 2500,
            currentPrice: 2400,
            unrealizedPnl: -10000,
            product: 'D',
          },
        ]),
        getFunds: vi.fn().mockResolvedValue({
          totalCash: 500000,
          availableCash: 350000,
          usedMargin: 150000, // authoritative used margin
        }),
      };

      vi.spyOn(BrokerRegistry, 'get').mockReturnValue(mockBroker as any);

      const result = await InFlightMtmService.evaluateUserPositions(testUserId, 'upstox');

      expect(result.isRiskDegraded).toBe(false);
      expect(result.maintenanceMarginRequired).toBe(150000);
      expect(result.marginHealthRatio).toBeGreaterThan(0);
    });
  });

  describe('5. Durable OTR Limiter & SEBI Tagging', () => {
    it('persists OTR events to durable otr_events table and calculates durable stats', async () => {
      const symbol = 'INFY';
      
      // Record 3 events
      OtrLimiterService.recordEvent(testUserId, symbol, 'PLACE');
      OtrLimiterService.recordEvent(testUserId, symbol, 'MODIFY');
      OtrLimiterService.recordEvent(testUserId, symbol, 'FILL');

      // Wait 100ms for asynchronous insert to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const durableStats = await OtrLimiterService.getDurableStats(testUserId, symbol);
      expect(durableStats.ordersPlaced).toBeGreaterThanOrEqual(1);
      expect(durableStats.ordersModified).toBeGreaterThanOrEqual(1);
      expect(durableStats.ordersFilled).toBeGreaterThanOrEqual(1);
    });

    it('formats compliant strategy tags up to 40 characters', () => {
      const tagStandard = OtrLimiterService.formatStrategyTag('momentum_trend_follower', 'cli_9999');
      expect(tagStandard.length).toBeLessThanOrEqual(30);
      expect(tagStandard).toContain('algo_');

      const tagExtended = OtrLimiterService.formatStrategyTag('very_long_strategy_name_for_sebi_compliance', 'order_id_12345', 40);
      expect(tagExtended.length).toBeLessThanOrEqual(40);
      expect(/^[a-zA-Z0-9_]+$/.test(tagExtended)).toBe(true);
    });
  });

  describe('6. Panic Square-Off Concurrency Lock', () => {
    it('blocks concurrent execution of panic square-off for the same user', async () => {
      const db = getDb();
      // Ensure broker credentials exist
      await db.execute(
        `INSERT INTO broker_credentials (
          id, user_id, broker, environment, auth_type, access_token_encrypted, refresh_token_encrypted, token_expires_at, can_trade, last_sync_at, created_at, updated_at
        ) VALUES (?, ?, 'upstox', 'sandbox', 'oauth2', 'mock_token', 'rt_123', ?, 1, ?, ?, ?)
        ON CONFLICT (user_id, broker, environment) DO NOTHING`,
        [`cred_panic_${testUserId}`, testUserId, Date.now() + 3600000, now, now, now]
      );

      const mockBroker = {
        name: 'upstox',
        getPositions: vi.fn().mockImplementation(async () => {
          // Add artificial delay to simulate live API latency
          await new Promise((r) => setTimeout(r, 100));
          return [];
        }),
        getOpenOrders: vi.fn().mockResolvedValue([]),
        getFunds: vi.fn().mockResolvedValue({ totalCash: 100000, availableCash: 100000 }),
      };
      vi.spyOn(BrokerRegistry, 'get').mockReturnValue(mockBroker as any);

      // Launch first panic execution
      const execution1Promise = EmergencyControlService.executePanicSquareOff(
        testUserId,
        'upstox',
        'Primary Panic Call'
      );

      // Attempt second panic execution concurrently
      await expect(
        EmergencyControlService.executePanicSquareOff(
          testUserId,
          'upstox',
          'Concurrent Duplicate Panic Call'
        )
      ).rejects.toThrowError('Panic square-off already in progress');

      // Await completion of first call
      const res1 = await execution1Promise;
      expect(res1.status).toBe('COMPLETED');

      // Now that it has completed, subsequent execution should be allowed (lock cleaned up)
      const res3 = await EmergencyControlService.executePanicSquareOff(
        testUserId,
        'upstox',
        'Subsequent Panic Call After Cleanup'
      );
      expect(res3.status).toBe('COMPLETED');
    });
  });
});
