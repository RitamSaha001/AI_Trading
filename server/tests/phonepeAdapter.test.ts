import { describe, it, expect } from 'vitest';
import { PhonePeProductionAdapter } from '../services/payments/phonepeAdapter';
import crypto from 'node:crypto';

describe('PhonePe Production Adapter', () => {
  const adapter = new PhonePeProductionAdapter();

  describe('Checksum Generation', () => {
    it('generates correct X-VERIFY checksum', () => {
      const base64 = Buffer.from(JSON.stringify({ test: 'data' })).toString('base64');
      const endpoint = '/pg/v1/pay';
      const checksum = adapter.calculateChecksum(base64, endpoint);
      // Must match format: sha256hex###saltIndex
      expect(checksum).toMatch(/^[a-f0-9]{64}###\d+$/);
    });

    it('produces deterministic checksums for identical inputs', () => {
      const base64 = 'dGVzdA==';
      const endpoint = '/pg/v1/pay';
      const c1 = adapter.calculateChecksum(base64, endpoint);
      const c2 = adapter.calculateChecksum(base64, endpoint);
      expect(c1).toBe(c2);
    });
  });

  describe('Webhook Verification', () => {
    const saltKey = '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399';
    const saltIndex = '1';

    function createValidWebhook(merchantTransactionId: string, amount: number) {
      const responsePayload = {
        success: true,
        code: 'PAYMENT_SUCCESS',
        message: 'Payment successful',
        data: {
          merchantId: 'PGTESTPAYUAT',
          merchantTransactionId,
          transactionId: `TXN_${Date.now()}`,
          amount,
          state: 'COMPLETED',
          responseCode: 'SUCCESS',
          paymentInstrument: { type: 'UPI', utr: '123456789012' },
        },
      };
      const responseBase64 = Buffer.from(JSON.stringify(responsePayload)).toString('base64');
      const hash = crypto.createHash('sha256').update(`${responseBase64}${saltKey}`).digest('hex');
      const xVerify = `${hash}###${saltIndex}`;
      return { body: JSON.stringify({ response: responseBase64 }), xVerify };
    }

    it('accepts valid authentic webhook with correct X-VERIFY', async () => {
      const { body, xVerify } = createValidWebhook('test_order_001', 50000);
      const result = await adapter.verifyWebhook(body, { 'x-verify': xVerify });
      expect(result.isValid).toBe(true);
      expect(result.status).toBe('captured');
      expect(result.amountMinor).toBe(50000);
    });

    it('rejects webhook with missing X-VERIFY header', async () => {
      const { body } = createValidWebhook('test_order_002', 50000);
      const result = await adapter.verifyWebhook(body, {});
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Missing X-VERIFY');
    });

    it('rejects webhook with tampered payload', async () => {
      const { body, xVerify } = createValidWebhook('test_order_003', 50000);
      const tampered = body
        .replace('test_order_003', 'TAMPERED_ORDER')
        .replace(/"response":"(\w{10})/, '"response":"TAMPERED99');
      const result = await adapter.verifyWebhook(tampered, { 'x-verify': xVerify });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('signature mismatch');
    });

    it('rejects webhook with invalid signature', async () => {
      const { body } = createValidWebhook('test_order_004', 50000);
      const fakeXVerify = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890###1';
      const result = await adapter.verifyWebhook(body, { 'x-verify': fakeXVerify });
      expect(result.isValid).toBe(false);
    });

    it('rejects webhook with malformed JSON payload', async () => {
      const result = await adapter.verifyWebhook('not json', { 'x-verify': 'dummy###1' });
      expect(result.isValid).toBe(false);
    });

    it('rejects webhook missing response field', async () => {
      const body = JSON.stringify({ noResponse: true });
      const result = await adapter.verifyWebhook(body, { 'x-verify': 'dummy###1' });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Missing response');
    });
  });

  describe('Payment Flow', () => {
    it('rejects non-INR currency', async () => {
      await expect(adapter.createOrder({
        userId: 'usr_test',
        orderId: 'ord_test',
        amountMinor: 50000,
        currency: 'USD' as any,
        method: 'upi',
      })).rejects.toThrow(/INR/);
    });
  });
});
