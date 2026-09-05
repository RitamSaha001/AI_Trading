import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb } from '../db';
import { EmergencyControlService } from '../services/emergencyControlService';
import { BrokerRegistry } from '../services/brokers/brokerRegistry';
import { UpstoxAdapter } from '../services/brokers/upstox/upstoxAdapter';
import { UpstoxClient } from '../services/brokers/upstox/upstoxClient';
import { IndianMarketCalendar } from '../services/brokers/upstox/indianMarketCalendar';

describe('Phase 4B: Panic & Emergency Execution Controls', () => {
  const testUserId = 'usr_panic_test_001';

  beforeEach(async () => {
    const db = getDb();
    const now = Date.now();

    // Reset state to normal before each test
    await EmergencyControlService.setState('TRADING_NORMAL', 'Reset for test', 'test_runner');
    UpstoxClient.resetForTesting();
    IndianMarketCalendar.setMockMarketOpen(true);

    // Clean up
    await db.execute(`DELETE FROM panic_squareoff_runs WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM broker_credentials WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [testUserId]);

    // Seed user
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, 'panic_trader@lumen.io', 'Panic Trader', 'email', 'prov_panic', 'TRADER', ?, ?)`,
      [testUserId, now, now]
    );

    // Seed production credentials
    const futureExpiry = now + 86400 * 1000;
    const encryptedToken = UpstoxAdapter.encryptSecret('mock_panic_access_token');
    await db.execute(
      `INSERT INTO broker_credentials (
        id, user_id, broker, environment, auth_type, access_token_encrypted,
        token_expires_at, account_id, can_trade, can_withdraw, is_safe,
        last_sync_at, created_at, updated_at
      ) VALUES ('cred_panic_test', ?, 'upstox', 'production', 'oauth2', ?, ?, 'UCC_PANIC_001', 1, 0, 1, ?, ?, ?)`,
      [testUserId, encryptedToken, futureExpiry, now, now, now]
    );
  });

  afterEach(async () => {
    const db = getDb();
    await EmergencyControlService.setState('TRADING_NORMAL', 'Teardown reset', 'test_runner');
    IndianMarketCalendar.setMockMarketOpen(null);
    await db.execute(`DELETE FROM panic_squareoff_runs WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM exchange_orders WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM broker_credentials WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [testUserId]);
  });

  it('starts in TRADING_NORMAL and persists state across queries', async () => {
    const status = await EmergencyControlService.getStatus();
    expect(status.state).toBe('TRADING_NORMAL');

    const allowed = await EmergencyControlService.isExecutionAllowed();
    expect(allowed.allowed).toBe(true);
    expect(allowed.state).toBe('TRADING_NORMAL');
  });

  it('transitions to TRADING_HALTED and blocks live execution', async () => {
    const halted = await EmergencyControlService.setState(
      'TRADING_HALTED',
      'Volatility circuit triggered across Indian equities',
      'risk_sentinel'
    );

    expect(halted.state).toBe('TRADING_HALTED');
    expect(halted.reason).toContain('Volatility circuit triggered');

    const allowed = await EmergencyControlService.isExecutionAllowed();
    expect(allowed.allowed).toBe(false);
    expect(allowed.state).toBe('TRADING_HALTED');
  });

  it('transitions to PANIC mode and persists durably', async () => {
    const panic = await EmergencyControlService.setState(
      'PANIC',
      'Exchange emergency broadcast received',
      'compliance_officer'
    );

    expect(panic.state).toBe('PANIC');
    expect(panic.reason).toContain('Exchange emergency broadcast');

    // Confirm state persisted in database table directly
    const db = getDb();
    const row = await db.queryOne<any>(`SELECT * FROM emergency_system_state WHERE id = 'current'`);
    expect(row?.state).toBe('PANIC');
    expect(row?.reason).toContain('Exchange emergency broadcast');

    const allowed = await EmergencyControlService.isExecutionAllowed();
    expect(allowed.allowed).toBe(false);
    expect(allowed.state).toBe('PANIC');
  });

  it('resumes TRADING_NORMAL when explicitly deactivated', async () => {
    await EmergencyControlService.setState('PANIC', 'Emergency active', 'admin');
    let allowed = await EmergencyControlService.isExecutionAllowed();
    expect(allowed.allowed).toBe(false);

    await EmergencyControlService.setState('TRADING_NORMAL', 'Market conditions stabilized', 'admin');
    allowed = await EmergencyControlService.isExecutionAllowed();
    expect(allowed.allowed).toBe(true);
    expect(allowed.state).toBe('TRADING_NORMAL');
  });

  it('executes controlled panic square-off: cancels open orders safely', async () => {
    const adapter = BrokerRegistry.get('upstox') as UpstoxAdapter;

    // Seed mock transport returning 2 open orders
    UpstoxClient.setTransport(async (url: string) => {
      if (url.includes('/order/retrieve-all')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            status: 'success',
            data: [
              { order_id: 'upstox_ord_1', tag: 'client_ord_1', status: 'open', instrument_token: 'NSE_EQ|INE002A01018' },
              { order_id: 'upstox_ord_2', tag: 'client_ord_2', status: 'open', instrument_token: 'NSE_EQ|INE467B01029' },
            ],
          }),
          text: async () => '',
        };
      }
      if (url.includes('/order/cancel')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ status: 'success', data: { order_id: 'upstox_ord_1' } }),
          text: async () => '',
        };
      }
      if (url.includes('/portfolio/short-term-positions')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ status: 'success', data: [] }),
          text: async () => '',
        };
      }
      return { status: 404, ok: false, json: async () => ({}), text: async () => '' };
    });

    // Seed 2 open orders in database
    const db = getDb();
    const now = Date.now();
    await db.execute(
      `INSERT INTO exchange_orders (
        id, client_order_id, exchange_order_id, user_id, broker, symbol, side, type,
        status, orig_qty, price, notional, quote_asset, idempotency_key, created_at, updated_at
      ) VALUES
        ('ord_panic_1', 'client_ord_1', 'upstox_ord_1', ?, 'upstox', 'NSE_EQ|INE002A01018', 'BUY', 'LIMIT', 'OPEN', 10, 2800.0, 28000.0, 'INR', 'idemp_panic_1', ?, ?),
        ('ord_panic_2', 'client_ord_2', 'upstox_ord_2', ?, 'upstox', 'NSE_EQ|INE467B01029', 'BUY', 'LIMIT', 'OPEN', 5, 3800.0, 19000.0, 'INR', 'idemp_panic_2', ?, ?)`,
      [testUserId, now, now, testUserId, now, now]
    );

    const summary = await EmergencyControlService.executePanicSquareOff(
      testUserId,
      'upstox',
      'Operator triggered emergency square-off',
      'human_operator'
    );

    expect(summary.status).toBe('COMPLETED');
    expect(summary.cancelledOrdersCount).toBe(2);

    // Verify system state became PANIC
    const state = await EmergencyControlService.getStatus();
    expect(state.state).toBe('PANIC');
  });

  it('protects against secondary disaster: refuses to send market orders when market is closed', async () => {
    // Simulate market closed
    IndianMarketCalendar.setMockMarketOpen(false);

    // Seed mock transport returning an open position
    UpstoxClient.setTransport(async (url: string) => {
      if (url.includes('/order/retrieve-all')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ status: 'success', data: [] }),
          text: async () => '',
        };
      }
      if (url.includes('/portfolio/short-term-positions')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            status: 'success',
            data: [
              {
                instrument_token: 'NSE_EQ|INE002A01018',
                trading_symbol: 'RELIANCE',
                quantity: 50,
                average_price: 2800.0,
                last_price: 2850.0,
                product: 'D',
              },
            ],
          }),
          text: async () => '',
        };
      }
      return { status: 404, ok: false, json: async () => ({}), text: async () => '' };
    });

    const summary = await EmergencyControlService.executePanicSquareOff(
      testUserId,
      'upstox',
      'Weekend panic test',
      'human_operator'
    );

    // Should skip position and record condition without blindly dispatching to a closed exchange
    expect(summary.skippedPositionsCount).toBe(1);
    expect(summary.closeOrdersSubmittedCount).toBe(0);
    expect(summary.errors.some((e) => e.includes('Indian market is closed'))).toBe(true);
  });
});
