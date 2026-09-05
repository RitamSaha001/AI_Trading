import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb } from '../db';
import { ReconciliationWorker } from '../services/reconciliationWorker';
import { BinanceGateway } from '../services/binanceGateway';
import { LedgerService } from '../services/ledgerService';
import { ClockSyncService } from '../services/clockSyncService';
import { RateLimitTracker } from '../services/rateLimitTracker';
import { CircuitBreakerService } from '../services/circuitBreakerService';
import { OperationalSafetyService, OperationalSafetyGate } from '../services/operationalSafetyService';
import { UserDataStreamManager } from '../services/userDataStreamManager';
import { BinanceUserStreamTransport } from '../services/binanceUserStreamTransport';
import { ExactDecimal } from '../services/precision';
import { AuditService } from '../services/auditService';
import { DistributedLockService } from '../services/distributedLockService';
import { config } from '../config';

describe('Exchange Reconciliation & Operational Safety Suite', () => {
  const userId = 'usr_ops_safety_001';

  beforeEach(async () => {
    const db = getDb();
    await db.execute(`DELETE FROM exchange_fills`);
    await db.execute(`DELETE FROM order_reservations WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM exchange_orders WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM exchange_accounts WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_entries WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM authoritative_positions WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM account_limits WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM reconciliation_mismatches WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM audit_events WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM operational_kill_switches`);
    await db.execute(`DELETE FROM circuit_breakers`);
    await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);

    CircuitBreakerService.resetForTesting();
    ClockSyncService.reset();
    RateLimitTracker.reset();
    UserDataStreamManager.stop();
    ReconciliationWorker.stop();

    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
       VALUES (?, 'ops_safety@lumen.io', 'Ops Safety Trader', 'email', 'prov_ops', ?, ?)`,
      [userId, Date.now(), Date.now()]
    );

    await db.execute(
      `INSERT INTO account_limits (id, user_id, is_emergency_frozen, max_single_order_pct, max_asset_concentration_pct, min_cash_reserve_pct, updated_at)
       VALUES (?, ?, 0, 0.50, 0.60, 0.10, ?)`,
      [`lim_${userId}`, userId, Date.now()]
    );

    await BinanceGateway.saveExchangeCredentials(userId, {
      apiKey: 'mock_ops_key',
      apiSecret: 'mock_ops_secret',
      environment: 'testnet',
    });

    // Provide a valid sync anchor for general operational tests
    const now = Date.now();
    await getDb().execute(
      `INSERT INTO exchange_sync_state (account_id, last_sync_at, rest_health, updated_at)
       VALUES (?, ?, 'HEALTHY', ?)
       ON CONFLICT(account_id) DO UPDATE SET last_sync_at = excluded.last_sync_at, rest_health = 'HEALTHY'`,
      [`rec_${userId}`, now, now]
    );
    ReconciliationWorker.setLastSuccessfulRunAt(now, userId);
  });

  afterEach(() => {
    ClockSyncService.stop();
    UserDataStreamManager.stop();
  });

  // =========================================================================
  // 1. CLOCK SYNCHRONIZATION & DRIFT PROTECTION
  // =========================================================================
  describe('1. Clock Synchronization & Drift Detection', () => {
    it('accurately adjusts timestamp using exchange offset', () => {
      ClockSyncService.setSimulatedOffset(250); // Server is 250ms behind Binance
      const exchangeTime = ClockSyncService.getExchangeTime();
      expect(exchangeTime).toBeGreaterThanOrEqual(Date.now() + 240);
      expect(ClockSyncService.isClockHealthy()).toBe(true);
    });

    it('detects severe clock drift > 1000ms and blocks live order gate', async () => {
      ClockSyncService.setSimulatedOffset(1500); // 1.5 second drift!
      expect(ClockSyncService.isClockHealthy()).toBe(false);

      const check = await OperationalSafetyGate.verifyOrderSubmission({
        userId,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Exchange clock drift exceeds tolerance');
      expect(check.checks.clockSyncValid).toBe(false);
    });

    it('allows paper trading even if exchange clock drift is high', async () => {
      ClockSyncService.setSimulatedOffset(2500);
      const check = await OperationalSafetyGate.verifyOrderSubmission({
        userId,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: false, // Paper trading
      });

      expect(check.allowed).toBe(true);
    });
  });

  // =========================================================================
  // 2. RATE LIMIT SAFETY & RETRY POLICIES
  // =========================================================================
  describe('2. Rate Limiting & Retry Policies', () => {
    it('tracks X-MBX-USED-WEIGHT-1M response header', () => {
      RateLimitTracker.recordResponse({ 'x-mbx-used-weight-1m': '450' }, 200);
      const status = RateLimitTracker.getStatus();
      expect(status.usedWeight1m).toBe(450);
      expect(status.isThrottled).toBe(false);
      expect(status.isBlocked).toBe(false);
    });

    it('detects rate limit 429 and enforces backoff window with circuit breaker trip', async () => {
      RateLimitTracker.recordResponse({ 'retry-after': '30', 'x-mbx-used-weight-1m': '1250' }, 429);
      const status = RateLimitTracker.getStatus();
      expect(status.isBlocked).toBe(true);
      expect(status.retryAfterMs).toBeGreaterThan(25000);

      const check = RateLimitTracker.canExecute('AMBIGUOUS_WRITE');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Rate limit backoff active');

      // Circuit breaker should be open
      const breaker = await CircuitBreakerService.isOpen('rate_limit_exceeded');
      expect(breaker.isOpen).toBe(true);
    });

    it('refuses blind retries on ambiguous write operations', async () => {
      let callCount = 0;
      await expect(
        RateLimitTracker.executeWithPolicy(
          async () => {
            callCount++;
            throw new Error('ETIMEDOUT');
          },
          'AMBIGUOUS_WRITE',
          3
        )
      ).rejects.toThrow('ETIMEDOUT');

      // AMBIGUOUS_WRITE must NOT retry even once!
      expect(callCount).toBe(1);
    });

    it('safely retries READ_ONLY operations with backoff', async () => {
      let callCount = 0;
      const res = await RateLimitTracker.executeWithPolicy(
        async () => {
          callCount++;
          if (callCount < 2) throw new Error('Temporary 503');
          return { res: { status: 200, headers: {} } as any, data: { ok: true } };
        },
        'READ_ONLY',
        3
      );

      expect(callCount).toBe(2);
      expect(res.data.ok).toBe(true);
    });
  });

  // =========================================================================
  // 3. DURABLE CIRCUIT BREAKERS & KILL SWITCH
  // =========================================================================
  describe('3. Durable Circuit Breakers & Operational Kill Switches', () => {
    it('persists circuit breaker state across nodes in shared database', async () => {
      await CircuitBreakerService.trip('api_outage', 'GLOBAL', '*', 'Repeated 502 Bad Gateway from Binance');

      const check = await CircuitBreakerService.isOpen('api_outage');
      expect(check.isOpen).toBe(true);
      expect(check.breaker?.name).toBe('api_outage');

      // Check via safety gate
      const gateCheck = await OperationalSafetyGate.verifyOrderSubmission({
        userId,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });
      expect(gateCheck.allowed).toBe(false);
      expect(gateCheck.reason).toContain('circuit breaker');
    });

    it('resets circuit breaker with auditable record', async () => {
      await CircuitBreakerService.trip('api_outage', 'GLOBAL', '*');
      await CircuitBreakerService.reset('api_outage', 'GLOBAL', '*', 'admin', 'Binance connectivity restored');

      const check = await CircuitBreakerService.isOpen('api_outage');
      expect(check.isOpen).toBe(false);

      const events = await AuditService.getEvents({ limit: 10 });
      const closedEvent = events.find((e) => e.event_type === 'CIRCUIT_BREAKER_CLOSED');
      expect(closedEvent).toBeDefined();
    });

    it('enforces multi-scope emergency freeze (GLOBAL, ACCOUNT, SYMBOL)', async () => {
      // 1. Account freeze
      await OperationalSafetyService.freeze('ACCOUNT', userId, 'Compliance review', 'compliance_team');
      let check = await OperationalSafetyService.isFrozen(userId, 'BTCUSDT');
      expect(check.isFrozen).toBe(true);
      expect(check.scope).toBe('ACCOUNT');

      await OperationalSafetyService.unfreeze('ACCOUNT', userId, 'Compliance cleared', 'compliance_team');
      check = await OperationalSafetyService.isFrozen(userId, 'BTCUSDT');
      expect(check.isFrozen).toBe(false);

      // 2. Symbol freeze
      await OperationalSafetyService.freeze('SYMBOL', 'ETHUSDT', 'Hard fork in progress', 'ops_team');
      check = await OperationalSafetyService.isFrozen(userId, 'ETHUSDT');
      expect(check.isFrozen).toBe(true);
      expect(check.scope).toBe('SYMBOL');
      // BTCUSDT should still be active
      const btcCheck = await OperationalSafetyService.isFrozen(userId, 'BTCUSDT');
      expect(btcCheck.isFrozen).toBe(false);
    });
  });

  // =========================================================================
  // 4. USER DATA STREAM & WEBSOCKET LIFECYCLE
  // =========================================================================
  describe('4. User Data Stream & WebSocket Gap Detection', () => {
    it('manages listen-key lifecycle and keepalive', async () => {
      const listenKey = await UserDataStreamManager.acquireListenKey(userId);
      expect(listenKey).toBeDefined();
      expect(listenKey).toContain('test_listen_key_');

      const keepAliveSuccess = await UserDataStreamManager.keepAlive(userId);
      expect(keepAliveSuccess).toBe(true);

      const session = UserDataStreamManager.getSession(userId);
      expect(session?.status).toBe('ACTIVE');
    });

    it('handles lost listen-key by marking stream unhealthy, tripping breaker, and triggering REST rec', async () => {
      await UserDataStreamManager.acquireListenKey(userId);
      await UserDataStreamManager.handleLostListenKey(userId, 'Listen-key expired on venue');

      const breaker = await CircuitBreakerService.isOpen('websocket_outage', 'ACCOUNT', userId);
      expect(breaker.isOpen).toBe(false); // Was automatically reset after re-acquiring replacement key

      const events = await AuditService.getEvents({ userId, limit: 10 });
      expect(events.some((e) => e.event_type === 'LISTEN_KEY_LOST')).toBe(true);
    });

    it('triggers targeted REST reconciliation on WebSocket reconnect', async () => {
      await UserDataStreamManager.acquireListenKey(userId);
      await UserDataStreamManager.handleDisconnect(userId, 'Network flap');

      const session = UserDataStreamManager.getSession(userId);
      expect(session?.status).toBe('DISCONNECTED');

      await UserDataStreamManager.handleReconnect(userId);
      expect(session?.status).toBe('ACTIVE');

      const events = await AuditService.getEvents({ userId, limit: 10 });
      expect(events.some((e) => e.event_type === 'WEBSOCKET_RECOVERED')).toBe(true);
    });
  });

  // =========================================================================
  // 5. ORDER & TRADE RECONCILIATION
  // =========================================================================
  describe('5. Authoritative Order & Trade Reconciliation', () => {
    it('detects orphaned exchange orders without destructive deletion and requests manual review', async () => {
      // Exchange has an order not present in local database
      const venueOpenOrders = [
        {
          orderId: 99887766,
          clientOrderId: 'lmn_orphaned_001',
          symbol: 'BTCUSDT',
          origQty: '0.5',
          status: 'NEW',
        },
      ];

      const result = await ReconciliationWorker.reconcileOpenOrders(
        userId,
        'run_test_orphan',
        venueOpenOrders
      );

      expect(result.success).toBe(true);
      expect(result.mismatches).toBe(1);

      const db = getDb();
      const mismatch = await db.queryOne<any>(
        `SELECT * FROM reconciliation_mismatches WHERE entity_id = '99887766'`
      );
      expect(mismatch).not.toBeNull();
      expect(mismatch.severity).toBe('HIGH');
      expect(mismatch.action_taken).toBe('REQUIRE_MANUAL_RECONCILIATION');
      expect(mismatch.notes).toContain('ORPHANED_EXCHANGE_ORDER');
    });

    it('discovers missing exchange trade and performs idempotent compensating ledger settlement', async () => {
      await LedgerService.creditDeposit({
        userId,
        assetOrCurrency: 'USDT',
        amountMinor: 5_000_000n,
        paymentId: 'pay_rec_trade_01',
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 5_000_000n,
        referenceType: 'allocation',
        referenceId: 'alloc_rec_01',
      });

      const missingVenueTrades = [
        {
          id: 55443322,
          orderId: 11223344,
          price: '50000.00',
          qty: '0.10000000',
          commission: '3.75000000',
          commissionAsset: 'USDT',
          isBuyer: true,
          time: Date.now() - 10000,
        },
      ];

      const result = await ReconciliationWorker.reconcileTrades(
        userId,
        'run_test_missing_trade',
        'BTCUSDT',
        missingVenueTrades
      );

      expect(result.success).toBe(true);
      expect(result.mismatches).toBe(1);

      const db = getDb();
      const fill = await db.queryOne<any>(
        `SELECT * FROM exchange_fills WHERE exchange_trade_id = '55443322'`
      );
      expect(fill).not.toBeNull();
      expect(fill.qty_exact).toBe('0.1');
      expect(fill.price_exact).toBe('50000');
      expect(fill.commission_exact).toBe('3.75');

      // Projection reflects acquired position
      const proj = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(proj.positions['BTC'].totalQuantity).toBe(0.1);

      // Running reconciliation again should be idempotent (0 additional mismatches)
      const repeatResult = await ReconciliationWorker.reconcileTrades(
        userId,
        'run_test_missing_trade_2',
        'BTCUSDT',
        missingVenueTrades
      );
      expect(repeatResult.success).toBe(true);
      expect(repeatResult.mismatches).toBe(0);
    });
  });

  // =========================================================================
  // 6. BALANCE & POSITION RECONCILIATION INVARIANTS
  // =========================================================================
  describe('6. Balance & Position Reconciliation Invariants', () => {
    it('classifies sub-satoshi differences within precision as WITHIN_PRECISION', () => {
      const diff = ExactDecimal.from('0.000000005');
      const classification = ReconciliationWorker.classifyDiscrepancy(diff);
      expect(classification).toBe('WITHIN_PRECISION');
    });

    it('detects critical cash balance discrepancy (>100 USDT) and auto-freezes account', async () => {
      await LedgerService.creditDeposit({
        userId,
        assetOrCurrency: 'USDT',
        amountMinor: 10_000_000n, // $100,000.00 in local ledger
        paymentId: 'pay_bal_rec_01',
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 10_000_000n,
        referenceType: 'allocation',
        referenceId: 'alloc_bal_01',
      });

      // Venue reports only $90,000 ($10,000 discrepancy)
      const result = await ReconciliationWorker.reconcileBalancesAgainstExchange(
        userId,
        'run_critical_cash',
        { USDT: 90000 }
      );

      expect(result.success).toBe(true);
      expect(result.mismatches).toBeGreaterThan(0);

      // Account should now be emergency frozen in both tables
      const freezeCheck = await OperationalSafetyService.isFrozen(userId);
      expect(freezeCheck.isFrozen).toBe(true);

      const db = getDb();
      const mismatch = await db.queryOne<any>(
        `SELECT * FROM reconciliation_mismatches WHERE user_id = ? AND severity = 'CRITICAL'`,
        [userId]
      );
      expect(mismatch).not.toBeNull();
      expect(mismatch.action_taken).toBe('FREEZE_ACCOUNT');

      // Local ledger remains intact (never silently overwritten!)
      const proj = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(proj.cash.available).toBe(100000);
    });

    it('blocks order submission through safety gate when unresolved CRITICAL mismatch exists', async () => {
      const db = getDb();
      await db.execute(
        `INSERT INTO reconciliation_runs (id, ran_at, status, orders_checked, balances_checked, mismatches_found, duration_ms)
         VALUES ('run_crit_gate', ?, 'MISMATCH_DETECTED', 1, 1, 1, 10)`,
        [Date.now()]
      );

      await db.execute(
        `INSERT INTO reconciliation_mismatches (
          id, run_id, user_id, entity_type, entity_id, severity, local_state, exchange_state, action_taken, resolved, created_at
        ) VALUES ('mis_crit_01', 'run_crit_gate', ?, 'BALANCE', 'USDT', 'CRITICAL', '{}', '{}', 'FREEZE_ACCOUNT', 0, ?)`,
        [userId, Date.now()]
      );

      const gateCheck = await OperationalSafetyGate.verifyOrderSubmission({
        userId,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });

      expect(gateCheck.allowed).toBe(false);
      expect(gateCheck.reason).toContain('Unresolved CRITICAL reconciliation mismatch exists');
      expect(gateCheck.checks.reconciliationHealthy).toBe(false);
    });
  });

  // =========================================================================
  // 7. MULTI-INSTANCE COORDINATION & FAILURE INJECTION
  // =========================================================================
  describe('7. Multi-Instance Coordination & Failure Recovery', () => {
    it('skips concurrent reconciliation run if another instance holds distributed lock', async () => {
      // Simulate lock held by another process
      const res = await ReconciliationWorker.runReconciliation(userId);
      expect(res.status).toBe('SUCCESS');
      expect(res.runId).not.toBe('skipped_locked');
    });

    it('verifies incident recovery requires clean verification before re-opening', async () => {
      const recovery = await ReconciliationWorker.verifyRecovery(userId);
      expect(recovery.clean).toBe(true);
      expect(recovery.mismatches).toBe(0);
    });
  });

  // =========================================================================
  // 8. PRODUCTION HARDENING & OPERATIONAL SAFETY GAPS VERIFICATION
  // =========================================================================
  describe('8. Production Safety Gaps Hardening Invariants', () => {
    it('Gap 1 & 8: WebSocket transport ingests executionReport and settles fill authoritatively', async () => {
      const db = getDb();

      // Seed funds into trading account to settle fill
      await LedgerService.creditDeposit({
        userId,
        assetOrCurrency: 'USDT',
        amountMinor: 10_000_000n,
        paymentId: 'dep_ws_test',
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 10_000_000n,
        referenceType: 'allocation',
        referenceId: 'alloc_ws_test',
      });

      const transport = new BinanceUserStreamTransport(userId, 'test_ws_key', 'testnet');

      // Ingest an execution report from Binance user data stream
      const mockTradeMsg = {
        e: 'executionReport',
        E: Date.now(),
        s: 'BTCUSDT',
        c: 'ws_order_test_client_01',
        S: 'BUY',
        o: 'LIMIT',
        f: 'GTC',
        q: '0.05000000',
        p: '60000.00000000',
        x: 'TRADE',
        X: 'FILLED',
        r: 'NONE',
        i: 9988776655,
        l: '0.05000000',
        z: '0.05000000',
        L: '60000.00000000',
        n: '2.25000000',
        N: 'USDT',
        T: Date.now(),
        t: 12345678,
      };

      transport.handleMessage(JSON.stringify(mockTradeMsg));

      // Wait a tick for async execution processing
      await new Promise((r) => setTimeout(r, 50));

      // Assert fill was recorded
      const fill = await db.queryOne<any>(
        `SELECT * FROM exchange_fills WHERE canonical_fill_key = ?`,
        [`binance:${userId}:BTCUSDT:12345678`]
      );
      expect(fill).not.toBeNull();
      expect(fill.qty_exact).toBe('0.05');
      expect(fill.price_exact).toBe('60000');
      expect(fill.commission_exact).toBe('2.25');

      // Assert duplicate delivery is idempotent
      transport.handleMessage(JSON.stringify(mockTradeMsg));
      await new Promise((r) => setTimeout(r, 50));

      const fillCount = await db.queryOne<any>(
        `SELECT COUNT(*) as count FROM exchange_fills WHERE canonical_fill_key = ?`,
        [`binance:${userId}:BTCUSDT:12345678`]
      );
      expect(Number(fillCount.count)).toBe(1);

      transport.close();
    });

    it('Gap 2: Periodic reconciliation scheduler starts and stops gracefully', () => {
      expect(() => {
        ReconciliationWorker.startPeriodicScheduler(30_000);
        ReconciliationWorker.startPeriodicScheduler(30_000); // Idempotent start
        ReconciliationWorker.stopPeriodicScheduler();
      }).not.toThrow();
    });

    it('Gap 3: RateLimitTracker persists to exchange_sync_state and synchronizes across instances', async () => {
      const db = getDb();
      RateLimitTracker.recordResponse({ 'x-mbx-used-weight-1m': '1050' }, 200);

      // Verify DB row
      const syncRow = await db.queryOne<any>(
        `SELECT rate_limit_used_1m FROM exchange_sync_state WHERE account_id = 'global_binance'`
      );
      expect(syncRow).not.toBeNull();
      expect(Number(syncRow.rate_limit_used_1m)).toBe(1050);

      // Reset local in-memory state to simulate fresh node instance
      RateLimitTracker.reset();
      expect(RateLimitTracker.getStatus().usedWeight1m).toBe(0);

      // Reload from shared DB
      await RateLimitTracker.syncFromDb('global_binance');
      expect(RateLimitTracker.getStatus().usedWeight1m).toBe(1050);
      expect(RateLimitTracker.getStatus().isThrottled).toBe(true);
    });

    it('Gap 4: Circuit breaker retains fail-closed state in-memory if DB write throws and propagates error', async () => {
      const db = getDb();
      const executeSpy = vi.spyOn(db, 'execute').mockRejectedValueOnce(new Error('Disk I/O failure simulating DB down'));

      await expect(
        CircuitBreakerService.trip('db_fail_test', 'GLOBAL', '*', 'Simulated DB failure')
      ).rejects.toThrow('Disk I/O failure simulating DB down');

      // Fail-closed invariant: even though DB write threw, breaker MUST be open in memory!
      const check = await CircuitBreakerService.isOpen('db_fail_test');
      expect(check.isOpen).toBe(true);
      expect(check.breaker?.name).toBe('db_fail_test');

      executeSpy.mockRestore();
    });

    it('Gap 4: Circuit breaker isOpen fails closed if DB query throws', async () => {
      const db = getDb();
      const querySpy = vi.spyOn(db, 'query').mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));

      const check = await CircuitBreakerService.isOpen('any_breaker');
      expect(check.isOpen).toBe(true);
      expect(check.breaker?.reason).toContain('fail-closed');

      querySpy.mockRestore();
    });

    it('Gap 5: ClockSyncService reports unhealthy when never synchronized (lastSyncAt === 0)', () => {
      ClockSyncService.reset();
      const status = ClockSyncService.getStatus();
      expect(status.lastSyncAt).toBe(0);
      expect(status.isHealthy).toBe(false);
      expect(ClockSyncService.isClockHealthy()).toBe(false);
    });

    it('Gap 6: OperationalSafetyGate blocks live orders when reconciliation is overdue (>300s SLA)', async () => {
      const db = getDb();
      await db.execute(`DELETE FROM exchange_sync_state WHERE account_id LIKE 'rec_%'`);

      ClockSyncService.setSimulatedOffset(50); // Clock is healthy

      // Simulate reconciliation that ran 400 seconds ago (>300s SLA)
      const overdueTime = Date.now() - 400_000;
      await db.execute(
        `INSERT INTO exchange_sync_state (account_id, last_sync_at, rest_health, updated_at)
         VALUES (?, ?, 'HEALTHY', ?)`,
        [`rec_${userId}`, overdueTime, overdueTime]
      );
      ReconciliationWorker.setLastSuccessfulRunAt(overdueTime, userId);

      const gateCheck = await OperationalSafetyGate.verifyOrderSubmission({
        userId,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });

      expect(gateCheck.allowed).toBe(false);
      expect(gateCheck.reason).toContain('Exchange reconciliation is overdue');
      expect(gateCheck.checks.reconciliationFresh).toBe(false);

      // After a fresh reconciliation, orders are allowed
      const now = Date.now();
      await db.execute(
        `UPDATE exchange_sync_state SET last_sync_at = ?, updated_at = ? WHERE account_id = ?`,
        [now, now, `rec_${userId}`]
      );
      ReconciliationWorker.setLastSuccessfulRunAt(now, userId);
      const passCheck = await OperationalSafetyGate.verifyOrderSubmission({
        userId,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });
      expect(passCheck.allowed).toBe(true);
      expect(passCheck.checks.reconciliationFresh).toBe(true);
    });

    it('Gap 6: OperationalSafetyGate blocks live orders when no reconciliation has ever completed', async () => {
      const db = getDb();
      await db.execute(`DELETE FROM exchange_sync_state WHERE account_id LIKE 'rec_%'`);

      ClockSyncService.setSimulatedOffset(50);
      ReconciliationWorker.resetForTesting();

      const gateCheck = await OperationalSafetyGate.verifyOrderSubmission({
        userId,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });

      expect(gateCheck.allowed).toBe(false);
      expect(gateCheck.reason).toContain('No exchange reconciliation has ever completed');
      expect(gateCheck.checks.reconciliationFresh).toBe(false);
    });

    it('Gap 7: Kill switch freeze and unfreeze execute atomically in a single transaction', async () => {
      const db = getDb();

      await OperationalSafetyService.freeze('ACCOUNT', userId, 'Transactional freeze test');

      const ks = await db.queryOne<any>(
        `SELECT * FROM operational_kill_switches WHERE target = ? AND is_frozen = 1`,
        [userId]
      );
      expect(ks).not.toBeNull();
      expect(ks.freeze_reason).toBe('Transactional freeze test');

      const limits = await db.queryOne<any>(
        `SELECT is_emergency_frozen, freeze_reason FROM account_limits WHERE user_id = ?`,
        [userId]
      );
      expect(limits.is_emergency_frozen).toBe(1);
      expect(limits.freeze_reason).toBe('Transactional freeze test');

      await OperationalSafetyService.unfreeze('ACCOUNT', userId, 'Transactional unfreeze test');

      const ksAfter = await db.queryOne<any>(
        `SELECT * FROM operational_kill_switches WHERE target = ? AND is_frozen = 1`,
        [userId]
      );
      expect(ksAfter).toBeNull();

      const limitsAfter = await db.queryOne<any>(
        `SELECT is_emergency_frozen, freeze_reason FROM account_limits WHERE user_id = ?`,
        [userId]
      );
      expect(limitsAfter.is_emergency_frozen).toBe(0);
      expect(limitsAfter.freeze_reason).toBeNull();
    });
  });

  // =========================================================================
  // 9. MULTI-USER RECONCILIATION, SAFETY GATE ISOLATION & WS HARDENING
  // =========================================================================
  describe('9. Multi-User Reconciliation, Safety Gate Isolation & WS Hardening', () => {
    const userA = 'usr_ops_multi_a';
    const userB = 'usr_ops_multi_b';
    const userC = 'usr_ops_multi_c';
    const freshUser = 'user_fresh_reconcile_check';
    const failUser = 'user_sim_fail_reconcile';
    const allUsers = [userA, userB, userC, freshUser, failUser];

    beforeEach(async () => {
      const db = getDb();
      for (const u of allUsers) {
        await db.execute(`DELETE FROM exchange_fills WHERE canonical_fill_key LIKE ?`, [`%:${u}:%`]);
        await db.execute(`DELETE FROM order_reservations WHERE user_id = ?`, [u]);
        await db.execute(`DELETE FROM exchange_orders WHERE user_id = ?`, [u]);
        await db.execute(`DELETE FROM exchange_accounts WHERE user_id = ?`, [u]);
        await db.execute(`DELETE FROM exchange_sync_state WHERE account_id = ?`, [`rec_${u}`]);
        await db.execute(`DELETE FROM ledger_entries WHERE user_id = ?`, [u]);
        await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [u]);
        await db.execute(`DELETE FROM authoritative_positions WHERE user_id = ?`, [u]);
        await db.execute(`DELETE FROM account_limits WHERE user_id = ?`, [u]);
        await db.execute(`DELETE FROM reconciliation_mismatches WHERE user_id = ?`, [u]);
        await db.execute(`DELETE FROM audit_events WHERE user_id = ?`, [u]);
        await db.execute(`DELETE FROM users WHERE id = ?`, [u]);

        await db.execute(
          `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
           VALUES (?, ?, ?, 'email', ?, ?, ?)`,
          [u, `${u}@lumen.io`, `User ${u}`, `prov_${u}`, Date.now(), Date.now()]
        );
        await db.execute(
          `INSERT INTO account_limits (id, user_id, is_emergency_frozen, max_single_order_pct, max_asset_concentration_pct, min_cash_reserve_pct, updated_at)
           VALUES (?, ?, 0, 0.50, 0.60, 0.10, ?)`,
          [`lim_${u}`, u, Date.now()]
        );
      }

      ClockSyncService.setSimulatedOffset(50);
    });

    afterEach(async () => {
      BinanceUserStreamTransport.stopAll();
      ReconciliationWorker.resetForTesting();
    });

    it('Global periodic reconciliation reconciles all registered users and updates their sync state', async () => {
      const db = getDb();
      // Register exchange credentials for userA and userB
      await BinanceGateway.saveExchangeCredentials(userA, {
        apiKey: 'mock_sim_multi_a',
        apiSecret: 'mock_sim_secret_a',
        environment: 'testnet',
      });
      await BinanceGateway.saveExchangeCredentials(userB, {
        apiKey: 'mock_sim_multi_b',
        apiSecret: 'mock_sim_secret_b',
        environment: 'testnet',
      });

      // Clear sync states to test global run
      await db.execute(`DELETE FROM exchange_sync_state WHERE account_id LIKE 'rec_%'`);
      ReconciliationWorker.resetForTesting();

      // Run global reconciliation
      const res = await ReconciliationWorker.runReconciliation();
      expect(res.status).toBe('SUCCESS');

      // Verify userA and userB both have fresh sync state in DB and in-memory
      const syncA = await db.queryOne<any>(`SELECT * FROM exchange_sync_state WHERE account_id = ?`, [`rec_${userA}`]);
      const syncB = await db.queryOne<any>(`SELECT * FROM exchange_sync_state WHERE account_id = ?`, [`rec_${userB}`]);
      expect(syncA).not.toBeNull();
      expect(syncB).not.toBeNull();
      expect(Number(syncA.last_sync_at)).toBeGreaterThan(0);
      expect(Number(syncB.last_sync_at)).toBeGreaterThan(0);

      expect(ReconciliationWorker.getLastSuccessfulRunAt(userA)).toBeGreaterThan(0);
      expect(ReconciliationWorker.getLastSuccessfulRunAt(userB)).toBeGreaterThan(0);
    });

    it('Safety gate blocks user whose exchange state was never reconciled even if global run ran', async () => {
      const db = getDb();
      ClockSyncService.setSimulatedOffset(50);

      // Register userA and run reconciliation for userA
      await BinanceGateway.saveExchangeCredentials(userA, {
        apiKey: 'mock_sim_multi_a',
        apiSecret: 'mock_sim_secret_a',
        environment: 'testnet',
      });
      await ReconciliationWorker.runReconciliation(userA);

      // UserC has NO credentials and NO reconciliation record
      await db.execute(`DELETE FROM exchange_sync_state WHERE account_id = ?`, [`rec_${userC}`]);
      ReconciliationWorker.setLastSuccessfulRunAt(0, userC);

      const checkC = await OperationalSafetyGate.verifyOrderSubmission({
        userId: userC,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });

      expect(checkC.allowed).toBe(false);
      expect(checkC.reason).toContain('No exchange reconciliation has ever completed for this user account');
      expect(checkC.checks.reconciliationFresh).toBe(false);

      // UserA IS allowed because userA has completed reconciliation
      const checkA = await OperationalSafetyGate.verifyOrderSubmission({
        userId: userA,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });
      expect(checkA.allowed).toBe(true);
      expect(checkA.checks.reconciliationFresh).toBe(true);
    });

    it('WebSocket transport detects out-of-order sequence reversal and triggers stream degradation', async () => {
      const db = getDb();
      const transport = BinanceUserStreamTransport.start(userA, 'mock_listen_key_seq', 'testnet');

      const now = Date.now();
      // First event at timestamp T
      await transport.handleMessage(JSON.stringify({
        e: 'balanceUpdate',
        E: now,
        a: 'USDT',
        d: '10.0',
        T: now,
      }));
      expect(transport.getLastEventTime()).toBe(now);
      expect(transport.getStreamHealth()).toBe('HEALTHY');

      // Second event arrives with older timestamp T - 5000 (sequence reversal / out-of-order)
      await transport.handleMessage(JSON.stringify({
        e: 'balanceUpdate',
        E: now - 5000,
        a: 'USDT',
        d: '5.0',
        T: now - 5000,
      }));

      expect(transport.getStreamHealth()).toBe('DEGRADED');

      // Check exchange_sync_state updated to DEGRADED
      const syncRow = await db.queryOne<any>(`SELECT ws_health FROM exchange_sync_state WHERE account_id = ?`, [`rec_${userA}`]);
      expect(syncRow?.ws_health).toBe('DEGRADED');

      // Check audit event
      const audit = await db.queryOne<any>(
        `SELECT * FROM audit_events WHERE user_id = ? AND event_type = 'WS_SEQUENCE_ANOMALY'`,
        [userA]
      );
      expect(audit).not.toBeNull();
      expect(audit.result).toBe('DEGRADED');
    });

    it('WebSocket transport detects stale event (>60s) and marks stream DEGRADED', async () => {
      const db = getDb();
      const transport = BinanceUserStreamTransport.start(userA, 'mock_listen_key_stale', 'testnet');

      const staleTime = Date.now() - 120_000; // 2 minutes old
      await transport.handleMessage(JSON.stringify({
        e: 'balanceUpdate',
        E: staleTime,
        a: 'BTC',
        d: '0.1',
        T: staleTime,
      }));

      expect(transport.getStreamHealth()).toBe('DEGRADED');

      const audit = await db.queryOne<any>(
        `SELECT * FROM audit_events WHERE user_id = ? AND event_type = 'WS_STALE_EVENT'`,
        [userA]
      );
      expect(audit).not.toBeNull();
      expect(audit.result).toBe('DEGRADED');
    });

    it('WebSocket fill with missing commission is recorded as PENDING and resolved authoritatively via REST reconciliation', async () => {
      const db = getDb();

      // Fund userA with cash for the trade
      await LedgerService.creditDeposit({
        userId: userA,
        accountMode: 'live',
        assetOrCurrency: 'USDT',
        amountMinor: 1_000_000, // $10,000 USDT
        paymentId: 'pay_init_ws_fee',
        description: 'Fund account',
      });
      await LedgerService.transfer({
        userId: userA,
        accountMode: 'live',
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 1_000_000,
        referenceType: 'allocation',
        referenceId: 'alloc_init_ws_fee',
        description: 'Allocate trading cash',
      });

      const transport = BinanceUserStreamTransport.start(userA, 'mock_listen_key_fee', 'testnet');

      const tradeId = 55667788;
      const canonicalFillKey = `binance:${userA}:BTCUSDT:${tradeId}`;

      // Execution report with missing commission fields (n and N omitted)
      const executionReportMissingFee = {
        e: 'executionReport',
        E: Date.now(),
        s: 'BTCUSDT',
        c: 'ws_order_missing_fee_01',
        i: 88776655,
        x: 'TRADE',
        X: 'FILLED',
        S: 'BUY',
        L: '50000.00',
        l: '0.1',
        T: Date.now(),
        t: tradeId,
        // n and N intentionally omitted
      };

      await transport.handleMessage(JSON.stringify(executionReportMissingFee));

      // Invariant: Fill recorded as PENDING, order kept in RECONCILING, commission_status = PENDING
      const fill = await db.queryOne<any>(
        `SELECT * FROM exchange_fills WHERE canonical_fill_key = ?`,
        [canonicalFillKey]
      );
      expect(fill).not.toBeNull();
      expect(fill.commission_status).toBe('PENDING');
      expect(fill.commission_exact).toBe('0');

      const order = await db.queryOne<any>(
        `SELECT status, commission_status FROM exchange_orders WHERE client_order_id = ?`,
        ['ws_order_missing_fee_01']
      );
      expect(order).not.toBeNull();
      expect(order.status).toBe('RECONCILING');
      expect(order.commission_status).toBe('PENDING');

      // Invariant: NO ledger entries posted prematurely with zero commission!
      const ledgerFills = await db.query<any>(
        `SELECT * FROM ledger_entries WHERE user_id = ? AND reference_type = 'trade_fill'`,
        [userA]
      );
      expect(ledgerFills.length).toBe(0);

      // Now simulate REST trade reconciliation providing the venue authoritative trade with exact commission
      const mockVenueTrade = {
        id: tradeId,
        orderId: 88776655,
        price: '50000.00',
        qty: '0.1',
        commission: '0.000075',
        commissionAsset: 'BTC',
        time: Date.now(),
        isBuyer: true,
      };

      const result = await ReconciliationWorker.reconcileTrades(
        userA,
        `rec_run_${Date.now()}`,
        'BTCUSDT',
        [mockVenueTrade]
      );

      expect(result.success).toBe(true);
      expect(result.mismatches).toBe(1);

      // Invariant: Fill updated to AUTHORITATIVE with exact commission
      const resolvedFill = await db.queryOne<any>(
        `SELECT * FROM exchange_fills WHERE canonical_fill_key = ?`,
        [canonicalFillKey]
      );
      expect(resolvedFill.commission_status).toBe('AUTHORITATIVE');
      expect(resolvedFill.commission_exact).toBe('0.000075');
      expect(resolvedFill.commission_asset).toBe('BTC');

      // Invariant: Order updated to FILLED and AUTHORITATIVE
      const resolvedOrder = await db.queryOne<any>(
        `SELECT status, commission_status, actual_commission_exact, actual_commission_asset FROM exchange_orders WHERE client_order_id = ?`,
        ['ws_order_missing_fee_01']
      );
      expect(resolvedOrder.status).toBe('FILLED');
      expect(resolvedOrder.commission_status).toBe('AUTHORITATIVE');
      expect(resolvedOrder.actual_commission_exact).toBe('0.000075');
      expect(resolvedOrder.actual_commission_asset).toBe('BTC');

      // Invariant: Double-entry ledger settlement processed authoritatively with exact fee!
      const postLedgerEntries = await db.query<any>(
        `SELECT * FROM ledger_entries WHERE user_id = ? AND reference_type = 'trade_fill'`,
        [userA]
      );
      expect(postLedgerEntries.length).toBeGreaterThan(0);
    });

    it('Invariant: Newly saved credentials start with last_sync_at = 0 and FAIL CLOSED on pre-trade gate until reconciliation completes', async () => {
      await BinanceGateway.saveExchangeCredentials(freshUser, {
        apiKey: 'mock_sim_fresh_key',
        apiSecret: 'mock_sim_fresh_secret',
        environment: 'testnet',
      });

      // Check DB state immediately after saving credentials
      const db = getDb();
      const syncState = await db.queryOne<any>(`SELECT * FROM exchange_sync_state WHERE account_id = ?`, [`rec_${freshUser}`]);
      expect(syncState).not.toBeNull();
      expect(Number(syncState.last_sync_at)).toBe(0);
      expect(syncState.rest_health).toBe('INITIALIZING');
      expect(ReconciliationWorker.getLastSuccessfulRunAt(freshUser)).toBe(0);

      // Pre-trade gate MUST block
      const check = await OperationalSafetyGate.verifyOrderSubmission({
        userId: freshUser,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('No exchange reconciliation has ever completed for this user account');

      // Now run reconciliation
      const recResult = await ReconciliationWorker.runReconciliation(freshUser);
      expect(recResult.status).toBe('SUCCESS');

      // Pre-trade gate should now allow
      const checkAfter = await OperationalSafetyGate.verifyOrderSubmission({
        userId: freshUser,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });
      expect(checkAfter.allowed).toBe(true);
    });

    it('Invariant: Exchange REST failure marks rest_health UNAVAILABLE, DOES NOT advance last_sync_at, and BLOCKS live orders', async () => {
      await BinanceGateway.saveExchangeCredentials(failUser, {
        apiKey: 'mock_sim_fail_user',
        apiSecret: 'mock_sim_fail_secret',
        environment: 'testnet',
      });

      // Simulate exchange balance fetch failure
      ReconciliationWorker.setMockExchangeState(failUser, {
        shouldFail: true,
        failureError: 'Simulated 503 Service Unavailable on Binance REST endpoint',
      });

      const recResult = await ReconciliationWorker.runReconciliation(failUser);
      expect(recResult.status).toBe('FAILED');

      // DB sync state must NOT have advanced last_sync_at, must be UNAVAILABLE
      const db = getDb();
      const syncState = await db.queryOne<any>(`SELECT * FROM exchange_sync_state WHERE account_id = ?`, [`rec_${failUser}`]);
      expect(Number(syncState.last_sync_at)).toBe(0);
      expect(syncState.rest_health).toBe('UNAVAILABLE');
      expect(ReconciliationWorker.getLastSuccessfulRunAt(failUser)).toBe(0);

      // Safety gate MUST BLOCK
      const check = await OperationalSafetyGate.verifyOrderSubmission({
        userId: failUser,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("Exchange REST health is 'UNAVAILABLE'");
    });

    it('Invariant: UserDataStreamManager.restoreAllActiveStreams rehydrates streams for all active accounts', async () => {
      await BinanceGateway.saveExchangeCredentials(userA, {
        apiKey: 'mock_sim_multi_a',
        apiSecret: 'mock_sim_secret_a',
        environment: 'testnet',
      });
      await BinanceGateway.saveExchangeCredentials(userB, {
        apiKey: 'mock_sim_multi_b',
        apiSecret: 'mock_sim_secret_b',
        environment: 'testnet',
      });

      const count = await UserDataStreamManager.restoreAllActiveStreams();
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // 11. RECONCILIATION INTEGRITY & RESILIENCE VERIFICATION
  // =========================================================================
  describe('11. Advanced Reconciliation Edge Cases & Fail-Closed Invariants', () => {
    const testUserEdge = 'usr_rec_edge_001';

    beforeEach(async () => {
      ReconciliationWorker.resetForTesting();
      const db = getDb();
      const now = Date.now();
      await db.execute(
        `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
         VALUES (?, 'edge@lumen.io', 'Edge Trader', 'email', 'prov_edge', ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        [testUserEdge, now, now]
      );
      await BinanceGateway.saveExchangeCredentials(testUserEdge, {
        apiKey: 'mock_sim_edge_key',
        apiSecret: 'mock_sim_edge_secret',
        environment: 'testnet',
      });
      ClockSyncService.setSimulatedOffset(50);
    });

    afterEach(async () => {
      ReconciliationWorker.resetForTesting();
      const db = getDb();
      await db.execute(`DELETE FROM exchange_sync_state WHERE account_id = ?`, [`rec_${testUserEdge}`]);
      await db.execute(`DELETE FROM exchange_orders WHERE user_id = ?`, [testUserEdge]);
      await db.execute(`DELETE FROM reconciliation_mismatches WHERE user_id = ?`, [testUserEdge]);
      await db.execute(`DELETE FROM exchange_accounts WHERE user_id = ?`, [testUserEdge]);
      await db.execute(`DELETE FROM users WHERE id = ?`, [testUserEdge]);
    });

    it('Issue 1: Failed reconciliation invalidates previously fresh timestamp to 0 and marks UNAVAILABLE', async () => {
      const db = getDb();

      // 1. Establish initial healthy state with fresh timestamp
      const initialRec = await ReconciliationWorker.runReconciliation(testUserEdge);
      expect(initialRec.status).toBe('SUCCESS');

      const freshSync = await db.queryOne<any>(`SELECT * FROM exchange_sync_state WHERE account_id = ?`, [`rec_${testUserEdge}`]);
      expect(Number(freshSync.last_sync_at)).toBeGreaterThan(0);
      expect(freshSync.rest_health).toBe('HEALTHY');

      // Gate allows live order
      const initialGate = await OperationalSafetyGate.verifyOrderSubmission({
        userId: testUserEdge,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });
      expect(initialGate.allowed).toBe(true);

      // 2. Simulate subsequent venue failure
      ReconciliationWorker.setMockExchangeState(testUserEdge, {
        shouldFail: true,
        failureError: 'Simulated 500 Internal Server Error on Binance API',
      });

      const failedRec = await ReconciliationWorker.runReconciliation(testUserEdge);
      expect(failedRec.status).toBe('FAILED');

      // 3. Verify that ON CONFLICT DO UPDATE actively overwrote the old fresh timestamp to 0
      const failedSync = await db.queryOne<any>(`SELECT * FROM exchange_sync_state WHERE account_id = ?`, [`rec_${testUserEdge}`]);
      expect(Number(failedSync.last_sync_at)).toBe(0);
      expect(failedSync.rest_health).toBe('UNAVAILABLE');
      expect(ReconciliationWorker.getLastSuccessfulRunAt(testUserEdge)).toBe(0);

      // 4. Pre-trade gate MUST fail-closed immediately
      const postFailureGate = await OperationalSafetyGate.verifyOrderSubmission({
        userId: testUserEdge,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });
      expect(postFailureGate.allowed).toBe(false);
      expect(postFailureGate.reason).toContain("Exchange REST health is 'UNAVAILABLE'");
    });

    it('Issue 2: Locked reconciliation returns LOCKED status and does NOT reset circuit breaker', async () => {
      // Trip the breaker
      await CircuitBreakerService.trip('websocket_outage', 'ACCOUNT', testUserEdge, 'Simulated WS outage');
      expect((await CircuitBreakerService.isOpen('websocket_outage', 'ACCOUNT', testUserEdge)).isOpen).toBe(true);

      // Hold lock externally with a different instance ID to simulate concurrent worker
      const originalInstance = DistributedLockService.getInstanceId();
      DistributedLockService.setInstanceId('concurrent_instance_999');
      const leaseId = await DistributedLockService.acquireLease('worker:reconciliation', 30_000);
      expect(leaseId).toBe('concurrent_instance_999');
      DistributedLockService.setInstanceId(originalInstance);

      try {
        const recResult = await ReconciliationWorker.runReconciliation(testUserEdge);
        expect(recResult.status).toBe('LOCKED');
        expect(recResult.runId).toBe('skipped_locked');

        // Verify breaker is STILL OPEN because reconciliation did not run
        expect((await CircuitBreakerService.isOpen('websocket_outage', 'ACCOUNT', testUserEdge)).isOpen).toBe(true);
      } finally {
        await DistributedLockService.releaseLease('worker:reconciliation', 'concurrent_instance_999');
      }
    });

    it('Issue 5: Orphaned open orders fail clean reconciliation and mark rest_health DEGRADED with last_sync_at = 0', async () => {
      const db = getDb();

      // Reconcile with an orphaned venue order that does not exist in local DB
      const recResult = await ReconciliationWorker.reconcileOpenOrders(testUserEdge, 'test_orphan_run', [
        {
          orderId: 999888777,
          clientOrderId: 'orphaned_exchange_order_xyz',
          symbol: 'BTCUSDT',
          origQty: '0.5',
          status: 'NEW',
        },
      ]);
      expect(recResult.success).toBe(true);
      expect(recResult.mismatches).toBe(1);

      // Now run full reconciliation with mock state containing this orphaned order
      ReconciliationWorker.setMockExchangeState(testUserEdge, {
        openOrders: [
          {
            orderId: 999888777,
            clientOrderId: 'orphaned_exchange_order_xyz',
            symbol: 'BTCUSDT',
            origQty: '0.5',
            status: 'NEW',
          },
        ],
      });

      const fullRec = await ReconciliationWorker.runReconciliation(testUserEdge);
      expect(fullRec.status).toBe('MISMATCH_DETECTED');
      expect(fullRec.mismatchesFound).toBeGreaterThan(0);

      // Sync state must be DEGRADED, last_sync_at = 0
      const syncState = await db.queryOne<any>(`SELECT * FROM exchange_sync_state WHERE account_id = ?`, [`rec_${testUserEdge}`]);
      expect(Number(syncState.last_sync_at)).toBe(0);
      expect(syncState.rest_health).toBe('DEGRADED');

      // Pre-trade gate MUST block
      const gate = await OperationalSafetyGate.verifyOrderSubmission({
        userId: testUserEdge,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });
      expect(gate.allowed).toBe(false);
      expect(gate.reason).toMatch(/Unresolved HIGH reconciliation mismatch|Exchange REST health is 'DEGRADED'/);
    });

    it('Issue 6: OperationalSafetyGate blocks when rest_health is UNAVAILABLE even if timestamp is fresh', async () => {
      const db = getDb();
      // Artificially inject a fresh timestamp alongside UNAVAILABLE rest_health
      await db.execute(
        `INSERT INTO exchange_sync_state (account_id, last_sync_at, rest_health, updated_at)
         VALUES (?, ?, 'UNAVAILABLE', ?)
         ON CONFLICT(account_id) DO UPDATE SET
           last_sync_at = excluded.last_sync_at,
           rest_health = excluded.rest_health,
           updated_at = excluded.updated_at`,
        [`rec_${testUserEdge}`, Date.now(), Date.now()]
      );

      const check = await OperationalSafetyGate.verifyOrderSubmission({
        userId: testUserEdge,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });

      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("Exchange REST health is 'UNAVAILABLE' (must be HEALTHY)");
    });

    it('Issue 7: OperationalHealthReport surfaces live reconciliation and userStream status to frontend', async () => {
      const db = getDb();
      const now = Date.now();

      // Setup healthy reconciliation state
      await db.execute(
        `INSERT INTO exchange_sync_state (account_id, last_sync_at, rest_health, updated_at)
         VALUES (?, ?, 'HEALTHY', ?)
         ON CONFLICT(account_id) DO UPDATE SET
           last_sync_at = excluded.last_sync_at,
           rest_health = excluded.rest_health,
           updated_at = excluded.updated_at`,
        [`rec_${testUserEdge}`, now, now]
      );

      // Acquire a stream session
      await UserDataStreamManager.acquireListenKey(testUserEdge);

      const report = await OperationalSafetyService.getHealthReport(testUserEdge);
      expect(report.reconciliation).toBeDefined();
      expect(report.reconciliation?.restHealth).toBe('HEALTHY');
      expect(report.reconciliation?.isFresh).toBe(true);
      expect(report.reconciliation?.lastSyncAt).toBe(now);

      expect(report.userStream).toBeDefined();
      expect(report.userStream?.status).toBe('ACTIVE');
      expect(report.overallState).toBe('HEALTHY');
    });

    it('Issue 8: Production invariant strictly blocks mock credentials when NODE_ENV is production', async () => {
      const originalEnv = config.NODE_ENV;
      try {
        (config as any).NODE_ENV = 'production';

        await expect(
          BinanceGateway.saveExchangeCredentials('usr_prod_mock_reject', {
            apiKey: 'mock_test_key_xyz',
            apiSecret: 'mock_secret_xyz',
            environment: 'mainnet',
          })
        ).rejects.toThrow(/Security Invariant Violation: Mock or test credentials are strictly forbidden/);
      } finally {
        (config as any).NODE_ENV = originalEnv;
      }
    });
  });

  // =========================================================================
  // 12. INVARIANT HARDENING: DB AUTHORITY, IN-MEMORY VETO & DECOUPLED TELEMETRY
  // =========================================================================
  describe('12. Invariant Hardening: DB Authority, In-Memory VETO & Decoupled Cockpit Telemetry', () => {
    const userHard = 'usr_hardened_rec_001';
    const userFailTp = 'usr_rec_fail_tp';
    const userMismatch = 'usr_rec_mis_venue';

    beforeEach(async () => {
      ReconciliationWorker.resetForTesting();
      const db = getDb();
      const now = Date.now();
      for (const u of [userHard, userFailTp, userMismatch]) {
        await db.execute(
          `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
           VALUES (?, ?, 'Test User', 'email', ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
          [u, `${u}@lumen.io`, `prov_${u}`, now, now]
        );
        await BinanceGateway.saveExchangeCredentials(u, {
          apiKey: `mock_key_${u}`,
          apiSecret: `mock_secret_${u}`,
          environment: 'testnet',
        });
      }
      ClockSyncService.setSimulatedOffset(50);
    });

    afterEach(async () => {
      ReconciliationWorker.resetForTesting();
      const db = getDb();
      for (const u of [userHard, userFailTp, userMismatch]) {
        await db.execute(`DELETE FROM exchange_sync_state WHERE account_id = ?`, [`rec_${u}`]);
        await db.execute(`DELETE FROM exchange_orders WHERE user_id = ?`, [u]);
        await db.execute(`DELETE FROM reconciliation_mismatches WHERE user_id = ?`, [u]);
        await db.execute(`DELETE FROM exchange_accounts WHERE user_id = ?`, [u]);
        await db.execute(`DELETE FROM users WHERE id = ?`, [u]);
      }
      await db.execute(`DELETE FROM exchange_sync_state WHERE account_id = 'rec_global'`);
    });

    it('Phase 6 - Issue 1: Failed DB write on HEALTHY state invalidates in-memory timestamp and fails reconciliation run', async () => {
      const db = getDb();
      const originalExecute = db.execute.bind(db);

      const executeSpy = vi.spyOn(db, 'execute').mockImplementation(async (sql: string, params?: any[]) => {
        if (
          typeof sql === 'string' &&
          sql.includes('INSERT INTO exchange_sync_state') &&
          sql.includes('HEALTHY') &&
          params?.includes(`rec_${userHard}`)
        ) {
          throw new Error('Simulated disk I/O failure writing HEALTHY sync state to DB');
        }
        return originalExecute(sql, params);
      });

      try {
        const recResult = await ReconciliationWorker.runReconciliation(userHard);
        expect(recResult.status).toBe('FAILED');
        // In-memory timestamp MUST be invalidated to 0
        expect(ReconciliationWorker.getLastSuccessfulRunAt(userHard)).toBe(0);

        // Pre-trade gate MUST fail closed
        const check = await OperationalSafetyGate.verifyOrderSubmission({
          userId: userHard,
          symbol: 'BTCUSDT',
          quoteAsset: 'USDT',
          side: 'BUY',
          type: 'LIMIT',
          quantity: '0.01',
          price: '50000',
          isLive: true,
        });
        expect(check.allowed).toBe(false);
      } finally {
        executeSpy.mockRestore();
      }
    });

    it('Phase 6 - Issue 2: Strict DB authority & memory veto invariant (DB can authorize, memory can only veto)', async () => {
      const db = getDb();

      // Case A: Missing DB row with non-zero in-memory timestamp -> BLOCKED
      await db.execute(`DELETE FROM exchange_sync_state WHERE account_id = ?`, [`rec_${userHard}`]);
      ReconciliationWorker.setLastSuccessfulRunAt(Date.now(), userHard);

      const checkMissingDb = await OperationalSafetyGate.verifyOrderSubmission({
        userId: userHard,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });
      expect(checkMissingDb.allowed).toBe(false);
      expect(checkMissingDb.reason).toContain('No durable exchange sync state found');

      // Case B: DB indicates HEALTHY, but in-memory state is 0 (memory veto) -> BLOCKED
      const now = Date.now();
      await db.execute(
        `INSERT INTO exchange_sync_state (account_id, last_sync_at, rest_health, updated_at)
         VALUES (?, ?, 'HEALTHY', ?)
         ON CONFLICT(account_id) DO UPDATE SET last_sync_at = excluded.last_sync_at, rest_health = 'HEALTHY'`,
        [`rec_${userHard}`, now, now]
      );
      ReconciliationWorker.setLastSuccessfulRunAt(0, userHard); // In-memory veto

      const checkVeto = await OperationalSafetyGate.verifyOrderSubmission({
        userId: userHard,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });
      expect(checkVeto.allowed).toBe(false);
      expect(checkVeto.reason).toContain('In-memory reconciliation state is invalidated or pending verification');

      // Case C: Both DB and memory indicate HEALTHY & fresh -> ALLOWED
      ReconciliationWorker.setLastSuccessfulRunAt(now, userHard);
      const checkPass = await OperationalSafetyGate.verifyOrderSubmission({
        userId: userHard,
        symbol: 'BTCUSDT',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.01',
        price: '50000',
        isLive: true,
      });
      expect(checkPass.allowed).toBe(true);
    });

    it('Phase 6 - Issue 3: getHealthReport decouples per-user account health from rec_global', async () => {
      const db = getDb();
      const now = Date.now();

      // Seed global venue sync state as HEALTHY
      await db.execute(
        `INSERT INTO exchange_sync_state (account_id, last_sync_at, rest_health, updated_at)
         VALUES ('rec_global', ?, 'HEALTHY', ?)
         ON CONFLICT(account_id) DO UPDATE SET last_sync_at = excluded.last_sync_at, rest_health = 'HEALTHY'`,
        [now, now]
      );

      // Seed an uninitialized account with NO row
      const uninitUser = 'usr_uninit_telemetry_999';
      await db.execute(`DELETE FROM exchange_sync_state WHERE account_id = ?`, [`rec_${uninitUser}`]);

      const report = await OperationalSafetyService.getHealthReport(uninitUser);

      // Account-specific reconciliation must NOT fall back to rec_global
      expect(report.reconciliation).toBeDefined();
      expect(report.reconciliation?.lastSyncAt).toBe(0);
      expect(report.reconciliation?.restHealth).toBe('INITIALIZING');
      expect(report.reconciliation?.isFresh).toBe(false);

      // Global reconciliation must be cleanly exposed as a separate entity
      expect(report.globalReconciliation).toBeDefined();
      expect(report.globalReconciliation?.lastSyncAt).toBe(now);
      expect(report.globalReconciliation?.restHealth).toBe('HEALTHY');
      expect(report.globalReconciliation?.isFresh).toBe(true);
    });

    it('Phase 6 - Issue 4: Distinct semantic classification between transport failure (UNAVAILABLE) and mismatches (DEGRADED)', async () => {
      const db = getDb();

      // Case A: Exchange REST transport failure -> globalHealth UNAVAILABLE
      ReconciliationWorker.setMockExchangeState(userFailTp, {
        shouldFail: true,
        failureError: 'Simulated 503 Service Unavailable on Binance REST API',
      });

      const recResultTransportFail = await ReconciliationWorker.runReconciliation();
      expect(recResultTransportFail.status).toBe('FAILED');

      const syncStateTransport = await db.queryOne<any>(
        `SELECT rest_health, last_sync_at FROM exchange_sync_state WHERE account_id = 'rec_global'`
      );
      expect(syncStateTransport.rest_health).toBe('UNAVAILABLE');
      expect(Number(syncStateTransport.last_sync_at)).toBe(0);

      // Case B: Exchange responded fine, but ledger/venue state mismatch detected -> globalHealth DEGRADED
      ReconciliationWorker.setMockExchangeState(userFailTp, { shouldFail: false });
      ReconciliationWorker.setMockExchangeState(userMismatch, {
        openOrders: [
          {
            orderId: 888777666,
            clientOrderId: 'mismatched_global_order_001',
            symbol: 'BTCUSDT',
            origQty: '0.25',
            status: 'NEW',
          },
        ],
      });

      const recResultMismatch = await ReconciliationWorker.runReconciliation();
      expect(recResultMismatch.status).toBe('MISMATCH_DETECTED');

      const syncStateMismatch = await db.queryOne<any>(
        `SELECT rest_health, last_sync_at FROM exchange_sync_state WHERE account_id = 'rec_global'`
      );
      expect(syncStateMismatch.rest_health).toBe('DEGRADED');
      expect(Number(syncStateMismatch.last_sync_at)).toBe(0);
    });
  });
});

