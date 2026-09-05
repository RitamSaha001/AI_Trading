import { describe, it, expect, beforeEach } from 'vitest';
import { buildServer } from '../index';
import { ServerAuthService } from '../services/authService';
import { PaymentService } from '../services/paymentService';
import { getDb } from '../db';

describe('Payment HTTP Routes & Admin Trust Boundary', () => {
  let server: ReturnType<typeof buildServer>;
  const regularUserId = 'usr_route_test_reg_001';
  const adminUserId = 'usr_route_test_adm_001';
  let regularToken: string;
  let adminToken: string;

  beforeEach(async () => {
    const db = getDb();
    await db.execute('DELETE FROM payment_refunds');
    await db.execute('DELETE FROM payment_settlements');
    await db.execute('DELETE FROM payment_attempts');
    await db.execute('DELETE FROM payments');
    await db.execute('DELETE FROM payment_orders');
    await db.execute('DELETE FROM payment_webhooks');
    await db.execute('DELETE FROM ledger_entries');
    await db.execute('DELETE FROM ledger_accounts');
    await db.execute('DELETE FROM sessions');
    await db.execute('DELETE FROM users');

    // Create regular user
    const regUser = await ServerAuthService.getOrCreateUser({
      email: 'trader@client.com',
      displayName: 'Regular Trader',
      provider: 'email',
      providerId: 'prov_reg_001',
    });
    const regSession = await ServerAuthService.createSession(regUser.id, '127.0.0.1', 'Vitest');
    regularToken = regSession.rawToken;

    // Create admin user
    const admUser = await ServerAuthService.getOrCreateUser({
      email: 'admin@lumen.io',
      displayName: 'Compliance Auditor',
      provider: 'email',
      providerId: 'prov_adm_001',
    });
    await db.execute(`UPDATE users SET role = 'FINANCE_ADMIN' WHERE id = ?`, [admUser.id]);
    const admSession = await ServerAuthService.createSession(admUser.id, '127.0.0.1', 'Vitest');
    adminToken = admSession.rawToken;

    server = buildServer();
  });

  describe('POST /api/payments/create-intent', () => {
    it('validates request body via Zod and rejects invalid currencies or non-integer amounts', async () => {
      // Invalid currency
      const res1 = await server.inject({
        method: 'POST',
        url: '/api/payments/create-intent',
        headers: { authorization: `Bearer ${regularToken}` },
        payload: {
          amountMinor: 5000,
          currency: 'EUR', // Only USD and INR are supported
          method: 'card',
          idempotencyKey: 'idemp_route_val_1',
        },
      });
      expect(res1.statusCode).toBe(400);
      expect(res1.json().success).toBe(false);

      // Non-integer amount
      const res2 = await server.inject({
        method: 'POST',
        url: '/api/payments/create-intent',
        headers: { authorization: `Bearer ${regularToken}` },
        payload: {
          amountMinor: 50.55,
          currency: 'USD',
          method: 'card',
          idempotencyKey: 'idemp_route_val_2',
        },
      });
      expect(res2.statusCode).toBe(400);
      expect(res2.json().success).toBe(false);

      // Negative amount
      const res3 = await server.inject({
        method: 'POST',
        url: '/api/payments/create-intent',
        headers: { authorization: `Bearer ${regularToken}` },
        payload: {
          amountMinor: -100,
          currency: 'USD',
          method: 'card',
          idempotencyKey: 'idemp_route_val_3',
        },
      });
      expect(res3.statusCode).toBe(400);
      expect(res3.json().success).toBe(false);

      // Valid intent creation
      const res4 = await server.inject({
        method: 'POST',
        url: '/api/payments/create-intent',
        headers: { authorization: `Bearer ${regularToken}` },
        payload: {
          amountMinor: 10000,
          currency: 'USD',
          method: 'card',
          idempotencyKey: 'idemp_route_val_4',
        },
      });
      expect(res4.statusCode).toBe(200);
      expect(res4.json().success).toBe(true);
      expect(res4.json().intent.orderId).toBeDefined();
    });
  });

  describe('POST /api/payments/submit-utr', () => {
    it('validates Indian UTR format via Zod and records pending manual settlement', async () => {
      // Invalid UTR (symbols)
      const res1 = await server.inject({
        method: 'POST',
        url: '/api/payments/submit-utr',
        headers: { authorization: `Bearer ${regularToken}` },
        payload: {
          utr: 'UTR@#$$!123',
          amountINR: 500,
        },
      });
      expect(res1.statusCode).toBe(400);

      // Too short
      const res2 = await server.inject({
        method: 'POST',
        url: '/api/payments/submit-utr',
        headers: { authorization: `Bearer ${regularToken}` },
        payload: {
          utr: '1234',
          amountINR: 500,
        },
      });
      expect(res2.statusCode).toBe(400);

      // Valid UTR
      const res3 = await server.inject({
        method: 'POST',
        url: '/api/payments/submit-utr',
        headers: { authorization: `Bearer ${regularToken}` },
        payload: {
          utr: '429512345678',
          amountINR: 5000,
        },
      });
      expect(res3.statusCode).toBe(200);
      const json3 = res3.json();
      expect(json3.success).toBe(true);
      expect(json3.status).toBe('pending_manual_settlement');
      expect(json3.paymentId).toBeDefined();
    });
  });

  describe('POST /api/admin/payments/reconcile-utr', () => {
    it('strictly guards manual settlement reconciliation: blocks unauthenticated and regular users, allows admin', async () => {
      // 1. Regular user submits UTR
      const submitRes = await server.inject({
        method: 'POST',
        url: '/api/payments/submit-utr',
        headers: { authorization: `Bearer ${regularToken}` },
        payload: {
          utr: '987654321012',
          amountINR: 2500,
        },
      });
      expect(submitRes.statusCode).toBe(200);
      const paymentId = submitRes.json().paymentId;

      // 2. Unauthenticated caller blocked with 401
      const resUnauth = await server.inject({
        method: 'POST',
        url: '/api/admin/payments/reconcile-utr',
        payload: {
          paymentId,
          bankReference: 'HDFC_TXN_998877',
        },
      });
      expect(resUnauth.statusCode).toBe(401);

      // 3. Regular trader blocked with 403 (insufficient administrative privilege)
      const resForbidden = await server.inject({
        method: 'POST',
        url: '/api/admin/payments/reconcile-utr',
        headers: { authorization: `Bearer ${regularToken}` },
        payload: {
          paymentId,
          bankReference: 'HDFC_TXN_998877',
        },
      });
      expect(resForbidden.statusCode).toBe(403);
      expect(resForbidden.json().error).toMatch(/Access denied|administrative or compliance/i);

      // 4. Authorized admin successfully reconciles and authoritatively settles
      const resAdmin = await server.inject({
        method: 'POST',
        url: '/api/admin/payments/reconcile-utr',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          paymentId,
          bankReference: 'HDFC_TXN_998877',
        },
      });
      expect(resAdmin.statusCode).toBe(200);
      expect(resAdmin.json().success).toBe(true);
      expect(resAdmin.json().cleared).toBe(true);
    });
  });
});
