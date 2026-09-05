export type PaymentOrderStatus = 
  | 'CREATED'
  | 'INITIATING'
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'UNKNOWN_PROVIDER_STATE'
  | 'REFUND_PENDING'
  | 'REFUND_UNKNOWN'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export class IdempotencyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

export interface CreatePaymentIntentParams {
  userId: string;
  orderId: string;
  amountMinor: number; // in paise for INR, cents for USD
  currency: 'INR' | 'USD';
  method: 'upi' | 'card';
  redirectUrl?: string;
  callbackUrl?: string;
}

export interface PaymentOrderResult {
  provider: string;
  providerOrderId: string;
  checkoutUrl?: string;
  upiIntentUri?: string;
  qrPayload?: string;
  additionalData?: Record<string, any>;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  error?: string;
  eventId?: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  status?: 'captured' | 'failed' | 'refunded';
  amountMinor?: number;
  currency?: string;
  rawPayload?: Record<string, any>;
  rawBody?: string;
  rawHeaders?: Record<string, string>;
}

export interface PaymentStatusResult {
  providerOrderId: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'UNKNOWN';
  amountMinor: number;
  currency: string;
  providerPaymentId?: string;
  utr?: string;
  bankRefNumber?: string;
  paymentMethod?: string; // 'UPI' | 'CARD' | 'NETBANKING'
  cardBrand?: string;
  vpa?: string;
}

export class ProviderNetworkTimeoutError extends Error {
  constructor(provider: string, operationId: string) {
    super(`Provider '${provider}' network timeout for operation '${operationId}'`);
    this.name = 'ProviderNetworkTimeoutError';
  }
}

export type SettlementSource = 'WEBHOOK' | 'STATUS_POLL' | 'RECONCILIATION_SWEEP' | 'MANUAL_BANK_RECONCILIATION';

export interface RefundParams {
  providerOrderId: string;
  providerPaymentId?: string;
  amountMinor: number;
  reason: string;
  idempotencyKey: string;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  amountMinor: number;
  error?: string;
}

export interface PaymentProvider {
  name: string;
  createOrder(params: CreatePaymentIntentParams): Promise<PaymentOrderResult>;
  verifyWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<WebhookVerificationResult>;
  checkStatus(providerOrderId: string, merchantTransactionId: string): Promise<PaymentStatusResult>;
  refund(params: RefundParams): Promise<RefundResult>;
}
