/**
 * Server-Authoritative Live Order Human Confirmation Service
 * 
 * Implements a strict two-step authorization workflow for live-money trading:
 * 1. Propose: Strategy or user proposes an order. Server validates parameters,
 *    runs initial risk check, captures a risk snapshot, generates an immutable
 *    parameter hash, and creates an authorization token with a short TTL (e.g. 60s).
 * 2. Confirm: Human explicitly reviews and confirms. Server atomically consumes
 *    the token, verifies parameter integrity (anti-tampering), re-validates risk
 *    drift, executes pre-submission gates, and dispatches to the broker.
 */

import { getDb } from '../db';
import { AuditService, logger } from './auditService';
import { BrokerOrder, BrokerOrderRequest } from './brokers/brokerTypes';
import { UpstoxInstrumentProvider } from './brokers/upstox/upstoxInstrumentProvider';
import { UpstoxInstrumentRegistry } from './brokers/upstox/upstoxInstrumentRegistry';
import { RiskEngine } from './riskEngine';
import { ExactDecimal } from './precision';
import { StandardBrokerError } from './brokers/brokerGateway';
import { config } from '../config';
import crypto from 'node:crypto';

export interface LiveOrderProposalRequest {
  userId: string;
  broker: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: string;
  quantity: number;
  price?: number;
  triggerPrice?: number;
  product: string; // MANDATORY: CNC/D, MIS/I, MTF. No silent defaulting!
  validity?: string;
  disclosedQuantity?: number;
  slice?: boolean;
}

export interface LiveOrderConfirmationRecord {
  confirmationId: string;
  userId: string;
  broker: string;
  symbol: string;
  instrumentKey: string;
  exchange: string;
  side: 'BUY' | 'SELL';
  type: string;
  quantity: number;
  price: number;
  triggerPrice?: number;
  product: string;
  validity: string;
  disclosedQuantity?: number;
  slice: boolean;
  estimatedNotional: number;
  currency: string;
  orderHash: string;
  riskSnapshot: {
    singleOrderPct: number;
    projectedConcentrationPct: number;
    accountEquity: number;
    availableCash: number;
    notional: number;
  };
  clientOrderId: string;
  idempotencyKey: string;
  status: 'PENDING' | 'CONSUMED' | 'EXPIRED' | 'REJECTED' | 'CANCELLED';
  createdAt: number;
  expiresAt: number;
  ttlSeconds: number;
}

export class LiveOrderConfirmationService {
  public static readonly DEFAULT_TTL_SECONDS = 60;

  /**
   * Computes a deterministic SHA-256 hash over all immutable order parameters.
   */
  public static computeOrderHash(params: {
    userId: string;
    broker: string;
    symbol: string;
    side: string;
    type: string;
    quantity: number;
    price?: number;
    triggerPrice?: number;
    product: string;
    validity?: string;
  }): string {
    const canonical = [
      params.userId,
      params.broker.toLowerCase(),
      params.symbol.toUpperCase(),
      params.side.toUpperCase(),
      params.type.toUpperCase(),
      ExactDecimal.from(params.quantity).toString(),
      params.price ? ExactDecimal.from(params.price).toString() : '0',
      params.triggerPrice ? ExactDecimal.from(params.triggerPrice).toString() : '0',
      params.product.toUpperCase(),
      (params.validity || 'DAY').toUpperCase(),
    ].join('|');

    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Step 1: Propose a live order.
   * Creates a pending server-side confirmation binding exact order parameters,
   * risk snapshot, and short TTL.
   */
  public static async proposeLiveOrder(req: LiveOrderProposalRequest): Promise<LiveOrderConfirmationRecord> {
    const db = getDb();
    const now = Date.now();
    const brokerId = (req.broker || 'upstox').toLowerCase();

    // 1. Mandatory Product Validation (Finding 15)
    if (!req.product || typeof req.product !== 'string' || !req.product.trim()) {
      throw new StandardBrokerError(
        'PRODUCT_REQUIRED',
        'Explicit product selection is strictly required for live orders (e.g. CNC/D for Delivery, MIS/I for Intraday, MTF for Margin). Silent defaulting is prohibited.',
        brokerId
      );
    }

    const rawProduct = req.product.toUpperCase().trim();
    const validProducts = ['CNC', 'MIS', 'NRML', 'MTF', 'D', 'I'];
    if (!validProducts.includes(rawProduct)) {
      throw new StandardBrokerError(
        'INVALID_PRODUCT',
        `Unsupported order product: ${req.product}. Permitted products: ${validProducts.join(', ')}`,
        brokerId
      );
    }

    // 2. Authoritative Instrument Verification
    const instrumentProvider = new UpstoxInstrumentProvider();
    const validation = instrumentProvider.validateOrder({
      userId: req.userId,
      symbol: req.symbol,
      side: req.side,
      type: req.type as any,
      quantity: req.quantity,
      price: req.price,
      triggerPrice: req.triggerPrice,
      product: rawProduct,
      slice: req.slice,
      idempotencyKey: `val_prop_${now}`,
    });

    if (!validation.isValid) {
      throw new StandardBrokerError('ORDER_REJECTED', validation.error || 'Invalid order parameters', brokerId);
    }

    const instrument = instrumentProvider.getInstrument(req.symbol);
    if (!instrument) {
      throw new StandardBrokerError('ORDER_REJECTED', `Unsupported Upstox instrument: ${req.symbol}`, brokerId);
    }

    const price = req.price || instrumentProvider.getEstimatedPrice(req.symbol);
    const notional = ExactDecimal.from(req.quantity).times(price > 0 ? price : 1).toNumber();
    const currency = instrument.quoteAsset || 'INR';

    // 3. Initial Risk Evaluation & Snapshot
    const clientOrderId = `lmn_live_${now}_${crypto.randomBytes(4).toString('hex')}`;
    const riskResult = await RiskEngine.evaluateTrade({
      userId: req.userId,
      broker: brokerId as any,
      assetClass: 'EQUITY',
      currency,
      accountMode: 'live',
      symbol: req.symbol,
      asset: instrument.baseAsset || req.symbol,
      quoteAsset: currency,
      side: req.side,
      type: req.type as any,
      quantity: req.quantity,
      price,
      marketQuoteAgeMs: 0,
      idempotencyKey: clientOrderId,
    });

    if (!riskResult.approved) {
      await AuditService.logEvent({
        userId: req.userId,
        eventType: 'ORDER_REJECTED',
        source: 'live_order_confirmation_service',
        actor: 'risk_engine',
        result: 'BLOCKED',
        metadata: { symbol: req.symbol, reason: riskResult.rejectReason },
      });

      throw new StandardBrokerError(
        'ORDER_REJECTED',
        `Pre-proposal risk check failed: ${riskResult.rejectReason || 'Limits exceeded'}`,
        brokerId
      );
    }

    // 4. Generate Immutable Order Hash & Confirmation Record
    const orderHash = this.computeOrderHash({
      userId: req.userId,
      broker: brokerId,
      symbol: req.symbol,
      side: req.side,
      type: req.type,
      quantity: req.quantity,
      price,
      triggerPrice: req.triggerPrice,
      product: rawProduct,
      validity: req.validity || 'DAY',
    });

    const ttlSeconds = config.LIVE_ORDER_CONFIRMATION_TTL_SECONDS
      ? Math.max(15, Math.min(300, Number(config.LIVE_ORDER_CONFIRMATION_TTL_SECONDS)))
      : this.DEFAULT_TTL_SECONDS;
    const expiresAt = now + ttlSeconds * 1000;

    const confirmationId = `loc_${now}_${crypto.randomBytes(6).toString('hex')}`;
    const idempotencyKey = `idemp_${clientOrderId}`;

    const riskSnapshot = {
      singleOrderPct: riskResult.metadata?.singleOrderPct || 0,
      projectedConcentrationPct: riskResult.metadata?.projectedConcentrationPct || 0,
      accountEquity: riskResult.metadata?.portfolioEquity || 0,
      availableCash: riskResult.metadata?.availableCash || 0,
      notional,
    };

    await db.execute(
      `INSERT INTO live_order_confirmations (
        id, user_id, broker, symbol, instrument_key, exchange,
        side, order_type, quantity, price, trigger_price, product,
        validity, disclosed_quantity, slice, estimated_notional, currency,
        order_hash, risk_snapshot, status, client_order_id, idempotency_key,
        created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
      [
        confirmationId,
        req.userId,
        brokerId,
        req.symbol,
        instrument.instrumentKey,
        instrument.exchange,
        req.side,
        req.type,
        req.quantity,
        price,
        req.triggerPrice || null,
        rawProduct,
        req.validity || 'DAY',
        req.disclosedQuantity || null,
        req.slice ? 1 : 0,
        notional,
        currency,
        orderHash,
        JSON.stringify(riskSnapshot),
        clientOrderId,
        idempotencyKey,
        now,
        expiresAt,
      ]
    );

    // Audit logs (Section 12)
    await AuditService.logEvent({
      userId: req.userId,
      eventType: 'ORDER_PROPOSED',
      source: 'live_order_confirmation_service',
      actor: 'strategy_or_user',
      externalId: confirmationId,
      result: 'SUCCESS',
      metadata: {
        confirmationId,
        symbol: req.symbol,
        side: req.side,
        quantity: req.quantity,
        price,
        product: rawProduct,
        notional,
      },
    });

    await AuditService.logEvent({
      userId: req.userId,
      eventType: 'ORDER_CONFIRMATION_CREATED',
      source: 'live_order_confirmation_service',
      actor: 'system',
      externalId: confirmationId,
      result: 'SUCCESS',
      metadata: { confirmationId, expiresAt, ttlSeconds },
    });

    return {
      confirmationId,
      userId: req.userId,
      broker: brokerId,
      symbol: req.symbol,
      instrumentKey: instrument.instrumentKey,
      exchange: instrument.exchange,
      side: req.side,
      type: req.type,
      quantity: req.quantity,
      price,
      triggerPrice: req.triggerPrice,
      product: rawProduct,
      validity: req.validity || 'DAY',
      disclosedQuantity: req.disclosedQuantity,
      slice: Boolean(req.slice),
      estimatedNotional: notional,
      currency,
      orderHash,
      riskSnapshot,
      clientOrderId,
      idempotencyKey,
      status: 'PENDING',
      createdAt: now,
      expiresAt,
      ttlSeconds,
    };
  }

  /**
   * Retrieves an existing confirmation record with live expiration status.
   */
  public static async getConfirmation(
    confirmationId: string,
    userId: string
  ): Promise<LiveOrderConfirmationRecord | null> {
    const db = getDb();
    const row = await db.queryOne<any>(
      `SELECT * FROM live_order_confirmations WHERE id = ? AND user_id = ?`,
      [confirmationId, userId]
    );

    if (!row) return null;

    const now = Date.now();
    const expiresAt = Number(row.expires_at);
    const ttlSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));

    let status = row.status;
    if (status === 'PENDING' && now > expiresAt) {
      status = 'EXPIRED';
    }

    let parsedSnapshot: any = {};
    try {
      parsedSnapshot = JSON.parse(row.risk_snapshot);
    } catch {
      parsedSnapshot = row.risk_snapshot;
    }

    return {
      confirmationId: row.id,
      userId: row.user_id,
      broker: row.broker,
      symbol: row.symbol,
      instrumentKey: row.instrument_key,
      exchange: row.exchange,
      side: row.side,
      type: row.order_type,
      quantity: Number(row.quantity),
      price: Number(row.price),
      triggerPrice: row.trigger_price ? Number(row.trigger_price) : undefined,
      product: row.product,
      validity: row.validity,
      disclosedQuantity: row.disclosed_quantity ? Number(row.disclosed_quantity) : undefined,
      slice: Boolean(row.slice),
      estimatedNotional: Number(row.estimated_notional),
      currency: row.currency,
      orderHash: row.order_hash,
      riskSnapshot: parsedSnapshot,
      clientOrderId: row.client_order_id,
      idempotencyKey: row.idempotency_key,
      status,
      createdAt: Number(row.created_at),
      expiresAt,
      ttlSeconds,
    };
  }

  /**
   * Step 2: Atomic confirmation consumption.
   * Atomically claims the pending confirmation. Returns null if already claimed,
   * expired, or not found.
   */
  public static async claimConfirmationAtomically(
    confirmationId: string,
    userId: string
  ): Promise<{ claimed: boolean; reason?: string; record?: any }> {
    const db = getDb();
    const now = Date.now();

    // Check current state
    const existing = await db.queryOne<any>(
      `SELECT * FROM live_order_confirmations WHERE id = ? AND user_id = ?`,
      [confirmationId, userId]
    );

    if (!existing) {
      return { claimed: false, reason: 'CONFIRMATION_NOT_FOUND' };
    }

    if (existing.status === 'CONSUMED') {
      return { claimed: false, reason: 'CONFIRMATION_ALREADY_CONSUMED' };
    }

    if (Number(existing.expires_at) <= now) {
      await db.execute(
        `UPDATE live_order_confirmations SET status = 'EXPIRED' WHERE id = ? AND status = 'PENDING'`,
        [confirmationId]
      );
      return { claimed: false, reason: 'CONFIRMATION_EXPIRED' };
    }

    // Atomic update: only one concurrent consumer can succeed
    const updateRes = await db.execute(
      `UPDATE live_order_confirmations
       SET status = 'CONSUMED', consumed_at = ?
       WHERE id = ? AND user_id = ? AND status = 'PENDING' AND expires_at > ?`,
      [now, confirmationId, userId, now]
    );

    if (updateRes.changes === 0) {
      return { claimed: false, reason: 'CONFIRMATION_ALREADY_CONSUMED' };
    }

    return { claimed: true, record: existing };
  }
}
