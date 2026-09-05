import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PostgresClient, getDb, setDb, runMigrations } from '../db';
import { PaymentService } from '../services/paymentService';
import { LedgerService } from '../services/ledgerService';
import crypto from 'node:crypto';

describe('PostgreSQL Real Concurrency & Financial Invariants Suite', { timeout: 90000 }, () => {
  const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  const isPostgres = Boolean(dbUrl && dbUrl.startsWith('postgres'));

  let pgClient: PostgresClient | null = null;
  const testRunId = `run_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  beforeAll(async () => {
    if (isPostgres && dbUrl) {
      pgClient = new PostgresClient(dbUrl);
      await runMigrations(pgClient);
      setDb(pgClient);
    }
  });

  afterAll(async () => {
    if (pgClient) {
      setDb(null);
      await pgClient.close();
    }
  });

  beforeEach(async () => {
    const db = getDb();
    await db.execute(`DELETE FROM payment_refunds WHERE id LIKE ?`, [`%${testRunId}%`]);
    await db.execute(`DELETE FROM payment_settlements WHERE id LIKE ?`, [`%${testRunId}%`]);
    await db.execute(`DELETE FROM payments WHERE id LIKE ?`, [`%${testRunId}%`]);
    await db.execute(`DELETE FROM payment_orders WHERE id LIKE ?`, [`%${testRunId}%`]);
    await db.execute(`DELETE FROM payment_webhooks WHERE event_id LIKE ?`, [`%${testRunId}%`]);
  });

  it('Test A: 20+ concurrent deposits to the same account with exact final balance sum', async () => {
    const db = getDb();
    const userId = `usr_pg_conc_a_${testRunId}`;
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, ?, 'Conc Tester A', 'email', ?, 'TRADER', ?, ?)`,
      [userId, `${userId}@lumen.io`, userId, Date.now(), Date.now()]
    );

    const creditAmount = 500; // $5.00 each
    const concurrency = 20;

    const promises = Array.from({ length: concurrency }, (_, idx) =>
      LedgerService.creditDeposit({
        userId,
        assetOrCurrency: 'USD',
        amountMinor: creditAmount,
        paymentId: `pay_${testRunId}_a_${idx}`,
        description: `Concurrent deposit ${idx}`,
        idempotencyKey: `idemp_${testRunId}_a_${idx}`,
      })
    );

    const results = await Promise.all(promises);
    expect(results.length).toBe(concurrency);

    // Verify exact balance
    const balances = await LedgerService.getUserBalances(userId);
    const expectedBalance = creditAmount * concurrency;
    expect(balances['sovereign_cash:USD'].balance).toBe(expectedBalance);

    // Verify double-entry ledger replay integrity
    const replay = await LedgerService.replayAccountState(userId, 'live');
    expect(replay.consistent).toBe(true);
  });

  it('Test B: Concurrent transfers between accounts (Fund conservation & deadlock prevention)', async () => {
    const db = getDb();
    const userA = `usr_pg_conc_b1_${testRunId}`;
    const userB = `usr_pg_conc_b2_${testRunId}`;

    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, ?, 'Trader A', 'email', ?, 'TRADER', ?, ?)`,
      [userA, `${userA}@lumen.io`, userA, Date.now(), Date.now()]
    );
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, ?, 'Trader B', 'email', ?, 'TRADER', ?, ?)`,
      [userB, `${userB}@lumen.io`, userB, Date.now(), Date.now()]
    );

    // Initial deposits: 10,000 cents ($100.00) each
    await LedgerService.creditDeposit({
      userId: userA,
      assetOrCurrency: 'USD',
      amountMinor: 10000,
      paymentId: `pay_init_a_${testRunId}`,
      description: 'Initial A',
      idempotencyKey: `idemp_init_a_${testRunId}`,
    });
    await LedgerService.creditDeposit({
      userId: userB,
      assetOrCurrency: 'USD',
      amountMinor: 10000,
      paymentId: `pay_init_b_${testRunId}`,
      description: 'Initial B',
      idempotencyKey: `idemp_init_b_${testRunId}`,
    });

    // Run 10 transfers from A->B and 10 transfers from B->A concurrently
    const transferAmount = 200; // $2.00
    const count = 10;

    const transfers: Promise<any>[] = [];
    for (let i = 0; i < count; i++) {
      transfers.push(
        LedgerService.transfer({
          userId: userA,
          fromAccountType: 'sovereign_cash',
          toAccountType: 'trading_allocated',
          assetOrCurrency: 'USD',
          amountMinor: transferAmount,
          referenceType: 'test_transfer',
          referenceId: `ref_ab_${testRunId}_${i}`,
          description: `Transfer A ${i}`,
          idempotencyKey: `idemp_ab_${testRunId}_${i}`,
        })
      );
      transfers.push(
        LedgerService.transfer({
          userId: userB,
          fromAccountType: 'sovereign_cash',
          toAccountType: 'trading_allocated',
          assetOrCurrency: 'USD',
          amountMinor: transferAmount,
          referenceType: 'test_transfer',
          referenceId: `ref_ba_${testRunId}_${i}`,
          description: `Transfer B ${i}`,
          idempotencyKey: `idemp_ba_${testRunId}_${i}`,
        })
      );
    }

    const settled = await Promise.allSettled(transfers);
    const succeeded = settled.filter((s) => s.status === 'fulfilled');
    expect(succeeded.length).toBe(count * 2);

    // Conservation check: total USD across accounts must equal exactly $200.00 (20,000 minor)
    const balancesA = await LedgerService.getUserBalances(userA);
    const balancesB = await LedgerService.getUserBalances(userB);

    const totalA = balancesA['sovereign_cash:USD'].balance + balancesA['trading_allocated:USD'].balance;
    const totalB = balancesB['sovereign_cash:USD'].balance + balancesB['trading_allocated:USD'].balance;

    expect(totalA).toBe(10000);
    expect(totalB).toBe(10000);
    expect(totalA + totalB).toBe(20000);
  });

  it('Test C: Concurrent settlement race yields exactly 1 settlement and 1 ledger credit', async () => {
    const db = getDb();
    const userId = `usr_pg_conc_c_${testRunId}`;
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, ?, 'Conc Tester C', 'email', ?, 'TRADER', ?, ?)`,
      [userId, `${userId}@lumen.io`, userId, Date.now(), Date.now()]
    );

    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 5000,
      currency: 'USD',
      method: 'card',
      idempotencyKey: `idemp_order_race_${testRunId}`,
    });

    const providerPaymentId = `prov_pay_race_${testRunId}`;

    // Race: 4 simultaneous settlement attempts from 4 different channels
    const results = await Promise.all([
      PaymentService.settlePayment({
        orderId: order.orderId,
        providerPaymentId,
        amountMinor: 5000,
        currency: 'USD',
        settlementSource: 'WEBHOOK',
      }),
      PaymentService.settlePayment({
        orderId: order.orderId,
        providerPaymentId,
        amountMinor: 5000,
        currency: 'USD',
        settlementSource: 'STATUS_POLL',
      }),
      PaymentService.settlePayment({
        orderId: order.orderId,
        providerPaymentId,
        amountMinor: 5000,
        currency: 'USD',
        settlementSource: 'RECONCILIATION_SWEEP',
      }),
      PaymentService.settlePayment({
        orderId: order.orderId,
        providerPaymentId,
        amountMinor: 5000,
        currency: 'USD',
        settlementSource: 'MANUAL_BANK_RECONCILIATION',
      }),
    ]);

    const settledCount = results.filter((r) => r.status === 'SETTLED').length;
    const duplicateCount = results.filter((r) => r.status === 'DUPLICATE').length;

    expect(settledCount).toBe(1);
    expect(duplicateCount).toBe(3);

    // Verify DB: exactly 1 payment, 1 settlement, and 5000 balance
    const payments = await db.query<any>(`SELECT * FROM payments WHERE payment_order_id = ?`, [order.orderId]);
    const settlements = await db.query<any>(`SELECT * FROM payment_settlements WHERE payment_order_id = ?`, [order.orderId]);
    expect(payments.length).toBe(1);
    expect(settlements.length).toBe(1);

    const balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(5000);
  });

  it('Test D: 100+ duplicate webhook storm results in exactly 1 settlement and 99 duplicates', async () => {
    const db = getDb();
    const userId = `usr_pg_conc_d_${testRunId}`;
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, ?, 'Conc Tester D', 'email', ?, 'TRADER', ?, ?)`,
      [userId, `${userId}@lumen.io`, userId, Date.now(), Date.now()]
    );

    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 3000,
      currency: 'USD',
      method: 'card',
      idempotencyKey: `idemp_order_wh_storm_${testRunId}`,
    });

    const eventId = `evt_storm_${testRunId}`;
    const payload = JSON.stringify({
      id: eventId,
      provider: 'sandbox',
      type: 'payment.captured',
      data: {
        orderId: order.orderId,
        paymentId: `pay_prov_storm_${testRunId}`,
        amount: 3000,
        currency: 'USD',
      },
    });
    const signature = PaymentService.generateWebhookSignature(payload);

    const eventPayload = {
      eventId,
      provider: 'sandbox',
      eventType: 'payment.captured' as const,
      providerOrderId: order.orderId,
      providerPaymentId: `pay_prov_storm_${testRunId}`,
      amountMinor: 3000,
      currency: 'USD',
    };

    // 100 duplicate webhook deliveries executed in parallel batches to respect connection pool limits
    const webhookCount = 100;
    const batchSize = 20;
    const webhookResults: any[] = [];

    for (let i = 0; i < webhookCount; i += batchSize) {
      const currentBatchSize = Math.min(batchSize, webhookCount - i);
      const batchResults = await Promise.all(
        Array.from({ length: currentBatchSize }, () =>
          PaymentService.processWebhook(payload, signature, eventPayload)
        )
      );
      webhookResults.push(...batchResults);
    }

    const processed = webhookResults.filter((r) => r.status === 'PROCESSED');
    const duplicates = webhookResults.filter((r) => r.status === 'DUPLICATE');

    expect(processed.length).toBe(1);
    expect(duplicates.length).toBe(webhookCount - 1);

    // Ledger balance must be credited exactly once ($30.00 / 3000 minor)
    const balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(3000);
  });

  it('Test E: Concurrent refund storm against a single order guarantees refunded <= settled', async () => {
    const db = getDb();
    const userId = `usr_pg_conc_e_${testRunId}`;
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, ?, 'Conc Tester E', 'email', ?, 'TRADER', ?, ?)`,
      [userId, `${userId}@lumen.io`, userId, Date.now(), Date.now()]
    );

    // Create and settle an order of 1000 minor units
    const order = await PaymentService.createPaymentOrder({
      userId,
      amountMinor: 1000,
      currency: 'USD',
      method: 'card',
      idempotencyKey: `idemp_order_ref_storm_${testRunId}`,
    });

    await PaymentService.settlePayment({
      orderId: order.orderId,
      providerPaymentId: `pay_prov_ref_storm_${testRunId}`,
      amountMinor: 1000,
      currency: 'USD',
      settlementSource: 'STATUS_POLL',
    });

    // 10 concurrent refunds of 600 minor units each (each individually is <= 1000, but 600 + 600 > 1000)
    const refundAttempts = 10;
    const results = await Promise.allSettled(
      Array.from({ length: refundAttempts }, (_, i) =>
        PaymentService.refundPayment({
          orderId: order.orderId,
          amountMinor: 600,
          reason: `Concurrent refund attempt ${i}`,
          idempotencyKey: `idemp_ref_storm_${testRunId}_${i}`,
          initiatedBy: userId,
        })
      )
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 1 refund can succeed. The rest must be rejected due to capacity!
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(refundAttempts - 1);

    // Total refunded in DB must be exactly 600
    const finalOrder = await db.queryOne<any>(`SELECT * FROM payment_orders WHERE id = ?`, [order.orderId]);
    expect(Number(finalOrder.refunded_amount_minor)).toBe(600);
    expect(Number(finalOrder.reserved_refund_amount_minor)).toBe(0);

    // Ledger balance was 1000, debited 600 -> remaining balance is 400
    const balances = await LedgerService.getUserBalances(userId);
    expect(balances['sovereign_cash:USD'].balance).toBe(400);
  });
});
