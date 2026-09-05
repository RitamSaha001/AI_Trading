import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildServer, shutdownServer, resetShuttingDownForTesting } from '../index';
import { getDb, DBClient, SQLiteClient } from '../db';
import { BinanceGateway } from '../services/binanceGateway';
import { LedgerService } from '../services/ledgerService';
import { OrderRecoveryService } from '../services/orderRecoveryService';
import { DistributedLockService } from '../services/distributedLockService';
import { runMigrations, getMigrationStatus } from '../db/migrator';
import { ExactDecimal } from '../services/precision';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

describe('Institutional Durability, Recovery & Concurrency Suite (Scenarios A - M)', () => {
  const testUserId = 'usr_durability_test_001';
  let server: ReturnType<typeof buildServer>;

  beforeEach(async () => {
    resetShuttingDownForTesting();
    const db = getDb();

    // Clean test state across all financial and durability tables
    await db.execute('DELETE FROM order_reservations');
    await db.execute('DELETE FROM exchange_fills');
    await db.execute('DELETE FROM exchange_orders');
    await db.execute('DELETE FROM ledger_entries');
    await db.execute('DELETE FROM ledger_accounts');
    await db.execute('DELETE FROM authoritative_positions');
    await db.execute('DELETE FROM worker_leases');
    await db.execute('DELETE FROM account_limits');
    await db.execute('DELETE FROM users');

    const now = Date.now();
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
       VALUES (?, 'durability@lumen.io', 'Durability Tester', 'email', 'prov_test', ?, ?)`,
      [testUserId, now, now]
    );

    await db.execute(
      `INSERT INTO account_limits (id, user_id, is_emergency_frozen, max_single_order_pct, max_asset_concentration_pct, min_cash_reserve_pct, updated_at)
       VALUES (?, ?, 0, 0.50, 0.50, 0.10, ?)`,
      [`lim_${testUserId}`, testUserId, now]
    );

    server = buildServer();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    resetShuttingDownForTesting();
    try {
      await server.close();
    } catch {}
  });

  // ============================================================================
  // Scenario A: Crash after reservation but before exchange submission
  // ============================================================================
  it('Scenario A: recovers order in SUBMITTING when exchange confirms order never reached venue', async () => {
    const db = getDb();
    const now = Date.now();

    // 1. Fund user with $10,000 USDT in trading_allocated
    await LedgerService.creditDeposit({
      userId: testUserId,
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000, // 10,000.00 USDT
      paymentId: 'pay_fund_scen_a',
      description: 'Fund account',
    });
    await LedgerService.transfer({
      userId: testUserId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_scen_a',
      description: 'Allocate trading capital',
    });

    // 2. Simulate crash after reservation: order is created with SUBMITTING and cash is reserved
    const clientOrderId = 'lmn_crash_submitting_001';
    await db.execute(
      `INSERT INTO exchange_orders (
        id, user_id, client_order_id, symbol, side, type, status,
        orig_qty, price, notional, quote_asset, idempotency_key,
        orig_qty_exact, price_exact, notional_exact,
        reserved_cash, reserved_cash_minor, created_at, updated_at
      ) VALUES (?, ?, ?, 'BTCUSDT', 'BUY', 'LIMIT', 'SUBMITTING', 0.1, 50000, 5000, 'USDT', 'idemp_sub_01', '0.1', '50000', '5000', 5000, 500000, ?, ?)`,
      [clientOrderId, testUserId, clientOrderId, now, now]
    );

    await LedgerService.reserveOrderFunds({
      userId: testUserId,
      orderId: clientOrderId,
      accountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 500_000, // $5,000.00
    });

    // Verify initial reservation state
    const accBefore = await LedgerService.getOrCreateAccount(testUserId, 'trading_allocated', 'USDT', 'live');
    expect(BigInt(accBefore.reserved_minor)).toBe(500_000n);
    expect(BigInt(accBefore.balance_minor) - BigInt(accBefore.reserved_minor)).toBe(500_000n);

    // 3. Exchange confirms order does not exist on book (never reached venue)
    vi.spyOn(BinanceGateway, 'reconcileUnknownOrder').mockResolvedValueOnce({
      found: false,
      notFoundConfirmed: true,
    });

    // 4. Run recovery sweep
    const sweepResult = await OrderRecoveryService.runRecoverySweep();
    expect(sweepResult.ordersInspected).toBe(1);
    expect(sweepResult.recoveredCount).toBe(1);
    expect(sweepResult.actions[0].action).toBe('RELEASE_RESERVATION_AND_REJECT');

    // 5. Verify order is marked REJECTED and reservations released
    const orderAfter = await db.queryOne<any>(
      `SELECT * FROM exchange_orders WHERE client_order_id = ?`,
      [clientOrderId]
    );
    expect(orderAfter.status).toBe('REJECTED');
    expect(orderAfter.reserved_cash).toBe(0);
    expect(BigInt(orderAfter.reserved_cash_minor)).toBe(0n);

    // 6. Verify ledger accounts: reserved_minor is 0, full balance is free
    const accAfter = await LedgerService.getOrCreateAccount(testUserId, 'trading_allocated', 'USDT', 'live');
    expect(BigInt(accAfter.reserved_minor)).toBe(0n);
    expect(BigInt(accAfter.balance_minor)).toBe(1_000_000n);

    // 7. Verify reservation record is marked RELEASED
    const resRow = await db.queryOne<any>(
      `SELECT * FROM order_reservations WHERE order_id = ?`,
      [clientOrderId]
    );
    expect(resRow.status).toBe('RELEASED');
    expect(BigInt(resRow.released_minor)).toBe(500_000n);
  });

  // ============================================================================
  // Scenario B: Crash after exchange submission but before local persistence
  // ============================================================================
  it('Scenario B: recovers order when venue executed order before local persistence', async () => {
    const db = getDb();
    const now = Date.now();

    await LedgerService.creditDeposit({
      userId: testUserId,
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
      paymentId: 'pay_fund_scen_b',
      description: 'Fund account',
    });
    await LedgerService.transfer({
      userId: testUserId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_scen_b',
      description: 'Allocate trading capital',
    });

    const clientOrderId = 'lmn_crash_submitting_002';
    await db.execute(
      `INSERT INTO exchange_orders (
        id, user_id, client_order_id, symbol, side, type, status,
        orig_qty, price, notional, quote_asset, idempotency_key,
        orig_qty_exact, price_exact, notional_exact,
        reserved_cash, reserved_cash_minor, created_at, updated_at
      ) VALUES (?, ?, ?, 'BTCUSDT', 'BUY', 'LIMIT', 'SUBMITTING', 0.1, 50000, 5000, 'USDT', 'idemp_sub_02', '0.1', '50000', '5000', 5000, 500000, ?, ?)`,
      [clientOrderId, testUserId, clientOrderId, now, now]
    );

    await LedgerService.reserveOrderFunds({
      userId: testUserId,
      orderId: clientOrderId,
      accountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 500_000,
    });

    // Venue confirms order was accepted and filled on the exchange
    vi.spyOn(BinanceGateway, 'reconcileUnknownOrder').mockResolvedValueOnce({
      found: true,
      status: 'FILLED',
      executedQty: 0.1,
      executedQtyExact: '0.1',
      avgPrice: 50000,
      avgPriceExact: '50000',
      exchangeOrderId: 'bin_venue_b_999',
      fills: [
        {
          tradeId: 'trd_venue_b_999',
          price: '50000',
          qty: '0.1',
          commission: '3.75',
          commissionAsset: 'USDT',
          time: Date.now(),
        },
      ],
    });

    const sweepResult = await OrderRecoveryService.runRecoverySweep();
    expect(sweepResult.recoveredCount).toBe(1);
    expect(sweepResult.actions[0].action).toBe('SETTLE_FILL_AND_FINALIZE');

    // Verify order is FILLED and fill record exists
    const orderAfter = await db.queryOne<any>(
      `SELECT * FROM exchange_orders WHERE client_order_id = ?`,
      [clientOrderId]
    );
    expect(orderAfter.status).toBe('FILLED');
    expect(orderAfter.executed_qty_exact).toBe('0.1');
    expect(orderAfter.avg_price_exact).toBe('50000');

    const fillRecord = await db.queryOne<any>(
      `SELECT * FROM exchange_fills WHERE order_id = ?`,
      [clientOrderId]
    );
    expect(fillRecord).toBeDefined();
    expect(fillRecord.qty_exact).toBe('0.1');
    expect(fillRecord.price_exact).toBe('50000');

    // Verify balances settled: BTC credited to holdings, USDT debited from trading_allocated, reservation released
    const btcAcc = await LedgerService.getOrCreateAccount(testUserId, 'crypto_holdings', 'BTC', 'live');
    expect(BigInt(btcAcc.balance_minor)).toBe(10_000_000n); // 0.10000000 BTC

    const usdtAcc = await LedgerService.getOrCreateAccount(testUserId, 'trading_allocated', 'USDT', 'live');
    expect(BigInt(usdtAcc.reserved_minor)).toBe(0n);
    // Debited 5,000 USDT + fee (3.75 USDT = 375 minor)
    expect(BigInt(usdtAcc.balance_minor)).toBe(499_625n);
  });

  // ============================================================================
  // Scenario C: Crash after receiving fill before accounting
  // ============================================================================
  it('Scenario C: recovers and settles fill accounting when crash occurs before ledger entry', async () => {
    const db = getDb();
    const now = Date.now();

    await LedgerService.creditDeposit({
      userId: testUserId,
      assetOrCurrency: 'USDT',
      amountMinor: 2_000_000, // 20,000.00 USDT
      paymentId: 'pay_fund_scen_c',
      description: 'Fund account',
    });
    await LedgerService.transfer({
      userId: testUserId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 2_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_scen_c',
      description: 'Allocate capital',
    });

    const clientOrderId = 'lmn_crash_mid_fill_003';
    await db.execute(
      `INSERT INTO exchange_orders (
        id, user_id, client_order_id, symbol, side, type, status,
        orig_qty, price, notional, quote_asset, idempotency_key,
        orig_qty_exact, price_exact, notional_exact,
        reserved_cash, reserved_cash_minor, created_at, updated_at
      ) VALUES (?, ?, ?, 'BTCUSDT', 'BUY', 'LIMIT', 'OPEN', 0.2, 50000, 10000, 'USDT', 'idemp_sub_03', '0.2', '50000', '10000', 10000, 1000000, ?, ?)`,
      [clientOrderId, testUserId, clientOrderId, now, now]
    );

    await LedgerService.reserveOrderFunds({
      userId: testUserId,
      orderId: clientOrderId,
      accountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
    });

    // Exchange reports fill occurred
    vi.spyOn(BinanceGateway, 'reconcileUnknownOrder').mockResolvedValueOnce({
      found: true,
      status: 'FILLED',
      executedQty: 0.2,
      executedQtyExact: '0.2',
      avgPrice: 50000,
      avgPriceExact: '50000',
      exchangeOrderId: 'bin_ord_mid_c',
      fills: [
        {
          tradeId: 'trd_ord_mid_c',
          price: '50000',
          qty: '0.2',
          commission: '7.5',
          commissionAsset: 'USDT',
          time: Date.now(),
        },
      ],
    });

    await OrderRecoveryService.runRecoverySweep();

    // Verify ledger has authoritative journal entries for the fill
    const ledgerEntries = await db.query<any>(
      `SELECT * FROM ledger_entries WHERE order_id = ?`,
      [clientOrderId]
    );
    expect(ledgerEntries.length).toBeGreaterThanOrEqual(2);

    const position = await LedgerService.getOrCreateAuthoritativePosition(testUserId, 'live', 'BTC');
    expect(BigInt(position.total_quantity_minor)).toBe(20_000_000n); // 0.2 BTC
  });

  // ============================================================================
  // Scenario D: Duplicate fill after restart (strictly idempotent)
  // ============================================================================
  it('Scenario D: enforces strict idempotency on duplicate fill delivery after restart', async () => {
    const db = getDb();
    await LedgerService.creditDeposit({
      userId: testUserId,
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
      paymentId: 'pay_fund_scen_d',
      description: 'Fund account',
    });
    await LedgerService.transfer({
      userId: testUserId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_scen_d',
      description: 'Allocate trading capital',
    });

    const fillParams = {
      userId: testUserId,
      accountMode: 'live' as const,
      orderId: 'ord_dup_test_001',
      fillId: 'trade_fill_idemp_999',
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      side: 'BUY' as const,
      price: ExactDecimal.from('50000'),
      quantity: ExactDecimal.from('0.1'),
      fee: ExactDecimal.from('3.75'),
      feeAsset: 'USDT',
      executedAt: Date.now(),
    };

    // First arrival
    const res1 = await LedgerService.processFill(fillParams);
    expect(res1.alreadyProcessed).toBeFalsy();

    const countBefore = (await db.queryOne<{ cnt: number }>('SELECT count(*) as cnt FROM ledger_entries'))?.cnt || 0;
    const btcBefore = (await LedgerService.getOrCreateAccount(testUserId, 'crypto_holdings', 'BTC', 'live')).balance_minor;
    const usdtBefore = (await LedgerService.getOrCreateAccount(testUserId, 'trading_allocated', 'USDT', 'live')).balance_minor;

    // Duplicate arrival after restart
    const res2 = await LedgerService.processFill(fillParams);
    expect(res2.alreadyProcessed).toBe(true);

    const countAfter = (await db.queryOne<{ cnt: number }>('SELECT count(*) as cnt FROM ledger_entries'))?.cnt || 0;
    const btcAfter = (await LedgerService.getOrCreateAccount(testUserId, 'crypto_holdings', 'BTC', 'live')).balance_minor;
    const usdtAfter = (await LedgerService.getOrCreateAccount(testUserId, 'trading_allocated', 'USDT', 'live')).balance_minor;

    expect(countAfter).toBe(countBefore);
    expect(btcAfter).toBe(btcBefore);
    expect(usdtAfter).toBe(usdtBefore);
  });

  // ============================================================================
  // Scenario E: Two instances processing same fill concurrently
  // ============================================================================
  it('Scenario E: safely handles two instances processing the same fill concurrently', async () => {
    const db = getDb();
    await LedgerService.creditDeposit({
      userId: testUserId,
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
      paymentId: 'pay_fund_scen_e',
      description: 'Fund account',
    });
    await LedgerService.transfer({
      userId: testUserId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_scen_e',
      description: 'Allocate trading capital',
    });

    const fillParams = {
      userId: testUserId,
      accountMode: 'live' as const,
      orderId: 'ord_race_fill_001',
      fillId: 'trade_fill_concurrent_888',
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      side: 'BUY' as const,
      price: ExactDecimal.from('50000'),
      quantity: ExactDecimal.from('0.05'),
      fee: ExactDecimal.from('1.875'),
      feeAsset: 'USDT',
      executedAt: Date.now(),
    };

    // Execute concurrently
    const [r1, r2] = await Promise.all([
      LedgerService.processFill(fillParams),
      LedgerService.processFill(fillParams),
    ]);

    // Exactly one of them performed the work, one flagged alreadyProcessed
    expect([r1.alreadyProcessed, r2.alreadyProcessed]).toContain(true);
    expect([r1.alreadyProcessed, r2.alreadyProcessed]).toContain(false);

    // Ledger entries must be exactly for one transaction
    const entries = await db.query<any>(
      `SELECT * FROM ledger_entries WHERE fill_id = ?`,
      ['trade_fill_concurrent_888']
    );
    const txIds = new Set(entries.map((e) => e.transaction_id));
    expect(txIds.size).toBe(1);

    const btcAcc = await LedgerService.getOrCreateAccount(testUserId, 'crypto_holdings', 'BTC', 'live');
    expect(BigInt(btcAcc.balance_minor)).toBe(5_000_000n); // 0.05000000 BTC
  });

  // ============================================================================
  // Scenario F: Two instances attempting same reservation concurrently
  // ============================================================================
  it('Scenario F: prevents double-spending when two concurrent reservations exceed balance', async () => {
    await LedgerService.creditDeposit({
      userId: testUserId,
      assetOrCurrency: 'USDT',
      amountMinor: 100_000, // 1,000.00 USDT
      paymentId: 'pay_fund_scen_f',
      description: 'Fund account',
    });
    await LedgerService.transfer({
      userId: testUserId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 100_000,
      referenceType: 'allocation',
      referenceId: 'alloc_scen_f',
      description: 'Allocate trading capital',
    });

    // Two concurrent reservation attempts of 800 USDT each (total 1,600 USDT > 1,000 USDT)
    const results = await Promise.allSettled([
      LedgerService.reserveOrderFunds({
        userId: testUserId,
        orderId: 'ord_concurrent_res_1',
        accountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 80_000,
      }),
      LedgerService.reserveOrderFunds({
        userId: testUserId,
        orderId: 'ord_concurrent_res_2',
        accountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 80_000,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toContain('Insufficient free balance to reserve');

    const acc = await LedgerService.getOrCreateAccount(testUserId, 'trading_allocated', 'USDT', 'live');
    expect(BigInt(acc.reserved_minor)).toBe(80_000n);
    expect(BigInt(acc.balance_minor) - BigInt(acc.reserved_minor)).toBe(20_000n);
  });

  // ============================================================================
  // Scenario G: Two instances starting migrations simultaneously
  // ============================================================================
  it('Scenario G: coordinates concurrent migrations safely without race conditions', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen_mig_concurrent_'));
    const testDb = new SQLiteClient(':memory:');

    try {
      fs.writeFileSync(
        path.join(tempDir, '001_initial.sql'),
        `CREATE TABLE concurrent_test_table (id TEXT PRIMARY KEY, val TEXT);`
      );
      fs.writeFileSync(
        path.join(tempDir, '002_add_index.sql'),
        `CREATE INDEX idx_concurrent_test_val ON concurrent_test_table(val);`
      );

      // Run migrations concurrently
      const [res1, res2] = await Promise.all([
        runMigrations(testDb, { migrationsDir: tempDir }),
        runMigrations(testDb, { migrationsDir: tempDir }),
      ]);

      expect(res1.appliedCount + res2.appliedCount).toBe(2);

      const status = await getMigrationStatus(testDb, tempDir);
      expect(status.isUpToDate).toBe(true);
      expect(status.pending.length).toBe(0);
    } finally {
      testDb.close();
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  // ============================================================================
  // Scenario H: Transaction rollback mid-transaction on error
  // ============================================================================
  it('Scenario H: rolls back all state atomically when error occurs mid-transaction', async () => {
    const db = getDb();
    const clientOrderId = 'lmn_rollback_ord_001';

    await expect(
      db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO exchange_orders (
            id, user_id, client_order_id, symbol, side, type, status,
            orig_qty, price, notional, quote_asset, idempotency_key,
            created_at, updated_at
          ) VALUES (?, ?, ?, 'BTCUSDT', 'BUY', 'LIMIT', 'OPEN', 0.1, 50000, 5000, 'USDT', 'idemp_rb_01', ?, ?)`,
          [clientOrderId, testUserId, clientOrderId, Date.now(), Date.now()]
        );

        // Deliberate simulated fault mid-transaction
        throw new Error('SIMULATED_NETWORK_CONNECTION_FAILURE_MID_TX');
      })
    ).rejects.toThrow('SIMULATED_NETWORK_CONNECTION_FAILURE_MID_TX');

    // Confirm that the inserted order row was rolled back completely
    const order = await db.queryOne<any>(
      `SELECT * FROM exchange_orders WHERE client_order_id = ?`,
      [clientOrderId]
    );
    expect(order).toBeNull();
  });

  // ============================================================================
  // Scenario I: Recovery of UNKNOWN orders across exchange states
  // ============================================================================
  it('Scenario I: recovers UNKNOWN orders according to authoritative exchange state', async () => {
    const db = getDb();
    const now = Date.now();

    await LedgerService.creditDeposit({
      userId: testUserId,
      assetOrCurrency: 'USDT',
      amountMinor: 500_000,
      paymentId: 'pay_fund_scen_i',
      description: 'Fund',
    });
    await LedgerService.transfer({
      userId: testUserId,
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 500_000,
      referenceType: 'allocation',
      referenceId: 'alloc_scen_i',
      description: 'Allocate',
    });

    // Case I1: Exchange confirms order was CANCELED
    const orderCanceledId = 'lmn_ord_unknown_canceled';
    await db.execute(
      `INSERT INTO exchange_orders (
        id, user_id, client_order_id, symbol, side, type, status,
        orig_qty, price, notional, quote_asset, idempotency_key,
        reserved_cash, reserved_cash_minor, created_at, updated_at
      ) VALUES (?, ?, ?, 'BTCUSDT', 'BUY', 'LIMIT', 'UNKNOWN', 0.05, 50000, 2500, 'USDT', 'idemp_i_01', 2500, 250000, ?, ?)`,
      [orderCanceledId, testUserId, orderCanceledId, now, now]
    );
    await LedgerService.reserveOrderFunds({
      userId: testUserId,
      orderId: orderCanceledId,
      accountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 250_000,
    });

    vi.spyOn(BinanceGateway, 'reconcileUnknownOrder').mockResolvedValueOnce({
      found: true,
      status: 'CANCELED',
    });

    const sweepResult1 = await OrderRecoveryService.runRecoverySweep();
    expect(sweepResult1.recoveredCount).toBe(1);
    expect(sweepResult1.actions[0].action).toBe('RELEASE_RESERVATION_AND_CANCEL');

    const orderAfterCancel = await db.queryOne<any>(
      `SELECT * FROM exchange_orders WHERE client_order_id = ?`,
      [orderCanceledId]
    );
    expect(orderAfterCancel.status).toBe('CANCELED');
    expect(orderAfterCancel.reserved_cash).toBe(0);

    // Case I2: Exchange temporary network timeout (found: false, notFoundConfirmed: false)
    const orderUnreachableId = 'lmn_ord_unknown_timeout';
    await db.execute(
      `INSERT INTO exchange_orders (
        id, user_id, client_order_id, symbol, side, type, status,
        orig_qty, price, notional, quote_asset, idempotency_key,
        reserved_cash, reserved_cash_minor, created_at, updated_at
      ) VALUES (?, ?, ?, 'BTCUSDT', 'BUY', 'LIMIT', 'UNKNOWN', 0.05, 50000, 2500, 'USDT', 'idemp_i_02', 2500, 250000, ?, ?)`,
      [orderUnreachableId, testUserId, orderUnreachableId, now, now]
    );

    vi.spyOn(BinanceGateway, 'reconcileUnknownOrder').mockResolvedValueOnce({
      found: false,
      notFoundConfirmed: false,
    });

    const sweepResult2 = await OrderRecoveryService.runRecoverySweep();
    expect(sweepResult2.unresolvedCount).toBe(1);

    // Must NOT prematurely reject or cancel order when exchange is unreachable
    const orderAfterTimeout = await db.queryOne<any>(
      `SELECT * FROM exchange_orders WHERE client_order_id = ?`,
      [orderUnreachableId]
    );
    expect(orderAfterTimeout.status).toBe('UNKNOWN');
  });

  // ============================================================================
  // Scenario J: Liveness vs Readiness Probes
  // ============================================================================
  it('Scenario J: provides distinct liveness (process UP) and readiness (DB & migration validated) probes', async () => {
    // 1. Liveness probe is UP
    const liveRes = await server.inject({ method: 'GET', url: '/health/liveness' });
    expect(liveRes.statusCode).toBe(200);
    const liveBody = JSON.parse(liveRes.body);
    expect(liveBody.status).toBe('UP');

    // 2. Readiness probe is READY on healthy DB with completed migrations
    const readyRes = await server.inject({ method: 'GET', url: '/health/readiness' });
    expect(readyRes.statusCode).toBe(200);
    const readyBody = JSON.parse(readyRes.body);
    expect(readyBody.status).toBe('READY');
    expect(readyBody.ready).toBe(true);

    // 3. Simulating broken DB causes readiness probe to fail fast with 503
    const db = getDb();
    vi.spyOn(db, 'queryOne').mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));

    const degradedRes = await server.inject({ method: 'GET', url: '/health/readiness' });
    expect(degradedRes.statusCode).toBe(503);
    const degradedBody = JSON.parse(degradedRes.body);
    expect(degradedBody.status).toBe('DOWN');
    expect(degradedBody.ready).toBe(false);

    // Liveness remains 200 even when database is degraded
    const liveRes2 = await server.inject({ method: 'GET', url: '/health/liveness' });
    expect(liveRes2.statusCode).toBe(200);
  });

  // ============================================================================
  // Scenario K: Graceful Shutdown
  // ============================================================================
  it('Scenario K: graceful shutdown rejects new non-health HTTP requests with 503 and stops workers', async () => {
    // Start graceful shutdown (stopping background workers and setting isShuttingDown)
    await shutdownServer();

    // Non-health endpoint must return 503 during graceful shutdown
    const apiRes = await server.inject({
      method: 'GET',
      url: '/api/ledger/portfolio',
    });
    expect(apiRes.statusCode).toBe(503);
    const apiBody = JSON.parse(apiRes.body);
    expect(apiBody.error).toContain('graceful shutdown');

    // Health liveness endpoint remains accessible
    const liveRes = await server.inject({ method: 'GET', url: '/health/liveness' });
    expect(liveRes.statusCode).toBe(200);

    // Readiness returns 503 during shutdown
    const readyRes = await server.inject({ method: 'GET', url: '/health/readiness' });
    expect(readyRes.statusCode).toBe(503);

    // Cleanly close server
    await server.close();
  });

  // ============================================================================
  // Scenario L: Multi-Instance Distributed Worker Coordination
  // ============================================================================
  it('Scenario L: coordinates worker leases across multiple server instances', async () => {
    const workerName = 'worker:unit_test_coordination';
    const db = getDb();

    // Instance 1 acquires lease
    DistributedLockService.setInstanceId('inst_alpha_001');
    const lease1 = await DistributedLockService.acquireLease(workerName, 30_000, db);
    expect(lease1).toBe('inst_alpha_001');

    // Instance 2 attempts to acquire lease concurrently -> blocked
    DistributedLockService.setInstanceId('inst_beta_002');
    const lease2 = await DistributedLockService.acquireLease(workerName, 30_000, db);
    expect(lease2).toBeNull();

    // Instance 1 releases lease
    DistributedLockService.setInstanceId('inst_alpha_001');
    const released = await DistributedLockService.releaseLease(workerName, 'inst_alpha_001', db);
    expect(released).toBe(true);

    // Instance 2 can now acquire lease
    DistributedLockService.setInstanceId('inst_beta_002');
    const lease3 = await DistributedLockService.acquireLease(workerName, 30_000, db);
    expect(lease3).toBe('inst_beta_002');

    await DistributedLockService.releaseLease(workerName, 'inst_beta_002', db);
  });

  // ============================================================================
  // Scenario M: Lease TTL Auto-Recovery on Instance Crash
  // ============================================================================
  it('Scenario M: automatically takes over expired lease after instance crash', async () => {
    const workerName = 'worker:unit_test_ttl_recovery';
    const db = getDb();

    // Instance 1 acquires lease with short 50ms TTL
    DistributedLockService.setInstanceId('inst_crashed_001');
    const lease1 = await DistributedLockService.acquireLease(workerName, 50, db);
    expect(lease1).toBe('inst_crashed_001');

    // Instance 1 crashes without releasing lease. Wait 75ms for expiration.
    await new Promise((resolve) => setTimeout(resolve, 75));

    // Instance 2 detects expired lease and acquires it cleanly
    DistributedLockService.setInstanceId('inst_survivor_002');
    const lease2 = await DistributedLockService.acquireLease(workerName, 30_000, db);
    expect(lease2).toBe('inst_survivor_002');

    await DistributedLockService.releaseLease(workerName, 'inst_survivor_002', db);
  });
});
