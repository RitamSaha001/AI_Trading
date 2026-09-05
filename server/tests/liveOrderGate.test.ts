import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb } from '../db';
import { config } from '../config';
import { LiveOrderGateService } from '../services/liveOrderGateService';
import { LiveOrderConfirmationService } from '../services/liveOrderConfirmationService';
import { EmergencyControlService } from '../services/emergencyControlService';
import { UpstoxClient } from '../services/brokers/upstox/upstoxClient';
import { UpstoxAdapter } from '../services/brokers/upstox/upstoxAdapter';
import { IndianMarketCalendar } from '../services/brokers/upstox/indianMarketCalendar';
import { BrokerOrderRequest } from '../services/brokers/brokerTypes';

describe('Phase 4B: Server-Authoritative Live Order Gate', () => {
  const testUserId = 'usr_gate_test_001';
  const validIp = '203.0.113.50';

  beforeEach(async () => {
    const db = getDb();
    const now = Date.now();

    // Reset emergency state to normal
    await EmergencyControlService.setState('TRADING_NORMAL', 'Test reset', 'test');
    IndianMarketCalendar.setMockMarketOpen(true);
    UpstoxClient.resetForTesting();
    UpstoxClient.setMockOutboundIp(validIp);

    vi.spyOn(config, 'UPSTOX_STATIC_IP', 'get').mockReturnValue(validIp);
    vi.spyOn(config, 'UPSTOX_LIVE_TRADING_ENABLED', 'get').mockReturnValue(true);

    // Clean up
    await db.execute(`DELETE FROM live_order_confirmations WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [testUserId]);
    await db.execute(`DELETE FROM account_limits WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM broker_credentials WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [testUserId]);

    // Seed test user
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, 'live_trader@lumen.io', 'Live Trader', 'email', 'prov_test', 'TRADER', ?, ?)`,
      [testUserId, now, now]
    );

    await db.execute(
      `INSERT INTO account_limits (id, user_id, is_emergency_frozen, max_single_order_pct, max_asset_concentration_pct, min_cash_reserve_pct, updated_at)
       VALUES (?, ?, 0, 0.50, 0.50, 0.10, ?)`,
      [`lim_${testUserId}`, testUserId, now]
    );

    // Seed production credentials
    const futureExpiry = now + 86400 * 1000;
    const encryptedToken = UpstoxAdapter.encryptSecret('live_access_token_123');
    await db.execute(
      `INSERT INTO broker_credentials (
        id, user_id, broker, environment, auth_type, access_token_encrypted,
        token_expires_at, account_id, can_trade, can_withdraw, is_safe,
        last_sync_at, created_at, updated_at
      ) VALUES ('cred_gate_test', ?, 'upstox', 'production', 'oauth2', ?, ?, 'UCC_GATE_TEST', 1, 0, 1, ?, ?, ?)`,
      [testUserId, encryptedToken, futureExpiry, now, now, now]
    );

    // Seed liquid INR balance (₹10,00,000)
    await db.execute(
      `INSERT INTO ledger_accounts (id, user_id, account_mode, account_type, asset_or_currency, balance_minor, reserved_minor, created_at, updated_at)
       VALUES ('acc_live_inr_gate', ?, 'live', 'trading_allocated', 'INR', 100000000, 0, ?, ?)`,
      [testUserId, now, now]
    );

    // Seed equity holdings for RELIANCE (50 shares)
    await db.execute(
      `INSERT INTO ledger_accounts (id, user_id, account_mode, account_type, asset_or_currency, balance_minor, reserved_minor, created_at, updated_at)
       VALUES ('acc_live_reliance_gate', ?, 'live', 'equity_holdings', 'RELIANCE', 50, 0, ?, ?)`,
      [testUserId, now, now]
    );

    UpstoxClient.setTransport(async (url: string) => {
      if (url.includes('/user/profile')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ status: 'success', data: { user_id: 'UCC_GATE_TEST', is_active: true } }),
          text: async () => '',
        };
      }
      return { status: 404, ok: false, json: async () => ({}), text: async () => '' };
    });
  });

  afterEach(() => {
    IndianMarketCalendar.setMockMarketOpen(null);
    vi.restoreAllMocks();
  });

  it('passes all 15 gate checks for a valid, confirmed live order', async () => {
    // 1. Propose order
    const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 5,
      price: 2800.0,
      product: 'CNC',
      validity: 'DAY',
    });

    // 2. Submit through LiveOrderGateService
    const orderReq: BrokerOrderRequest = {
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 5,
      price: 2800.0,
      product: 'CNC',
      validity: 'DAY',
      confirmationId: proposal.confirmationId,
      idempotencyKey: `idemp_${proposal.clientOrderId}`,
      clientOrderId: proposal.clientOrderId,
      accountMode: 'live',
    };

    const gateResult = await LiveOrderGateService.verifyLiveOrderPreSubmission(
      orderReq,
      proposal.confirmationId
    );

    expect(gateResult.passed).toBe(true);
    expect(gateResult.credentials).toBeDefined();
    expect(gateResult.instrument).toBeDefined();

    // Verify atomic ledger reservation occurred
    const db = getDb();
    const cashAcc = await db.queryOne<any>(
      `SELECT reserved_minor FROM ledger_accounts WHERE id = 'acc_live_inr_gate'`
    );
    expect(BigInt(cashAcc?.reserved_minor || 0)).toBe(1400000n); // 5 * 2800 = 14,000 INR -> 1,400,000 paise
  });

  it('blocks live order when UPSTOX_LIVE_TRADING_ENABLED is false (Safety Gate 1)', async () => {
    vi.spyOn(config, 'UPSTOX_LIVE_TRADING_ENABLED', 'get').mockReturnValue(false);

    const orderReq: BrokerOrderRequest = {
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 1,
      price: 2800.0,
      product: 'CNC',
      idempotencyKey: 'idemp_gate_fail_live_disabled',
      accountMode: 'live',
    };

    await expect(
      LiveOrderGateService.verifyLiveOrderPreSubmission(orderReq, 'loc_dummy')
    ).rejects.toThrow(/UPSTOX_LIVE_TRADING_DISABLED/i);
  });

  it('blocks live order when PANIC or TRADING_HALTED is active (Safety Gate 2)', async () => {
    await EmergencyControlService.setState('PANIC', 'Emergency stop active', 'sentinel');

    const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 1,
      price: 2800.0,
      product: 'CNC',
    });

    const orderReq: BrokerOrderRequest = {
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 1,
      price: 2800.0,
      product: 'CNC',
      confirmationId: proposal.confirmationId,
      idempotencyKey: 'idemp_panic_block',
      accountMode: 'live',
    };

    await expect(
      LiveOrderGateService.verifyLiveOrderPreSubmission(orderReq, proposal.confirmationId)
    ).rejects.toThrow(/EMERGENCY_PANIC_ACTIVE|Emergency PANIC mode/i);
  });

  it('blocks live order when outbound egress IP does not match static IP (Safety Gate 7)', async () => {
    // Mismatch IP
    UpstoxClient.setMockOutboundIp('198.51.100.99');

    const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 1,
      price: 2800.0,
      product: 'CNC',
    });

    const orderReq: BrokerOrderRequest = {
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 1,
      price: 2800.0,
      product: 'CNC',
      confirmationId: proposal.confirmationId,
      idempotencyKey: 'idemp_ip_mismatch',
      accountMode: 'live',
    };

    await expect(
      LiveOrderGateService.verifyLiveOrderPreSubmission(orderReq, proposal.confirmationId)
    ).rejects.toThrow(/STATIC_IP_MISMATCH|outbound IP does not match/i);
  });

  it('blocks live order when Indian market is closed (Safety Gate 8)', async () => {
    IndianMarketCalendar.setMockMarketOpen(false);

    const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 1,
      price: 2800.0,
      product: 'CNC',
    });

    const orderReq: BrokerOrderRequest = {
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 1,
      price: 2800.0,
      product: 'CNC',
      confirmationId: proposal.confirmationId,
      idempotencyKey: 'idemp_market_closed',
      accountMode: 'live',
    };

    await expect(
      LiveOrderGateService.verifyLiveOrderPreSubmission(orderReq, proposal.confirmationId)
    ).rejects.toThrow(/MARKET_CLOSED|markets .* are currently closed/i);
  });

  it('blocks live order without explicit product selection (Safety Gate 9 / Finding 15)', async () => {
    const orderReq: BrokerOrderRequest = {
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 1,
      price: 2800.0,
      product: '' as any, // Missing product
      idempotencyKey: 'idemp_no_product',
      accountMode: 'live',
    };

    await expect(
      LiveOrderGateService.verifyLiveOrderPreSubmission(orderReq, 'loc_dummy')
    ).rejects.toThrow(/PRODUCT_REQUIRED|Explicit product selection is strictly required/i);
  });

  it('blocks live order when confirmation token is missing or tampered (Safety Gate 11)', async () => {
    const orderReq: BrokerOrderRequest = {
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 1,
      price: 2800.0,
      product: 'CNC',
      idempotencyKey: 'idemp_no_conf',
      accountMode: 'live',
    };

    // Missing confirmation
    await expect(
      LiveOrderGateService.verifyLiveOrderPreSubmission(orderReq)
    ).rejects.toThrow(/CONFIRMATION_REQUIRED|strictly require a valid two-step human confirmation/i);

    // Tampered confirmation: propose 5 shares, submit 10 shares
    const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 5,
      price: 2800.0,
      product: 'CNC',
    });

    const tamperedReq: BrokerOrderRequest = {
      ...orderReq,
      quantity: 10, // Tampered!
      confirmationId: proposal.confirmationId,
    };

    await expect(
      LiveOrderGateService.verifyLiveOrderPreSubmission(tamperedReq, proposal.confirmationId)
    ).rejects.toThrow(/Order parameters do not match|ORDER_PARAMETER_TAMPERING/i);
  });

  it('blocks live order when liquid cash is insufficient (Safety Gate 14)', async () => {
    // Propose order requiring ₹28,000 (10 shares @ ₹2800)
    const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      price: 2800.0,
      product: 'CNC',
    });

    // Drain available liquid funds right before gate execution
    const db = getDb();
    await db.execute(`UPDATE ledger_accounts SET balance_minor = 1000 WHERE user_id = ?`, [testUserId]);

    const orderReq: BrokerOrderRequest = {
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      price: 2800.0,
      product: 'CNC',
      confirmationId: proposal.confirmationId,
      idempotencyKey: 'idemp_insufficient_funds',
      accountMode: 'live',
    };

    await expect(
      LiveOrderGateService.verifyLiveOrderPreSubmission(orderReq, proposal.confirmationId)
    ).rejects.toThrow(/cash reserve|INSUFFICIENT_FUNDS|Insufficient liquid/i);
  });

  it('blocks live SELL order when sellable equity holdings are insufficient (Safety Gate 14)', async () => {
    // User has 50 shares of RELIANCE. Try to SELL 100 shares.
    const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'SELL',
      type: 'LIMIT',
      quantity: 100,
      price: 2800.0,
      product: 'CNC',
    });

    const orderReq: BrokerOrderRequest = {
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'SELL',
      type: 'LIMIT',
      quantity: 100,
      price: 2800.0,
      product: 'CNC',
      confirmationId: proposal.confirmationId,
      idempotencyKey: 'idemp_insufficient_holdings',
      accountMode: 'live',
    };

    await expect(
      LiveOrderGateService.verifyLiveOrderPreSubmission(orderReq, proposal.confirmationId)
    ).rejects.toThrow(/INSUFFICIENT_HOLDINGS|Insufficient sellable equity/i);
  });
});
