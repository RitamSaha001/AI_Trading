import { describe, it, expect, beforeEach } from 'vitest';
import { LedgerService } from '../services/ledgerService';
import { getDb } from '../db';

describe('Ledger Double-Spend & Financial Invariant Hardening Suite', () => {
  const testUserId = `usr_double_spend_${Date.now()}`;

  beforeEach(async () => {
    const db = getDb();
    const now = Date.now();
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, ?, ?, 'google', ?, 'trader', ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [testUserId, `${testUserId}@example.com`, 'Test User', `prov_${testUserId}`, now, now]
    );

    // Deposit initial funds into sovereign cash
    await LedgerService.creditDeposit({
      userId: testUserId,
      amountMinor: 100_000, // 1000.00 USDT
      assetOrCurrency: 'USDT',
      paymentId: `pay_seed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      accountMode: 'live',
    });

    // Transfer from sovereign to trading_allocated
    await LedgerService.transfer({
      userId: testUserId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 100_000,
      accountMode: 'live',
    });
  });

  it('Requirement 1: Unreserved fill cannot steal reservations belonging to other orders/refunds', async () => {
    // Reserve 800.00 USDT (80,000 minor) for another order/pending action
    const reserved = await LedgerService.reserveBalance({
      userId: testUserId,
      amountMinor: 80_000, // 800 USDT
      assetOrCurrency: 'USDT',
      referenceId: 'res_other_pending_withdrawal_001',
      accountMode: 'live',
      accountType: 'trading_allocated',
    });
    expect(reserved).toBe(true);

    // Available unreserved balance is now 200.00 USDT (20,000 minor)
    // An unreserved fill arrives attempting to consume 300.00 USDT (30,000 minor)
    // Total cash is 1000.00 USDT, but unreserved is only 200.00 USDT!
    const unreservedOrderId = `ord_unreserved_${Date.now()}`;
    const fillId = `fill_unreserved_${Date.now()}`;

    await expect(
      LedgerService.processFill({
        userId: testUserId,
        accountMode: 'live',
        orderId: unreservedOrderId,
        fillId,
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        price: '30000',
        quantity: '0.01', // notional = 300 USDT (30,000 minor)
        fee: '0.5',
        feeAsset: 'USDT',
        commissionStatus: 'AUTHORITATIVE',
      })
    ).rejects.toThrow(/Insufficient unreserved cash balance to settle fill/);

    // Verify reservation was NOT stolen
    const cashAcc = await LedgerService.getOrCreateAccount(testUserId, 'trading_allocated', 'USDT', 'live');
    expect(Number(cashAcc.balance_minor)).toBe(100_000);
    expect(Number(cashAcc.reserved_minor)).toBe(80_000);
  });

  it('Requirement 2: debitRefund with isReserved=true throws if reserved balance is insufficient', async () => {
    const db = getDb();
    const now = Date.now();
    const refundUserId = `usr_refund_check_${Date.now()}`;

    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, ?, ?, 'google', ?, 'trader', ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [refundUserId, `${refundUserId}@example.com`, 'Refund User', `prov_${refundUserId}`, now, now]
    );

    // Deposit directly into sovereign cash
    await LedgerService.creditDeposit({
      userId: refundUserId,
      amountMinor: 50_000, // 500 USDT
      assetOrCurrency: 'USDT',
      paymentId: `pay_refund_seed_${Date.now()}`,
      accountMode: 'live',
    });

    // Reserve only 100 USDT (10,000 minor)
    await LedgerService.reserveBalance({
      userId: refundUserId,
      amountMinor: 10_000,
      assetOrCurrency: 'USDT',
      referenceId: 'res_partial_refund',
      accountMode: 'live',
      accountType: 'sovereign_cash',
    });

    // Attempt to debit 200 USDT refund claiming isReserved: true
    await expect(
      LedgerService.debitRefund({
        userId: refundUserId,
        amountMinor: 20_000,
        assetOrCurrency: 'USDT',
        refundId: `ref_${Date.now()}`,
        isReserved: true,
        accountMode: 'live',
      })
    ).rejects.toThrow(/Insufficient reserved balance for refund debit/);

    // Verify reserved balance is preserved and untouched
    const sovAcc = await LedgerService.getOrCreateAccount(refundUserId, 'sovereign_cash', 'USDT', 'live');
    expect(Number(sovAcc.reserved_minor)).toBe(10_000);
    expect(Number(sovAcc.balance_minor)).toBe(50_000);
  });

  it('Requirement 3: processFill strictly validates that price, quantity, and fee are non-negative', async () => {
    const orderId = `ord_neg_check_${Date.now()}`;

    // Negative price
    await expect(
      LedgerService.processFill({
        userId: testUserId,
        accountMode: 'live',
        orderId,
        fillId: `fill_neg_price_${Date.now()}`,
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        price: '-50000',
        quantity: '0.001',
        fee: '0.1',
        commissionStatus: 'AUTHORITATIVE',
      })
    ).rejects.toThrow(/Fill price must be strictly positive/);

    // Zero quantity
    await expect(
      LedgerService.processFill({
        userId: testUserId,
        accountMode: 'live',
        orderId,
        fillId: `fill_zero_qty_${Date.now()}`,
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        price: '50000',
        quantity: '0',
        fee: '0.1',
        commissionStatus: 'AUTHORITATIVE',
      })
    ).rejects.toThrow(/Fill quantity must be strictly positive/);

    // Negative fee
    await expect(
      LedgerService.processFill({
        userId: testUserId,
        accountMode: 'live',
        orderId,
        fillId: `fill_neg_fee_${Date.now()}`,
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        price: '50000',
        quantity: '0.001',
        fee: '-1.0',
        commissionStatus: 'AUTHORITATIVE',
      })
    ).rejects.toThrow(/Fill fee cannot be negative/);
  });
});
