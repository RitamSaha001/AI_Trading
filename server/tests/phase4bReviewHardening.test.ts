import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb } from '../db';
import { buildServer } from '../index';
import { config } from '../config';
import { ServerAuthService } from '../services/authService';
import { EmergencyControlService } from '../services/emergencyControlService';
import { LiveOrderGateService } from '../services/liveOrderGateService';
import { LiveOrderConfirmationService } from '../services/liveOrderConfirmationService';
import { UpstoxAdapter } from '../services/brokers/upstox/upstoxAdapter';
import { UpstoxClient } from '../services/brokers/upstox/upstoxClient';
import { IndianMarketCalendar } from '../services/brokers/upstox/indianMarketCalendar';

describe('Phase 4B Code Review Hardening: 7 Critical Issues Verification', () => {
  const adminUserId = 'usr_admin_review_001';
  const traderUserId = 'usr_trader_review_002';
  let adminSessionToken: string;
  let traderSessionToken: string;
  let server: ReturnType<typeof buildServer>;

  beforeEach(async () => {
    const db = getDb();
    const now = Date.now();

    vi.spyOn(config, 'UPSTOX_LIVE_TRADING_ENABLED', 'get').mockReturnValue(true);
    await EmergencyControlService.setState('TRADING_NORMAL', 'Reset for test', 'test_runner');
    UpstoxClient.resetForTesting();
    UpstoxClient.setMockOutboundIp(config.UPSTOX_STATIC_IP || '198.51.100.1');
    IndianMarketCalendar.setMockMarketOpen(true);

    // Clean up
    await db.execute(`DELETE FROM panic_squareoff_runs WHERE user_id IN (?, ?)`, [adminUserId, traderUserId]);
    await db.execute(`DELETE FROM live_order_confirmations WHERE user_id IN (?, ?)`, [adminUserId, traderUserId]);
    await db.execute(`DELETE FROM exchange_orders WHERE user_id IN (?, ?)`, [adminUserId, traderUserId]);
    await db.execute(`DELETE FROM ledger_entries WHERE user_id IN (?, ?)`, [adminUserId, traderUserId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id IN (?, ?)`, [adminUserId, traderUserId]);
    await db.execute(`DELETE FROM broker_credentials WHERE user_id IN (?, ?)`, [adminUserId, traderUserId]);
    await db.execute(`DELETE FROM sessions WHERE user_id IN (?, ?)`, [adminUserId, traderUserId]);
    await db.execute(`DELETE FROM account_limits WHERE user_id IN (?, ?)`, [adminUserId, traderUserId]);
    await db.execute(`DELETE FROM users WHERE id IN (?, ?)`, [adminUserId, traderUserId]);

    // Seed Admin User
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, 'admin_review@lumen.io', 'Admin User', 'email', 'prov_admin', 'ADMIN', ?, ?)`,
      [adminUserId, now, now]
    );

    // Seed Trader User (Non-Admin)
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, 'trader_review@lumen.io', 'Trader User', 'email', 'prov_trader', 'TRADER', ?, ?)`,
      [traderUserId, now, now]
    );

    // Seed KYC verified
    await db.execute(
      `INSERT INTO kyc_records (id, user_id, tier, status, pan_masked, country, verified_at, updated_at)
       VALUES
        ('kyc_admin_rev', ?, 'tier2_verified', 'verified', 'XXXXX1234F', 'IN', ?, ?),
        ('kyc_trader_rev', ?, 'tier2_verified', 'verified', 'XXXXX5678G', 'IN', ?, ?)`,
      [adminUserId, now, now, traderUserId, now, now]
    );

    // Seed Account Limits
    await db.execute(
      `INSERT INTO account_limits (
        id, user_id, account_mode, is_emergency_frozen,
        max_asset_concentration_pct, min_cash_reserve_pct, max_single_order_pct,
        max_daily_loss_usd, updated_at
      ) VALUES
        ('lim_admin_rev', ?, 'live', 0, 0.50, 0.15, 0.30, 25000.0, ?),
        ('lim_trader_rev', ?, 'live', 0, 0.50, 0.15, 0.30, 25000.0, ?)`,
      [adminUserId, now, traderUserId, now]
    );

    // Seed Credentials
    const futureExpiry = now + 86400 * 1000;
    const encryptedToken = UpstoxAdapter.encryptSecret('mock_review_access_token');
    await db.execute(
      `INSERT INTO broker_credentials (
        id, user_id, broker, environment, auth_type, access_token_encrypted,
        token_expires_at, account_id, can_trade, can_withdraw, is_safe,
        last_sync_at, created_at, updated_at
      ) VALUES
        ('cred_admin_rev', ?, 'upstox', 'production', 'oauth2', ?, ?, 'UCC_ADMIN_001', 1, 0, 1, ?, ?, ?),
        ('cred_trader_rev', ?, 'upstox', 'production', 'oauth2', ?, ?, 'UCC_TRADER_001', 1, 0, 1, ?, ?, ?)`,
      [adminUserId, encryptedToken, futureExpiry, now, now, now, traderUserId, encryptedToken, futureExpiry, now, now, now]
    );

    // Seed Ledger Cash
    await db.execute(
      `INSERT INTO ledger_accounts (
        id, user_id, account_mode, account_type, asset_or_currency,
        balance_minor, reserved_minor, created_at, updated_at
      ) VALUES
        ('acc_cash_admin', ?, 'live', 'trading_allocated', 'INR', 10000000, 0, ?, ?),
        ('acc_cash_trader', ?, 'live', 'trading_allocated', 'INR', 10000000, 0, ?, ?)`,
      [adminUserId, now, now, traderUserId, now, now]
    );

    // Seed Sessions
    const adminSession = await ServerAuthService.createSession(adminUserId, '127.0.0.1', 'Vitest-Admin');
    adminSessionToken = adminSession.rawToken;

    const traderSession = await ServerAuthService.createSession(traderUserId, '127.0.0.1', 'Vitest-Trader');
    traderSessionToken = traderSession.rawToken;

    server = buildServer();
  });

  afterEach(async () => {
    const db = getDb();
    await EmergencyControlService.setState('TRADING_NORMAL', 'Teardown reset', 'test_runner');
    IndianMarketCalendar.setMockMarketOpen(null);
    await db.execute(`DELETE FROM panic_squareoff_runs WHERE user_id IN (?, ?)`, [adminUserId, traderUserId]);
    await db.execute(`DELETE FROM live_order_confirmations WHERE user_id IN (?, ?)`, [adminUserId, traderUserId]);
    await db.execute(`DELETE FROM exchange_orders WHERE user_id IN (?, ?)`, [adminUserId, traderUserId]);
    await db.execute(`DELETE FROM ledger_entries WHERE user_id IN (?, ?)`, [adminUserId, traderUserId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id IN (?, ?)`, [adminUserId, traderUserId]);
    await db.execute(`DELETE FROM broker_credentials WHERE user_id IN (?, ?)`, [adminUserId, traderUserId]);
    await db.execute(`DELETE FROM sessions WHERE user_id IN (?, ?)`, [adminUserId, traderUserId]);
    await db.execute(`DELETE FROM account_limits WHERE user_id IN (?, ?)`, [adminUserId, traderUserId]);
    await db.execute(`DELETE FROM users WHERE id IN (?, ?)`, [adminUserId, traderUserId]);
  });

  // ==========================================================================
  // ISSUE 1 (P0): Panic square-off conflicts with live-order gate
  // ==========================================================================
  describe('P0 Issue 1: Panic Square-Off Integration with LiveOrderGate', () => {
    it('executes panic square-off position close without CONFIRMATION_REQUIRED rejection', async () => {
      let positionFetchCount = 0;
      UpstoxClient.setTransport(async (url: string) => {
        if (url.includes('/order/retrieve-all')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({ status: 'success', data: [] }),
            text: async () => '',
          };
        }
        if (url.includes('/portfolio/short-term-positions')) {
          positionFetchCount++;
          return {
            status: 200,
            ok: true,
            json: async () => ({
              status: 'success',
              data:
                positionFetchCount === 1
                  ? [
                      {
                        instrument_token: 'NSE_EQ|INE002A01018',
                        trading_symbol: 'RELIANCE',
                        quantity: 10,
                        average_price: 2800.0,
                        last_price: 2850.0,
                        product: 'D',
                      },
                    ]
                  : [],
            }),
            text: async () => '',
          };
        }
        if (url.includes('/order/place')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({ status: 'success', data: { order_id: 'upstox_panic_fill_001' } }),
            text: async () => '',
          };
        }
        return { status: 404, ok: false, json: async () => ({}), text: async () => '' };
      });

      // Execute Panic Square-Off
      const summary = await EmergencyControlService.executePanicSquareOff(
        adminUserId,
        'upstox',
        'Emergency drill',
        'risk_sentinel'
      );

      // Verify that panic square-off submitted the close order successfully without gate rejection
      expect(['COMPLETED', 'PARTIAL']).toContain(summary.status);
      expect(summary.closeOrdersSubmittedCount).toBe(1);
      expect(summary.errors.some((e) => e.includes('CONFIRMATION_REQUIRED'))).toBe(false);
    });

    it('rejects isSystemPanic if system is NOT in PANIC state', async () => {
      // Ensure system state is TRADING_NORMAL
      await EmergencyControlService.setState('TRADING_NORMAL', 'Normal state', 'test_runner');

      await expect(
        LiveOrderGateService.verifyLiveOrderPreSubmission({
          userId: traderUserId,
          broker: 'upstox',
          symbol: 'RELIANCE',
          side: 'SELL',
          type: 'MARKET',
          quantity: 1,
          product: 'CNC',
          idempotencyKey: 'idemp_fake_panic_001',
          accountMode: 'live',
          isSystemPanic: true, // Malicious / invalid panic order while not in PANIC
        })
      ).rejects.toThrow(/Unauthorized panic order: System is not in PANIC state/i);
    });
  });

  // ==========================================================================
  // ISSUE 2: Emergency endpoints lack admin-only authorization
  // ==========================================================================
  describe('Issue 2: Emergency Endpoints Admin-Only Authorization Guard', () => {
    it('rejects regular trader from triggering panic square-off with 403', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/emergency/panic',
        headers: {
          origin: 'http://localhost:3000',
        },
        cookies: {
          lumen_session: traderSessionToken,
        },
        payload: { broker: 'upstox', reason: 'Unauthorized trigger attempt' },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Administrative or compliance auditor privileges required');
    });

    it('rejects regular trader from halting or resuming trading with 403', async () => {
      const haltRes = await server.inject({
        method: 'POST',
        url: '/api/emergency/halt',
        headers: {
          origin: 'http://localhost:3000',
        },
        cookies: {
          lumen_session: traderSessionToken,
        },
        payload: { reason: 'Unauthorized halt' },
      });
      expect(haltRes.statusCode).toBe(403);

      const resumeRes = await server.inject({
        method: 'POST',
        url: '/api/emergency/resume',
        headers: {
          origin: 'http://localhost:3000',
        },
        cookies: {
          lumen_session: traderSessionToken,
        },
        payload: { reason: 'Unauthorized resume' },
      });
      expect(resumeRes.statusCode).toBe(403);
    });

    it('allows admin user to halt and resume trading', async () => {
      const haltRes = await server.inject({
        method: 'POST',
        url: '/api/emergency/halt',
        headers: {
          origin: 'http://localhost:3000',
        },
        cookies: {
          lumen_session: adminSessionToken,
        },
        payload: { reason: 'Scheduled Maintenance Halt' },
      });
      expect(haltRes.statusCode).toBe(200);
      const haltBody = JSON.parse(haltRes.body);
      expect(haltBody.success).toBe(true);
      expect(haltBody.status.state).toBe('TRADING_HALTED');

      const resumeRes = await server.inject({
        method: 'POST',
        url: '/api/emergency/resume',
        headers: {
          origin: 'http://localhost:3000',
        },
        cookies: {
          lumen_session: adminSessionToken,
        },
        payload: { reason: 'Maintenance Completed' },
      });
      expect(resumeRes.statusCode).toBe(200);
      const resumeBody = JSON.parse(resumeRes.body);
      expect(resumeBody.success).toBe(true);
      expect(resumeBody.status.state).toBe('TRADING_NORMAL');
    });
  });

  // ==========================================================================
  // ISSUE 3: Pre-allocated clientOrderId not actually used
  // ==========================================================================
  describe('Issue 3: Pre-Allocated Identity Chain Wiring', () => {
    it('uses pre-allocated clientOrderId and idempotencyKey in /api/orders/confirm', async () => {
      // Mock Upstox place order transport
      let capturedTag = '';
      UpstoxClient.setTransport(async (url: string, init?: RequestInit) => {
        if (url.includes('/order/place')) {
          const parsed = JSON.parse(init?.body as string);
          capturedTag = parsed.tag;
          return {
            status: 200,
            ok: true,
            json: async () => ({ status: 'success', data: { order_id: 'upstox_ord_identity_001' } }),
            text: async () => '',
          };
        }
        return { status: 404, ok: false, json: async () => ({}), text: async () => '' };
      });

      // 1. Propose order
      const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
        userId: traderUserId,
        broker: 'upstox',
        symbol: 'RELIANCE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1,
        price: 2800,
        product: 'CNC',
      });

      expect(proposal.clientOrderId).toBeDefined();
      expect(proposal.idempotencyKey).toBeDefined();

      // 2. Confirm order via API
      const confirmRes = await server.inject({
        method: 'POST',
        url: '/api/orders/confirm',
        headers: {
          origin: 'http://localhost:3000',
        },
        cookies: {
          lumen_session: traderSessionToken,
        },
        payload: {
          confirmationId: proposal.confirmationId,
          broker: 'upstox',
          symbol: 'RELIANCE',
          side: 'BUY',
          type: 'LIMIT',
          quantity: 1,
          price: 2800,
          product: 'CNC',
        },
      });

      expect(confirmRes.statusCode).toBe(200);
      const confirmBody = JSON.parse(confirmRes.body);
      expect(confirmBody.success).toBe(true);

      // Verify that the order record has the pre-allocated clientOrderId
      expect(confirmBody.order.clientOrderId).toBe(proposal.clientOrderId);
      const db = getDb();
      const orderRow = await db.queryOne<any>(
        `SELECT * FROM exchange_orders WHERE client_order_id = ?`,
        [proposal.clientOrderId]
      );
      expect(orderRow?.idempotency_key).toBe(proposal.idempotencyKey);
      // Verify Upstox tag received the pre-allocated clientOrderId suffix
      expect(capturedTag).toBe(proposal.clientOrderId.slice(-20));
    });
  });

  // ==========================================================================
  // ISSUE 4: Confirmation consumed before all gate checks pass
  // ==========================================================================
  describe('Issue 4: Confirmation Consumption Ordering', () => {
    it('does NOT mark confirmation as CONSUMED if funds check fails', async () => {
      // 1. Propose order
      const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
        userId: traderUserId,
        broker: 'upstox',
        symbol: 'RELIANCE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 10,
        price: 2800,
        product: 'CNC',
      });

      // 2. Drain user cash to zero so funds check fails
      const db = getDb();
      await db.execute(
        `UPDATE ledger_accounts SET balance_minor = 0 WHERE user_id = ? AND account_type = 'trading_allocated'`,
        [traderUserId]
      );

      // 3. Attempt verification - expect INSUFFICIENT_FUNDS or insufficient cash
      await expect(
        LiveOrderGateService.verifyLiveOrderPreSubmission(
          {
            userId: traderUserId,
            broker: 'upstox',
            symbol: 'RELIANCE',
            side: 'BUY',
            type: 'LIMIT',
            quantity: 10,
            price: 2800,
            product: 'CNC',
            idempotencyKey: proposal.idempotencyKey,
            clientOrderId: proposal.clientOrderId,
            accountMode: 'live',
          },
          proposal.confirmationId
        )
      ).rejects.toThrow(/Insufficient liquid INR cash|Insufficient funds/i);

      // 4. Verify confirmation status is STILL 'PENDING' (not burned!)
      const confAfter = await LiveOrderConfirmationService.getConfirmation(proposal.confirmationId, traderUserId);
      expect(confAfter?.status).toBe('PENDING');
    });
  });

  // ==========================================================================
  // ISSUE 5: Risk drift check is too narrow
  // ==========================================================================
  describe('Issue 5: Comprehensive Risk Drift Revalidation', () => {
    it('rejects order if available cash degrades by >25% since proposal', async () => {
      // 1. Propose order
      const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
        userId: traderUserId,
        broker: 'upstox',
        symbol: 'RELIANCE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1,
        price: 2800,
        product: 'CNC',
      });

      // 2. Manually alter risk snapshot in confirmation to simulate a 30% cash reduction
      const db = getDb();
      const initialSnapshot = proposal.riskSnapshot;
      const degradedSnapshot = {
        ...initialSnapshot,
        availableCash: initialSnapshot.availableCash * 1.5, // proposal had 50% more cash, so current cash represents >25% degradation
      };
      await db.execute(
        `UPDATE live_order_confirmations SET risk_snapshot = ? WHERE id = ?`,
        [JSON.stringify(degradedSnapshot), proposal.confirmationId]
      );

      // 3. Verify gate rejects due to cash degradation
      await expect(
        LiveOrderGateService.verifyLiveOrderPreSubmission(
          {
            userId: traderUserId,
            broker: 'upstox',
            symbol: 'RELIANCE',
            side: 'BUY',
            type: 'LIMIT',
            quantity: 1,
            price: 2800,
            product: 'CNC',
            idempotencyKey: proposal.idempotencyKey,
            clientOrderId: proposal.clientOrderId,
            accountMode: 'live',
          },
          proposal.confirmationId
        )
      ).rejects.toThrow(/Available cash has degraded significantly/i);
    });

    it('rejects order if projected concentration increases by >5 percentage points', async () => {
      const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
        userId: traderUserId,
        broker: 'upstox',
        symbol: 'RELIANCE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1,
        price: 2800,
        product: 'CNC',
      });

      // Simulate concentration drift (proposal thought it was 0%, now it is higher)
      const db = getDb();
      const initialSnapshot = proposal.riskSnapshot;
      const degradedSnapshot = {
        ...initialSnapshot,
        projectedConcentrationPct: -0.10, // will trigger currentConcentration > initial + 0.05
      };
      await db.execute(
        `UPDATE live_order_confirmations SET risk_snapshot = ? WHERE id = ?`,
        [JSON.stringify(degradedSnapshot), proposal.confirmationId]
      );

      await expect(
        LiveOrderGateService.verifyLiveOrderPreSubmission(
          {
            userId: traderUserId,
            broker: 'upstox',
            symbol: 'RELIANCE',
            side: 'BUY',
            type: 'LIMIT',
            quantity: 1,
            price: 2800,
            product: 'CNC',
            idempotencyKey: proposal.idempotencyKey,
            clientOrderId: proposal.clientOrderId,
            accountMode: 'live',
          },
          proposal.confirmationId
        )
      ).rejects.toThrow(/Projected asset concentration drifted beyond safe tolerance/i);
    });
  });

  // ==========================================================================
  // ISSUE 6: Anti-tampering hash doesn't cover all execution parameters
  // ==========================================================================
  describe('Issue 6: Anti-Tampering Hash Coverage of Slicing and Disclosed Qty', () => {
    it('produces different hashes when disclosedQuantity or slice differs', () => {
      const base = {
        userId: traderUserId,
        broker: 'upstox',
        symbol: 'RELIANCE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 2800,
        product: 'CNC',
      };

      const hash1 = LiveOrderConfirmationService.computeOrderHash({ ...base, slice: false, disclosedQuantity: 0 });
      const hash2 = LiveOrderConfirmationService.computeOrderHash({ ...base, slice: true, disclosedQuantity: 0 });
      const hash3 = LiveOrderConfirmationService.computeOrderHash({ ...base, slice: false, disclosedQuantity: 50 });

      expect(hash1).not.toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash2).not.toBe(hash3);
    });

    it('rejects order with ORDER_PARAMETER_TAMPERING if slice flag is tampered upon confirmation', async () => {
      // Propose with slice = false
      const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
        userId: traderUserId,
        broker: 'upstox',
        symbol: 'RELIANCE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 10,
        price: 2800,
        product: 'CNC',
        slice: false,
      });

      // Attempt to confirm with slice = true
      await expect(
        LiveOrderGateService.verifyLiveOrderPreSubmission(
          {
            userId: traderUserId,
            broker: 'upstox',
            symbol: 'RELIANCE',
            side: 'BUY',
            type: 'LIMIT',
            quantity: 10,
            price: 2800,
            product: 'CNC',
            slice: true, // Tampered!
            idempotencyKey: proposal.idempotencyKey,
            clientOrderId: proposal.clientOrderId,
            accountMode: 'live',
          },
          proposal.confirmationId
        )
      ).rejects.toThrow(/Order parameters do not match confirmed proposal/i);
    });
  });

  // ==========================================================================
  // ISSUE 7: Panic doesn't perform final authoritative reconciliation
  // ==========================================================================
  describe('Issue 7: Authoritative Post-Panic Reconciliation Pass', () => {
    it('performs post-square-off reconciliation and records result in database', async () => {
      // Transport returns 0 open orders and 0 positions after panic
      UpstoxClient.setTransport(async (url: string) => {
        if (url.includes('/order/retrieve-all')) {
          return { status: 200, ok: true, json: async () => ({ status: 'success', data: [] }), text: async () => '' };
        }
        if (url.includes('/portfolio/short-term-positions')) {
          return { status: 200, ok: true, json: async () => ({ status: 'success', data: [] }), text: async () => '' };
        }
        return { status: 404, ok: false, json: async () => ({}), text: async () => '' };
      });

      const summary = await EmergencyControlService.executePanicSquareOff(
        adminUserId,
        'upstox',
        'Reconciliation test',
        'operator'
      );

      expect(summary.reconciliation).toBeDefined();
      expect(summary.reconciliation?.isCompletelyFlat).toBe(true);
      expect(summary.reconciliation?.residualOpenOrdersCount).toBe(0);
      expect(summary.reconciliation?.residualPositionsCount).toBe(0);

      // Verify persisted in panic_squareoff_runs table
      const db = getDb();
      const row = await db.queryOne<any>(`SELECT reconciliation_result FROM panic_squareoff_runs WHERE id = ?`, [summary.runId]);
      expect(row?.reconciliation_result).toBeDefined();
      const parsed = JSON.parse(row.reconciliation_result);
      expect(parsed.isCompletelyFlat).toBe(true);
    });

    it('flags reconciliation warnings when residual positions remain after square-off', async () => {
      // Transport returns a residual open position after square-off
      UpstoxClient.setTransport(async (url: string) => {
        if (url.includes('/order/retrieve-all')) {
          return { status: 200, ok: true, json: async () => ({ status: 'success', data: [] }), text: async () => '' };
        }
        if (url.includes('/portfolio/short-term-positions')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              status: 'success',
              data: [
                {
                  instrument_token: 'NSE_EQ|INE002A01018',
                  trading_symbol: 'RELIANCE',
                  quantity: 5, // Still 5 shares remaining!
                  average_price: 2800.0,
                  last_price: 2850.0,
                  product: 'D',
                },
              ],
            }),
            text: async () => '',
          };
        }
        if (url.includes('/order/place')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({ status: 'success', data: { order_id: 'upstox_panic_ord_residual' } }),
            text: async () => '',
          };
        }
        return { status: 404, ok: false, json: async () => ({}), text: async () => '' };
      });

      const summary = await EmergencyControlService.executePanicSquareOff(
        adminUserId,
        'upstox',
        'Residual position test',
        'operator'
      );

      expect(summary.reconciliation).toBeDefined();
      expect(summary.reconciliation?.isCompletelyFlat).toBe(false);
      expect(summary.reconciliation?.residualPositionsCount).toBe(1);
      expect(summary.errors.some((e) => e.includes('Reconciliation warning'))).toBe(true);
    });
  });
});
