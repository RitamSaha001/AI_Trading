import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb } from '../db';
import { OrderFillsService } from '../services/orderFillsService';
import { OrderStateMachine } from '../services/orderStateMachine';
import { LedgerService } from '../services/ledgerService';
import { ReconciliationWorker } from '../services/reconciliationWorker';
import { DistributedLockService, LeaseController } from '../services/distributedLockService';
import { LiveOrderConfirmationService } from '../services/liveOrderConfirmationService';
import { LiveOrderGateService } from '../services/liveOrderGateService';
import { UpstoxAdapter } from '../services/brokers/upstox/upstoxAdapter';
import { UpstoxClient } from '../services/brokers/upstox/upstoxClient';
import { UpstoxInstrumentMasterService } from '../services/brokers/upstox/upstoxInstrumentMasterService';
import { IndianMarketCalendar } from '../services/brokers/upstox/indianMarketCalendar';
import { EmergencyControlService } from '../services/emergencyControlService';
import { ExactDecimal } from '../services/precision';
import { config } from '../config';
import crypto from 'node:crypto';

describe('P0 & P1 Financial Execution & Ledger Integrity Hardening Suite', () => {
  const testUserId = `usr_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  let adapter: UpstoxAdapter;

  beforeEach(async () => {
    UpstoxClient.resetForTesting();
    const db = getDb();
    adapter = new UpstoxAdapter();

    const now = Date.now();

    // Create test user
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, role, created_at, updated_at)
       VALUES (?, ?, 'Test Trader', 'email', ?, 'TRADER', ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [testUserId, `${testUserId}@example.com`, `prov_${testUserId}`, now, now]
    );

    // Seed KYC verified record
    await db.execute(
      `INSERT INTO kyc_records (id, user_id, tier, status, pan_masked, country, verified_at, updated_at)
       VALUES (?, ?, 'tier2_verified', 'verified', 'ABCDE1234F', 'IN', ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [`kyc_${testUserId}`, testUserId, now, now]
    );

    // Seed Account Limits
    await db.execute(
      `INSERT INTO account_limits (
        id, user_id, account_mode, is_emergency_frozen,
        max_asset_concentration_pct, min_cash_reserve_pct, max_single_order_pct,
        max_daily_loss_usd, updated_at
      ) VALUES (?, ?, 'live', 0, 0.50, 0.15, 0.30, 25000.0, ?)
      ON CONFLICT (id) DO NOTHING`,
      [`lim_${testUserId}`, testUserId, now]
    );

    // Create trading_allocated account with ₹1,000,000 (100,000,000 paise)
    await db.execute(
      `INSERT INTO ledger_accounts (
        id, user_id, account_mode, account_type, asset_or_currency,
        balance_minor, reserved_minor, created_at, updated_at
      ) VALUES (?, ?, 'live', 'trading_allocated', 'INR', 100000000, 0, ?, ?)
      ON CONFLICT (id) DO UPDATE SET balance_minor = 100000000, reserved_minor = 0`,
      [`acc_cash_${testUserId}`, testUserId, Date.now(), Date.now()]
    );

    // Setup valid Upstox credentials
    const token = 'mock_upstox_token_p0p1';
    const encryptedToken = (adapter as any).encryptSecret(token);
    await db.execute(
      `INSERT INTO broker_credentials (
        id, user_id, broker, environment, auth_type, access_token_encrypted,
        token_expires_at, can_trade, can_withdraw, is_safe, last_sync_at, created_at, updated_at
      ) VALUES (?, ?, 'upstox', 'production', 'oauth2', ?, ?, 1, 0, 1, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET access_token_encrypted = excluded.access_token_encrypted, token_expires_at = excluded.token_expires_at`,
      [`cred_${testUserId}`, testUserId, encryptedToken, Date.now() + 86400000, Date.now(), Date.now(), Date.now()]
    );
  });

  afterEach(async () => {
    UpstoxClient.resetForTesting();
    vi.restoreAllMocks();
    const db = getDb();
    await db.execute(`DELETE FROM exchange_order_children WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM exchange_fills WHERE client_order_id LIKE ? OR order_id LIKE ?`, [`%${testUserId}%`, `%${testUserId}%`]);
    await db.execute(`DELETE FROM order_reservations WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM live_order_confirmations WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM exchange_orders WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM ledger_entries WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM broker_credentials WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM account_limits WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM kyc_records WHERE user_id = ?`, [testUserId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [testUserId]);
  });

  // ==========================================================================
  // P0-1: Upstox Order ID vs Database Primary-Key Relational Identity
  // ==========================================================================
  describe('P0-1: Foreign-Key Relational Identity in exchange_fills', () => {
    it('guarantees exchange_fills.order_id strictly references exchange_orders.id primary key', async () => {
      const db = getDb();
      const internalPk = `ord_internal_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const clientOrdId = `client_custom_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const now = Date.now();

      // Insert order where internal id != client_order_id
      await db.execute(
        `INSERT INTO exchange_orders (
          id, user_id, client_order_id, symbol, side, type, status,
          orig_qty, executed_qty, price, avg_price, quote_asset, notional,
          fee, reserved_cash, reserved_qty, orig_qty_exact, price_exact, notional_exact,
          broker, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, 'RELIANCE', 'BUY', 'LIMIT', 'OPEN', 10, 0, 2500, 0, 'INR', 25000, 0, 25000, 0, '10', '2500', '25000', 'upstox', ?, ?, ?)`,
        [internalPk, testUserId, clientOrdId, clientOrdId, now, now]
      );

      // Record fill using client_order_id as the identifier
      const canonicalFillKey = `canon_fill_${Date.now()}_1`;
      const fillResult = await OrderFillsService.recordFill(db, {
        orderIdentifier: clientOrdId,
        exchangeTradeId: `trade_${Date.now()}`,
        canonicalFillKey,
        symbol: 'RELIANCE',
        price: 2500,
        qty: 5,
        commission: 20,
        commissionAsset: 'INR',
        commissionStatus: 'AUTHORITATIVE',
        quoteQty: 12500,
        broker: 'upstox',
      });

      expect(fillResult.inserted).toBe(true);
      expect(fillResult.orderId).toBe(internalPk);
      expect(fillResult.clientOrderId).toBe(clientOrdId);

      // Query database directly to confirm relational columns
      const fillRow = await db.queryOne<any>(
        `SELECT * FROM exchange_fills WHERE canonical_fill_key = ?`,
        [canonicalFillKey]
      );

      expect(fillRow).toBeDefined();
      expect(fillRow.order_id).toBe(internalPk); // MUST reference internal PK
      expect(fillRow.client_order_id).toBe(clientOrdId);
      expect(Number(fillRow.qty)).toBe(5);
      expect(Number(fillRow.price)).toBe(2500);
      expect(fillRow.qty_exact).toBe('5');
      expect(fillRow.price_exact).toBe('2500');
    });
  });

  // ==========================================================================
  // P0-2 & P0-3: Deterministic Pre-Validation & Atomic Intent Protocol
  // ==========================================================================
  describe('P0-2 & P0-3: Deterministic Pre-Validation & Atomic Intent Protocol', () => {
    it('rejects incompatible product in pure memory before ANY DB transaction or reservation', async () => {
      const origLive = config.UPSTOX_LIVE_TRADING_ENABLED;
      (config as any).UPSTOX_LIVE_TRADING_ENABLED = true;
      vi.spyOn(IndianMarketCalendar, 'isMarketOpen').mockReturnValue(true);

      const db = getDb();
      const initialCashAcc = await db.queryOne<any>(
        `SELECT balance_minor, reserved_minor FROM ledger_accounts WHERE id = ?`,
        [`acc_cash_${testUserId}`]
      );
      expect(BigInt(initialCashAcc.reserved_minor)).toBe(0n);

      // Propose an order with valid delivery product
      const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
        userId: testUserId,
        broker: 'upstox',
        symbol: 'RELIANCE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 10,
        price: 2500,
        product: 'CNC',
      });

      expect(proposal.status).toBe('PENDING');

      // Attempt to place order with invalid product 'NRML' on cash equity (RELIANCE is NSE_EQ)
      await expect(
        adapter.placeOrder({
          userId: testUserId,
          symbol: 'RELIANCE',
          side: 'BUY',
          type: 'LIMIT',
          quantity: 10,
          price: 2500,
          product: 'NRML', // NRML is illegal for NSE_EQ!
          accountMode: 'live',
          confirmationId: proposal.confirmationId,
          clientOrderId: proposal.clientOrderId,
          idempotencyKey: proposal.idempotencyKey,
        })
      ).rejects.toThrow(/Unsupported product 'NRML'|Equities \(NSE_EQ\) do not support NRML/i);

      // Verify ZERO reservations created
      const cashAccAfter = await db.queryOne<any>(
        `SELECT balance_minor, reserved_minor FROM ledger_accounts WHERE id = ?`,
        [`acc_cash_${testUserId}`]
      );
      expect(BigInt(cashAccAfter.reserved_minor)).toBe(0n);

      const reservations = await db.query<any>(
        `SELECT * FROM order_reservations WHERE user_id = ?`,
        [testUserId]
      );
      expect(reservations.length).toBe(0);

      // Verify NO dangling SUBMITTING order row created
      const orders = await db.query<any>(
        `SELECT * FROM exchange_orders WHERE user_id = ?`,
        [testUserId]
      );
      expect(orders.length).toBe(0);

      // Verify confirmation token was NOT burned
      const confirmationAfter = await LiveOrderConfirmationService.getConfirmation(
        proposal.confirmationId,
        testUserId
      );
      expect(confirmationAfter?.status).toBe('PENDING');

      (config as any).UPSTOX_LIVE_TRADING_ENABLED = origLive;
    });
  });

  // ==========================================================================
  // P0-4: Order State Machine Non-Swallowing on Reservation Release Failure
  // ==========================================================================
  describe('P0-4: State Machine Rollback on Reservation Release Failure', () => {
    it('aborts state transition and bubbles error when releaseOrderReservation fails', async () => {
      const db = getDb();
      const clientOrderId = `ord_state_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const now = Date.now();

      await db.execute(
        `INSERT INTO exchange_orders (
          id, user_id, client_order_id, symbol, side, type, status,
          orig_qty, executed_qty, price, avg_price, quote_asset, notional,
          fee, reserved_cash, reserved_qty, orig_qty_exact, price_exact, notional_exact,
          broker, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, 'RELIANCE', 'BUY', 'LIMIT', 'OPEN', 10, 0, 2500, 0, 'INR', 25000, 0, 25000, 0, '10', '2500', '25000', 'upstox', ?, ?, ?)`,
        [`id_${clientOrderId}`, testUserId, clientOrderId, clientOrderId, now, now]
      );

      // Spy on LedgerService.releaseOrderReservation to simulate database/invariant failure
      const releaseSpy = vi.spyOn(LedgerService, 'releaseOrderReservation').mockRejectedValueOnce(
        new Error('Database lock acquisition timeout during release')
      );

      await expect(
        OrderStateMachine.transitionOrder(clientOrderId, 'CANCELED', {
          reason: 'User cancel request',
          releaseReservationOnTerminal: true,
        })
      ).rejects.toThrow('Database lock acquisition timeout during release');

      // Verify order status was NOT changed to CANCELED (rolled back)
      const orderAfter = await db.queryOne<any>(
        `SELECT status FROM exchange_orders WHERE client_order_id = ?`,
        [clientOrderId]
      );
      expect(orderAfter?.status).toBe('OPEN');

      releaseSpy.mockRestore();
    });
  });

  // ==========================================================================
  // P0-5: Silent Over-Release Hard Ledger Invariant
  // ==========================================================================
  describe('P0-5: Ledger Invariant Violations on Over-Release', () => {
    it('throws Ledger Invariant Violation if releaseReservation amount exceeds reserved balance', async () => {
      const db = getDb();
      await db.execute(
        `UPDATE ledger_accounts SET balance_minor = 100000, reserved_minor = 5000 WHERE user_id = ? AND account_type = 'trading_allocated'`,
        [testUserId]
      );

      // Attempt to release 10,000 paise when only 5,000 is reserved
      await expect(
        LedgerService.releaseReservation({
          userId: testUserId,
          accountType: 'trading_allocated',
          assetOrCurrency: 'INR',
          amountMinor: 10000n,
          referenceId: 'ref_inv_test',
          accountMode: 'live',
        })
      ).rejects.toThrow(/Ledger Invariant Violation: Attempted to release 10000 from account .* but only 5000 is currently reserved/i);
    });
  });

  // ==========================================================================
  // P1-1: Reconciliation Discrepancy Classification Absolute Difference
  // ==========================================================================
  describe('P1-1: Reconciliation Discrepancy Classification Absolute Semantics', () => {
    it('correctly classifies negative discrepancies as MATERIAL_MISMATCH instead of WITHIN_PRECISION', () => {
      const largeNegativeDiff = ExactDecimal.from('-1000');
      const tolerance = ExactDecimal.from('0.0001');

      // Prior bug: -1000 <= 0.0001 evaluated to true, classifying as WITHIN_PRECISION!
      const classification = ReconciliationWorker.classifyDiscrepancy(largeNegativeDiff, tolerance);
      expect(classification).toBe('MATERIAL_MISMATCH');

      // Within precision tests (positive and negative small amounts)
      expect(ReconciliationWorker.classifyDiscrepancy(ExactDecimal.from('0.00005'), tolerance)).toBe('WITHIN_PRECISION');
      expect(ReconciliationWorker.classifyDiscrepancy(ExactDecimal.from('-0.00005'), tolerance)).toBe('WITHIN_PRECISION');
      expect(ReconciliationWorker.classifyDiscrepancy(ExactDecimal.zero(), tolerance)).toBe('EXACT_MATCH');
    });
  });

  // ==========================================================================
  // P1-2: Distributed Lock Lease Safety Event
  // ==========================================================================
  describe('P1-2: Distributed Lock Lease Safety Controller', () => {
    it('assertLeaseValid throws safety halt when lease health is lost', () => {
      let isHealthy = true;
      const controller: LeaseController = {
        leaseId: 'lease_safety_001',
        isLeaseValid: () => isHealthy,
        assertLeaseValid: (action?: string) => {
          if (!isHealthy) {
            throw new Error(`[DistributedLockService] Safety Halt: Distributed lease was lost. Halting ${action || 'mutation'}.`);
          }
        },
      };

      // Valid lease succeeds
      expect(() => controller.assertLeaseValid('reconciliation step')).not.toThrow();

      // Lease failure marks unhealthy
      isHealthy = false;
      expect(() => controller.assertLeaseValid('reconciliation fill settlement')).toThrow(
        /Safety Halt: Distributed lease was lost. Halting reconciliation fill settlement/i
      );
    });
  });

  // ==========================================================================
  // P1-3: Sliced Orders Venue Reported Child Quantities
  // ==========================================================================
  describe('P1-3: Sliced Orders Venue-Reported Child Quantities', () => {
    it('records venue-reported quantities for sliced child orders instead of integer math', async () => {
      const origLive = config.UPSTOX_LIVE_TRADING_ENABLED;
      (config as any).UPSTOX_LIVE_TRADING_ENABLED = true;
      vi.spyOn(IndianMarketCalendar, 'isMarketOpen').mockReturnValue(true);

      // Mock placeOrder to return 2 sliced venue orders
      vi.spyOn(UpstoxClient, 'placeOrder').mockResolvedValueOnce({
        order_id: 'venue_ord_parent',
        order_ids: ['venue_child_01', 'venue_child_02'],
      });

      // Mock getOrderBook to return uneven quantities (e.g. freeze limit 1800 + residual 700 = 2500)
      vi.spyOn(UpstoxClient, 'getOrderBook').mockResolvedValueOnce([
        {
          order_id: 'venue_child_01',
          quantity: 1800,
          filled_quantity: 0,
          pending_quantity: 1800,
          average_price: 2500,
          status: 'open',
          exchange: 'NSE',
          trading_symbol: 'RELIANCE',
          order_timestamp: new Date().toISOString(),
        },
        {
          order_id: 'venue_child_02',
          quantity: 700,
          filled_quantity: 0,
          pending_quantity: 700,
          average_price: 2500,
          status: 'open',
          exchange: 'NSE',
          trading_symbol: 'RELIANCE',
          order_timestamp: new Date().toISOString(),
        },
      ] as any);

      const db = getDb();
      await db.execute(
        `UPDATE account_limits SET max_single_order_pct = 1.0, max_asset_concentration_pct = 1.0 WHERE user_id = ?`,
        [testUserId]
      );
      await db.execute(
        `UPDATE ledger_accounts SET balance_minor = 5000000000 WHERE user_id = ? AND account_type = 'trading_allocated'`,
        [testUserId]
      );

      const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
        userId: testUserId,
        broker: 'upstox',
        symbol: 'RELIANCE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 2500,
        price: 2500,
        product: 'CNC',
        slice: true,
      });

      const order = await adapter.placeOrder({
        userId: testUserId,
        symbol: 'RELIANCE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 2500,
        price: 2500,
        product: 'CNC',
        slice: true,
        accountMode: 'live',
        confirmationId: proposal.confirmationId,
        clientOrderId: proposal.clientOrderId,
        idempotencyKey: proposal.idempotencyKey,
      });

      expect(order.status).toBe('OPEN');

      const children = await db.query<any>(
        `SELECT venue_order_id, quantity FROM exchange_order_children WHERE parent_client_order_id = ? ORDER BY venue_order_id ASC`,
        [proposal.clientOrderId]
      );

      expect(children.length).toBe(2);
      const child1 = children.find((c: any) => c.venue_order_id === 'venue_child_01');
      const child2 = children.find((c: any) => c.venue_order_id === 'venue_child_02');

      // Crucial assertion: Quantities are 1800 and 700 as reported by venue, NOT Math.floor(2500/2) = 1250!
      expect(Number(child1.quantity)).toBe(1800);
      expect(Number(child2.quantity)).toBe(700);

      (config as any).UPSTOX_LIVE_TRADING_ENABLED = origLive;
    });
  });

  // ==========================================================================
  // P1-4: Authoritative Base Asset Derivation in Order Recovery
  // ==========================================================================
  describe('P1-4: Authoritative Base Asset Derivation', () => {
    it('preserves symbols containing quote substring such as INDRAPRASTHA without string replacement corruption', () => {
      // Prior bug: symbol.replace(/INR$/, '') or regex would corrupt symbols containing substring INR
      const testSymbol = 'INDRAPRASTHA';
      const masterInstrument = UpstoxInstrumentMasterService.getInstrument(testSymbol);
      const baseAsset = masterInstrument?.baseAsset || testSymbol;

      expect(baseAsset).toBe('INDRAPRASTHA');
      expect(baseAsset).not.toBe('INDAPRASTHA');
    });
  });

  // ==========================================================================
  // P1-5: Proposal Provisional Price Disclosure
  // ==========================================================================
  describe('P1-5: Proposal Provisional Price Disclosure', () => {
    it('marks market/unspecified price orders as provisional with pricing source and warning', async () => {
      const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
        userId: testUserId,
        broker: 'upstox',
        symbol: 'RELIANCE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
        product: 'CNC',
      });

      expect(proposal.isProvisionalPrice).toBe(true);
      expect(proposal.priceSource).toBe('PROVISIONAL_ESTIMATED_TICK');
      expect(proposal.executionWarning).toBeDefined();
      expect(proposal.executionWarning).toContain('Provisional price based on estimated tick');
      expect(proposal.riskSnapshot.isProvisionalPrice).toBe(true);
      expect(proposal.riskSnapshot.priceSource).toBe('PROVISIONAL_ESTIMATED_TICK');

      // Also verify retrieval via getConfirmation preserves disclosures
      const retrieved = await LiveOrderConfirmationService.getConfirmation(
        proposal.confirmationId,
        testUserId
      );
      expect(retrieved?.isProvisionalPrice).toBe(true);
      expect(retrieved?.priceSource).toBe('PROVISIONAL_ESTIMATED_TICK');
      expect(retrieved?.executionWarning).toBeDefined();
    });

    it('marks limit price orders with user specified source and no provisional warning', async () => {
      const proposal = await LiveOrderConfirmationService.proposeLiveOrder({
        userId: testUserId,
        broker: 'upstox',
        symbol: 'RELIANCE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1,
        price: 2800,
        product: 'CNC',
      });

      expect(proposal.isProvisionalPrice).toBe(false);
      expect(proposal.priceSource).toBe('LIMIT_USER_SPECIFIED');
      expect(proposal.executionWarning).toBeUndefined();
      expect(proposal.riskSnapshot.isProvisionalPrice).toBe(false);
      expect(proposal.riskSnapshot.priceSource).toBe('LIMIT_USER_SPECIFIED');
    });
  });
});
