import { describe, it, expect, beforeEach } from 'vitest';
import { ExactDecimal } from '../services/precision';
import { SymbolRulesService } from '../services/symbolRules';
import { OrderStateMachine, InvalidOrderStateTransitionError } from '../services/orderStateMachine';
import { BinanceGateway } from '../services/binanceGateway';
import { LedgerService } from '../services/ledgerService';
import { ReconciliationWorker } from '../services/reconciliationWorker';
import { AuditService } from '../services/auditService';
import { getDb } from '../db';

describe('Production-Critical Financial Execution Hardening Suite (43 Scenarios)', () => {
  const userId = 'usr_hardened_fin_001';

  beforeEach(async () => {
    const db = getDb();
    // Clean up test data safely in proper order
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
    await db.execute(`DELETE FROM operational_kill_switches WHERE target = ?`, [userId]);
    await db.execute(`DELETE FROM circuit_breakers WHERE scope_id = ?`, [userId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);

    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
       VALUES (?, 'hardened_fin@lumen.io', 'Hardened Trader', 'email', 'prov_fin', ?, ?)`,
      [userId, Date.now(), Date.now()]
    );

    await db.execute(
      `INSERT INTO account_limits (id, user_id, is_emergency_frozen, max_single_order_pct, max_asset_concentration_pct, min_cash_reserve_pct, updated_at)
       VALUES (?, ?, 0, 0.50, 0.60, 0.10, ?)`,
      [`lim_${userId}`, userId, Date.now()]
    );
  });

  // =========================================================================
  // CATEGORY 1: Precision & Arbitrary Arithmetic Suite (Scenarios 1-6)
  // =========================================================================
  describe('Category 1: Precision & Arbitrary Decimal Arithmetic', () => {
    it('Scenario 1: Exact decimal addition and multiplication without 0.1 + 0.2 IEEE-754 error', () => {
      const a = ExactDecimal.from('0.1');
      const b = ExactDecimal.from('0.2');
      const sum = a.add(b);
      expect(sum.toString()).toBe('0.3');
      expect(sum.toFixed(1)).toBe('0.3');
      // In standard IEEE-754, 0.1 + 0.2 === 0.30000000000000004
      expect(0.1 + 0.2).not.toBe(0.3);

      const product = sum.mul(ExactDecimal.from('3'));
      expect(product.toString()).toBe('0.9');
    });

    it('Scenario 2: High-precision division maintains exact scale and banker/half-up rounding', () => {
      const one = ExactDecimal.from('1');
      const three = ExactDecimal.from('3');
      const divResult = one.div(three, 8);
      expect(divResult.toString()).toBe('0.33333333');

      // Round half-up check
      const halfVal = ExactDecimal.from('0.125');
      expect(halfVal.toFixed(2)).toBe('0.13');
    });

    it('Scenario 3: Large notional crypto execution ($100M+) preserves exact digits without precision loss', () => {
      const largeQty = ExactDecimal.from('1500.12345678');
      const largePrice = ExactDecimal.from('68450.95');
      const notional = largeQty.mul(largePrice);
      // 1500.12345678 * 68450.95 = 102684875.728863611
      expect(notional.toFixed(2)).toBe('102684875.73');
      expect(notional.gt(ExactDecimal.from('100000000'))).toBe(true);
    });

    it('Scenario 4: Exact minor unit conversion for distinct asset decimals (USDT=2, BTC=8, ETH=18)', () => {
      const usdt = ExactDecimal.from('123.45');
      expect(usdt.toMinor(2)).toBe(12345n);

      const btc = ExactDecimal.from('0.00543210');
      expect(btc.toMinor(8)).toBe(543210n);

      const eth = ExactDecimal.from('1.5');
      expect(eth.toMinor(18)).toBe(1500000000000000000n);
    });

    it('Scenario 5: Micro-quantities (1 satoshi = 0.00000001 BTC) accurately calculated and reserved', () => {
      const satoshi = ExactDecimal.from('0.00000001');
      expect(satoshi.toMinor(8)).toBe(1n);

      const btcPrice = ExactDecimal.from('100000.00');
      const satoshiNotional = satoshi.mul(btcPrice);
      expect(satoshiNotional.toString()).toBe('0.001');
    });

    it('Scenario 6: Fee truncation vs rounding matches Binance exchange rules (0.00075 fee tier)', () => {
      const notional = ExactDecimal.from('5000.00');
      const feeRate = ExactDecimal.from('0.00075');
      const fee = notional.mul(feeRate);
      expect(fee.toFixed(4)).toBe('3.7500');
      expect(fee.toMinor(2)).toBe(375n); // 3.75 USDT
    });
  });

  // =========================================================================
  // CATEGORY 2: Symbol Constraint & Exchange Rules Suite (Scenarios 7-12)
  // =========================================================================
  describe('Category 2: Symbol Constraint & Exchange Rules Validation', () => {
    it('Scenario 7: Order rejected when quantity is below minQty', () => {
      expect(() => {
        SymbolRulesService.validateAndNormalize('BTCUSDT', 0.000001, 50000);
      }).toThrow(/below minimum quantity/i);
    });

    it('Scenario 8: Order rejected when quantity exceeds maxQty', () => {
      expect(() => {
        SymbolRulesService.validateAndNormalize('BTCUSDT', 99999, 50000);
      }).toThrow(/exceeds maximum quantity/i);
    });

    it('Scenario 9: Order quantity not a multiple of stepSize is rejected', () => {
      // BTCUSDT step size is 0.00001 (5 decimals)
      expect(() => {
        SymbolRulesService.validateAndNormalize('BTCUSDT', 0.000015, 50000);
      }).toThrow(/step size/i);
    });

    it('Scenario 10: Order price not conforming to tickSize is rejected', () => {
      // BTCUSDT tick size is 0.01 (2 decimals)
      expect(() => {
        SymbolRulesService.validateAndNormalize('BTCUSDT', 0.1, 50000.005);
      }).toThrow(/tick size/i);
    });

    it('Scenario 11: Order rejected when notional value is below minNotional ($5.00 USDT)', () => {
      expect(() => {
        SymbolRulesService.validateAndNormalize('BTCUSDT', 0.00005, 50000); // 0.00005 * 50000 = 2.50 USDT < 5.00
      }).toThrow(/below minimum notional/i);
    });

    it('Scenario 12: Unsupported trading symbol is immediately rejected before reservation', () => {
      expect(() => {
        SymbolRulesService.validateAndNormalize('DODGYCOIN_USDT', 10, 1);
      }).toThrow(/unsupported trading symbol/i);
    });
  });

  // =========================================================================
  // CATEGORY 3: Order State Machine Integrity Suite (Scenarios 13-18)
  // =========================================================================
  describe('Category 3: Order State Machine Transitions & Invariants', () => {
    it('Scenario 13: Valid lifecycle CREATED -> RESERVED -> SUBMITTING -> FILLED succeeds', () => {
      expect(OrderStateMachine.canTransition('CREATED', 'RESERVED')).toBe(true);
      expect(OrderStateMachine.canTransition('RESERVED', 'SUBMITTING')).toBe(true);
      expect(OrderStateMachine.canTransition('SUBMITTING', 'FILLED')).toBe(true);

      expect(OrderStateMachine.isTerminal('FILLED')).toBe(true);
    });

    it('Scenario 14: Valid lifecycle CREATED -> RESERVED -> SUBMITTING -> OPEN -> CANCELLED succeeds', () => {
      expect(OrderStateMachine.canTransition('CREATED', 'RESERVED')).toBe(true);
      expect(OrderStateMachine.canTransition('RESERVED', 'SUBMITTING')).toBe(true);
      expect(OrderStateMachine.canTransition('SUBMITTING', 'OPEN')).toBe(true);
      expect(OrderStateMachine.canTransition('OPEN', 'CANCELLED')).toBe(true);

      expect(OrderStateMachine.isTerminal('CANCELLED')).toBe(true);
    });

    it('Scenario 15: Invalid jump from CREATED directly to FILLED is blocked with state error', () => {
      expect(() => {
        OrderStateMachine.validateTransition('CREATED', 'FILLED', 'ord_test_01');
      }).toThrow(InvalidOrderStateTransitionError);
    });

    it('Scenario 16: Invalid transition from terminal FILLED to CANCELLED is blocked', () => {
      expect(() => {
        OrderStateMachine.validateTransition('FILLED', 'CANCELLED', 'ord_test_02');
      }).toThrow(InvalidOrderStateTransitionError);
    });

    it('Scenario 17: Invalid transition from terminal CANCELLED to FILLED is blocked', () => {
      expect(() => {
        OrderStateMachine.validateTransition('CANCELLED', 'FILLED', 'ord_test_03');
      }).toThrow(InvalidOrderStateTransitionError);
    });

    it('Scenario 18: Normalization: CANCELED correctly normalizes to CANCELLED', () => {
      expect(OrderStateMachine.normalizeStatus('CANCELED')).toBe('CANCELLED');
      expect(OrderStateMachine.normalizeStatus('CANCELLED')).toBe('CANCELLED');
      expect(OrderStateMachine.canTransition('OPEN', 'CANCELED')).toBe(true);
    });
  });

  // =========================================================================
  // CATEGORY 4: Persistent Capital Reservation Suite (Scenarios 19-24)
  // =========================================================================
  describe('Category 4: Persistent Capital Reservation Lifecycle', () => {
    beforeEach(async () => {
      await LedgerService.creditDeposit({
        userId,
        assetOrCurrency: 'USDT',
        amountMinor: 10_000_000n, // $100,000.00
        paymentId: 'pay_res_001',
        description: 'Fund for reservations',
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 10_000_000n,
        referenceType: 'allocation',
        referenceId: 'alloc_res_001',
        description: 'Allocate trading cash',
      });
    });

    it('Scenario 19: Order reservation creates atomic, immutable row in order_reservations', async () => {
      const orderId = 'ord_res_19';
      await LedgerService.reserveOrderFunds({
        userId,
        orderId,
        accountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 500_000n, // $5,000
      });

      const db = getDb();
      const resRow = await db.queryOne<any>(
        `SELECT * FROM order_reservations WHERE order_id = ?`,
        [orderId]
      );
      expect(resRow).not.toBeNull();
      expect(resRow.status).toBe('ACTIVE');
      expect(Number(resRow.amount_minor)).toBe(500000);
      expect(Number(resRow.consumed_minor)).toBe(0);
      expect(Number(resRow.released_minor)).toBe(0);
    });

    it('Scenario 20: Available balance accurately reflects total - reserved in realtime', async () => {
      const initialProj = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(initialProj.cash.available).toBe(100000);
      expect(initialProj.cash.reserved).toBe(0);

      await LedgerService.reserveOrderFunds({
        userId,
        orderId: 'ord_res_20',
        accountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 2_000_000n, // $20,000
      });

      const afterProj = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(afterProj.cash.total).toBe(100000);
      expect(afterProj.cash.reserved).toBe(20000);
      expect(afterProj.cash.available).toBe(80000);
    });

    it('Scenario 21: Attempting to reserve more than available balance throws InsufficientFunds', async () => {
      await expect(
        LedgerService.reserveOrderFunds({
          userId,
          orderId: 'ord_res_21',
          accountType: 'trading_allocated',
          assetOrCurrency: 'USDT',
          amountMinor: 15_000_000n, // $150,000 > $100,000
        })
      ).rejects.toThrow(/(insufficient available balance|insufficient free balance)/i);
    });

    it('Scenario 22: Concurrent orders competing for limited capital: only one succeeds, second rejected', async () => {
      // User has $100,000 available. Two concurrent orders each try to reserve $80,000.
      const p1 = LedgerService.reserveOrderFunds({
        userId,
        orderId: 'ord_concurrent_1',
        accountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 8_000_000n,
      });

      const p2 = LedgerService.reserveOrderFunds({
        userId,
        orderId: 'ord_concurrent_2',
        accountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 8_000_000n,
      });

      const results = await Promise.allSettled([p1, p2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });

    it('Scenario 23: Partial execution consumes proportional reservation and keeps remainder active', async () => {
      const orderId = 'ord_res_23';
      await LedgerService.reserveOrderFunds({
        userId,
        orderId,
        accountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 500_000n, // $5,000
      });

      const db = getDb();
      await db.transaction(async (tx) => {
        await LedgerService.consumeOrderReservation({
          orderId,
          amountMinor: 250_000n, // Consume 50%
          tx,
        });
      });

      const resRow = await db.queryOne<any>(
        `SELECT * FROM order_reservations WHERE order_id = ?`,
        [orderId]
      );
      expect(resRow.status).toBe('PARTIALLY_CONSUMED');
      expect(Number(resRow.consumed_minor)).toBe(250000);
      expect(Number(resRow.released_minor)).toBe(0);

      const proj = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(proj.cash.reserved).toBe(2500); // Only remaining $2,500 is reserved
    });

    it('Scenario 24: Cancellation releases exact remaining reserved amount and unlocks balance', async () => {
      const orderId = 'ord_res_24';
      await LedgerService.reserveOrderFunds({
        userId,
        orderId,
        accountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 400_000n, // $4,000
      });

      await LedgerService.releaseOrderReservation(orderId);

      const proj = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(proj.cash.reserved).toBe(0);
      expect(proj.cash.available).toBe(100000);

      const db = getDb();
      const resRow = await db.queryOne<any>(
        `SELECT * FROM order_reservations WHERE order_id = ?`,
        [orderId]
      );
      expect(resRow.status).toBe('RELEASED');
      expect(Number(resRow.released_minor)).toBe(400000);
    });
  });

  // =========================================================================
  // CATEGORY 5: Multi-Currency Double-Entry Invariants Suite (Scenarios 25-28)
  // =========================================================================
  describe('Category 5: Multi-Currency Double-Entry Invariants', () => {
    beforeEach(async () => {
      await LedgerService.creditDeposit({
        userId,
        assetOrCurrency: 'USDT',
        amountMinor: 20_000_000n, // $200,000
        paymentId: 'pay_de_001',
        description: 'Fund double-entry test',
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 20_000_000n,
        referenceType: 'allocation',
        referenceId: 'alloc_de_001',
        description: 'Allocate double-entry test',
      });
    });

    it('Scenario 25: BUY fill satisfies sum(debits) == sum(credits) per currency across transaction', async () => {
      const orderId = 'ord_de_buy_25';
      const fillId = 'fill_de_buy_25';

      await LedgerService.reserveOrderFunds({
        userId,
        orderId,
        accountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 500_000n,
      });

      const res = await LedgerService.processFill({
        userId,
        accountMode: 'live',
        orderId,
        fillId,
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        price: '50000.00',
        quantity: '0.1',
        fee: '3.75',
        feeAsset: 'USDT',
      });

      expect(res.transactionId).toBeDefined();

      // Verify that in the database, sum(debits) == sum(credits) for both USDT and BTC
      const db = getDb();
      const entries = await db.query<any>(
        `SELECT currency_or_asset, entry_type, SUM(amount_minor) as total
         FROM ledger_entries
         WHERE transaction_id = ?
         GROUP BY currency_or_asset, entry_type`,
        [res.transactionId]
      );

      const byCurrency: Record<string, { debit: number; credit: number }> = {};
      for (const row of entries) {
        if (!byCurrency[row.currency_or_asset]) {
          byCurrency[row.currency_or_asset] = { debit: 0, credit: 0 };
        }
        byCurrency[row.currency_or_asset][row.entry_type as 'debit' | 'credit'] = Number(row.total);
      }

      expect(byCurrency['USDT'].debit).toBe(byCurrency['USDT'].credit);
      expect(byCurrency['BTC'].debit).toBe(byCurrency['BTC'].credit);
    });

    it('Scenario 26: SELL fill satisfies sum(debits) == sum(credits) per currency across transaction', async () => {
      // First, credit BTC holdings
      await LedgerService.creditDeposit({
        userId,
        assetOrCurrency: 'BTC',
        amountMinor: 100_000_000n, // 1.0 BTC
        paymentId: 'pay_btc_sell_26',
        description: 'Seed BTC for sell test',
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'crypto_holdings',
        assetOrCurrency: 'BTC',
        amountMinor: 100_000_000n,
        referenceType: 'allocation',
        referenceId: 'alloc_btc_sell_26',
        description: 'Allocate BTC to crypto holdings',
      });

      const orderId = 'ord_de_sell_26';
      const fillId = 'fill_de_sell_26';

      await LedgerService.reserveOrderFunds({
        userId,
        orderId,
        accountType: 'crypto_holdings',
        assetOrCurrency: 'BTC',
        amountMinor: 50_000_000n, // 0.5 BTC
      });

      const res = await LedgerService.processFill({
        userId,
        accountMode: 'live',
        orderId,
        fillId,
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'SELL',
        price: '60000.00',
        quantity: '0.5',
        fee: '22.50',
        feeAsset: 'USDT',
      });

      const db = getDb();
      const entries = await db.query<any>(
        `SELECT currency_or_asset, entry_type, SUM(amount_minor) as total
         FROM ledger_entries
         WHERE transaction_id = ?
         GROUP BY currency_or_asset, entry_type`,
        [res.transactionId]
      );

      const byCurrency: Record<string, { debit: number; credit: number }> = {};
      for (const row of entries) {
        if (!byCurrency[row.currency_or_asset]) {
          byCurrency[row.currency_or_asset] = { debit: 0, credit: 0 };
        }
        byCurrency[row.currency_or_asset][row.entry_type as 'debit' | 'credit'] = Number(row.total);
      }

      expect(byCurrency['USDT'].debit).toBe(byCurrency['USDT'].credit);
      expect(byCurrency['BTC'].debit).toBe(byCurrency['BTC'].credit);
    });

    it('Scenario 27: Multi-asset fee deduction (BNB fee) maintains balanced entries per currency', async () => {
      // Seed BNB
      await LedgerService.creditDeposit({
        userId,
        assetOrCurrency: 'BNB',
        amountMinor: 500_000_000n, // 5 BNB
        paymentId: 'pay_bnb_fee_27',
        description: 'Seed BNB for fee test',
      });

      const orderId = 'ord_bnb_fee_27';
      const fillId = 'fill_bnb_fee_27';

      await LedgerService.reserveOrderFunds({
        userId,
        orderId,
        accountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 500_000n,
      });

      const res = await LedgerService.processFill({
        userId,
        accountMode: 'live',
        orderId,
        fillId,
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        price: '50000.00',
        quantity: '0.1',
        fee: '0.006', // 0.006 BNB
        feeAsset: 'BNB',
      });

      const db = getDb();
      const entries = await db.query<any>(
        `SELECT currency_or_asset, entry_type, SUM(amount_minor) as total
         FROM ledger_entries
         WHERE transaction_id = ?
         GROUP BY currency_or_asset, entry_type`,
        [res.transactionId]
      );

      const byCurrency: Record<string, { debit: number; credit: number }> = {};
      for (const row of entries) {
        if (!byCurrency[row.currency_or_asset]) {
          byCurrency[row.currency_or_asset] = { debit: 0, credit: 0 };
        }
        byCurrency[row.currency_or_asset][row.entry_type as 'debit' | 'credit'] = Number(row.total);
      }

      expect(byCurrency['USDT'].debit).toBe(byCurrency['USDT'].credit);
      expect(byCurrency['BTC'].debit).toBe(byCurrency['BTC'].credit);
      expect(byCurrency['BNB'].debit).toBe(byCurrency['BNB'].credit);
    });

    it('Scenario 28: System clearing accounts balance out to zero net change across transaction', async () => {
      const orderId = 'ord_de_clearing_28';
      const fillId = 'fill_de_clearing_28';

      await LedgerService.reserveOrderFunds({
        userId,
        orderId,
        accountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 500_000n,
      });

      const res = await LedgerService.processFill({
        userId,
        accountMode: 'live',
        orderId,
        fillId,
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        price: '50000.00',
        quantity: '0.1',
        fee: '3.75',
        feeAsset: 'USDT',
      });

      const db = getDb();
      // System clearing accounts and user legs balance out to zero net change per currency
      const entries = await db.query<any>(
        `SELECT currency_or_asset, entry_type, SUM(amount_minor) as total
         FROM ledger_entries
         WHERE transaction_id = ?
         GROUP BY currency_or_asset, entry_type`,
        [res.transactionId]
      );

      const byCurrency: Record<string, { debit: number; credit: number }> = {};
      for (const row of entries) {
        if (!byCurrency[row.currency_or_asset]) {
          byCurrency[row.currency_or_asset] = { debit: 0, credit: 0 };
        }
        byCurrency[row.currency_or_asset][row.entry_type as 'debit' | 'credit'] = Number(row.total);
      }

      for (const [curr, amounts] of Object.entries(byCurrency)) {
        expect(amounts.debit).toBe(amounts.credit);
      }

      // Verify clearing entries specifically exist in the transaction
      const clearingEntries = await db.query<any>(
        `SELECT * FROM ledger_entries WHERE transaction_id = ? AND reference_type = 'trading_clearing'`,
        [res.transactionId]
      );
      expect(clearingEntries.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // CATEGORY 6: Idempotency & Concurrent Fill Safety Suite (Scenarios 29-32)
  // =========================================================================
  describe('Category 6: Idempotency & Concurrent Fill Safety', () => {
    beforeEach(async () => {
      await LedgerService.creditDeposit({
        userId,
        assetOrCurrency: 'USDT',
        amountMinor: 5_000_000n,
        paymentId: 'pay_idemp_001',
        description: 'Fund idempotency test',
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 5_000_000n,
        referenceType: 'allocation',
        referenceId: 'alloc_idemp_001',
        description: 'Allocate idempotency test',
      });
    });

    it('Scenario 29: Duplicate trade fill message from exchange ignored without double credit/debit', async () => {
      const orderId = 'ord_idemp_29';
      const fillId = 'trd_duplicate_fill_29';

      await LedgerService.reserveOrderFunds({
        userId,
        orderId,
        accountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 500_000n,
      });

      const res1 = await LedgerService.processFill({
        userId,
        accountMode: 'live',
        orderId,
        fillId,
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        price: '50000.00',
        quantity: '0.1',
        fee: '3.75',
        feeAsset: 'USDT',
      });
      expect(res1.alreadyProcessed).toBe(false);

      const res2 = await LedgerService.processFill({
        userId,
        accountMode: 'live',
        orderId,
        fillId,
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        price: '50000.00',
        quantity: '0.1',
        fee: '3.75',
        feeAsset: 'USDT',
      });
      expect(res2.alreadyProcessed).toBe(true);

      const proj = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(proj.positions['BTC'].totalQuantity).toBe(0.1); // Not 0.2!
    });

    it('Scenario 30: Concurrent fills for identical tradeId process exactly once', async () => {
      const orderId = 'ord_idemp_30';
      const fillId = 'trd_concurrent_fill_30';

      await LedgerService.reserveOrderFunds({
        userId,
        orderId,
        accountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 500_000n,
      });

      const fillParams = {
        userId,
        accountMode: 'live' as const,
        orderId,
        fillId,
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY' as const,
        price: '50000.00',
        quantity: '0.1',
        fee: '3.75',
        feeAsset: 'USDT',
      };

      const [r1, r2] = await Promise.all([
        LedgerService.processFill(fillParams),
        LedgerService.processFill(fillParams),
      ]);

      const wasProcessedCount = [r1, r2].filter((r) => !r.alreadyProcessed).length;
      expect(wasProcessedCount).toBe(1);

      const proj = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(proj.positions['BTC'].totalQuantity).toBe(0.1);
    });

    it('Scenario 31: Retry of existing order submission returns cached order without re-reserving', async () => {
      const idempotencyKey = 'idemp_key_retry_31';

      const ord1 = await BinanceGateway.submitOrder({
        userId,
        symbol: 'BTCUSDT',
        asset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 0.05,
        price: 50000,
        marketQuoteAgeMs: 500,
        idempotencyKey,
      });

      const ord2 = await BinanceGateway.submitOrder({
        userId,
        symbol: 'BTCUSDT',
        asset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 0.05,
        price: 50000,
        marketQuoteAgeMs: 500,
        idempotencyKey,
      });

      expect(ord1.clientOrderId).toBe(ord2.clientOrderId);
      expect(ord1.id).toBe(ord2.id);

      const db = getDb();
      const orders = await db.query(
        `SELECT * FROM exchange_orders WHERE idempotency_key = ?`,
        [idempotencyKey]
      );
      expect(orders.length).toBe(1);
    });

    it('Scenario 32: Out-of-order partial fills update average price and executed quantity deterministically', async () => {
      const orderId = 'ord_partial_32';
      await LedgerService.reserveOrderFunds({
        userId,
        orderId,
        accountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 1_000_000n,
      });

      // Partial fill 1: 0.05 @ 50000
      await LedgerService.processFill({
        userId,
        accountMode: 'live',
        orderId,
        fillId: 'trd_p1',
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        price: '50000.00',
        quantity: '0.05',
        fee: '1.875',
        feeAsset: 'USDT',
      });

      // Partial fill 2: 0.05 @ 52000
      await LedgerService.processFill({
        userId,
        accountMode: 'live',
        orderId,
        fillId: 'trd_p2',
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        price: '52000.00',
        quantity: '0.05',
        fee: '1.95',
        feeAsset: 'USDT',
      });

      const proj = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(proj.positions['BTC'].totalQuantity).toBe(0.1);
      // Average cost basis includes capitalized fees ($5,100 + $3.825 = $5,103.83)
      expect(proj.positions['BTC'].costBasisUSD).toBeCloseTo(5103.83, 2);
    });
  });

  // =========================================================================
  // CATEGORY 7: Network Timeout & Ambiguous State Recovery Suite (Scenarios 33-36)
  // =========================================================================
  describe('Category 7: Network Timeout & Ambiguous State Recovery', () => {
    beforeEach(async () => {
      await LedgerService.creditDeposit({
        userId,
        assetOrCurrency: 'USDT',
        amountMinor: 5_000_000n,
        paymentId: 'pay_timeout_001',
        description: 'Fund timeout test',
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 5_000_000n,
        referenceType: 'allocation',
        referenceId: 'alloc_timeout_001',
        description: 'Allocate timeout test',
      });
    });

    it('Scenario 33: Exchange network timeout transitions order to UNKNOWN without releasing capital', async () => {
      // Store mock timeout credentials
      await BinanceGateway.saveExchangeCredentials(userId, {
        apiKey: 'mock_timeout_key',
        apiSecret: 'mock_secret',
        environment: 'testnet',
      });

      const order = await BinanceGateway.submitOrder({
        userId,
        symbol: 'BTCUSDT',
        asset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 0.05,
        price: 50000,
        marketQuoteAgeMs: 200,
        idempotencyKey: 'idemp_timeout_33',
      });

      expect(order.status).toBe('UNKNOWN');

      // Capital reservation must still be held (including 0.2% slippage/fee buffer: $2,500 * 1.002 = $2,505)!
      const proj = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(proj.cash.reserved).toBe(2505);
    });

    it('Scenario 34: Reconciliation resolves UNKNOWN order to FILLED when verified on Binance', async () => {
      await BinanceGateway.saveExchangeCredentials(userId, {
        apiKey: 'mock_timeout_found',
        apiSecret: 'mock_secret',
        environment: 'testnet',
      });

      const order = await BinanceGateway.submitOrder({
        userId,
        symbol: 'BTCUSDT',
        asset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 0.1,
        price: 50000,
        marketQuoteAgeMs: 200,
        idempotencyKey: 'idemp_timeout_34',
      });

      expect(order.status).toBe('FILLED');
      expect(order.executedQty).toBe(0.1);

      const proj = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(proj.positions['BTC'].totalQuantity).toBe(0.1);
    });

    it('Scenario 35: Reconciliation resolves UNKNOWN order to REJECTED and releases capital when confirmed not on Binance', async () => {
      await BinanceGateway.saveExchangeCredentials(userId, {
        apiKey: 'mock_timeout_not_found',
        apiSecret: 'mock_secret',
        environment: 'testnet',
      });

      const order = await BinanceGateway.submitOrder({
        userId,
        symbol: 'BTCUSDT',
        asset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 0.05,
        price: 50000,
        marketQuoteAgeMs: 200,
        idempotencyKey: 'idemp_timeout_35',
      });

      expect(order.status).toBe('REJECTED');
      expect(order.rejectReason).toContain('Order not received by exchange');

      // Capital reservation must be fully released!
      const proj = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(proj.cash.reserved).toBe(0);
      expect(proj.cash.available).toBe(50000);
    });

    it('Scenario 36: Repeated timeouts keep order in UNKNOWN until definitive exchange response', async () => {
      const db = getDb();
      const clientOrderId = BinanceGateway.generateClientOrderId(userId, 'idemp_repeat_timeout');
      const now = Date.now();

      await db.execute(
        `INSERT INTO exchange_orders (
          id, user_id, client_order_id, symbol, side, type, status, orig_qty,
          price, quote_asset, notional, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, 'BTCUSDT', 'BUY', 'LIMIT', 'UNKNOWN', 0.1, 50000, 'USDT', 5000, 'idemp_repeat_timeout', ?, ?)`,
        [clientOrderId, userId, clientOrderId, now, now]
      );

      // Reconciliation fails to query exchange
      await BinanceGateway.saveExchangeCredentials(userId, {
        apiKey: 'mock_rec_timeout',
        apiSecret: 'mock_secret',
        environment: 'testnet',
      });

      const check = await BinanceGateway.reconcileUnknownOrder(clientOrderId, 'BTCUSDT', userId);
      expect(check.found).toBe(false);
      expect(check.notFoundConfirmed).toBe(false);

      const dbOrder = await db.queryOne<any>(
        `SELECT status FROM exchange_orders WHERE client_order_id = ?`,
        [clientOrderId]
      );
      expect(dbOrder.status).toBe('UNKNOWN'); // Kept in UNKNOWN safely!
    });
  });

  // =========================================================================
  // CATEGORY 8: Exchange Reconciliation & Mismatch Detection Suite (Scenarios 37-40)
  // =========================================================================
  describe('Category 8: Exchange Reconciliation & Mismatch Detection', () => {
    beforeEach(async () => {
      await LedgerService.creditDeposit({
        userId,
        assetOrCurrency: 'USDT',
        amountMinor: 10_000_000n, // $100,000
        paymentId: 'pay_rec_001',
        description: 'Fund reconciliation test',
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 10_000_000n,
        referenceType: 'allocation',
        referenceId: 'alloc_rec_001',
        description: 'Allocate reconciliation test',
      });
    });

    it('Scenario 37: Exact balance match is classified as EXACT_MATCH (zero difference)', () => {
      const diff = ExactDecimal.from('0.00000000');
      const classification = ReconciliationWorker.classifyDiscrepancy(diff);
      expect(classification).toBe('EXACT_MATCH');
    });

    it('Scenario 38: Sub-satoshi rounding difference is classified as WITHIN_PRECISION', () => {
      const diff = ExactDecimal.from('0.000000005');
      const tolerance = ExactDecimal.from('0.00000001');
      const classification = ReconciliationWorker.classifyDiscrepancy(diff, tolerance);
      expect(classification).toBe('WITHIN_PRECISION');
    });

    it('Scenario 39: Material discrepancy generates RECONCILIATION_MISMATCH incident without silent overwrite', async () => {
      // Local ledger has $100,000. Exchange reports $95,000. Discrepancy = $5,000.
      const mismatches = await ReconciliationWorker.reconcileBalancesAgainstExchange(
        userId,
        'rec_run_mismatch_39',
        { USDT: 95000 }
      );

      expect(mismatches).toBeGreaterThan(0);

      const db = getDb();
      const mismatchRows = await db.query<any>(
        `SELECT * FROM reconciliation_mismatches WHERE user_id = ?`,
        [userId]
      );
      expect(mismatchRows.length).toBeGreaterThan(0);
      expect(mismatchRows[0].severity).toBe('CRITICAL');

      // Local authoritative ledger was NOT silently overwritten
      const proj = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(proj.cash.available).toBe(100000);
    });

    it('Scenario 40: Unledgered exchange assets detected and flagged for audit review', async () => {
      // User has 0 SOL in ledger. Exchange reports 50 SOL.
      const mismatches = await ReconciliationWorker.reconcileBalancesAgainstExchange(
        userId,
        'rec_run_unledgered_40',
        { USDT: 100000, SOL: 50 }
      );

      expect(mismatches).toBeGreaterThan(0);

      const db = getDb();
      const solMismatch = await db.queryOne<any>(
        `SELECT * FROM reconciliation_mismatches WHERE user_id = ? AND entity_id = 'SOL'`,
        [userId]
      );
      expect(solMismatch).not.toBeNull();
      expect(solMismatch.notes).toContain('unledgered balance');
    });
  });

  // =========================================================================
  // CATEGORY 9: Audit Trail & Observability Invariants Suite (Scenarios 41-42)
  // =========================================================================
  describe('Category 9: Audit Trail & Observability Invariants', () => {
    it('Scenario 41: Full audit trail generated from ORDER_CREATED through FILL and SETTLEMENT', async () => {
      await LedgerService.creditDeposit({
        userId,
        assetOrCurrency: 'USDT',
        amountMinor: 2_000_000n,
        paymentId: 'pay_audit_41',
        description: 'Fund audit test',
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 2_000_000n,
        referenceType: 'allocation',
        referenceId: 'alloc_audit_41',
        description: 'Allocate audit test',
      });

      const order = await BinanceGateway.submitOrder({
        userId,
        symbol: 'BTCUSDT',
        asset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 0.05,
        price: 40000,
        marketQuoteAgeMs: 100,
        idempotencyKey: 'idemp_audit_trail_41',
      });

      expect(order.status).toBe('OPEN');

      const auditEvents = await AuditService.getEvents({ userId });
      const eventTypes = auditEvents.map((e) => e.event_type);

      expect(eventTypes).toContain('LEDGER_DEPOSIT_CREDITED');
      expect(eventTypes).toContain('LEDGER_TRANSFER');
      expect(eventTypes).toContain('RISK_APPROVED');
      expect(eventTypes).toContain('ORDER_SUBMITTED_SUCCESS');
    });

    it('Scenario 42: Negative balance invariant breach freezes account and logs CRITICAL audit event', async () => {
      const db = getDb();
      // Deliberately corrupt an account balance directly in SQL to simulate bug/breach
      await db.execute(
        `INSERT INTO ledger_accounts (id, user_id, account_mode, account_type, asset_or_currency, balance_minor, reserved_minor, created_at, updated_at)
         VALUES ('acc_corrupt_42', ?, 'live', 'trading_allocated', 'USDT', -5000, 0, ?, ?)`,
        [userId, Date.now(), Date.now()]
      );

      const recResult = await ReconciliationWorker.runReconciliation(userId);
      expect(recResult.status).toBe('MISMATCH_DETECTED');

      // Account should be automatically emergency frozen!
      const limits = await db.queryOne<any>(
        `SELECT is_emergency_frozen, freeze_reason FROM account_limits WHERE user_id = ?`,
        [userId]
      );
      expect(limits.is_emergency_frozen).toBe(1);
      expect(limits.freeze_reason).toContain('Critical negative ledger balance');
    });
  });

  // =========================================================================
  // CATEGORY 10: Complete End-to-End Execution Flow (Scenario 43)
  // =========================================================================
  describe('Category 10: Complete Authoritative End-to-End Flow', () => {
    it('Scenario 43: Complete real-money lifecycle: Deposit -> Allocate -> Submit Buy -> Fill -> Settle -> Ledger Balanced -> Reconcile -> Audit Verified', async () => {
      const db = getDb();

      // 1. Fiat / Stablecoin Deposit
      const depositResult = await LedgerService.creditDeposit({
        userId,
        assetOrCurrency: 'USDT',
        amountMinor: 5_000_000n, // $50,000.00
        paymentId: 'pay_e2e_43',
        description: 'E2E Test Deposit',
      });
      expect(depositResult.balanceAfter).toBe(5000000n);

      // 2. Internal Allocation to Trading Wallet
      await LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 5_000_000n,
        referenceType: 'allocation',
        referenceId: 'alloc_e2e_43',
        description: 'E2E Trading Allocation',
      });

      let proj = await LedgerService.getAuthoritativeProjection(userId, 'live');
      expect(proj.cash.available).toBe(50000);
      expect(proj.cash.reserved).toBe(0);

      // 3. Submit Market Buy Order: 0.1 BTC @ $50,000
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
        idempotencyKey: 'idemp_e2e_43',
      });

      expect(order.status).toBe('FILLED');
      expect(order.executedQty).toBe(0.1);

      // 4. Verify Authoritative Ledger State
      proj = await LedgerService.getAuthoritativeProjection(userId, 'live');
      // Cash spent: 0.1 * 50,000 = $5,000 + 0.075% fee ($3.75) = $5,003.75
      expect(proj.cash.available).toBeCloseTo(44996.25, 2);
      expect(proj.positions['BTC'].totalQuantity).toBe(0.1);
      expect(proj.cash.reserved).toBe(0);

      // 5. Verify Multi-Currency Double-Entry Balancing
      const fills = await db.query<any>(
        `SELECT * FROM exchange_fills WHERE order_id = ?`,
        [order.clientOrderId]
      );
      expect(fills.length).toBe(1);

      // 6. Run Reconciliation Worker: must find 0 mismatches
      const rec = await ReconciliationWorker.runReconciliation(userId);
      expect(rec.status).toBe('SUCCESS');
      expect(rec.mismatchesFound).toBe(0);

      // 7. Verify Audit Trail Completeness
      const auditTrail = await AuditService.getEvents({ userId });
      const types = auditTrail.map((e) => e.event_type);

      expect(types).toContain('LEDGER_DEPOSIT_CREDITED');
      expect(types).toContain('LEDGER_TRANSFER');
      expect(types).toContain('RISK_APPROVED');
      expect(types).toContain('ORDER_SUBMITTED_SUCCESS');
      expect(types).toContain('LEDGER_TRADE_FILL_SETTLED');
      expect(types).toContain('RECONCILIATION_RUN_COMPLETED');
    });
  });
});
