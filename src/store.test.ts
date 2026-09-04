import { describe, it, expect } from 'vitest';
import { freshState, migrateState, SCHEMA_VERSION } from './storage';
import { executeOrder, cancelOrder } from './domain/trading';
import { getReservedCash, getReservedPosition, portfolioValue } from './domain/portfolio';
import { mergeTickResults, TickMutations } from './store';
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
    it('preserves concurrent user orders when tick engine merges mutations atomically via mergeTickResults', () => {
      let state = freshState(50000, 'clean');
      const markets = createMockMarkets();

      // Pre-existing pending limit order in state
      executeOrder(state, markets as any, 'buy', 'ETH', 1.0, {
        type: 'limit',
        limitPrice: 2800,
      });
      const pendingEthOrderId = state.orders[0].id;
      expect(state.orders.length).toBe(1);

      // T0: Tick engine starts computing on snapshot.
      // During tick, ETH price drops to $2700, filling the pending ETH order!
      const tickMutations: TickMutations = {
        cashDelta: -2802.24, // $2800 + fee
        positionDeltas: { ETH: 1.0 },
        avgBuyPriceUpdates: { ETH: 2802.24 },
        updatedOrders: [
          {
            ...state.orders[0],
            status: 'filled',
            price: 2800,
            fee: 2.24,
            notional: 2800,
            filledAt: Date.now(),
          },
        ],
        newOrders: [],
        totalFeesDelta: 2.24,
        realizedPnlDelta: 0,
        notifications: [
          {
            id: 'tick_notif_eth',
            ts: Date.now(),
            title: 'Order Filled (LIMIT)',
            body: 'ETH limit buy filled',
            type: 'order',
          },
        ],
      };

      // T1: WHILE tick was calculating, user concurrently placed a new order for BTC!
      const userBtcRes = executeOrder(state, markets as any, 'buy', 'BTC', 0.1, {
        type: 'limit',
        limitPrice: 58000,
      });
      expect(userBtcRes.ok).toBe(true);
      expect(state.orders.length).toBe(2);
      const userBtcOrderId = state.orders[0].id;
      const userCashAfterBtcOrder = state.cash;

      // T2: Tick engine completes and applies atomic mergeTickResults to latest state:
      const mergedState = mergeTickResults(state, tickMutations);

      // Verify:
      // 1. Both orders are preserved!
      expect(mergedState.orders.length).toBe(2);
      const btcOrder = mergedState.orders.find((o) => o.id === userBtcOrderId);
      const ethOrder = mergedState.orders.find((o) => o.id === pendingEthOrderId);
      expect(btcOrder).toBeDefined();
      expect(btcOrder?.status).toBe('pending');
      expect(ethOrder).toBeDefined();
      expect(ethOrder?.status).toBe('filled');

      // 2. Both cash deductions are preserved (user BTC reservation + tick ETH fill)
      expect(mergedState.cash).toBe(Math.round((userCashAfterBtcOrder - 2802.24) * 1e8) / 1e8);

      // 3. Position contains ETH from tick
      expect(mergedState.positions.ETH).toBe(1.0);

      // 4. Notifications merged
      expect(mergedState.notifications.some((n) => n.id === 'tick_notif_eth')).toBe(true);
    });

    it('preserves order cancellations made concurrently during tick cycle via mergeTickResults', () => {
      let state = freshState(50000, 'clean');
      const markets = createMockMarkets();

      // Place initial pending order
      executeOrder(state, markets as any, 'buy', 'ETH', 1.0, {
        type: 'limit',
        limitPrice: 2800,
      });
      const orderId = state.orders[0].id;
      expect(state.orders[0].status).toBe('pending');

      // User concurrently cancels order in state
      cancelOrder(state, orderId);
      expect(state.orders[0].status).toBe('cancelled');

      // Tick attempted a tick mutation that did not fill it (or had stale pending state)
      const tickMutations: TickMutations = {
        updatedOrders: [
          {
            ...state.orders[0],
            status: 'pending',
          },
        ],
      };

      const merged = mergeTickResults(state, tickMutations);
      // Cancellation must NOT regress back to 'pending'!
      const order = merged.orders.find((o) => o.id === orderId);
      expect(order?.status).toBe('cancelled');
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

    it('isolates reserved cash and positions between paper and exchange modes', () => {
      const orders: Order[] = [
        {
          id: 'ord_paper_limit_buy',
          ts: Date.now(),
          side: 'buy',
          type: 'limit',
          asset: 'BTC',
          amount: 1.0,
          price: 50000,
          limitPrice: 50000,
          fee: 0,
          notional: 50000,
          reservedCash: 50050,
          auto: false,
          status: 'pending',
          accountMode: 'paper',
        },
        {
          id: 'ord_exchange_limit_buy',
          ts: Date.now(),
          side: 'buy',
          type: 'limit',
          asset: 'ETH',
          amount: 2.0,
          price: 3000,
          limitPrice: 3000,
          fee: 0,
          notional: 6000,
          reservedCash: 6006,
          auto: false,
          status: 'pending',
          accountMode: 'exchange',
        },
        {
          id: 'ord_paper_limit_sell',
          ts: Date.now(),
          side: 'sell',
          type: 'limit',
          asset: 'SOL',
          amount: 10,
          price: 150,
          fee: 0,
          notional: 1500,
          reservedAmount: 10,
          auto: false,
          status: 'pending',
          accountMode: 'paper',
        },
        {
          id: 'ord_exchange_limit_sell',
          ts: Date.now(),
          side: 'sell',
          type: 'limit',
          asset: 'SOL',
          amount: 5,
          price: 150,
          fee: 0,
          notional: 750,
          reservedAmount: 5,
          auto: false,
          status: 'pending',
          accountMode: 'exchange',
        },
      ];

      // In paper mode: only paper pending buy/sell orders count toward reserved cash & positions
      expect(getReservedCash({ orders, accountMode: 'paper' })).toBe(50050);
      expect(getReservedPosition({ orders, accountMode: 'paper' }, 'SOL')).toBe(10);

      // In exchange mode: only exchange pending buy/sell orders count toward reserved cash & positions
      expect(getReservedCash({ orders, accountMode: 'exchange' })).toBe(6006);
      expect(getReservedPosition({ orders, accountMode: 'exchange' }, 'SOL')).toBe(5);
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

  describe('Triple-Account Mode: Paper, Binance & Web3 Self-Custody Desk', () => {
    it('segregates Web3 orders and positions from Paper and Exchange desks', () => {
      const state = freshState(50000, 'clean');
      state.accountMode = 'web3';
      state.web3Account = {
        connected: true,
        address: '0x71C8363837918a72993321374A32832204B1498B',
        network: 'polygon',
        nativeBalance: 15.5,
        nativeSymbol: 'POL',
        balances: { POL: 15.5, USDC: 2500, USDT: 1000 },
        totalValueUsd: 3506.97,
        lastSyncAt: Date.now(),
        isUnlocked: true,
      };

      const web3Order: Order = {
        id: 'dex_0xabcd1234',
        ts: Date.now(),
        side: 'buy',
        type: 'market',
        asset: 'ETH',
        amount: 0.5,
        price: 3000,
        fee: 3.5,
        notional: 1500,
        auto: false,
        status: 'filled',
        accountMode: 'web3',
      };

      state.orders.push(web3Order);
      state.web3Orders = [web3Order];
      state.web3Positions = {
        ...state.positions,
        ETH: 0.5,
      };

      // Paper mode orders/positions remain untouched
      expect(state.positions.ETH).toBe(0);
      expect(state.web3Positions.ETH).toBe(0.5);
      expect(state.web3Orders[0].accountMode).toBe('web3');
    });

    it('accurately computes portfolio value in web3 mode using on-chain stablecoins and native gas', () => {
      const state = freshState(50000, 'clean');
      state.accountMode = 'web3';
      state.web3Account = {
        connected: true,
        address: '0x71C8363837918a72993321374A32832204B1498B',
        network: 'polygon',
        nativeBalance: 100, // 100 POL * $0.45 = $45
        nativeSymbol: 'POL',
        balances: { POL: 100, USDC: 500, USDT: 500 }, // $1000 stablecoins
        totalValueUsd: 1045,
        lastSyncAt: Date.now(),
        isUnlocked: true,
      };

      const markets = createMockMarkets();
      // ETH = $3000, 0.5 ETH in web3Positions = $1500
      state.web3Positions = {
        ...state.positions,
        ETH: 0.5,
      };

      const val = portfolioValue(state, markets as any);
      // $1000 stable + $45 POL + $1500 ETH = $2545
      expect(val).toBeCloseTo(2545, 1);
    });
  });
});
