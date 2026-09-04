import { describe, it, expect, beforeEach } from 'vitest';
import { ServerRiskEngine } from '../services/riskEngine';
import { LedgerService } from '../services/ledgerService';
import { getDb } from '../db';

describe('Server-Authoritative Risk Engine', () => {
  const userId = 'usr_risk_test_001';

  beforeEach(async () => {
    const db = getDb();
    await db.execute(`DELETE FROM exchange_orders WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_entries WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM account_limits WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);

    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
       VALUES (?, 'risk_test@lumen.io', 'Risk Tester', 'email', 'test_prov', ?, ?)`,
      [userId, Date.now(), Date.now()]
    );

    await db.execute(
      `INSERT INTO account_limits (id, user_id, is_emergency_frozen, max_single_order_pct, max_asset_concentration_pct, min_cash_reserve_pct, updated_at)
       VALUES (?, ?, 0, 0.40, 0.50, 0.15, ?)`,
      [`lim_${userId}`, userId, Date.now()]
    );
  });

  it('rejects orders when market quote data is stale (> 45s)', async () => {
    const decision = await ServerRiskEngine.evaluateTrade({
      userId,
      asset: 'BTC',
      quoteAsset: 'USDT',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 0.1,
      price: 60000,
      marketQuoteAgeMs: 50_000, // 50 seconds > 45s limit
    });

    expect(decision.approved).toBe(false);
    expect(decision.rejectReason).toContain('Execution market data is stale');
  });

  it('rejects orders exceeding the 40% max single order portfolio cap', async () => {
    // Fund with $10,000 (1,000,000 cents)
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
      paymentId: 'pay_fund_001',
      description: 'Fund Trading',
    });
    await LedgerService.transfer({
      userId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_fund_001',
      description: 'Fund',
    });

    // Attempt $5,000 order (50% of $10,000 portfolio > 40% cap)
    const decision = await ServerRiskEngine.evaluateTrade({
      userId,
      asset: 'BTC',
      quoteAsset: 'USDT',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 0.1,
      price: 50000, // Notional: $5,000
      marketQuoteAgeMs: 5000,
    });

    expect(decision.approved).toBe(false);
    expect(decision.rejectReason).toContain('exceeding maximum allowed limit of 40%');
  });

  it('rejects buy orders violating the 15% minimum cash reserve requirement', async () => {
    // Fund with $10,000
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
      paymentId: 'pay_fund_002',
      description: 'Fund Trading',
    });
    await LedgerService.transfer({
      userId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_fund_002',
      description: 'Fund',
    });

    // Attempt order leaving < 15% cash
    // Spend $9,000 -> remaining $1,000 (10% < 15% reserve of $1,500)
    // Note: To isolate cash reserve from 40% single order limit, set limits accordingly
    const db = getDb();
    await db.execute(`UPDATE account_limits SET max_single_order_pct = 0.95 WHERE user_id = ?`, [userId]);

    const decision = await ServerRiskEngine.evaluateTrade({
      userId,
      asset: 'ETH',
      quoteAsset: 'USDT',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 3,
      price: 3000, // Notional: $9,000
      marketQuoteAgeMs: 2000,
    });

    expect(decision.approved).toBe(false);
    expect(decision.rejectReason).toContain('violate minimum liquid cash reserve of 15%');
  });

  it('rejects all orders when account is under emergency freeze', async () => {
    const db = getDb();
    await db.execute(`UPDATE account_limits SET is_emergency_frozen = 1 WHERE user_id = ?`, [userId]);

    const decision = await ServerRiskEngine.evaluateTrade({
      userId,
      asset: 'BTC',
      quoteAsset: 'USDT',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 0.01,
      price: 50000,
      marketQuoteAgeMs: 1000,
    });

    expect(decision.approved).toBe(false);
    expect(decision.rejectReason).toContain('emergency freeze');
  });
});
