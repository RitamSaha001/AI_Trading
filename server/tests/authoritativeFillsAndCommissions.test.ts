import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExactDecimal } from "../services/precision";
import { BinanceGateway } from "../services/binanceGateway";
import { LedgerService } from "../services/ledgerService";
import { OrderRecoveryService } from "../services/orderRecoveryService";
import { getDb } from "../db";

describe("Authoritative Fills, Commissions, Idempotency & Exact Values Suite", () => {
  const userId = "usr_authoritative_test_001";

  beforeEach(async () => {
    const db = getDb();
    await db.execute("DELETE FROM accounting_events");
    await db.execute("DELETE FROM exchange_fills");
    await db.execute("DELETE FROM order_reservations WHERE user_id = ?", [userId]);
    await db.execute("DELETE FROM exchange_orders WHERE user_id = ?", [userId]);
    await db.execute("DELETE FROM exchange_accounts WHERE user_id = ?", [userId]);
    await db.execute("DELETE FROM ledger_entries WHERE user_id = ?", [userId]);
    await db.execute("DELETE FROM ledger_accounts WHERE user_id = ?", [userId]);
    await db.execute("DELETE FROM authoritative_positions WHERE user_id = ?", [userId]);
    await db.execute("DELETE FROM account_limits WHERE user_id = ?", [userId]);
    await db.execute("DELETE FROM audit_events WHERE user_id = ?", [userId]);
    await db.execute("DELETE FROM users WHERE id = ?", [userId]);

    const now = Date.now();
    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
       VALUES (?, 'authoritative_trader@lumen.io', 'Authoritative Fills Trader', 'email', 'prov_auth', ?, ?)`,
      [userId, now, now]
    );

    await db.execute(
      `INSERT INTO account_limits (id, user_id, is_emergency_frozen, max_single_order_pct, max_asset_concentration_pct, min_cash_reserve_pct, updated_at)
       VALUES (?, ?, 0, 0.50, 0.60, 0.10, ?)`,
      [`lim_${userId}`, userId, now]
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    BinanceGateway.clearMockOrderFills();
  });

  // =========================================================================
  // Scenario 1: USDT Commission Booked Exactly
  // =========================================================================
  describe("Scenario 1: USDT Commission Booked Exactly", () => {
    it("books exact quote commission in USDT without float rounding or fallback", async () => {
      // 1. Fund user with 10,000 USDT (1,000,000 minor units at 2 decimals)
      await LedgerService.creditDeposit({
        userId,
        amountMinor: 1_000_000n,
        assetOrCurrency: "USDT",
        accountMode: "live",
        paymentId: "dep_usdt_scen1",
        description: "Fund 10,000 USDT",
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: "sovereign_cash",
        toAccountType: "trading_allocated",
        assetOrCurrency: "USDT",
        amountMinor: 1_000_000n,
        accountMode: "live",
        referenceType: "allocation",
        referenceId: "alloc_scen1",
        description: "Allocate trading capital",
        idempotencyKey: "alloc_scen1_key",
      });

      const orderId = "ord_scen1_001";
      // Reserve notional (5,000 USDT = 500,000 minor) + estimated fee (3.75 USDT = 375 minor)
      await LedgerService.reserveOrderFunds({
        userId,
        orderId,
        accountMode: "live",
        accountType: "trading_allocated",
        assetOrCurrency: "USDT",
        amountMinor: 500_375n,
      });

      // 2. Settle fill with exact authoritative commission: 3.75 USDT (375 minor)
      const fillResult = await LedgerService.processFill({
        userId,
        accountMode: "live",
        orderId,
        fillId: "trd_scen1_001",
        canonicalFillKey: `binance:${userId}:BTCUSDT:trd_scen1_001`,
        symbol: "BTCUSDT",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        side: "BUY",
        price: "50000.00",
        quantity: "0.1",
        fee: "3.75",
        feeAsset: "USDT",
      });

      expect(fillResult.alreadyProcessed).toBe(false);
      // 1,000,000 - 500,000 notional - 375 fee = 499,625 minor ($4,996.25)
      expect(fillResult.cashBalanceAfterMinor).toBe(499_625n);
      expect(fillResult.assetBalanceAfterMinor).toBe(10_000_000n); // 0.10000000 BTC
      expect(fillResult.feeMinor).toBe(375n);

      // Verify Fee Treasury credited exactly
      const balances = await LedgerService.getUserBalances(userId, "live");
      expect(balances["fee_treasury:USDT"]?.balance).toBe(375);

      // Verify Authoritative Position includes notional + exact fee in cost basis
      const pos = await LedgerService.getOrCreateAuthoritativePosition(userId, "live", "BTC");
      expect(BigInt(pos.total_quantity_minor)).toBe(10_000_000n);
      expect(BigInt(pos.cost_basis_minor)).toBe(500_375n);
    });
  });

  // =========================================================================
  // Scenario 2: BNB Commission Booked in Native Asset (No Silent Conversion)
  // =========================================================================
  describe("Scenario 2: BNB Commission Booked in Native Asset", () => {
    it("books BNB commission directly against crypto_holdings:BNB and fee_treasury:BNB", async () => {
      // 1. Fund user with 10,000 USDT in trading_allocated and 1.0 BNB (100,000,000 minor) in crypto_holdings
      await LedgerService.creditDeposit({
        userId,
        amountMinor: 1_000_000n,
        assetOrCurrency: "USDT",
        accountMode: "live",
        paymentId: "dep_usdt_scen2",
        description: "Fund 10,000 USDT",
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: "sovereign_cash",
        toAccountType: "trading_allocated",
        assetOrCurrency: "USDT",
        amountMinor: 1_000_000n,
        accountMode: "live",
        referenceType: "allocation",
        referenceId: "alloc_scen2",
        description: "Allocate trading capital",
        idempotencyKey: "alloc_scen2_key",
      });

      await LedgerService.creditDeposit({
        userId,
        amountMinor: 100_000_000n,
        assetOrCurrency: "BNB",
        accountMode: "live",
        paymentId: "dep_bnb_scen2",
        description: "Fund 1 BNB",
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: "sovereign_cash",
        toAccountType: "crypto_holdings",
        assetOrCurrency: "BNB",
        amountMinor: 100_000_000n,
        accountMode: "live",
        referenceType: "funding",
        referenceId: "alloc_scen2_bnb",
        description: "Allocate BNB holdings",
        idempotencyKey: "alloc_scen2_bnb_key",
      });

      const orderId = "ord_scen2_bnb";
      await LedgerService.reserveOrderFunds({
        userId,
        orderId,
        accountMode: "live",
        accountType: "trading_allocated",
        assetOrCurrency: "USDT",
        amountMinor: 500_000n,
      });

      // 2. Settle fill with BNB fee: 0.00500000 BNB (500,000 minor units at 8 decimals)
      const fillResult = await LedgerService.processFill({
        userId,
        accountMode: "live",
        orderId,
        fillId: "trd_scen2_bnb_001",
        canonicalFillKey: `binance:${userId}:BTCUSDT:trd_scen2_bnb_001`,
        symbol: "BTCUSDT",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        side: "BUY",
        price: "50000.00",
        quantity: "0.1",
        fee: "0.00500000",
        feeAsset: "BNB",
      });

      // Cash balance: only notional 5,000 USDT (500,000 minor) deducted; NO USDT fee
      expect(fillResult.cashBalanceAfterMinor).toBe(500_000n);
      expect(fillResult.assetBalanceAfterMinor).toBe(10_000_000n);

      const balances = await LedgerService.getUserBalances(userId, "live");
      // BNB holding: 1.0 BNB - 0.005 BNB = 0.99500000 BNB (99,500,000 minor)
      expect(balances["crypto_holdings:BNB"]?.balance).toBe(99_500_000);
      // Fee treasury BNB: 500,000 minor
      expect(balances["fee_treasury:BNB"]?.balance).toBe(500_000);
      // Fee treasury USDT: must remain zero (no silent conversion to quote currency)
      expect(balances["fee_treasury:USDT"]?.balance ?? 0).toBe(0);
    });
  });

  // =========================================================================
  // Scenario 3: Binance Initial Response Lacks Commission
  // =========================================================================
  describe("Scenario 3: Missing Commission Keeps Order in RECONCILING with Reservations Locked", () => {
    it("locks capital reservation when fee is missing and finalizes when authoritative fee arrives", async () => {
      const db = getDb();
      const now = Date.now();
      const clientOrderId = "ord_scen3_pending";

      // 1. Fund user with 10,000 USDT
      await LedgerService.creditDeposit({
        userId,
        amountMinor: 1_000_000n,
        assetOrCurrency: "USDT",
        accountMode: "live",
        paymentId: "dep_usdt_scen3",
        description: "Fund 10,000 USDT",
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: "sovereign_cash",
        toAccountType: "trading_allocated",
        assetOrCurrency: "USDT",
        amountMinor: 1_000_000n,
        accountMode: "live",
        referenceType: "allocation",
        referenceId: "alloc_scen3",
        description: "Allocate trading capital",
        idempotencyKey: "alloc_scen3_key",
      });

      // 2. Insert order in SUBMITTING state with capital reservation
      await db.execute(
        `INSERT INTO exchange_orders (
          id, user_id, client_order_id, symbol, side, type, status,
          orig_qty, price, notional, quote_asset, idempotency_key,
          orig_qty_exact, price_exact, notional_exact,
          estimated_fee_exact, commission_status,
          reserved_cash, reserved_cash_minor, created_at, updated_at
        ) VALUES (?, ?, ?, 'BTCUSDT', 'BUY', 'LIMIT', 'SUBMITTING', 0.1, 50000, 5000, 'USDT', 'idemp_scen3', '0.1', '50000', '5000', '3.75', 'ESTIMATED', 5003.75, 500375, ?, ?)`,
        [clientOrderId, userId, clientOrderId, now, now]
      );

      await LedgerService.reserveOrderFunds({
        userId,
        orderId: clientOrderId,
        accountMode: "live",
        accountType: "trading_allocated",
        assetOrCurrency: "USDT",
        amountMinor: 500_375n,
      });

      // 3. First recovery sweep: Exchange reports FILLED but fills array is empty (no commission yet)
      vi.spyOn(BinanceGateway, "reconcileUnknownOrder").mockResolvedValueOnce({
        found: true,
        status: "FILLED",
        exchangeOrderId: "ex_scen3_venue",
        executedQtyExact: "0.1",
        avgPriceExact: "50000",
        fills: [], // explicit empty fills list
      });

      const firstSweep = await OrderRecoveryService.runRecoverySweep();
      expect(firstSweep.ordersInspected).toBe(1);
      expect(firstSweep.unresolvedCount).toBe(1);
      expect(firstSweep.actions[0].action).toBe("AWAIT_AUTHORITATIVE_COMMISSION");

      // Verify order is kept in RECONCILING with commission_status = PENDING
      const orderMid = await db.queryOne<any>(
        "SELECT status, commission_status FROM exchange_orders WHERE client_order_id = ?",
        [clientOrderId]
      );
      expect(orderMid.status).toBe("RECONCILING");
      expect(orderMid.commission_status).toBe("PENDING");

      // Verify reservations are strictly LOCKED (not consumed and not released)
      const resMid = await db.queryOne<any>(
        "SELECT * FROM order_reservations WHERE order_id = ?",
        [clientOrderId]
      );
      expect(resMid.status).toBe("ACTIVE");
      expect(BigInt(resMid.consumed_minor)).toBe(0n);
      expect(BigInt(resMid.released_minor)).toBe(0n);

      // 4. Second recovery sweep: Venue returns trade fill with actual commission
      vi.spyOn(BinanceGateway, "reconcileUnknownOrder").mockResolvedValueOnce({
        found: true,
        status: "FILLED",
        exchangeOrderId: "ex_scen3_venue",
        executedQtyExact: "0.1",
        avgPriceExact: "50000",
        fills: [
          {
            tradeId: "trd_authoritative_scen3",
            price: "50000.00",
            qty: "0.1",
            commission: "4.20",
            commissionAsset: "USDT",
          },
        ],
      });

      const secondSweep = await OrderRecoveryService.runRecoverySweep();
      expect(secondSweep.recoveredCount).toBe(1);
      expect(secondSweep.unresolvedCount).toBe(0);

      // Verify order is now fully FILLED and commission_status is AUTHORITATIVE
      const orderFinal = await db.queryOne<any>(
        "SELECT status, commission_status, actual_commission_exact, fee_exact FROM exchange_orders WHERE client_order_id = ?",
        [clientOrderId]
      );
      expect(orderFinal.status).toBe("FILLED");
      expect(orderFinal.commission_status).toBe("AUTHORITATIVE");
      expect(orderFinal.actual_commission_exact).toBe("4.2");
      expect(orderFinal.fee_exact).toBe("4.2");

      // Verify reservations are consumed and excess released
      const resFinal = await db.queryOne<any>(
        "SELECT * FROM order_reservations WHERE order_id = ?",
        [clientOrderId]
      );
      expect(BigInt(resFinal.consumed_minor)).toBe(500_375n);

      // Verify cash balance reflects exact deduction of notional (500,000) + actual fee (420)
      // 1,000,000 - 500,420 = 499,580 minor
      const finalAcc = await LedgerService.getOrCreateAccount(userId, "trading_allocated", "USDT", "live");
      expect(BigInt(finalAcc.balance_minor)).toBe(499_580n);
      expect(BigInt(finalAcc.reserved_minor)).toBe(0n);
    });
  });

  // =========================================================================
  // Scenario 4: Estimated Fee Differs From Actual Fee
  // =========================================================================
  describe("Scenario 4: Estimated Fee Differs From Actual Fee", () => {
    it("books only the actual fee to ledger and releases difference from estimated reservation", async () => {
      const db = getDb();
      // 1. Fund user with 10,000 USDT
      await LedgerService.creditDeposit({
        userId,
        amountMinor: 1_000_000n,
        assetOrCurrency: "USDT",
        accountMode: "live",
        paymentId: "dep_usdt_scen4",
        description: "Fund 10,000 USDT",
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: "sovereign_cash",
        toAccountType: "trading_allocated",
        assetOrCurrency: "USDT",
        amountMinor: 1_000_000n,
        accountMode: "live",
        referenceType: "allocation",
        referenceId: "alloc_scen4",
        description: "Allocate trading capital",
        idempotencyKey: "alloc_scen4_key",
      });

      const orderId = "ord_scen4_diff";
      // Estimated fee was 0.075% of 5,000 = $3.75 (375 minor)
      // Total reserved: 500,375 minor
      await LedgerService.reserveOrderFunds({
        userId,
        orderId,
        accountMode: "live",
        accountType: "trading_allocated",
        assetOrCurrency: "USDT",
        amountMinor: 500_375n,
      });

      // Actual Binance trade execution returned discounted fee: $2.00 (200 minor)
      const fillResult = await LedgerService.processFill({
        userId,
        accountMode: "live",
        orderId,
        fillId: "trd_scen4_discounted",
        canonicalFillKey: `binance:${userId}:BTCUSDT:trd_scen4_discounted`,
        symbol: "BTCUSDT",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        side: "BUY",
        price: "50000.00",
        quantity: "0.1",
        fee: "2.00",
        feeAsset: "USDT",
      });

      expect(fillResult.alreadyProcessed).toBe(false);
      expect(fillResult.feeMinor).toBe(200n);

      // Release unconsumed reservation
      await LedgerService.releaseOrderReservation({ orderId });

      // Invariant: Ledger entries contain ONLY actual fee of 200 minor. NEVER 375 minor!
      const feeEntries = await db.query<any>(
        "SELECT * FROM ledger_entries WHERE reference_type = 'fee' AND order_id = ?",
        [orderId]
      );
      expect(feeEntries.length).toBe(2); // 1 debit from trading_allocated, 1 credit to fee_treasury
      for (const ent of feeEntries) {
        expect(BigInt(ent.amount_minor)).toBe(200n);
      }

      // No entry anywhere contains 375 minor
      const fallbackFeeEntries = await db.query<any>(
        "SELECT * FROM ledger_entries WHERE amount_minor = 375 AND user_id = ?",
        [userId]
      );
      expect(fallbackFeeEntries.length).toBe(0);

      // Fee treasury balance is exactly 200 minor ($2.00)
      const balances = await LedgerService.getUserBalances(userId, "live");
      expect(balances["fee_treasury:USDT"]?.balance).toBe(200);

      // Free balance after release: 1,000,000 - 500,200 = 499,800 minor ($4,998.00)
      const cashAcc = await LedgerService.getOrCreateAccount(userId, "trading_allocated", "USDT", "live");
      expect(BigInt(cashAcc.balance_minor)).toBe(499_800n);
      expect(BigInt(cashAcc.reserved_minor)).toBe(0n);
    });
  });

  // =========================================================================
  // Scenario 5: Duplicate Fills Idempotency & Unique Constraint
  // =========================================================================
  describe("Scenario 5: Duplicate Fills Idempotency & Unique Canonical Key", () => {
    it("returns ALREADY_SETTLED on second fill call and database prevents duplicate canonical keys", async () => {
      const db = getDb();
      // 1. Fund user
      await LedgerService.creditDeposit({
        userId,
        amountMinor: 1_000_000n,
        assetOrCurrency: "USDT",
        accountMode: "live",
        paymentId: "dep_usdt_scen5",
        description: "Fund 10,000 USDT",
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: "sovereign_cash",
        toAccountType: "trading_allocated",
        assetOrCurrency: "USDT",
        amountMinor: 1_000_000n,
        accountMode: "live",
        referenceType: "allocation",
        referenceId: "alloc_scen5",
        description: "Allocate trading capital",
        idempotencyKey: "alloc_scen5_key",
      });

      const orderId = "ord_scen5_dup";
      const tradeId = "trd_dup_999";
      const canonicalFillKey = `binance:${userId}:BTCUSDT:${tradeId}`;

      // 2. First execution: fill settles cleanly
      const fill1 = await LedgerService.processFill({
        userId,
        accountMode: "live",
        orderId,
        fillId: tradeId,
        canonicalFillKey,
        symbol: "BTCUSDT",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        side: "BUY",
        price: "50000.00",
        quantity: "0.1",
        fee: "3.75",
        feeAsset: "USDT",
      });

      expect(fill1.alreadyProcessed).toBe(false);
      const cashAfterFirst = fill1.cashBalanceAfterMinor;
      const assetAfterFirst = fill1.assetBalanceAfterMinor;

      // 3. Second execution with identical tradeId / canonicalFillKey
      const fill2 = await LedgerService.processFill({
        userId,
        accountMode: "live",
        orderId,
        fillId: tradeId,
        canonicalFillKey,
        symbol: "BTCUSDT",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        side: "BUY",
        price: "50000.00",
        quantity: "0.1",
        fee: "3.75",
        feeAsset: "USDT",
      });

      expect(fill2.alreadyProcessed).toBe(true);
      expect(fill2.cashBalanceAfterMinor).toBe(cashAfterFirst);
      expect(fill2.assetBalanceAfterMinor).toBe(assetAfterFirst);

      // Verify accounting_events table contains exactly ONE settlement row
      const accountingEvents = await db.query<any>(
        "SELECT * FROM accounting_events WHERE event_id = ?",
        [`settlement:binance:${userId}:${tradeId}`]
      );
      expect(accountingEvents.length).toBe(1);

      // 4. Test database unique constraint directly: duplicate insert to exchange_fills must throw
      await db.execute(
        `INSERT INTO exchange_orders (
          id, user_id, client_order_id, symbol, side, type, status,
          orig_qty, price, notional, quote_asset, idempotency_key,
          orig_qty_exact, price_exact, notional_exact,
          reserved_cash, reserved_cash_minor, created_at, updated_at
        ) VALUES (?, ?, ?, 'BTCUSDT', 'BUY', 'LIMIT', 'OPEN', 0.1, 50000, 5000, 'USDT', 'idemp_scen5_order', '0.1', '50000', '5000', 5000, 500000, ?, ?)`,
        [orderId, userId, orderId, Date.now(), Date.now()]
      );

      await db.execute(
        `INSERT INTO exchange_fills (
          id, order_id, exchange_trade_id, canonical_fill_key, symbol,
          price, price_exact, qty, qty_exact, commission, commission_exact, commission_asset,
          commission_status, quote_qty, quote_qty_exact, executed_at
        ) VALUES ('fill_raw_1', ?, ?, ?, 'BTCUSDT', 50000, '50000', 0.1, '0.1', 3.75, '3.75', 'USDT', 'AUTHORITATIVE', 5000, '5000', ?)`,
        [orderId, tradeId, canonicalFillKey, Date.now()]
      );

      // Second raw insert with the same canonical_fill_key must fail constraint
      let constraintFailed = false;
      try {
        await db.execute(
          `INSERT INTO exchange_fills (
            id, order_id, exchange_trade_id, canonical_fill_key, symbol,
            price, price_exact, qty, qty_exact, commission, commission_exact, commission_asset,
            commission_status, quote_qty, quote_qty_exact, executed_at
          ) VALUES ('fill_raw_2', ?, ?, ?, 'BTCUSDT', 50000, '50000', 0.1, '0.1', 3.75, '3.75', 'USDT', 'AUTHORITATIVE', 5000, '5000', ?)`,
          [orderId, tradeId, canonicalFillKey, Date.now()]
        );
      } catch (err: any) {
        constraintFailed = true;
        expect(err.message).toMatch(/UNIQUE constraint failed|duplicate key value/i);
      }
      expect(constraintFailed).toBe(true);
    });
  });

  // =========================================================================
  // Scenario 6: Multi-Fill Order Accounting
  // =========================================================================
  describe("Scenario 6: Multi-Fill Order Accounting", () => {
    it("derives exact order-level summaries from 3 distinct execution fills", async () => {
      const db = getDb();
      // 1. Fund user with 100,000 USDT (10,000,000 minor)
      await LedgerService.creditDeposit({
        userId,
        amountMinor: 10_000_000n,
        assetOrCurrency: "USDT",
        accountMode: "live",
        paymentId: "dep_usdt_scen6",
        description: "Fund 100,000 USDT",
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: "sovereign_cash",
        toAccountType: "trading_allocated",
        assetOrCurrency: "USDT",
        amountMinor: 10_000_000n,
        accountMode: "live",
        referenceType: "allocation",
        referenceId: "alloc_scen6",
        description: "Allocate trading capital",
        idempotencyKey: "alloc_scen6_key",
      });

      const orderId = "ord_scen6_multifill";
      const now = Date.now();

      await db.execute(
        `INSERT INTO exchange_orders (
          id, user_id, client_order_id, symbol, side, type, status,
          orig_qty, price, notional, quote_asset, idempotency_key,
          orig_qty_exact, price_exact, notional_exact,
          reserved_cash, reserved_cash_minor, created_at, updated_at
        ) VALUES (?, ?, ?, 'BTCUSDT', 'BUY', 'LIMIT', 'OPEN', 1.0, 60000, 60000, 'USDT', 'idemp_scen6', '1.0', '60000', '60000', 60045, 6004500, ?, ?)`,
        [orderId, userId, orderId, now, now]
      );

      await LedgerService.reserveOrderFunds({
        userId,
        orderId,
        accountMode: "live",
        accountType: "trading_allocated",
        assetOrCurrency: "USDT",
        amountMinor: 6_004_500n,
      });

      // Three fills:
      // Fill 1: 0.3 BTC @ 59,990 USDT, commission: 13.50 USDT
      // Fill 2: 0.5 BTC @ 60,000 USDT, commission: 22.50 USDT
      // Fill 3: 0.2 BTC @ 60,010 USDT, commission: 9.00 USDT
      const fills = [
        { tradeId: "trd_m1", qty: "0.3", price: "59990.00", fee: "13.50" },
        { tradeId: "trd_m2", qty: "0.5", price: "60000.00", fee: "22.50" },
        { tradeId: "trd_m3", qty: "0.2", price: "60010.00", fee: "9.00" },
      ];

      for (let i = 0; i < fills.length; i++) {
        const f = fills[i];
        const res = await LedgerService.processFill({
          userId,
          accountMode: "live",
          orderId,
          fillId: f.tradeId,
          canonicalFillKey: `binance:${userId}:BTCUSDT:${f.tradeId}`,
          symbol: "BTCUSDT",
          baseAsset: "BTC",
          quoteAsset: "USDT",
          side: "BUY",
          price: f.price,
          quantity: f.qty,
          fee: f.fee,
          feeAsset: "USDT",
        });
        expect(res.alreadyProcessed).toBe(false);

        // Record fill in exchange_fills
        await db.execute(
          `INSERT INTO exchange_fills (
            id, order_id, exchange_trade_id, canonical_fill_key, symbol,
            price, price_exact, qty, qty_exact, commission, commission_exact, commission_asset,
            commission_status, quote_qty, quote_qty_exact, executed_at
          ) VALUES (?, ?, ?, ?, 'BTCUSDT', ?, ?, ?, ?, ?, ?, 'USDT', 'AUTHORITATIVE', ?, ?, ?)`,
          [
            `fill_scen6_${i}`,
            orderId,
            f.tradeId,
            `binance:${userId}:BTCUSDT:${f.tradeId}`,
            Number(f.price),
            f.price,
            Number(f.qty),
            f.qty,
            Number(f.fee),
            f.fee,
            Number(ExactDecimal.from(f.price).mul(ExactDecimal.from(f.qty)).toString()),
            ExactDecimal.from(f.price).mul(ExactDecimal.from(f.qty)).toString(),
            Date.now(),
          ]
        );
      }

      // Calculate derived totals from fills
      let totalQtyDec = ExactDecimal.zero();
      let totalNotionalDec = ExactDecimal.zero();
      let totalFeeDec = ExactDecimal.zero();

      for (const f of fills) {
        const q = ExactDecimal.from(f.qty);
        const p = ExactDecimal.from(f.price);
        totalQtyDec = totalQtyDec.add(q);
        totalNotionalDec = totalNotionalDec.add(p.mul(q));
        totalFeeDec = totalFeeDec.add(ExactDecimal.from(f.fee));
      }
      const avgPriceDec = totalNotionalDec.div(totalQtyDec);

      // Verify mathematical derivations:
      // 0.3 * 59990 + 0.5 * 60000 + 0.2 * 60010 = 17997 + 30000 + 12002 = 59999.00
      expect(totalQtyDec.toString()).toBe("1");
      expect(totalNotionalDec.toString()).toBe("59999");
      expect(avgPriceDec.toString()).toBe("59999");
      expect(totalFeeDec.toString()).toBe("45");

      // Update order with authoritative derived totals
      await db.execute(
        `UPDATE exchange_orders SET
          status = 'FILLED',
          executed_qty_exact = ?,
          avg_price_exact = ?,
          executed_notional_exact = ?,
          actual_commission_exact = ?,
          actual_commission_asset = 'USDT',
          commission_status = 'AUTHORITATIVE'
        WHERE client_order_id = ?`,
        [
          totalQtyDec.toString(),
          avgPriceDec.toString(),
          totalNotionalDec.toString(),
          totalFeeDec.toString(),
          orderId,
        ]
      );

      // Verify persisted order state
      const orderRow = await db.queryOne<any>(
        "SELECT * FROM exchange_orders WHERE client_order_id = ?",
        [orderId]
      );
      expect(orderRow.status).toBe("FILLED");
      expect(orderRow.executed_qty_exact).toBe("1");
      expect(orderRow.avg_price_exact).toBe("59999");
      expect(orderRow.executed_notional_exact).toBe("59999");
      expect(orderRow.actual_commission_exact).toBe("45");
      expect(orderRow.actual_commission_asset).toBe("USDT");
      expect(orderRow.commission_status).toBe("AUTHORITATIVE");

      // Verify 3 distinct rows in exchange_fills and accounting_events
      const fillRows = await db.query<any>(
        "SELECT * FROM exchange_fills WHERE order_id = ?",
        [orderId]
      );
      expect(fillRows.length).toBe(3);

      const events = await db.query<any>(
        "SELECT * FROM accounting_events WHERE order_id = ?",
        [orderId]
      );
      expect(events.length).toBe(3);

      // Verify user balances: 10,000,000 - 5,999,900 notional - 4,500 fee = 3,995,600 minor ($39,956.00)
      const cashAcc = await LedgerService.getOrCreateAccount(userId, "trading_allocated", "USDT", "live");
      expect(BigInt(cashAcc.balance_minor)).toBe(3_995_600n);

      // Fee treasury: exactly 4,500 minor ($45.00)
      const balances = await LedgerService.getUserBalances(userId, "live");
      expect(balances["fee_treasury:USDT"]?.balance).toBe(4500);

      // Asset holding: exactly 1.00000000 BTC (100,000,000 minor)
      expect(balances["crypto_holdings:BTC"]?.balance).toBe(100_000_000);
    });
  });

  // =========================================================================
  // Scenario 7: Large Value and Fractional Exactness
  // =========================================================================
  describe("Scenario 7: Large Value and Fractional Exactness", () => {
    it("proves exact arithmetic without float leakage: 0.1 + 0.2 === 0.3", () => {
      const a = ExactDecimal.from("0.1");
      const b = ExactDecimal.from("0.2");
      const sum = a.add(b);

      expect(sum.toString()).toBe("0.3");
      expect(sum.toFixed(2)).toBe("0.30");
      expect(0.1 + 0.2).not.toBe(0.3); // IEEE 754 fails this!
    });

    it("preserves 1 satoshi (0.00000001) minimum asset unit without underflow", () => {
      const satoshi = ExactDecimal.from("0.00000001");
      expect(satoshi.toString()).toBe("0.00000001");
      expect(satoshi.toMinor(8)).toBe(1n);

      const hundredSats = satoshi.mul(ExactDecimal.from("100"));
      expect(hundredSats.toString()).toBe("0.000001");
      expect(hundredSats.toMinor(8)).toBe(100n);
    });

    it("preserves large multi-decimal values (99999999.12345678) without truncation", () => {
      const largeDec = ExactDecimal.from("99999999.12345678");
      expect(largeDec.toString()).toBe("99999999.12345678");
      expect(largeDec.toMinor(8)).toBe(9999999912345678n);
    });

    it("persists and reads BigInt integers exceeding Number.MAX_SAFE_INTEGER (9007199254740993n)", async () => {
      const db = getDb();
      const accountId = `acc_huge_${Date.now()}`;
      const hugeMinor = 9007199254740993n; // 2^53 + 1

      await db.execute(
        `INSERT INTO ledger_accounts (id, user_id, account_mode, account_type, asset_or_currency, balance_minor, reserved_minor, created_at, updated_at)
         VALUES (?, ?, 'live', 'trading_allocated', 'USDT', ?, 0, ?, ?)`,
        [accountId, userId, hugeMinor, Date.now(), Date.now()]
      );

      const row = await db.queryOne<any>(
        "SELECT balance_minor FROM ledger_accounts WHERE id = ?",
        [accountId]
      );

      // Safe integer boundary check: value > 2^53 MUST remain native BigInt
      expect(typeof row.balance_minor).toBe("bigint");
      expect(row.balance_minor).toBe(hugeMinor);

      const exact = ExactDecimal.fromMinor(row.balance_minor, 2);
      expect(exact.toString()).toBe("90071992547409.93");
    });
  });
});
