import { describe, it, expect, beforeEach } from 'vitest';
import { LedgerService } from '../services/ledgerService';
import { getDb } from '../db';

describe('Server Double-Entry Accounting Ledger', () => {
  const userId = 'usr_test_trader_001';

  beforeEach(async () => {
    const db = getDb();
    await db.execute(`DELETE FROM ledger_entries WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);

    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
       VALUES (?, 'ledger_test@lumen.io', 'Ledger Tester', 'email', 'test_prov', ?, ?)`,
      [userId, Date.now(), Date.now()]
    );
  });

  it('credits deposits accurately using integer minor units', async () => {
    // Deposit $500.00 USD (50,000 cents)
    const res = await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'USD',
      amountMinor: 50000,
      paymentId: 'pay_test_001',
      description: 'Initial Card Deposit',
    });

    expect(res.balanceAfter).toBe(50000n);

    const balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(50000);
    expect(balances['sovereign_cash:USD'].free).toBe(50000);
    expect(balances['sovereign_cash:USD'].reserved).toBe(0);
  });

  it('enforces double-entry transfer between sovereign cash and trading allocated cash', async () => {
    // Initial deposit $1,000.00 (100,000 cents)
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'USD',
      amountMinor: 100000,
      paymentId: 'pay_test_002',
      description: 'Initial Deposit',
    });

    // Allocate $400.00 (40,000 cents) to Trading Desk
    const transferRes = await LedgerService.transfer({
      userId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USD',
      amountMinor: 40000,
      referenceType: 'allocation',
      referenceId: 'alloc_001',
      description: 'Allocate to Trading Desk',
    });

    expect(transferRes.fromBalanceAfter).toBe(60000n);
    expect(transferRes.toBalanceAfter).toBe(40000n);

    const balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(60000);
    expect(balances['trading_allocated:USD'].balance).toBe(40000);
  });

  it('rejects transfer when available balance is insufficient', async () => {
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'USD',
      amountMinor: 20000, // $200
      paymentId: 'pay_test_003',
      description: 'Small Deposit',
    });

    // Attempt to transfer $500 (50,000 cents)
    await expect(
      LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USD',
        amountMinor: 50000,
        referenceType: 'allocation',
        referenceId: 'alloc_002',
        description: 'Overspend Attempt',
      })
    ).rejects.toThrow(/Insufficient spendable balance/);
  });

  it('atomically reserves and releases capital for orders', async () => {
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'USDT',
      amountMinor: 100000, // 1,000 USDT in cents
      paymentId: 'pay_test_004',
      description: 'USDT Deposit',
    });

    // Reserve 300 USDT (30,000 cents)
    await LedgerService.reserveBalance({
      userId,
      accountType: 'sovereign_cash',
      assetOrCurrency: 'USDT',
      amountMinor: 30000,
      referenceId: 'order_res_001',
    });

    let balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USDT'].balance).toBe(100000);
    expect(balances['sovereign_cash:USDT'].reserved).toBe(30000);
    expect(balances['sovereign_cash:USDT'].free).toBe(70000);

    // Cannot spend more than free balance
    await expect(
      LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 80000, // Needs 80,000 but only 70,000 free
        referenceType: 'allocation',
        referenceId: 'alloc_003',
        description: 'Exceed Free Balance',
      })
    ).rejects.toThrow(/Insufficient spendable balance/);

    // Release reservation
    await LedgerService.releaseReservation({
      userId,
      accountType: 'sovereign_cash',
      assetOrCurrency: 'USDT',
      amountMinor: 30000,
      referenceId: 'order_res_001',
    });

    balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USDT'].reserved).toBe(0);
    expect(balances['sovereign_cash:USDT'].free).toBe(100000);
  });

  it('validates mathematical ledger balance invariant: sum of entries === balance', async () => {
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'USD',
      amountMinor: 50000,
      paymentId: 'pay_test_005',
      description: 'Deposit 1',
    });
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'USD',
      amountMinor: 25000,
      paymentId: 'pay_test_006',
      description: 'Deposit 2',
    });
    await LedgerService.transfer({
      userId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USD',
      amountMinor: 30000,
      referenceType: 'allocation',
      referenceId: 'alloc_004',
      description: 'Allocation',
    });

    const acc = await LedgerService.getOrCreateAccount(userId, 'sovereign_cash', 'USD');
    const verification = await LedgerService.verifyAccountInvariant(acc.id);

    expect(verification.valid).toBe(true);
    expect(verification.calculatedBalance).toBe(45000n);
    expect(verification.recordedBalance).toBe(45000n);
  });
});
