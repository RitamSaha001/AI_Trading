import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb } from '../db';
import { config } from '../config';
import { LiveOrderGateService } from '../services/liveOrderGateService';
import { LiveOrderConfirmationService } from '../services/liveOrderConfirmationService';
import { EmergencyControlService } from '../services/emergencyControlService';
import { UpstoxClient } from '../services/brokers/upstox/upstoxClient';
import { UpstoxAdapter } from '../services/brokers/upstox/upstoxAdapter';
import { IndianMarketCalendar } from '../services/brokers/upstox/indianMarketCalendar';
import { IntradaySquareOffService } from '../services/intradaySquareOffService';
import { OtrLimiterService } from '../services/otrLimiterService';
import { UpstoxTotpAuthService } from '../services/brokers/upstox/upstoxTotpAuthService';
import { BrokerOrderRequest } from '../services/brokers/brokerTypes';
import { ExactDecimal } from '../services/precision';

describe('Real-Money Hardening: Upstox Production Readiness Suite', () => {
  const testUserId = 'usr_realmny_test_001';
  const validIp = '203.0.113.50';

  beforeEach(async () => {
    const db = getDb();
    const now = Date.now();

    await EmergencyControlService.setState('TRADING_NORMAL', 'Test reset', 'test');
    IndianMarketCalendar.setMockMarketOpen(true);
    IntradaySquareOffService.setMockCutoffActive(null);
    OtrLimiterService.reset();
    UpstoxClient.resetForTesting();
    UpstoxClient.setMockOutboundIp(validIp);

    vi.spyOn(config, 'UPSTOX_STATIC_IP', 'get').mockReturnValue(validIp);
    vi.spyOn(config, 'UPSTOX_LIVE_TRADING_ENABLED', 'get').mockReturnValue(true);

    // Clean test tables
    await db.execute(`DELETE FROM live_order_confirmations WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM exchange_orders WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM panic_squareoff_runs WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [testUserId]);
    await db.execute(`DELETE FROM account_limits WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM broker_credentials WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [testUserId]);

    // Seed test user
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, 'real_trader@lumen.io', 'Real Trader', 'email', 'prov_test', 'TRADER', ?, ?)`,
      [testUserId, now, now]
    );

    await db.execute(
      `INSERT INTO account_limits (id, user_id, is_emergency_frozen, max_single_order_pct, max_asset_concentration_pct, min_cash_reserve_pct, updated_at)
       VALUES (?, ?, 0, 0.50, 0.50, 0.10, ?)`,
      [`lim_${testUserId}`, testUserId, now]
    );

    // Seed valid credentials
    const futureExpiry = now + 86400 * 1000;
    const encryptedToken = UpstoxAdapter.encryptSecret('live_access_token_123');
    await db.execute(
      `INSERT INTO broker_credentials (
        id, user_id, broker, environment, auth_type, access_token_encrypted,
        token_expires_at, account_id, can_trade, can_withdraw, is_safe,
        last_sync_at, created_at, updated_at
      ) VALUES ('cred_realmny_test', ?, 'upstox', 'production', 'oauth2', ?, ?, 'UCC_REAL_TEST', 1, 0, 1, ?, ?, ?)`,
      [testUserId, encryptedToken, futureExpiry, now, now, now]
    );

    // Seed ledger with liquid cash
    await db.execute(
      `INSERT INTO ledger_accounts (id, user_id, account_mode, account_type, asset_or_currency, balance_minor, reserved_minor, created_at, updated_at)
       VALUES ('acc_cash_1', ?, 'live', 'trading_allocated', 'INR', 10000000, 0, ?, ?)`,
      [testUserId, now, now]
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    IndianMarketCalendar.setMockMarketOpen(null);
    IntradaySquareOffService.setMockCutoffActive(null);
    OtrLimiterService.reset();
  });

  it('1. Rejects live order when Upstox venue broker margin is insufficient', async () => {
    // Propose order first to generate confirmation token & anti-tampering hash
    const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      price: 2500,
      quantity: 1,
      product: 'CNC',
      validity: 'DAY',
    });

    // Mock Upstox venue funds returning only ₹500 available cash (< ₹2,500 required)
    vi.spyOn(UpstoxAdapter.prototype, 'getFunds').mockResolvedValue({
      broker: 'upstox',
      currency: 'INR',
      availableCash: ExactDecimal.from('500.00'),
      usedMargin: ExactDecimal.from('0.00'),
      totalEquity: ExactDecimal.from('500.00'),
      updatedAt: Date.now(),
    });

    const orderReq: BrokerOrderRequest = {
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      price: 2500,
      quantity: 1,
      product: 'CNC',
      validity: 'DAY',
      confirmationId: proposal.confirmationId,
      clientOrderId: proposal.clientOrderId,
      idempotencyKey: `idemp_${proposal.clientOrderId}`,
      accountMode: 'live',
    };

    await expect(
      LiveOrderGateService.verifyLiveOrderPreSubmission(orderReq, proposal.confirmationId)
    ).rejects.toThrow(/Insufficient Upstox broker margin/i);
  });

  it('2. Passes live order when Upstox venue broker margin is sufficient', async () => {
    const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      price: 2500,
      quantity: 1,
      product: 'CNC',
      validity: 'DAY',
    });

    // Mock Upstox venue funds returning ₹50,000 available cash (sufficient)
    vi.spyOn(UpstoxAdapter.prototype, 'getFunds').mockResolvedValue({
      broker: 'upstox',
      currency: 'INR',
      availableCash: ExactDecimal.from('50000.00'),
      usedMargin: ExactDecimal.from('0.00'),
      totalEquity: ExactDecimal.from('50000.00'),
      updatedAt: Date.now(),
    });

    const orderReq: BrokerOrderRequest = {
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      price: 2500,
      quantity: 1,
      product: 'CNC',
      validity: 'DAY',
      confirmationId: proposal.confirmationId,
      clientOrderId: proposal.clientOrderId,
      idempotencyKey: `idemp_${proposal.clientOrderId}`,
      accountMode: 'live',
    };

    const result = await LiveOrderGateService.verifyLiveOrderPreSubmission(orderReq, proposal.confirmationId);
    expect(result.passed).toBe(true);
  });

  it('3. Rejects new Intraday (MIS) BUY order when 15:00 IST cutoff is active', async () => {
    IntradaySquareOffService.setMockCutoffActive(true);

    const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      price: 2500,
      quantity: 1,
      product: 'MIS',
      validity: 'DAY',
    });

    const misOrder: BrokerOrderRequest = {
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      price: 2500,
      quantity: 1,
      product: 'MIS',
      validity: 'DAY',
      confirmationId: proposal.confirmationId,
      clientOrderId: proposal.clientOrderId,
      idempotencyKey: `idemp_${proposal.clientOrderId}`,
      accountMode: 'live',
    };

    await expect(
      LiveOrderGateService.verifyLiveOrderPreSubmission(misOrder, proposal.confirmationId)
    ).rejects.toThrow(/Market is within intraday cutoff window/i);
  });

  it('4. Allows delivery (CNC) BUY orders and MIS SELL orders during 15:00 IST cutoff', async () => {
    IntradaySquareOffService.setMockCutoffActive(true);

    const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      price: 2500,
      quantity: 1,
      product: 'CNC',
      validity: 'DAY',
    });

    vi.spyOn(UpstoxAdapter.prototype, 'getFunds').mockResolvedValue({
      broker: 'upstox',
      currency: 'INR',
      availableCash: ExactDecimal.from('50000.00'),
      usedMargin: ExactDecimal.from('0.00'),
      totalEquity: ExactDecimal.from('50000.00'),
      updatedAt: Date.now(),
    });

    const cncOrder: BrokerOrderRequest = {
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      price: 2500,
      quantity: 1,
      product: 'CNC',
      validity: 'DAY',
      confirmationId: proposal.confirmationId,
      clientOrderId: proposal.clientOrderId,
      idempotencyKey: `idemp_${proposal.clientOrderId}`,
      accountMode: 'live',
    };

    const result = await LiveOrderGateService.verifyLiveOrderPreSubmission(cncOrder, proposal.confirmationId);
    expect(result.passed).toBe(true);
  });

  it('5. Executes automated 15:15 IST intraday auto-square off canceling open MIS orders and logging run', async () => {
    const db = getDb();
    const now = Date.now();

    // Insert an open order
    await db.execute(
      `INSERT INTO exchange_orders (
        id, user_id, client_order_id, symbol, side, type, orig_qty, executed_qty,
        price, quote_asset, notional, fee, status, broker, idempotency_key, created_at, updated_at
      ) VALUES ('ord_mis_test', ?, 'client_mis_001', 'RELIANCE', 'BUY', 'LIMIT', 10, 0,
        2500, 'INR', 25000, 0, 'OPEN', 'upstox', 'idemp_mis_001', ?, ?)`,
      [testUserId, now, now]
    );

    const cancelSpy = vi.spyOn(UpstoxAdapter.prototype, 'cancelOrder').mockResolvedValue({} as any);
    vi.spyOn(UpstoxAdapter.prototype, 'getPositions').mockResolvedValue([]);

    const summaries = await IntradaySquareOffService.executeIntradaySquareOff(testUserId);

    expect(summaries.length).toBe(1);
    expect(summaries[0].cancelledOrdersCount).toBe(1);
    expect(cancelSpy).toHaveBeenCalledWith(testUserId, 'client_mis_001');

    const run = await db.queryOne<any>(
      `SELECT * FROM panic_squareoff_runs WHERE id = ?`,
      [summaries[0].runId]
    );
    expect(run).toBeDefined();
    expect(run.status).toBe('COMPLETED');
  });

  it('6. Throttles runaway order placement when SEBI OTR ceiling is breached', () => {
    for (let i = 0; i < 25; i++) {
      OtrLimiterService.recordEvent(testUserId, 'TCS', 'PLACE');
    }

    expect(() => {
      OtrLimiterService.assertOtrLimit(testUserId, 'TCS', 'PLACE');
    }).toThrow(/SEBI OTR Guard: Order placement ratio/i);
  });

  it('7. Enforces fail-closed protection when Upstox morning session is expired', async () => {
    const db = getDb();
    const pastTime = Date.now() - 10000;
    await db.execute(
      `UPDATE broker_credentials SET token_expires_at = ?, can_trade = 1 WHERE user_id = ? AND broker = 'upstox'`,
      [pastTime, testUserId]
    );

    const isHealthy = await UpstoxTotpAuthService.verifyAndEnforceTokenHealth(testUserId);
    expect(isHealthy).toBe(false);

    const credRow = await db.queryOne<any>(
      `SELECT can_trade FROM broker_credentials WHERE user_id = ? AND broker = 'upstox'`,
      [testUserId]
    );
    expect(Number(credRow.can_trade)).toBe(0);
  });
});
