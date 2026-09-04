import crypto from 'node:crypto';
import {
  PaymentProvider,
  CreatePaymentIntentParams,
  PaymentOrderResult,
  WebhookVerificationResult,
  PaymentStatusResult,
  RefundParams,
  RefundResult,
} from './types';

/**
 * SandboxAdapter
 * Fast zero-cost in-memory / local payment adapter for unit and integration testing.
 */
export class SandboxAdapter implements PaymentProvider {
  name = 'sandbox';

  private orders = new Map<string, any>();

  async createOrder(params: CreatePaymentIntentParams): Promise<PaymentOrderResult> {
    const providerOrderId = `sb_ord_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const amountFloat = (params.amountMinor / 100).toFixed(2);
    
    this.orders.set(params.orderId, {
      providerOrderId,
      amountMinor: params.amountMinor,
      currency: params.currency,
      status: 'PENDING',
    });

    return {
      provider: 'sandbox',
      providerOrderId,
      checkoutUrl: `http://localhost:3000/mock-checkout?orderId=${params.orderId}&amount=${amountFloat}`,
      upiIntentUri: `upi://pay?pa=sandbox@lumen&pn=SandboxTreasury&am=${amountFloat}&cu=${params.currency}&tr=${params.orderId}`,
    };
  }

  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>
  ): Promise<WebhookVerificationResult> {
    let body: any;
    try {
      body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch {
      return { isValid: false, error: 'Malformed JSON payload' };
    }

    const sig = (headers['x-webhook-signature'] || headers['X-Webhook-Signature']) as string | undefined;
    if (!sig) {
      return { isValid: false, error: 'Missing webhook signature header' };
    }

    return {
      isValid: true,
      eventId: body.eventId || `sb_evt_${Date.now()}`,
      providerOrderId: body.providerOrderId,
      providerPaymentId: body.providerPaymentId || `sb_pay_${Date.now()}`,
      status: body.eventType === 'payment.captured' ? 'captured' : 'failed',
      amountMinor: body.amountMinor,
      currency: body.currency || 'USD',
      rawPayload: body,
    };
  }

  async checkStatus(providerOrderId: string, merchantTransactionId: string): Promise<PaymentStatusResult> {
    const order = this.orders.get(merchantTransactionId);
    return {
      providerOrderId,
      status: order?.status || 'SUCCESS',
      amountMinor: order?.amountMinor || 10000,
      currency: order?.currency || 'INR',
      providerPaymentId: `sb_pay_${providerOrderId}`,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    return {
      success: true,
      refundId: `sb_ref_${Date.now()}`,
      status: 'SUCCESS',
      amountMinor: params.amountMinor,
    };
  }
}
