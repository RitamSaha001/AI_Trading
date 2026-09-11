import dns from 'node:dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import sensible from '@fastify/sensible';
import { config, auditServerSecurityConfig } from './config';
import { getDb, initDb, closeDb, getMigrationStatus } from './db';
import { ServerAuthService } from './services/authService';
import { requireAuth, requireActive, requireKYC, requireAdmin, requireFinanceAdmin, extractSessionToken, verifyOriginOrCsrf, authenticate, authorizeKillSwitch } from './middleware/authMiddleware';
import { isValidAllowedOrigin } from './utils/originValidator';
import { z } from 'zod';
import { AuthRateLimiter } from './middleware/rateLimiter';
import { LedgerService } from './services/ledgerService';
import { PaymentService } from './services/paymentService';
import { ExactDecimal } from './services/precision';
import { BinanceGateway } from './services/binanceGateway';
import { BrokerRegistry, BrokerGateway, FlattradeAdapter, UpstoxClient, UpstoxConnectivityValidator, UpstoxInstrumentRegistry, UpstoxAdapter, UpstoxCandleService } from './services/brokers';
import { ServerRiskEngine } from './services/riskEngine';
import { ReconciliationWorker } from './services/reconciliationWorker';
import { OrderRecoveryService } from './services/orderRecoveryService';
import crypto from 'node:crypto';
import { SymbolRulesService } from './services/symbolRules';
import { AuditService, logger } from './services/auditService';
import { OperationalSafetyService } from './services/operationalSafetyService';
import { CircuitBreakerService } from './services/circuitBreakerService';
import { ClockSyncService } from './services/clockSyncService';
import { ReadinessService } from './services/readinessService';
import { RateLimitTracker } from './services/rateLimitTracker';
import { UserDataStreamManager } from './services/userDataStreamManager';
import { LiveOrderConfirmationService } from './services/liveOrderConfirmationService';
import { EmergencyControlService } from './services/emergencyControlService';
import { UpstoxTotpAuthService } from './services/brokers/upstox/upstoxTotpAuthService';
import { IntradaySquareOffService } from './services/intradaySquareOffService';
import { AutonomousPilotWorker } from './services/autonomousPilotWorker';
import { InFlightMtmService } from './services/inFlightMtmService';

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
    UpstoxTotpAuthService.stop();
    IntradaySquareOffService.stop();
    AutonomousPilotWorker.stop();
    InFlightMtmService.stopDaemon();
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

  // 3. Disconnect exchange WebSockets & broker gateways
  try {
    await BrokerRegistry.shutdown();
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

  // Multi-Dimensional Readiness Probes (APPLICATION_READY, DB_READY, UPSTOX_AUTH_READY, INSTRUMENTS_READY, QUOTE_SERVICE_READY, STATIC_IP_READY, LIVE_EXECUTION_READY)
  const readinessHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const report = await ReadinessService.evaluateReadiness(isShuttingDown);
      const statusCode = report.ready ? 200 : 503;
      return reply.status(statusCode).send({
        ...report,
        registeredBrokers: BrokerRegistry.getAll().map((b) => b.id),
        liveTrading: {
          enabled: Boolean(config.UPSTOX_LIVE_TRADING_ENABLED),
          safetyGate: config.UPSTOX_LIVE_TRADING_ENABLED ? 'DISENGAGED' : 'ENGAGED_SAFE',
        },
      });
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
  server.get('/api/ready', readinessHandler);
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

    const amountMinorBig = ExactDecimal.from(body.amountUSD).toMinor(2);
    const amountCents = Number(amountMinorBig);
    if (!Number.isSafeInteger(amountCents)) {
      return reply.status(400).send({ success: false, error: 'Amount exceeds safe integer representation' });
    }

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

    const amountMinorBig = ExactDecimal.from(body.amountUSD).toMinor(2);
    const amountCents = Number(amountMinorBig);
    if (!Number.isSafeInteger(amountCents)) {
      return reply.status(400).send({ success: false, error: 'Amount exceeds safe integer representation' });
    }

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

    const amountMinorBig = ExactDecimal.from(body.amount).toMinor(2);
    const amountMinor = Number(amountMinorBig);
    if (!Number.isSafeInteger(amountMinor)) {
      return reply.status(400).send({ success: false, error: 'Amount exceeds safe integer representation' });
    }

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
    if (config.NODE_ENV === 'production' && config.PAYMENT_PROVIDER === 'phonepe') {
      return reply.status(403).send({ success: false, error: 'Generic webhook disabled in PhonePe production mode' });
    }
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

  server.post('/api/admin/payments/reconcile-utr', { preHandler: requireFinanceAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
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

  // Authoritative Admin Payment Operational Telemetry Endpoint
  server.get('/api/admin/payments/metrics', { preHandler: requireFinanceAdmin }, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = await PaymentService.getOperationalMetrics();
      return reply.send({ success: true, metrics });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
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
    const body = req.body as {
      apiKey?: string; apiSecret?: string; accessToken?: string; code?: string; environment?: string; broker?: string;
      consumerKey?: string; sessionToken?: string; sid?: string; ucc?: string; userId?: string; accountId?: string;
    };
    const brokerId = body?.broker || 'binance';

    if (!BrokerRegistry.has(brokerId)) {
      return reply.status(400).send({ success: false, error: `Unsupported broker: ${brokerId}` });
    }

    if (brokerId === 'binance' && (!body?.apiKey || !body.apiSecret)) {
      return reply.status(400).send({ success: false, error: 'API Key and Secret required for Binance' });
    }
    if (brokerId === 'upstox' && !body?.accessToken && !body?.code) {
      return reply.status(400).send({ success: false, error: 'Upstox Access Token or Authorization Code required' });
    }
    if (brokerId === 'kotak_neo' && (!body?.consumerKey || !(body?.sessionToken || body?.accessToken) || !body?.sid || !(body?.ucc || body?.accountId))) {
      return reply.status(400).send({ success: false, error: 'Kotak Neo requires Consumer Key, UCC, session token, and SID from an authenticated Neo session' });
    }
    if (brokerId === 'flattrade' && (!(body?.accessToken || body?.sessionToken) || !(body?.userId || body?.ucc || body?.accountId))) {
      return reply.status(400).send({ success: false, error: 'Flattrade requires a current Pi access token and user/account ID after browser authorization' });
    }

    try {
      const broker = BrokerRegistry.get(brokerId);
      const audit = await broker.saveCredentials!(req.user!.id, body);
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
        message: `${broker.name} credentials securely audited and encrypted at rest.`,
      };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.get('/api/exchange/upstox/auth-url', { preHandler: requireAuth }, async (req: FastifyRequest) => {
    const query = req.query as { redirectUri?: string };
    const { state, authUrl, expiresAt } = await UpstoxClient.generateOAuthState(req.user!.id, query?.redirectUri);
    return { success: true, authUrl, expiresAt };
  });

  const completeUpstoxOAuthCallback = async (
    userId: string,
    payload: { code?: string; state?: string; redirectUri?: string; error?: string },
    reply: FastifyReply
  ) => {
    if (payload?.error) {
      return reply.status(400).send({
        success: false,
        code: 'UPSTOX_AUTH_DENIED',
        error: 'Upstox authorization was not completed.',
      });
    }
    if (!payload?.code) {
      return reply.status(400).send({ success: false, error: 'Authorization code is required' });
    }
    if (!payload?.state) {
      return reply.status(400).send({ success: false, error: 'OAuth state parameter is required for CSRF protection' });
    }
    try {
      const broker = BrokerRegistry.get('upstox');
      const audit = await broker.saveCredentials!(userId, {
        code: payload.code,
        state: payload.state,
        redirectUri: payload.redirectUri,
      });
      return { success: true, audit, message: 'Upstox connected and credentials encrypted at rest.' };
    } catch (err: any) {
      logger.warn(`[Upstox Callback] Authentication or token exchange failed: ${err.message}`);
      const isSegmentInactive = /No segments for these users are active|UDAPI100058/i.test(err.message);
      return reply.status(400).send({
        success: false,
        code: isSegmentInactive ? 'UPSTOX_SEGMENT_INACTIVE' : 'UPSTOX_AUTH_FAILED',
        error: isSegmentInactive
          ? 'Upstox reported that trading segments are inactive or awaiting reactivation for this account. Please reactivate segments in Upstox web/app, or paste an active access token.'
          : 'Upstox authorization failed. Confirm the callback URL, authorization state, and account access, then try again.',
      });
    }
  };

  server.get('/api/exchange/upstox/callback', { preHandler: requireActive }, async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as { code?: string; state?: string; redirectUri?: string; error?: string };
    return completeUpstoxOAuthCallback(req.user!.id, query, reply);
  });

  server.post('/api/exchange/upstox/callback', { preHandler: requireActive }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { code?: string; state?: string; redirectUri?: string; error?: string };
    return completeUpstoxOAuthCallback(req.user!.id, body, reply);
  });

  server.get('/api/exchange/upstox/token-health', { preHandler: requireAuth }, async (req: FastifyRequest) => {
    const upstox = BrokerRegistry.get('upstox') as any;
    const health = await upstox.getTokenHealth(req.user!.id);
    return { success: true, health };
  });

  server.get('/api/exchange/upstox/ip-diagnostics', { preHandler: requireAuth }, async (req: FastifyRequest) => {
    const forceRefresh = Boolean((req.query as any)?.force);
    const diagnostics = await UpstoxClient.checkOutboundIp(forceRefresh);
    return { success: true, diagnostics };
  });

  server.get('/api/exchange/upstox/connectivity-check', { preHandler: requireAuth }, async (req: FastifyRequest) => {
    const report = await UpstoxConnectivityValidator.runDiagnostics(req.user!.id);
    return { success: true, report };
  });

  server.get('/api/market/instruments/upstox', async () => {
    const instruments = UpstoxInstrumentRegistry.getAll();
    return { success: true, instruments };
  });

  server.get('/api/brokers/:broker/instruments', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { broker } = req.params as { broker: string };
    if (!['kotak_neo', 'flattrade'].includes(broker)) {
      return reply.status(400).send({ success: false, error: 'Instrument catalog is available only for Kotak Neo or Flattrade.' });
    }
    const query = (req.query as { query?: string; exchange?: string; segment?: string; limit?: string }) || {};
    const gateway = BrokerRegistry.get(broker);
    let instruments = await gateway.listInstruments!(query);
    if (instruments.length === 0) {
      await gateway.bootstrapInstrumentCatalog!();
      instruments = await gateway.listInstruments!(query);
    }
    return {
      success: true,
      broker,
      executionLocked: true,
      instruments,
    };
  });

  server.post('/api/brokers/:broker/instruments/bootstrap', { preHandler: requireActive }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { broker } = req.params as { broker: string };
    if (!['kotak_neo', 'flattrade'].includes(broker)) {
      return reply.status(400).send({ success: false, error: 'Instrument catalog bootstrap is available only for Kotak Neo or Flattrade.' });
    }
    const imported = await BrokerRegistry.get(broker).bootstrapInstrumentCatalog!();
    return { success: true, broker, imported, executionLocked: true, source: 'REFERENCE_MAPPING' };
  });

  server.get('/api/brokers/:broker/readiness', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { broker: brokerId } = req.params as { broker: string };
    if (!BrokerRegistry.has(brokerId)) {
      return reply.status(400).send({ success: false, error: `Unsupported broker: ${brokerId}` });
    }
    const broker = BrokerRegistry.get(brokerId);
    const readiness = broker.getExecutionReadiness
      ? await broker.getExecutionReadiness(req.user!.id)
      : {
        broker: broker.id,
        state: broker.capabilities.supportsTrading ? 'LIVE_GATE_REQUIRED' : 'UNSUPPORTED',
        executionEnabled: false,
        connected: Boolean(await broker.getAccount(req.user!.id)),
        checks: [{ name: 'execution-gate', passed: false, detail: 'Use the broker-specific live-order gate.' }],
      };
    return { success: true, readiness, capabilities: broker.capabilities };
  });

  async function getAuthoritativeUpstoxCred(userId?: string): Promise<{ userId: string; accessTokenEncrypted: string } | null> {
    const db = getDb();
    const now = Date.now();
    if (userId) {
      const row = await db.queryOne<{ user_id: string; access_token_encrypted: string }>(
        `SELECT user_id, access_token_encrypted FROM broker_credentials 
         WHERE user_id = ? AND broker = 'upstox' AND access_token_encrypted IS NOT NULL LIMIT 1`,
        [userId]
      );
      if (row) return { userId: row.user_id, accessTokenEncrypted: row.access_token_encrypted };
    }

    // 1. Prefer active / non-expired token
    const activeRow = await db.queryOne<{ user_id: string; access_token_encrypted: string }>(
      `SELECT user_id, access_token_encrypted FROM broker_credentials 
       WHERE broker = 'upstox' AND access_token_encrypted IS NOT NULL AND (token_expires_at IS NULL OR token_expires_at > ?)
       ORDER BY updated_at DESC LIMIT 1`,
      [now]
    );
    if (activeRow) return { userId: activeRow.user_id, accessTokenEncrypted: activeRow.access_token_encrypted };

    // 2. Fallback to latest updated
    const latestRow = await db.queryOne<{ user_id: string; access_token_encrypted: string }>(
      `SELECT user_id, access_token_encrypted FROM broker_credentials 
       WHERE broker = 'upstox' AND access_token_encrypted IS NOT NULL
       ORDER BY updated_at DESC LIMIT 1`
    );
    if (latestRow) return { userId: latestRow.user_id, accessTokenEncrypted: latestRow.access_token_encrypted };

    return null;
  }

  server.get('/api/market/quotes/upstox', async (req: FastifyRequest) => {
    const query = (req.query as any) || {};
    const symbolsParam = query.symbols as string | undefined;
    const defaultSymbols = [
      'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'BHARTIARTL',
      'ITC', 'KOTAKBANK', 'LT', 'TATAMOTORS', 'AXISBANK', 'MARUTI', 'SUNPHARMA',
      'TITAN', 'BAJFINANCE', 'HINDUNILVR', 'WIPRO', 'NTPC', 'ONGC', 'HAL', 'BEL', 'TATASTEEL'
    ];
    const requestedSymbols = symbolsParam
      ? symbolsParam.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean)
      : defaultSymbols;

    const upstox = BrokerRegistry.get('upstox') as UpstoxAdapter;
    const quotes: Record<string, any> = {};

    let userId: string | undefined;
    const token = extractSessionToken(req);
    if (token) {
      try {
        const user = await ServerAuthService.validateSession(token);
        if (user) userId = user.id;
      } catch {}
    }
    const cred = await getAuthoritativeUpstoxCred(userId);
    const activeUserId = cred?.userId || userId;

    await Promise.all(
      requestedSymbols.map(async (sym) => {
        try {
          const q = await upstox.getMarketQuote(sym, activeUserId);
          if (q) {
            quotes[sym] = q;
          }
        } catch (err: any) {
          logger.warn(`[MarketQuotes] Failed to fetch quote for ${sym}: ${err.message}`);
        }
      })
    );

    return { success: true, quotes };
  });

  server.get('/api/market/candles/upstox', async (req: FastifyRequest) => {
    const query = (req.query as any) || {};
    const symbol = (query.symbol as string || 'RELIANCE').toUpperCase().trim();
    const timeframe = (query.timeframe as string || '1D').toUpperCase().trim();

    let accessToken: string | undefined;
    const token = extractSessionToken(req);
    let userId: string | undefined;
    if (token) {
      try {
        const user = await ServerAuthService.validateSession(token);
        if (user) userId = user.id;
      } catch {}
    }

    const cred = await getAuthoritativeUpstoxCred(userId);
    if (cred?.accessTokenEncrypted) {
      try {
        accessToken = UpstoxAdapter.decryptSecret(cred.accessTokenEncrypted);
      } catch (err: any) {
        logger.warn(`[UpstoxCandles] Failed to decrypt access token: ${err.message}`);
      }
    }

    const candles = await UpstoxCandleService.getCandles(symbol, timeframe, accessToken);
    return { success: true, symbol, timeframe, count: candles.length, candles };
  });

  server.get('/api/market/candles/upstox/batch', async (req: FastifyRequest) => {
    const query = (req.query as any) || {};
    const symbolsParam = (query.symbols as string || '').toUpperCase().trim();
    const timeframe = (query.timeframe as string || '1D').toUpperCase().trim();
    const defaultSymbols = [
      'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
      'SBIN', 'BHARTIARTL', 'ITC', 'LT', 'TATAMOTORS', 'HAL', 'BEL',
      'NTPC', 'TATASTEEL', 'SUNPHARMA'
    ];
    const symbols = symbolsParam
      ? symbolsParam.split(',').map((s: string) => s.trim()).filter(Boolean)
      : defaultSymbols;

    let accessToken: string | undefined;
    const token = extractSessionToken(req);
    let userId: string | undefined;
    if (token) {
      try {
        const user = await ServerAuthService.validateSession(token);
        if (user) userId = user.id;
      } catch {}
    }

    const cred = await getAuthoritativeUpstoxCred(userId);
    if (cred?.accessTokenEncrypted) {
      try {
        accessToken = UpstoxAdapter.decryptSecret(cred.accessTokenEncrypted);
      } catch (err: any) {
        logger.warn(`[UpstoxCandlesBatch] Failed to decrypt access token: ${err.message}`);
      }
    }

    const candleMap = await UpstoxCandleService.getCandlesBatch(symbols, timeframe, accessToken);
    return { success: true, timeframe, count: Object.keys(candleMap).length, candles: candleMap };
  });

  server.get('/api/market/quotes/flattrade', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = req.query as { symbols?: string; exchange?: string };
      const symbols = String(query.symbols || '').split(',').map((symbol) => symbol.trim()).filter(Boolean);
      if (symbols.length === 0 || symbols.length > 50) {
        return reply.status(400).send({ success: false, error: 'Provide between 1 and 50 comma-separated symbols.' });
      }
      const adapter = BrokerRegistry.get('flattrade') as FlattradeAdapter;
      const quotes = await adapter.getMarketQuotesBatch(symbols, req.user!.id, String(query.exchange || 'NSE').toUpperCase());
      return { success: true, broker: 'flattrade', quotes, executionLocked: true };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.get('/api/market/candles/flattrade', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = req.query as { symbol?: string; exchange?: string; interval?: string; from?: string; to?: string; token?: string };
      const symbol = String(query.symbol || '').trim();
      if (!symbol) return reply.status(400).send({ success: false, error: 'symbol is required.' });
      const from = query.from ? new Date(query.from) : undefined;
      const to = query.to ? new Date(query.to) : undefined;
      if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
        return reply.status(400).send({ success: false, error: 'from and to must be valid ISO dates.' });
      }
      const adapter = BrokerRegistry.get('flattrade') as FlattradeAdapter;
      const candles = await adapter.getCandles(req.user!.id, {
        symbol,
        exchange: String(query.exchange || 'NSE').toUpperCase(),
        intervalMinutes: Number(query.interval || 5),
        from,
        to,
        instrumentToken: query.token,
      });
      return { success: true, broker: 'flattrade', symbol, count: candles.length, candles, executionLocked: true };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.get('/api/market/option-chain/flattrade', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = req.query as { symbol?: string; exchange?: string; strikePrice?: string; count?: string };
      if (!query.symbol || !query.strikePrice) {
        return reply.status(400).send({ success: false, error: 'symbol and strikePrice are required.' });
      }
      const adapter = BrokerRegistry.get('flattrade') as FlattradeAdapter;
      const contracts = await adapter.getOptionChain(req.user!.id, {
        exchange: String(query.exchange || 'NFO').toUpperCase(),
        symbol: query.symbol,
        strikePrice: query.strikePrice,
        count: Math.min(Math.max(Number(query.count) || 5, 1), 20),
      });
      return { success: true, broker: 'flattrade', contracts, executionLocked: true };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.get('/api/market/option-greeks/flattrade', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = req.query as Record<string, string | undefined>;
      const required = ['expiryDate', 'strikePrice', 'spotPrice', 'interestRate', 'volatility', 'optionType'];
      if (required.some((key) => !query[key])) {
        return reply.status(400).send({ success: false, error: 'expiryDate, strikePrice, spotPrice, interestRate, volatility, and optionType are required.' });
      }
      if (query.optionType !== 'CE' && query.optionType !== 'PE') {
        return reply.status(400).send({ success: false, error: 'optionType must be CE or PE.' });
      }
      const adapter = BrokerRegistry.get('flattrade') as FlattradeAdapter;
      const greeks = await adapter.getOptionGreeks(req.user!.id, {
        expiryDate: query.expiryDate!, strikePrice: query.strikePrice!, spotPrice: query.spotPrice!,
        interestRate: query.interestRate!, volatility: query.volatility!, optionType: query.optionType,
      });
      return { success: true, broker: 'flattrade', greeks, executionLocked: true };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.get('/api/brokers/flattrade/stream-readiness', { preHandler: requireAuth }, async (req: FastifyRequest) => {
    const adapter = BrokerRegistry.get('flattrade') as FlattradeAdapter;
    return { success: true, stream: await adapter.getStreamReadiness(req.user!.id), executionLocked: true };
  });

  server.get('/api/brokers/flattrade/instrument-master/status', { preHandler: requireAuth }, async () => {
    const adapter = BrokerRegistry.get('flattrade') as FlattradeAdapter;
    return { success: true, status: adapter.getInstrumentMasterStatus(), executionLocked: true };
  });

  server.get('/api/brokers/flattrade/orders/:orderId/history', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orderId } = req.params as { orderId: string };
      if (!orderId.trim()) return reply.status(400).send({ success: false, error: 'orderId is required.' });
      const adapter = BrokerRegistry.get('flattrade') as FlattradeAdapter;
      return { success: true, history: await adapter.getOrderHistory(req.user!.id, orderId), executionLocked: true };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.get('/api/brokers/flattrade/gtt', { preHandler: requireAuth }, async (req: FastifyRequest) => {
    const adapter = BrokerRegistry.get('flattrade') as FlattradeAdapter;
    return { success: true, gtt: await adapter.getGttOrders(req.user!.id), executionLocked: true };
  });

  server.post('/api/brokers/flattrade/order-margin', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const input = Object.fromEntries(Object.entries(body).map(([key, value]) => [key, String(value)]));
      const adapter = BrokerRegistry.get('flattrade') as FlattradeAdapter;
      return { success: true, margin: await adapter.getOrderMargin(req.user!.id, input), executionLocked: true };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // --- AUTONOMOUS QUANT PILOT DUAL-MODE DAEMON ENDPOINTS ---
  async function resolveRequestUserId(req: FastifyRequest): Promise<string> {
    const token = extractSessionToken(req);
    if (token) {
      try {
        const user = await ServerAuthService.validateSession(token);
        if (user) return user.id;
      } catch {}
    }
    const cred = await getAuthoritativeUpstoxCred();
    if (cred?.userId) return cred.userId;

    const db = getDb();
    const anyUser = await db.queryOne<{ id: string }>(
      `SELECT id FROM users ORDER BY created_at ASC LIMIT 1`
    );
    if (anyUser?.id) return anyUser.id;

    return 'usr_owner_default';
  }

  server.get('/api/pilot/state', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = await resolveRequestUserId(req);
      const state = await AutonomousPilotWorker.getPilotState(userId);
      return { success: true, ...state };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  server.post('/api/pilot/config', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = await resolveRequestUserId(req);
      const body = (req.body as any) || {};
      const updated = await AutonomousPilotWorker.updatePilotConfig(userId, body);
      return { success: true, ...updated };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.post('/api/pilot/heartbeat', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = await resolveRequestUserId(req);
      const res = await AutonomousPilotWorker.recordClientHeartbeat(userId);
      return { success: true, ...res };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  server.post('/api/pilot/sweep', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = await resolveRequestUserId(req);
      const res = await AutonomousPilotWorker.runPilotSweep(userId);
      return { success: true, sweep: res };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  server.post('/api/exchange/disconnect', { preHandler: requireActive }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const brokerParam = (req.query as any)?.broker || 'upstox';
      const broker = BrokerRegistry.get(brokerParam);
      await broker.disconnectAccount!(req.user!.id);
      return { success: true, message: `${broker.name} disconnected and credentials wiped.` };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.get('/api/exchange/account', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const brokerParam = (req.query as any)?.broker || 'upstox';
      const broker = BrokerRegistry.get(brokerParam);
      const info = await broker.getAccount(req.user!.id);
      return { success: true, account: info || { connected: false } };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.get('/api/exchange/funds', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const brokerParam = (req.query as any)?.broker || 'upstox';
      const broker = BrokerRegistry.get(brokerParam);
      const funds = broker.getFunds ? await broker.getFunds(req.user!.id) : null;
      if (!funds) {
        return { success: true, funds: null };
      }
      const toNum = (val: any) => {
        if (typeof val === 'number') return val;
        if (val && typeof val.toNumber === 'function') return val.toNumber();
        if (val && typeof val.toString === 'function') return Number(val.toString()) || 0;
        return Number(val) || 0;
      };
      return {
        success: true,
        funds: {
          broker: funds.broker,
          currency: funds.currency,
          availableCash: toNum(funds.availableCash),
          usedMargin: toNum(funds.usedMargin),
          totalEquity: toNum(funds.totalEquity),
          updatedAt: funds.updatedAt,
        },
      };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.get('/api/exchange/positions', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const brokerParam = (req.query as any)?.broker || 'upstox';
      const broker = BrokerRegistry.get(brokerParam);
      const positions = broker.getPositions ? await broker.getPositions(req.user!.id) : [];
      return { success: true, positions };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.get('/api/exchange/holdings', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const brokerParam = (req.query as any)?.broker || 'upstox';
      const broker = BrokerRegistry.get(brokerParam);
      const holdings = broker.getHoldings ? await broker.getHoldings(req.user!.id) : [];
      return { success: true, holdings };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.get('/api/exchange/open-orders', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const brokerParam = (req.query as any)?.broker || 'upstox';
      const symbol = (req.query as any)?.symbol as string | undefined;
      const broker = BrokerRegistry.get(brokerParam);
      return { success: true, broker: broker.id, orders: await broker.getOpenOrders(req.user!.id, symbol) };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.get('/api/exchange/trades', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const brokerParam = (req.query as any)?.broker || 'upstox';
      const symbol = (req.query as any)?.symbol as string | undefined;
      const broker = BrokerRegistry.get(brokerParam);
      return { success: true, broker: broker.id, trades: await broker.getTrades(req.user!.id, symbol) };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.post('/api/exchange/listen-key', { preHandler: requireActive }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const broker = BrokerRegistry.get((req.body as any)?.broker || 'binance');
      if (!broker.createListenKey) {
        return reply.status(400).send({ success: false, error: `${broker.name} does not provide a listen-key endpoint.` });
      }
      const listenKey = await broker.createListenKey!(req.user!.id);
      if (!listenKey) {
        return reply.status(400).send({ success: false, error: 'Could not create listenKey. Verify exchange credentials.' });
      }
      return { success: true, listenKey };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.post('/api/orders/propose', { preHandler: requireActive }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as any;
    if (!body?.symbol || !body.quantity || body.quantity <= 0) {
      return reply.status(400).send({ success: false, error: 'Invalid proposal parameters' });
    }
    if (!body.product) {
      return reply.status(400).send({ success: false, error: 'Explicit product selection is strictly required (CNC/D, MIS/I, MTF).' });
    }
    const brokerId = body.broker || 'upstox';
    if (!BrokerRegistry.has(brokerId)) {
      return reply.status(400).send({ success: false, error: `Unsupported broker: ${brokerId}` });
    }
    const requestedBroker = BrokerRegistry.get(brokerId);
    if (!requestedBroker.capabilities.supportsTrading) {
      return reply.status(409).send({
        success: false,
        code: 'BROKER_EXECUTION_LOCKED',
        error: `${requestedBroker.name} is connected for reconciliation only; live-order proposals are disabled.`,
      });
    }
    try {
      const confirmation = await LiveOrderConfirmationService.proposeLiveOrder({
        userId: req.user!.id,
        broker: brokerId,
        symbol: body.symbol,
        side: body.side,
        type: body.type || 'LIMIT',
        quantity: body.quantity,
        price: body.price,
        triggerPrice: body.triggerPrice,
        product: body.product,
        validity: body.validity,
        disclosedQuantity: body.disclosedQuantity,
        slice: body.slice,
      });
      return { success: true, confirmation };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message, code: err.code });
    }
  });

  server.post('/api/orders/confirm', { preHandler: requireActive }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      confirmationId: string;
      symbol: string;
      side: 'BUY' | 'SELL';
      type: string;
      quantity: number;
      price?: number;
      triggerPrice?: number;
      product: string;
      validity?: string;
      disclosedQuantity?: number;
      slice?: boolean;
      broker?: string;
    };

    if (!body?.confirmationId) {
      return reply.status(400).send({ success: false, error: 'confirmationId is required' });
    }

    // Security guard: Explicitly disallow client-supplied isSystemPanic
    delete (body as any).isSystemPanic;

    try {
      // Authoritative verification: Retrieve pre-allocated clientOrderId, idempotencyKey, and frozen parameters
      const confirmation = await LiveOrderConfirmationService.getConfirmation(body.confirmationId, req.user!.id);
      if (!confirmation) {
        return reply.status(404).send({ success: false, error: 'Confirmation not found or unauthorized' });
      }

      // Defense-in-depth: Execute the server-stored, frozen proposal record
      // Ignore client parameter mutations and bind strictly to the verified proposal
      const broker = BrokerRegistry.get(confirmation.broker || 'upstox');
      if (!broker.capabilities.supportsTrading) {
        return reply.status(409).send({ success: false, code: 'BROKER_EXECUTION_LOCKED', error: `${broker.name} execution is disabled.` });
      }
      const order = await broker.placeOrder({
        userId: req.user!.id,
        broker: broker.id,
        symbol: confirmation.symbol,
        side: confirmation.side,
        type: confirmation.type,
        quantity: confirmation.quantity,
        price: confirmation.price,
        triggerPrice: confirmation.triggerPrice,
        product: confirmation.product,
        validity: confirmation.validity,
        disclosedQuantity: confirmation.disclosedQuantity,
        slice: confirmation.slice,
        confirmationId: confirmation.confirmationId,
        clientOrderId: confirmation.clientOrderId,
        idempotencyKey: confirmation.idempotencyKey,
        accountMode: 'live',
      });
      return { success: true, order };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message, code: err.code });
    }
  });

  server.get('/api/orders/confirmation/:id', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const confirmation = await LiveOrderConfirmationService.getConfirmation(id, req.user!.id);
    if (!confirmation) {
      return reply.status(404).send({ success: false, error: 'Confirmation not found' });
    }
    return { success: true, confirmation };
  });

  server.post('/api/orders/submit', { preHandler: requireActive }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      symbol: string;
      asset?: string;
      quoteAsset?: string;
      side: 'BUY' | 'SELL';
      type: 'MARKET' | 'LIMIT' | 'STOP_LOSS_LIMIT' | string;
      quantity: number;
      price?: number;
      product?: string;
      validity?: string;
      triggerPrice?: number;
      disclosedQuantity?: number;
      slice?: boolean;
      confirmationId?: string;
      accountMode?: 'live' | 'paper';
      marketQuoteAgeMs?: number;
      idempotencyKey?: string;
      broker?: string;
    };

    if (!body?.symbol || !body.quantity || body.quantity <= 0) {
      return reply.status(400).send({ success: false, error: 'Invalid order parameters' });
    }

    // Security guard: Explicitly disallow client-supplied isSystemPanic
    delete (body as any).isSystemPanic;

    const accountMode = body.accountMode || 'live';
    let brokerId = body.broker;

    // Strict validation of broker selection according to domain and safety rules
    if (!brokerId) {
      const sym = String(body.symbol || '').toUpperCase().trim();
      const isIndian = UpstoxInstrumentRegistry.isVerified(sym) || body.quoteAsset === 'INR';
      if (isIndian) {
        brokerId = 'upstox';
      } else if (accountMode === 'paper') {
        brokerId = 'binance';
      } else {
        return reply.status(400).send({
          success: false,
          error: 'Explicit broker selection is required for live orders.',
        });
      }
    }

    if (!BrokerRegistry.has(brokerId)) {
      return reply.status(400).send({ success: false, error: `Unsupported broker: ${brokerId}` });
    }

    // Live Upstox orders strictly require two-step confirmation UNLESS authorized autonomous algo
    const isAutonomous = Boolean(body.auto || (body as any).isAutonomous);
    const hasStrategy = Boolean(body.strategyName || (body as any).strategyId);

    if (accountMode === 'live' && brokerId === 'upstox' && isAutonomous) {
      return reply.status(403).send({
        success: false,
        code: 'AUTONOMOUS_INTERNAL_ONLY',
        error: 'Autonomous live execution is internal-only and cannot be requested through the public order API.',
      });
    }

    if (accountMode === 'live' && brokerId === 'upstox' && !body.confirmationId) {
      if (!isAutonomous || !hasStrategy) {
        return reply.status(400).send({
          success: false,
          code: 'CONFIRMATION_REQUIRED',
          error: 'Live orders strictly require two-step human confirmation. Please propose order first via /api/orders/propose.',
        });
      }
    }

    try {
      const broker = BrokerRegistry.get(brokerId);
      if (accountMode === 'live' && !broker.capabilities.supportsTrading) {
        return reply.status(409).send({
          success: false,
          code: 'BROKER_EXECUTION_LOCKED',
          error: `${broker.name} is read-only and cannot accept live orders.`,
        });
      }
      const quoteAsset = body.quoteAsset || (broker.id === 'upstox' ? 'INR' : 'USDT');
      const order = await broker.placeOrder({
        userId: req.user!.id,
        broker: broker.id,
        symbol: body.symbol,
        asset: body.asset,
        quoteAsset,
        side: body.side,
        type: body.type,
        quantity: body.quantity,
        price: body.price,
        product: body.product,
        validity: body.validity,
        triggerPrice: body.triggerPrice,
        disclosedQuantity: body.disclosedQuantity,
        slice: body.slice,
        confirmationId: body.confirmationId,
        accountMode,
        marketQuoteAgeMs: body.marketQuoteAgeMs || 0,
        idempotencyKey: body.idempotencyKey || `idemp_ord_${Date.now()}`,
        auto: isAutonomous,
        isAutonomous,
        strategyName: body.strategyName,
        strategyId: (body as any).strategyId,
      } as any);

      return { success: true, order };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message, code: err.code });
    }
  });

  server.get('/api/emergency/status', { preHandler: requireAuth }, async () => {
    const status = await EmergencyControlService.getStatus();
    return { success: true, status };
  });

  server.post('/api/emergency/panic', { preHandler: requireAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body as any) || {};
    try {
      const summary = await EmergencyControlService.executePanicSquareOff(
        req.user!.id,
        body.broker || 'upstox',
        body.reason || 'Manual Panic Square-Off from Dashboard',
        req.user!.id
      );
      return { success: true, summary };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.post('/api/emergency/halt', { preHandler: requireAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body as any) || {};
    try {
      const status = await EmergencyControlService.setState(
        'TRADING_HALTED',
        body.reason || 'Manual Trading Halt from Terminal',
        req.user!.id
      );
      return { success: true, status };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.post('/api/emergency/resume', { preHandler: requireAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body as any) || {};
    try {
      const status = await EmergencyControlService.setState(
        'TRADING_NORMAL',
        body.reason || 'Trading Resumed by Operator',
        req.user!.id
      );
      return { success: true, status };
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
    const body = req.body as { clientOrderId: string; broker?: string };
    if (!body?.clientOrderId) {
      return reply.status(400).send({ success: false, error: 'clientOrderId is required' });
    }
    try {
      const db = getDb();
      const existing = await db.queryOne<{ broker: string; client_order_id: string }>(
        `SELECT broker, client_order_id FROM exchange_orders WHERE user_id = ? AND (client_order_id = ? OR id = ? OR exchange_order_id = ?)`,
        [req.user!.id, body.clientOrderId, body.clientOrderId, body.clientOrderId]
      );
      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: `Order ${body.clientOrderId} not found for cancellation. Cancellation requires an authoritative local canonical record.`,
        });
      }
      const broker = BrokerRegistry.get(existing.broker);
      const order = await broker.cancelOrder(req.user!.id, existing.client_order_id);
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
    const authCheck = authorizeKillSwitch(req.user, body.scope, body.target, 'freeze');
    if (!authCheck.authorized) {
      return reply.status(403).send({ success: false, error: authCheck.error });
    }
    await OperationalSafetyService.freeze(body.scope, authCheck.resolvedTarget, body.reason, req.user!.id);
    return { success: true, message: `Emergency freeze activated for ${body.scope}:${authCheck.resolvedTarget}` };
  });

  server.post('/api/operational/kill-switch/unfreeze', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { scope: 'GLOBAL' | 'ACCOUNT' | 'SYMBOL'; target?: string; reason: string };
    if (!body?.scope || !body?.reason) {
      return reply.status(400).send({ success: false, error: 'Scope and reason are required' });
    }
    const authCheck = authorizeKillSwitch(req.user, body.scope, body.target, 'unfreeze');
    if (!authCheck.authorized) {
      return reply.status(403).send({ success: false, error: authCheck.error });
    }
    await OperationalSafetyService.unfreeze(body.scope, authCheck.resolvedTarget, body.reason, req.user!.id);
    return { success: true, message: `Emergency freeze deactivated for ${body.scope}:${authCheck.resolvedTarget}` };
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

      console.log(`[BrokerRegistry] Initializing registered broker execution gateways...`);
      await BrokerRegistry.initialize();

      const registeredBrokers = BrokerRegistry.getAll();
      const needsClockSync = registeredBrokers.some((b) => b.capabilities.supportsClockSync);
      const needsPortfolioStream = registeredBrokers.some((b) => b.capabilities.supportsPortfolioStream);

      console.log(`[ExchangeRules] Loading authoritative exchange rules...`);
      await SymbolRulesService.refreshRules().catch((err: any) => {
        if (config.NODE_ENV === 'production') {
          throw new Error(`Failed to load authoritative exchange rules on startup: ${err.message}`);
        }
        console.warn(`[ExchangeRules] Non-production startup: exchangeInfo refresh skipped or failed: ${err.message}`);
      });

      if (needsClockSync) {
        console.log(`[ClockSync] Synchronizing server clock with exchange venue...`);
        await ClockSyncService.synchronize().catch((err: any) => {
          console.warn(`[ClockSync] Initial clock sync warning: ${err.message}`);
        });
        ClockSyncService.startPeriodicSync();
      }

      if (needsPortfolioStream) {
        UserDataStreamManager.startKeepAliveLoop();
        await UserDataStreamManager.restoreAllActiveStreams().catch((err: any) => {
          console.warn(`[UserDataStream] Failed to restore active streams: ${err.message}`);
        });
      }

      console.log(`[Reconciliation] Running authoritative startup reconciliation sweep...`);
      await ReconciliationWorker.runReconciliation().catch((err: any) => {
        console.warn(`[Reconciliation] Initial startup reconciliation sweep warning: ${err.message}`);
      });
      ReconciliationWorker.startPeriodicScheduler(60_000);

      console.log(`[UpstoxAuth] Starting Upstox daily session health monitor...`);
      UpstoxTotpAuthService.startScheduler();

      console.log(`[IntradayEgress] Starting mandatory 15:15 IST intraday square-off scheduler...`);
      IntradaySquareOffService.startScheduler();

      console.log(`[InFlightMTM] Starting continuous live margin and stop-out monitor...`);
      InFlightMtmService.startDaemon();

      console.log(`[AutonomousPilot] Starting Autonomous Quant Pilot 5s background execution daemon...`);
      AutonomousPilotWorker.startScheduler();

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
