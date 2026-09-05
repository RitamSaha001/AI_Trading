import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import sensible from '@fastify/sensible';
import { config, auditServerSecurityConfig } from './config';
import { getDb, initDb, closeDb, getMigrationStatus } from './db';
import { ServerAuthService } from './services/authService';
import { requireAuth, requireActive, requireKYC, requireAdmin, extractSessionToken, verifyOriginOrCsrf, authenticate } from './middleware/authMiddleware';
import { isValidAllowedOrigin } from './utils/originValidator';
import { z } from 'zod';
import { AuthRateLimiter } from './middleware/rateLimiter';
import { LedgerService } from './services/ledgerService';
import { PaymentService } from './services/paymentService';
import { BinanceGateway } from './services/binanceGateway';
import { ServerRiskEngine } from './services/riskEngine';
import { ReconciliationWorker } from './services/reconciliationWorker';
import { OrderRecoveryService } from './services/orderRecoveryService';
import crypto from 'node:crypto';
import { SymbolRulesService } from './services/symbolRules';
import { AuditService, logger } from './services/auditService';
import { OperationalSafetyService } from './services/operationalSafetyService';
import { CircuitBreakerService } from './services/circuitBreakerService';
import { ClockSyncService } from './services/clockSyncService';
import { RateLimitTracker } from './services/rateLimitTracker';
import { UserDataStreamManager } from './services/userDataStreamManager';

let isShuttingDown = false;

export function getIsShuttingDown(): boolean {
  return isShuttingDown;
}

export function resetShuttingDownForTesting(): void {
  isShuttingDown = false;
}

export async function shutdownServer(server?: FastifyInstance): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info('Graceful shutdown initiated: stopping background workers and active connections...');

  // 1. Stop background workers
  try {
    ReconciliationWorker.stop();
    OrderRecoveryService.stop();
    ClockSyncService.stop();
    UserDataStreamManager.stop();
  } catch (err: any) {
    logger.warn('Error stopping background workers:', err.message);
  }

  // 2. Stop accepting new HTTP connections
  if (server) {
    try {
      await server.close();
      logger.info('HTTP server closed cleanly.');
    } catch (err: any) {
      logger.warn('Error closing HTTP server:', err.message);
    }
  }

  // 3. Disconnect exchange WebSockets
  try {
    await BinanceGateway.closeAllConnections();
  } catch (err: any) {
    logger.warn('Error closing exchange connections:', err.message);
  }

  // 4. Close database connection pool
  try {
    await closeDb();
    logger.info('Database connections closed cleanly.');
  } catch (err: any) {
    logger.warn('Error closing database connection pool:', err.message);
  }

  logger.info('Graceful shutdown complete.');
}

export function buildServer(): FastifyInstance {
  const server = Fastify({
    logger: false, // We use our own pino logger in AuditService
  });

  server.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as any).rawBody = (body as Buffer).toString('utf8');
    try {
      const json = JSON.parse((req as any).rawBody);
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  server.register(sensible);

  // Strict Fail-Closed CORS Configuration
  server.register(cors, {
    origin: (origin, cb) => {
      // Non-browser or server-to-server requests without Origin pass through CORS
      if (!origin) {
        cb(null, true);
        return;
      }
      const isAllowed = isValidAllowedOrigin(origin, config.NODE_ENV, config.ALLOWED_ORIGINS);
      if (isAllowed) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    credentials: true,
  });

  // Cookie Support
  server.register(cookie, {
    secret: config.SESSION_SECRET,
    parseOptions: {},
  });

  // Helper: Secure HttpOnly Session Cookie setter
  const setSessionCookie = (reply: FastifyReply, rawToken: string) => {
    reply.setCookie('lumen_session', rawToken, {
      path: '/',
      httpOnly: true,
      secure: config.NODE_ENV === 'production' || config.NODE_ENV === 'staging',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    });
  };

  // Global In-Flight Request Guard & CSRF / Origin Verification
  server.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    // Health probes are always permitted
    if (req.url.startsWith('/health') || req.url === '/healthz' || req.url === '/ready' || req.url === '/api/health') {
      return;
    }
    if (isShuttingDown) {
      return reply.status(503).send({
        success: false,
        error: 'Server is currently undergoing graceful shutdown. Please retry on another active instance.',
      });
    }
    // Webhook routes use dedicated cryptographic HMAC signature verification
    if (req.url.startsWith('/api/webhooks/')) return;
    await verifyOriginOrCsrf(req, reply);
  });

  // Liveness Probes (Container process is alive and responsive)
  const livenessHandler = async () => ({
    status: 'UP',
    env: config.NODE_ENV,
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
  server.get('/health/liveness', livenessHandler);
  server.get('/healthz', livenessHandler);

  // Readiness Probes (Database reachable, Postgres strictly verified in prod, schema migrations at latest version)
  const readinessHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
    if (isShuttingDown) {
      return reply.status(503).send({
        status: 'DOWN',
        ready: false,
        issues: ['Server is currently shutting down'],
        timestamp: Date.now(),
      });
    }

    try {
      const db = getDb();
      // 1. Verify database ping
      await db.queryOne('SELECT 1 as ping');

      // 2. Verify PostgreSQL mandatory requirement in production
      if (config.NODE_ENV === 'production' && !db.isPostgres()) {
        return reply.status(503).send({
          status: 'DOWN',
          ready: false,
          issues: ['Production mode strictly requires a PostgreSQL database instance'],
          timestamp: Date.now(),
        });
      }

      // 3. Verify schema migration version alignment
      const migStatus = await getMigrationStatus(db);
      if (!migStatus.isUpToDate) {
        return reply.status(503).send({
          status: 'DOWN',
          ready: false,
          issues: [`Database schema is not at expected migration version (pending: ${migStatus.pending.join(', ')})`],
          latestVersion: migStatus.latestVersion,
          timestamp: Date.now(),
        });
      }

      return {
        status: 'READY',
        ready: true,
        env: config.NODE_ENV,
        engine: db.getEngine(),
        schemaVersion: migStatus.latestVersion,
        timestamp: Date.now(),
      };
    } catch (err: any) {
      return reply.status(503).send({
        status: 'DOWN',
        ready: false,
        issues: [err.message],
        timestamp: Date.now(),
      });
    }
  };

  server.get('/health/readiness', readinessHandler);
  server.get('/ready', readinessHandler);
  server.get('/health', readinessHandler);
  server.get('/api/health', readinessHandler);

  // ==========================================================================
  // AUTHENTICATION ROUTES (Phase 2 & Phase 3)
  // ==========================================================================

  server.post('/api/auth/google', async (req: FastifyRequest, reply: FastifyReply) => {
    const ip = req.ip || '127.0.0.1';
    if (!AuthRateLimiter.isAllowed(`auth_oauth_${ip}`, 30, 60_000)) {
      return reply.status(429).send({ success: false, error: 'Too many authentication attempts. Please try again later.' });
    }

    const body = req.body as { credential?: string; idToken?: string };
    const credential = body?.credential || body?.idToken;
    if (!credential) {
      return reply.status(400).send({ success: false, error: 'Google credential token is required' });
    }

    try {
      const verified = await ServerAuthService.verifyGoogleIdToken(credential);
      const user = await ServerAuthService.getOrCreateUser({
        email: verified.email,
        displayName: verified.name || 'Investor',
        photoUrl: verified.picture,
        provider: 'google',
        providerId: verified.sub,
      });

      const session = await ServerAuthService.createSession(
        user.id,
        req.headers['user-agent'] || 'Browser',
        req.ip
      );

      setSessionCookie(reply, session.rawToken);

      await AuditService.logEvent({
        userId: user.id,
        eventType: 'LOGIN_SUCCESS',
        source: 'auth_service',
        actor: 'user',
        metadata: { provider: 'google', email: user.email },
        result: 'SUCCESS',
      });

      // Browser receives ONLY user/session metadata; raw session token is NEVER returned in JSON
      return { success: true, user };
    } catch (err: any) {
      await AuditService.logEvent({
        eventType: 'LOGIN_FAILURE',
        source: 'auth_service',
        actor: 'user',
        metadata: { provider: 'google' },
        result: 'FAILURE',
        error: err.message,
      });

      const isConflict = err.message?.startsWith('ACCOUNT_PROVIDER_CONFLICT');
      const clientError = isConflict
        ? err.message
        : 'Google authentication failed. Please verify your credentials.';
      return reply.status(401).send({ success: false, error: clientError });
    }
  });

  server.post('/api/auth/apple', async (req: FastifyRequest, reply: FastifyReply) => {
    const ip = req.ip || '127.0.0.1';
    if (!AuthRateLimiter.isAllowed(`auth_oauth_${ip}`, 30, 60_000)) {
      return reply.status(429).send({ success: false, error: 'Too many authentication attempts. Please try again later.' });
    }

    const body = req.body as { identityToken?: string; nonce?: string; displayName?: string };
    if (!body?.identityToken) {
      return reply.status(400).send({ success: false, error: 'Apple identity token is required' });
    }

    try {
      const verified = await ServerAuthService.verifyAppleIdToken(body.identityToken, body.nonce);
      const email = verified.email || `apple_user_${verified.sub.slice(0, 8)}@privaterelay.appleid.com`;

      const user = await ServerAuthService.getOrCreateUser({
        email,
        displayName: body.displayName || 'Apple Investor',
        provider: 'apple',
        providerId: verified.sub,
      });

      const session = await ServerAuthService.createSession(
        user.id,
        req.headers['user-agent'] || 'Browser',
        req.ip
      );

      setSessionCookie(reply, session.rawToken);

      await AuditService.logEvent({
        userId: user.id,
        eventType: 'LOGIN_SUCCESS',
        source: 'auth_service',
        actor: 'user',
        metadata: { provider: 'apple', email: user.email },
        result: 'SUCCESS',
      });

      // Browser receives ONLY user/session metadata; raw session token is NEVER returned in JSON
      return { success: true, user };
    } catch (err: any) {
      await AuditService.logEvent({
        eventType: 'LOGIN_FAILURE',
        source: 'auth_service',
        actor: 'user',
        metadata: { provider: 'apple' },
        result: 'FAILURE',
        error: err.message,
      });

      const isConflict = err.message?.startsWith('ACCOUNT_PROVIDER_CONFLICT');
      const clientError = isConflict
        ? err.message
        : 'Apple authentication failed. Please verify your credentials.';
      return reply.status(401).send({ success: false, error: clientError });
    }
  });

  // Passwordless Email Challenge Request
  server.post('/api/auth/email/request', async (req: FastifyRequest, reply: FastifyReply) => {
    const ip = req.ip || '127.0.0.1';
    const body = req.body as { email?: string };
    if (!body?.email) {
      return reply.status(400).send({ success: false, error: 'Valid email address required' });
    }

    const cleanEmail = body.email.trim().toLowerCase();
    if (!AuthRateLimiter.isAllowed(`email_req_ip_${ip}`, 5, 60_000) ||
        !AuthRateLimiter.isAllowed(`email_req_em_${cleanEmail}`, 5, 60_000)) {
      return reply.status(429).send({ success: false, error: 'Too many email verification requests. Please try again later.' });
    }

    try {
      const challengeResult = await ServerAuthService.requestEmailChallenge(cleanEmail, config.NODE_ENV);
      return { success: true, message: challengeResult.message, ...(challengeResult.testCode ? { testCode: challengeResult.testCode } : {}) };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Passwordless Email Challenge Verification
  server.post('/api/auth/email/verify', async (req: FastifyRequest, reply: FastifyReply) => {
    const ip = req.ip || '127.0.0.1';
    const body = req.body as { email?: string; code?: string };
    if (!body?.email || !body?.code) {
      return reply.status(400).send({ success: false, error: 'Email and verification code are required' });
    }

    if (!AuthRateLimiter.isAllowed(`email_ver_ip_${ip}`, 10, 60_000)) {
      return reply.status(429).send({ success: false, error: 'Too many verification attempts. Please try again later.' });
    }

    try {
      const user = await ServerAuthService.verifyEmailChallenge(body.email, body.code, config.NODE_ENV);
      const session = await ServerAuthService.createSession(
        user.id,
        req.headers['user-agent'] || 'Browser',
        req.ip
      );

      setSessionCookie(reply, session.rawToken);

      await AuditService.logEvent({
        userId: user.id,
        eventType: 'LOGIN_SUCCESS',
        source: 'auth_service',
        actor: 'user',
        metadata: { provider: 'email', email: user.email },
        result: 'SUCCESS',
      });

      return { success: true, user };
    } catch (err: any) {
      return reply.status(401).send({ success: false, error: err.message });
    }
  });

  // Direct passwordless email login (Disabled in production; dev/test only)
  server.post('/api/auth/email', async (req: FastifyRequest, reply: FastifyReply) => {
    if (config.NODE_ENV === 'production') {
      return reply.status(403).send({
        success: false,
        error: 'Direct email login is disabled in production. Please request a verification challenge via /api/auth/email/request.',
      });
    }

    const body = req.body as { email: string; displayName?: string };
    if (!body?.email || !body.email.includes('@')) {
      return reply.status(400).send({ success: false, error: 'Valid email address required' });
    }

    try {
      const user = await ServerAuthService.getOrCreateUser({
        email: body.email,
        displayName: body.displayName || body.email.split('@')[0],
        provider: 'email',
        providerId: `email_${crypto.createHash('sha256').update(body.email.toLowerCase()).digest('hex').slice(0, 16)}`,
      });

      const session = await ServerAuthService.createSession(
        user.id,
        req.headers['user-agent'] || 'Browser',
        req.ip
      );

      setSessionCookie(reply, session.rawToken);
      return { success: true, user };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.get('/api/auth/me', { preHandler: requireAuth }, async (req: FastifyRequest) => {
    return { success: true, user: req.user };
  });

  server.post('/api/auth/logout', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = extractSessionToken(req);
    if (token) {
      await ServerAuthService.revokeSession(token);
    }
    reply.clearCookie('lumen_session', { path: '/' });
    return { success: true };
  });

  server.post('/api/auth/emergency-freeze', { preHandler: requireAuth }, async (req: FastifyRequest) => {
    await ServerAuthService.emergencyFreezeUser(req.user!.id, 'User manually activated emergency freeze');
    return { success: true, message: 'Emergency freeze activated. All trading and withdrawals halted.' };
  });

  // ==========================================================================
  // WALLET & DOUBLE-ENTRY LEDGER (Phase 6, 23, 24)
  // ==========================================================================

  server.get('/api/wallet/balances', { preHandler: requireAuth }, async (req: FastifyRequest) => {
    const query = req.query as { mode?: 'live' | 'paper' };
    const mode = query?.mode === 'paper' ? 'paper' : 'live';
    const balances = await LedgerService.getUserBalances(req.user!.id, mode);
    return { success: true, balances };
  });

  server.get('/api/accounting/summary', { preHandler: requireAuth }, async (req: FastifyRequest) => {
    const query = req.query as { mode?: 'live' | 'paper' };
    const mode = query?.mode === 'paper' ? 'paper' : 'live';
    const summary = await LedgerService.getAuthoritativeProjection(req.user!.id, mode);
    return { success: true, summary };
  });

  server.post('/api/accounting/replay', { preHandler: requireAuth }, async (req: FastifyRequest) => {
    const query = req.query as { mode?: 'live' | 'paper' };
    const mode = query?.mode === 'paper' ? 'paper' : 'live';
    const verification = await LedgerService.replayAccountState(req.user!.id, mode);
    return { success: true, verification };
  });

  server.get('/api/wallet/ledger', { preHandler: requireAuth }, async (req: FastifyRequest) => {
    const query = req.query as { mode?: 'live' | 'paper' };
    const mode = query?.mode === 'paper' ? 'paper' : 'live';
    const db = getDb();
    const entries = await db.query(
      `SELECT * FROM ledger_entries WHERE user_id = ? AND account_mode = ? ORDER BY created_at DESC LIMIT 100`,
      [req.user!.id, mode]
    );
    return { success: true, entries };
  });

  server.post('/api/wallet/allocate', { preHandler: requireActive }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { amountUSD: number; idempotencyKey?: string };
    if (!body?.amountUSD || body.amountUSD <= 0) {
      return reply.status(400).send({ success: false, error: 'Positive allocation amount required' });
    }

    const amountCents = Math.round(body.amountUSD * 100);
    try {
      const result = await LedgerService.transfer({
        userId: req.user!.id,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USD',
        amountMinor: amountCents,
        referenceType: 'allocation',
        referenceId: `alloc_${Date.now()}`,
        description: `Allocate $${body.amountUSD.toFixed(2)} to Trading Desk`,
        idempotencyKey: body.idempotencyKey,
      });
      return { success: true, result };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.post('/api/wallet/recall', { preHandler: requireActive }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { amountUSD: number; idempotencyKey?: string };
    if (!body?.amountUSD || body.amountUSD <= 0) {
      return reply.status(400).send({ success: false, error: 'Positive recall amount required' });
    }

    const amountCents = Math.round(body.amountUSD * 100);
    try {
      const result = await LedgerService.transfer({
        userId: req.user!.id,
        fromAccountType: 'trading_allocated',
        toAccountType: 'sovereign_cash',
        assetOrCurrency: 'USD',
        amountMinor: amountCents,
        referenceType: 'recall',
        referenceId: `recall_${Date.now()}`,
        description: `Recall $${body.amountUSD.toFixed(2)} to Sovereign Wallet`,
        idempotencyKey: body.idempotencyKey,
      });
      return { success: true, result };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.post('/api/wallet/withdraw', { preHandler: requireKYC('tier2_verified') }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { amount: number; currency: 'USD' | 'INR'; method: 'card' | 'upi' | 'bank'; pin?: string };
    if (!body?.amount || body.amount <= 0) {
      return reply.status(400).send({ success: false, error: 'Positive withdrawal amount required' });
    }

    const amountMinor = Math.round(body.amount * 100);
    try {
      // Execute debit from sovereign cash to reserve_escrow
      const result = await LedgerService.transfer({
        userId: req.user!.id,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'reserve_escrow',
        assetOrCurrency: body.currency,
        amountMinor,
        referenceType: 'withdrawal',
        referenceId: `wth_${Date.now()}`,
        description: `Withdrawal of ${body.amount} ${body.currency} to ${body.method.toUpperCase()}`,
      });
      return {
        success: true,
        message: 'Withdrawal authorization initiated. Bank clearance processing.',
        result,
      };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // ==========================================================================
  // PAYMENTS & WEBHOOKS (Phase 4, Phase 5, Phase 22)
  // ==========================================================================

  const CreateIntentSchema = z.object({
    amountMinor: z.number().int().positive('Amount must be a positive integer in minor units'),
    currency: z.enum(['USD', 'INR']),
    method: z.enum(['card', 'upi']),
    idempotencyKey: z.string().min(1).max(256),
  });

  server.post('/api/payments/create-intent', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = CreateIntentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: parseResult.error.issues[0]?.message || 'Invalid payment intent parameters',
      });
    }

    const body = parseResult.data;
    try {
      const intent = await PaymentService.createPaymentOrder({
        userId: req.user!.id,
        amountMinor: body.amountMinor,
        currency: body.currency,
        method: body.method,
        idempotencyKey: body.idempotencyKey,
      });
      return { success: true, intent };
    } catch (err: any) {
      if (err.name === 'IdempotencyConflictError') {
        return reply.status(409).send({ success: false, error: err.message });
      }
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  const SubmitUtrSchema = z.object({
    utr: z.string().trim().min(6, 'UTR must be at least 6 characters').max(30, 'UTR must not exceed 30 characters').regex(/^[a-zA-Z0-9]+$/, 'UTR must be alphanumeric'),
    amountINR: z.number().positive('amountINR must be positive'),
    orderId: z.string().min(1).optional(),
  });

  server.post('/api/payments/submit-utr', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = SubmitUtrSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: parseResult.error.issues[0]?.message || 'Invalid UTR submission parameters',
      });
    }

    const body = parseResult.data;
    try {
      const result = await PaymentService.submitManualUTR({
        userId: req.user!.id,
        utr: body.utr,
        amountINR: body.amountINR,
        orderId: body.orderId,
      });
      return { success: true, ...result };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Authoritative Webhook endpoint
  server.post('/api/webhooks/payments', async (req: FastifyRequest, reply: FastifyReply) => {
    const signature = req.headers['x-webhook-signature'] as string;
    const rawPayload = (req as any).rawBody;

    if (!signature) {
      return reply.status(400).send({ success: false, error: 'Missing webhook signature header' });
    }

    try {
      const result = await PaymentService.processWebhook(rawPayload, signature, req.body as any, req.headers as any);
      return { success: true, result };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Dedicated PhonePe Webhook Endpoint (Phase 4)
  server.post('/api/webhooks/phonepe', async (req: FastifyRequest, reply: FastifyReply) => {
    const rawBody = (req as any).rawBody;
    try {
      const result = await PaymentService.processPhonePeWebhook(rawBody, req.headers as any);
      return { success: true, result };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  const RefundParamsSchema = z.object({
    orderId: z.string().min(1, 'Order ID is required'),
  });

  const RefundBodySchema = z.object({
    amountMinor: z.number().int().positive('amountMinor must be a positive integer'),
    reason: z.string().max(500).optional(),
    idempotencyKey: z.string().min(1).max(256).optional(),
  });

  server.post('/api/payments/:orderId/refund', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const paramsParsed = RefundParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return reply.status(400).send({ success: false, error: paramsParsed.error.issues[0]?.message || 'Invalid orderId' });
    }
    const bodyParsed = RefundBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return reply.status(400).send({ success: false, error: bodyParsed.error.issues[0]?.message || 'Invalid refund parameters' });
    }

    const { orderId } = paramsParsed.data;
    const { amountMinor, reason, idempotencyKey } = bodyParsed.data;
    const userId = req.user!.id;

    const db = getDb();
    const order = await db.queryOne<any>(`SELECT * FROM payment_orders WHERE id = ?`, [orderId]);
    if (!order) {
      return reply.status(404).send({ success: false, error: 'Payment order not found' });
    }
    if (order.user_id !== userId) {
      return reply.status(403).send({ success: false, error: 'Forbidden: Cannot refund order of another user' });
    }

    try {
      const result = await PaymentService.refundPayment({
        orderId,
        amountMinor,
        reason: reason || 'User requested refund',
        idempotencyKey: idempotencyKey || `ref_${orderId}_${Date.now()}`,
        initiatedBy: userId,
      });

      return reply.send({ success: true, ...result });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Authoritative Admin Manual UTR Reconciliation Endpoint
  const ReconcileUtrSchema = z.object({
    paymentId: z.string().min(1, 'paymentId is required'),
    bankReference: z.string().min(1, 'bankReference is required'),
  });

  server.post('/api/admin/payments/reconcile-utr', { preHandler: requireAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = ReconcileUtrSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: parseResult.error.issues[0]?.message || 'Invalid reconciliation parameters',
      });
    }

    const { paymentId, bankReference } = parseResult.data;
    try {
      const result = await PaymentService.reconcileManualUTR({
        paymentId,
        reconciledBy: req.user!.id,
        bankReference,
      });
      return reply.send({
        success: true,
        cleared: result.cleared,
        paymentId: result.paymentId,
        balanceAfter: Number(result.balanceAfter),
      });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Authoritative Payment Status Polling Endpoint (Phase 4 UX Callback Independence)
  server.get('/api/payments/:orderId/status', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { orderId } = req.params as { orderId: string };
    const db = getDb();
    const order = await db.queryOne<any>(
      `SELECT * FROM payment_orders WHERE id = ? AND user_id = ?`,
      [orderId, req.user!.id]
    );

    if (!order) {
      return reply.status(404).send({ success: false, error: 'Order not found' });
    }

    const payment = await db.queryOne<any>(
      `SELECT * FROM payments WHERE payment_order_id = ?`,
      [orderId]
    );

    return {
      success: true,
      order: {
        id: order.id,
        status: order.status,
        amountMinor: Number(order.amount_minor),
        currency: order.currency,
        method: order.method,
        provider: order.provider,
        providerOrderId: order.provider_order_id,
        createdAt: Number(order.created_at),
        clearedAt: payment ? Number(payment.cleared_at) : null,
        settlementReference: payment?.settlement_reference || null,
      },
    };
  });

  // ==========================================================================
  // EXCHANGE TRADING & ORDERS (Phase 7, 9, 10, 18)
  // ==========================================================================

  server.post('/api/exchange/connect', { preHandler: requireActive }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { apiKey: string; apiSecret: string; environment: 'testnet' | 'mainnet' };
    if (!body?.apiKey || !body.apiSecret) {
      return reply.status(400).send({ success: false, error: 'API Key and Secret required' });
    }

    try {
      const audit = await BinanceGateway.saveExchangeCredentials(req.user!.id, body);
      let reconciliationResult: any = null;
      try {
        reconciliationResult = await ReconciliationWorker.runReconciliation(req.user!.id);
      } catch (recErr: any) {
        logger.warn(`[ExchangeConnect] Initial reconciliation error for user ${req.user!.id}: ${recErr.message}`);
      }
      return {
        success: true,
        audit,
        reconciled: reconciliationResult?.success ?? false,
        message: 'Exchange credentials securely audited and encrypted at rest.',
      };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.post('/api/exchange/disconnect', { preHandler: requireActive }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await BinanceGateway.disconnectExchange(req.user!.id);
      return { success: true, message: 'Exchange disconnected and credentials wiped.' };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.get('/api/exchange/account', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const info = await BinanceGateway.getExchangeAccountInfo(req.user!.id);
      return { success: true, account: info || { connected: false } };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.post('/api/exchange/listen-key', { preHandler: requireActive }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const listenKey = await BinanceGateway.createListenKey(req.user!.id);
      if (!listenKey) {
        return reply.status(400).send({ success: false, error: 'Could not create listenKey. Verify exchange credentials.' });
      }
      return { success: true, listenKey };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.post('/api/orders/submit', { preHandler: requireActive }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      symbol: string;
      asset: string;
      quoteAsset: string;
      side: 'BUY' | 'SELL';
      type: 'MARKET' | 'LIMIT' | 'STOP_LOSS_LIMIT';
      quantity: number;
      price?: number;
      marketQuoteAgeMs: number;
      idempotencyKey: string;
    };

    if (!body?.symbol || !body.quantity || body.quantity <= 0) {
      return reply.status(400).send({ success: false, error: 'Invalid order parameters' });
    }

    try {
      const order = await BinanceGateway.submitOrder({
        userId: req.user!.id,
        symbol: body.symbol,
        asset: body.asset,
        quoteAsset: body.quoteAsset || 'USDT',
        side: body.side,
        type: body.type,
        quantity: body.quantity,
        price: body.price,
        marketQuoteAgeMs: body.marketQuoteAgeMs || 0,
        idempotencyKey: body.idempotencyKey || `idemp_ord_${Date.now()}`,
      });

      return { success: true, order };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.get('/api/orders', { preHandler: requireAuth }, async (req: FastifyRequest) => {
    const db = getDb();
    const orders = await db.query(
      `SELECT * FROM exchange_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
      [req.user!.id]
    );
    return { success: true, orders };
  });

  server.post('/api/orders/cancel', { preHandler: requireActive }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { clientOrderId: string };
    if (!body?.clientOrderId) {
      return reply.status(400).send({ success: false, error: 'clientOrderId is required' });
    }
    try {
      const order = await BinanceGateway.cancelOrder(req.user!.id, body.clientOrderId);
      return { success: true, order };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // ==========================================================================
  // RECONCILIATION & AUDIT LOGS (Phase 8 & Phase 21)
  // ==========================================================================

  server.post('/api/reconciliation/run', { preHandler: requireAuth }, async (req: FastifyRequest) => {
    const result = await ReconciliationWorker.runReconciliation(req.user!.id);
    return { success: true, result };
  });

  server.get('/api/audit/events', { preHandler: requireAuth }, async (req: FastifyRequest) => {
    const events = await AuditService.getEvents({ userId: req.user!.id, limit: 100 });
    return { success: true, events };
  });

  // ==========================================================================
  // OPERATIONAL SAFETY & MONITORING
  // ==========================================================================

  server.get('/api/operational/health', { preHandler: authenticate }, async (req: FastifyRequest) => {
    const report = await OperationalSafetyService.getHealthReport(req.user?.id);
    return { success: true, report };
  });

  server.post('/api/operational/kill-switch/freeze', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { scope: 'GLOBAL' | 'ACCOUNT' | 'SYMBOL'; target?: string; reason: string };
    if (!body?.scope || !body?.reason) {
      return reply.status(400).send({ success: false, error: 'Scope and reason are required' });
    }
    await OperationalSafetyService.freeze(body.scope, body.target || '*', body.reason, req.user!.id);
    return { success: true, message: `Emergency freeze activated for ${body.scope}:${body.target || '*'}` };
  });

  server.post('/api/operational/kill-switch/unfreeze', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { scope: 'GLOBAL' | 'ACCOUNT' | 'SYMBOL'; target?: string; reason: string };
    if (!body?.scope || !body?.reason) {
      return reply.status(400).send({ success: false, error: 'Scope and reason are required' });
    }
    await OperationalSafetyService.unfreeze(body.scope, body.target || '*', body.reason, req.user!.id);
    return { success: true, message: `Emergency freeze deactivated for ${body.scope}:${body.target || '*'}` };
  });

  server.post('/api/operational/reconciliation/run', { preHandler: requireAuth }, async (req: FastifyRequest) => {
    const result = await ReconciliationWorker.runReconciliation(req.user!.id);
    return { success: true, result };
  });

  return server;
}

const isMain = process.argv[1]?.endsWith('server/index.ts') || process.argv[1]?.endsWith('server/index.js');
if (isMain || process.env.START_SERVER === 'true') {
  // Fail-closed startup security preflight audit
  const audit = auditServerSecurityConfig(config, process.env);
  if (config.NODE_ENV === 'production' && !audit.productionSafe) {
    console.error('================================================================================');
    console.error('FATAL: Production configuration security audit failed. Server refusing to start:');
    for (const issue of audit.issues) {
      console.error(`  - ${issue}`);
    }
    console.error('================================================================================');
    process.exit(1);
  }

  (async () => {
    try {
      console.log(`[Database] Initializing database and verifying forward-only migrations for environment '${config.NODE_ENV}'...`);
      await initDb();
      console.log(`[Database] Database connected and schema migrations up to date.`);

      console.log(`[Recovery] Running startup recovery sweep for ambiguous order states...`);
      const recovery = await OrderRecoveryService.runRecoverySweep();
      console.log(
        `[Recovery] Sweep completed: ${recovery.ordersInspected} inspected, ${recovery.recoveredCount} recovered, ${recovery.unresolvedCount} unresolved.`
      );

      console.log(`[ExchangeRules] Loading authoritative Binance exchange rules...`);
      await SymbolRulesService.refreshRules().catch((err: any) => {
        if (config.NODE_ENV === 'production') {
          throw new Error(`Failed to load authoritative Binance exchange rules on startup: ${err.message}`);
        }
        console.warn(`[ExchangeRules] Non-production startup: exchangeInfo refresh skipped or failed: ${err.message}`);
      });

      console.log(`[ClockSync] Synchronizing server clock with Binance exchange venue...`);
      await ClockSyncService.synchronize().catch((err: any) => {
        console.warn(`[ClockSync] Initial clock sync warning: ${err.message}`);
      });
      ClockSyncService.startPeriodicSync();
      UserDataStreamManager.startKeepAliveLoop();
      await UserDataStreamManager.restoreAllActiveStreams().catch((err: any) => {
        console.warn(`[UserDataStream] Failed to restore active streams: ${err.message}`);
      });
      console.log(`[Reconciliation] Running authoritative startup reconciliation sweep...`);
      await ReconciliationWorker.runReconciliation().catch((err: any) => {
        console.warn(`[Reconciliation] Initial startup reconciliation sweep warning: ${err.message}`);
      });
      ReconciliationWorker.startPeriodicScheduler(60_000);

      const server = buildServer();

      // Graceful termination listeners
      const handleSignal = async (signal: string) => {
        console.log(`\n[Process] Received ${signal}. Initiating graceful shutdown...`);
        await shutdownServer(server);
        process.exit(0);
      };

      process.on('SIGTERM', () => handleSignal('SIGTERM'));
      process.on('SIGINT', () => handleSignal('SIGINT'));

      const address = await server.listen({ port: config.PORT, host: config.HOST });
      console.log(`Lumen Enterprise Server running at ${address} [ENV: ${config.NODE_ENV}]`);
    } catch (err: any) {
      console.error('FATAL: Server startup failed:', err);
      process.exit(1);
    }
  })();
}

