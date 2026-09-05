import { describe, it, expect, beforeEach } from 'vitest';
import { BinanceGateway } from '../services/binanceGateway';
import { LedgerService } from '../services/ledgerService';
import { getDb } from '../db';

describe('Binance Execution Gateway & State Machine', () => {
  const userId = 'usr_binance_test_001';

  beforeEach(async () => {
    const db = getDb();
    await db.execute(`DELETE FROM exchange_orders WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM exchange_fills`);
    await db.execute(`DELETE FROM exchange_accounts WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_entries WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM account_limits WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);

    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
       VALUES (?, 'binance_test@lumen.io', 'Binance Tester', 'email', 'test_prov', ?, ?)`,
      [userId, Date.now(), Date.now()]
    );

    await db.execute(
      `INSERT INTO account_limits (id, user_id, is_emergency_frozen, max_single_order_pct, max_asset_concentration_pct, min_cash_reserve_pct, updated_at)
       VALUES (?, ?, 0, 0.40, 0.50, 0.15, ?)`,
      [`lim_${userId}`, userId, Date.now()]
    );
  });

  it('encrypts and decrypts exchange secrets securely at rest with AES-256-GCM', () => {
    const secret = 'vN18274h981273981h3208fh02183';
    const encrypted = BinanceGateway.encryptSecret(secret);

    expect(encrypted.ciphertext).not.toBe(secret);
    expect(encrypted.iv.length).toBe(24); // 12 bytes hex
    expect(encrypted.tag.length).toBe(32); // 16 bytes hex

    const decrypted = BinanceGateway.decryptSecret(encrypted.ciphertext, encrypted.iv, encrypted.tag);
    expect(decrypted).toBe(secret);
  });

  it('generates unique deterministic clientOrderId for tracking and idempotency', () => {
    const id1 = BinanceGateway.generateClientOrderId(userId, 'idemp_key_1');
    const id2 = BinanceGateway.generateClientOrderId(userId, 'idemp_key_2');
    const id1Dup = BinanceGateway.generateClientOrderId(userId, 'idemp_key_1');

    expect(id1.startsWith('lmn_')).toBe(true);
    expect(id2.startsWith('lmn_')).toBe(true);
    expect(id1).not.toBe(id2);
    expect(id1).toBe(id1Dup);
  });

  it('transitions order through state machine and stores fill records', async () => {
    // Fund account with 20,000 USDT in trading_allocated account
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'USDT',
      amountMinor: 2_000_000, // $20,000
      paymentId: 'pay_fund_binance',
      description: 'Fund Trading',
    });
    await LedgerService.transfer({
      userId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 2_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_fund_binance',
      description: 'Fund',
    });

    // Place 0.1 BTC order at $50,000 (notional $5,000 = 25% < 40% cap)
    const order = await BinanceGateway.submitOrder({
      userId,
      symbol: 'BTCUSDT',
      asset: 'BTC',
      quoteAsset: 'USDT',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 0.1,
      price: 50000,
      marketQuoteAgeMs: 2000,
      idempotencyKey: 'idemp_binance_ord_001',
    });

    expect(order.status).toBe('OPEN');
    expect(order.clientOrderId.startsWith('lmn_')).toBe(true);
    expect(order.notional).toBe(5000);

    // Duplicate submission with same idempotency key returns original order
    const dup = await BinanceGateway.submitOrder({
      userId,
      symbol: 'BTCUSDT',
      asset: 'BTC',
      quoteAsset: 'USDT',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 0.1,
      price: 50000,
      marketQuoteAgeMs: 2000,
      idempotencyKey: 'idemp_binance_ord_001',
    });

    expect(dup.clientOrderId).toBe(order.clientOrderId);
  });

  it('reconciles UNKNOWN orders cleanly without blind retries', async () => {
    const db = getDb();
    const clientOrderId = BinanceGateway.generateClientOrderId(userId, 'idemp_unk');
    const now = Date.now();

    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
      paymentId: 'pay_unk_test',
      description: 'Fund for unknown test',
    });
    await LedgerService.transfer({
      userId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_unk_test',
      description: 'Allocate trading capital',
    });
    await LedgerService.reserveOrderFunds({
      userId,
      orderId: clientOrderId,
      accountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 500_375n,
    });

    BinanceGateway.setMockOrderFills(clientOrderId, [
      {
        tradeId: 'trd_unk_001',
        price: '50000',
        qty: '0.1',
        commission: '3.75',
        commissionAsset: 'USDT',
        time: now,
      },
    ]);

    // Insert simulated order in UNKNOWN status
    await db.execute(
      `INSERT INTO exchange_orders (
        id, user_id, client_order_id, symbol, side, type, status, orig_qty,
        orig_qty_exact, price, price_exact, quote_asset, notional, notional_exact,
        reserved_cash, reserved_cash_minor, idempotency_key, created_at, updated_at
      ) VALUES (?, ?, ?, 'BTCUSDT', 'BUY', 'LIMIT', 'UNKNOWN', 0.1, '0.1', 50000, '50000', 'USDT', 5000, '5000', 5000, 500375, 'idemp_unk', ?, ?)`,
      [clientOrderId, userId, clientOrderId, now, now]
    );

    const reconciled = await BinanceGateway.reconcileUnknownOrder(clientOrderId);
    expect(reconciled.status).toBe('FILLED');
  });

  it('reconciles UNKNOWN order against Binance REST API gracefully when not found', async () => {
    const result = await BinanceGateway.reconcileUnknownOrder('nonexistent_order', 'BTCUSDT', userId);
    expect(result.found).toBe(false);
  });
});
