import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentService } from '../services/paymentService';
import { LedgerService } from '../services/ledgerService';
import { ProviderNetworkTimeoutError, IdempotencyConflictError } from '../services/payments/types';
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

  it('throws IdempotencyConflictError when reusing idempotency key with conflicting parameters', async () => {
    const key = 'idemp_conflict_key_999';

    await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 10000,
      currency: 'USD',
      method: 'card',
      idempotencyKey: key,
    });

    // Mismatched amount
    await expect(
      PaymentService.createPaymentOrder({
        userId,
        amountMinor: 20000,
        currency: 'USD',
        method: 'card',
        idempotencyKey: key,
      })
    ).rejects.toThrow(IdempotencyConflictError);

    // Mismatched currency
    await expect(
      PaymentService.createPaymentOrder({
        userId,
        amountMinor: 10000,
        currency: 'INR',
        method: 'card',
        idempotencyKey: key,
      })
    ).rejects.toThrow(IdempotencyConflictError);

    // Mismatched method
    await expect(
      PaymentService.createPaymentOrder({
        userId,
        amountMinor: 10000,
        currency: 'USD',
        method: 'upi',
        idempotencyKey: key,
      })
    ).rejects.toThrow(IdempotencyConflictError);

    // Mismatched user
    await expect(
      PaymentService.createPaymentOrder({
        userId: 'usr_different_user_002',
        amountMinor: 10000,
        currency: 'USD',
        method: 'card',
        idempotencyKey: key,
      })
    ).rejects.toThrow(IdempotencyConflictError);
  });

  it('ensures single atomic database transaction rollback if settlement audit record fails', async () => {
    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 45000, // $450.00
      currency: 'USD',
      method: 'card',
      idempotencyKey: 'idemp_atomic_settle_001',
    });

    const db = getDb();

    // Temporarily intercept db.execute to inject a failure specifically on INSERT INTO payment_settlements
    const originalExecute = db.execute.bind(db);
    vi.spyOn(db, 'execute').mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('INSERT INTO payment_settlements')) {
        throw new Error('Simulated disk/constraint crash during payment_settlements insert');
      }
      return originalExecute(sql, params);
    });

    try {
      await expect(
        PaymentService.settlePayment({
          orderId: order.orderId,
          providerPaymentId: 'pay_crash_test_001',
          amountMinor: 45000,
          currency: 'USD',
          settlementSource: 'WEBHOOK',
        })
      ).rejects.toThrow(/Simulated disk\/constraint crash/);

      // Verify that the entire transaction was rolled back!
      // 1. Ledger balance must be strictly 0 (creditDeposit must NOT have persisted)
      const balances = await LedgerService.getUserBalances(userId);
      expect(balances['sovereign_cash:USD']?.balance || 0).toBe(0);

      // 2. Ledger entries must NOT exist
      const entries = await db.query<any>(
        `SELECT * FROM ledger_entries WHERE user_id = ? AND reference_type = 'deposit'`,
        [userId]
      );
      expect(entries.length).toBe(0);

      // 3. Payment row must NOT exist
      const payment = await db.queryOne<any>(
        `SELECT * FROM payments WHERE payment_order_id = ?`,
        [order.orderId]
      );
      expect(payment).toBeNull();

      // 4. Order status must NOT be SUCCESS
      const orderAfter = await db.queryOne<any>(
        `SELECT * FROM payment_orders WHERE id = ?`,
        [order.orderId]
      );
      expect(orderAfter.status).not.toBe('SUCCESS');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('persists raw headers/body and marks webhook failed_retryable on transient settlement failure, allowing replay', async () => {
    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 35000, // $350.00
      currency: 'USD',
      method: 'card',
      idempotencyKey: 'idemp_webhook_retry_001',
    });

    const eventPayload = {
      eventId: 'evt_transient_failure_001',
      provider: 'razorpay',
      eventType: 'payment.captured' as const,
      providerOrderId: order.providerOrderId,
      providerPaymentId: 'pay_transient_001',
      amountMinor: 35000,
      currency: 'USD',
    };

    const rawPayload = JSON.stringify(eventPayload);
    const validSignature = PaymentService.generateWebhookSignature(rawPayload);
    const headers = { 'x-webhook-signature': validSignature, 'user-agent': 'WebhookTester/1.0' };

    // Inject transient settlement error on first attempt
    const originalSettle = PaymentService.settlePayment.bind(PaymentService);
    let attempt = 0;
    vi.spyOn(PaymentService, 'settlePayment').mockImplementation(async (...args: any[]) => {
      attempt++;
      if (attempt === 1) {
        throw new Error('Transient database lock timeout');
      }
      return (originalSettle as any)(...args);
    });

    try {
      // 1. First webhook attempt fails due to transient settlement error
      await expect(
        PaymentService.processWebhook(rawPayload, validSignature, eventPayload, headers)
      ).rejects.toThrow(/Transient database lock timeout/);

      const db = getDb();
      const webhookRow = await db.queryOne<any>(
        `SELECT * FROM payment_webhooks WHERE event_id = ?`,
        [eventPayload.eventId]
      );

      // Verify raw body & headers were saved and status is failed_retryable
      expect(webhookRow).toBeDefined();
      expect(webhookRow.status).toBe('failed_retryable');
      expect(webhookRow.raw_body).toBe(rawPayload);
      expect(webhookRow.raw_headers).toContain('WebhookTester/1.0');
      expect(webhookRow.error).toContain('Transient database lock timeout');

      // 2. Replaying the EXACT SAME event ID is NOT blocked as duplicate; it re-executes!
      const replayResult = await PaymentService.processWebhook(rawPayload, validSignature, eventPayload, headers);
      expect(replayResult.status).toBe('PROCESSED');

      // Webhook record is now updated to 'processed'
      const updatedWebhook = await db.queryOne<any>(
        `SELECT * FROM payment_webhooks WHERE event_id = ?`,
        [eventPayload.eventId]
      );
      expect(updatedWebhook.status).toBe('processed');
      expect(updatedWebhook.error).toBeNull();

      // Ledger balance is credited
      const balances = await LedgerService.getUserBalances(userId);
      expect(balances['sovereign_cash:USD'].balance).toBe(35000);

      // 3. Subsequent replay once processed IS detected as DUPLICATE
      const duplicateResult = await PaymentService.processWebhook(rawPayload, validSignature, eventPayload, headers);
      expect(duplicateResult.status).toBe('DUPLICATE');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('preserves sovereign cash balance when provider refund fails or times out (non-inverted accounting)', async () => {
    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 50000, // $500.00
      currency: 'USD',
      method: 'card',
      idempotencyKey: 'idemp_refund_safety_001',
    });

    await PaymentService.settlePayment({
      orderId: order.orderId,
      providerPaymentId: 'pay_safety_ref_001',
      amountMinor: 50000,
      currency: 'USD',
      settlementSource: 'WEBHOOK',
    });

    let balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(50000);

    const provider = PaymentService.getProvider();
    const originalRefund = provider.refund;

    // 1. Provider network timeout scenario
    provider.refund = vi.fn().mockRejectedValueOnce(
      new ProviderNetworkTimeoutError(provider.name, 'timeout_ref_sim_001')
    );

    try {
      const timeoutRes = await PaymentService.refundPayment({
        orderId: order.orderId,
        amountMinor: 20000,
        reason: 'Customer dispute',
        idempotencyKey: 'ref_safety_timeout_001',
        initiatedBy: userId,
      });

      expect(timeoutRes.status).toBe('REFUND_UNKNOWN');

      // CRITICAL: Sovereign cash balance MUST REMAIN EXACTLY 50,000 (0 deducted!)
      balances = await LedgerService.getUserBalances(userId);
      expect(balances['sovereign_cash:USD'].balance).toBe(50000);

      const db = getDb();
      const refundRow = await db.queryOne<any>(
        `SELECT * FROM payment_refunds WHERE id = ?`,
        [timeoutRes.refundId]
      );
      expect(refundRow.status).toBe('REFUND_UNKNOWN');

      const orderRow = await db.queryOne<any>(
        `SELECT * FROM payment_orders WHERE id = ?`,
        [order.orderId]
      );
      expect(orderRow.status).toBe('SUCCESS');
      expect(Number(orderRow.refunded_amount_minor)).toBe(0);

      // 2. Provider hard failure scenario
      provider.refund = vi.fn().mockResolvedValueOnce({
        success: false,
        status: 'FAILED',
        refundId: 'ref_failed_sim_001',
        amountMinor: 20000,
        error: 'Bank account frozen',
      });

      await expect(
        PaymentService.refundPayment({
          orderId: order.orderId,
          amountMinor: 20000,
          reason: 'Customer dispute 2',
          idempotencyKey: 'ref_safety_failed_001',
          initiatedBy: userId,
        })
      ).rejects.toThrow(/Refund failed at provider/);

      // CRITICAL: Sovereign cash balance STILL REMAINING EXACTLY 50,000!
      balances = await LedgerService.getUserBalances(userId);
      expect(balances['sovereign_cash:USD'].balance).toBe(50000);
    } finally {
      provider.refund = originalRefund;
    }
  });

  it('preserves unexpired PENDING and UNKNOWN orders during reconciliation sweep without collapsing to FAILED', async () => {
    const db = getDb();
    const now = Date.now();
    const threeMinutesAgo = now - 3 * 60 * 1000;

    // Order 1: older than 2 min, unexpired, provider says PENDING
    const order1Id = `po_sweep_pending_${now}`;
    await db.execute(
      `INSERT INTO payment_orders (
        id, user_id, amount_minor, currency, method, provider, provider_order_id,
        status, idempotency_key, expires_at, created_at, updated_at
      ) VALUES (?, ?, 10000, 'USD', 'card', 'sandbox', 'prov_sweep_1', 'PENDING', 'idemp_sw_1', ?, ?, ?)`,
      [order1Id, userId, now + 10 * 60 * 1000, threeMinutesAgo, threeMinutesAgo]
    );

    // Order 2: older than 2 min, provider checkStatus throws network error / returns UNKNOWN
    const order2Id = `po_sweep_unknown_${now}`;
    await db.execute(
      `INSERT INTO payment_orders (
        id, user_id, amount_minor, currency, method, provider, provider_order_id,
        status, idempotency_key, expires_at, created_at, updated_at
      ) VALUES (?, ?, 15000, 'USD', 'card', 'sandbox', 'prov_sweep_2', 'UNKNOWN_PROVIDER_STATE', 'idemp_sw_2', ?, ?, ?)`,
      [order2Id, userId, now + 10 * 60 * 1000, threeMinutesAgo, threeMinutesAgo]
    );

    const provider = PaymentService.getProvider();
    const originalCheckStatus = provider.checkStatus;

    provider.checkStatus = vi.fn().mockImplementation(async (provOrderId: string) => {
      if (provOrderId === 'prov_sweep_1') {
        return { providerOrderId: provOrderId, status: 'PENDING', amountMinor: 10000, currency: 'USD' };
      }
      if (provOrderId === 'prov_sweep_2') {
        return { providerOrderId: provOrderId, status: 'UNKNOWN', amountMinor: 0, currency: 'USD' };
      }
      return { providerOrderId: provOrderId, status: 'UNKNOWN', amountMinor: 0, currency: 'USD' };
    });

    try {
      const sweep = await PaymentService.reconcilePendingPayments();
      expect(sweep.reconciledCount).toBe(0);
      expect(sweep.mismatchCount).toBe(1); // 1 unknown

      // Verify Order 1 is STILL PENDING (not collapsed to FAILED!)
      const order1After = await db.queryOne<any>(`SELECT status FROM payment_orders WHERE id = ?`, [order1Id]);
      expect(order1After.status).toBe('PENDING');

      // Verify Order 2 is STILL UNKNOWN_PROVIDER_STATE (not collapsed to FAILED!)
      const order2After = await db.queryOne<any>(`SELECT status FROM payment_orders WHERE id = ?`, [order2Id]);
      expect(order2After.status).toBe('UNKNOWN_PROVIDER_STATE');
    } finally {
      provider.checkStatus = originalCheckStatus;
    }
  });
});
