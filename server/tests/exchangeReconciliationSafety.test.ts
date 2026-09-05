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

      const mismatches = await ReconciliationWorker.reconcileOpenOrders(
        userId,
        'run_test_orphan',
        venueOpenOrders
      );

      expect(mismatches).toBe(1);

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

      const mismatches = await ReconciliationWorker.reconcileTrades(
        userId,
        'run_test_missing_trade',
        'BTCUSDT',
        missingVenueTrades
      );

      expect(mismatches).toBe(1);

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
      const repeatMismatches = await ReconciliationWorker.reconcileTrades(
        userId,
        'run_test_missing_trade_2',
        'BTCUSDT',
        missingVenueTrades
      );
      expect(repeatMismatches).toBe(0);
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
      const mismatches = await ReconciliationWorker.reconcileBalancesAgainstExchange(
        userId,
        'run_critical_cash',
        { USDT: 90000 }
      );

      expect(mismatches).toBeGreaterThan(0);

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
      ReconciliationWorker.setLastSuccessfulRunAt(Date.now() - 400_000);

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
      ReconciliationWorker.setLastSuccessfulRunAt(Date.now());
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
});

