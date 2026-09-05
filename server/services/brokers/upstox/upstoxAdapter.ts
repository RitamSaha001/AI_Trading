/**
 * Upstox Production Broker Gateway Adapter
 *
 * Implements BrokerGateway for Upstox API v2.
 * Coordinates order placement, unknown order reconciliation,
 * ledger reservations, pre-trade risk evaluation, and Indian equities precision.
 */

import crypto from 'node:crypto';
import { getDb } from '../../../db';
import { config } from '../../../config';
import { ExactDecimal } from '../../precision';
import { AuditService } from '../../auditService';
import { LedgerService } from '../../ledgerService';
import { RiskEngine } from '../../riskEngine';
import { InstrumentRulesService } from '../../instrumentRules';
import { OrderStateMachine } from '../../orderStateMachine';
import {
  BrokerAccount,
  BrokerBalance,
  BrokerCapabilities,
  BrokerFill,
  BrokerFunds,
  BrokerHolding,
  BrokerId,
  BrokerInstrument,
  BrokerMarketQuote,
  BrokerOrder,
  BrokerOrderRequest,
  BrokerOrderStatus,
  BrokerPosition,
  BrokerTrade,
  BrokerError,
  BrokerErrorCategory,
  ReconcileVenueResult,
} from '../brokerTypes';
import { BrokerGateway, StandardBrokerError } from '../brokerGateway';
import { UpstoxClient } from './upstoxClient';
import { UpstoxInstrumentProvider } from './upstoxInstrumentProvider';
import {
  UpstoxOrderBookItem,
  UpstoxPlaceOrderPayload,
  UpstoxTradeItem,
} from './upstoxTypes';
import {
  calculateNextUpstoxExpiry,
  getTokenHealth,
  UpstoxTokenHealth,
} from './upstoxExpiry';
import { IndianMarketCalendar } from './indianMarketCalendar';
import { LiveOrderGateService } from '../../liveOrderGateService';

export class UpstoxAdapter implements BrokerGateway {
  public readonly id: BrokerId = 'upstox';
  public readonly name: string = 'Upstox India';

  public readonly capabilities: BrokerCapabilities = {
    supportsTrading: true,
    supportsMarketData: true,
    supportsHistoricalData: true,
    supportsPortfolioStream: false,
    supportsMarketStream: true,
    supportsModifyOrder: true,
    supportsCancelOrder: true,
    supportsSandbox: true,
    supportsOAuth: true,
    supportsApiKeyAuth: false,
    supportsStaticIpRequirement: true,
    supportsClockSync: false,
  };

  private instrumentProvider = new UpstoxInstrumentProvider();

  // ==========================================================================
  // ACCOUNT & CREDENTIALS
  // ==========================================================================

  /**
   * Retrieves sanitized account details for user.
   */
  async getAccount(userId: string): Promise<BrokerAccount | null> {
    const creds = await this.getCredentials(userId);
    const tokenHealth = await this.getTokenHealth(userId);

    if (!creds || !creds.accessToken || tokenHealth.status === 'EXPIRED') {
      return {
        broker: 'upstox',
        userId,
        environment: creds?.environment || 'sandbox',
        connected: false,
        canTrade: false,
        canWithdraw: false,
        canDeposit: false,
        permissions: [],
        isSafe: true,
        securityBadge: 'DISCONNECTED',
        securityWarning: tokenHealth.warning || (creds ? 'Upstox access token expired. Please re-authenticate.' : undefined),
        tokenHealth,
        balances: {},
        latencyMs: 0,
        lastSyncAt: 0,
      };
    }

    try {
      const startTime = Date.now();
      const profile = await UpstoxClient.getProfile(creds.accessToken);
      const latencyMs = Date.now() - startTime;
      const funds = await this.getFunds(userId);
      const balances = await this.getBalances(userId);

      const securityBadge = tokenHealth.status === 'EXPIRING_SOON' ? 'EXPIRING_SOON' : 'OAUTH2_RESTRICTED_SAFE';

      return {
        broker: 'upstox',
        userId,
        environment: creds.environment || 'sandbox',
        connected: true,
        canTrade: profile.is_active && creds.canTrade !== false,
        canWithdraw: false,
        canDeposit: true,
        permissions: profile.products || ['EQUITY'],
        isSafe: true,
        accountReference: profile.user_id,
        securityBadge,
        securityWarning: tokenHealth.warning,
        tokenHealth,
        balances,
        latencyMs,
        lastSyncAt: Date.now(),
      };
    } catch (err: any) {
      if (err instanceof StandardBrokerError && err.code === 'AUTHENTICATION_FAILED') {
        return {
          broker: 'upstox',
          userId,
          environment: creds.environment || 'sandbox',
          connected: false,
          canTrade: false,
          canWithdraw: false,
          canDeposit: false,
          permissions: [],
          isSafe: true,
          securityBadge: 'AUTH_EXPIRED',
          securityWarning: 'Upstox access token expired. Please re-authenticate.',
          tokenHealth: {
            ...tokenHealth,
            status: 'EXPIRED',
            reauthRequired: true,
            warning: 'Upstox access token rejected by exchange. Please re-authenticate.',
          },
          balances: {},
          latencyMs: 0,
          lastSyncAt: Date.now(),
        };
      }
      throw err;
    }
  }

  /**
   * Retrieves funds and margins from Upstox.
   */
  async getFunds(userId: string): Promise<BrokerFunds | null> {
    const creds = await this.getCredentials(userId);
    if (!creds || !creds.accessToken) return null;

    const data = await UpstoxClient.getFunds(creds.accessToken);
    const availableCash = ExactDecimal.from(data.equity?.available_margin || 0);
    const usedMargin = ExactDecimal.from(data.equity?.used_margin || 0);
    const totalEquity = availableCash.plus(usedMargin);

    return {
      broker: 'upstox',
      currency: 'INR',
      availableCash,
      usedMargin,
      totalEquity,
      updatedAt: Date.now(),
    };
  }

  /**
   * Returns normalized balances map.
   */
  async getBalances(userId: string): Promise<Record<string, BrokerBalance>> {
    const funds = await this.getFunds(userId);
    if (!funds) return {};

    return {
      INR: {
        asset: 'INR',
        free: funds.availableCash.toNumber(),
        locked: (funds.usedMargin || ExactDecimal.zero()).toNumber(),
        total: funds.totalEquity.toNumber(),
      },
    };
  }

  /**
   * Retrieves open positions.
   */
  async getPositions(userId: string): Promise<BrokerPosition[]> {
    const creds = await this.getCredentials(userId);
    if (!creds || !creds.accessToken) return [];

    const positions = await UpstoxClient.getPositions(creds.accessToken);
    return positions.map((p) => ({
      instrumentKey: p.instrument_token,
      symbol: p.trading_symbol || p.symbol || '',
      quantity: String(p.quantity),
      averagePrice: String(p.average_price || p.buy_price || 0),
      currentPrice: p.last_price !== undefined ? String(p.last_price) : undefined,
      unrealizedPnl: p.unrealised_pnl !== undefined ? String(p.unrealised_pnl) : undefined,
      realizedPnl: p.realised_pnl !== undefined ? String(p.realised_pnl) : undefined,
      product: p.product === 'I' ? 'INTRADAY' : (p.product === 'D' ? 'DELIVERY' : p.product),
    }));
  }

  /**
   * Retrieves long-term equity holdings.
   */
  async getHoldings(userId: string): Promise<BrokerHolding[]> {
    const creds = await this.getCredentials(userId);
    if (!creds || !creds.accessToken) return [];

    const holdings = await UpstoxClient.getHoldings(creds.accessToken);
    return holdings.map((h) => ({
      instrumentKey: h.instrument_token,
      symbol: h.trading_symbol || h.symbol || '',
      isin: h.isin,
      quantity: String(h.quantity),
      authorizedQuantity: String(h.quantity),
      averagePrice: String(h.average_price),
      currentPrice: h.last_price !== undefined ? String(h.last_price) : undefined,
      pnl: h.pnl !== undefined ? String(h.pnl) : undefined,
    }));
  }

  /**
   * Encrypts and securely stores Upstox OAuth credentials.
   */
  async saveCredentials(userId: string, credentials: any): Promise<any> {
    const db = getDb();
    let accessToken = credentials.accessToken;

    // If OAuth authorization code was supplied, strictly require and validate CSRF state before exchange
    if (credentials.code) {
      if (!credentials.state || typeof credentials.state !== 'string' || !credentials.state.trim()) {
        throw new StandardBrokerError(
          'AUTHENTICATION_FAILED',
          'OAuth state parameter is strictly required when exchanging an authorization code.',
          'upstox'
        );
      }

      const stateRes = await UpstoxClient.validateAndConsumeOAuthState(userId, credentials.state.trim());
      if (!stateRes.valid) {
        throw new StandardBrokerError(
          'AUTHENTICATION_FAILED',
          `OAuth state validation failed: ${stateRes.reason || 'Invalid state token.'}`,
          'upstox'
        );
      }

      const tokenResp = await UpstoxClient.exchangeAuthorizationCode(
        credentials.code,
        credentials.redirectUri
      );
      accessToken = tokenResp.access_token;
    }

    if (!accessToken || typeof accessToken !== 'string' || !accessToken.trim()) {
      throw new StandardBrokerError(
        'AUTHENTICATION_FAILED',
        'Valid Upstox access token or authorization code is required.',
        'upstox'
      );
    }

    // Verify token validity by calling profile API
    const profile = await UpstoxClient.getProfile(accessToken.trim());

    // Calculate token expiration (Upstox tokens expire daily at 3:30 AM IST)
    const tokenExpiresAt = calculateNextUpstoxExpiry(new Date());

    const encryptedToken = this.encryptSecret(accessToken.trim());
    const credId = `cred_upstox_${userId}_${Date.now()}`;
    const rawEnv = String(credentials.environment || config.UPSTOX_ENV || 'sandbox').toLowerCase();
    const environment = (rawEnv === 'prod' || rawEnv === 'production' || rawEnv === 'live') ? 'production' : 'sandbox';

    const accountId = credentials.accountId || profile.user_id;
    const accountName = credentials.userName || credentials.accountName || profile.user_name;

    await db.execute(
      `INSERT INTO broker_credentials (
        id, user_id, broker, environment, auth_type, access_token_encrypted,
        token_expires_at, account_id, account_name, can_trade, can_withdraw, is_safe,
        last_sync_at, created_at, updated_at
      ) VALUES (?, ?, 'upstox', ?, 'oauth2', ?, ?, ?, ?, 1, 0, 1, ?, ?, ?)
      ON CONFLICT(user_id, broker, environment) DO UPDATE SET
        access_token_encrypted = excluded.access_token_encrypted,
        token_expires_at = excluded.token_expires_at,
        account_id = excluded.account_id,
        account_name = excluded.account_name,
        can_trade = excluded.can_trade,
        can_withdraw = excluded.can_withdraw,
        is_safe = excluded.is_safe,
        last_sync_at = excluded.last_sync_at,
        updated_at = excluded.updated_at`,
      [
        credId,
        userId,
        environment,
        encryptedToken,
        tokenExpiresAt,
        accountId,
        accountName,
        Date.now(),
        Date.now(),
        Date.now(),
      ]
    );

    await AuditService.logEvent({
      userId,
      eventType: 'EXCHANGE_CREDENTIALS_SAVED',
      source: 'upstox_adapter',
      actor: 'user',
      metadata: {
        broker: 'upstox',
        environment,
        accountId,
        expiresAt: tokenExpiresAt,
      },
      result: 'SUCCESS',
    });

    return {
      connected: true,
      broker: 'upstox',
      environment,
      accountId,
      userName: accountName,
      canTrade: true,
      tokenExpiresAt,
    };
  }

  /**
   * Wipes stored Upstox credentials.
   */
  async disconnectAccount(userId: string): Promise<void> {
    const db = getDb();
    await db.execute(`DELETE FROM broker_credentials WHERE user_id = ? AND broker = 'upstox'`, [userId]);

    await AuditService.logEvent({
      userId,
      eventType: 'EXCHANGE_DISCONNECTED',
      source: 'upstox_adapter',
      actor: 'user',
      metadata: { broker: 'upstox' },
      result: 'SUCCESS',
    });
  }

  /**
   * Internal helper: retrieves decrypted credentials for user.
   */
  async getCredentials(
    userId: string,
    targetEnv?: string
  ): Promise<{ accessToken: string; environment: string; accountId?: string; canTrade: boolean } | null> {
    const db = getDb();
    const rawTarget = targetEnv ? String(targetEnv).toLowerCase() : undefined;
    const normalizedTarget = rawTarget
      ? (rawTarget === 'prod' || rawTarget === 'production' || rawTarget === 'live' ? 'production' : 'sandbox')
      : undefined;

    let row: any;
    if (normalizedTarget) {
      row = await db.queryOne<any>(
        `SELECT * FROM broker_credentials WHERE user_id = ? AND broker = 'upstox' AND (environment = ? OR (environment = 'prod' AND ? = 'production')) ORDER BY updated_at DESC LIMIT 1`,
        [userId, normalizedTarget, normalizedTarget]
      );
    } else {
      const preferredEnv = ((config.UPSTOX_ENV || 'sandbox').toLowerCase() === 'production' || (config.UPSTOX_ENV || '').toLowerCase() === 'prod')
        ? 'production'
        : 'sandbox';
      row = await db.queryOne<any>(
        `SELECT * FROM broker_credentials WHERE user_id = ? AND broker = 'upstox' AND (environment = ? OR (environment = 'prod' AND ? = 'production')) ORDER BY updated_at DESC LIMIT 1`,
        [userId, preferredEnv, preferredEnv]
      );
      if (!row) {
        row = await db.queryOne<any>(
          `SELECT * FROM broker_credentials WHERE user_id = ? AND broker = 'upstox' ORDER BY updated_at DESC LIMIT 1`,
          [userId]
        );
      }
    }

    if (!row || !row.access_token_encrypted) return null;

    // Check expiration
    if (row.token_expires_at && Number(row.token_expires_at) < Date.now()) {
      return {
        accessToken: '',
        environment: row.environment,
        accountId: row.account_id,
        canTrade: false,
      };
    }

    try {
      const accessToken = this.decryptSecret(row.access_token_encrypted);
      return {
        accessToken,
        environment: row.environment,
        accountId: row.account_id,
        canTrade: Boolean(row.can_trade),
      };
    } catch {
      return null;
    }
  }

  /**
   * Public helper to load decrypted credentials for a user.
   * Returns null if missing or expired.
   */
  async loadCredentials(userId: string): Promise<{ accessToken: string; environment: string; accountId?: string; canTrade: boolean } | null> {
    const creds = await this.getCredentials(userId);
    if (!creds || !creds.accessToken) return null;
    return creds;
  }

  /**
   * Retrieves real-time token health, remaining validity, and 03:30 AM IST cutoff status.
   */
  async getTokenHealth(userId: string): Promise<UpstoxTokenHealth> {
    const db = getDb();
    const row = await db.queryOne<any>(
      `SELECT token_expires_at FROM broker_credentials WHERE user_id = ? AND broker = 'upstox' ORDER BY updated_at DESC LIMIT 1`,
      [userId]
    );

    const tokenExpiresAt = row?.token_expires_at ? Number(row.token_expires_at) : null;
    return getTokenHealth(tokenExpiresAt);
  }

  // ==========================================================================
  // ORDERS & TRADING
  // ==========================================================================

  /**
   * Submits an order with pre-trade risk evaluation and authoritative state tracking.
   */
  async placeOrder(order: BrokerOrderRequest): Promise<BrokerOrder> {
    const db = getDb();
    const accountMode = order.accountMode || 'live';
    const clientOrderId = order.clientOrderId || order.idempotencyKey || `lm_upstox_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // 1. Authoritative Instrument Rules Pre-Trade Validation
    const validation = this.instrumentProvider.validateOrder(order);
    if (!validation.isValid) {
      throw new StandardBrokerError('ORDER_REJECTED', validation.error || 'Invalid order parameters', 'upstox');
    }

    const instrument = this.instrumentProvider.getInstrument(order.symbol);
    if (!instrument) {
      throw new StandardBrokerError('ORDER_REJECTED', `Unknown instrument: ${order.symbol}`, 'upstox');
    }

    // 2. Paper Simulation Path
    if (accountMode === 'paper') {
      const riskResult = await RiskEngine.evaluateTrade({
        userId: order.userId,
        broker: 'upstox',
        assetClass: 'EQUITY',
        currency: instrument.quoteAsset || 'INR',
        accountMode: 'paper',
        symbol: order.symbol,
        asset: instrument.baseAsset || order.symbol,
        quoteAsset: instrument.quoteAsset || 'INR',
        side: order.side,
        type: order.type,
        quantity: order.quantity,
        price: order.price || 0,
        marketQuoteAgeMs: order.marketQuoteAgeMs || 0,
        idempotencyKey: clientOrderId,
      });

      if (!riskResult.approved) {
        throw new StandardBrokerError(
          'ORDER_REJECTED',
          `Risk check rejected: ${riskResult.rejectReason || 'Limits exceeded'}`,
          'upstox'
        );
      }

      return this.executePaperOrder(order, clientOrderId, instrument);
    }

    // 3. Live Mode Execution Pipeline: Server-Authoritative 15-Point Live Order Gate
    const gateResult = await LiveOrderGateService.verifyLiveOrderPreSubmission(order, order.confirmationId);
    const creds = gateResult.credentials;
    const price = order.price ? Number(order.price) : (this.instrumentProvider.getEstimatedPrice(order.symbol) || 0);
    const notional = ExactDecimal.from(order.quantity).times(price > 0 ? price : 1);
    const now = Date.now();

    await AuditService.logEvent({
      userId: order.userId,
      eventType: 'ORDER_SUBMISSION_STARTED',
      source: 'upstox_adapter',
      actor: 'execution_service',
      metadata: { clientOrderId, symbol: order.symbol, side: order.side, quantity: order.quantity, notional: notional.toNumber() },
      result: 'SUCCESS',
    });

    // Insert record into exchange_orders with status SUBMITTING
    const orderRecordId = `ord_upstox_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await db.execute(
      `INSERT INTO exchange_orders (
        id, user_id, client_order_id, symbol, side, type, status,
        orig_qty, executed_qty, price, avg_price, quote_asset, notional,
        fee, reserved_cash, reserved_qty, orig_qty_exact, price_exact, notional_exact,
        broker, idempotency_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'SUBMITTING', ?, 0, ?, 0, ?, ?, 0, ?, 0, ?, ?, ?, 'upstox', ?, ?, ?)`,
      [
        orderRecordId,
        order.userId,
        clientOrderId,
        order.symbol,
        order.side,
        order.type,
        order.quantity,
        price,
        instrument.quoteAsset || 'INR',
        notional.toNumber(),
        order.side === 'BUY' ? notional.toNumber() : 0,
        String(order.quantity),
        String(price),
        notional.toString(),
        order.idempotencyKey || clientOrderId,
        now,
        now,
      ]
    );

    // Dynamic Product Selection (Finding 3)
    let product: 'D' | 'I' | 'MTF' = 'D';
    if (order.product) {
      const p = String(order.product).toUpperCase().trim();
      if (p === 'I' || p === 'MIS' || p === 'INTRADAY') {
        product = 'I';
      } else if (p === 'MTF') {
        product = 'MTF';
      } else {
        product = 'D'; // CNC / DELIVERY / D default
      }
    }

    // Expanded Order Intent (Finding 10)
    const validity: 'DAY' | 'IOC' = (String(order.validity).toUpperCase() === 'IOC') ? 'IOC' : 'DAY';
    let upstoxOrderType: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M' = 'LIMIT';
    if (order.type === 'MARKET') {
      upstoxOrderType = 'MARKET';
    } else if (order.type === 'STOP_LOSS' || order.type === 'SL-M' || order.type === 'SL_M') {
      upstoxOrderType = 'SL-M';
    } else if (order.type === 'STOP_LOSS_LIMIT' || order.type === 'SL') {
      upstoxOrderType = 'SL';
    } else {
      upstoxOrderType = 'LIMIT';
    }

    const triggerPriceNum = order.triggerPrice ? Number(order.triggerPrice) : undefined;
    const disclosedQtyNum = order.disclosedQuantity ? Number(order.disclosedQuantity) : undefined;

    const payload: UpstoxPlaceOrderPayload = {
      quantity: Number(order.quantity),
      product,
      validity,
      price: upstoxOrderType === 'MARKET' ? 0 : price,
      tag: clientOrderId.slice(-20),
      instrument_token: instrument.instrumentKey,
      order_type: upstoxOrderType,
      transaction_type: order.side,
      trigger_price: triggerPriceNum,
      disclosed_quantity: disclosedQtyNum,
      slice: order.slice,
    };

    let resp: any = null;
    try {
      resp = await UpstoxClient.placeOrder(creds.accessToken, payload);
    } catch (err: any) {
      const isNetworkTimeout = err instanceof StandardBrokerError && err.code === 'NETWORK_ERROR';

      if (isNetworkTimeout) {
        // AMBIGUOUS STATE: Transition to UNKNOWN, do NOT assume FAILED
        await db.execute(
          `UPDATE exchange_orders SET status = 'UNKNOWN', reject_reason = ?, updated_at = ? WHERE client_order_id = ?`,
          [`Network timeout: ${err.message}`, Date.now(), clientOrderId]
        ).catch(() => {});

        await AuditService.logEvent({
          userId: order.userId,
          eventType: 'ORDER_UNKNOWN',
          source: 'upstox_adapter',
          actor: 'execution_service',
          metadata: { clientOrderId, error: err.message },
          result: 'BLOCKED',
        }).catch(() => {});

        // Trigger immediate venue reconciliation
        await this.reconcileUnknownOrder(clientOrderId, order.symbol, order.userId).catch(() => {});

        return {
          id: clientOrderId,
          clientOrderId,
          broker: 'upstox',
          symbol: order.symbol,
          side: order.side,
          type: order.type,
          status: 'UNKNOWN',
          origQty: String(order.quantity),
          executedQty: '0',
          price: String(price),
          avgPrice: '0',
          quoteAsset: instrument.quoteAsset || 'INR',
          time: now,
          updateTime: Date.now(),
        };
      }

      // Explicit provider rejection: release reservation
      await LedgerService.releaseOrderReservation(clientOrderId).catch(() => {});

      await db.execute(
        `UPDATE exchange_orders SET status = 'REJECTED', reject_reason = ?, updated_at = ? WHERE client_order_id = ?`,
        [err.message, Date.now(), clientOrderId]
      ).catch(() => {});

      await AuditService.logEvent({
        userId: order.userId,
        eventType: 'ORDER_REJECTED',
        source: 'upstox_adapter',
        actor: 'upstox_venue',
        metadata: { clientOrderId, error: err.message },
        result: 'BLOCKED',
      }).catch(() => {});

      throw err;
    }

    // BROKER ACCEPTED: resp contains order_id and order_ids
    const primaryVenueOrderId = resp.order_id;
    const venueOrderIds = resp.order_ids && resp.order_ids.length > 0 ? resp.order_ids : [primaryVenueOrderId];

    try {
      await db.execute(
        `UPDATE exchange_orders 
         SET status = 'OPEN', exchange_order_id = ?, venue_order_ids = ?, updated_at = ? 
         WHERE client_order_id = ?`,
        [primaryVenueOrderId, JSON.stringify(venueOrderIds), Date.now(), clientOrderId]
      );

      await AuditService.logEvent({
        userId: order.userId,
        eventType: 'ORDER_SUBMITTED',
        source: 'upstox_adapter',
        actor: 'execution_service',
        metadata: { 
          clientOrderId, 
          exchangeOrderId: primaryVenueOrderId, 
          slicedOrderIds: venueOrderIds.length > 1 ? venueOrderIds : undefined,
          symbol: order.symbol, 
          side: order.side, 
          quantity: order.quantity 
        },
        result: 'SUCCESS',
      });

      return {
        id: clientOrderId,
        clientOrderId,
        exchangeOrderId: primaryVenueOrderId,
        broker: 'upstox',
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        status: 'OPEN',
        origQty: String(order.quantity),
        executedQty: '0',
        price: String(price),
        avgPrice: '0',
        quoteAsset: instrument.quoteAsset || 'INR',
        time: now,
        updateTime: Date.now(),
      };
    } catch (localErr: any) {
      // CRITICAL: Broker accepted, but local DB update failed!
      // Must set status to UNKNOWN, do NOT release reservation, trigger reconciliation!
      await db.execute(
        `UPDATE exchange_orders 
         SET status = 'UNKNOWN', exchange_order_id = ?, venue_order_ids = ?, reject_reason = ?, updated_at = ? 
         WHERE client_order_id = ?`,
        [primaryVenueOrderId, JSON.stringify(venueOrderIds), `Post-broker local DB error: ${localErr.message}`, Date.now(), clientOrderId]
      ).catch(() => {});

      await AuditService.logEvent({
        userId: order.userId,
        eventType: 'ORDER_UNKNOWN',
        source: 'upstox_adapter',
        actor: 'execution_service',
        metadata: { clientOrderId, exchangeOrderId: primaryVenueOrderId, localError: localErr.message },
        result: 'BLOCKED',
      }).catch(() => {});

      await this.reconcileUnknownOrder(clientOrderId, order.symbol, order.userId).catch(() => {});

      return {
        id: clientOrderId,
        clientOrderId,
        exchangeOrderId: primaryVenueOrderId,
        broker: 'upstox',
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        status: 'UNKNOWN',
        origQty: String(order.quantity),
        executedQty: '0',
        price: String(price),
        avgPrice: '0',
        quoteAsset: instrument.quoteAsset || 'INR',
        time: now,
        updateTime: Date.now(),
      };
    }
  }

  /**
   * Cancels active order.
   */
  async cancelOrder(userId: string, clientOrderId: string, symbol?: string): Promise<BrokerOrder> {
    const db = getDb();
    const order = await db.queryOne<any>(
      `SELECT * FROM exchange_orders WHERE user_id = ? AND client_order_id = ?`,
      [userId, clientOrderId]
    );

    if (!order) {
      throw new StandardBrokerError('ORDER_NOT_FOUND', `Order not found: ${clientOrderId}`, 'upstox');
    }

    if (order.status === 'CANCELED' || order.status === 'FILLED') {
      return this.mapOrderRecord(order);
    }

    const creds = await this.getCredentials(userId);
    if (creds?.accessToken) {
      let venueIds: string[] = [];
      if (order.venue_order_ids) {
        try {
          const parsed = JSON.parse(order.venue_order_ids);
          if (Array.isArray(parsed) && parsed.length > 0) venueIds = parsed;
        } catch {}
      }
      if (venueIds.length === 0 && order.exchange_order_id) {
        venueIds = [order.exchange_order_id];
      }

      for (const vId of venueIds) {
        try {
          await UpstoxClient.cancelOrder(creds.accessToken, vId);
        } catch (err: any) {
          if (err instanceof StandardBrokerError && err.code === 'ORDER_NOT_FOUND') {
            // Already cancelled or terminal on venue
          } else {
            throw err;
          }
        }
      }
    }

    // Release reservations
    if (order.side === 'BUY' && order.reserved_cash > 0) {
      await LedgerService.releaseCashReservation(userId, `res_${clientOrderId}`, 'live').catch(() => {});
    }

    await db.execute(
      `UPDATE exchange_orders SET status = 'CANCELED', updated_at = ? WHERE client_order_id = ?`,
      [Date.now(), clientOrderId]
    );

    const updated = await db.queryOne<any>(
      `SELECT * FROM exchange_orders WHERE client_order_id = ?`,
      [clientOrderId]
    );
    return this.mapOrderRecord(updated);
  }

  /**
   * Modifies an existing open order on Upstox.
   */
  async modifyOrder(orderId: string, updates: Partial<BrokerOrderRequest>): Promise<BrokerOrder> {
    const db = getDb();
    const order = await db.queryOne<any>(
      `SELECT * FROM exchange_orders WHERE client_order_id = ? OR exchange_order_id = ?`,
      [orderId, orderId]
    );

    if (!order) {
      throw new StandardBrokerError('ORDER_NOT_FOUND', `Order not found for modification: ${orderId}`, 'upstox');
    }

    if (order.status !== 'OPEN' && order.status !== 'PARTIALLY_FILLED') {
      throw new StandardBrokerError(
        'ORDER_REJECTED',
        `Cannot modify order in status ${order.status}. Only OPEN or PARTIALLY_FILLED orders can be modified.`,
        'upstox'
      );
    }

    const creds = await this.getCredentials(order.user_id);
    if (!creds || !creds.accessToken) {
      throw new StandardBrokerError('AUTHENTICATION_FAILED', 'User has no valid Upstox credentials.', 'upstox');
    }

    const venueOrderId = order.exchange_order_id;
    if (!venueOrderId) {
      throw new StandardBrokerError('ORDER_REJECTED', 'Order has not yet been accepted by venue.', 'upstox');
    }

    const price = updates.price !== undefined ? Number(updates.price) : Number(order.price);
    const quantity = updates.quantity !== undefined ? Number(updates.quantity) : Number(order.orig_qty);

    await UpstoxClient.modifyOrder(creds.accessToken, {
      order_id: venueOrderId,
      price,
      quantity,
      order_type: order.type === 'MARKET' ? 'MARKET' : 'LIMIT',
      validity: 'DAY',
    });

    await db.execute(
      `UPDATE exchange_orders SET price = ?, orig_qty = ?, updated_at = ? WHERE id = ?`,
      [price, quantity, Date.now(), order.id]
    );

    const updated = await db.queryOne<any>(`SELECT * FROM exchange_orders WHERE id = ?`, [order.id]);
    return this.mapOrderRecord(updated);
  }

  /**
   * Retrieves active open orders for user.
   */
  async getOpenOrders(userId: string, symbol?: string): Promise<BrokerOrder[]> {
    const db = getDb();
    const query = symbol
      ? `SELECT * FROM exchange_orders WHERE user_id = ? AND broker = 'upstox' AND symbol = ? AND status IN ('OPEN', 'PARTIALLY_FILLED', 'SUBMITTING')`
      : `SELECT * FROM exchange_orders WHERE user_id = ? AND broker = 'upstox' AND status IN ('OPEN', 'PARTIALLY_FILLED', 'SUBMITTING')`;
    const params = symbol ? [userId, symbol] : [userId];
    const rows = await db.query<any>(query, params);
    return rows.map((r) => this.mapOrderRecord(r));
  }

  /**
   * Retrieves single order by clientOrderId or exchangeOrderId.
   */
  async getOrder(userId: string, orderId: string, symbol?: string): Promise<BrokerOrder | null> {
    const db = getDb();
    const row = await db.queryOne<any>(
      `SELECT * FROM exchange_orders WHERE user_id = ? AND (client_order_id = ? OR exchange_order_id = ?)`,
      [userId, orderId, orderId]
    );
    if (!row) return null;
    return this.mapOrderRecord(row);
  }

  /**
   * Fetches executed trades.
   */
  async getTrades(userId: string, symbol?: string): Promise<BrokerTrade[]> {
    const creds = await this.getCredentials(userId);
    if (!creds || !creds.accessToken) return [];

    const trades = await UpstoxClient.getTradesForDay(creds.accessToken);
    const filtered = symbol ? trades.filter((t) => t.trading_symbol === symbol) : trades;

    return filtered.map((t) => ({
      tradeId: t.trade_id,
      orderId: t.order_id,
      symbol: t.trading_symbol,
      side: t.transaction_type,
      price: String(t.average_price),
      qty: String(t.quantity),
      time: t.exchange_timestamp ? new Date(t.exchange_timestamp).getTime() : Date.now(),
    }));
  }

  // ==========================================================================
  // RECONCILIATION & RECOVERY
  // ==========================================================================

  /**
   * Authoritatively reconciles unknown or ambiguous orders against Upstox venue.
   */
  async reconcileUnknownOrder(
    clientOrderId: string,
    symbol?: string,
    userId?: string
  ): Promise<ReconcileVenueResult> {
    const db = getDb();
    const order = await db.queryOne<any>(
      `SELECT * FROM exchange_orders WHERE client_order_id = ?`,
      [clientOrderId]
    );

    const uid = userId || order?.user_id;
    if (!uid) {
      return { found: false, status: 'UNKNOWN' };
    }

    const creds = await this.getCredentials(uid);
    if (!creds || !creds.accessToken) {
      return { found: false, status: 'UNKNOWN' };
    }

    const tag = clientOrderId.slice(-20);
    const orderBook = await UpstoxClient.getOrderBook(creds.accessToken);
    const venueOrder = orderBook.find(
      (o) => o.tag === tag || (order?.exchange_order_id && o.order_id === order.exchange_order_id)
    );

    if (!venueOrder) {
      // Order not found on venue
      return { found: false, status: 'UNKNOWN' };
    }

    const mappedStatus = this.normalizeOrderStatus(venueOrder.status);
    let fills: BrokerFill[] = [];

    if (mappedStatus === 'FILLED' || mappedStatus === 'PARTIALLY_FILLED') {
      fills = await this.fetchOrderFills(uid, venueOrder.trading_symbol, venueOrder.order_id, clientOrderId);
    }

    // Update local DB state
    if (order) {
      if (mappedStatus === 'FILLED') {
        await db.execute(
          `UPDATE exchange_orders SET status = 'FILLED', exchange_order_id = ?, executed_qty = ?, avg_price = ?, updated_at = ? WHERE client_order_id = ?`,
          [venueOrder.order_id, venueOrder.filled_quantity, venueOrder.average_price, Date.now(), clientOrderId]
        );
      } else if (mappedStatus === 'REJECTED' || mappedStatus === 'CANCELED') {
        await LedgerService.releaseOrderReservation(clientOrderId).catch(() => {});
        await db.execute(
          `UPDATE exchange_orders SET status = ?, exchange_order_id = ?, reject_reason = ?, updated_at = ? WHERE client_order_id = ?`,
          [mappedStatus, venueOrder.order_id, venueOrder.status_message || '', Date.now(), clientOrderId]
        );
      } else if (mappedStatus === 'OPEN') {
        await db.execute(
          `UPDATE exchange_orders SET status = 'OPEN', exchange_order_id = ?, updated_at = ? WHERE client_order_id = ?`,
          [venueOrder.order_id, Date.now(), clientOrderId]
        );
      }
    }

    return {
      found: true,
      exchangeOrderId: venueOrder.order_id,
      status: mappedStatus,
      executedQty: Number(venueOrder.filled_quantity || 0),
      executedQtyExact: String(venueOrder.filled_quantity || 0),
      avgPrice: Number(venueOrder.average_price || 0),
      avgPriceExact: String(venueOrder.average_price || 0),
      fills,
    };
  }

  /**
   * Fetches executed fills for an order.
   */
  async fetchOrderFills(
    userId: string,
    symbol: string,
    exchangeOrderId?: string,
    clientOrderId?: string
  ): Promise<BrokerFill[]> {
    if (!exchangeOrderId) return [];

    const creds = await this.getCredentials(userId);
    if (!creds || !creds.accessToken) return [];

    const trades = await UpstoxClient.getOrderTrades(creds.accessToken, exchangeOrderId);
    return trades.map((t) => ({
      tradeId: t.trade_id,
      fillId: t.trade_id,
      exchangeTradeId: t.trade_id,
      orderId: exchangeOrderId,
      clientOrderId,
      symbol: t.trading_symbol || symbol,
      price: String(t.average_price || t.price || 0),
      qty: String(t.quantity),
      quoteQty: String(t.quantity * (t.average_price || t.price || 0)),
      commission: undefined,
      commissionAsset: 'INR',
      commissionStatus: 'UNRESOLVED',
      time: t.exchange_timestamp ? new Date(t.exchange_timestamp).getTime() : Date.now(),
    }));
  }

  // ==========================================================================
  // MARKET DATA
  // ==========================================================================

  /**
   * Fetches market quote. Supports authenticated token loading or fallback for simulation.
   */
  async getMarketQuote(symbol: string, userId?: string, token?: string): Promise<BrokerMarketQuote | null> {
    const instrument = this.instrumentProvider.getInstrument(symbol);
    if (!instrument) return null;

    try {
      let accessToken = token || '';
      if (!accessToken && userId) {
        const creds = await this.getCredentials(userId);
        if (creds?.accessToken) accessToken = creds.accessToken;
      }

      if (accessToken) {
        const quotes = await UpstoxClient.getQuote(accessToken, instrument.instrumentKey);
        const data = quotes[instrument.instrumentKey] || Object.values(quotes)[0];
        if (data) {
          return {
            symbol,
            bidPrice: data.depth?.buy?.[0]?.price || data.last_price,
            bidQty: data.depth?.buy?.[0]?.quantity || 1,
            askPrice: data.depth?.sell?.[0]?.price || data.last_price,
            askQty: data.depth?.sell?.[0]?.quantity || 1,
            lastPrice: data.last_price,
            lastQty: 1,
            quoteTime: data.timestamp ? new Date(data.timestamp).getTime() : Date.now(),
          };
        }
      }

      // Safe fallback when unauthenticated or for testing
      const estPrice = this.instrumentProvider.getEstimatedPrice(symbol) || 100;
      return {
        symbol,
        bidPrice: estPrice,
        bidQty: 10,
        askPrice: estPrice,
        askQty: 10,
        lastPrice: estPrice,
        lastQty: 1,
        quoteTime: Date.now(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Performs gateway health check.
   */
  async healthCheck(): Promise<{ isHealthy: boolean; latencyMs: number; message?: string }> {
    const ipCheck = await UpstoxClient.checkOutboundIp();
    return {
      isHealthy: ipCheck.matchesRegistered,
      latencyMs: 10,
      message: ipCheck.matchesRegistered
        ? 'Upstox gateway connected & static IP verified'
        : `Upstox static IP mismatch: outbound ${ipCheck.outboundIp || 'unknown'} not in whitelist`,
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private async executePaperOrder(
    order: BrokerOrderRequest,
    clientOrderId: string,
    instrument: BrokerInstrument
  ): Promise<BrokerOrder> {
    const db = getDb();
    const now = Date.now();
    const price = order.price || 100;
    const notional = ExactDecimal.from(order.quantity).times(price);
    const orderRecordId = `ord_paper_${now}_${crypto.randomBytes(4).toString('hex')}`;

    await db.execute(
      `INSERT INTO exchange_orders (
        id, user_id, client_order_id, symbol, side, type, status,
        orig_qty, executed_qty, price, avg_price, quote_asset, notional,
        fee, reserved_cash, reserved_qty, orig_qty_exact, price_exact, notional_exact,
        broker, idempotency_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'FILLED', ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, 'upstox', ?, ?, ?)`,
      [
        orderRecordId,
        order.userId,
        clientOrderId,
        order.symbol,
        order.side,
        order.type,
        order.quantity,
        order.quantity,
        price,
        price,
        instrument.quoteAsset || 'INR',
        notional.toNumber(),
        String(order.quantity),
        String(price),
        notional.toString(),
        order.idempotencyKey || clientOrderId,
        now,
        now,
      ]
    );

    return {
      id: clientOrderId,
      clientOrderId,
      exchangeOrderId: `paper_upstox_${now}`,
      broker: 'upstox',
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      status: 'FILLED',
      origQty: String(order.quantity),
      executedQty: String(order.quantity),
      price: String(price),
      avgPrice: String(price),
      quoteAsset: instrument.quoteAsset || 'INR',
      time: now,
      updateTime: now,
    };
  }

  public normalizeOrderStatus(status: string): BrokerOrderStatus {
    const s = (status || '').toLowerCase().trim();
    switch (s) {
      case 'complete':
        return 'FILLED';
      case 'partially filled':
        return 'PARTIALLY_FILLED';
      case 'open':
      case 'trigger pending':
      case 'modified':
        return 'OPEN';
      case 'validation pending':
      case 'put order req received':
      case 'after market order req received':
        return 'PENDING';
      case 'cancelled':
      case 'canceled':
        return 'CANCELED';
      case 'rejected':
        return 'REJECTED';
      default:
        return 'UNKNOWN';
    }
  }

  public normalizeOrderType(type: string): string {
    const t = (type || '').toUpperCase().trim();
    if (t === 'MARKET') return 'MARKET';
    if (t === 'LIMIT') return 'LIMIT';
    if (t === 'SL' || t === 'STOP_LOSS_LIMIT') return 'STOP_LOSS_LIMIT';
    return t;
  }

  public normalizeError(error: any): BrokerError {
    const errObj = (error instanceof Error ? error : new Error(error?.message || 'Upstox operation failed')) as BrokerError;
    const data = error?.data || error?.response?.data;
    const firstErr = data?.errors?.[0];
    const code = firstErr?.errorCode || firstErr?.error_code || (error instanceof StandardBrokerError ? error.code : '');
    const message = firstErr?.message || error?.message || 'Upstox operation failed';
    const status = error?.status || error?.response?.status;

    let category: BrokerErrorCategory = 'REJECTED';
    let normalizedCode = 'ORDER_REJECTED';

    if (/insufficient|funds|margin/i.test(message) || code === 'UDAPI100050' || code === 'INSUFFICIENT_FUNDS') {
      category = 'INSUFFICIENT_FUNDS';
      normalizedCode = 'INSUFFICIENT_FUNDS';
    } else if (/rate limit|too many/i.test(message) || code === 'UDAPI100069' || status === 429) {
      category = 'RATE_LIMITED';
      normalizedCode = 'RATE_LIMITED';
    } else if (/market.*(closed|session)|outside trading hours/i.test(message) || code === 'UDAPI100060' || code === 'UDAPI100057') {
      category = 'INVALID_ORDER';
      normalizedCode = 'MARKET_CLOSED';
    } else if (/not found/i.test(message) || code === 'UDAPI100054' || status === 404) {
      category = 'INVALID_ORDER';
      normalizedCode = 'ORDER_NOT_FOUND';
    } else if (/token|session expired|invalid auth|unauthorized/i.test(message) || code === 'UDAPI100001' || code === 'UDAPI10005' || status === 401 || status === 403) {
      category = 'AUTH_FAILED';
      normalizedCode = 'AUTHENTICATION_FAILED';
    } else if (/timeout|timed out|network|hang up/i.test(message)) {
      category = 'NETWORK_TIMEOUT';
      normalizedCode = 'NETWORK_ERROR';
    }

    errObj.name = 'BrokerError';
    errObj.code = normalizedCode;
    errObj.category = category;
    errObj.message = message;
    errObj.retryable = category === 'RATE_LIMITED' || category === 'NETWORK_TIMEOUT';
    errObj.raw = error;
    return errObj;
  }

  public normalizeSymbol(symbol: string): string {
    const inst = this.instrumentProvider.getInstrument(symbol);
    return inst ? inst.instrumentKey : symbol;
  }

  private mapOrderRecord(row: any): BrokerOrder {
    return {
      id: row.client_order_id,
      clientOrderId: row.client_order_id,
      exchangeOrderId: row.exchange_order_id,
      broker: (row.broker as BrokerId) || 'upstox',
      symbol: row.symbol,
      side: row.side,
      type: row.type,
      status: row.status as BrokerOrderStatus,
      origQty: row.orig_qty_exact || String(row.orig_qty),
      executedQty: row.executed_qty_exact || String(row.executed_qty),
      price: row.price_exact || String(row.price),
      avgPrice: row.avg_price_exact || String(row.avg_price),
      quoteAsset: row.quote_asset,
      time: Number(row.created_at),
      updateTime: Number(row.updated_at),
    };
  }

  public static encryptSecret(plaintext: string): string {
    const key = Buffer.from(config.ENCRYPTION_MASTER_KEY, 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    const ivHex = iv.toString('hex');
    return `${ivHex}:${tag}:${ciphertext}`;
  }

  public static decryptSecret(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted secret format');
    }
    const [ivHex, tagHex, rawCipher] = parts;
    const key = Buffer.from(config.ENCRYPTION_MASTER_KEY, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(rawCipher, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  public encryptSecret(plaintext: string): string {
    return UpstoxAdapter.encryptSecret(plaintext);
  }

  public decryptSecret(ciphertext: string): string {
    return UpstoxAdapter.decryptSecret(ciphertext);
  }

  public async verifyOutboundIp(): Promise<{
    outboundIp: string | null;
    matches: boolean;
    registeredIps: string[];
    error?: string;
  }> {
    const res = await UpstoxClient.checkOutboundIp();
    return {
      outboundIp: res.outboundIp,
      matches: res.matchesRegistered,
      registeredIps: res.registeredIps,
      error: res.error,
    };
  }
}
