import { describe, it, expect, beforeEach } from 'vitest';
import { PaymentService } from '../services/paymentService';
import { LedgerService } from '../services/ledgerService';
import { IdempotencyConflictError } from '../services/payments/types';
import { getDb } from '../db';

describe('Payment & Ledger Concurrency Hardening', () => {
  const userId = 'usr_pay_concurrency_001';

  beforeEach(async () => {
    const db = getDb();
    await db.execute(`DELETE FROM payment_refunds`);
    await db.execute(`DELETE FROM payment_settlements`);
    await db.execute(`DELETE FROM payment_attempts`);
    await db.execute(`DELETE FROM payments WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM payment_orders WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM payment_webhooks`);
    await db.execute(`DELETE FROM ledger_entries WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);

    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
       VALUES (?, 'concurrency_test@lumen.io', 'Concurrency Tester', 'email', 'test_prov', ?, ?)`,
      [userId, Date.now(), Date.now()]
    );
  });

  it('handles 10 concurrent credits to the same account with exact final balance sum', async () => {
    const creditAmount = 1000; // $10.00 each
    const concurrency = 10;

    const promises = Array.from({ length: concurrency }, (_, idx) =>
      LedgerService.creditDeposit({
        userId,
        assetOrCurrency: 'USD',
        amountMinor: creditAmount,
        paymentId: `pay_concurrent_cred_${idx}_${Date.now()}`,
        description: `Concurrent credit ${idx}`,
        idempotencyKey: `idemp_concurrent_cred_${idx}`,
      })
    );

    const results = await Promise.all(promises);
    expect(results.length).toBe(concurrency);

    // Verify authoritative balance in DB
    const balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(creditAmount * concurrency);

    // Verify double-entry integrity
    const replay = await LedgerService.replayAccountState(userId, 'live');
    expect(replay.consistent).toBe(true);
  });

  it('rejects concurrent refund overages: 10 concurrent refunds of 800 on a 1000 order allows only 1 to succeed', async () => {
    // 1. Create and settle a $10.00 (1000 minor) order
    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 1000,
      currency: 'USD',
      method: 'card',
      idempotencyKey: 'idemp_order_refund_race',
    });

    const settleResult = await PaymentService.settlePayment({
      orderId: order.orderId,
      providerPaymentId: 'pay_prov_refund_race_001',
      amountMinor: 1000,
      currency: 'USD',
      settlementSource: 'STATUS_POLL',
    });
    expect(settleResult.status).toBe('SETTLED');

    // User balance should now be 1000
    let balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(1000);

    // 2. Launch 10 concurrent refund attempts of 800 each
    const refundAttempts = 10;
    const refundResults = await Promise.allSettled(
      Array.from({ length: refundAttempts }, (_, i) =>
        PaymentService.refundPayment({
          orderId: order.orderId,
          amountMinor: 800,
          reason: `Concurrent refund test attempt ${i}`,
          idempotencyKey: `idemp_ref_race_${i}`,
          initiatedBy: userId,
        })
      )
    );

    const fulfilled = refundResults.filter((r) => r.status === 'fulfilled');
    const rejected = refundResults.filter((r) => r.status === 'rejected');

    // Exactly 1 refund must succeed (800 minor units). 9 must be rejected due to capacity (1000 - 800 < 800).
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(9);

    for (const rej of rejected) {
      if (rej.status === 'rejected') {
        expect(rej.reason.message).toMatch(/Refund amount exceeds available refundable capacity/);
      }
    }

    // 3. Verify total refunded on payment_orders record
    const db = getDb();
    const updatedOrder = await db.queryOne<any>(`SELECT * FROM payment_orders WHERE id = ?`, [order.orderId]);
    expect(Number(updatedOrder.refunded_amount_minor)).toBe(800);
    expect(Number(updatedOrder.reserved_refund_amount_minor)).toBe(0);
    expect(updatedOrder.status).toBe('PARTIALLY_REFUNDED');

    // 4. Verify user sovereign_cash balance is debited by exactly 800 (1000 - 800 = 200)
    balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(200);

    // Verify double-entry balance check
    const replay = await LedgerService.replayAccountState(userId, 'live');
    expect(replay.consistent).toBe(true);
  });

  it('maintains exact conservation across 5 concurrent transfers between sovereign_cash and trading_allocated', async () => {
    // Credit initial 100,000 minor units ($1,000.00)
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'USD',
      amountMinor: 100000,
      paymentId: 'pay_transfer_initial',
      description: 'Initial balance for transfer concurrency test',
      idempotencyKey: 'idemp_transfer_init',
    });

    // 5 concurrent transfers of 10,000 each from sovereign_cash to trading_allocated
    const transferCount = 5;
    const transferAmount = 10000;

    const transferPromises = Array.from({ length: transferCount }, (_, i) =>
      LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USD',
        amountMinor: transferAmount,
        referenceType: 'allocation',
        referenceId: `alloc_concurrent_${i}`,
        description: `Concurrent allocation ${i}`,
        idempotencyKey: `idemp_alloc_${i}`,
      })
    );

    const results = await Promise.all(transferPromises);
    expect(results.length).toBe(transferCount);

    const balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(50000);
    expect(balances['trading_allocated:USD'].balance).toBe(50000);

    const replay = await LedgerService.replayAccountState(userId, 'live');
    expect(replay.consistent).toBe(true);
  });

  it('guarantees single order creation when 20 concurrent order creations race with identical idempotency key', async () => {
    const concurrency = 20;
    const idempotencyKey = 'idemp_race_20_order_creations';

    const orderPromises = Array.from({ length: concurrency }, () =>
      PaymentService.createPaymentOrder({
        userId,
        amountMinor: 25000,
        currency: 'USD',
        method: 'card',
        idempotencyKey,
      })
    );

    const results = await Promise.all(orderPromises);
    expect(results.length).toBe(concurrency);

    const firstOrderId = results[0].orderId;
    const firstProviderOrderId = results[0].providerOrderId;

    // All 20 calls must yield the exact same orderId and providerOrderId
    for (const res of results) {
      expect(res.orderId).toBe(firstOrderId);
      expect(res.providerOrderId).toBe(firstProviderOrderId);
    }

    // Exactly 1 order record in database
    const db = getDb();
    const rows = await db.query<any>(`SELECT * FROM payment_orders WHERE idempotency_key = ?`, [idempotencyKey]);
    expect(rows.length).toBe(1);
  });

  it('throws IdempotencyConflictError when reusing an idempotency key with conflicting parameters', async () => {
    const idempotencyKey = 'idemp_conflict_test_001';

    await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 5000,
      currency: 'USD',
      method: 'card',
      idempotencyKey,
    });

    // Mismatched amount
    await expect(
      PaymentService.createPaymentOrder({
        userId,
        amountMinor: 9999,
        currency: 'USD',
        method: 'card',
        idempotencyKey,
      })
    ).rejects.toThrow(IdempotencyConflictError);

    // Mismatched currency
    await expect(
      PaymentService.createPaymentOrder({
        userId,
        amountMinor: 5000,
        currency: 'INR',
        method: 'card',
        idempotencyKey,
      })
    ).rejects.toThrow(IdempotencyConflictError);
  });

  it('deduplicates 20 concurrent webhook deliveries of the same event with exactly 1 settlement and 1 credit', async () => {
    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 15000,
      currency: 'USD',
      method: 'card',
      idempotencyKey: 'idemp_webhook_race_order',
    });

    const eventPayload = {
      eventId: 'evt_concurrent_webhook_001',
      provider: 'razorpay',
      eventType: 'payment.captured' as const,
      providerOrderId: order.providerOrderId,
      providerPaymentId: 'pay_rzp_concurrent_001',
      amountMinor: 15000,
      currency: 'USD',
      cardLast4: '4242',
      cardBrand: 'visa',
    };

    const rawPayload = JSON.stringify(eventPayload);
    const validSignature = PaymentService.generateWebhookSignature(rawPayload);

    // Launch 20 concurrent webhook requests
    const concurrency = 20;
    const webhookPromises = Array.from({ length: concurrency }, () =>
      PaymentService.processWebhook(rawPayload, validSignature, eventPayload)
    );

    const results = await Promise.all(webhookPromises);

    const processed = results.filter((r) => r.status === 'PROCESSED');
    const duplicates = results.filter((r) => r.status === 'DUPLICATE');

    expect(processed.length).toBe(1);
    expect(duplicates.length).toBe(concurrency - 1);

    // Assert exact single credit onto user's sovereign cash
    const balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(15000);

    // Verify DB records
    const db = getDb();
    const settlements = await db.query<any>(
      `SELECT * FROM payment_settlements WHERE payment_order_id = ?`,
      [order.orderId]
    );
    expect(settlements.length).toBe(1);

    const payments = await db.query<any>(
      `SELECT * FROM payments WHERE payment_order_id = ?`,
      [order.orderId]
    );
    expect(payments.length).toBe(1);
  });

  it('guarantees exactly 1 settlement when webhook delivery and status polling race simultaneously', async () => {
    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 30000,
      currency: 'USD',
      method: 'card',
      idempotencyKey: 'idemp_simultaneous_race_order',
    });

    const eventPayload = {
      eventId: 'evt_simultaneous_race_001',
      provider: 'razorpay',
      eventType: 'payment.captured' as const,
      providerOrderId: order.providerOrderId,
      providerPaymentId: 'pay_rzp_simultaneous_001',
      amountMinor: 30000,
      currency: 'USD',
    };
    const rawPayload = JSON.stringify(eventPayload);
    const validSignature = PaymentService.generateWebhookSignature(rawPayload);

    // Fire webhook processing and status polling / settlePayment concurrently
    const [webhookResult, settleResult] = await Promise.all([
      PaymentService.processWebhook(rawPayload, validSignature, eventPayload),
      PaymentService.settlePayment({
        orderId: order.orderId,
        providerPaymentId: 'pay_rzp_simultaneous_001',
        amountMinor: 30000,
        currency: 'USD',
        settlementSource: 'STATUS_POLL',
      }),
    ]);

    // One must be PROCESSED / SETTLED, and the other must be DUPLICATE
    const results = [webhookResult.status, settleResult.status];
    expect(results).toContain('DUPLICATE');
    expect(results.some((s) => s === 'PROCESSED' || s === 'SETTLED')).toBe(true);

    // Exactly 30,000 credited to sovereign_cash
    const balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(30000);

    // Double-entry check
    const replay = await LedgerService.replayAccountState(userId, 'live');
    expect(replay.consistent).toBe(true);
  });
});
