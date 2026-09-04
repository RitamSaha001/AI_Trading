import { describe, it, expect, beforeEach } from 'vitest';
import { PaymentService } from '../services/paymentService';
import { LedgerService } from '../services/ledgerService';
import { getDb } from '../db';

describe('Server Payment Service & Settlement', () => {
  const userId = 'usr_pay_test_001';

  beforeEach(async () => {
    const db = getDb();
    await db.execute(`DELETE FROM payments WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM payment_orders WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM payment_webhooks`);
    await db.execute(`DELETE FROM ledger_entries WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);

    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
       VALUES (?, 'payment_test@lumen.io', 'Payment Tester', 'email', 'test_prov', ?, ?)`,
      [userId, Date.now(), Date.now()]
    );
  });

  it('creates payment order intents and handles idempotency', async () => {
    const intent1 = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 25000, // $250.00
      currency: 'USD',
      method: 'card',
      idempotencyKey: 'idemp_pay_001',
    });

    expect(intent1.orderId.startsWith('po_')).toBe(true);
    expect(intent1.amountMinor).toBe(25000);

    // Duplicate call with same idempotency key returns exact same order
    const intent2 = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 25000,
      currency: 'USD',
      method: 'card',
      idempotencyKey: 'idemp_pay_001',
    });

    expect(intent2.orderId).toBe(intent1.orderId);
    expect(intent2.providerOrderId).toBe(intent1.providerOrderId);
  });

  it('verifies provider HMAC signatures and authoritatively settles captured funds onto the ledger', async () => {
    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 50000, // $500.00
      currency: 'USD',
      method: 'card',
      idempotencyKey: 'idemp_pay_002',
    });

    const eventPayload = {
      eventId: 'evt_test_webhook_001',
      provider: 'razorpay',
      eventType: 'payment.captured' as const,
      providerOrderId: order.providerOrderId,
      providerPaymentId: 'pay_rzp_987654321',
      amountMinor: 50000,
      currency: 'USD',
      cardLast4: '4242',
      cardBrand: 'visa',
    };

    const rawPayload = JSON.stringify(eventPayload);
    const validSignature = PaymentService.generateWebhookSignature(rawPayload);

    // Valid webhook processes and credits ledger
    const result = await PaymentService.processWebhook(rawPayload, validSignature, eventPayload);
    expect(result.status).toBe('PROCESSED');
    expect(result.paymentId).toBeDefined();

    // Check ledger balance
    const balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(50000);

    // Replay of same webhook is detected and deduplicated
    const replayResult = await PaymentService.processWebhook(rawPayload, validSignature, eventPayload);
    expect(replayResult.status).toBe('DUPLICATE');

    // Balance should remain strictly $500 (no double-crediting!)
    const balancesAfterReplay = await LedgerService.getUserBalances(userId);
    expect(balancesAfterReplay['sovereign_cash:USD'].balance).toBe(50000);
  });

  it('rejects webhooks with invalid HMAC signatures', async () => {
    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 10000,
      currency: 'USD',
      method: 'card',
      idempotencyKey: 'idemp_pay_003',
    });

    const eventPayload = {
      eventId: 'evt_test_bad_sig',
      provider: 'razorpay',
      eventType: 'payment.captured' as const,
      providerOrderId: order.providerOrderId,
      providerPaymentId: 'pay_bad_001',
      amountMinor: 10000,
      currency: 'USD',
    };

    const rawPayload = JSON.stringify(eventPayload);
    const badSignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    await expect(
      PaymentService.processWebhook(rawPayload, badSignature, eventPayload)
    ).rejects.toThrow(/Invalid webhook signature/);

    // Ledger balance remains 0
    const balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD']?.balance || 0).toBe(0);
  });

  it('strictly marks manual Indian UTR as PENDING_MANUAL_SETTLEMENT without crediting wallet', async () => {
    const utr = '423589123456';
    const amountINR = 5000;

    const res = await PaymentService.submitManualUTR({
      userId,
      utr,
      amountINR,
    });

    expect(res.status).toBe('pending_manual_settlement');
    expect(res.message).toContain('Funds will be credited after bank reconciliation confirms settlement');

    // CRITICAL TEST: Zero wallet credit on UTR entry
    const balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:INR']?.balance || 0).toBe(0);

    // Duplicate UTR submission rejected
    await expect(
      PaymentService.submitManualUTR({
        userId,
        utr,
        amountINR,
      })
    ).rejects.toThrow(/already been submitted/);

    // Authoritative clearance clears and credits funds
    const clearance = await PaymentService.reconcileManualUTR({
      paymentId: res.paymentId,
      reconciledBy: 'nodal_bank_reconciler_system',
      bankReference: 'NPCI-CLEAR-20260904-8899',
    });

    expect(clearance.cleared).toBe(true);
    expect(clearance.balanceAfter).toBe(500000n); // 5000 INR in paise

    const clearedBalances = await LedgerService.getUserBalances(userId);
    expect(clearedBalances['sovereign_cash:INR'].balance).toBe(500000);
  });
});
