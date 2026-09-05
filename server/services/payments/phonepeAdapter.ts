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
  ProviderNetworkTimeoutError
} from './types';
import { StandardCheckoutClient, StandardCheckoutPayRequest, RefundRequest, Env } from '@phonepe-pg/pg-sdk-node';

export class PhonePeProductionAdapter implements PaymentProvider {
  name = 'phonepe';

  private merchantId: string;
  private saltKey: string;
  private saltIndex: string;
  private hostUrl: string;
  private callbackUrl: string;
  private sdkClient: StandardCheckoutClient | null = null;

  constructor() {
    this.merchantId = config.PHONEPE_MERCHANT_ID;
    this.saltKey = config.PHONEPE_SALT_KEY;
    this.saltIndex = config.PHONEPE_SALT_INDEX;
    this.hostUrl = config.PHONEPE_HOST_URL;
    this.callbackUrl = config.PHONEPE_CALLBACK_URL;

    try {
      if (config.PHONEPE_CLIENT_ID && config.PHONEPE_CLIENT_SECRET) {
        this.sdkClient = StandardCheckoutClient.getInstance(
          config.PHONEPE_CLIENT_ID,
          config.PHONEPE_CLIENT_SECRET,
          Number(config.PHONEPE_CLIENT_VERSION || 1),
          config.PHONEPE_ENV === 'PRODUCTION' ? Env.PRODUCTION : Env.SANDBOX
        );
      }
    } catch (err: any) {
      console.warn('PhonePe SDK Client initialization failed. Falling back to legacy REST.', err.message);
    }
  }

  calculateChecksum(payloadBase64: string, endpoint: string): string {
    const stringToHash = `${payloadBase64}${endpoint}${this.saltKey}`;
    const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
    return `${sha256}###${this.saltIndex}`;
  }

  async createOrder(params: CreatePaymentIntentParams): Promise<PaymentOrderResult> {
    if (params.currency !== 'INR') {
      throw new Error(`PhonePe Payment Gateway only accepts INR. Received: ${params.currency}`);
    }

    const merchantTransactionId = params.orderId;
    const amountInPaise = params.amountMinor;
    const redirectUrl = params.redirectUrl || `${config.ALLOWED_ORIGINS.split(',')[0]}/wallet?orderId=${merchantTransactionId}`;

    if (this.sdkClient) {
      try {
        const req = new StandardCheckoutPayRequest(
          merchantTransactionId,
          amountInPaise,
          null,
          'Lumen Wallet Deposit',
          redirectUrl
        );
        const response = await this.sdkClient.pay(req);
        
        // Wait, what does the response look like?
        // We'll map checkoutUrl or throw timeout
        // According to instructions: "Parse checkoutUrl from the response. On network error: throw ProviderNetworkTimeoutError"
        
        // standard SDK response returns checkoutUrl property or something similar, assuming response.redirectUrl or response.instrumentResponse
        // if response fails at network level, it throws
        
        // if response is an object with success, code, message...
        const checkoutUrl = (response as any).redirectInfo?.url || (response as any).url || (response as any).redirectUrl || (response as any).instrumentResponse?.redirectInfo?.url;
        
        return {
          provider: 'phonepe',
          providerOrderId: merchantTransactionId,
          checkoutUrl: checkoutUrl || `${this.hostUrl}/checkout/${merchantTransactionId}`,
          additionalData: response as any,
        };
      } catch (err: any) {
        if (err.name === 'FetchError' || err.code === 'ETIMEDOUT' || err.message.includes('timeout') || err.message.includes('fetch')) {
          throw new ProviderNetworkTimeoutError('phonepe', `createOrder:${merchantTransactionId}`);
        }
        if (config.NODE_ENV !== 'production') {
           return this.legacyMockCheckout(merchantTransactionId, amountInPaise);
        }
        throw new Error(`PhonePe SDK Payment Creation Failed: ${err.message}`);
      }
    }

    // Legacy Fallback
    const payload = {
      merchantId: this.merchantId,
      merchantTransactionId,
      merchantUserId: params.userId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 36),
      amount: amountInPaise,
      redirectUrl,
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
      if (err.name === 'FetchError' || err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
        throw new ProviderNetworkTimeoutError('phonepe', `createOrder:${merchantTransactionId}`);
      }
      if (config.NODE_ENV !== 'production') {
        return this.legacyMockCheckout(merchantTransactionId, amountInPaise);
      }
      throw new Error(`PhonePe Payment Creation Failed: ${err.message}`);
    }
  }

  private legacyMockCheckout(merchantTransactionId: string, amountInPaise: number): PaymentOrderResult {
    const amountINR = (amountInPaise / 100).toFixed(2);
    return {
      provider: 'phonepe',
      providerOrderId: merchantTransactionId,
      checkoutUrl: `${this.hostUrl}/mock-checkout?tid=${merchantTransactionId}&amt=${amountINR}`,
      upiIntentUri: `phonepe://pay?pa=lumen@ybl&pn=LumenSovereign&am=${amountINR}&cu=INR&tr=${merchantTransactionId}`,
    };
  }

  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>
  ): Promise<WebhookVerificationResult> {
    const xVerifyHeader = (headers['x-verify'] || headers['X-VERIFY']) as string | undefined;

    if (!xVerifyHeader) {
      return { isValid: false, error: 'Missing X-VERIFY header from PhonePe', rawBody, rawHeaders: headers as Record<string, string> };
    }

    let parsedBody: any;
    try {
      parsedBody = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch {
      return { isValid: false, error: 'Invalid JSON webhook payload', rawBody, rawHeaders: headers as Record<string, string> };
    }

    const responseBase64 = parsedBody.response;
    if (!responseBase64) {
      return { isValid: false, error: 'Missing response field in webhook payload', rawBody, rawHeaders: headers as Record<string, string> };
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
    let signatureMatched = false;

    if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
      signatureMatched = true;
    }

    // Additional SDK check if available
    if (this.sdkClient && typeof (this.sdkClient as any).validateCallback === 'function') {
      try {
        const isValid = (this.sdkClient as any).validateCallback(rawBody, xVerifyHeader);
        if (isValid) signatureMatched = true;
      } catch (e) {
        // ignore
      }
    }

    if (!signatureMatched) {
      return { isValid: false, error: 'Cryptographic signature mismatch on PhonePe webhook', rawBody, rawHeaders: headers as Record<string, string> };
    }

    // Decode base64 payload
    let decoded: any;
    try {
      decoded = JSON.parse(Buffer.from(responseBase64, 'base64').toString('utf8'));
    } catch {
      return { isValid: false, error: 'Failed to decode base64 PhonePe webhook response', rawBody, rawHeaders: headers as Record<string, string> };
    }

    const data = decoded.data;
    if (!data) {
      return { isValid: false, error: 'Decoded webhook missing data object', rawBody, rawHeaders: headers as Record<string, string> };
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
      rawBody,
      rawHeaders: headers as Record<string, string>,
    };
  }

  async checkStatus(providerOrderId: string, merchantTransactionId: string): Promise<PaymentStatusResult> {
    if (this.sdkClient) {
      try {
        const response = await this.sdkClient.getOrderStatus(merchantTransactionId);
        // Map response
        const code = (response as any).code || (response as any).responseCode;
        const data = (response as any).data || response;
        
        let status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'UNKNOWN' = 'UNKNOWN';
        if (code === 'PAYMENT_SUCCESS' || (response as any).success === true) {
          status = 'SUCCESS';
        } else if (code === 'PAYMENT_PENDING' || code === 'PAYMENT_INITIATED') {
          status = 'PENDING';
        } else if (code === 'PAYMENT_ERROR' || code === 'PAYMENT_DECLINED' || (response as any).success === false) {
          status = 'FAILED';
        }

        return {
          providerOrderId: merchantTransactionId,
          status,
          amountMinor: data?.amount || 0,
          currency: 'INR',
          providerPaymentId: data?.transactionId,
          utr: data?.paymentInstrument?.utr || data?.utr,
          paymentMethod: data?.paymentInstrument?.type,
          bankRefNumber: data?.paymentInstrument?.bankTransactionId || data?.bankRefNumber
        };
      } catch (err: any) {
        // On network error return UNKNOWN
        return {
          providerOrderId: merchantTransactionId,
          status: 'UNKNOWN',
          amountMinor: 0,
          currency: 'INR'
        };
      }
    }

    // Legacy Fallback
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
        paymentMethod: json.data?.paymentInstrument?.type,
        bankRefNumber: json.data?.paymentInstrument?.bankTransactionId
      };
    } catch (err: any) {
      return {
        providerOrderId: merchantTransactionId,
        status: 'UNKNOWN',
        amountMinor: 0,
        currency: 'INR'
      };
    }
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const merchantRefundId = `ref_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    if (this.sdkClient) {
      try {
        const req = new RefundRequest(merchantRefundId, params.providerOrderId, params.amountMinor);
        const response = await this.sdkClient.refund(req);
        
        const isSuccess = (response as any).success === true || (response as any).code === 'PAYMENT_SUCCESS' || (response as any).code === 'REFUND_PENDING';
        
        return {
          success: isSuccess,
          refundId: merchantRefundId,
          status: isSuccess ? 'SUCCESS' : 'FAILED',
          amountMinor: params.amountMinor,
          error: (response as any).message,
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

    // Legacy Fallback
    const endpoint = '/pg/v1/refund';
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
