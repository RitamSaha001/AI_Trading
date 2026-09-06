import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ServerRiskEngine } from '../services/riskEngine';
import { LedgerService } from '../services/ledgerService';
import { IndianMarketCalendar } from '../services/brokers/upstox/indianMarketCalendar';
import { UpstoxClient } from '../services/brokers/upstox/upstoxClient';
import { UpstoxAdapter } from '../services/brokers/upstox/upstoxAdapter';
import { getDb } from '../db';

describe('Phase 3: Institutional Risk, Margin & Execution Hardening', () => {
  const userId = 'usr_phase3_risk_001';

  beforeEach(async () => {
    const db = getDb();
    const now = Date.now();

    await db.execute(`DELETE FROM exchange_order_children WHERE parent_client_order_id LIKE 'phase3_%'`);
    await db.execute(`DELETE FROM exchange_orders WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM order_reservations WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_entries WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM account_limits WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM broker_credentials WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);

    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, 'phase3_test@lumen.io', 'Phase 3 Tester', 'email', 'prov_p3', 'TRADER', ?, ?)`,
      [userId, now, now]
    );

    await db.execute(
      `INSERT INTO account_limits (id, user_id, is_emergency_frozen, max_single_order_pct, max_asset_concentration_pct, min_cash_reserve_pct, updated_at)
       VALUES (?, ?, 0, 0.50, 0.60, 0.15, ?)`,
      [`lim_${userId}`, userId, now]
    );

    // Default mock market open to true for risk engine testing unless specifically testing market hours
    IndianMarketCalendar.setMockMarketOpen(true);
  });

  afterEach(() => {
    IndianMarketCalendar.setMockMarketOpen(null);
    UpstoxClient.resetForTesting();
  });

  it('prohibits naked short-selling in cash equity delivery (SEBI compliance)', async () => {
    // Fund with ₹50,000 cash but ZERO shares of TATASTEEL
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'INR',
      amountMinor: 5_000_000,
      paymentId: 'pay_p3_001',
      description: 'Fund INR',
    });
    await LedgerService.transfer({
      userId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'INR',
      amountMinor: 5_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_p3_001',
      description: 'Allocate INR',
    });

    // Attempt to place a delivery SELL order for 100 shares of TATASTEEL
    const decision = await ServerRiskEngine.evaluateTrade({
      userId,
      broker: 'upstox',
      assetClass: 'EQUITY',
      symbol: 'TATASTEEL',
      asset: 'TATASTEEL',
      quoteAsset: 'INR',
      side: 'SELL',
      type: 'LIMIT',
      product: 'CNC',
      quantity: 100,
      price: 150,
      marketQuoteAgeMs: 2000,
      accountMode: 'live',
    });

    expect(decision.approved).toBe(false);
    expect(decision.rejectReason).toContain('Naked short selling is prohibited by SEBI');
    expect(decision.rejectReason).toContain('Insufficient holdings');
  });

  it('enforces SPAN + Exposure derivative margin on short futures and option writing', async () => {
    // Fund with only ₹5,000 in trading cash
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'INR',
      amountMinor: 500_000, // ₹5,000
      paymentId: 'pay_p3_002',
      description: 'Small Deposit',
    });
    await LedgerService.transfer({
      userId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'INR',
      amountMinor: 500_000,
      referenceType: 'allocation',
      referenceId: 'alloc_p3_002',
      description: 'Allocate INR',
    });

    // Attempt to SELL 1 lot (75 qty) of NIFTY futures at 24000. Notional = ₹1,800,000.
    // SPAN + Exposure margin at 15% = ₹270,000 > available ₹5,000 cash.
    const decision = await ServerRiskEngine.evaluateTrade({
      userId,
      broker: 'upstox',
      assetClass: 'FUTURE',
      symbol: 'NIFTY24SEPFUT',
      asset: 'NIFTY',
      quoteAsset: 'INR',
      side: 'SELL',
      type: 'LIMIT',
      product: 'NRML',
      quantity: 75,
      price: 24000,
      marketQuoteAgeMs: 1500,
      accountMode: 'live',
    });

    expect(decision.approved).toBe(false);
    expect(decision.rejectReason).toContain('Insufficient margin');
    expect(decision.rejectReason).toContain('initial margin (SPAN + Exposure)');
  });

  it('rejects live orders when portfolio equity is zero instead of fabricating synthetic equity', async () => {
    // Zero deposits made (account has 0 balance)
    const decision = await ServerRiskEngine.evaluateTrade({
      userId,
      broker: 'upstox',
      assetClass: 'EQUITY',
      symbol: 'RELIANCE',
      asset: 'RELIANCE',
      quoteAsset: 'INR',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      price: 2500,
      marketQuoteAgeMs: 1000,
      accountMode: 'live',
    });

    expect(decision.approved).toBe(false);
    expect(decision.rejectReason).toContain('Insufficient portfolio equity');
    expect(decision.rejectReason).toContain('Total portfolio value is ₹0.00');
  });

  it('rejects live Indian market orders when exchange is closed', async () => {
    // Mock exchange closed
    IndianMarketCalendar.setMockMarketOpen(false);

    // Fund account
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'INR',
      amountMinor: 10_000_000, // ₹100,000
      paymentId: 'pay_p3_003',
      description: 'Fund INR',
    });
    await LedgerService.transfer({
      userId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'INR',
      amountMinor: 10_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_p3_003',
      description: 'Allocate INR',
    });

    const decision = await ServerRiskEngine.evaluateTrade({
      userId,
      broker: 'upstox',
      assetClass: 'EQUITY',
      symbol: 'INFY',
      asset: 'INFY',
      quoteAsset: 'INR',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      price: 1800,
      marketQuoteAgeMs: 2000,
      accountMode: 'live',
    });

    expect(decision.approved).toBe(false);
    expect(decision.rejectReason).toContain('Market is closed');
    expect(decision.rejectReason).toContain('outside NSE/BSE regular trading hours');
  });

  it('retains reservation delta and transitions to UNKNOWN on modifyOrder network timeout', async () => {
    const db = getDb();
    const now = Date.now();
    const clientOrderId = `phase3_mod_timeout_${now}`;

    // Seed credentials
    const futureExpiry = now + 86400 * 1000;
    const encryptedToken = UpstoxAdapter.encryptSecret('mock_upstox_token_mod');
    await db.execute(
      `INSERT INTO broker_credentials (
        id, user_id, broker, environment, auth_type, access_token_encrypted,
        token_expires_at, account_id, can_trade, can_withdraw, is_safe,
        last_sync_at, created_at, updated_at
      ) VALUES ('cred_p3_mod', ?, 'upstox', 'production', 'oauth2', ?, ?, 'UCC_P3_001', 1, 0, 1, ?, ?, ?)`,
      [userId, encryptedToken, futureExpiry, now, now, now]
    );

    // Fund account with ₹20,000
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'INR',
      amountMinor: 2_000_000,
      paymentId: 'pay_p3_004',
      description: 'Fund INR',
    });
    await LedgerService.transfer({
      userId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'INR',
      amountMinor: 2_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_p3_004',
      description: 'Allocate INR',
    });

    // Seed open order for 5 shares at ₹1,000 (Cost = ₹5,000)
    await db.execute(
      `INSERT INTO exchange_orders (
        id, client_order_id, exchange_order_id, user_id, broker, symbol, side, type,
        status, orig_qty, price, notional, reserved_cash, quote_asset, idempotency_key, created_at, updated_at
      ) VALUES
        ('ord_p3_mod', ?, 'upstox_venue_mod_001', ?, 'upstox', 'RELIANCE', 'BUY', 'LIMIT', 'OPEN', 5, 1000.0, 5000.0, 5000.0, 'INR', 'idemp_p3_mod', ?, ?)`,
      [clientOrderId, userId, now, now]
    );

    // Mock UpstoxClient.modifyOrder throwing an ambiguous network timeout
    UpstoxClient.setTransport(async (url: string) => {
      if (url.includes('/order/modify')) {
        throw new Error('ETIMEDOUT: Connection timed out to api.upstox.com');
      }
      if (url.includes('/order/retrieve-all')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ status: 'success', data: [] }),
          text: async () => '',
        };
      }
      return { status: 404, ok: false, json: async () => ({}), text: async () => '' };
    });

    const adapter = new UpstoxAdapter();

    // Modify order to 10 shares at ₹1,000 (New cost = ₹10,000 -> cashDelta = +₹5,000)
    await expect(
      adapter.modifyOrder('ord_p3_mod', {
        quantity: 10,
        price: 1000.0,
      })
    ).rejects.toThrow(/ETIMEDOUT/);

    // Invariant verification: Order must be marked UNKNOWN for safe reconciliation
    const orderRow = await db.queryOne<any>(
      `SELECT status FROM exchange_orders WHERE client_order_id = ?`,
      [clientOrderId]
    );
    expect(orderRow?.status).toBe('UNKNOWN');

    // Invariant verification: The reservation delta must NOT have been released
    const reservation = await db.queryOne<any>(
      `SELECT * FROM order_reservations WHERE order_id = ?`,
      [`mod_res_${clientOrderId}`]
    );
    expect(reservation).toBeDefined();
    expect(reservation?.status).toBe('ACTIVE');
    expect(BigInt(reservation?.amount_minor)).toBe(500000n); // ₹5,000 reserved
  });

  it('safely retains executed reservation and transitions to PARTIALLY_FILLED when partially filled order is cancelled', async () => {
    const db = getDb();
    const now = Date.now();
    const clientOrderId = `phase3_partial_cancel_${now}`;

    // Seed credentials
    const futureExpiry = now + 86400 * 1000;
    const encryptedToken = UpstoxAdapter.encryptSecret('mock_upstox_token_cancel');
    await db.execute(
      `INSERT INTO broker_credentials (
        id, user_id, broker, environment, auth_type, access_token_encrypted,
        token_expires_at, account_id, can_trade, can_withdraw, is_safe,
        last_sync_at, created_at, updated_at
      ) VALUES ('cred_p3_cancel', ?, 'upstox', 'production', 'oauth2', ?, ?, 'UCC_P3_002', 1, 0, 1, ?, ?, ?)`,
      [userId, encryptedToken, futureExpiry, now, now, now]
    );

    // Fund account with ₹20,000
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'INR',
      amountMinor: 2_000_000,
      paymentId: 'pay_p3_005',
      description: 'Fund INR',
    });
    await LedgerService.transfer({
      userId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'INR',
      amountMinor: 2_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_p3_005',
      description: 'Allocate INR',
    });

    // Reserve ₹10,000 (10 shares at ₹1,000)
    await LedgerService.reserveOrderFunds({
      userId,
      orderId: clientOrderId,
      accountMode: 'live',
      accountType: 'trading_allocated',
      assetOrCurrency: 'INR',
      amountMinor: 1_000_000n, // ₹10,000
    });

    // Seed open order in database
    await db.execute(
      `INSERT INTO exchange_orders (
        id, client_order_id, exchange_order_id, user_id, broker, symbol, side, type,
        status, orig_qty, price, notional, reserved_cash, quote_asset, idempotency_key, created_at, updated_at
      ) VALUES
        ('ord_p3_cancel', ?, 'upstox_venue_cancel_001', ?, 'upstox', 'RELIANCE', 'BUY', 'LIMIT', 'OPEN', 10, 1000.0, 10000.0, 10000.0, 'INR', 'idemp_p3_cancel', ?, ?)`,
      [clientOrderId, userId, now, now]
    );

    // Mock UpstoxClient: Venue says status is 'cancelled', but 4 shares were filled at ₹1,000
    UpstoxClient.setTransport(async (url: string) => {
      if (url.includes('/order/cancel')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ status: 'success', data: { order_id: 'upstox_venue_cancel_001' } }),
          text: async () => '',
        };
      }
      if (url.includes('/order/retrieve-all')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            status: 'success',
            data: [
              {
                order_id: 'upstox_venue_cancel_001',
                tag: clientOrderId.slice(-20),
                status: 'cancelled',
                trading_symbol: 'RELIANCE',
                quantity: 10,
                filled_quantity: 4,
                price: 1000.0,
                average_price: 1000.0,
              },
            ],
          }),
          text: async () => '',
        };
      }
      return { status: 404, ok: false, json: async () => ({}), text: async () => '' };
    });

    const adapter = new UpstoxAdapter();
    const cancelledOrder = await adapter.cancelOrder(userId, clientOrderId);

    // Invariant verification: Status must be PARTIALLY_FILLED, not CANCELED
    expect(cancelledOrder.status).toBe('PARTIALLY_FILLED');

    // Invariant verification: In order_reservations, only the unexecuted 6 shares (₹6,000) are released!
    // The executed 4 shares (₹4,000 = 400,000 paise) remain active/reserved
    const reservation = await db.queryOne<any>(
      `SELECT * FROM order_reservations WHERE order_id = ?`,
      [clientOrderId]
    );
    expect(reservation).toBeDefined();
    expect(BigInt(reservation?.released_minor)).toBe(600000n); // ₹6,000 released
  });
});
