import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BrokerRegistry } from '../services/brokers/brokerRegistry';
import { BrokerGateway } from '../services/brokers/brokerGateway';
import { BinanceAdapter } from '../services/brokers/binance/binanceAdapter';
import {
  BrokerAccount,
  BrokerError,
  BrokerId,
  BrokerInstrument,
  BrokerOrder,
  BrokerOrderRequest,
  BrokerOrderStatus,
  ReconcileVenueResult,
} from '../services/brokers/brokerTypes';
import { InstrumentRulesService } from '../services/instrumentRules';
import { getDb } from '../db';
import { OrderRecoveryService } from '../services/orderRecoveryService';
import { ReconciliationWorker } from '../services/reconciliationWorker';

describe('Broker Abstraction Layer & Core Orchestrator Decoupling', () => {
  beforeEach(() => {
    BrokerRegistry.resetForTesting();
    BrokerRegistry.register(new BinanceAdapter());
  });

  describe('1. BrokerRegistry', () => {
    it('returns BinanceAdapter as default broker', () => {
      const defaultBroker = BrokerRegistry.getDefault();
      expect(defaultBroker).toBeDefined();
      expect(defaultBroker.id).toBe('binance');
      expect(defaultBroker.name).toBe('Binance');
    });

    it('returns BinanceAdapter when requested by id', () => {
      const broker = BrokerRegistry.get('binance');
      expect(broker).toBeDefined();
      expect(broker.id).toBe('binance');
    });

    it('confirms registered status with has()', () => {
      expect(BrokerRegistry.has('binance')).toBe(true);
      expect(BrokerRegistry.has('unknown_broker')).toBe(false);
    });

    it('supports registering a mock secondary broker (Upstox preview)', () => {
      const mockUpstoxAdapter: BrokerGateway = {
        id: 'upstox' as BrokerId,
        name: 'Upstox India',
        capabilities: {
          supportsTrading: true,
          supportsMarketData: true,
          supportsHistoricalData: true,
          supportsPortfolioStream: true,
          supportsMarketStream: true,
          supportsModifyOrder: true,
          supportsCancelOrder: true,
          supportsSandbox: true,
          supportsOAuth: true,
          supportsApiKeyAuth: false,
          supportsStaticIpRequirement: true,
          supportsClockSync: false,
        },
        getAccount: vi.fn(),
        getBalances: vi.fn(),
        getOpenOrders: vi.fn(),
        getOrder: vi.fn(),
        getTrades: vi.fn(),
        placeOrder: vi.fn(),
        cancelOrder: vi.fn(),
        reconcileUnknownOrder: vi.fn(),
        fetchOrderFills: vi.fn(),
        healthCheck: async () => ({ isHealthy: true, latencyMs: 42 }),
        normalizeOrderStatus: (s: string) => (s === 'complete' ? 'FILLED' : 'OPEN'),
        normalizeOrderType: (t: string) => t,
        normalizeError: (err: any) => err,
      };

      BrokerRegistry.register(mockUpstoxAdapter);

      expect(BrokerRegistry.has('upstox')).toBe(true);
      const retrieved = BrokerRegistry.get('upstox');
      expect(retrieved.id).toBe('upstox');
      expect(retrieved.capabilities.supportsOAuth).toBe(true);
      expect(retrieved.capabilities.supportsStaticIpRequirement).toBe(true);
      expect(retrieved.capabilities.supportsClockSync).toBe(false);

      // Binance remains intact and default
      expect(BrokerRegistry.getDefault().id).toBe('binance');
      expect(BrokerRegistry.getAll()).toHaveLength(2);
    });
  });

  describe('2. BinanceAdapter Contract & Capabilities', () => {
    const adapter = new BinanceAdapter();

    it('satisfies BrokerGateway and declares explicit capabilities', () => {
      expect(adapter.id).toBe('binance');
      expect(adapter.name).toBe('Binance');
      expect(adapter.capabilities.supportsTrading).toBe(true);
      expect(adapter.capabilities.supportsClockSync).toBe(true);
      expect(adapter.capabilities.supportsPortfolioStream).toBe(true);
      expect(adapter.capabilities.supportsOAuth).toBe(false);
      expect(adapter.capabilities.supportsApiKeyAuth).toBe(true);
      expect(adapter.capabilities.supportsStaticIpRequirement).toBe(false);
    });

    it('normalizes provider order statuses to unified BrokerOrderStatus', () => {
      expect(adapter.normalizeOrderStatus('NEW')).toBe('OPEN');
      expect(adapter.normalizeOrderStatus('PARTIALLY_FILLED')).toBe('PARTIALLY_FILLED');
      expect(adapter.normalizeOrderStatus('FILLED')).toBe('FILLED');
      expect(adapter.normalizeOrderStatus('CANCELED')).toBe('CANCELLED');
      expect(adapter.normalizeOrderStatus('CANCELLED')).toBe('CANCELLED');
      expect(adapter.normalizeOrderStatus('PENDING_CANCEL')).toBe('CANCEL_REQUESTED');
      expect(adapter.normalizeOrderStatus('REJECTED')).toBe('REJECTED');
      expect(adapter.normalizeOrderStatus('EXPIRED')).toBe('EXPIRED');
      expect(adapter.normalizeOrderStatus('SUBMITTING')).toBe('SUBMITTING');
      expect(adapter.normalizeOrderStatus('RECONCILING')).toBe('RECONCILING');
      expect(adapter.normalizeOrderStatus('UNKNOWN')).toBe('UNKNOWN');
      expect(adapter.normalizeOrderStatus('UNRECOGNIZED_STATUS')).toBe('UNKNOWN');
    });

    it('normalizes order types correctly', () => {
      expect(adapter.normalizeOrderType('LIMIT')).toBe('LIMIT');
      expect(adapter.normalizeOrderType('MARKET')).toBe('MARKET');
      expect(adapter.normalizeOrderType('STOP_LOSS_LIMIT')).toBe('STOP_LOSS_LIMIT');
    });

    it('normalizes Binance error codes into categorized StandardBrokerErrors', () => {
      // 1. Timestamp error (-1021)
      const tsErr = adapter.normalizeError({ code: '-1021', message: 'Timestamp for this request was 1000ms ahead' });
      expect(tsErr.category).toBe('REJECTED');
      expect(tsErr.retryable).toBe(true);

      // 2. Insufficient balance error (-2010)
      const balErr = adapter.normalizeError({ code: '-2010', message: 'Account has insufficient balance for requested action.' });
      expect(balErr.category).toBe('INSUFFICIENT_FUNDS');
      expect(balErr.retryable).toBe(false);

      // 3. Rate limited (-1003)
      const rateErr = adapter.normalizeError({ code: '-1003', message: 'Too many requests; IP banned until 1788598920.' });
      expect(rateErr.category).toBe('RATE_LIMITED');
      expect(rateErr.retryable).toBe(true);

      // 4. Invalid order (-2011)
      const invErr = adapter.normalizeError({ code: '-2011', message: 'Unknown order sent.' });
      expect(invErr.category).toBe('INVALID_ORDER');
      expect(invErr.retryable).toBe(false);

      // 5. Network timeout
      const timeoutErr = adapter.normalizeError(new Error('ETIMEDOUT: Connection timed out'));
      expect(timeoutErr.category).toBe('NETWORK_TIMEOUT');
      expect(timeoutErr.retryable).toBe(true);
    });
  });

  describe('3. Generic Instrument Rules & Provider Boundary', () => {
    it('resolves normalized BrokerInstrument definition via BinanceInstrumentProvider', async () => {
      const btcInstrument = await InstrumentRulesService.getInstrument('binance', 'BTCUSDT');
      expect(btcInstrument).toBeDefined();
      expect(btcInstrument?.broker).toBe('binance');
      expect(btcInstrument?.exchange).toBe('BINANCE');
      expect(btcInstrument?.segment).toBe('SPOT');
      expect(btcInstrument?.instrumentKey).toBe('BINANCE:BTCUSDT');
      expect(btcInstrument?.tradingSymbol).toBe('BTCUSDT');
      expect(btcInstrument?.currency).toBe('USDT');
      expect(btcInstrument?.baseAsset).toBe('BTC');
      expect(btcInstrument?.quoteAsset).toBe('USDT');
      expect(btcInstrument?.tickSize).toBe('0.01');
      expect(btcInstrument?.minQuantity).toBe('0.00001');
      expect(Number(btcInstrument?.minNotional)).toBe(5);
    });

    it('validates orders according to instrument precision rules', async () => {
      const validOrder: BrokerOrderRequest = {
        userId: 'usr_test_1',
        broker: 'binance',
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '65000.00',
        idempotencyKey: 'idemp_rule_val_1',
      };

      const result = await InstrumentRulesService.validateOrder(validOrder);
      expect(result.isValid).toBe(true);

      // Sub-tick / invalid lot size order
      const invalidOrder: BrokerOrderRequest = {
        userId: 'usr_test_1',
        broker: 'binance',
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.000001', // below minQty 0.00001
        price: '65000.00',
        idempotencyKey: 'idemp_rule_val_2',
      };

      const invalidResult = await InstrumentRulesService.validateOrder(invalidOrder);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.error).toBeDefined();
    });
  });

  describe('4. Architecture Guard Tests: Core Decoupling Verification', () => {
    it('OrderRecoveryService does NOT directly import BinanceGateway', () => {
      const filePath = path.resolve(__dirname, '../services/orderRecoveryService.ts');
      const source = fs.readFileSync(filePath, 'utf-8');

      expect(source).not.toContain("import { BinanceGateway } from './binanceGateway'");
      expect(source).not.toContain('import { BinanceGateway }');
      expect(source).toContain("import { BrokerRegistry } from './brokers/brokerRegistry'");
      expect(source).toContain('BrokerRegistry.get(');
    });

    it('ReconciliationWorker does NOT directly import BinanceGateway', () => {
      const filePath = path.resolve(__dirname, '../services/reconciliationWorker.ts');
      const source = fs.readFileSync(filePath, 'utf-8');

      expect(source).not.toContain("import { BinanceGateway } from './binanceGateway'");
      expect(source).not.toContain('import { BinanceGateway }');
      expect(source).toContain("import { BrokerRegistry } from './brokers/brokerRegistry'");
    });

    it('OrderRecoveryService generates canonical fill keys using broker.id rather than hard-coded binance prefix', () => {
      const filePath = path.resolve(__dirname, '../services/orderRecoveryService.ts');
      const source = fs.readFileSync(filePath, 'utf-8');

      expect(source).toContain('${broker.id}:${order.user_id}:${order.symbol}:${tradeId}');
      expect(source).toContain('settlement:${broker.id}:${order.user_id}:${order.symbol}:${tradeId}');
      expect(source).not.toContain('`binance:${order.user_id}:${order.symbol}:${tradeId}`');
    });
  });

  describe('5. Orchestrator Integration via Broker Abstraction', () => {
    it('OrderRecoveryService runs sweep successfully with BrokerRegistry', async () => {
      const db = getDb();
      const userId = 'usr_broker_recov_test';

      await db.execute(`DELETE FROM exchange_orders WHERE user_id = ?`, [userId]);
      await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);
      await db.execute(
        `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
         VALUES (?, 'broker_recov@lumen.io', 'Broker Recov Test', 'email', 'prov_recov', ?, ?)`,
        [userId, Date.now(), Date.now()]
      );

      // Insert an order in terminal state so sweep completes cleanly
      await db.execute(
        `INSERT INTO exchange_orders (
          id, user_id, client_order_id, idempotency_key, symbol, quote_asset, side, type, status,
          orig_qty, price, notional, reserved_cash, reserved_qty, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'BTCUSDT', 'USDT', 'BUY', 'LIMIT', 'FILLED', 0.1, 50000, 5000, 0, 0, ?, ?)`,
        [`ord_${Date.now()}`, userId, `client_ord_${Date.now()}`, `idemp_${Date.now()}`, Date.now(), Date.now()]
      );

      const result = await OrderRecoveryService.runRecoverySweep();
      expect(result).toBeDefined();
      expect(typeof result.ordersInspected).toBe('number');
      expect(typeof result.recoveredCount).toBe('number');
    });

    it('ReconciliationWorker completes reconciliation through BrokerRegistry', async () => {
      const db = getDb();
      const userId = 'usr_broker_recon_test';

      await db.execute(`DELETE FROM exchange_orders WHERE user_id = ?`, [userId]);
      await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);
      await db.execute(
        `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
         VALUES (?, 'broker_recon@lumen.io', 'Broker Recon Test', 'email', 'prov_recon', ?, ?)`,
        [userId, Date.now(), Date.now()]
      );

      // ReconciliationWorker uses BrokerRegistry.get('binance') under the hood
      const result = await ReconciliationWorker.runReconciliation(userId);
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
    });
  });
});
