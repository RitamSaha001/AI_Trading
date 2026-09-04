import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '../db';
import { BinanceGateway } from '../services/binanceGateway';
import { LedgerService } from '../services/ledgerService';

describe('Server-Side Live Binance Execution Architecture', () => {
  const userId = 'usr_live_trader_001';

  beforeEach(async () => {
    const db = getDb();
    await db.execute(`DELETE FROM exchange_orders WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM exchange_fills`);
    await db.execute(`DELETE FROM exchange_accounts WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_entries WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM account_limits WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);

    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
       VALUES (?, 'trader@lumen.test', 'Live Trader', 'email', 'prov_live', ?, ?)`,
      [userId, Date.now(), Date.now()]
    );

    await db.execute(
      `INSERT INTO account_limits (id, user_id, is_emergency_frozen, max_single_order_pct, max_asset_concentration_pct, min_cash_reserve_pct, updated_at)
       VALUES (?, ?, 0, 0.50, 0.80, 0.05, ?)`,
      [`lim_${userId}`, userId, Date.now()]
    );

    // Seed cash into live trading account: $50,000.00 USDT
    await LedgerService.creditDeposit({
      userId,
      assetOrCurrency: 'USDT',
      amountMinor: 5_000_000,
      paymentId: 'dep_init_test',
      description: 'Initial deposit',
    });
    await LedgerService.transfer({
      userId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 5_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_init_test',
      description: 'Allocate trading funds',
    });
  });

  describe('Credential Protection & Permission Audit', () => {
    it('encrypts API key and secret with AES-256-GCM and never returns secrets in sanitized account info', async () => {
      await BinanceGateway.saveExchangeCredentials(userId, {
        apiKey: 'binance_test_api_key_12345',
        apiSecret: 'binance_test_api_secret_67890',
        environment: 'testnet',
      });

      const db = getDb();
      const row = await db.queryOne<any>(
        `SELECT * FROM exchange_accounts WHERE user_id = ?`,
        [userId]
      );

      expect(row).toBeDefined();
      expect(row.api_key_encrypted).not.toBe('binance_test_api_key_12345');
      expect(row.api_secret_encrypted).not.toBe('binance_test_api_secret_67890');
      expect(row.iv).toBeDefined();
      expect(row.tag).toBeDefined();

      // Sanitized info exposes no secrets
      const accountInfo = await BinanceGateway.getExchangeAccountInfo(userId);
      expect(accountInfo).toBeDefined();
      expect(accountInfo?.connected).toBe(true);
      expect(accountInfo?.canTrade).toBe(true);
      expect(accountInfo?.canWithdraw).toBe(false);
      expect((accountInfo as any).apiSecret).toBeUndefined();
      expect((accountInfo as any).apiKey).toBeUndefined();
    });

    it('rejects credentials if withdrawal permissions are enabled', async () => {
      const auditMock = {
        connected: true,
        environment: 'testnet' as const,
        canTrade: true,
        canWithdraw: true, // INSECURE
        canDeposit: true,
        permissions: ['SPOT', 'WITHDRAW'],
        isSafe: false,
        securityBadge: '🚨 HIGH RISK',
        balances: {},
        latencyMs: 1,
      };

      const origAudit = BinanceGateway.auditCredentials;
      BinanceGateway.auditCredentials = async () => auditMock;

      try {
        await expect(
          BinanceGateway.saveExchangeCredentials(userId, {
            apiKey: 'bad_key',
            apiSecret: 'bad_secret',
            environment: 'testnet',
          })
        ).rejects.toThrow(/withdrawal permissions enabled/i);
      } finally {
        BinanceGateway.auditCredentials = origAudit;
      }
    });

    it('creates listenKey server-side without exposing API secret', async () => {
      await BinanceGateway.saveExchangeCredentials(userId, {
        apiKey: 'test_key',
        apiSecret: 'test_secret',
        environment: 'testnet',
      });

      const listenKey = await BinanceGateway.createListenKey(userId);
      expect(listenKey).toBeDefined();
      expect(typeof listenKey).toBe('string');
      expect(listenKey).toContain('test_listen_key_');
    });

    it('wipes credentials on disconnect', async () => {
      await BinanceGateway.saveExchangeCredentials(userId, {
        apiKey: 'key_to_wipe',
        apiSecret: 'secret_to_wipe',
        environment: 'testnet',
      });

      await BinanceGateway.disconnectExchange(userId);
      const info = await BinanceGateway.getExchangeAccountInfo(userId);
      expect(info).toBeNull();
    });
  });

  describe('Server-Side Order Validation', () => {
    beforeEach(async () => {
      await BinanceGateway.saveExchangeCredentials(userId, {
        apiKey: 'mock_sim_valid_key',
        apiSecret: 'secret',
        environment: 'testnet',
      });
    });

    it('rejects unsupported trading pair symbols', async () => {
      await expect(
        BinanceGateway.submitOrder({
          userId,
          symbol: 'SHIBDOGE',
          asset: 'SHIB',
          quoteAsset: 'DOGE',
          side: 'BUY',
          type: 'MARKET',
          quantity: 100,
          marketQuoteAgeMs: 100,
          idempotencyKey: 'idemp_bad_sym',
        })
      ).rejects.toThrow(/Unsupported trading pair/i);
    });

    it('rejects orders below minimum notional threshold ($5.00)', async () => {
      await expect(
        BinanceGateway.submitOrder({
          userId,
          symbol: 'BTCUSDT',
          asset: 'BTC',
          quoteAsset: 'USDT',
          side: 'BUY',
          type: 'LIMIT',
          quantity: 0.00001, // 0.00001 * 50000 = $0.50
          price: 50000,
          marketQuoteAgeMs: 100,
          idempotencyKey: 'idemp_min_notional',
        })
      ).rejects.toThrow(/below minimum/i);
    });

    it('rejects limit orders with non-positive price', async () => {
      await expect(
        BinanceGateway.submitOrder({
          userId,
          symbol: 'BTCUSDT',
          asset: 'BTC',
          quoteAsset: 'USDT',
          side: 'BUY',
          type: 'LIMIT',
          quantity: 0.01,
          price: 0,
          marketQuoteAgeMs: 100,
          idempotencyKey: 'idemp_zero_price',
        })
      ).rejects.toThrow(/Price is required and must be positive/i);
    });
  });

  describe('Order Execution, Double-Entry Reservation & Fills', () => {
    beforeEach(async () => {
      await BinanceGateway.saveExchangeCredentials(userId, {
        apiKey: 'mock_sim_exec_key',
        apiSecret: 'mock_sim_secret',
        environment: 'testnet',
      });
    });

    it('successfully places and fills a market buy order with double-entry accounting', async () => {
      const initialSummary = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(initialSummary.cash.available).toBe(50000);

      const order = await BinanceGateway.submitOrder({
        userId,
        symbol: 'BTCUSDT',
        asset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'MARKET',
        quantity: 0.1,
        price: 50000,
        marketQuoteAgeMs: 50,
        idempotencyKey: 'idemp_market_buy_01',
      });

      expect(order.status).toBe('FILLED');
      expect(order.executedQty).toBe(0.1);
      expect(order.symbol).toBe('BTCUSDT');

      // Verify double-entry ledger state
      const summaryAfter = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(summaryAfter.cash.available).toBeLessThan(50000);
      expect(summaryAfter.positions['BTC']?.totalQuantity).toBe(0.1);

      // Verify fill recorded
      const db = getDb();
      const fills = await db.query(
        `SELECT * FROM exchange_fills WHERE order_id = ?`,
        [order.clientOrderId]
      );
      expect(fills.length).toBe(1);
      expect(Number(fills[0].qty)).toBe(0.1);
    });

    it('enforces idempotency on duplicate order submission', async () => {
      const order1 = await BinanceGateway.submitOrder({
        userId,
        symbol: 'ETHUSDT',
        asset: 'ETH',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1.0,
        price: 3000,
        marketQuoteAgeMs: 50,
        idempotencyKey: 'idemp_duplicate_test',
      });

      const order2 = await BinanceGateway.submitOrder({
        userId,
        symbol: 'ETHUSDT',
        asset: 'ETH',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1.0,
        price: 3000,
        marketQuoteAgeMs: 50,
        idempotencyKey: 'idemp_duplicate_test',
      });

      expect(order1.id).toBe(order2.id);
      expect(order1.clientOrderId).toBe(order2.clientOrderId);
    });
  });

  describe('Server-Side Order Cancellation', () => {
    it('cancels an open limit order and releases reserved capital', async () => {
      await BinanceGateway.saveExchangeCredentials(userId, {
        apiKey: 'mock_sim_cancel_key',
        apiSecret: 'mock_sim_secret',
        environment: 'testnet',
      });

      const initialSummary = await LedgerService.getAuthoritativeProjection(userId, 'live');
      const startAvailable = initialSummary.cash.available;

      const order = await BinanceGateway.submitOrder({
        userId,
        symbol: 'SOLUSDT',
        asset: 'SOL',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 10,
        price: 150,
        marketQuoteAgeMs: 50,
        idempotencyKey: 'idemp_cancel_test',
      });

      expect(order.status).toBe('OPEN');
      const reservedSummary = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(reservedSummary.cash.reserved).toBeGreaterThan(0);

      // Cancel the order
      const canceled = await BinanceGateway.cancelOrder(userId, order.clientOrderId);
      expect(canceled.status).toBe('CANCELED');

      // Verify capital reservation released
      const releasedSummary = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(releasedSummary.cash.reserved).toBe(0);
      expect(releasedSummary.cash.available).toBe(startAvailable);
    });
  });

  describe('Unknown Outcome & Network Timeout Handling', () => {
    it('transitions to UNKNOWN on ambiguous timeout and settles when confirmed filled on Binance', async () => {
      await BinanceGateway.saveExchangeCredentials(userId, {
        apiKey: 'mock_timeout_key',
        apiSecret: 'mock_secret',
        environment: 'testnet',
      });

      const db = getDb();
      const encKey = BinanceGateway.encryptSecret('mock_rec_found');
      await db.execute(
        `UPDATE exchange_accounts SET api_key_encrypted = ?, iv = ?, tag = ? WHERE user_id = ?`,
        [encKey.ciphertext, encKey.iv, encKey.tag, userId]
      );

      const order = await BinanceGateway.submitOrder({
        userId,
        symbol: 'BTCUSDT',
        asset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'MARKET',
        quantity: 0.1,
        price: 50000,
        marketQuoteAgeMs: 50,
        idempotencyKey: 'idemp_timeout_reconcile_found',
      });

      expect(order.status).toBe('FILLED');
      expect(order.executedQty).toBe(0.1);
    });

    it('releases reservations when network timeout occurs and exchange confirms order does NOT exist', async () => {
      const db = getDb();
      const initialSummary = await LedgerService.getAuthoritativeProjection(userId, 'live');
      const startAvailable = initialSummary.cash.available;

      await BinanceGateway.saveExchangeCredentials(userId, {
        apiKey: 'mock_timeout_key',
        apiSecret: 'mock_secret',
        environment: 'testnet',
      });

      const encKey = BinanceGateway.encryptSecret('mock_rec_not_found');
      await db.execute(
        `UPDATE exchange_accounts SET api_key_encrypted = ?, iv = ?, tag = ? WHERE user_id = ?`,
        [encKey.ciphertext, encKey.iv, encKey.tag, userId]
      );

      const order = await BinanceGateway.submitOrder({
        userId,
        symbol: 'ETHUSDT',
        asset: 'ETH',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1.0,
        price: 3000,
        marketQuoteAgeMs: 50,
        idempotencyKey: 'idemp_timeout_not_found',
      });

      expect(order.status).toBe('REJECTED');
      expect(order.rejectReason).toContain('Order not received by exchange');

      const summaryAfter = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(summaryAfter.cash.reserved).toBe(0);
      expect(summaryAfter.cash.available).toBe(startAvailable);
    });
  });
});
