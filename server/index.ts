import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import sensible from '@fastify/sensible';
import { config, auditServerSecurityConfig } from './config';
import { getDb } from './db';
import { ServerAuthService } from './services/authService';
import { requireAuth, requireActive, requireKYC, extractSessionToken } from './middleware/authMiddleware';
import { LedgerService } from './services/ledgerService';
import { PaymentService } from './services/paymentService';
import { BinanceGateway } from './services/binanceGateway';
import { ServerRiskEngine } from './services/riskEngine';
import { ReconciliationWorker } from './services/reconciliationWorker';
import { AuditService, logger } from './services/auditService';

export function buildServer(): FastifyInstance {
  const server = Fastify({
    logger: false, // We use our own pino logger in AuditService
  });

  server.register(sensible);

  // CORS Configuration
  const allowedOrigins = config.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  server.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin) || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        cb(null, true);
        return;
      }
      cb(null, true); // Permissive in dev
    },
    credentials: true,
  });

  // Cookie Support
  server.register(cookie, {
    secret: config.SESSION_SECRET,
    parseOptions: {},
  });

  // Health check
  server.get('/health', async () => ({ status: 'UP', env: config.NODE_ENV, timestamp: Date.now() }));

  // ==========================================================================
  // AUTHENTICATION ROUTES (Phase 2 & Phase 3)
  // ==========================================================================

  server.post('/api/auth/google', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { credential: string };
    if (!body?.credential) {
      return reply.status(400).send({ success: false, error: 'Google credential token is required' });
    }

    try {
      const verified = await ServerAuthService.verifyGoogleIdToken(body.credential);
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

      reply.setCookie('lumen_session', session.rawToken, {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
      });

      return { success: true, user, token: session.rawToken };
    } catch (err: any) {
      return reply.status(401).send({ success: false, error: err.message });
    }
  });

  server.post('/api/auth/apple', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { identityToken: string; nonce?: string; displayName?: string };
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

      reply.setCookie('lumen_session', session.rawToken, {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
      });

      return { success: true, user, token: session.rawToken };
    } catch (err: any) {
      return reply.status(401).send({ success: false, error: err.message });
    }
  });

  server.post('/api/auth/email', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { email: string; displayName?: string };
    if (!body?.email || !body.email.includes('@')) {
      return reply.status(400).send({ success: false, error: 'Valid email address required' });
    }

    const user = await ServerAuthService.getOrCreateUser({
      email: body.email,
      displayName: body.displayName || body.email.split('@')[0],
      provider: 'email',
      providerId: `email_${crypto.createHash('md5').update(body.email).digest('hex')}`,
    });

    const session = await ServerAuthService.createSession(
      user.id,
      req.headers['user-agent'] || 'Browser',
      req.ip
    );

    reply.setCookie('lumen_session', session.rawToken, {
      path: '/',
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    });

    return { success: true, user, token: session.rawToken };
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

  server.post('/api/payments/create-intent', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { amountMinor: number; currency: 'USD' | 'INR'; method: 'card' | 'upi'; idempotencyKey: string };
    if (!body?.amountMinor || body.amountMinor <= 0) {
      return reply.status(400).send({ success: false, error: 'Positive amount required' });
    }

    try {
      const intent = await PaymentService.createPaymentOrder({
        userId: req.user!.id,
        amountMinor: body.amountMinor,
        currency: body.currency,
        method: body.method,
        idempotencyKey: body.idempotencyKey || `idemp_${Date.now()}`,
      });
      return { success: true, intent };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  server.post('/api/payments/submit-utr', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { utr: string; amountINR: number; orderId?: string };
    if (!body?.utr || !body.amountINR) {
      return reply.status(400).send({ success: false, error: 'UTR and amountINR are required' });
    }

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
    const rawPayload = JSON.stringify(req.body);

    if (!signature) {
      return reply.status(400).send({ success: false, error: 'Missing webhook signature header' });
    }

    try {
      const result = await PaymentService.processWebhook(rawPayload, signature, req.body as any);
      return { success: true, result };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Dedicated PhonePe Webhook Endpoint (Phase 4)
  server.post('/api/webhooks/phonepe', async (req: FastifyRequest, reply: FastifyReply) => {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    try {
      const result = await PaymentService.processPhonePeWebhook(rawBody, req.headers as any);
      return { success: true, result };
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
      return { success: true, audit, message: 'Exchange credentials securely audited and encrypted at rest.' };
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

  const server = buildServer();
  server.listen({ port: config.PORT, host: config.HOST }, (err, address) => {
    if (err) {
      console.error('Server failed to start:', err);
      process.exit(1);
    }
    console.log(`Lumen Enterprise Server running at ${address} [ENV: ${config.NODE_ENV}]`);
  });
}

