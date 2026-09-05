import { getDb, DBClient } from '../db';
import { config } from '../config';
import { LedgerService } from './ledgerService';
import { AuditService } from './auditService';
import {
  PaymentProvider,
  PaymentOrderStatus,
  SettlementSource,
  ProviderNetworkTimeoutError,
  IdempotencyConflictError,
  WebhookInboxStatus,
} from './payments/types';
import { PhonePeProductionAdapter } from './payments/phonepeAdapter';
import { SandboxAdapter } from './payments/sandboxAdapter';
import crypto from 'node:crypto';

export interface CreateOrderParams {
  userId: string;
  amountMinor: number;
  currency: 'USD' | 'INR';
  method: 'card' | 'upi';
  idempotencyKey: string;
}

export interface WebhookEventPayload {
  eventId: string;
  provider: string;
  eventType: 'payment.captured' | 'payment.failed' | 'payment.refunded';
  providerOrderId: string;
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  cardLast4?: string;
  cardBrand?: string;
  upiVpa?: string;
  utr?: string;
}

export class PaymentService {
  private static providerInstance: PaymentProvider | null = null;

  static getProvider(): PaymentProvider {
    if (!this.providerInstance) {
      if (config.PAYMENT_PROVIDER === 'phonepe') {
        this.providerInstance = new PhonePeProductionAdapter();
      } else {
        this.providerInstance = new SandboxAdapter();
      }
    }
    return this.providerInstance;
  }

  static generateWebhookSignature(payload: string, secret = config.PAYMENT_WEBHOOK_SECRET): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  static verifyWebhookSignature(payload: string, signature: string, secret = config.PAYMENT_WEBHOOK_SECRET): boolean {
    if (!signature || !payload) return false;
    const expected = this.generateWebhookSignature(payload, secret);
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');

    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  static async createPaymentOrder(params: CreateOrderParams): Promise<{
    orderId: string;
    providerOrderId: string;
    amountMinor: number;
    currency: string;
    method: string;
    upiUri?: string;
    checkoutUrl?: string;
    expiresAt: number;
    status: string;
  }> {
    if (params.amountMinor <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    const db = getDb();
    const orderId = `po_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const attemptId = `att_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const provider = this.getProvider();
    const now = Date.now();
    const expiresAt = now + 15 * 60 * 1000;

    // First: Insert payment_orders with 'INITIATING' and NULL provider_order_id
    const existing = await db.queryOne<any>(
      `INSERT INTO payment_orders (
        id, user_id, amount_minor, currency, method, provider, provider_order_id,
        status, idempotency_key, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'INITIATING', ?, ?, ?, ?)
      ON CONFLICT(idempotency_key) DO UPDATE SET id = payment_orders.id RETURNING *`,
      [
        orderId,
        params.userId,
        params.amountMinor,
        params.currency,
        params.method,
        provider.name,
        params.idempotencyKey,
        expiresAt,
        now,
        now,
      ]
    );

    if (existing && existing.id !== orderId) {
      if (
        existing.user_id !== params.userId ||
        Number(existing.amount_minor) !== params.amountMinor ||
        existing.currency !== params.currency ||
        existing.method !== params.method
      ) {
        throw new IdempotencyConflictError(
          `Idempotency key '${params.idempotencyKey}' was already used with conflicting parameters.`
        );
      }

      let latestOrder = existing;
      if (latestOrder.status === 'INITIATING') {
        const pollDeadline = Date.now() + 3000;
        while (Date.now() < pollDeadline && latestOrder.status === 'INITIATING') {
          await new Promise((r) => setTimeout(r, 20));
          latestOrder = (await db.queryOne<any>(`SELECT * FROM payment_orders WHERE id = ?`, [existing.id])) || latestOrder;
        }
      }

      return {
        orderId: latestOrder.id,
        providerOrderId: latestOrder.provider_order_id || '',
        amountMinor: Number(latestOrder.amount_minor),
        currency: latestOrder.currency,
        method: latestOrder.method,
        expiresAt: Number(latestOrder.expires_at),
        status: latestOrder.status,
      };
    }

    await db.execute(
      `INSERT INTO payment_attempts (
        id, payment_order_id, attempt_number, provider, status, started_at, created_at, updated_at
      ) VALUES (?, ?, 1, ?, 'INITIATING', ?, ?, ?)`,
      [attemptId, orderId, provider.name, now, now, now]
    );

    try {
      const providerResult = await provider.createOrder({
        userId: params.userId,
        orderId,
        amountMinor: params.amountMinor,
        currency: params.currency,
        method: params.method,
      });

      const providerOrderId = providerResult.providerOrderId;
      if (!providerOrderId) {
        throw new Error('Payment provider did not return a valid providerOrderId');
      }

      await db.execute(
        `UPDATE payment_attempts SET status = 'SUCCESS', provider_order_id = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
        [providerOrderId, Date.now(), Date.now(), attemptId]
      );

      await db.execute(
        `UPDATE payment_orders SET status = 'PENDING', provider_order_id = ?, checkout_url = ?, upi_intent_uri = ?, updated_at = ? WHERE id = ?`,
        [providerOrderId, providerResult.checkoutUrl || null, providerResult.upiIntentUri || null, Date.now(), orderId]
      );

      await AuditService.logEvent({
        userId: params.userId,
        eventType: 'PAYMENT_ORDER_CREATED',
        source: 'payment_service',
        actor: 'user',
        idempotencyKey: params.idempotencyKey,
        externalId: providerOrderId,
        metadata: {
          orderId,
          provider: provider.name,
          amountMinor: params.amountMinor,
          currency: params.currency,
          method: params.method,
        },
        result: 'SUCCESS',
      });

      return {
        orderId,
        providerOrderId,
        amountMinor: params.amountMinor,
        currency: params.currency,
        method: params.method,
        upiUri: providerResult.upiIntentUri,
        checkoutUrl: providerResult.checkoutUrl,
        expiresAt,
        status: 'PENDING',
      };
    } catch (err: any) {
      const isTimeout = err.name === 'ProviderNetworkTimeoutError';
      const status = isTimeout ? 'TIMEOUT' : 'FAILED';
      const orderStatus = isTimeout ? 'UNKNOWN_PROVIDER_STATE' : 'FAILED';

      await db.execute(
        `UPDATE payment_attempts SET status = ?, error_message = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
        [status, err.message, Date.now(), Date.now(), attemptId]
      );

      await db.execute(
        `UPDATE payment_orders SET status = ?, updated_at = ? WHERE id = ?`,
        [orderStatus, Date.now(), orderId]
      );

      if (isTimeout) {
        return {
          orderId,
          providerOrderId: '',
          amountMinor: params.amountMinor,
          currency: params.currency,
          method: params.method,
          expiresAt,
          status: 'UNKNOWN_PROVIDER_STATE',
        };
      }

      throw err;
    }
  }

  static async settlePayment(
    params: {
      orderId: string;
      providerPaymentId: string;
      amountMinor: number;
      currency: string;
      settlementSource: SettlementSource;
      externalSettlementId?: string;
      utr?: string;
      cardLast4?: string;
      cardBrand?: string;
      upiVpa?: string;
    },
    client?: DBClient
  ): Promise<{ status: 'SETTLED' | 'DUPLICATE'; paymentId?: string; balanceAfter?: bigint }> {
    if (!params.providerPaymentId || typeof params.providerPaymentId !== 'string' || params.providerPaymentId.trim() === '') {
      throw new Error('Malformed provider event: providerPaymentId is strictly required for authoritative settlement');
    }

    const db = getDb();
    const now = Date.now();

    const runner = async (tx: DBClient) => {
      // 1. Lock payment order row FOR UPDATE
      let orderQuery = `SELECT * FROM payment_orders WHERE id = ?`;
      if (tx.isPostgres()) {
        orderQuery += ` FOR UPDATE`;
      }
      const order = await tx.queryOne<any>(orderQuery, [params.orderId]);

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status === 'SUCCESS') {
        const existingSettlement = await tx.queryOne<any>(
          `SELECT * FROM payment_settlements WHERE payment_order_id = ?`,
          [params.orderId]
        );
        return { status: 'DUPLICATE' as const, paymentId: existingSettlement?.payment_id };
      }

      // Legal state transition check
      const legalPriorStates = ['PENDING', 'UNKNOWN_PROVIDER_STATE', 'pending_manual_settlement', 'INITIATING'];
      if (!legalPriorStates.includes(order.status)) {
        throw new Error(`Cannot settle order in status '${order.status}'`);
      }

      // Exact monetary validation
      if (Number(order.amount_minor) !== params.amountMinor || order.currency !== params.currency) {
        throw new Error('Amount or currency mismatch between order and settlement');
      }

      // Settlement record uniqueness check
      const existingSettlement = await tx.queryOne<any>(
        `SELECT * FROM payment_settlements WHERE payment_order_id = ?`,
        [params.orderId]
      );
      if (existingSettlement) {
        return { status: 'DUPLICATE' as const, paymentId: existingSettlement.payment_id };
      }

      // Provider payment ID uniqueness across orders
      const existingPaymentForOtherOrder = await tx.queryOne<any>(
        `SELECT * FROM payments WHERE provider_payment_id = ? AND payment_order_id != ?`,
        [params.providerPaymentId, params.orderId]
      );
      if (existingPaymentForOtherOrder) {
        throw new Error(`Provider payment ID '${params.providerPaymentId}' has already been credited to another order.`);
      }

      const paymentId = `pay_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const settlementId = `ps_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

      // Check if a payment record was already created for this order (e.g. manual UTR claim)
      const existingPayment = await tx.queryOne<any>(
        `SELECT * FROM payments WHERE payment_order_id = ?`,
        [params.orderId]
      );

      let finalPaymentId = paymentId;

      if (existingPayment) {
        finalPaymentId = existingPayment.id;
        await tx.execute(
          `UPDATE payments SET
            status = 'succeeded',
            provider_payment_id = ?,
            settlement_reference = ?,
            cleared_at = ?,
            card_last4 = COALESCE(?, card_last4),
            card_brand = COALESCE(?, card_brand),
            upi_vpa = COALESCE(?, upi_vpa),
            utr = COALESCE(?, utr)
           WHERE id = ?`,
          [
            params.providerPaymentId,
            params.externalSettlementId || `SETTL-${params.providerPaymentId}`,
            now,
            params.cardLast4 || null,
            params.cardBrand || null,
            params.upiVpa || null,
            params.utr || null,
            existingPayment.id,
          ]
        );
      } else {
        await tx.execute(
          `INSERT INTO payments (
            id, payment_order_id, user_id, provider_payment_id, amount_minor, currency,
            method, status, card_last4, card_brand, upi_vpa, utr, settlement_reference,
            cleared_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, ?, ?, ?)`,
          [
            paymentId,
            params.orderId,
            order.user_id,
            params.providerPaymentId,
            params.amountMinor,
            params.currency,
            order.method,
            params.cardLast4 || null,
            params.cardBrand || null,
            params.upiVpa || null,
            params.utr || null,
            params.externalSettlementId || `SETTL-${params.providerPaymentId}`,
            now,
            now,
          ]
        );
      }

      await tx.execute(
        `UPDATE payment_orders SET status = 'SUCCESS', updated_at = ? WHERE id = ?`,
        [now, params.orderId]
      );

      // Pass tx to creditDeposit for single atomic database transaction
      const ledgerResult = await LedgerService.creditDeposit(
        {
          userId: order.user_id,
          assetOrCurrency: params.currency,
          amountMinor: params.amountMinor,
          paymentId: finalPaymentId,
          description: `Settled ${order.method.toUpperCase()} Deposit`,
          idempotencyKey: `settl_${params.orderId}`,
        },
        tx
      );

      await tx.execute(
        `INSERT INTO payment_settlements (
          id, payment_order_id, payment_id, settlement_source, external_settlement_id,
          amount_minor, currency, settled_amount_minor, settled_currency,
          ledger_transaction_id, settled_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          settlementId,
          params.orderId,
          finalPaymentId,
          params.settlementSource,
          params.externalSettlementId || null,
          params.amountMinor,
          params.currency,
          params.amountMinor,
          params.currency,
          ledgerResult.transactionId,
          now,
          now,
        ]
      );

      await AuditService.logEvent({
        userId: order.user_id,
        eventType: 'PAYMENT_SETTLED_AUTHORITATIVE',
        source: 'payment_service',
        actor: 'system',
        externalId: params.providerPaymentId,
        metadata: {
          orderId: params.orderId,
          paymentId: finalPaymentId,
          amountMinor: params.amountMinor,
          currency: params.currency,
          source: params.settlementSource,
        },
        result: 'SUCCESS',
      });

      return { status: 'SETTLED' as const, paymentId: finalPaymentId, balanceAfter: ledgerResult.balanceAfter };
    };

    if (client) {
      return runner(client);
    }
    return db.transaction(runner);
  }

  static async processWebhook(
    rawPayload: string,
    signature: string,
    event: WebhookEventPayload,
    headers?: Record<string, string | string[] | undefined>
  ): Promise<{ status: 'PROCESSED' | 'DUPLICATE' | 'IGNORED'; paymentId?: string }> {
    if (!this.verifyWebhookSignature(rawPayload, signature)) {
      throw new Error('Invalid webhook signature');
    }

    const db = getDb();
    const payloadHash = crypto.createHash('sha256').update(rawPayload).digest('hex');
    const now = Date.now();
    const webhookId = `wh_${crypto.randomBytes(8).toString('hex')}`;
    const rawHeadersStr = headers ? JSON.stringify(headers) : null;

    let webhookRecord: any;

    try {
      await db.execute(
        `INSERT INTO payment_webhooks (
          id, provider, event_id, payload_hash, status, raw_headers, raw_body, processed_at
        ) VALUES (?, ?, ?, ?, 'received', ?, ?, ?)`,
        [webhookId, event.provider, event.eventId, payloadHash, rawHeadersStr, rawPayload, now]
      );
      webhookRecord = { id: webhookId, status: 'received' };
    } catch {
      // Primary duplicate deduplication via DB constraint
      webhookRecord = await db.queryOne<any>(
        `SELECT * FROM payment_webhooks WHERE provider = ? AND event_id = ?`,
        [event.provider, event.eventId]
      );
    }

    if (!webhookRecord) {
      throw new Error('Failed to record webhook in durable inbox');
    }

    if (
      webhookRecord.status === 'processed' ||
      webhookRecord.status === 'ignored' ||
      webhookRecord.status === 'failed_permanent'
    ) {
      return { status: 'DUPLICATE' };
    }

    // Atomic lease acquisition (5-minute lease)
    const workerId = `worker_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
    const leaseExpiresAt = now + 5 * 60 * 1000;
    const leaseClaim = await db.execute(
      `UPDATE payment_webhooks
       SET status = 'processing',
           worker_id = ?,
           processing_started_at = ?,
           lease_expires_at = ?,
           processing_attempt = COALESCE(processing_attempt, 0) + 1,
           error = NULL
       WHERE id = ?
         AND (
           status IN ('received', 'verified', 'failed_retryable')
           OR (status = 'processing' AND lease_expires_at < ?)
         )`,
      [workerId, now, leaseExpiresAt, webhookRecord.id, now]
    );

    if (leaseClaim.changes === 0) {
      // Another worker holds an active lease
      return { status: 'DUPLICATE' };
    }

    if (event.eventType === 'payment.captured') {
      if (!event.providerPaymentId || event.providerPaymentId.trim() === '') {
        await db.execute(
          `UPDATE payment_webhooks SET status = 'failed_permanent', error = 'Missing providerPaymentId in captured event', processed_at = ? WHERE id = ?`,
          [Date.now(), webhookRecord.id]
        );
        throw new Error('Malformed webhook event: missing providerPaymentId');
      }

      const order = await db.queryOne<any>(
        `SELECT * FROM payment_orders WHERE provider_order_id = ? OR id = ?`,
        [event.providerOrderId, event.providerOrderId]
      );

      if (!order) {
        await db.execute(
          `UPDATE payment_webhooks SET status = 'ignored', error = 'Order not found', processed_at = ? WHERE id = ?`,
          [Date.now(), webhookRecord.id]
        );
        return { status: 'IGNORED' };
      }

      try {
        const result = await this.settlePayment({
          orderId: order.id,
          providerPaymentId: event.providerPaymentId,
          amountMinor: event.amountMinor,
          currency: event.currency,
          settlementSource: 'WEBHOOK',
          cardLast4: event.cardLast4,
          cardBrand: event.cardBrand,
          upiVpa: event.upiVpa,
          utr: event.utr,
        });

        await db.execute(
          `UPDATE payment_webhooks SET status = 'processed', error = NULL, processed_at = ? WHERE id = ?`,
          [Date.now(), webhookRecord.id]
        );

        if (result.status === 'DUPLICATE') {
          return { status: 'DUPLICATE', paymentId: result.paymentId };
        }
        return { status: 'PROCESSED', paymentId: result.paymentId };
      } catch (err: any) {
        await db.execute(
          `UPDATE payment_webhooks SET status = 'failed_retryable', error = ?, processed_at = ? WHERE id = ?`,
          [err.message, Date.now(), webhookRecord.id]
        );
        throw err;
      }
    }

    await db.execute(
      `UPDATE payment_webhooks SET status = 'processed', processed_at = ? WHERE id = ?`,
      [Date.now(), webhookRecord.id]
    );
    return { status: 'PROCESSED' };
  }

  static async submitManualUTR(params: {
    userId: string;
    orderId?: string;
    utr: string;
    amountINR: number;
    payeeVpa?: string;
  }): Promise<{ paymentId: string; status: string; message: string }> {
    const cleanUtr = params.utr.trim().replace(/\s+/g, '');

    if (!/^\d{12}$/.test(cleanUtr) || cleanUtr.split('').every((d) => d === cleanUtr[0])) {
      throw new Error('Invalid UTR format. Expected 12-digit Indian Bank Unique Transaction Reference.');
    }

    if (params.amountINR <= 0) {
      throw new Error('Deposit amount must be strictly positive');
    }

    const db = getDb();
    const existing = await db.queryOne<any>(
      `SELECT * FROM payments WHERE utr = ?`,
      [cleanUtr]
    );
    if (existing) {
      throw new Error(`UTR ${cleanUtr} has already been submitted or cleared on the platform.`);
    }

    const amountMinor = Math.round(params.amountINR * 100);
    const now = Date.now();
    const paymentId = `pay_utr_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const orderId = params.orderId || `po_utr_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    await db.transaction(async (tx) => {
      const existingOrder = await tx.queryOne<any>(`SELECT * FROM payment_orders WHERE id = ?`, [orderId]);
      if (!existingOrder) {
        await tx.execute(
          `INSERT INTO payment_orders (
            id, user_id, amount_minor, currency, method, provider, status,
            idempotency_key, expires_at, created_at, updated_at
          ) VALUES (?, ?, ?, 'INR', 'upi', 'manual_utr', 'pending_manual_settlement', ?, ?, ?, ?)`,
          [orderId, params.userId, amountMinor, `idemp_utr_${cleanUtr}`, now + 24 * 60 * 60 * 1000, now, now]
        );
      }

      await tx.execute(
        `INSERT INTO payments (
          id, payment_order_id, user_id, provider_payment_id, amount_minor, currency,
          method, status, utr, created_at
        ) VALUES (?, ?, ?, ?, ?, 'INR', 'upi', 'pending_manual_settlement', ?, ?)`,
        [paymentId, orderId, params.userId, `UTR-${cleanUtr}`, amountMinor, cleanUtr, now]
      );
    });

    await AuditService.logEvent({
      userId: params.userId,
      eventType: 'UTR_SUBMITTED_PENDING_RECONCILIATION',
      source: 'manual_upi',
      actor: 'user',
      externalId: cleanUtr,
      metadata: {
        paymentId,
        orderId,
        utr: cleanUtr,
        amountINR: params.amountINR,
      },
      result: 'SUCCESS',
    });

    return {
      paymentId,
      status: 'pending_manual_settlement',
      message: 'UTR submitted for verification. Funds will be credited after bank reconciliation confirms settlement.',
    };
  }

  static async reconcileManualUTR(params: {
    paymentId: string;
    reconciledBy: string;
    bankReference: string;
  }): Promise<{ cleared: boolean; balanceAfter: bigint; paymentId?: string }> {
    const db = getDb();

    const payment = await db.queryOne<any>(
      `SELECT * FROM payments WHERE id = ? AND status = 'pending_manual_settlement'`,
      [params.paymentId]
    );
    if (!payment) {
      throw new Error(`Pending payment ${params.paymentId} not found or already reconciled.`);
    }

    const result = await this.settlePayment({
      orderId: payment.payment_order_id,
      providerPaymentId: payment.provider_payment_id,
      amountMinor: Number(payment.amount_minor),
      currency: payment.currency,
      settlementSource: 'MANUAL_BANK_RECONCILIATION',
      externalSettlementId: params.bankReference,
      utr: payment.utr,
    });

    await AuditService.logEvent({
      userId: payment.user_id,
      eventType: 'UTR_RECONCILED_AND_CREDITED',
      source: 'reconciliation',
      actor: params.reconciledBy,
      externalId: payment.utr,
      metadata: {
        paymentId: payment.id,
        bankReference: params.bankReference,
        amountMinor: payment.amount_minor,
      },
      result: 'SUCCESS',
    });

    return {
      cleared: result.status === 'SETTLED',
      balanceAfter: result.balanceAfter || 0n,
      paymentId: result.paymentId,
    };
  }

  static async processPhonePeWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>
  ): Promise<{ status: 'PROCESSED' | 'DUPLICATE' | 'IGNORED' | 'FAILED'; error?: string; paymentId?: string }> {
    const provider = this.getProvider();
    const verification = await provider.verifyWebhook(rawBody, headers);

    if (!verification.isValid) {
      await AuditService.logEvent({
        eventType: 'WEBHOOK_SIGNATURE_FAILED',
        source: 'phonepe_webhook',
        actor: 'webhook',
        result: 'FAILURE',
        error: verification.error || 'Invalid PhonePe webhook signature',
      });
      throw new Error(verification.error || 'Invalid PhonePe webhook signature');
    }

    const db = getDb();
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const now = Date.now();
    const webhookId = `wh_${crypto.randomBytes(8).toString('hex')}`;
    const rawHeadersStr = JSON.stringify(headers);

    let webhookRecord: any;

    try {
      await db.execute(
        `INSERT INTO payment_webhooks (
          id, provider, event_id, payload_hash, status, raw_headers, raw_body, processed_at
        ) VALUES (?, ?, ?, ?, 'received', ?, ?, ?)`,
        [webhookId, 'phonepe', verification.eventId, payloadHash, rawHeadersStr, rawBody, now]
      );
      webhookRecord = { id: webhookId, status: 'received' };
    } catch {
      // Primary duplicate deduplication via DB unique index
      webhookRecord = await db.queryOne<any>(
        `SELECT * FROM payment_webhooks WHERE provider = ? AND event_id = ?`,
        ['phonepe', verification.eventId]
      );
    }

    if (!webhookRecord) {
      throw new Error('Failed to record PhonePe webhook in durable inbox');
    }

    if (
      webhookRecord.status === 'processed' ||
      webhookRecord.status === 'ignored' ||
      webhookRecord.status === 'failed_permanent'
    ) {
      return { status: 'DUPLICATE' };
    }

    // Atomic lease acquisition (5-minute lease)
    const workerId = `worker_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
    const leaseExpiresAt = now + 5 * 60 * 1000;
    const leaseClaim = await db.execute(
      `UPDATE payment_webhooks
       SET status = 'processing',
           worker_id = ?,
           processing_started_at = ?,
           lease_expires_at = ?,
           processing_attempt = COALESCE(processing_attempt, 0) + 1,
           error = NULL
       WHERE id = ?
         AND (
           status IN ('received', 'verified', 'failed_retryable')
           OR (status = 'processing' AND lease_expires_at < ?)
         )`,
      [workerId, now, leaseExpiresAt, webhookRecord.id, now]
    );

    if (leaseClaim.changes === 0) {
      return { status: 'DUPLICATE' };
    }

    if (verification.status === 'captured') {
      if (!verification.providerPaymentId || verification.providerPaymentId.trim() === '') {
        await db.execute(
          `UPDATE payment_webhooks SET status = 'failed_permanent', error = 'Missing providerPaymentId', processed_at = ? WHERE id = ?`,
          [Date.now(), webhookRecord.id]
        );
        throw new Error('Malformed PhonePe event: missing providerPaymentId');
      }

      const order = await db.queryOne<any>(
        `SELECT * FROM payment_orders WHERE provider_order_id = ? OR id = ?`,
        [verification.providerOrderId, verification.providerOrderId]
      );

      if (!order) {
        await db.execute(
          `UPDATE payment_webhooks SET status = 'ignored', error = 'Order not found', processed_at = ? WHERE id = ?`,
          [Date.now(), webhookRecord.id]
        );
        return { status: 'IGNORED' };
      }

      try {
        const result = await this.settlePayment({
          orderId: order.id,
          providerPaymentId: verification.providerPaymentId,
          amountMinor: verification.amountMinor || Number(order.amount_minor),
          currency: verification.currency || order.currency,
          settlementSource: 'WEBHOOK',
        });

        await db.execute(
          `UPDATE payment_webhooks SET status = 'processed', error = NULL, processed_at = ? WHERE id = ?`,
          [Date.now(), webhookRecord.id]
        );

        if (result.status === 'DUPLICATE') {
          return { status: 'DUPLICATE', paymentId: result.paymentId };
        }
        return { status: 'PROCESSED', paymentId: result.paymentId };
      } catch (err: any) {
        await db.execute(
          `UPDATE payment_webhooks SET status = 'failed_retryable', error = ?, processed_at = ? WHERE id = ?`,
          [err.message, Date.now(), webhookRecord.id]
        );
        throw err;
      }
    }

    await db.execute(
      `UPDATE payment_webhooks SET status = 'processed', processed_at = ? WHERE id = ?`,
      [Date.now(), webhookRecord.id]
    );
    return { status: 'PROCESSED' };
  }

  static async refundPayment(params: {
    orderId: string;
    amountMinor: number;
    reason: string;
    idempotencyKey: string;
    initiatedBy: string;
  }): Promise<{ refundId: string; status: string }> {
    const db = getDb();
    const now = Date.now();

    // Phase 1: Atomically lock order and pre-reserve refundable capacity in DB
    const reservation = await db.transaction(async (tx) => {
      let orderQuery = `SELECT * FROM payment_orders WHERE id = ?`;
      if (tx.isPostgres()) {
        orderQuery += ` FOR UPDATE`;
      }
      const order = await tx.queryOne<any>(orderQuery, [params.orderId]);

      if (!order) {
        throw new Error('Order not found');
      }

      if (
        order.status !== 'SUCCESS' &&
        order.status !== 'captured' &&
        order.status !== 'succeeded' &&
        order.status !== 'PARTIALLY_REFUNDED'
      ) {
        throw new Error('Can only refund successful or partially refunded orders');
      }

      // Query active in-flight or completed refund total
      const activeRefunds = await tx.queryOne<{ total: bigint | number }>(
        `SELECT COALESCE(SUM(amount_minor), 0) AS total FROM payment_refunds
         WHERE payment_order_id = ? AND status IN ('INITIATING', 'PENDING', 'SUCCESS')`,
        [order.id]
      );
      const totalReservedAndSettled = BigInt(activeRefunds?.total || 0);
      const orderTotal = BigInt(order.amount_minor);
      const requested = BigInt(params.amountMinor);

      if (totalReservedAndSettled + requested > orderTotal) {
        throw new Error('Refund amount exceeds available refundable capacity');
      }

      // Pre-flight check: Verify unreserved balance in sovereign cash ledger account
      const available = await LedgerService.getAvailableUnreservedBalance(
        order.user_id,
        order.currency,
        'live',
        tx
      );
      if (available < requested) {
        throw new Error('Insufficient unreserved balance for refund debit');
      }

      const refundId = `ref_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

      // Reserve capacity on order row
      await tx.execute(
        `UPDATE payment_orders
         SET reserved_refund_amount_minor = COALESCE(reserved_refund_amount_minor, 0) + ?,
             updated_at = ?
         WHERE id = ?`,
        [params.amountMinor, now, order.id]
      );

      // Pre-persist refund attempt in INITIATING state
      await tx.execute(
        `INSERT INTO payment_refunds (
          id, payment_order_id, amount_minor, currency, status, reason, idempotency_key,
          initiated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'INITIATING', ?, ?, ?, ?, ?)`,
        [
          refundId,
          order.id,
          params.amountMinor,
          order.currency,
          params.reason,
          params.idempotencyKey,
          params.initiatedBy || order.user_id,
          now,
          now,
        ]
      );

      return { refundId, order };
    });

    const { refundId, order } = reservation;
    const provider = this.getProvider();
    let providerResult: any;

    try {
      providerResult = await provider.refund({
        providerOrderId: order.provider_order_id,
        amountMinor: params.amountMinor,
        reason: params.reason,
        idempotencyKey: params.idempotencyKey,
      });
    } catch (err: any) {
      const isTimeout = err.name === 'ProviderNetworkTimeoutError' || /timeout|fetch|network/i.test(err.message);

      if (isTimeout) {
        await db.execute(
          `UPDATE payment_refunds SET status = 'REFUND_UNKNOWN', updated_at = ? WHERE id = ?`,
          [Date.now(), refundId]
        );
        // Customer balance is NEVER debited on provider timeout. Capacity remains reserved until reconciled.
        return { refundId, status: 'REFUND_UNKNOWN' };
      } else {
        // Explicit provider failure: release reserved capacity
        await db.transaction(async (tx) => {
          await tx.execute(
            `UPDATE payment_orders
             SET reserved_refund_amount_minor = GREATEST(0, COALESCE(reserved_refund_amount_minor, 0) - ?),
                 updated_at = ?
             WHERE id = ?`,
            [params.amountMinor, Date.now(), order.id]
          );
          await tx.execute(
            `UPDATE payment_refunds SET status = 'FAILED', updated_at = ? WHERE id = ?`,
            [Date.now(), refundId]
          );
        });
        throw err;
      }
    }

    if (!providerResult.success && providerResult.status === 'FAILED') {
      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE payment_orders
           SET reserved_refund_amount_minor = GREATEST(0, COALESCE(reserved_refund_amount_minor, 0) - ?),
               updated_at = ?
           WHERE id = ?`,
          [params.amountMinor, Date.now(), order.id]
        );
        await tx.execute(
          `UPDATE payment_refunds SET status = 'FAILED', updated_at = ? WHERE id = ?`,
          [Date.now(), refundId]
        );
      });
      throw new Error(`Refund failed at provider: ${providerResult.error || 'Unknown provider rejection'}`);
    }

    if (providerResult.status === 'PENDING') {
      await db.execute(
        `UPDATE payment_refunds SET status = 'PENDING', provider_refund_id = ?, updated_at = ? WHERE id = ?`,
        [providerResult.refundId, Date.now(), refundId]
      );
      // Customer balance remains intact until confirmed
      return { refundId, status: 'PENDING' };
    }

    // Provider confirmed SUCCESS: Atomically debit ledger and update refund and order records
    return db.transaction(async (tx) => {
      const ledgerResult = await LedgerService.debitRefund(
        {
          userId: order.user_id,
          assetOrCurrency: order.currency,
          amountMinor: params.amountMinor,
          refundId,
          description: params.reason,
          idempotencyKey: params.idempotencyKey,
        },
        tx
      );

      await tx.execute(
        `UPDATE payment_refunds SET
          status = 'SUCCESS',
          provider_refund_id = ?,
          ledger_transaction_id = ?,
          updated_at = ?
         WHERE id = ?`,
        [providerResult.refundId, ledgerResult.transactionId, Date.now(), refundId]
      );

      const refreshedOrder = await tx.queryOne<any>(`SELECT * FROM payment_orders WHERE id = ?`, [order.id]);
      const newRefundedTotal = BigInt(refreshedOrder.refunded_amount_minor || 0) + BigInt(params.amountMinor);
      const isFullRefund = newRefundedTotal >= BigInt(refreshedOrder.amount_minor);

      await tx.execute(
        `UPDATE payment_orders SET
          status = ?,
          refunded_amount_minor = refunded_amount_minor + ?,
          reserved_refund_amount_minor = GREATEST(0, COALESCE(reserved_refund_amount_minor, 0) - ?),
          updated_at = ?
         WHERE id = ?`,
        [isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED', params.amountMinor, params.amountMinor, Date.now(), order.id]
      );

      await AuditService.logEvent({
        userId: order.user_id,
        eventType: 'PAYMENT_REFUNDED',
        source: 'payment_service',
        actor: params.initiatedBy,
        externalId: refundId,
        metadata: {
          orderId: order.id,
          amountMinor: params.amountMinor,
          currency: order.currency,
          reason: params.reason,
        },
        result: 'SUCCESS',
      });

      return { refundId, status: 'SUCCESS' };
    });
  }

  static async reconcilePendingPayments(): Promise<{ reconciledCount: number; mismatchCount: number }> {
    const db = getDb();
    const twoMinutesAgo = Date.now() - 2 * 60 * 1000;

    // 1. Reconcile pending & unknown payment orders
    const pendingOrders = await db.query<any>(
      `SELECT * FROM payment_orders WHERE status IN ('PENDING', 'UNKNOWN_PROVIDER_STATE') AND created_at <= ? LIMIT 50`,
      [twoMinutesAgo]
    );

    let reconciledCount = 0;
    let mismatchCount = 0;
    const provider = this.getProvider();

    for (const order of pendingOrders) {
      try {
        const statusResult = await provider.checkStatus(order.provider_order_id || order.id, order.id);
        if (statusResult.status === 'SUCCESS') {
          await this.settlePayment({
            orderId: order.id,
            providerPaymentId: statusResult.providerPaymentId || `prov_${order.provider_order_id || order.id}`,
            amountMinor: statusResult.amountMinor || Number(order.amount_minor),
            currency: statusResult.currency || order.currency,
            settlementSource: 'RECONCILIATION_SWEEP',
          });
          reconciledCount++;
        } else if (statusResult.status === 'FAILED') {
          await db.execute(`UPDATE payment_orders SET status = 'FAILED', updated_at = ? WHERE id = ?`, [Date.now(), order.id]);
        } else if (statusResult.status === 'PENDING') {
          if (Date.now() >= Number(order.expires_at)) {
            await db.execute(`UPDATE payment_orders SET status = 'EXPIRED', updated_at = ? WHERE id = ?`, [Date.now(), order.id]);
          }
        } else if (statusResult.status === 'UNKNOWN') {
          mismatchCount++;
        }
      } catch {
        mismatchCount++;
      }
    }

    // 2. Reconcile pending & unknown refunds
    const pendingRefunds = await db.query<any>(
      `SELECT * FROM payment_refunds WHERE status IN ('PENDING', 'REFUND_UNKNOWN') AND created_at <= ? LIMIT 50`,
      [twoMinutesAgo]
    );

    for (const ref of pendingRefunds) {
      if (provider.checkRefundStatus) {
        try {
          const refStatus = await provider.checkRefundStatus(ref.provider_refund_id || ref.id);
          if (refStatus.status === 'SUCCESS') {
            const order = await db.queryOne<any>(`SELECT * FROM payment_orders WHERE id = ?`, [ref.payment_order_id]);
            if (order) {
              await db.transaction(async (tx) => {
                const ledgerResult = await LedgerService.debitRefund(
                  {
                    userId: order.user_id,
                    assetOrCurrency: order.currency,
                    amountMinor: Number(ref.amount_minor),
                    refundId: ref.id,
                    description: ref.reason,
                    idempotencyKey: ref.idempotency_key,
                  },
                  tx
                );

                await tx.execute(
                  `UPDATE payment_refunds SET status = 'SUCCESS', ledger_transaction_id = ?, updated_at = ? WHERE id = ?`,
                  [ledgerResult.transactionId, Date.now(), ref.id]
                );

                const newRefunded = BigInt(order.refunded_amount_minor || 0) + BigInt(ref.amount_minor);
                const isFull = newRefunded >= BigInt(order.amount_minor);

                await tx.execute(
                  `UPDATE payment_orders SET
                    status = ?,
                    refunded_amount_minor = refunded_amount_minor + ?,
                    reserved_refund_amount_minor = GREATEST(0, COALESCE(reserved_refund_amount_minor, 0) - ?),
                    updated_at = ?
                   WHERE id = ?`,
                  [isFull ? 'REFUNDED' : 'PARTIALLY_REFUNDED', Number(ref.amount_minor), Number(ref.amount_minor), Date.now(), order.id]
                );
              });
              reconciledCount++;
            }
          } else if (refStatus.status === 'FAILED') {
            await db.transaction(async (tx) => {
              await tx.execute(
                `UPDATE payment_orders SET
                  reserved_refund_amount_minor = GREATEST(0, COALESCE(reserved_refund_amount_minor, 0) - ?),
                  updated_at = ?
                 WHERE id = ?`,
                [Number(ref.amount_minor), Date.now(), ref.payment_order_id]
              );
              await tx.execute(
                `UPDATE payment_refunds SET status = 'FAILED', updated_at = ? WHERE id = ?`,
                [Date.now(), ref.id]
              );
            });
            reconciledCount++;
          }
        } catch {
          mismatchCount++;
        }
      }
    }

    return { reconciledCount, mismatchCount };
  }
}
