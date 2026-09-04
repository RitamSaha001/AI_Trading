import { getDb } from '../db';
import { config } from '../config';
import { LedgerService } from './ledgerService';
import { AuditService } from './auditService';
import { PaymentProvider } from './payments/types';
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

  /**
   * Generates a cryptographic HMAC-SHA256 signature for webhook validation.
   */
  static generateWebhookSignature(payload: string, secret = config.PAYMENT_WEBHOOK_SECRET): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Verifies an incoming payment provider webhook signature using timing-safe comparison.
   */
  static verifyWebhookSignature(payload: string, signature: string, secret = config.PAYMENT_WEBHOOK_SECRET): boolean {
    if (!signature || !payload) return false;
    const expected = this.generateWebhookSignature(payload, secret);
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');

    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  /**
   * Creates a server-authoritative payment order intent.
   */
  static async createPaymentOrder(params: CreateOrderParams): Promise<{
    orderId: string;
    providerOrderId: string;
    amountMinor: number;
    currency: string;
    method: string;
    upiUri?: string;
    checkoutUrl?: string;
    expiresAt: number;
  }> {
    const db = getDb();

    // Check for idempotency key replay
    const existing = await db.queryOne<any>(
      `SELECT * FROM payment_orders WHERE idempotency_key = ?`,
      [params.idempotencyKey]
    );
    if (existing) {
      return {
        orderId: existing.id,
        providerOrderId: existing.provider_order_id,
        amountMinor: Number(existing.amount_minor),
        currency: existing.currency,
        method: existing.method,
        expiresAt: Number(existing.expires_at),
      };
    }

    if (params.amountMinor <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    const orderId = `po_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const providerOrderId = `prov_ord_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const now = Date.now();
    const expiresAt = now + 15 * 60 * 1000; // 15 minute expiration

    // Delegate to the configured payment provider (PhonePe or Sandbox)
    const provider = this.getProvider();
    const providerResult = await provider.createOrder({
      userId: params.userId,
      orderId,
      amountMinor: params.amountMinor,
      currency: params.currency,
      method: params.method,
    });

    const finalProviderOrderId = providerResult.providerOrderId || providerOrderId;

    await db.execute(
      `INSERT INTO payment_orders (
        id, user_id, amount_minor, currency, method, provider, provider_order_id,
        status, idempotency_key, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'created', ?, ?, ?, ?)`,
      [
        orderId,
        params.userId,
        params.amountMinor,
        params.currency,
        params.method,
        provider.name,
        finalProviderOrderId,
        params.idempotencyKey,
        expiresAt,
        now,
        now,
      ]
    );

    await AuditService.logEvent({
      userId: params.userId,
      eventType: 'PAYMENT_ORDER_CREATED',
      source: 'payment_service',
      actor: 'user',
      idempotencyKey: params.idempotencyKey,
      externalId: finalProviderOrderId,
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
      providerOrderId: finalProviderOrderId,
      amountMinor: params.amountMinor,
      currency: params.currency,
      method: params.method,
      upiUri: providerResult.upiIntentUri,
      checkoutUrl: providerResult.checkoutUrl,
      expiresAt,
    };
  }

  /**
   * Ingests and processes a provider webhook idempotently with signature verification.
   * Authoritatively settles captured funds onto the internal double-entry ledger.
   */
  static async processWebhook(
    rawPayload: string,
    signature: string,
    event: WebhookEventPayload
  ): Promise<{ status: 'PROCESSED' | 'DUPLICATE' | 'IGNORED'; paymentId?: string }> {
    // 1. Signature Verification
    if (!this.verifyWebhookSignature(rawPayload, signature)) {
      await AuditService.logEvent({
        eventType: 'WEBHOOK_SIGNATURE_FAILED',
        source: 'payment_webhook',
        actor: 'webhook',
        metadata: { provider: event.provider, eventId: event.eventId },
        result: 'FAILURE',
        error: 'Invalid HMAC signature',
      });
      throw new Error('Invalid webhook signature');
    }

    const db = getDb();

    // 2. Replay & Deduplication Protection via unique event_id
    const existingWebhook = await db.queryOne<any>(
      `SELECT * FROM payment_webhooks WHERE event_id = ?`,
      [event.eventId]
    );

    if (existingWebhook) {
      return { status: 'DUPLICATE' };
    }

    // 3. Process inside ACID Database Transaction
    return db.transaction(async (tx) => {
      const payloadHash = crypto.createHash('sha256').update(rawPayload).digest('hex');
      const now = Date.now();

      // Record webhook ingestion
      await tx.execute(
        `INSERT INTO payment_webhooks (id, provider, event_id, payload_hash, status, processed_at)
         VALUES (?, ?, ?, ?, 'processed', ?)`,
        [`wh_${crypto.randomBytes(8).toString('hex')}`, event.provider, event.eventId, payloadHash, now]
      );

      // Lookup matching payment order
      const order = await tx.queryOne<any>(
        `SELECT * FROM payment_orders WHERE provider_order_id = ?`,
        [event.providerOrderId]
      );

      if (!order) {
        await tx.execute(`UPDATE payment_webhooks SET status = 'ignored', error = 'Order not found' WHERE event_id = ?`, [event.eventId]);
        return { status: 'IGNORED' };
      }

      if (event.eventType === 'payment.captured') {
        // Amount and Currency Verification
        if (Number(order.amount_minor) !== event.amountMinor || order.currency !== event.currency) {
          throw new Error(
            `Webhook amount/currency mismatch. Expected ${order.amount_minor} ${order.currency}, received ${event.amountMinor} ${event.currency}`
          );
        }

        // Avoid double-crediting if already captured
        if (order.status === 'captured') {
          return { status: 'DUPLICATE' };
        }

        const paymentId = `pay_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

        // Record Payment Record
        await tx.execute(
          `INSERT INTO payments (
            id, payment_order_id, user_id, provider_payment_id, amount_minor, currency,
            method, status, card_last4, card_brand, upi_vpa, utr, settlement_reference,
            cleared_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, ?, ?, ?)`,
          [
            paymentId,
            order.id,
            order.user_id,
            event.providerPaymentId,
            event.amountMinor,
            event.currency,
            order.method,
            event.cardLast4 || null,
            event.cardBrand || null,
            event.upiVpa || null,
            event.utr || null,
            `SETTL-${event.providerPaymentId}`,
            now,
            now,
          ]
        );

        // Update Payment Order Status
        await tx.execute(
          `UPDATE payment_orders SET status = 'captured', updated_at = ? WHERE id = ?`,
          [now, order.id]
        );

        // Double-Entry Ledger Settlement Credit
        await LedgerService.creditDeposit({
          userId: order.user_id,
          assetOrCurrency: order.currency,
          amountMinor: event.amountMinor,
          paymentId,
          description: `Settled ${order.method.toUpperCase()} Deposit via ${event.provider}`,
          idempotencyKey: `settl_${order.id}`,
        });

        await AuditService.logEvent({
          userId: order.user_id,
          eventType: 'PAYMENT_SETTLED_AUTHORITATIVE',
          source: 'payment_webhook',
          actor: 'webhook',
          externalId: event.providerPaymentId,
          metadata: {
            orderId: order.id,
            paymentId,
            amountMinor: event.amountMinor,
            currency: event.currency,
          },
          result: 'SUCCESS',
        });

        return { status: 'PROCESSED', paymentId };
      }

      return { status: 'PROCESSED' };
    });
  }

  /**
   * Registers a manual Indian Bank UTR for offline/direct bank clearance.
   *
   * CRITICAL NON-NEGOTIABLE FINANCIAL INVARIANT:
   * A valid-looking 12-digit UTR is NOT proof of settlement.
   * This method creates a PENDING_MANUAL_SETTLEMENT record and DOES NOT credit the ledger.
   * Funds are credited ONLY after bank statement / reconciliation clearance.
   */
  static async submitManualUTR(params: {
    userId: string;
    orderId?: string;
    utr: string;
    amountINR: number;
    payeeVpa?: string;
  }): Promise<{ paymentId: string; status: string; message: string }> {
    const cleanUtr = params.utr.trim().replace(/\s+/g, '');

    // 1. Structural validation
    if (!/^\d{12}$/.test(cleanUtr) || cleanUtr.split('').every((d) => d === cleanUtr[0])) {
      throw new Error('Invalid UTR format. Expected 12-digit Indian Bank Unique Transaction Reference.');
    }

    if (params.amountINR <= 0) {
      throw new Error('Deposit amount must be strictly positive');
    }

    const db = getDb();

    // 2. Duplicate UTR check across all accounts
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
      // Ensure order exists
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

    // NOTICE: Zero wallet credit here. Status remains pending until bank verification.
    return {
      paymentId,
      status: 'pending_manual_settlement',
      message: 'UTR submitted for verification. Funds will be credited after bank reconciliation confirms settlement.',
    };
  }

  /**
   * Authoritatively clears a pending manual UTR payment after bank statement reconciliation.
   */
  static async reconcileManualUTR(params: {
    paymentId: string;
    reconciledBy: string;
    bankReference: string;
  }): Promise<{ cleared: boolean; balanceAfter: bigint }> {
    const db = getDb();
    const now = Date.now();

    return db.transaction(async (tx) => {
      const payment = await tx.queryOne<any>(
        `SELECT * FROM payments WHERE id = ? AND status = 'pending_manual_settlement'`,
        [params.paymentId]
      );
      if (!payment) {
        throw new Error(`Pending payment ${params.paymentId} not found or already reconciled.`);
      }

      // Update payment
      await tx.execute(
        `UPDATE payments SET status = 'succeeded', settlement_reference = ?, cleared_at = ? WHERE id = ?`,
        [params.bankReference, now, payment.id]
      );

      // Update order
      await tx.execute(
        `UPDATE payment_orders SET status = 'captured', updated_at = ? WHERE id = ?`,
        [now, payment.payment_order_id]
      );

      // Credit ledger
      const ledgerResult = await LedgerService.creditDeposit({
        userId: payment.user_id,
        assetOrCurrency: payment.currency,
        amountMinor: Number(payment.amount_minor),
        paymentId: payment.id,
        description: `Reconciled Bank UTR Deposit: ${payment.utr} (${params.bankReference})`,
        idempotencyKey: `rec_utr_${payment.id}`,
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

      return { cleared: true, balanceAfter: ledgerResult.balanceAfter };
    });
  }

  /**
   * Specifically validates and processes PhonePe Webhook requests.
   */
  static async processPhonePeWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>
  ): Promise<{ status: 'PROCESSED' | 'DUPLICATE' | 'FAILED'; error?: string }> {
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

    const eventPayload: WebhookEventPayload = {
      eventId: verification.eventId || `evt_${Date.now()}`,
      provider: 'phonepe',
      eventType: verification.status === 'captured' ? 'payment.captured' : 'payment.failed',
      providerOrderId: verification.providerOrderId || '',
      providerPaymentId: verification.providerPaymentId || '',
      amountMinor: verification.amountMinor || 0,
      currency: verification.currency || 'INR',
    };

    // Calculate internal checksum to pass signature check in processWebhook
    const internalSig = this.generateWebhookSignature(rawBody);
    const result = await this.processWebhook(rawBody, internalSig, eventPayload);
    return { status: result.status };
  }

  /**
   * Background Reconciliation Worker: Queries payment provider for orders pending > 5 minutes.
   */
  static async reconcilePendingPayments(): Promise<{ reconciledCount: number; mismatchCount: number }> {
    const db = getDb();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    const pendingOrders = await db.query<any>(
      `SELECT * FROM payment_orders WHERE status = 'created' AND created_at <= ? LIMIT 50`,
      [fiveMinutesAgo]
    );

    let reconciledCount = 0;
    let mismatchCount = 0;
    const provider = this.getProvider();

    for (const order of pendingOrders) {
      try {
        const statusResult = await provider.checkStatus(order.provider_order_id, order.id);
        if (statusResult.status === 'SUCCESS') {
          // Recover dropped webhook: authoritatively settle
          await db.transaction(async (tx) => {
            const now = Date.now();
            const paymentId = `pay_rec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
            await tx.execute(
              `INSERT INTO payments (
                id, payment_order_id, user_id, provider_payment_id, amount_minor, currency,
                method, status, settlement_reference, cleared_at, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'succeeded', ?, ?, ?)`,
              [
                paymentId,
                order.id,
                order.user_id,
                statusResult.providerPaymentId || `prov_${order.provider_order_id}`,
                statusResult.amountMinor,
                statusResult.currency,
                order.method,
                `REC-PHONEPE-${order.id}`,
                now,
                now,
              ]
            );

            await tx.execute(
              `UPDATE payment_orders SET status = 'captured', updated_at = ? WHERE id = ?`,
              [now, order.id]
            );

            await LedgerService.creditDeposit({
              userId: order.user_id,
              assetOrCurrency: statusResult.currency,
              amountMinor: statusResult.amountMinor,
              paymentId,
              description: `Authoritative Status Polling Settlement: ${order.id}`,
              idempotencyKey: `poll_settl_${order.id}`,
            });
          });
          reconciledCount++;
        } else if (statusResult.status === 'FAILED') {
          await db.execute(`UPDATE payment_orders SET status = 'failed', updated_at = ? WHERE id = ?`, [Date.now(), order.id]);
        }
      } catch (err) {
        mismatchCount++;
      }
    }

    return { reconciledCount, mismatchCount };
  }
}
