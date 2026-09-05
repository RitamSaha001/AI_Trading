import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '../db';
import { PaymentService } from '../services/paymentService';
import { LedgerService } from '../services/ledgerService';
import { requireFinanceAdmin } from '../middleware/authMiddleware';
import crypto from 'node:crypto';

describe('Payment Provider Semantic Integrity & Financial Invariant Suite', () => {
  const testRunId = `run_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const userId = `usr_prov_int_${testRunId}`;

  beforeEach(async () => {
    const db = getDb();
    await db.execute(`DELETE FROM payment_refunds WHERE payment_order_id IN (SELECT id FROM payment_orders WHERE user_id = ?)`, [userId]);
    await db.execute(`DELETE FROM payment_settlements WHERE payment_order_id IN (SELECT id FROM payment_orders WHERE user_id = ?)`, [userId]);
    await db.execute(`DELETE FROM payments WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM payment_attempts WHERE payment_order_id IN (SELECT id FROM payment_orders WHERE user_id = ?)`, [userId]);
    await db.execute(`DELETE FROM payment_orders WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM payment_webhooks WHERE event_id LIKE ?`, [`%${testRunId}%`]);
    await db.execute(`DELETE FROM ledger_entries WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM kyc_records WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM account_limits WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM sessions WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);

    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, ?, 'Provider Integrity Tester', 'email', ?, 'TRADER', ?, ?)`,
      [userId, `${userId}@lumen.io`, userId, Date.now(), Date.now()]
    );
  });

  it('1. Provider SUCCESS with missing providerPaymentId fails closed as UNKNOWN_PROVIDER_STATE', async () => {
    const db = getDb();
    const orderId = `po_noprov_${testRunId}`;
    const now = Date.now() - 3 * 60 * 1000; // 3 minutes ago

    await db.execute(
      `INSERT INTO payment_orders (
        id, user_id, amount_minor, currency, method, provider, provider_order_id,
        status, idempotency_key, expires_at, created_at, updated_at
      ) VALUES (?, ?, 2000, 'USD', 'card', 'sandbox', ?, 'PENDING', ?, ?, ?, ?)`,
      [orderId, userId, orderId, `idemp_noprov_${testRunId}`, now + 15 * 60 * 1000, now, now]
    );

    // Mock provider checkStatus returning SUCCESS but empty providerPaymentId
    const provider = PaymentService.getProvider();
    const originalCheckStatus = provider.checkStatus;
    provider.checkStatus = async () => ({
      providerOrderId: orderId,
      status: 'SUCCESS',
      amountMinor: 2000,
      currency: 'USD',
      providerPaymentId: '', // Empty/missing!
    });

    try {
      const sweep = await PaymentService.reconcilePendingPayments();
      expect(sweep.mismatchCount).toBeGreaterThan(0);

      // Verify order transitioned to UNKNOWN_PROVIDER_STATE and NOT SUCCESS
      const order = await db.queryOne<any>(`SELECT * FROM payment_orders WHERE id = ?`, [orderId]);
      expect(order.status).toBe('UNKNOWN_PROVIDER_STATE');

      // Verify zero ledger credits exist
      const balances = await LedgerService.getUserBalances(userId);
      expect(balances['sovereign_cash:USD']?.balance || 0n).toBe(0n);
    } finally {
      provider.checkStatus = originalCheckStatus;
    }
  });

  it('2. PhonePe webhook rejects events with missing mandatory fields', async () => {
    const provider = PaymentService.getProvider();
    const originalVerify = provider.verifyWebhook;

    // A. Missing providerPaymentId
    provider.verifyWebhook = async () => ({
      isValid: true,
      eventId: `evt_missing_payid_${testRunId}`,
      providerOrderId: `po_test_${testRunId}`,
      status: 'captured',
      amountMinor: 1000,
      currency: 'INR',
      providerPaymentId: '',
    });

    await expect(
      PaymentService.processPhonePeWebhook('{}', {})
    ).rejects.toThrow(/missing providerPaymentId/i);

    // B. Missing providerOrderId
    provider.verifyWebhook = async () => ({
      isValid: true,
      eventId: `evt_missing_orderid_${testRunId}`,
      providerOrderId: '',
      status: 'captured',
      amountMinor: 1000,
      currency: 'INR',
      providerPaymentId: 'pay_valid_123',
    });

    await expect(
      PaymentService.processPhonePeWebhook('{}', {})
    ).rejects.toThrow(/missing providerOrderId/i);

    // C. Missing amountMinor
    provider.verifyWebhook = async () => ({
      isValid: true,
      eventId: `evt_missing_amt_${testRunId}`,
      providerOrderId: `po_test_${testRunId}`,
      status: 'captured',
      amountMinor: 0,
      currency: 'INR',
      providerPaymentId: 'pay_valid_123',
    });

    await expect(
      PaymentService.processPhonePeWebhook('{}', {})
    ).rejects.toThrow(/missing or invalid amountMinor/i);

    // D. Missing currency
    provider.verifyWebhook = async () => ({
      isValid: true,
      eventId: `evt_missing_curr_${testRunId}`,
      providerOrderId: `po_test_${testRunId}`,
      status: 'captured',
      amountMinor: 1000,
      currency: '',
      providerPaymentId: 'pay_valid_123',
    });

    await expect(
      PaymentService.processPhonePeWebhook('{}', {})
    ).rejects.toThrow(/missing currency/i);

    provider.verifyWebhook = originalVerify;
  });

  it('3. Rejects settlement if providerPaymentId has already been credited to another order', async () => {
    const sharedProviderPaymentId = `prov_shared_txn_${testRunId}`;

    // Order 1
    const order1 = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 1000,
      currency: 'USD',
      method: 'card',
      idempotencyKey: `idemp_shared_ord1_${testRunId}`,
    });

    const res1 = await PaymentService.settlePayment({
      orderId: order1.orderId,
      providerPaymentId: sharedProviderPaymentId,
      amountMinor: 1000,
      currency: 'USD',
      settlementSource: 'STATUS_POLL',
    });
    expect(res1.status).toBe('SETTLED');

    // Order 2
    const order2 = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 1000,
      currency: 'USD',
      method: 'card',
      idempotencyKey: `idemp_shared_ord2_${testRunId}`,
    });

    // Attempt settlement of Order 2 with Order 1's provider payment ID
    await expect(
      PaymentService.settlePayment({
        orderId: order2.orderId,
        providerPaymentId: sharedProviderPaymentId,
        amountMinor: 1000,
        currency: 'USD',
        settlementSource: 'STATUS_POLL',
      })
    ).rejects.toThrow(/has already been credited to another order/i);
  });

  it('4. Manual UTR deposit sets provider_payment_id = NULL and does not fabricate UTR string as provider payment ID', async () => {
    const utr = '987654321098';
    const submission = await PaymentService.submitManualUTR({
      userId,
      utr,
      amountINR: 2500,
    });

    expect(submission.status).toBe('pending_manual_settlement');

    const db = getDb();
    const payment = await db.queryOne<any>(`SELECT * FROM payments WHERE id = ?`, [submission.paymentId]);
    expect(payment.provider_payment_id).toBeNull(); // Strictly NULL!
    expect(payment.utr).toBe(utr);

    // Reconcile by Finance Admin with authentic bank reference
    const bankReference = `BANK_TXN_REF_${testRunId}`;
    const reconciled = await PaymentService.reconcileManualUTR({
      paymentId: submission.paymentId,
      reconciledBy: 'usr_finance_admin_001',
      bankReference,
    });

    expect(reconciled.cleared).toBe(true);

    const clearedPayment = await db.queryOne<any>(`SELECT * FROM payments WHERE id = ?`, [submission.paymentId]);
    expect(clearedPayment.provider_payment_id).toBe(bankReference);
    expect(clearedPayment.status).toBe('succeeded');
  });

  it('5. Economic refund reservation reserves cash and prevents double spend before provider confirmation', async () => {
    // 1. Initial deposit of 1000 minor ($10.00)
    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 1000,
      currency: 'USD',
      method: 'card',
      idempotencyKey: `idemp_econ_ref_${testRunId}`,
    });

    await PaymentService.settlePayment({
      orderId: order.orderId,
      providerPaymentId: `prov_econ_pay_${testRunId}`,
      amountMinor: 1000,
      currency: 'USD',
      settlementSource: 'STATUS_POLL',
    });

    const initialBalances = await LedgerService.getUserBalances(userId);
    expect(initialBalances['sovereign_cash:USD'].balance).toBe(1000);
    expect(initialBalances['sovereign_cash:USD'].reserved).toBe(0);

    // 2. Mock provider refund returning PENDING
    const provider = PaymentService.getProvider();
    const originalRefund = provider.refund;
    provider.refund = async () => ({
      success: true,
      refundId: `prov_ref_pending_${testRunId}`,
      status: 'PENDING',
      amountMinor: 400,
    });

    try {
      const refund = await PaymentService.refundPayment({
        orderId: order.orderId,
        amountMinor: 400,
        reason: 'Customer requested refund',
        idempotencyKey: `idemp_ref_pending_${testRunId}`,
        initiatedBy: userId,
      });

      expect(refund.status).toBe('PENDING');

      // Cash balance remains 1000, but reserved is now 400!
      const midBalances = await LedgerService.getUserBalances(userId);
      expect(midBalances['sovereign_cash:USD'].balance).toBe(1000);
      expect(midBalances['sovereign_cash:USD'].reserved).toBe(400);

      // Attempt to spend or transfer 700 (unreserved is only 600) -> MUST BE REJECTED!
      await expect(
        LedgerService.transfer({
          userId,
          fromAccountType: 'sovereign_cash',
          toAccountType: 'trading_allocated',
          assetOrCurrency: 'USD',
          amountMinor: 700,
          referenceType: 'test',
          referenceId: 'ref_fail_700',
          description: 'Over-spend attempt',
        })
      ).rejects.toThrow(/insufficient.*balance/i);

      // Can transfer 600 (exact unreserved balance)
      await LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USD',
        amountMinor: 600,
        referenceType: 'test',
        referenceId: 'ref_ok_600',
        description: 'Spend within unreserved balance',
      });

      const afterSpendBalances = await LedgerService.getUserBalances(userId);
      expect(afterSpendBalances['sovereign_cash:USD'].balance).toBe(400);
      expect(afterSpendBalances['sovereign_cash:USD'].reserved).toBe(400);
    } finally {
      provider.refund = originalRefund;
    }
  });

  it('6. Operational metrics returns telemetry counts without failure', async () => {
    const metrics = await PaymentService.getOperationalMetrics();
    expect(typeof metrics.pendingOrdersCount).toBe('number');
    expect(typeof metrics.unknownStateOrdersCount).toBe('number');
    expect(typeof metrics.initiatingOrdersCount).toBe('number');
    expect(typeof metrics.unresolvedRefundsCount).toBe('number');
    expect(typeof metrics.failedWebhooksCount).toBe('number');
    expect(typeof metrics.staleWebhooksCount).toBe('number');
  });
});
