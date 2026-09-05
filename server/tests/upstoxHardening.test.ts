import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDb } from '../db';
import { UpstoxClient } from '../services/brokers/upstox/upstoxClient';
import { UpstoxAdapter } from '../services/brokers/upstox/upstoxAdapter';
import {
  calculateNextUpstoxExpiry,
  getTokenHealth,
  UPSTOX_PRE_MARKET_CUTOFF_MS,
  UPSTOX_WARNING_THRESHOLD_MS,
} from '../services/brokers/upstox/upstoxExpiry';
import { BrokerOrderRequest } from '../services/brokers/brokerTypes';
import { config } from '../config';

describe('Upstox Security & Production Hardening Suite', () => {
  const adapter = new UpstoxAdapter();
  const testUserId = 'usr_upstox_harden_001';

  const mockResponse = (status: number, data: any) => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => data,
    text: async () => JSON.stringify(data),
  });

  beforeEach(async () => {
    UpstoxClient.resetForTesting();

    UpstoxClient.setTransport(async (url: string, options: any) => {
      if (url.includes('/login/authorization/token')) {
        return mockResponse(200, {
          status: 'success',
          data: {
            access_token: 'hardened_upstox_token_999',
            token_type: 'Bearer',
            expires_in: 86400,
            user_id: 'UCC_HARDENED',
            user_name: 'Hardened Trader',
          },
        });
      }

      if (url.includes('/user/profile')) {
        return mockResponse(200, {
          status: 'success',
          data: {
            user_id: 'UCC_HARDENED',
            user_name: 'Hardened Trader',
            email: 'hardened@lumen.io',
            is_active: true,
            products: ['EQUITY'],
          },
        });
      }

      if (url.includes('/user/get-funds-and-margin')) {
        return mockResponse(200, {
          status: 'success',
          data: {
            equity: {
              available_margin: 200000.0,
              used_margin: 50000.0,
            },
          },
        });
      }

      if (url.includes('/order/place')) {
        return mockResponse(200, {
          status: 'success',
          data: {
            order_id: 'UPSTOX_HARDENED_ORD_123',
          },
        });
      }

      return mockResponse(404, { status: 'error', message: 'Not found' });
    });

    vi.spyOn(config, 'UPSTOX_CLIENT_ID', 'get').mockReturnValue('mock_client_id');
    vi.spyOn(config, 'UPSTOX_CLIENT_SECRET', 'get').mockReturnValue('mock_client_secret');

    const db = getDb();
    await db.execute('DELETE FROM broker_oauth_states');
    await db.execute('DELETE FROM broker_credentials');
    await db.execute('DELETE FROM exchange_orders');
    await db.execute('DELETE FROM ledger_accounts');
    await db.execute('DELETE FROM users');

    const now = Date.now();
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
       VALUES (?, 'hardened_upstox@lumen.io', 'Hardened Trader', 'email', 'prov_upstox_harden', ?, ?)`,
      [testUserId, now, now]
    );

    await db.execute(
      `INSERT INTO ledger_accounts (id, user_id, account_mode, account_type, asset_or_currency, balance_minor, reserved_minor, created_at, updated_at)
       VALUES ('acc_harden_inr', ?, 'live', 'trading_allocated', 'INR', 100000000, 0, ?, ?)`,
      [testUserId, now, now]
    );
  });

  describe('1. Anti-CSRF Server-Side OAuth State Management', () => {
    it('generates a 64-char hex cryptographic state with 10-minute expiry', async () => {
      const { state, authUrl, expiresAt } = await UpstoxClient.generateOAuthState(testUserId);

      expect(state).toHaveLength(64);
      expect(authUrl).toContain(`state=${state}`);
      expect(expiresAt).toBeGreaterThan(Date.now() + 9 * 60 * 1000);

      // Verify row persisted in DB
      const db = getDb();
      const row = await db.queryOne<any>(
        'SELECT * FROM broker_oauth_states WHERE id = ? AND user_id = ?',
        [state, testUserId]
      );
      expect(row).toBeDefined();
      expect(row.consumed_at).toBeNull();
      expect(row.broker).toBe('upstox');
    });

    it('validates and atomically consumes state token on first use', async () => {
      const { state } = await UpstoxClient.generateOAuthState(testUserId);

      const firstValidation = await UpstoxClient.validateAndConsumeOAuthState(testUserId, state);
      expect(firstValidation.valid).toBe(true);

      // Second use MUST fail as replay attempt
      const replayValidation = await UpstoxClient.validateAndConsumeOAuthState(testUserId, state);
      expect(replayValidation.valid).toBe(false);
      expect(replayValidation.reason).toContain('already been consumed');
    });

    it('rejects foreign or forged state tokens', async () => {
      const forgedState = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const validation = await UpstoxClient.validateAndConsumeOAuthState(testUserId, forgedState);

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Invalid or unrecognized');
    });

    it('rejects expired state tokens', async () => {
      const db = getDb();
      const expiredState = 'expired_state_token_11223344556677889900aabbccddeeff';
      const now = Date.now();

      await db.execute(
        `INSERT INTO broker_oauth_states (id, user_id, broker, redirect_uri, expires_at, created_at)
         VALUES (?, ?, 'upstox', 'https://lumen.io/callback', ?, ?)`,
        [expiredState, testUserId, now - 1000, now - 600000]
      );

      const validation = await UpstoxClient.validateAndConsumeOAuthState(testUserId, expiredState);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('expired');
    });

    it('saveCredentials verifies state and exchanges code securely', async () => {
      const { state } = await UpstoxClient.generateOAuthState(testUserId);

      const saved = await adapter.saveCredentials(testUserId, {
        code: 'auth_code_from_upstox',
        state,
      });

      expect(saved.connected).toBe(true);
      expect(saved.accountId).toBe('UCC_HARDENED');

      // Subsequent attempt with same state must throw AUTHENTICATION_FAILED
      await expect(
        adapter.saveCredentials(testUserId, {
          code: 'auth_code_replayed',
          state,
        })
      ).rejects.toThrow(/OAuth state validation failed/i);
    });
  });

  describe('2. Outbound Egress IP Diagnostic & Live Order Enforcement', () => {
    it('reports PASS when probed outbound IP matches registered static IP', async () => {
      const registeredIp = '203.0.113.50';
      vi.spyOn(config, 'UPSTOX_STATIC_IP', 'get').mockReturnValue(registeredIp);
      UpstoxClient.setMockOutboundIp(registeredIp);

      const diag = await UpstoxClient.checkOutboundIp(true);
      expect(diag.status).toBe('PASS');
      expect(diag.matchesRegistered).toBe(true);
      expect(diag.outboundIp).toBe(registeredIp);
    });

    it('reports FAIL when probed outbound IP differs from registered static IP', async () => {
      vi.spyOn(config, 'UPSTOX_STATIC_IP', 'get').mockReturnValue('203.0.113.50');
      UpstoxClient.setMockOutboundIp('198.51.100.25'); // Rogue/different egress IP

      const diag = await UpstoxClient.checkOutboundIp(true);
      expect(diag.status).toBe('FAIL');
      expect(diag.matchesRegistered).toBe(false);
      expect(diag.error).toContain('does not match registered static IPs');
    });

    it('blocks live order placement when outbound egress IP does not match', async () => {
      vi.spyOn(config, 'UPSTOX_STATIC_IP', 'get').mockReturnValue('203.0.113.50');
      vi.spyOn(config, 'UPSTOX_LIVE_TRADING_ENABLED', 'get').mockReturnValue(true);
      UpstoxClient.setMockOutboundIp('198.51.100.25'); // Mismatched IP

      await adapter.saveCredentials(testUserId, {
        accessToken: 'valid_live_token_777',
        accountId: 'UCC_HARDENED',
        environment: 'prod',
      });

      const req: BrokerOrderRequest = {
        userId: testUserId,
        clientOrderId: `LMN_IP_FAIL_${Date.now()}`,
        idempotencyKey: `idemp_ip_fail_${Date.now()}`,
        symbol: 'NSE_EQ|INE002A01018',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1,
        price: 2500.0,
        broker: 'upstox',
        accountMode: 'live',
      };

      await expect(adapter.placeOrder(req)).rejects.toThrow(/STATIC_IP_MISMATCH|outbound IP/i);
    });

    it('allows live order placement when outbound egress IP matches registered static IP', async () => {
      const validIp = '203.0.113.50';
      vi.spyOn(config, 'UPSTOX_STATIC_IP', 'get').mockReturnValue(validIp);
      vi.spyOn(config, 'UPSTOX_LIVE_TRADING_ENABLED', 'get').mockReturnValue(true);
      UpstoxClient.setMockOutboundIp(validIp);

      await adapter.saveCredentials(testUserId, {
        accessToken: 'valid_live_token_777',
        accountId: 'UCC_HARDENED',
        environment: 'prod',
      });

      const req: BrokerOrderRequest = {
        userId: testUserId,
        clientOrderId: `LMN_IP_PASS_${Date.now()}`,
        idempotencyKey: `idemp_ip_pass_${Date.now()}`,
        symbol: 'NSE_EQ|INE002A01018',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1,
        price: 2500.0,
        broker: 'upstox',
        accountMode: 'live',
      };

      const order = await adapter.placeOrder(req);
      expect(order.status).toBe('OPEN');
      expect(order.clientOrderId).toBe(req.clientOrderId);
    });
  });

  describe('3. Daily 03:30 AM IST Expiry Lifecycle & Cutoff Guards', () => {
    it('accurately calculates next 22:00 UTC (03:30 AM IST) boundary', () => {
      // 10:00 UTC today -> next expiry is 22:00 UTC today
      const morningDate = new Date('2026-09-05T10:00:00Z');
      const nextExpiry1 = calculateNextUpstoxExpiry(morningDate);
      expect(new Date(nextExpiry1).toISOString()).toBe('2026-09-05T22:00:00.000Z');

      // 22:15 UTC today -> next expiry is 22:00 UTC tomorrow
      const nightDate = new Date('2026-09-05T22:15:00Z');
      const nextExpiry2 = calculateNextUpstoxExpiry(nightDate);
      expect(new Date(nextExpiry2).toISOString()).toBe('2026-09-06T22:00:00.000Z');
    });

    it('returns EXPIRING_SOON when within 60 minutes of expiry', () => {
      const now = Date.now();
      const expiresAt = now + 45 * 60 * 1000; // 45 minutes remaining

      const health = getTokenHealth(expiresAt, now);
      expect(health.status).toBe('EXPIRING_SOON');
      expect(health.reauthRequired).toBe(true);
      expect(health.isWithinCutoffWindow).toBe(false);
      expect(health.timeRemainingHuman).toBe('45m');
    });

    it('returns EXPIRED when expiry timestamp has elapsed', () => {
      const now = Date.now();
      const expiresAt = now - 1000;

      const health = getTokenHealth(expiresAt, now);
      expect(health.status).toBe('EXPIRED');
      expect(health.reauthRequired).toBe(true);
      expect(health.isWithinCutoffWindow).toBe(true);
    });

    it('rejects live order within 5-minute pre-market cutoff window', async () => {
      vi.spyOn(config, 'UPSTOX_LIVE_TRADING_ENABLED', 'get').mockReturnValue(true);
      UpstoxClient.setMockOutboundIp(config.UPSTOX_STATIC_IP || null);

      const now = Date.now();
      // Set token expiry to 3 minutes from now (< 5m cutoff)
      const nearCutoffExpiry = now + 3 * 60 * 1000;

      const db = getDb();
      await db.execute(
        `INSERT INTO broker_credentials (
          id, user_id, broker, environment, auth_type, access_token_encrypted,
          token_expires_at, account_id, can_trade, can_withdraw, is_safe, last_sync_at, created_at, updated_at
        ) VALUES ('cred_cutoff_test', ?, 'upstox', 'prod', 'oauth2', ?, ?, 'UCC_HARDENED', 1, 0, 1, ?, ?, ?)`,
        [testUserId, (adapter as any).encryptSecret('token_near_cutoff'), nearCutoffExpiry, now, now, now]
      );

      const req: BrokerOrderRequest = {
        userId: testUserId,
        clientOrderId: `LMN_CUTOFF_${Date.now()}`,
        idempotencyKey: `idemp_cutoff_${Date.now()}`,
        symbol: 'NSE_EQ|INE002A01018',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1,
        price: 2500.0,
        broker: 'upstox',
        accountMode: 'live',
      };

      await expect(adapter.placeOrder(req)).rejects.toThrow(/SESSION_EXPIRING|less than 5 minutes/i);
    });

    it('rejects live order when token is expired at 03:30 AM IST', async () => {
      vi.spyOn(config, 'UPSTOX_LIVE_TRADING_ENABLED', 'get').mockReturnValue(true);
      UpstoxClient.setMockOutboundIp(config.UPSTOX_STATIC_IP || null);

      const now = Date.now();
      const expiredTimestamp = now - 5000;

      const db = getDb();
      await db.execute(
        `INSERT INTO broker_credentials (
          id, user_id, broker, environment, auth_type, access_token_encrypted,
          token_expires_at, account_id, can_trade, can_withdraw, is_safe, last_sync_at, created_at, updated_at
        ) VALUES ('cred_expired_test', ?, 'upstox', 'prod', 'oauth2', ?, ?, 'UCC_HARDENED', 1, 0, 1, ?, ?, ?)`,
        [testUserId, (adapter as any).encryptSecret('token_already_expired'), expiredTimestamp, now, now, now]
      );

      const req: BrokerOrderRequest = {
        userId: testUserId,
        clientOrderId: `LMN_EXPIRED_${Date.now()}`,
        idempotencyKey: `idemp_expired_${Date.now()}`,
        symbol: 'NSE_EQ|INE002A01018',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1,
        price: 2500.0,
        broker: 'upstox',
        accountMode: 'live',
      };

      await expect(adapter.placeOrder(req)).rejects.toThrow(/AUTHENTICATION_FAILED|expired at 03:30 AM IST/i);
    });
  });

  describe('4. Token Health & Account Inspection', () => {
    it('returns full token health details via adapter.getTokenHealth', async () => {
      await adapter.saveCredentials(testUserId, {
        accessToken: 'sample_token_health',
        accountId: 'UCC_HEALTH_TEST',
        environment: 'prod',
      });

      const health = await adapter.getTokenHealth(testUserId);
      expect(health.status).toBe('ACTIVE');
      expect(health.expiresAt).toBeDefined();
      expect(health.timeRemainingMs).toBeGreaterThan(0);
      expect(health.reauthRequired).toBe(false);
      expect(health.nextExpiryIso).toContain('T22:00:00.000Z');
    });

    it('enriches getAccount with tokenHealth and updates security badges', async () => {
      await adapter.saveCredentials(testUserId, {
        accessToken: 'sample_token_account',
        accountId: 'UCC_ACC_TEST',
        environment: 'prod',
      });

      const account = await adapter.getAccount(testUserId);
      expect(account).toBeDefined();
      expect(account?.connected).toBe(true);
      expect(account?.tokenHealth).toBeDefined();
      expect(account?.tokenHealth?.status).toBe('ACTIVE');
      expect(account?.securityBadge).toBe('OAUTH2_RESTRICTED_SAFE');
    });
  });
});
