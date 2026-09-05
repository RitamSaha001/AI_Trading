import { getDb } from '../db';
import { logger, AuditService } from './auditService';
import { ExactDecimal } from './precision';
import { LedgerService } from './ledgerService';
import { UserDataStreamManager } from './userDataStreamManager';
import { ReconciliationWorker } from './reconciliationWorker';
import { config } from '../config';
import crypto from 'node:crypto';

export class BinanceUserStreamTransport {
  private static transports: Map<string, BinanceUserStreamTransport> = new Map();

  private userId: string;
  private listenKey: string;
  private environment: 'mainnet' | 'testnet';
  private ws: WebSocket | null = null;
  private isClosed: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private lastEventTime: number = 0;
  private streamHealth: 'HEALTHY' | 'DEGRADED' = 'HEALTHY';

  constructor(userId: string, listenKey: string, environment: 'mainnet' | 'testnet') {
    this.userId = userId;
    this.listenKey = listenKey;
    this.environment = environment;
  }

  public getLastEventTime(): number {
    return this.lastEventTime;
  }

  public getStreamHealth(): 'HEALTHY' | 'DEGRADED' {
    return this.streamHealth;
  }

  public setLastEventTimeForTesting(time: number): void {
    this.lastEventTime = time;
  }

  static get(userId: string): BinanceUserStreamTransport | undefined {
    return this.transports.get(userId);
  }

  static start(userId: string, listenKey: string, environment: 'mainnet' | 'testnet'): BinanceUserStreamTransport {
    const existing = this.transports.get(userId);
    if (existing) {
      existing.close();
    }
    const transport = new BinanceUserStreamTransport(userId, listenKey, environment);
    this.transports.set(userId, transport);
    transport.connect();
    return transport;
  }

  static stop(userId: string): void {
    const transport = this.transports.get(userId);
    if (transport) {
      transport.close();
      this.transports.delete(userId);
    }
  }

  static stopAll(): void {
    for (const [, transport] of this.transports.entries()) {
      transport.close();
    }
    this.transports.clear();
  }

  private getWsUrl(): string {
    const baseUrl = this.environment === 'testnet'
      ? 'wss://stream.testnet.binance.vision/ws'
      : 'wss://stream.binance.com:9443/ws';
    return `${baseUrl}/${this.listenKey}`;
  }

  public connect(): void {
    if (this.isClosed) return;

    // In test mode without external network, we don't open a real socket to Binance
    if (config.NODE_ENV === 'test' && (this.listenKey.startsWith('test_') || this.listenKey.startsWith('mock_'))) {
      logger.info(`[UserStreamTransport] Test mode: Simulated WebSocket connected for ${this.userId}`);
      return;
    }

    try {
      const url = this.getWsUrl();
      logger.info(`[UserStreamTransport] Connecting WebSocket for user ${this.userId}...`);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        logger.info(`[UserStreamTransport] WebSocket connected successfully for ${this.userId}`);
        const wasReconnecting = this.reconnectAttempts > 0;
        this.reconnectAttempts = 0;

        if (wasReconnecting) {
          void UserDataStreamManager.handleReconnect(this.userId);
        }

        this.startPing();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = () => {
        logger.warn(`[UserStreamTransport] WebSocket error for user ${this.userId}`);
      };

      this.ws.onclose = (event: CloseEvent) => {
        this.stopPing();
        if (this.isClosed) return;

        logger.warn(`[UserStreamTransport] WebSocket closed for user ${this.userId} (code: ${event.code}, reason: ${event.reason || 'None'})`);
        void UserDataStreamManager.handleDisconnect(this.userId, event.reason || `Code ${event.code}`);
        this.scheduleReconnect();
      };
    } catch (err: any) {
      logger.error(`[UserStreamTransport] Failed to initialize WebSocket for ${this.userId}: ${err.message}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.isClosed) return;

    if (this.reconnectAttempts >= 10) {
      logger.error(`[UserStreamTransport] Max reconnect attempts (10) reached for user ${this.userId}. Triggering circuit breaker.`);
      void UserDataStreamManager.handleLostListenKey(this.userId, 'Max WebSocket reconnect attempts exceeded');
      return;
    }

    const backoffMs = Math.min(30_000, 1000 * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts++;
    logger.info(`[UserStreamTransport] Scheduling reconnect in ${backoffMs}ms (attempt ${this.reconnectAttempts}/10) for ${this.userId}`);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(async () => {
      if (this.isClosed) return;
      try {
        const freshKey = await UserDataStreamManager.acquireListenKey(this.userId);
        if (freshKey) {
          this.listenKey = freshKey;
        }
        this.connect();
      } catch (err: any) {
        logger.error(`[UserStreamTransport] Reconnect failed for ${this.userId}: ${err.message}`);
        this.scheduleReconnect();
      }
    }, backoffMs);
  }

  public async handleMessage(raw: any): Promise<void> {
    try {
      const text = typeof raw === 'string' ? raw : raw?.toString?.() || '';
      if (!text) return;
      const msg = JSON.parse(text);

      const eventTime = typeof msg.E === 'number' ? msg.E : (typeof msg.E === 'string' ? Number(msg.E) : 0);

      if (eventTime > 0) {
        // 1. Sequence anomaly / reversal check (out-of-order execution reports)
        if (this.lastEventTime > 0 && eventTime < this.lastEventTime) {
          logger.warn(
            `[UserStreamTransport] Out-of-order event detected for user ${this.userId}: eventTime=${eventTime} < lastEventTime=${this.lastEventTime}. Sequence reversal anomaly!`
          );
          this.streamHealth = 'DEGRADED';
          void AuditService.logEvent({
            userId: this.userId,
            eventType: 'WS_SEQUENCE_ANOMALY',
            source: 'binance_user_stream_transport',
            actor: 'binance_ws',
            metadata: { eventTime, lastEventTime: this.lastEventTime, eventType: msg.e },
            result: 'DEGRADED',
          });

          // Update exchange_sync_state
          const db = getDb();
          void db.execute(
            `INSERT INTO exchange_sync_state (account_id, last_sync_at, ws_health, updated_at)
             VALUES (?, ?, 'DEGRADED', ?)
             ON CONFLICT(account_id) DO UPDATE SET ws_health = 'DEGRADED', updated_at = excluded.updated_at`,
            [`rec_${this.userId}`, 0, Date.now()]
          ).catch((e: any) => logger.warn(`Failed to update exchange_sync_state: ${e.message}`));

          // Trigger immediate targeted REST reconciliation
          void ReconciliationWorker.runReconciliation(this.userId);
        }

        // 2. Stale event check (replay or lagging WebSocket stream)
        const now = Date.now();
        if (now - eventTime > 60_000) {
          logger.warn(
            `[UserStreamTransport] Stale event detected for user ${this.userId}: eventTime=${eventTime}, age=${now - eventTime}ms > 60000ms. Possible replay or lagging stream!`
          );
          this.streamHealth = 'DEGRADED';
          void AuditService.logEvent({
            userId: this.userId,
            eventType: 'WS_STALE_EVENT',
            source: 'binance_user_stream_transport',
            actor: 'binance_ws',
            metadata: { eventTime, ageMs: now - eventTime, eventType: msg.e },
            result: 'DEGRADED',
          });

          // Trigger immediate targeted REST reconciliation
          void ReconciliationWorker.runReconciliation(this.userId);
        }

        // Monotonically advance lastEventTime
        this.lastEventTime = Math.max(this.lastEventTime, eventTime);
      }

      if (msg.e === 'executionReport') {
        await this.handleExecutionReport(msg);
      } else if (msg.e === 'outboundAccountPosition') {
        await this.handleAccountPosition(msg);
      } else if (msg.e === 'balanceUpdate') {
        await this.handleBalanceUpdate(msg);
      }
    } catch (err: any) {
      logger.warn(`[UserStreamTransport] Failed to parse message for ${this.userId}: ${err.message}`);
    }
  }

  private async handleExecutionReport(msg: any): Promise<void> {
    const symbol = msg.s;
    const clientOrderId = msg.c;
    const orderId = String(msg.i || '');
    const execType = msg.x;
    const orderStatus = msg.X;
    const side = msg.S;
    const isTrade = execType === 'TRADE' || (msg.t && msg.l && ExactDecimal.from(String(msg.l)).gt(ExactDecimal.zero));

    logger.info(
      `[UserStreamTransport] Execution report for ${this.userId}: ${symbol} ${side} status=${orderStatus} execType=${execType}`
    );

    if (!isTrade) {
      const db = getDb();
      await db.execute(
        `UPDATE exchange_orders SET status = ?, updated_at = ? WHERE client_order_id = ? OR exchange_order_id = ?`,
        [orderStatus, Date.now(), clientOrderId, orderId]
      );
      return;
    }

    const tradeId = String(msg.t);
    const fillPrice = String(msg.L || '0');
    const fillQty = String(msg.l || '0');
    const executedAt = Number(msg.T || Date.now());

    // Strict Authoritative Commission Check:
    // Binance MUST provide non-null, non-undefined, non-empty commission and commission asset.
    const hasAuthoritativeCommission =
      msg.n !== undefined &&
      msg.n !== null &&
      msg.n !== '' &&
      Boolean(msg.N);

    const commission = hasAuthoritativeCommission ? String(msg.n) : '0';
    const commissionAsset = hasAuthoritativeCommission ? String(msg.N) : 'USDT';

    const canonicalFillKey = `binance:${this.userId}:${symbol}:${tradeId}`;
    const accountingEventId = `settlement:${canonicalFillKey}`;

    const db = getDb();

    const existing = await db.queryOne<any>(
      `SELECT id, commission_status FROM exchange_fills WHERE canonical_fill_key = ?`,
      [canonicalFillKey]
    );
    if (existing && existing.commission_status === 'AUTHORITATIVE') {
      logger.info(`[UserStreamTransport] Fill ${canonicalFillKey} already processed authoritatively. Skipping duplicate.`);
      return;
    }

    const priceDec = ExactDecimal.from(fillPrice);
    const qtyDec = ExactDecimal.from(fillQty);
    const notionalDec = priceDec.mul(qtyDec);

    const quoteAsset = symbol.endsWith('USDT')
      ? 'USDT'
      : symbol.endsWith('USDC')
      ? 'USDC'
      : symbol.endsWith('FDUSD')
      ? 'FDUSD'
      : symbol.endsWith('BTC')
      ? 'BTC'
      : commissionAsset;
    const baseAsset = symbol.replace(new RegExp(`${quoteAsset}$`), '') || symbol;

    const localOrder = await db.queryOne<any>(
      `SELECT id, client_order_id FROM exchange_orders WHERE client_order_id = ? OR exchange_order_id = ? LIMIT 1`,
      [clientOrderId, orderId]
    );

    const targetOrderId = localOrder?.id || localOrder?.client_order_id || `ws_order_${orderId || Date.now()}`;
    const fillDbId = `fill_ws_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    if (!hasAuthoritativeCommission) {
      logger.warn(
        `[UserStreamTransport] Missing authoritative commission for fill ${canonicalFillKey}. Storing fill as PENDING and triggering REST reconciliation.`
      );

      await db.transaction(async (tx) => {
        if (!localOrder) {
          await tx.execute(
            `INSERT INTO exchange_orders (
              id, user_id, client_order_id, exchange_order_id, symbol, side, type, status,
              orig_qty, orig_qty_exact, executed_qty, executed_qty_exact,
              price, price_exact, avg_price, avg_price_exact,
              cumulative_quote_qty, cumulative_quote_exact,
              quote_asset, notional, notional_exact,
              fee, fee_exact, fee_asset,
              actual_commission_exact, actual_commission_asset, commission_status,
              executed_notional_exact, reserved_cash_minor, reserved_qty_minor,
              idempotency_key, created_at, updated_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?, 'MARKET', 'RECONCILING',
              0.0, ?, 0.0, ?,
              0.0, ?, 0.0, ?,
              0.0, ?,
              ?, 0.0, ?,
              0.0, '0', ?,
              '0', ?, 'PENDING',
              ?, 0, 0,
              ?, ?, ?
            ) ON CONFLICT (id) DO NOTHING`,
            [
              targetOrderId,
              this.userId,
              clientOrderId || targetOrderId,
              orderId,
              symbol,
              side,
              qtyDec.toString(),
              qtyDec.toString(),
              priceDec.toString(),
              priceDec.toString(),
              notionalDec.toString(),
              quoteAsset,
              notionalDec.toString(),
              commissionAsset,
              commissionAsset,
              notionalDec.toString(),
              `idemp_ws_${tradeId}_${this.userId}`,
              executedAt,
              executedAt,
            ]
          );
        } else {
          await tx.execute(
            `UPDATE exchange_orders SET
              status = 'RECONCILING',
              exchange_order_id = COALESCE(exchange_order_id, ?),
              commission_status = 'PENDING',
              updated_at = ?
            WHERE id = ?`,
            [orderId, executedAt, localOrder.id]
          );
        }

        await tx.execute(
          `INSERT INTO exchange_fills (
            id, order_id, exchange_trade_id, canonical_fill_key, symbol,
            price, price_exact, qty, qty_exact,
            commission, commission_exact, commission_asset, commission_status,
            quote_qty, quote_qty_exact, executed_at
          ) VALUES (?, ?, ?, ?, ?, 0.0, ?, 0.0, ?, 0.0, '0', ?, 'PENDING', 0.0, ?, ?)
          ON CONFLICT (canonical_fill_key) DO UPDATE SET
            commission_status = 'PENDING'`,
          [
            fillDbId,
            targetOrderId,
            tradeId,
            canonicalFillKey,
            symbol,
            priceDec.toString(),
            qtyDec.toString(),
            commissionAsset,
            notionalDec.toString(),
            executedAt,
          ]
        );
      });

      await AuditService.logEvent({
        userId: this.userId,
        eventType: 'WS_FILL_PENDING_COMMISSION',
        source: 'binance_user_stream_transport',
        actor: 'binance_ws',
        metadata: {
          canonicalFillKey,
          tradeId,
          symbol,
          missingField: msg.n === undefined ? 'n' : !msg.N ? 'N' : 'n_empty',
        },
        result: 'DEGRADED',
      });

      // Trigger immediate REST trade reconciliation to fetch authoritative trade record
      void ReconciliationWorker.reconcileTrades(this.userId, undefined, symbol);
      return;
    }

    const feeDec = ExactDecimal.from(commission);

    await db.transaction(async (tx) => {
      if (!localOrder) {
        await tx.execute(
          `INSERT INTO exchange_orders (
            id, user_id, client_order_id, exchange_order_id, symbol, side, type, status,
            orig_qty, orig_qty_exact, executed_qty, executed_qty_exact,
            price, price_exact, avg_price, avg_price_exact,
            cumulative_quote_qty, cumulative_quote_exact,
            quote_asset, notional, notional_exact,
            fee, fee_exact, fee_asset,
            actual_commission_exact, actual_commission_asset, commission_status,
            executed_notional_exact, reserved_cash_minor, reserved_qty_minor,
            idempotency_key, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, 'MARKET', 'FILLED',
            0.0, ?, 0.0, ?,
            0.0, ?, 0.0, ?,
            0.0, ?,
            ?, 0.0, ?,
            0.0, ?, ?,
            ?, ?, 'AUTHORITATIVE',
            ?, 0, 0,
            ?, ?, ?
          ) ON CONFLICT (id) DO NOTHING`,
          [
            targetOrderId,
            this.userId,
            clientOrderId || targetOrderId,
            orderId,
            symbol,
            side,
            qtyDec.toString(),
            qtyDec.toString(),
            priceDec.toString(),
            priceDec.toString(),
            notionalDec.toString(),
            quoteAsset,
            notionalDec.toString(),
            feeDec.toString(),
            commissionAsset,
            feeDec.toString(),
            commissionAsset,
            notionalDec.toString(),
            `idemp_ws_${tradeId}_${this.userId}`,
            executedAt,
            executedAt,
          ]
        );
      } else {
        await tx.execute(
          `UPDATE exchange_orders SET
            status = 'FILLED',
            exchange_order_id = COALESCE(exchange_order_id, ?),
            executed_qty = 0.0,
            executed_qty_exact = ?,
            avg_price = 0.0,
            avg_price_exact = ?,
            cumulative_quote_qty = 0.0,
            cumulative_quote_exact = ?,
            executed_notional_exact = ?,
            fee = 0.0,
            fee_exact = ?,
            fee_asset = ?,
            actual_commission_exact = ?,
            actual_commission_asset = ?,
            commission_status = 'AUTHORITATIVE',
            updated_at = ?
          WHERE id = ?`,
          [
            orderId,
            qtyDec.toString(),
            priceDec.toString(),
            notionalDec.toString(),
            notionalDec.toString(),
            feeDec.toString(),
            commissionAsset,
            feeDec.toString(),
            commissionAsset,
            executedAt,
            localOrder.id,
          ]
        );
      }

      await tx.execute(
        `INSERT INTO exchange_fills (
          id, order_id, exchange_trade_id, canonical_fill_key, symbol,
          price, price_exact, qty, qty_exact,
          commission, commission_exact, commission_asset, commission_status,
          quote_qty, quote_qty_exact, executed_at
        ) VALUES (?, ?, ?, ?, ?, 0.0, ?, 0.0, ?, 0.0, ?, ?, 'AUTHORITATIVE', 0.0, ?, ?)
        ON CONFLICT (canonical_fill_key) DO NOTHING`,
        [
          fillDbId,
          targetOrderId,
          tradeId,
          canonicalFillKey,
          symbol,
          priceDec.toString(),
          qtyDec.toString(),
          feeDec.toString(),
          commissionAsset,
          notionalDec.toString(),
          executedAt,
        ]
      );

      await LedgerService.processFill({
        userId: this.userId,
        accountMode: 'live',
        orderId: targetOrderId,
        fillId: tradeId,
        symbol,
        baseAsset,
        quoteAsset,
        side: side as 'BUY' | 'SELL',
        price: priceDec,
        quantity: qtyDec,
        fee: feeDec,
        feeAsset: commissionAsset,
        commissionStatus: 'AUTHORITATIVE',
        accountingEventId,
        canonicalFillKey,
        executedAt,
        tx,
      });
    });

    logger.info(`[UserStreamTransport] Processed authoritative fill ${canonicalFillKey} for user ${this.userId}`);
  }

  private async handleAccountPosition(msg: any): Promise<void> {
    logger.info(`[UserStreamTransport] Outbound account position update for user ${this.userId}`);
    await AuditService.logEvent({
      userId: this.userId,
      eventType: 'WS_BALANCE_UPDATE',
      source: 'binance_user_stream_transport',
      actor: 'binance_ws',
      metadata: { balances: msg.B },
      result: 'SUCCESS',
    });
  }

  private async handleBalanceUpdate(msg: any): Promise<void> {
    logger.info(`[UserStreamTransport] Balance update for user ${this.userId}: asset=${msg.a}, delta=${msg.d}`);
    await AuditService.logEvent({
      userId: this.userId,
      eventType: 'WS_BALANCE_DELTA',
      source: 'binance_user_stream_transport',
      actor: 'binance_ws',
      metadata: { asset: msg.a, delta: msg.d },
      result: 'SUCCESS',
    });
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          if (typeof (this.ws as any).ping === 'function') {
            (this.ws as any).ping();
          }
        } catch {}
      }
    }, 30_000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  public close(): void {
    this.isClosed = true;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }
}
