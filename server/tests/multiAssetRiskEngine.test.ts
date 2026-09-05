import { describe, it, expect, beforeEach } from 'vitest';
import { ServerRiskEngine } from '../services/riskEngine';
import { LedgerService } from '../services/ledgerService';
import { getDb } from '../db';

describe('Multi-Asset & Asset-Class Aware Risk Engine (Finding 2)', () => {
  const userId = 'usr_multi_asset_risk_001';

  beforeEach(async () => {
    const db = getDb();
    await db.execute(`DELETE FROM exchange_orders WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_entries WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM account_limits WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);

    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
       VALUES (?, 'risk_equity@lumen.io', 'Equity Risk Tester', 'email', 'test_prov', ?, ?)`,
      [userId, Date.now(), Date.now()]
    );

    await db.execute(
      `INSERT INTO account_limits (id, user_id, is_emergency_frozen, max_single_order_pct, max_asset_concentration_pct, min_cash_reserve_pct, updated_at)
       VALUES (?, ?, 0, 0.40, 0.50, 0.15, ?)`,
      [`lim_${userId}`, userId, Date.now()]
    );
  });

  it('evaluates Indian equity orders using INR cash and ₹ currency formatting', async () => {
    // Fund with ₹100,000 in trading_allocated:INR (10,000,000 paise)
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'INR',
      amountMinor: 10_000_000, // ₹100,000
      paymentId: 'pay_inr_001',
      description: 'Fund INR',
    });
    await LedgerService.transfer({
      userId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'INR',
      amountMinor: 10_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_inr_001',
      description: 'Allocate INR',
    });

    // Attempt ₹50,000 order (50% of ₹100,000 portfolio > 40% cap)
    const decision = await ServerRiskEngine.evaluateTrade({
      userId,
      broker: 'upstox',
      assetClass: 'EQUITY',
      symbol: 'RELIANCE',
      asset: 'RELIANCE',
      quoteAsset: 'INR',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 20,
      price: 2500, // Notional: ₹50,000
      marketQuoteAgeMs: 2000,
    });

    expect(decision.approved).toBe(false);
    expect(decision.currency).toBe('INR');
    expect(decision.currencySymbol).toBe('₹');
    expect(decision.rejectReason).toContain('exceeding maximum allowed limit of 40%');
    expect(decision.rejectReason).toContain('₹50000.00');
  });

  it('includes equity_holdings in portfolio valuation using integer share counts (0 decimals)', async () => {
    // Fund with ₹50,000 cash (5,000,000 paise)
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'INR',
      amountMinor: 5_000_000,
      paymentId: 'pay_inr_002',
      description: 'Fund Cash',
    });
    await LedgerService.transfer({
      userId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'INR',
      amountMinor: 5_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_inr_002',
      description: 'Allocate Cash',
    });

    // Credit 20 shares of TCS in equity_holdings (minor units = 20, 0 decimals)
    const tcsAccount = await LedgerService.getOrCreateAccount(userId, 'equity_holdings', 'TCS', 'live');
    const db = getDb();
    await db.execute(`UPDATE ledger_accounts SET balance_minor = 20 WHERE id = ?`, [tcsAccount.id]);

    // Portfolio should be: ₹50,000 cash + 20 TCS * ₹4,000 = ₹50,000 + ₹80,000 = ₹130,000
    // Buying 5 shares of RELIANCE at ₹2,800 = ₹14,000 (10.7% of portfolio <= 40% cap, remaining cash ₹36,000 > ₹19,500 reserve)
    const decision = await ServerRiskEngine.evaluateTrade({
      userId,
      broker: 'upstox',
      assetClass: 'EQUITY',
      symbol: 'RELIANCE',
      asset: 'RELIANCE',
      quoteAsset: 'INR',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 5,
      price: 2800, // Notional: ₹14,000
      marketQuoteAgeMs: 2000,
    });

    expect(decision.portfolioEquity).toBe(130000);
    expect(decision.notional).toBe(14000);
    expect(decision.approved).toBe(true);
  });

  it('preserves crypto risk engine evaluation and USD currency formatting without regression', async () => {
    // Fund with 10,000 USDT (1,000,000 cents)
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
      paymentId: 'pay_usdt_001',
      description: 'Fund USDT',
    });
    await LedgerService.transfer({
      userId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_usdt_001',
      description: 'Allocate USDT',
    });

    // Attempt $6,000 BTC order (60% > 40%)
    const decision = await ServerRiskEngine.evaluateTrade({
      userId,
      broker: 'binance',
      assetClass: 'CRYPTO',
      symbol: 'BTCUSDT',
      asset: 'BTC',
      quoteAsset: 'USDT',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 0.1,
      price: 60000, // Notional: $6,000
      marketQuoteAgeMs: 2000,
    });

    expect(decision.approved).toBe(false);
    expect(decision.currencySymbol).toBe('$');
    expect(decision.rejectReason).toContain('$6000.00');
    expect(decision.rejectReason).toContain('exceeding maximum allowed limit of 40%');
  });
});
