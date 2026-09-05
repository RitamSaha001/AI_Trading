import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb } from '../db';
import { LiveOrderConfirmationService } from '../services/liveOrderConfirmationService';
import { config } from '../config';

describe('Phase 4B: Live Order Human Confirmation System', () => {
  const testUserId = 'usr_confirm_test_001';

  beforeEach(async () => {
    const db = getDb();
    const now = Date.now();

    // Clean up test records
    await db.execute(`DELETE FROM live_order_confirmations WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [testUserId]);
    await db.execute(`DELETE FROM account_limits WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [testUserId]);

    // Seed test user and accounts
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, 'trader@lumen.io', 'Test Trader', 'email', 'prov_test', 'TRADER', ?, ?)`,
      [testUserId, now, now]
    );

    await db.execute(
      `INSERT INTO account_limits (id, user_id, is_emergency_frozen, max_single_order_pct, max_asset_concentration_pct, min_cash_reserve_pct, updated_at)
       VALUES (?, ?, 0, 0.50, 0.50, 0.10, ?)`,
      [`lim_${testUserId}`, testUserId, now]
    );

    await db.execute(
      `INSERT INTO ledger_accounts (id, user_id, account_mode, account_type, asset_or_currency, balance_minor, reserved_minor, created_at, updated_at)
       VALUES ('acc_live_inr_test_conf', ?, 'live', 'trading_allocated', 'INR', 100000000, 0, ?, ?)`,
      [testUserId, now, now]
    );
  });

  it('proposes a live order with short TTL, exact order hash, and risk snapshot', async () => {
    const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      price: 2800.0,
      product: 'CNC',
      validity: 'DAY',
    });

    expect(proposal).toBeDefined();
    expect(proposal.confirmationId).toMatch(/^loc_/);
    expect(proposal.status).toBe('PENDING');
    expect(proposal.product).toBe('CNC');
    expect(proposal.quantity).toBe(10);
    expect(proposal.price).toBe(2800.0);
    expect(proposal.estimatedNotional).toBe(28000.0);
    expect(proposal.currency).toBe('INR');
    expect(proposal.orderHash).toBeDefined();
    expect(proposal.orderHash.length).toBe(64); // SHA-256 hex length
    expect(proposal.expiresAt).toBeGreaterThan(Date.now());
    expect(proposal.ttlSeconds).toBeGreaterThanOrEqual(15);
    expect(proposal.riskSnapshot).toBeDefined();
    expect(proposal.riskSnapshot.notional).toBe(28000.0);
  });

  it('strictly rejects proposals without an explicit product selection (Finding 15)', async () => {
    await expect(
      LiveOrderConfirmationService.proposeLiveOrder({
        userId: testUserId,
        broker: 'upstox',
        symbol: 'RELIANCE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 5,
        price: 2800.0,
        product: '' as any, // Missing product
      })
    ).rejects.toThrow(/PRODUCT_REQUIRED|Explicit product selection is strictly required/i);

    await expect(
      LiveOrderConfirmationService.proposeLiveOrder({
        userId: testUserId,
        broker: 'upstox',
        symbol: 'RELIANCE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 5,
        price: 2800.0,
        product: 'INVALID_XYZ' as any, // Invalid product
      })
    ).rejects.toThrow(/INVALID_PRODUCT|Unsupported order product/i);
  });

  it('atomically claims a valid confirmation on first use', async () => {
    const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
      userId: testUserId,
      broker: 'upstox',
      symbol: 'TCS',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 5,
      price: 3800.0,
      product: 'D',
    });

    const claimRes = await LiveOrderConfirmationService.claimConfirmationAtomically(
      proposal.confirmationId,
      testUserId
    );

    expect(claimRes.claimed).toBe(true);
    expect(claimRes.record).toBeDefined();
    expect(claimRes.record.id).toBe(proposal.confirmationId);

    // Verify status in DB transitioned to CONSUMED
    const db = getDb();
    const row = await db.queryOne<any>(
      `SELECT status, consumed_at FROM live_order_confirmations WHERE id = ?`,
      [proposal.confirmationId]
    );
    expect(row?.status).toBe('CONSUMED');
    expect(row?.consumed_at).toBeGreaterThan(0);
  });

  it('prevents double-clicks, duplicate confirmations, and replays (atomicity guard)', async () => {
    const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
      userId: testUserId,
      broker: 'upstox',
      symbol: 'INFY',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      price: 1800.0,
      product: 'CNC',
    });

    // First claim succeeds
    const firstClaim = await LiveOrderConfirmationService.claimConfirmationAtomically(
      proposal.confirmationId,
      testUserId
    );
    expect(firstClaim.claimed).toBe(true);

    // Concurrent / duplicate claim attempt fails
    const secondClaim = await LiveOrderConfirmationService.claimConfirmationAtomically(
      proposal.confirmationId,
      testUserId
    );
    expect(secondClaim.claimed).toBe(false);
    expect(secondClaim.reason).toBe('CONFIRMATION_ALREADY_CONSUMED');
  });

  it('rejects confirmation when authorization token has expired (TTL guard)', async () => {
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

    // Manually backdate expiration in DB to simulate expired TTL
    const db = getDb();
    const expiredTimestamp = Date.now() - 5000;
    await db.execute(
      `UPDATE live_order_confirmations SET expires_at = ? WHERE id = ?`,
      [expiredTimestamp, proposal.confirmationId]
    );

    const claimRes = await LiveOrderConfirmationService.claimConfirmationAtomically(
      proposal.confirmationId,
      testUserId
    );

    expect(claimRes.claimed).toBe(false);
    expect(claimRes.reason).toBe('CONFIRMATION_EXPIRED');

    // Verify status updated to EXPIRED in database
    const row = await db.queryOne<any>(
      `SELECT status FROM live_order_confirmations WHERE id = ?`,
      [proposal.confirmationId]
    );
    expect(row?.status).toBe('EXPIRED');
  });

  it('detects parameter tampering via SHA-256 order hash mismatch (anti-tampering guard)', async () => {
    const originalParams = {
      userId: testUserId,
      broker: 'upstox',
      symbol: 'RELIANCE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      price: 2800.0,
      product: 'CNC',
      validity: 'DAY',
    };

    const originalHash = LiveOrderConfirmationService.computeOrderHash(originalParams);

    // Tamper with quantity: 10 shares -> 20 shares
    const tamperedHashQty = LiveOrderConfirmationService.computeOrderHash({
      ...originalParams,
      quantity: 20,
    });
    expect(tamperedHashQty).not.toBe(originalHash);

    // Tamper with price: 2800 -> 2900
    const tamperedHashPrice = LiveOrderConfirmationService.computeOrderHash({
      ...originalParams,
      price: 2900.0,
    });
    expect(tamperedHashPrice).not.toBe(originalHash);

    // Tamper with side: BUY -> SELL
    const tamperedHashSide = LiveOrderConfirmationService.computeOrderHash({
      ...originalParams,
      side: 'SELL',
    });
    expect(tamperedHashSide).not.toBe(originalHash);

    // Tamper with product: CNC -> MIS
    const tamperedHashProduct = LiveOrderConfirmationService.computeOrderHash({
      ...originalParams,
      product: 'MIS',
    });
    expect(tamperedHashProduct).not.toBe(originalHash);
  });

  it('rejects confirmation claim when attempted by an unauthorized user', async () => {
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

    const unauthorizedUserId = 'usr_hacker_999';
    const claimRes = await LiveOrderConfirmationService.claimConfirmationAtomically(
      proposal.confirmationId,
      unauthorizedUserId
    );

    expect(claimRes.claimed).toBe(false);
    expect(claimRes.reason).toBe('CONFIRMATION_NOT_FOUND');
  });
});
