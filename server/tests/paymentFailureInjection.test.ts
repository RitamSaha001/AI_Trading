import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentService } from '../services/paymentService';
import { LedgerService } from '../services/ledgerService';
import { ProviderNetworkTimeoutError } from '../services/payments/types';
import { getDb } from '../db';

describe('Payment & Settlement Failure Injection & Recovery', () => {
  const userId = 'usr_pay_fault_001';

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
       VALUES (?, 'fault_test@lumen.io', 'Fault Tester', 'email', 'test_prov', ?, ?)`,
      [userId, Date.now(), Date.now()]
    );
  });

  it('atomically rolls back ledger credit if database fault occurs during payment_settlements insert', async () => {
    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 50000,
      currency: 'USD',
      method: 'card',
      idempotencyKey: 'idemp_fault_settlement_001',
    });

    const db = getDb();
    const originalExecute = db.execute.bind(db);

    // Inject fault specifically on INSERT INTO payment_settlements
    let faultInjected = false;
    vi.spyOn(db, 'execute').mockImplementation(async (sql: string, params: any[] = []) => {
      if (sql.includes('INSERT INTO payment_settlements')) {
        faultInjected = true;
        throw new Error('SIMULATED_DISK_IO_FAILURE: Failed to write payment_settlements audit record');
      }
      return originalExecute(sql, params);
    });

    // Settlement attempt must throw
    await expect(
      PaymentService.settlePayment({
        orderId: order.orderId,
        providerPaymentId: 'pay_fault_prov_001',
        amountMinor: 50000,
        currency: 'USD',
        settlementSource: 'WEBHOOK',
      })
    ).rejects.toThrow(/SIMULATED_DISK_IO_FAILURE/);

    expect(faultInjected).toBe(true);
    vi.restoreAllMocks();

    // Verify atomic rollback: Customer sovereign cash balance MUST BE 0 (NO partial credit)
    const balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD']?.balance || 0).toBe(0);

    // Verify order status rolled back (still PENDING, not SUCCESS)
    const orderRecord = await db.queryOne<any>(`SELECT * FROM payment_orders WHERE id = ?`, [order.orderId]);
    expect(orderRecord.status).toBe('PENDING');

    // Verify no orphaned payment or settlement rows
    const settlementRows = await db.query<any>(`SELECT * FROM payment_settlements WHERE payment_order_id = ?`, [order.orderId]);
    expect(settlementRows.length).toBe(0);

    const paymentRows = await db.query<any>(`SELECT * FROM payments WHERE payment_order_id = ?`, [order.orderId]);
    expect(paymentRows.length).toBe(0);

    // Verify ledger replay consistency
    const replay = await LedgerService.replayAccountState(userId, 'live');
    expect(replay.consistent).toBe(true);
  });

  it('marks webhook failed_retryable on transient settlement failure, and succeeds upon redelivery', async () => {
    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 20000,
      currency: 'USD',
      method: 'card',
      idempotencyKey: 'idemp_transient_webhook_order',
    });

    const eventPayload = {
      eventId: 'evt_transient_webhook_001',
      provider: 'razorpay',
      eventType: 'payment.captured' as const,
      providerOrderId: order.providerOrderId,
      providerPaymentId: 'pay_rzp_transient_001',
      amountMinor: 20000,
      currency: 'USD',
    };
    const rawPayload = JSON.stringify(eventPayload);
    const validSignature = PaymentService.generateWebhookSignature(rawPayload);

    // Inject transient error into settlePayment
    const originalSettlePayment = PaymentService.settlePayment.bind(PaymentService);
    let settleAttempt = 0;
    vi.spyOn(PaymentService, 'settlePayment').mockImplementation(async (params: any) => {
      settleAttempt++;
      if (settleAttempt === 1) {
        throw new Error('TRANSIENT_DB_CONNECTION_TIMEOUT: Deadlock or connection drop');
      }
      return originalSettlePayment(params);
    });

    // First webhook attempt should fail
    await expect(
      PaymentService.processWebhook(rawPayload, validSignature, eventPayload)
    ).rejects.toThrow(/TRANSIENT_DB_CONNECTION_TIMEOUT/);

    // Check webhook record in DB: status must be 'failed_retryable'
    const db = getDb();
    const webhookRow = await db.queryOne<any>(
      `SELECT * FROM payment_webhooks WHERE provider = ? AND event_id = ?`,
      ['razorpay', eventPayload.eventId]
    );
    expect(webhookRow).toBeDefined();
    expect(webhookRow.status).toBe('failed_retryable');
    expect(webhookRow.error).toContain('TRANSIENT_DB_CONNECTION_TIMEOUT');

    // Balance remains 0 after failed attempt
    let balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD']?.balance || 0).toBe(0);

    // Second webhook delivery succeeds
    const secondResult = await PaymentService.processWebhook(rawPayload, validSignature, eventPayload);
    expect(secondResult.status).toBe('PROCESSED');

    // Check webhook record updated to 'processed'
    const updatedWebhookRow = await db.queryOne<any>(
      `SELECT * FROM payment_webhooks WHERE provider = ? AND event_id = ?`,
      ['razorpay', eventPayload.eventId]
    );
    expect(updatedWebhookRow.status).toBe('processed');
    expect(updatedWebhookRow.error).toBeNull();

    // Sovereign cash credited exactly once
    balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(20000);

    vi.restoreAllMocks();
  });

  it('reclaims orphaned webhook processing lease after worker crash / lease expiration', async () => {
    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 35000,
      currency: 'USD',
      method: 'card',
      idempotencyKey: 'idemp_lease_reclaim_order',
    });

    const eventPayload = {
      eventId: 'evt_lease_reclaim_001',
      provider: 'razorpay',
      eventType: 'payment.captured' as const,
      providerOrderId: order.providerOrderId,
      providerPaymentId: 'pay_rzp_lease_reclaim_001',
      amountMinor: 35000,
      currency: 'USD',
    };
    const rawPayload = JSON.stringify(eventPayload);
    const validSignature = PaymentService.generateWebhookSignature(rawPayload);

    const db = getDb();
    const now = Date.now();

    // Simulate a previous crashed worker that acquired lease 10 minutes ago and died
    const expiredLeaseTime = now - 10 * 60 * 1000;
    await db.execute(
      `INSERT INTO payment_webhooks (
        id, provider, event_id, payload_hash, status, worker_id,
        processing_started_at, lease_expires_at, processing_attempt, processed_at
      ) VALUES (?, ?, ?, 'dummy_hash', 'processing', 'crashed_worker_9999', ?, ?, 1, ?)`,
      ['wh_crashed_001', 'razorpay', eventPayload.eventId, expiredLeaseTime, expiredLeaseTime + 5 * 60 * 1000, expiredLeaseTime]
    );

    // Now a new worker receives or processes this webhook
    const result = await PaymentService.processWebhook(rawPayload, validSignature, eventPayload);
    expect(result.status).toBe('PROCESSED');

    // Verify lease was reclaimed and completed
    const updated = await db.queryOne<any>(`SELECT * FROM payment_webhooks WHERE id = 'wh_crashed_001'`);
    expect(updated.status).toBe('processed');
    expect(Number(updated.processing_attempt)).toBe(2);

    // User credited exactly once
    const balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(35000);
  });

  it('leaves sovereign cash balance 100% untouched when refund provider times out, marking REFUND_UNKNOWN', async () => {
    // 1. Settle an initial $100 order
    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 10000,
      currency: 'USD',
      method: 'card',
      idempotencyKey: 'idemp_refund_timeout_order',
    });

    await PaymentService.settlePayment({
      orderId: order.orderId,
      providerPaymentId: 'pay_prov_timeout_001',
      amountMinor: 10000,
      currency: 'USD',
      settlementSource: 'WEBHOOK',
    });

    // Check balance is 10000
    let balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(10000);

    // 2. Mock provider.refund to simulate network timeout
    const provider = PaymentService.getProvider();
    vi.spyOn(provider, 'refund').mockRejectedValueOnce(
      new ProviderNetworkTimeoutError('sandbox', 'ref_timeout_op')
    );

    // Refund call must return REFUND_UNKNOWN status without throwing
    const refundResult = await PaymentService.refundPayment({
      orderId: order.orderId,
      amountMinor: 4000,
      reason: 'Customer requested refund with provider timeout',
      idempotencyKey: 'idemp_refund_timeout_001',
      initiatedBy: userId,
    });
    expect(refundResult.status).toBe('REFUND_UNKNOWN');

    // CRITICAL FINANCIAL INVARIANT:
    // Customer sovereign cash balance MUST BE 100% UNTOUCHED (10,000 minor units).
    // Ledger was NOT debited because provider execution was unconfirmed!
    balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(10000);

    // Verify payment_refunds table has status 'REFUND_UNKNOWN'
    const db = getDb();
    const refundRecord = await db.queryOne<any>(
      `SELECT * FROM payment_refunds WHERE idempotency_key = ?`,
      ['idemp_refund_timeout_001']
    );
    expect(refundRecord).toBeDefined();
    expect(refundRecord.status).toBe('REFUND_UNKNOWN');

    // Verify order's reserved_refund_amount_minor holds the 4000 capacity reservation
    const orderRecord = await db.queryOne<any>(`SELECT * FROM payment_orders WHERE id = ?`, [order.orderId]);
    expect(Number(orderRecord.reserved_refund_amount_minor)).toBe(4000);
    expect(Number(orderRecord.refunded_amount_minor)).toBe(0);

    vi.restoreAllMocks();
  });

  it('reconciles REFUND_UNKNOWN refund via checkRefundStatus and atomically debits ledger', async () => {
    // 1. Settle an initial $100 order
    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 10000,
      currency: 'USD',
      method: 'card',
      idempotencyKey: 'idemp_refund_reconcile_order',
    });

    await PaymentService.settlePayment({
      orderId: order.orderId,
      providerPaymentId: 'pay_prov_rec_ref_001',
      amountMinor: 10000,
      currency: 'USD',
      settlementSource: 'WEBHOOK',
    });

    // 2. Inject provider timeout during refund
    const provider = PaymentService.getProvider();
    vi.spyOn(provider, 'refund').mockRejectedValueOnce(
      new ProviderNetworkTimeoutError('sandbox', 'ref_timeout_op_2')
    );

    const refundResult = await PaymentService.refundPayment({
      orderId: order.orderId,
      amountMinor: 4000,
      reason: 'Customer refund with later reconciliation',
      idempotencyKey: 'idemp_ref_reconcile_001',
      initiatedBy: userId,
    });
    expect(refundResult.status).toBe('REFUND_UNKNOWN');

    vi.restoreAllMocks();

    const db = getDb();
    // Backdate refund created_at to 5 minutes ago so reconcilePendingPayments picks it up
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    await db.execute(`UPDATE payment_refunds SET created_at = ? WHERE idempotency_key = ?`, [
      fiveMinutesAgo,
      'idemp_ref_reconcile_001',
    ]);

    // Mock checkRefundStatus to report SUCCESS
    vi.spyOn(provider, 'checkRefundStatus').mockResolvedValueOnce({
      refundId: 'ref_reconciled_prov_001',
      status: 'SUCCESS',
      amountMinor: 4000,
    });

    // Run reconciliation sweep
    const sweepResult = await PaymentService.reconcilePendingPayments();
    expect(sweepResult.reconciledCount).toBeGreaterThanOrEqual(1);

    // Refund is now SUCCESS
    const updatedRefund = await db.queryOne<any>(
      `SELECT * FROM payment_refunds WHERE idempotency_key = ?`,
      ['idemp_ref_reconcile_001']
    );
    expect(updatedRefund.status).toBe('SUCCESS');
    expect(updatedRefund.ledger_transaction_id).toBeDefined();

    // Customer sovereign cash balance is now atomically debited (10000 - 4000 = 6000)
    const balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(6000);

    // Order reserved capacity released, refunded_amount_minor updated to 4000
    const updatedOrder = await db.queryOne<any>(`SELECT * FROM payment_orders WHERE id = ?`, [order.orderId]);
    expect(Number(updatedOrder.refunded_amount_minor)).toBe(4000);
    expect(Number(updatedOrder.reserved_refund_amount_minor)).toBe(0);
    expect(updatedOrder.status).toBe('PARTIALLY_REFUNDED');

    // Ledger replay is consistent
    const replay = await LedgerService.replayAccountState(userId, 'live');
    expect(replay.consistent).toBe(true);

    vi.restoreAllMocks();
  });
});
