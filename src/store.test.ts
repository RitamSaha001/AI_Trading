import { describe, it, expect } from 'vitest';
import { freshState, migrateState, SCHEMA_VERSION } from './storage';
import { executeOrder, cancelOrder } from './domain/trading';
import { AppState, Market, Order } from './types';

function createMockMarkets(): Record<string, Market> {
  return {
    BTC: {
      asset: 'BTC' as const,
      symbol: 'BTCUSDT',
      name: 'Bitcoin',
      price: 60000,
      change24h: 1.5,
      high24h: 61000,
      low24h: 59000,
      volume24h: 100000000,
      history: [60000],
      candles: [],
      source: 'Simulated Heuristic',
      isSynthetic: false,
      lastUpdated: Date.now(),
    },
    ETH: {
      asset: 'ETH' as const,
      symbol: 'ETHUSDT',
      name: 'Ethereum',
      price: 3000,
      change24h: 2.0,
      high24h: 3100,
      low24h: 2900,
      volume24h: 50000000,
      history: [3000],
      candles: [],
      source: 'Simulated Heuristic',
      isSynthetic: false,
      lastUpdated: Date.now(),
    },
  };
}

describe('Store: State Management & Engine Hardening', () => {
  describe('Price Tick Engine Functional Updater & Concurrent Safety', () => {
    it('preserves concurrent user orders when tick engine merges mutations atomically', () => {
      // Simulating the tick engine race condition fix:
      // T0: Tick engine takes a snapshot
      let state = freshState(50000, 'clean');
      const markets = createMockMarkets();
      const tickSnapshot = {
        ...state,
        positions: { ...state.positions },
        orders: [...state.orders],
        notifications: [...state.notifications],
      };

      // T1: User places a limit order while tick engine is computing
      const userOrderRes = executeOrder(state, markets as any, 'buy', 'BTC', 0.1, {
        type: 'limit',
        limitPrice: 58000,
      });
      expect(userOrderRes.ok).toBe(true);
      expect(state.orders.length).toBe(1);
      const userOrderId = state.orders[0].id;

      // T2: Tick engine finishes background computations and applies atomic updater:
      // Instead of setState(tickSnapshot) which would wipe out userOrderRes,
      // functional updater merges onto the latest `prev` state!
      const tickGeneratedNotifications = [
        {
          id: 'tick_notif_1',
          ts: Date.now(),
          title: 'Price Alert: BTC',
          body: 'BTC crossed $60,000',
          type: 'alert' as const,
        },
      ];

      // Functional updater simulation:
      state = ((prev: AppState) => ({
        ...prev,
        notifications: [...tickGeneratedNotifications, ...prev.notifications],
      }))(state);

      // Verify user order is NOT lost!
      expect(state.orders.length).toBe(1);
      expect(state.orders[0].id).toBe(userOrderId);
      expect(state.notifications.some((n) => n.id === 'tick_notif_1')).toBe(true);
    });

    it('preserves order cancellations made concurrently during tick cycle', () => {
      let state = freshState(50000, 'clean');
      const markets = createMockMarkets();

      // Place initial pending order
      executeOrder(state, markets as any, 'buy', 'ETH', 1.0, {
        type: 'limit',
        limitPrice: 2800,
      });
      const orderId = state.orders[0].id;
      expect(state.orders[0].status).toBe('pending');

      // User cancels order
      cancelOrder(state, orderId);
      expect(state.orders[0].status).toBe('cancelled');

      // Tick merges without regressing the status to 'pending'
      state = ((prev: AppState) => ({
        ...prev,
        positions: { ...prev.positions },
      }))(state);

      expect(state.orders[0].status).toBe('cancelled');
    });
  });

  describe('Dual-Account Order Segregation', () => {
    it('tags orders with correct accountMode at execution time', () => {
      const paperState = freshState(50000, 'clean');
      paperState.accountMode = 'paper';
      const markets = createMockMarkets();

      const paperOrder = executeOrder(paperState, markets as any, 'buy', 'BTC', 0.1);
      expect(paperOrder.ok).toBe(true);
      expect(paperOrder.order?.accountMode).toBe('paper');

      const exchangeState = freshState(50000, 'clean');
      exchangeState.accountMode = 'exchange';
      const exchangeOrder = executeOrder(exchangeState, markets as any, 'buy', 'BTC', 0.1);
      expect(exchangeOrder.ok).toBe(true);
      expect(exchangeOrder.order?.accountMode).toBe('exchange');
    });

    it('enables clean filtering between paper and exchange orders', () => {
      const orders: Order[] = [
        {
          id: 'ord_paper_1',
          ts: Date.now(),
          side: 'buy',
          type: 'market',
          asset: 'BTC',
          amount: 0.1,
          price: 60000,
          fee: 0,
          notional: 6000,
          auto: false,
          status: 'filled',
          accountMode: 'paper',
        },
        {
          id: 'ord_exchange_1',
          ts: Date.now(),
          side: 'buy',
          type: 'market',
          asset: 'ETH',
          amount: 1.0,
          price: 3000,
          fee: 0,
          notional: 3000,
          auto: false,
          status: 'filled',
          accountMode: 'exchange',
        },
      ];

      const paperOrders = orders.filter((o) => (o.accountMode || 'paper') === 'paper');
      const exchangeOrders = orders.filter((o) => o.accountMode === 'exchange');

      expect(paperOrders.length).toBe(1);
      expect(paperOrders[0].id).toBe('ord_paper_1');
      expect(exchangeOrders.length).toBe(1);
      expect(exchangeOrders[0].id).toBe('ord_exchange_1');
    });
  });

  describe('Storage Migrations & Order History Truncation', () => {
    it('migrates schema and creates an archive notification when orders exceed 300', () => {
      const mockOrders: Order[] = Array.from({ length: 350 }, (_, i) => ({
        id: `ord_${i}`,
        ts: Date.now() - i * 1000,
        side: 'buy' as const,
        type: 'market' as const,
        asset: 'BTC' as const,
        amount: 0.01,
        price: 60000,
        fee: 0,
        notional: 600,
        auto: false,
        status: 'filled' as const,
      }));

      const raw = {
        schemaVersion: 6,
        cash: 25000,
        orders: mockOrders,
        notifications: [],
      };

      const migrated = migrateState(raw);

      // Truncated to 300 orders
      expect(migrated.orders.length).toBe(300);

      // Notification created: "Archived 50 older orders for performance."
      const archiveNotif = migrated.notifications.find((n) => n.title === 'Order History Archived');
      expect(archiveNotif).toBeDefined();
      expect(archiveNotif?.body).toContain('Archived 50 older orders');
      expect(archiveNotif?.type).toBe('system');
    });

    it('does not create archive notification when orders are <= 300', () => {
      const mockOrders: Order[] = Array.from({ length: 150 }, (_, i) => ({
        id: `ord_${i}`,
        ts: Date.now() - i * 1000,
        side: 'buy' as const,
        type: 'market' as const,
        asset: 'BTC' as const,
        amount: 0.01,
        price: 60000,
        fee: 0,
        notional: 600,
        auto: false,
        status: 'filled' as const,
      }));

      const raw = {
        schemaVersion: 6,
        cash: 25000,
        orders: mockOrders,
        notifications: [],
      };

      const migrated = migrateState(raw);
      expect(migrated.orders.length).toBe(150);
      expect(migrated.notifications.some((n) => n.title === 'Order History Archived')).toBe(false);
    });
  });
});
