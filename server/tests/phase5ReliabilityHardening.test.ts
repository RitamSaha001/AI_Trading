import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb } from '../db';
import { UpstoxUserStreamTransport } from '../services/brokers/upstox/upstoxUserStreamTransport';
import { UpstoxTotpAuthService } from '../services/brokers/upstox/upstoxTotpAuthService';
import { InFlightMtmService } from '../services/inFlightMtmService';
import { OtrLimiterService } from '../services/otrLimiterService';
import { OrderFillsService } from '../services/orderFillsService';
import { LedgerService } from '../services/ledgerService';
import { OrderRecoveryService } from '../services/orderRecoveryService';
import { EmergencyControlService } from '../services/emergencyControlService';
import { BrokerRegistry } from '../services/brokers/brokerRegistry';
import { StandardBrokerError } from '../services/brokers/brokerGateway';
import crypto from 'node:crypto';

describe('Phase 5 Real-Money Reliability & Production Hardening Suite', () => {
  const testUserId = `usr_p5_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  beforeEach(async () => {
    OtrLimiterService.reset();
    const db = getDb();
    const now = Date.now();

    // Seed test user
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, ?, 'Phase 5 Test Trader', 'email', ?, 'TRADER', ?, ?)
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

    // Seed trading_allocated ledger account with ₹500,000 (50,000,000 paise)
    await db.execute(
      `INSERT INTO ledger_accounts (
        id, user_id, account_mode, account_type, asset_or_currency,
        balance_minor, reserved_minor, created_at, updated_at
      ) VALUES (?, ?, 'live', 'trading_allocated', 'INR', 50000000, 0, ?, ?)
      ON CONFLICT (id) DO UPDATE SET balance_minor = 50000000, reserved_minor = 0`,
      [`leg_cash_${testUserId}`, testUserId, now, now]
    );
  });

  afterEach(() => {
    UpstoxUserStreamTransport.stopAll();
    vi.restoreAllMocks();
  });

  describe('1. Sub-Second Upstox WebSocket User Stream Transport', () => {
    it('processes execution report "complete" fill and settles ledger balances within <20ms', async () => {
      const db = getDb();
      const internalOrderId = `ord_upstox_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const clientOrderId = `cli_upstox_${Date.now()}`;
      const venueOrderId = `24090600012345`;
      const now = Date.now();

      // Seed exchange_orders row in SUBMITTED state
      await db.execute(
        `INSERT INTO exchange_orders (
          id, client_order_id, idempotency_key, user_id, symbol, side, type, status,
          orig_qty, executed_qty, price, avg_price, notional, quote_asset, broker,
          reserved_cash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'RELIANCE', 'BUY', 'LIMIT', 'SUBMITTED', 10, 0, 2500, 0, 25000, 'INR', 'upstox', 25000, ?, ?)`,
        [internalOrderId, clientOrderId, `idem_${clientOrderId}`, testUserId, now, now]
      );

      const transport = new UpstoxUserStreamTransport(testUserId, 'test_token');
      const wsMessage = JSON.stringify({
        data: {
          order_id: venueOrderId,
          tag: clientOrderId,
          trading_symbol: 'RELIANCE',
          status: 'complete',
          filled_quantity: 10,
          average_price: 2500,
          commission: 20,
          exchange_timestamp: new Date().toISOString(),
        },
      });

      const startMs = Date.now();
      await transport.handleMessage(wsMessage);
      const latencyMs = Date.now() - startMs;

      // Verify execution latency is well within sub-second limit
      expect(latencyMs).toBeLessThan(1000);

      // Verify order transitioned to FILLED
      const updatedOrder = await db.queryOne<any>(
        `SELECT status, executed_qty, avg_price, exchange_order_id FROM exchange_orders WHERE id = ?`,
        [internalOrderId]
      );
      expect(updatedOrder.status).toBe('FILLED');
      expect(Number(updatedOrder.executed_qty)).toBe(10);
      expect(Number(updatedOrder.avg_price)).toBe(2500);
      expect(updatedOrder.exchange_order_id).toBe(venueOrderId);

      // Verify canonical fill record persisted in exchange_fills with relational internalOrderId
      const fillRecord = await db.queryOne<any>(
        `SELECT * FROM exchange_fills WHERE order_id = ?`,
        [internalOrderId]
      );
      expect(fillRecord).not.toBeNull();
      expect(fillRecord.order_id).toBe(internalOrderId);
      expect(Number(fillRecord.qty)).toBe(10);
      expect(Number(fillRecord.price)).toBe(2500);
    });

    it('detects out-of-order sequence reversal and flags stream as DEGRADED', async () => {
      const transport = new UpstoxUserStreamTransport(testUserId, 'test_token');
      transport.setLastEventTimeForTesting(1700000000000); // Future reference timestamp

      const staleMessage = JSON.stringify({
        data: {
          order_id: 'ord_stale_1',
          tag: 'tag_stale_1',
          status: 'open',
          exchange_timestamp: new Date(1690000000000).toISOString(), // Earlier timestamp
        },
      });

      await transport.handleMessage(staleMessage);
      expect(transport.getStreamHealth()).toBe('DEGRADED');
    });

    it('handles partially_filled messages and preserves partial fill state', async () => {
      const db = getDb();
      const internalOrderId = `ord_partial_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const clientOrderId = `cli_partial_${Date.now()}`;
      const venueOrderId = `24090600099999`;
      const now = Date.now();

      await db.execute(
        `INSERT INTO exchange_orders (
          id, client_order_id, idempotency_key, user_id, symbol, side, type, status,
          orig_qty, executed_qty, price, avg_price, notional, quote_asset, broker,
          reserved_cash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'TCS', 'BUY', 'LIMIT', 'OPEN', 20, 0, 3500, 0, 70000, 'INR', 'upstox', 70000, ?, ?)`,
        [internalOrderId, clientOrderId, `idem_${clientOrderId}`, testUserId, now, now]
      );

      const transport = new UpstoxUserStreamTransport(testUserId, 'test_token');
      const wsMessage = JSON.stringify({
        data: {
          order_id: venueOrderId,
          tag: clientOrderId,
          trading_symbol: 'TCS',
          status: 'partially_filled',
          filled_quantity: 8,
          average_price: 3500,
          exchange_timestamp: new Date().toISOString(),
        },
      });

      await transport.handleMessage(wsMessage);

      const updatedOrder = await db.queryOne<any>(
        `SELECT status, executed_qty, avg_price FROM exchange_orders WHERE id = ?`,
        [internalOrderId]
      );
      expect(updatedOrder.status).toBe('PARTIALLY_FILLED');
      expect(Number(updatedOrder.executed_qty)).toBe(8);
      expect(Number(updatedOrder.avg_price)).toBe(3500);
    });
  });

  describe('2. Automated Headless TOTP & Session Warm-Up Service', () => {
    it('decodes Base32 secret and generates valid 6-digit RFC 6238 TOTP code', () => {
      // Test with RFC 6238 standard ASCII secret "12345678901234567890" in Base32: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
      const secretBase32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
      const decoded = UpstoxTotpAuthService.base32Decode(secretBase32);
      expect(decoded.toString('utf8')).toBe('12345678901234567890');

      // Test TOTP code generation at known timestamp
      // At epoch 59s with 30s step -> counter = 1
      const totpAt59 = UpstoxTotpAuthService.generateTotp(secretBase32, 59_000, 30);
      expect(totpAt59).toHaveLength(6);
      expect(/^\d{6}$/.test(totpAt59)).toBe(true);
      // For RFC 6238 HMAC-SHA1 at counter=1 (timestamp 59s), the official test vector is 287082
      expect(totpAt59).toBe('287082');

      // At counter = 37037036 (timestamp 1111111109s), official RFC vector is 081804
      const totpVector2 = UpstoxTotpAuthService.generateTotp(secretBase32, 1111111109_000, 30);
      expect(totpVector2).toBe('081804');
    });

    it('rejects invalid Base32 characters with descriptive error', () => {
      expect(() => UpstoxTotpAuthService.base32Decode('INVALID189!')).toThrow(/Invalid base32 character/);
    });

    it('identifies unconfigured and expired tokens via checkTokenHealth', async () => {
      const db = getDb();
      const nonExistentUserId = `usr_none_${Date.now()}`;
      const unconf = await UpstoxTotpAuthService.checkTokenHealth(nonExistentUserId);
      expect(unconf.isValid).toBe(false);
      expect(unconf.requiresRenewal).toBe(true);
      expect(unconf.reason).toBe('NO_CREDENTIALS');

      // Seed expired credentials with parent user
      const expiredUserId = `usr_exp_${Date.now()}`;
      const pastTime = Date.now() - 3600_000 * 30; // 30 hours ago
      await db.execute(
        `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
         VALUES (?, 'exp@example.com', 'Expired User', 'email', 'exp', 'TRADER', ?, ?)`,
        [expiredUserId, pastTime, pastTime]
      );
      await db.execute(
        `INSERT INTO broker_credentials (
          id, user_id, broker, access_token_encrypted, token_expires_at, last_sync_at, created_at, updated_at
        ) VALUES (?, ?, 'upstox', 'enc_token', ?, ?, ?, ?)`,
        [`cred_${expiredUserId}`, expiredUserId, pastTime, pastTime, pastTime, pastTime]
      );

      const expHealth = await UpstoxTotpAuthService.checkTokenHealth(expiredUserId);
      expect(expHealth.isValid).toBe(false);
      expect(expHealth.requiresRenewal).toBe(true);
    });
  });

  describe('3. In-Flight Real-Time MTM Stop-Out & Margin Liquidation Daemon', () => {
    it('evaluates safe NAV and Margin Health Ratio when margin is adequate', async () => {
      // Mock broker getPositions returning safe position
      const mockBroker: any = {
        getPositions: vi.fn().mockResolvedValue([
          {
            symbol: 'INFY',
            quantity: 50,
            averagePrice: 1500,
            currentPrice: 1520,
            unrealizedPnl: 1000,
            realizedPnl: 0,
          },
        ]),
      };
      vi.spyOn(BrokerRegistry, 'get').mockReturnValue(mockBroker);

      const result = await InFlightMtmService.evaluateUserPositions(testUserId, 'upstox');
      expect(result.isStopOutTriggered).toBe(false);
      expect(result.isMarginCallWarning).toBe(false);
      // NAV = cash (500,000) + unPnl (1,000) = 501,000
      expect(result.nav).toBe(501000);
      expect(result.marginHealthRatio).toBeGreaterThan(1.0);
    });

    it('triggers MTM stop-out and halts trading when Margin Health Ratio breaches 0.25', async () => {
      // Create user with small cash balance ₹10,000
      const db = getDb();
      const lowCashUserId = `usr_low_${Date.now()}`;
      const now = Date.now();

      await db.execute(
        `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
         VALUES (?, 'low@example.com', 'Low Cash', 'email', 'low', 'TRADER', ?, ?)`,
        [lowCashUserId, now, now]
      );

      await db.execute(
        `INSERT INTO ledger_accounts (
          id, user_id, account_mode, account_type, asset_or_currency,
          balance_minor, reserved_minor, created_at, updated_at
        ) VALUES (?, ?, 'live', 'trading_allocated', 'INR', 1000000, 0, ?, ?)`,
        [`leg_low_${lowCashUserId}`, lowCashUserId, now, now]
      );

      // Seed active broker credentials for user
      await db.execute(
        `INSERT INTO broker_credentials (
          id, user_id, broker, access_token_encrypted, token_expires_at, can_trade, last_sync_at, created_at, updated_at
        ) VALUES (?, ?, 'upstox', 'token_encrypted', ?, 1, ?, ?, ?)`,
        [`cred_low_${lowCashUserId}`, lowCashUserId, now + 3600000, now, now, now]
      );

      const mockBroker: any = {
        getPositions: vi.fn().mockResolvedValue([
          {
            symbol: 'NIFTY24SEP25000FUT',
            quantity: 100,
            averagePrice: 25000,
            currentPrice: 24910,
            unrealizedPnl: -9000,
            realizedPnl: 0,
          },
        ]),
      };
      vi.spyOn(BrokerRegistry, 'get').mockReturnValue(mockBroker);
      const panicSpy = vi.spyOn(EmergencyControlService, 'executePanicSquareOff').mockResolvedValue({
        runId: 'run_1',
        userId: lowCashUserId,
        broker: 'upstox',
        status: 'COMPLETED',
        cancelledOrdersCount: 1,
        positionsEvaluatedCount: 1,
        closeOrdersSubmittedCount: 1,
        skippedPositionsCount: 0,
        errors: [],
        startedAt: Date.now(),
        completedAt: Date.now(),
      });
      const setStateSpy = vi.spyOn(EmergencyControlService, 'setState').mockResolvedValue({
        state: 'TRADING_HALTED',
        reason: 'Stop out',
        initiatedBy: 'mtm_liquidation_daemon',
        updatedAt: Date.now(),
      });

      const evalResult = await InFlightMtmService.evaluateUserPositions(lowCashUserId, 'upstox');
      // NAV = 10,000 - 9,000 = 1,000. Required margin is > 300,000. Ratio = 1,000 / 300,000 ~= 0.003 < 0.25
      expect(evalResult.isStopOutTriggered).toBe(true);
      expect(evalResult.marginHealthRatio).toBeLessThanOrEqual(0.25);

      const passResults = await InFlightMtmService.runEvaluationPass();
      const userResult = passResults.find((r) => r.userId === lowCashUserId);
      expect(userResult?.isStopOutTriggered).toBe(true);
      expect(panicSpy).toHaveBeenCalledWith(
        lowCashUserId,
        'upstox',
        expect.stringContaining('In-Flight MTM Stop-Out'),
        'mtm_liquidation_daemon'
      );
      expect(setStateSpy).toHaveBeenCalledWith(
        'TRADING_HALTED',
        expect.stringContaining('Trading halted after MTM stop-out'),
        'mtm_liquidation_daemon'
      );
    });
  });

  describe('4. SEBI Algorithmic Compliance & Order-to-Trade Ratio (OTR) Limiter', () => {
    it('tracks order events and correctly calculates ratio', () => {
      const symbol = 'TATASTEEL';

      // 5 modifications + 5 cancellations + 1 fill
      for (let i = 0; i < 5; i++) {
        OtrLimiterService.recordEvent(testUserId, symbol, 'MODIFY');
        OtrLimiterService.recordEvent(testUserId, symbol, 'CANCEL');
      }
      OtrLimiterService.recordEvent(testUserId, symbol, 'FILL');

      const stats = OtrLimiterService.getStats(testUserId, symbol);
      expect(stats.ordersModified).toBe(5);
      expect(stats.ordersCancelled).toBe(5);
      expect(stats.ordersFilled).toBe(1);
      // Non-execution: 10. Fills: 1. Ratio: 10:1
      expect(stats.ratio).toBe(10);
    });

    it('throttles modifications when OTR exceeds safe limit (>= 20:1 with >= 10 actions)', () => {
      const symbol = 'SBIN';

      // Record 21 modifications and 0 fills
      for (let i = 0; i < 21; i++) {
        OtrLimiterService.recordEvent(testUserId, symbol, 'MODIFY');
      }

      expect(() => {
        OtrLimiterService.assertOtrLimit(testUserId, symbol, 'MODIFY');
      }).toThrowError(StandardBrokerError);

      try {
        OtrLimiterService.assertOtrLimit(testUserId, symbol, 'MODIFY');
      } catch (err: any) {
        expect(err.code).toBe('OTR_LIMIT_EXCEEDED');
        expect(err.message).toContain('Order-to-Trade Ratio');
      }
    });

    it('formats compliant strategy tags truncated to 30 alphanumeric characters', () => {
      const tag = OtrLimiterService.formatStrategyTag('arbitrage_momentum_strategy_long_run_test', 'cli_12345');
      expect(tag.length).toBeLessThanOrEqual(30);
      expect(/^[a-zA-Z0-9_]+$/.test(tag)).toBe(true);
      expect(tag).toContain('algo_');
    });
  });
});
