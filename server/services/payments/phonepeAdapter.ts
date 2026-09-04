import crypto from 'node:crypto';
import { config } from '../../config';
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
 * PhonePeProductionAdapter
 * Implements official PhonePe Payment Gateway integration (Standard Web Checkout,
 * UPI Intent, Dynamic QR, and Status API).
 *
 * Official Checksum Formula:
 * SHA256(base64Payload + endpoint + saltKey) + "###" + saltIndex
 */
export class PhonePeProductionAdapter implements PaymentProvider {
  name = 'phonepe';

  private merchantId: string;
  private saltKey: string;
  private saltIndex: string;
  private hostUrl: string;
  private callbackUrl: string;

  constructor() {
    this.merchantId = config.PHONEPE_MERCHANT_ID;
    this.saltKey = config.PHONEPE_SALT_KEY;
    this.saltIndex = config.PHONEPE_SALT_INDEX;
    this.hostUrl = config.PHONEPE_HOST_URL;
    this.callbackUrl = config.PHONEPE_CALLBACK_URL;
  }

  /**
   * Generates the official PhonePe X-VERIFY checksum
   */
  calculateChecksum(payloadBase64: string, endpoint: string): string {
    const stringToHash = `${payloadBase64}${endpoint}${this.saltKey}`;
    const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
    return `${sha256}###${this.saltIndex}`;
  }

  /**
   * Initiates payment order on PhonePe PG (/pg/v1/pay)
   */
  async createOrder(params: CreatePaymentIntentParams): Promise<PaymentOrderResult> {
    if (params.currency !== 'INR') {
      throw new Error(`PhonePe Payment Gateway only accepts INR. Received: ${params.currency}`);
    }

    const merchantTransactionId = params.orderId;
    const amountInPaise = params.amountMinor;

    const payload = {
      merchantId: this.merchantId,
      merchantTransactionId,
      merchantUserId: params.userId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 36),
      amount: amountInPaise,
      redirectUrl: params.redirectUrl || `${config.ALLOWED_ORIGINS.split(',')[0]}/wallet?orderId=${merchantTransactionId}`,
      redirectMode: 'REDIRECT',
      callbackUrl: this.callbackUrl,
      paymentInstrument: params.method === 'upi'
        ? { type: 'UPI_INTENT', targetApp: 'com.phonepe.app' }
        : { type: 'PAY_PAGE' },
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const endpoint = '/pg/v1/pay';
    const xVerify = this.calculateChecksum(base64Payload, endpoint);

    try {
      const response = await fetch(`${this.hostUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
        },
        body: JSON.stringify({ request: base64Payload }),
      });

      const json = await response.json() as any;

      if (!json.success && json.code !== 'PAYMENT_PENDING') {
        throw new Error(json.message || `PhonePe PG Error: ${json.code}`);
      }

      const instrumentResponse = json.data?.instrumentResponse;
      const checkoutUrl = instrumentResponse?.redirectInfo?.url;
      const upiIntentUri = instrumentResponse?.intentUrl;
      const qrPayload = instrumentResponse?.qrData;

      return {
        provider: 'phonepe',
        providerOrderId: merchantTransactionId,
        checkoutUrl: checkoutUrl || `${this.hostUrl}/checkout/${merchantTransactionId}`,
        upiIntentUri,
        qrPayload,
        additionalData: json.data,
      };
    } catch (err: any) {
      // In offline/preprod test mode, construct local mock intent if network is unavailable
      if (config.NODE_ENV !== 'production') {
        const amountINR = (amountInPaise / 100).toFixed(2);
        return {
          provider: 'phonepe',
          providerOrderId: merchantTransactionId,
          checkoutUrl: `${this.hostUrl}/mock-checkout?tid=${merchantTransactionId}&amt=${amountINR}`,
          upiIntentUri: `phonepe://pay?pa=lumen@ybl&pn=LumenSovereign&am=${amountINR}&cu=INR&tr=${merchantTransactionId}`,
        };
      }
      throw new Error(`PhonePe Payment Creation Failed: ${err.message}`);
    }
  }

  /**
   * Verifies PhonePe Webhook Callback with strict cryptographic validation
   */
  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>
  ): Promise<WebhookVerificationResult> {
    const xVerifyHeader = (headers['x-verify'] || headers['X-VERIFY']) as string | undefined;

    if (!xVerifyHeader) {
      return { isValid: false, error: 'Missing X-VERIFY header from PhonePe' };
    }

    let parsedBody: any;
    try {
      parsedBody = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch {
      return { isValid: false, error: 'Invalid JSON webhook payload' };
    }

    const responseBase64 = parsedBody.response;
    if (!responseBase64) {
      return { isValid: false, error: 'Missing response field in webhook payload' };
    }

    // Official PhonePe Webhook Verification: SHA256(responseBase64 + saltKey) + "###" + saltIndex
    const expectedHash = crypto
      .createHash('sha256')
      .update(`${responseBase64}${this.saltKey}`)
      .digest('hex');
    const expectedXVerify = `${expectedHash}###${this.saltIndex}`;

    // Timing safe comparison
    const sigBuf = Buffer.from(xVerifyHeader);
    const expBuf = Buffer.from(expectedXVerify);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { isValid: false, error: 'Cryptographic signature mismatch on PhonePe webhook' };
    }

    // Decode base64 payload
    let decoded: any;
    try {
      decoded = JSON.parse(Buffer.from(responseBase64, 'base64').toString('utf8'));
    } catch {
      return { isValid: false, error: 'Failed to decode base64 PhonePe webhook response' };
    }

    const data = decoded.data;
    if (!data) {
      return { isValid: false, error: 'Decoded webhook missing data object' };
    }

    const merchantTransactionId = data.merchantTransactionId;
    const transactionId = data.transactionId;
    const amountMinor = data.amount;
    const responseCode = decoded.code;

    const isSuccess = responseCode === 'PAYMENT_SUCCESS';
    const isRefund = responseCode === 'REFUND_SUCCESS';

    return {
      isValid: true,
      eventId: transactionId || `evt_${merchantTransactionId}_${Date.now()}`,
      providerOrderId: merchantTransactionId,
      providerPaymentId: transactionId,
      status: isSuccess ? 'captured' : isRefund ? 'refunded' : 'failed',
      amountMinor,
      currency: 'INR',
      rawPayload: decoded,
    };
  }

  /**
   * Queries PhonePe Status API (/pg/v1/status/{merchantId}/{transactionId})
   */
  async checkStatus(providerOrderId: string, merchantTransactionId: string): Promise<PaymentStatusResult> {
    const endpoint = `/pg/v1/status/${this.merchantId}/${merchantTransactionId}`;
    const xVerify = crypto
      .createHash('sha256')
      .update(`${endpoint}${this.saltKey}`)
      .digest('hex') + `###${this.saltIndex}`;

    try {
      const response = await fetch(`${this.hostUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
          'X-MERCHANT-ID': this.merchantId,
        },
      });

      const json = await response.json() as any;
      const isSuccess = json.code === 'PAYMENT_SUCCESS';
      const isPending = json.code === 'PAYMENT_PENDING';

      return {
        providerOrderId: merchantTransactionId,
        status: isSuccess ? 'SUCCESS' : isPending ? 'PENDING' : 'FAILED',
        amountMinor: json.data?.amount || 0,
        currency: 'INR',
        providerPaymentId: json.data?.transactionId,
        utr: json.data?.paymentInstrument?.utr,
      };
    } catch (err: any) {
      throw new Error(`PhonePe Status API Error: ${err.message}`);
    }
  }

  /**
   * Initiates Refund on PhonePe (/pg/v1/refund)
   */
  async refund(params: RefundParams): Promise<RefundResult> {
    const endpoint = '/pg/v1/refund';
    const merchantRefundId = `ref_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const payload = {
      merchantId: this.merchantId,
      merchantUserId: 'LUMEN_ADMIN',
      originalTransactionId: params.providerOrderId,
      merchantTransactionId: merchantRefundId,
      amount: params.amountMinor,
      callbackUrl: this.callbackUrl,
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const xVerify = this.calculateChecksum(base64Payload, endpoint);

    try {
      const response = await fetch(`${this.hostUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify,
        },
        body: JSON.stringify({ request: base64Payload }),
      });

      const json = await response.json() as any;
      const isSuccess = json.success && (json.code === 'PAYMENT_SUCCESS' || json.code === 'REFUND_PENDING');

      return {
        success: isSuccess,
        refundId: merchantRefundId,
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        amountMinor: params.amountMinor,
        error: json.message,
      };
    } catch (err: any) {
      return {
        success: false,
        refundId: merchantRefundId,
        status: 'FAILED',
        amountMinor: params.amountMinor,
        error: err.message,
      };
    }
  }
}
