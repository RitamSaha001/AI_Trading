import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentService } from '../services/paymentService';
import { LedgerService } from '../services/ledgerService';
import { ProviderNetworkTimeoutError } from '../services/payments/types';
import { getDb } from '../db';

describe('Server Payment Service & Settlement', () => {
  const userId = 'usr_pay_test_001';

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

    // Verify payment_settlements audit record created
    const db = getDb();
    const settlement = await db.queryOne<any>(
      'SELECT * FROM payment_settlements WHERE payment_order_id = ?',
      [order.orderId]
    );
    expect(settlement).toBeDefined();
    expect(settlement.settlement_source).toBe('WEBHOOK');
    expect(Number(settlement.amount_minor)).toBe(50000);

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

  it('handles provider network timeout by transitioning order to UNKNOWN_PROVIDER_STATE', async () => {
    const provider = PaymentService.getProvider();
    const originalCreate = provider.createOrder;

    // Simulate provider network timeout
    provider.createOrder = vi.fn().mockRejectedValueOnce(
      new ProviderNetworkTimeoutError(provider.name, 'req_timeout_sim_001')
    );

    try {
      const res = await PaymentService.createPaymentOrder({
        userId,
        amountMinor: 15000,
        currency: 'USD',
        method: 'card',
        idempotencyKey: 'idemp_timeout_001',
      });

      expect(res.status).toBe('UNKNOWN_PROVIDER_STATE');

      const db = getDb();
      const order = await db.queryOne<any>(
        'SELECT * FROM payment_orders WHERE id = ?',
        [res.orderId]
      );
      expect(order.status).toBe('UNKNOWN_PROVIDER_STATE');

      const attempt = await db.queryOne<any>(
        'SELECT * FROM payment_attempts WHERE payment_order_id = ?',
        [res.orderId]
      );
      expect(attempt.status).toBe('TIMEOUT');
    } finally {
      provider.createOrder = originalCreate;
    }
  });

  it('rejects settlement on amount or currency mismatch', async () => {
    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 20000, // $200.00
      currency: 'USD',
      method: 'card',
      idempotencyKey: 'idemp_mismatch_001',
    });

    // Mismatched amount
    await expect(
      PaymentService.settlePayment({
        orderId: order.orderId,
        providerPaymentId: 'pay_mismatch_01',
        amountMinor: 99999,
        currency: 'USD',
        settlementSource: 'WEBHOOK',
      })
    ).rejects.toThrow(/mismatch/i);

    // Mismatched currency
    await expect(
      PaymentService.settlePayment({
        orderId: order.orderId,
        providerPaymentId: 'pay_mismatch_02',
        amountMinor: 20000,
        currency: 'INR',
        settlementSource: 'WEBHOOK',
      })
    ).rejects.toThrow(/mismatch/i);
  });

  it('executes full refund lifecycle with double-entry ledger debit and status transition', async () => {
    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 30000, // $300.00
      currency: 'USD',
      method: 'card',
      idempotencyKey: 'idemp_refund_order_001',
    });

    // Settle order
    await PaymentService.settlePayment({
      orderId: order.orderId,
      providerPaymentId: 'pay_settle_ref_001',
      amountMinor: 30000,
      currency: 'USD',
      settlementSource: 'WEBHOOK',
    });

    let balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(30000);

    // Partial refund of $100 (10,000 cents)
    const refund1 = await PaymentService.refundPayment({
      orderId: order.orderId,
      amountMinor: 10000,
      reason: 'Partial customer refund',
      idempotencyKey: 'ref_idemp_001',
      initiatedBy: userId,
    });

    expect(refund1.status).toBe('SUCCESS');

    balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(20000);

    const db = getDb();
    let updatedOrder = await db.queryOne<any>(
      'SELECT * FROM payment_orders WHERE id = ?',
      [order.orderId]
    );
    expect(updatedOrder.status).toBe('PARTIALLY_REFUNDED');
    expect(Number(updatedOrder.refunded_amount_minor)).toBe(10000);

    // Second refund: remaining $200 (20,000 cents)
    const refund2 = await PaymentService.refundPayment({
      orderId: order.orderId,
      amountMinor: 20000,
      reason: 'Full remaining refund',
      idempotencyKey: 'ref_idemp_002',
      initiatedBy: userId,
    });

    expect(refund2.status).toBe('SUCCESS');

    balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(0);

    updatedOrder = await db.queryOne<any>(
      'SELECT * FROM payment_orders WHERE id = ?',
      [order.orderId]
    );
    expect(updatedOrder.status).toBe('REFUNDED');
    expect(Number(updatedOrder.refunded_amount_minor)).toBe(30000);

    // Excess refund attempt rejected
    await expect(
      PaymentService.refundPayment({
        orderId: order.orderId,
        amountMinor: 5000,
        reason: 'Excess refund',
        idempotencyKey: 'ref_idemp_excess',
        initiatedBy: userId,
      })
    ).rejects.toThrow(/(?:exceeds refundable amount|Can only refund successful)/i);
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
