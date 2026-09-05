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
  RefundStatusResult,
  ProviderNetworkTimeoutError,
} from './types';
import {
  StandardCheckoutClient,
  StandardCheckoutPayRequest,
  RefundRequest,
  Env,
} from '@phonepe-pg/pg-sdk-node';

export class PhonePeProductionAdapter implements PaymentProvider {
  name = 'phonepe';

  private saltKey: string;
  private saltIndex: string;
  private callbackUsername: string;
  private callbackPassword: string;
  private sdkClient: StandardCheckoutClient | null = null;

  constructor() {
    this.saltKey = config.PHONEPE_SALT_KEY;
    this.saltIndex = config.PHONEPE_SALT_INDEX;
    this.callbackUsername = config.PHONEPE_CALLBACK_USERNAME;
    this.callbackPassword = config.PHONEPE_CALLBACK_PASSWORD;

    if (config.PHONEPE_CLIENT_ID && config.PHONEPE_CLIENT_SECRET) {
      try {
        this.sdkClient = StandardCheckoutClient.getInstance(
          config.PHONEPE_CLIENT_ID,
          config.PHONEPE_CLIENT_SECRET,
          Number(config.PHONEPE_CLIENT_VERSION || 1),
          config.PHONEPE_ENV === 'PRODUCTION' ? Env.PRODUCTION : Env.SANDBOX
        );
      } catch (err: any) {
        console.error('Failed to initialize PhonePe StandardCheckoutClient:', err.message);
        this.sdkClient = null;
      }
    }
  }

  private getClient(): StandardCheckoutClient {
    if (!this.sdkClient) {
      throw new Error('PhonePe StandardCheckoutClient is not initialized. Please verify PhonePe credentials.');
    }
    return this.sdkClient;
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

    const client = this.getClient();

    try {
      const payRequest = StandardCheckoutPayRequest.builder()
        .merchantOrderId(merchantTransactionId)
        .amount(amountInPaise)
        .redirectUrl(redirectUrl)
        .message('Lumen Wallet Deposit')
        .build();

      const response = await client.pay(payRequest);

      const checkoutUrl = response?.redirectUrl;
      if (!checkoutUrl) {
        throw new Error('PhonePe PG did not return a valid checkout URL in pay response.');
      }

      return {
        provider: 'phonepe',
        providerOrderId: response.orderId || merchantTransactionId,
        checkoutUrl,
        additionalData: response as any,
      };
    } catch (err: any) {
      if (
        err.name === 'FetchError' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNRESET' ||
        /timeout|fetch|network|econnrefused/i.test(err.message)
      ) {
        throw new ProviderNetworkTimeoutError('phonepe', `createOrder:${merchantTransactionId}`);
      }
      throw new Error(`PhonePe Payment Creation Failed: ${err.message}`);
    }
  }

  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>
  ): Promise<WebhookVerificationResult> {
    const rawHeadersObj: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v === 'string') rawHeadersObj[k] = v;
      else if (Array.isArray(v)) rawHeadersObj[k] = v.join(', ');
    }

    const authHeader = (headers['authorization'] || headers['AUTHORIZATION']) as string | undefined;
    const xVerifyHeader = (headers['x-verify'] || headers['X-VERIFY']) as string | undefined;

    // 1. Primary verification: PhonePe SDK v2 callback validation via Authorization header
    if (authHeader && this.sdkClient) {
      try {
        const callbackResponse = this.sdkClient.validateCallback(
          this.callbackUsername,
          this.callbackPassword,
          authHeader,
          rawBody
        );

        if (callbackResponse && callbackResponse.payload) {
          const payload = callbackResponse.payload;
          const isSuccess = payload.state === 'COMPLETED';
          const isRefund = payload.state === 'REFUND_COMPLETED' || payload.state === 'REFUND_SUCCESS';

          return {
            isValid: true,
            eventId: payload.orderId || `evt_${payload.merchantOrderId || Date.now()}`,
            providerOrderId: payload.merchantOrderId || payload.orderId,
            providerPaymentId: payload.orderId,
            status: isSuccess ? 'captured' : isRefund ? 'refunded' : 'failed',
            amountMinor: payload.amount,
            currency: 'INR',
            rawPayload: callbackResponse as any,
            rawBody,
            rawHeaders: rawHeadersObj,
          };
        }
      } catch (sdkErr: any) {
        // If authorization fails via SDK validateCallback, check if X-VERIFY is provided as fallback
        if (!xVerifyHeader) {
          return {
            isValid: false,
            error: `PhonePe SDK Callback Validation Failed: ${sdkErr.message}`,
            rawBody,
            rawHeaders: rawHeadersObj,
          };
        }
      }
    }

    // 2. Secondary verification: SHA256 timing-safe checksum verification via X-VERIFY
    if (!xVerifyHeader) {
      return {
        isValid: false,
        error: 'Missing X-VERIFY or Authorization header from PhonePe callback',
        rawBody,
        rawHeaders: rawHeadersObj,
      };
    }

    let parsedBody: any;
    try {
      parsedBody = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch {
      return {
        isValid: false,
        error: 'Invalid JSON webhook payload',
        rawBody,
        rawHeaders: rawHeadersObj,
      };
    }

    const responseBase64 = parsedBody.response;
    if (!responseBase64) {
      return {
        isValid: false,
        error: 'Missing response field in webhook payload',
        rawBody,
        rawHeaders: rawHeadersObj,
      };
    }

    const expectedHash = crypto
      .createHash('sha256')
      .update(`${responseBase64}${this.saltKey}`)
      .digest('hex');
    const expectedXVerify = `${expectedHash}###${this.saltIndex}`;

    const sigBuf = Buffer.from(xVerifyHeader);
    const expBuf = Buffer.from(expectedXVerify);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return {
        isValid: false,
        error: 'Cryptographic signature mismatch on PhonePe webhook',
        rawBody,
        rawHeaders: rawHeadersObj,
      };
    }

    let decoded: any;
    try {
      decoded = JSON.parse(Buffer.from(responseBase64, 'base64').toString('utf8'));
    } catch {
      return {
        isValid: false,
        error: 'Failed to decode base64 PhonePe webhook response',
        rawBody,
        rawHeaders: rawHeadersObj,
      };
    }

    const data = decoded.data;
    if (!data) {
      return {
        isValid: false,
        error: 'Decoded webhook missing data object',
        rawBody,
        rawHeaders: rawHeadersObj,
      };
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
      rawHeaders: rawHeadersObj,
    };
  }

  async checkStatus(providerOrderId: string, merchantTransactionId: string): Promise<PaymentStatusResult> {
    const client = this.getClient();

    try {
      const response = await client.getOrderStatus(merchantTransactionId);

      let status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'UNKNOWN' = 'UNKNOWN';
      if (response.state === 'COMPLETED') {
        status = 'SUCCESS';
      } else if (response.state === 'PENDING') {
        status = 'PENDING';
      } else if (response.state === 'FAILED') {
        status = 'FAILED';
      }

      const latestPayment = response.paymentDetails && response.paymentDetails.length > 0
        ? response.paymentDetails[response.paymentDetails.length - 1]
        : undefined;

      const upiRail = (latestPayment?.rail && 'utr' in (latestPayment.rail as any))
        ? (latestPayment.rail as any)
        : undefined;
      const pgRail = (latestPayment?.rail && 'serviceTransactionId' in (latestPayment.rail as any))
        ? (latestPayment.rail as any)
        : undefined;

      return {
        providerOrderId: merchantTransactionId,
        status,
        amountMinor: response.amount || 0,
        currency: 'INR',
        providerPaymentId: response.orderId,
        utr: upiRail?.utr,
        vpa: upiRail?.vpa,
        paymentMethod: latestPayment?.paymentMode || (upiRail ? 'UPI' : undefined),
        bankRefNumber: pgRail?.serviceTransactionId || pgRail?.transactionId || upiRail?.upiTransactionId,
      };
    } catch (err: any) {
      return {
        providerOrderId: merchantTransactionId,
        status: 'UNKNOWN',
        amountMinor: 0,
        currency: 'INR',
      };
    }
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const merchantRefundId = `ref_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const client = this.getClient();

    try {
      const req = RefundRequest.builder()
        .merchantRefundId(merchantRefundId)
        .originalMerchantOrderId(params.providerOrderId)
        .amount(params.amountMinor)
        .build();

      const response = await client.refund(req);

      let status: 'SUCCESS' | 'PENDING' | 'FAILED' = 'PENDING';
      let success = true;

      if (response.state === 'COMPLETED') {
        status = 'SUCCESS';
        success = true;
      } else if (response.state === 'PENDING') {
        status = 'PENDING';
        success = true;
      } else {
        status = 'FAILED';
        success = false;
      }

      return {
        success,
        refundId: response.refundId || merchantRefundId,
        status,
        amountMinor: response.amount || params.amountMinor,
      };
    } catch (err: any) {
      if (
        err.name === 'FetchError' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNRESET' ||
        /timeout|fetch|network|econnrefused/i.test(err.message)
      ) {
        throw new ProviderNetworkTimeoutError('phonepe', `refund:${merchantRefundId}`);
      }
      return {
        success: false,
        refundId: merchantRefundId,
        status: 'FAILED',
        amountMinor: params.amountMinor,
        error: err.message,
      };
    }
  }

  async checkRefundStatus(refundId: string): Promise<RefundStatusResult> {
    const client = this.getClient();
    try {
      const response = await client.getRefundStatus(refundId);
      let status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'UNKNOWN' = 'UNKNOWN';
      if (response.state === 'COMPLETED') {
        status = 'SUCCESS';
      } else if (response.state === 'PENDING') {
        status = 'PENDING';
      } else if (response.state === 'FAILED') {
        status = 'FAILED';
      }

      return {
        status,
        providerRefundId: refundId,
        amountMinor: response.amount,
      };
    } catch (err: any) {
      if (
        err.name === 'FetchError' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNRESET' ||
        /timeout|fetch|network|econnrefused/i.test(err.message)
      ) {
        return { status: 'UNKNOWN', providerRefundId: refundId, error: err.message };
      }
      return { status: 'FAILED', providerRefundId: refundId, error: err.message };
    }
  }
}
