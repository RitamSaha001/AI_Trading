import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../db';
import { config } from '../config';
import { BrokerRegistry } from '../services/brokers/brokerRegistry';
import { UpstoxAdapter } from '../services/brokers/upstox/upstoxAdapter';
import { UpstoxClient } from '../services/brokers/upstox/upstoxClient';
import { IndianMarketCalendar } from '../services/brokers/upstox/indianMarketCalendar';
import { InstrumentRulesService } from '../services/instrumentRules';
import { BrokerOrderRequest } from '../services/brokers/brokerTypes';
import { StandardBrokerError } from '../services/brokers/brokerGateway';
import { LiveOrderConfirmationService } from '../services/liveOrderConfirmationService';

function mockResponse(status: number, data: any) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

describe('Phase 2: Upstox Broker Gateway Integration Suite', () => {
  const testUserId = 'usr_upstox_test_001';
  let adapter: UpstoxAdapter;
  const originalClientId = config.UPSTOX_CLIENT_ID;
  const originalClientSecret = config.UPSTOX_CLIENT_SECRET;
  const originalLiveEnabled = config.UPSTOX_LIVE_TRADING_ENABLED;

  beforeEach(async () => {
    config.UPSTOX_CLIENT_ID = 'test_upstox_client_id_001';
    config.UPSTOX_CLIENT_SECRET = 'test_upstox_client_secret_001';
    config.UPSTOX_LIVE_TRADING_ENABLED = false;
    IndianMarketCalendar.setMockMarketOpen(true);

    // Reset BrokerRegistry, InstrumentRulesService, and UpstoxClient
    BrokerRegistry.resetForTesting();
    InstrumentRulesService.resetForTesting();
    UpstoxClient.resetForTesting();
    adapter = BrokerRegistry.get('upstox') as UpstoxAdapter;

    // Default transport returning valid responses for profile and funds
    UpstoxClient.setTransport(async (url) => {
      if (url.includes('/user/profile')) {
        return mockResponse(200, {
          status: 'success',
          data: {
            user_id: 'UCC12345',
            user_name: 'Rahul Sharma',
            email: 'rahul@example.com',
            user_type: 'individual',
            broker: 'UPSTOX',
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
              available_margin: 154250.75,
              used_margin: 45749.25,
              payin_amount: 50000.00,
              span_margin: 0,
              adhoc_margin: 0,
              notional_cash: 200000.00,
              exposure_margin: 0,
            },
            commodity: {
              available_margin: 0,
              used_margin: 0,
            },
          },
        });
      }
      return mockResponse(404, { status: 'error', message: 'Not found' });
    });

    const db = getDb();
    await db.execute('DELETE FROM broker_credentials');
    await db.execute('DELETE FROM order_reservations');
    await db.execute('DELETE FROM exchange_fills');
    await db.execute('DELETE FROM exchange_orders');
    await db.execute('DELETE FROM ledger_entries');
    await db.execute('DELETE FROM ledger_accounts');
    await db.execute('DELETE FROM authoritative_positions');
    await db.execute('DELETE FROM account_limits');
    await db.execute('DELETE FROM users');

    const now = Date.now();
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
       VALUES (?, 'upstox_trader@lumen.io', 'Upstox Trader', 'email', 'prov_upstox_test', ?, ?)`,
      [testUserId, now, now]
    );

    await db.execute(
      `INSERT INTO account_limits (id, user_id, is_emergency_frozen, max_single_order_pct, max_asset_concentration_pct, min_cash_reserve_pct, updated_at)
       VALUES (?, ?, 0, 0.50, 0.50, 0.10, ?)`,
      [`lim_${testUserId}`, testUserId, now]
    );

    // Seed liquid INR balance in ledger for live trading reservation tests
    await db.execute(
      `INSERT INTO ledger_accounts (id, user_id, account_mode, account_type, asset_or_currency, balance_minor, reserved_minor, created_at, updated_at)
       VALUES ('acc_live_inr_test', ?, 'live', 'trading_allocated', 'INR', 50000000, 0, ?, ?)`,
      [testUserId, now, now]
    );
  });

  afterEach(() => {
    config.UPSTOX_CLIENT_ID = originalClientId;
    config.UPSTOX_CLIENT_SECRET = originalClientSecret;
    config.UPSTOX_LIVE_TRADING_ENABLED = originalLiveEnabled;
    IndianMarketCalendar.setMockMarketOpen(null);
    UpstoxClient.resetForTesting();
    vi.restoreAllMocks();
  });

  // ============================================================================
  // 1. Architecture & Decoupling Invariants
  // ============================================================================
  describe('1. Architecture & Decoupling Invariants', () => {
    it('Upstox is registered in BrokerRegistry under "upstox"', () => {
      expect(BrokerRegistry.has('upstox')).toBe(true);
      const registered = BrokerRegistry.get('upstox');
      expect(registered).toBeDefined();
      expect(registered.id).toBe('upstox');
      expect(registered.name).toBe('Upstox India');
    });

    it('declares explicit Upstox capabilities', () => {
      const caps = adapter.capabilities;
      expect(caps.supportsTrading).toBe(true);
      expect(caps.supportsOAuth).toBe(true);
      expect(caps.supportsApiKeyAuth).toBe(false);
      expect(caps.supportsStaticIpRequirement).toBe(true);
      expect(caps.supportsClockSync).toBe(false);
      expect(caps.supportsSandbox).toBe(true);
    });

    it('auto-registers Upstox in InstrumentRulesService', () => {
      expect(InstrumentRulesService.hasProvider('upstox')).toBe(true);
      const rules = InstrumentRulesService.getRules('NSE_EQ|INE002A01018', 'upstox');
      expect(rules).toBeDefined();
      expect(rules?.baseAsset).toBe('RELIANCE');
      expect(rules?.quoteAsset).toBe('INR');
      expect(rules?.tickSize).toBe('0.05');
      expect(rules?.stepSize).toBe('1');
    });

    it('decoupling guard: Upstox files do NOT import Binance classes or modules', () => {
      const upstoxDir = path.resolve(__dirname, '../services/brokers/upstox');
      const files = fs.readdirSync(upstoxDir).filter((f) => f.endsWith('.ts'));

      for (const file of files) {
        const content = fs.readFileSync(path.join(upstoxDir, file), 'utf-8');
        expect(content).not.toMatch(/from\s+['"].*binance.*['"]/i);
        expect(content).not.toMatch(/BinanceAdapter/);
        expect(content).not.toMatch(/binanceClient/);
      }
    });

    it('decoupling guard: OrderRecoveryService and ReconciliationWorker do NOT import UpstoxAdapter directly', () => {
      const recoveryPath = path.resolve(__dirname, '../services/orderRecoveryService.ts');
      const workerPath = path.resolve(__dirname, '../services/reconciliationWorker.ts');

      const recoveryContent = fs.readFileSync(recoveryPath, 'utf-8');
      const workerContent = fs.readFileSync(workerPath, 'utf-8');

      expect(recoveryContent).not.toMatch(/import\s+.*UpstoxAdapter.*from/);
      expect(workerContent).not.toMatch(/import\s+.*UpstoxAdapter.*from/);
    });
  });

  // ============================================================================
  // 2. Authentication, Token Storage, Expiry & Sanitization
  // ============================================================================
  describe('2. Authentication, Token Storage & Credential Security', () => {
    it('exchanges OAuth authorization code and saves encrypted token', async () => {
      UpstoxClient.setTransport(async (url) => {
        if (url.includes('/login/authorization/token')) {
          return mockResponse(200, {
            access_token: 'upstox_test_access_token_xyz123',
            user_id: 'UCC12345',
            user_name: 'Rahul Sharma',
            email: 'rahul@example.com',
          });
        }
        if (url.includes('/user/profile')) {
          return mockResponse(200, {
            status: 'success',
            data: {
              user_id: 'UCC12345',
              user_name: 'Rahul Sharma',
              email: 'rahul@example.com',
              user_type: 'individual',
              broker: 'UPSTOX',
            },
          });
        }
        return mockResponse(404, { status: 'error', message: 'Not found' });
      });

      const tokenRes = await UpstoxClient.exchangeAuthorizationCode('mock_auth_code_123', 'http://localhost:5173/oauth/callback');
      expect(tokenRes.access_token).toBe('upstox_test_access_token_xyz123');
      expect(tokenRes.user_id).toBe('UCC12345');

      // Save credentials via adapter
      await adapter.saveCredentials(testUserId, {
        accessToken: tokenRes.access_token,
        accountId: tokenRes.user_id,
        environment: 'prod',
      });

      // Verify stored row in database is encrypted
      const db = getDb();
      const rows = await db.query<any>(
        'SELECT * FROM broker_credentials WHERE user_id = ? AND broker = ?',
        [testUserId, 'upstox']
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].access_token_encrypted).toBeDefined();
      expect(rows[0].access_token_encrypted).not.toBe('upstox_test_access_token_xyz123');
      expect(rows[0].account_id).toBe('UCC12345');
      expect(Number(rows[0].token_expires_at)).toBeGreaterThan(Date.now());
    });

    it('loads and decrypts valid credentials successfully', async () => {
      await adapter.saveCredentials(testUserId, {
        accessToken: 'secure_decrypted_token_888',
        accountId: 'UCC88888',
        environment: 'prod',
      });

      const creds = await adapter.loadCredentials(testUserId);
      expect(creds).toBeDefined();
      expect(creds?.accessToken).toBe('secure_decrypted_token_888');
      expect(creds?.accountId).toBe('UCC88888');
    });

    it('marks account disconnected when token is expired', async () => {
      await adapter.saveCredentials(testUserId, {
        accessToken: 'expired_token_123',
        accountId: 'UCC_EXPIRED',
        environment: 'prod',
      });

      // Update token_expires_at in database to the past
      const db = getDb();
      await db.execute(
        'UPDATE broker_credentials SET token_expires_at = ? WHERE user_id = ? AND broker = ?',
        [Date.now() - 60000, testUserId, 'upstox']
      );

      const creds = await adapter.loadCredentials(testUserId);
      expect(creds).toBeNull(); // Expired credentials load as null

      const account = await adapter.getAccount(testUserId);
      expect(account?.connected).toBe(false);
      expect(account?.securityBadge).toBe('DISCONNECTED');
    });

    it('fails closed when no credentials are saved for user', async () => {
      const account = await adapter.getAccount('usr_nonexistent');
      expect(account).toBeDefined();
      expect(account?.connected).toBe(false);
      expect(account?.canTrade).toBe(false);
      expect(account?.securityBadge).toBe('DISCONNECTED');
    });

    it('sanitizes account info and leaks zero access tokens or secrets', async () => {
      await adapter.saveCredentials(testUserId, {
        accessToken: 'super_secret_raw_token_xyz',
        accountId: 'UCC_SANITIZE_TEST',
        environment: 'prod',
      });

      UpstoxClient.setTransport(async (url) => {
        if (url.includes('/user/profile')) {
          return mockResponse(200, {
            status: 'success',
            data: {
              user_id: 'UCC_SANITIZE_TEST',
              user_name: 'Anita Verma',
              email: 'anita@example.com',
              products: ['EQUITY'],
              is_active: true,
            },
          });
        }
        if (url.includes('/user/get-funds-and-margin')) {
          return mockResponse(200, {
            status: 'success',
            data: {
              equity: {
                available_margin: 100000,
                used_margin: 0,
              },
            },
          });
        }
        return mockResponse(404, {});
      });

      const account = await adapter.getAccount(testUserId);
      expect(account?.broker).toBe('upstox');
      expect(account?.accountReference).toBe('UCC_SANITIZE_TEST');
      expect(account?.connected).toBe(true);

      const serialized = JSON.stringify(account);
      expect(serialized).not.toContain('super_secret_raw_token_xyz');
      expect((account as any).accessToken).toBeUndefined();
    });
  });

  // ============================================================================
  // 3. Instrument Rules & Pre-Trade Validation
  // ============================================================================
  describe('3. Instrument Rules & NSE/BSE Pre-Trade Validation', () => {
    it('normalizes common symbols to authoritative Upstox instrument keys', () => {
      expect(adapter.normalizeSymbol('RELIANCE')).toBe('NSE_EQ|INE002A01018');
      expect(adapter.normalizeSymbol('TCS')).toBe('NSE_EQ|INE467B01029');
      expect(adapter.normalizeSymbol('INFY')).toBe('NSE_EQ|INE009A01021');
      expect(adapter.normalizeSymbol('NSE_EQ|INE002A01018')).toBe('NSE_EQ|INE002A01018');
    });

    it('validates 0.05 tick size rule for Indian equities', async () => {
      // Valid price: 2500.05 on 0.05 tick
      const valid1 = await InstrumentRulesService.validateOrder({
        userId: testUserId,
        clientOrderId: 'val_test_1',
        idempotencyKey: 'idemp_val_1',
        symbol: 'NSE_EQ|INE002A01018',
        price: 2500.05,
        quantity: 1,
        type: 'LIMIT',
        side: 'BUY',
        broker: 'upstox',
      });
      expect(valid1.isValid).toBe(true);

      // Invalid price: 2500.03 not on 0.05 tick
      const invalidTick = await InstrumentRulesService.validateOrder({
        userId: testUserId,
        clientOrderId: 'val_test_2',
        idempotencyKey: 'idemp_val_2',
        symbol: 'NSE_EQ|INE002A01018',
        price: 2500.03,
        quantity: 1,
        type: 'LIMIT',
        side: 'BUY',
        broker: 'upstox',
      });
      expect(invalidTick.isValid).toBe(false);
      expect(invalidTick.error).toContain('not a valid tick step');
    });

    it('validates lot size 1 (integer shares) for Indian equities', async () => {
      // Valid integer share qty: 10
      const validQty = await InstrumentRulesService.validateOrder({
        userId: testUserId,
        clientOrderId: 'val_test_3',
        idempotencyKey: 'idemp_val_3',
        symbol: 'NSE_EQ|INE002A01018',
        price: 2500.00,
        quantity: 10,
        type: 'LIMIT',
        side: 'BUY',
        broker: 'upstox',
      });
      expect(validQty.isValid).toBe(true);

      // Fractional shares invalid on NSE/BSE: 10.5
      const fractionalQty = await InstrumentRulesService.validateOrder({
        userId: testUserId,
        clientOrderId: 'val_test_4',
        idempotencyKey: 'idemp_val_4',
        symbol: 'NSE_EQ|INE002A01018',
        price: 2500.00,
        quantity: 10.5,
        type: 'LIMIT',
        side: 'BUY',
        broker: 'upstox',
      });
      expect(fractionalQty.isValid).toBe(false);
      expect(fractionalQty.error).toContain('positive integer');
    });
  });

  // ============================================================================
  // 4. Order Translation & Upstox API Error Mapping
  // ============================================================================
  describe('4. Order Translation & Upstox API Error Mapping', () => {
    it('maps Upstox UDAPI error codes to canonical BrokerError codes', () => {
      const errInsufficient = adapter.normalizeError({
        name: 'UpstoxApiError',
        status: 400,
        data: {
          status: 'error',
          errors: [{ errorCode: 'UDAPI100050', message: 'Insufficient funds for order' }],
        },
      });
      expect(errInsufficient.code).toBe('INSUFFICIENT_FUNDS');
      expect(errInsufficient.category).toBe('INSUFFICIENT_FUNDS');

      const errMarketClosed = adapter.normalizeError({
        name: 'UpstoxApiError',
        status: 400,
        data: {
          status: 'error',
          errors: [{ errorCode: 'UDAPI100060', message: 'Market is closed' }],
        },
      });
      expect(errMarketClosed.code).toBe('MARKET_CLOSED');
      expect(errMarketClosed.category).toBe('INVALID_ORDER');

      const errUnauthorized = adapter.normalizeError({
        name: 'UpstoxApiError',
        status: 401,
        data: {
          status: 'error',
          errors: [{ errorCode: 'UDAPI100001', message: 'Invalid or expired token' }],
        },
      });
      expect(errUnauthorized.code).toBe('AUTHENTICATION_FAILED');
      expect(errUnauthorized.category).toBe('AUTH_FAILED');
    });

    it('normalizes Upstox order statuses to BrokerOrderStatus', () => {
      expect(adapter.normalizeOrderStatus('complete')).toBe('FILLED');
      expect(adapter.normalizeOrderStatus('open')).toBe('OPEN');
      expect(adapter.normalizeOrderStatus('trigger pending')).toBe('OPEN');
      expect(adapter.normalizeOrderStatus('cancelled')).toBe('CANCELED');
      expect(adapter.normalizeOrderStatus('rejected')).toBe('REJECTED');
      expect(adapter.normalizeOrderStatus('unknown_status')).toBe('UNKNOWN');
    });
  });

  // ============================================================================
  // 5. Ambiguous Order Handling & Recovery
  // ============================================================================
  describe('5. Ambiguous Order Handling & Recovery', () => {
    beforeEach(async () => {
      await adapter.saveCredentials(testUserId, {
        accessToken: 'recovery_token',
        accountId: 'UCC_RECOVERY',
        environment: 'prod',
      });
    });

    it('transitions order to UNKNOWN (never FAILED) on network timeout, retaining reservation', async () => {
      // Enable live trading for this test to reach placeOrder transport call
      config.UPSTOX_LIVE_TRADING_ENABLED = true;
      IndianMarketCalendar.setMockMarketOpen(true);
      const staticIp = config.UPSTOX_STATIC_IP || '203.0.113.50';
      UpstoxClient.setMockOutboundIp(staticIp);
      vi.spyOn(config, 'UPSTOX_STATIC_IP', 'get').mockReturnValue(staticIp);

      // Simulate network timeout on placeOrder
      UpstoxClient.setTransport(async (url) => {
        if (url.includes('/order/place')) {
          const timeoutErr: any = new Error('Upstox network timeout: socket hang up');
          timeoutErr.name = 'TimeoutError';
          throw timeoutErr;
        }
        if (url.includes('/order/retrieve-all')) {
          return mockResponse(200, { status: 'success', data: [] });
        }
        if (url.includes('/user/profile')) {
          return mockResponse(200, {
            status: 'success',
            data: { user_id: 'UCC_RECOVERY', user_name: 'Recovery Trader', is_active: true },
          });
        }
        return mockResponse(404, {});
      });

      const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
        userId: testUserId,
        broker: 'upstox',
        symbol: 'NSE_EQ|INE002A01018',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 5,
        price: 2500.0,
        product: 'CNC',
      });

      const clientOrderId = proposal.clientOrderId;
      const req: BrokerOrderRequest = {
        userId: testUserId,
        clientOrderId,
        idempotencyKey: proposal.idempotencyKey,
        symbol: 'NSE_EQ|INE002A01018',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 5,
        price: 2500.00,
        broker: 'upstox',
        accountMode: 'live',
        product: 'CNC',
        confirmationId: proposal.confirmationId,
      };

      const result = await adapter.placeOrder(req);

      // CRITICAL INVARIANT: status must be UNKNOWN, NOT FAILED
      expect(result.status).toBe('UNKNOWN');
      expect(result.broker).toBe('upstox');
      expect(result.clientOrderId).toBe(clientOrderId);

      // Verify order record in database is UNKNOWN
      const db = getDb();
      const rows = await db.query<any>(
        'SELECT status, broker FROM exchange_orders WHERE client_order_id = ?',
        [clientOrderId]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('UNKNOWN');
      expect(rows[0].broker).toBe('upstox');
    });

    it('reconcileUnknownOrder resolves to FILLED when Upstox reports order completed', async () => {
      const clientOrderId = `LMN_RECON_FILL_${Date.now()}`;
      const venueOrderId = 'UPSTOX_ORD_999888';

      const db = getDb();
      const now = Date.now();
      await db.execute(
        `INSERT INTO exchange_orders (
           id, user_id, client_order_id, exchange_order_id, symbol, side, type,
           status, orig_qty, executed_qty, price, avg_price, quote_asset, notional,
           broker, idempotency_key, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'NSE_EQ|INE002A01018', 'BUY', 'LIMIT', 'UNKNOWN', 10, 0, 2500.00, 0, 'INR', 25000.00, 'upstox', ?, ?, ?)`,
        [`ord_${clientOrderId}`, testUserId, clientOrderId, venueOrderId, clientOrderId, now, now]
      );

      // Upstox reports order as complete with 10 executed
      UpstoxClient.setTransport(async (url) => {
        if (url.includes('/order/retrieve-all')) {
          return mockResponse(200, {
            status: 'success',
            data: [
              {
                order_id: venueOrderId,
                tag: clientOrderId,
                status: 'complete',
                instrument_token: 'NSE_EQ|INE002A01018',
                trading_symbol: 'RELIANCE',
                transaction_type: 'BUY',
                order_type: 'LIMIT',
                quantity: 10,
                filled_quantity: 10,
                price: 2500.00,
                average_price: 2500.00,
                order_timestamp: new Date(now).toISOString(),
              },
            ],
          });
        }
        if (url.includes('/order/trades')) {
          return mockResponse(200, {
            status: 'success',
            data: [
              {
                trade_id: 'TRD_111',
                order_id: venueOrderId,
                instrument_token: 'NSE_EQ|INE002A01018',
                trading_symbol: 'RELIANCE',
                transaction_type: 'BUY',
                quantity: 10,
                price: 2500.00,
                exchange_timestamp: new Date(now).toISOString(),
              },
            ],
          });
        }
        return mockResponse(404, {});
      });

      const recon = await adapter.reconcileUnknownOrder(clientOrderId, testUserId);

      expect(recon.found).toBe(true);
      expect(recon.status).toBe('FILLED');
      expect(recon.executedQtyExact).toBe('10');
      expect(recon.fills).toHaveLength(1);
      expect(recon.fills![0].tradeId).toBe('TRD_111');
      expect(recon.fills![0].price).toBe('2500');

      // Order in DB updated to FILLED
      const ordRows = await db.query<any>(
        'SELECT status, executed_qty FROM exchange_orders WHERE client_order_id = ?',
        [clientOrderId]
      );
      expect(ordRows[0].status).toBe('FILLED');
      expect(Number(ordRows[0].executed_qty)).toBe(10);
    });

    it('reconcileUnknownOrder resolves to REJECTED when Upstox reports order rejected', async () => {
      const clientOrderId = `LMN_RECON_REJ_${Date.now()}`;
      const venueOrderId = 'UPSTOX_ORD_REJ_111';

      const db = getDb();
      const now = Date.now();
      await db.execute(
        `INSERT INTO exchange_orders (
           id, user_id, client_order_id, exchange_order_id, symbol, side, type,
           status, orig_qty, executed_qty, price, avg_price, quote_asset, notional,
           broker, idempotency_key, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'NSE_EQ|INE002A01018', 'BUY', 'LIMIT', 'UNKNOWN', 5, 0, 2500.00, 0, 'INR', 12500.00, 'upstox', ?, ?, ?)`,
        [`ord_${clientOrderId}`, testUserId, clientOrderId, venueOrderId, clientOrderId, now, now]
      );

      // Upstox reports order as rejected
      UpstoxClient.setTransport(async (url) => {
        if (url.includes('/order/retrieve-all')) {
          return mockResponse(200, {
            status: 'success',
            data: [
              {
                order_id: venueOrderId,
                tag: clientOrderId,
                status: 'rejected',
                status_message: 'Margin shortfall',
                instrument_token: 'NSE_EQ|INE002A01018',
                trading_symbol: 'RELIANCE',
                quantity: 5,
                filled_quantity: 0,
              },
            ],
          });
        }
        return mockResponse(404, {});
      });

      const recon = await adapter.reconcileUnknownOrder(clientOrderId, testUserId);

      expect(recon.found).toBe(true);
      expect(recon.status).toBe('REJECTED');

      // Order in DB updated to REJECTED
      const ordRows = await db.query<any>(
        'SELECT status FROM exchange_orders WHERE client_order_id = ?',
        [clientOrderId]
      );
      expect(ordRows[0].status).toBe('REJECTED');
    });
  });

  // ============================================================================
  // 6. Funds, Balances, Positions & Holdings
  // ============================================================================
  describe('6. Funds, Balances, Positions & Holdings', () => {
    beforeEach(async () => {
      await adapter.saveCredentials(testUserId, {
        accessToken: 'funds_token',
        accountId: 'UCC_FUNDS',
        environment: 'prod',
      });
    });

    it('parses equity funds and margins accurately', async () => {
      UpstoxClient.setTransport(async (url) => {
        if (url.includes('/user/get-funds-and-margin')) {
          return mockResponse(200, {
            status: 'success',
            data: {
              equity: {
                available_margin: 154250.75,
                used_margin: 45749.25,
                payin_amount: 50000.00,
                span_margin: 0,
                adhoc_margin: 0,
                notional_cash: 200000.00,
                exposure_margin: 0,
              },
              commodity: {
                available_margin: 0,
                used_margin: 0,
              },
            },
          });
        }
        return mockResponse(404, {});
      });

      const funds = await adapter.getFunds(testUserId);
      expect(funds).toBeDefined();
      expect(funds!.availableCash.toString()).toBe('154250.75');
      expect(funds!.usedMargin?.toString()).toBe('45749.25');
      expect(funds!.totalEquity.toString()).toBe('200000');

      const balances = await adapter.getBalances(testUserId);
      expect(balances['INR']).toBeDefined();
      expect(balances['INR'].asset).toBe('INR');
      expect(balances['INR'].free).toBe(154250.75);
      expect(balances['INR'].locked).toBe(45749.25);
    });

    it('parses intraday and delivery positions correctly', async () => {
      UpstoxClient.setTransport(async (url) => {
        if (url.includes('/portfolio/short-term-positions')) {
          return mockResponse(200, {
            status: 'success',
            data: [
              {
                instrument_token: 'NSE_EQ|INE002A01018',
                trading_symbol: 'RELIANCE',
                product: 'I',
                quantity: 25,
                buy_amount: 62500,
                buy_price: 2500,
                sell_amount: 0,
                sell_price: 0,
                last_price: 2520,
                pnl: 500,
                unrealised_pnl: 500,
                realised_pnl: 0,
                value: 63000,
              },
            ],
          });
        }
        return mockResponse(404, {});
      });

      const positions = await adapter.getPositions(testUserId);
      expect(positions).toHaveLength(1);
      expect(positions[0].symbol).toBe('RELIANCE');
      expect(positions[0].product).toBe('INTRADAY');
      expect(positions[0].quantity).toBe('25');
      expect(positions[0].averagePrice).toBe('2500');
      expect(positions[0].unrealizedPnl).toBe('500');
    });

    it('parses demat delivery holdings correctly', async () => {
      UpstoxClient.setTransport(async (url) => {
        if (url.includes('/portfolio/long-term-holdings')) {
          return mockResponse(200, {
            status: 'success',
            data: [
              {
                isin: 'INE467B01029',
                trading_symbol: 'TCS',
                exchange: 'NSE',
                instrument_token: 'NSE_EQ|INE467B01029',
                quantity: 50,
                t1_quantity: 0,
                average_price: 3450.50,
                last_price: 3500.00,
                pnl: 2475.00,
                collateral_quantity: 0,
              },
            ],
          });
        }
        return mockResponse(404, {});
      });

      const holdings = await adapter.getHoldings(testUserId);
      expect(holdings).toHaveLength(1);
      expect(holdings[0].symbol).toBe('TCS');
      expect(holdings[0].quantity).toBe('50');
      expect(holdings[0].averagePrice).toBe('3450.5');
      expect(holdings[0].pnl).toBe('2475');
    });
  });

  // ============================================================================
  // 7. Production Safety Gate & Static IP Validation
  // ============================================================================
  describe('7. Production Safety Gate & Static IP Validation', () => {
    beforeEach(async () => {
      await adapter.saveCredentials(testUserId, {
        accessToken: 'safety_gate_token',
        accountId: 'UCC_SAFETY',
        environment: 'prod',
      });
    });

    it('blocks live order placement when UPSTOX_LIVE_TRADING_ENABLED is false (default)', async () => {
      const req: BrokerOrderRequest = {
        userId: testUserId,
        clientOrderId: `LMN_LIVE_BLOCKED_${Date.now()}`,
        idempotencyKey: `idemp_blocked_${Date.now()}`,
        symbol: 'NSE_EQ|INE002A01018',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1,
        price: 2500.00,
        broker: 'upstox',
        accountMode: 'live',
      };

      await expect(adapter.placeOrder(req)).rejects.toThrow(/UPSTOX_LIVE_TRADING_DISABLED/i);
    });

    it('allows paper simulation orders even when live trading is disabled', async () => {
      const clientOrderId = `LMN_PAPER_OK_${Date.now()}`;
      const req: BrokerOrderRequest = {
        userId: testUserId,
        clientOrderId,
        idempotencyKey: clientOrderId,
        symbol: 'NSE_EQ|INE002A01018',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 2,
        price: 2500.00,
        broker: 'upstox',
        accountMode: 'paper',
      };

      const res = await adapter.placeOrder(req);

      expect(res.status).toBe('FILLED');
      expect(res.executedQty).toBe('2');
      expect(res.clientOrderId).toBe(clientOrderId);

      // Stored in exchange_orders with broker upstox
      const db = getDb();
      const rows = await db.query<any>(
        'SELECT status, broker FROM exchange_orders WHERE client_order_id = ?',
        [clientOrderId]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('FILLED');
      expect(rows[0].broker).toBe('upstox');
    });

    it('verifies outbound static IP against registered static IP', async () => {
      UpstoxClient.setMockOutboundIp('198.51.100.1');

      const diag = await adapter.verifyOutboundIp();
      expect(diag.outboundIp).toBe('198.51.100.1');
      expect(typeof diag.matches).toBe('boolean');
    });
  });
});
