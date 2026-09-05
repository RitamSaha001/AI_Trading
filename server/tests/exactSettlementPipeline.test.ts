import { describe, it, expect, beforeEach } from 'vitest';
import { ExactDecimal, computeSoldCostBasis } from '../services/precision';
import { SymbolRulesService, AuthoritativeExchangeRulesUnavailableError } from '../services/symbolRules';
import { BinanceGateway } from '../services/binanceGateway';
import { LedgerService } from '../services/ledgerService';
import { getDb } from '../db';

describe('Authoritative Live Financial Execution & Settlement Suite', () => {
  const userId = 'usr_exact_pipeline_001';

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
    await db.execute(`DELETE FROM audit_events WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);

    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
       VALUES (?, 'exact_trader@lumen.io', 'Exact Precision Trader', 'email', 'prov_exact', ?, ?)`,
      [userId, Date.now(), Date.now()]
    );

    await db.execute(
      `INSERT INTO account_limits (id, user_id, is_emergency_frozen, max_single_order_pct, max_asset_concentration_pct, min_cash_reserve_pct, updated_at)
       VALUES (?, ?, 0, 0.50, 0.60, 0.10, ?)`,
      [`lim_${userId}`, userId, Date.now()]
    );
  });

  // =========================================================================
  // 1. Exactness & Floating-Point Protection
  // =========================================================================
  describe('1. Exact Decimal Precision & Arithmetic Boundary', () => {
    it('proves 0.1 + 0.2 === 0.3 without IEEE-754 drift', () => {
      const a = ExactDecimal.from('0.1');
      const b = ExactDecimal.from('0.2');
      const sum = a.add(b);

      expect(sum.toString()).toBe('0.3');
      expect(sum.toFixed(2)).toBe('0.30');
      // Verify standard JS float fails this invariant
      expect(0.1 + 0.2).not.toBe(0.3);
    });

    it('preserves single-satoshi minimum asset unit (0.00000001) without truncation', () => {
      const satoshi = ExactDecimal.from('0.00000001');
      expect(satoshi.toString()).toBe('0.00000001');
      expect(satoshi.toMinor(8)).toBe(1n);

      const hundredSats = satoshi.mul(ExactDecimal.from('100'));
      expect(hundredSats.toString()).toBe('0.000001');
      expect(hundredSats.toFixed(8)).toBe('0.00000100');
      expect(hundredSats.toMinor(8)).toBe(100n);
    });

    it('safely handles integer minor values exceeding Number.MAX_SAFE_INTEGER (9007199254740991)', () => {
      const hugeMinorStr = '9007199254740993'; // 2^53 + 1
      const hugeMinor = BigInt(hugeMinorStr);
      const dec = ExactDecimal.fromMinor(hugeMinor, 2);

      expect(dec.toMinor(2)).toBe(hugeMinor);
      expect(dec.toString()).toBe('90071992547409.93');

      // Native Number loses precision here:
      expect(Number(hugeMinorStr)).not.toBe(BigInt(hugeMinorStr));
    });

    it('exact decimal multiplication and division do not leak floating-point remainders', () => {
      const price = ExactDecimal.from('64321.12');
      const qty = ExactDecimal.from('0.00154321');
      const notional = price.mul(qty);

      // 64321.12 * 0.00154321 = 99.2609955952
      expect(notional.toString()).toBe('99.2609955952');
      expect(notional.toFixed(2)).toBe('99.26');
      expect(notional.toMinor(2)).toBe(9926n);
    });
  });

  // =========================================================================
  // 2. Authoritative Exchange Responses & String Representation
  // =========================================================================
  describe('2. Exchange Response String Preservation & Fill Truth', () => {
    it('OrderStateRecord derives display numbers from exact string columns', async () => {
      const db = getDb();
      const orderId = `ord_exact_${Date.now()}`;
      const now = Date.now();

      await db.execute(
        `INSERT INTO exchange_orders (
          id, user_id, client_order_id, symbol, side, type, status,
          orig_qty, orig_qty_exact, price, price_exact, quote_asset,
          notional, notional_exact, executed_qty, executed_qty_exact,
          avg_price, avg_price_exact, cumulative_quote_qty, cumulative_quote_exact,
          fee, fee_exact, idempotency_key, created_at, updated_at
        ) VALUES (
          ?, ?, ?, 'BTCUSDT', 'BUY', 'LIMIT', 'FILLED',
          0.30000000000000004, '0.3', 50000.0, '50000.00', 'USDT',
          15000.0, '15000.00', 0.30000000000000004, '0.3',
          50000.0, '50000.00', 15000.0, '15000.00',
          11.25, '11.25', 'idemp_exact_read', ?, ?
        )`,
        [orderId, userId, orderId, now, now]
      );

      const orderRow = await db.queryOne<any>(
        `SELECT * FROM exchange_orders WHERE client_order_id = ?`,
        [orderId]
      );

      const mapped = (BinanceGateway as any).mapOrderRecord(orderRow);

      expect(mapped.origQtyExact).toBe('0.3');
      expect(mapped.executedQtyExact).toBe('0.3');
      expect(mapped.priceExact).toBe('50000.00');
      expect(mapped.notionalExact).toBe('15000.00');
      expect(mapped.feeExact).toBe('11.25');

      expect(mapped.origQty).toBe(0.3);
      expect(mapped.executedQty).toBe(0.3);
      expect(mapped.price).toBe(50000);
      expect(mapped.notional).toBe(15000);
    });
  });

  // =========================================================================
  // 3. Actual Binance Commission vs Estimated Fee
  // =========================================================================
  describe('3. Actual Binance Commission vs Fallback Fee', () => {
    it('ledgerService processFill accounts for exact fee in quote asset', async () => {
      await LedgerService.creditDeposit({
        userId,
        amountMinor: 1_000_000n, // $10,000.00
        assetOrCurrency: 'USDT',
        accountMode: 'live',
        paymentId: 'dep_usdt_001',
        description: 'Deposit 10000 USDT',
      });

      await LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 1_000_000n,
        accountMode: 'live',
        referenceType: 'allocation',
        referenceId: 'ref_alloc_001',
        description: 'Allocate USDT',
        idempotencyKey: 'alloc_usdt_001',
      });

      const fillResult = await LedgerService.processFill({
        userId,
        accountMode: 'live',
        orderId: 'ord_actual_fee_001',
        fillId: 'fill_actual_fee_001',
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        price: '50000.00',
        quantity: '0.1',
        fee: '3.45',
        feeAsset: 'USDT',
      });

      expect(fillResult.alreadyProcessed).toBe(false);
      expect(fillResult.cashBalanceAfterMinor).toBe(499_655n);
      expect(fillResult.assetBalanceAfterMinor).toBe(10_000_000n);
    });

    it('ledgerService processFill accounts for commission paid in a third asset (e.g. BNB)', async () => {
      await LedgerService.creditDeposit({
        userId,
        amountMinor: 1_000_000n,
        assetOrCurrency: 'USDT',
        accountMode: 'live',
        paymentId: 'dep_usdt_bnb_test',
        description: 'Deposit 10000 USDT',
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 1_000_000n,
        accountMode: 'live',
        referenceType: 'allocation',
        referenceId: 'ref_alloc_bnb',
        description: 'Allocate USDT',
        idempotencyKey: 'alloc_usdt_bnb_test',
      });

      await LedgerService.creditDeposit({
        userId,
        amountMinor: 100_000_000n, // 1.00000000 BNB
        assetOrCurrency: 'BNB',
        accountMode: 'live',
        paymentId: 'dep_bnb_fee_test',
        description: 'Deposit 1 BNB',
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'crypto_holdings',
        assetOrCurrency: 'BNB',
        amountMinor: 100_000_000n,
        accountMode: 'live',
        referenceType: 'funding',
        referenceId: 'ref_bnb_holdings',
        description: 'Fund BNB holdings',
      });

      const fillResult = await LedgerService.processFill({
        userId,
        accountMode: 'live',
        orderId: 'ord_bnb_fee_001',
        fillId: 'fill_bnb_fee_001',
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        price: '50000.00',
        quantity: '0.1',
        fee: '0.00500000',
        feeAsset: 'BNB',
      });

      expect(fillResult.cashBalanceAfterMinor).toBe(500_000n);
      expect(fillResult.assetBalanceAfterMinor).toBe(10_000_000n);

      const bnbBal = await LedgerService.getUserBalances(userId, 'live');
      const bnbAccount = bnbBal['crypto_holdings:BNB'];
      expect(bnbAccount).toBeDefined();
      expect(bnbAccount.balance).toBe(99_500_000);
    });
  });

  // =========================================================================
  // 4. Cost Basis & Realized P&L Exactness
  // =========================================================================
  describe('4. Cost Basis Exact Pro-Rata & Full Liquidation Guarantee', () => {
    it('pro-rates cost basis on partial sale and liquidates 100% on full sale without residual drift', () => {
      const totalCostBasis = 100_000n; // $1,000.00
      const totalQty = 100_000_000n;   // 1.00000000 BTC

      const sold1 = 33_333_333n;
      const costBasisSold1 = computeSoldCostBasis(totalCostBasis, sold1, totalQty);
      expect(costBasisSold1).toBe(33_333n);

      const remainingCostBasis = totalCostBasis - costBasisSold1;
      const remainingQty = totalQty - sold1;

      const costBasisSold2 = computeSoldCostBasis(remainingCostBasis, remainingQty, remainingQty);
      expect(costBasisSold2).toBe(remainingCostBasis);
      expect(remainingCostBasis - costBasisSold2).toBe(0n);
    });

    it('computes exact realized P&L across multi-step buy, partial sell, and full exit', async () => {
      await LedgerService.creditDeposit({
        userId,
        amountMinor: 2_000_000n,
        assetOrCurrency: 'USDT',
        accountMode: 'live',
        paymentId: 'dep_pnl_test',
        description: 'Deposit 20000 USDT',
      });
      await LedgerService.transfer({
        userId,
        fromAccountType: 'sovereign_cash',
        toAccountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 2_000_000n,
        accountMode: 'live',
        referenceType: 'allocation',
        referenceId: 'ref_alloc_pnl',
        description: 'Allocate USDT',
        idempotencyKey: 'alloc_pnl_test',
      });

      await LedgerService.processFill({
        userId,
        accountMode: 'live',
        orderId: 'buy_lot_1',
        fillId: 'fill_buy_lot_1',
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        price: '50000.00',
        quantity: '0.2',
        fee: '7.50',
        feeAsset: 'USDT',
      });

      let pos = await LedgerService.getOrCreateAuthoritativePosition(userId, 'live', 'BTC');
      expect(BigInt(pos.cost_basis_minor)).toBe(1_000_750n);
      expect(BigInt(pos.total_quantity_minor)).toBe(20_000_000n);

      const sellResult1 = await LedgerService.processFill({
        userId,
        accountMode: 'live',
        orderId: 'sell_lot_1',
        fillId: 'fill_sell_lot_1',
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'SELL',
        price: '60000.00',
        quantity: '0.1',
        fee: '4.50',
        feeAsset: 'USDT',
      });

      expect(sellResult1.realizedPnlMinor).toBe(99_175n);

      pos = await LedgerService.getOrCreateAuthoritativePosition(userId, 'live', 'BTC');
      expect(BigInt(pos.cost_basis_minor)).toBe(500_375n);
      expect(BigInt(pos.total_quantity_minor)).toBe(10_000_000n);

      const sellResult2 = await LedgerService.processFill({
        userId,
        accountMode: 'live',
        orderId: 'sell_lot_2',
        fillId: 'fill_sell_lot_2',
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'SELL',
        price: '40000.00',
        quantity: '0.1',
        fee: '3.00',
        feeAsset: 'USDT',
      });

      expect(sellResult2.realizedPnlMinor).toBe(-100_675n);

      pos = await LedgerService.getOrCreateAuthoritativePosition(userId, 'live', 'BTC');
      expect(BigInt(pos.total_quantity_minor)).toBe(0n);
      expect(BigInt(pos.cost_basis_minor)).toBe(0n);
      expect(BigInt(pos.realized_pnl_minor)).toBe(-1_500n);
    });
  });

  // =========================================================================
  // 5. Dynamic Rules & Missing Critical Filter Failure Closed
  // =========================================================================
  describe('5. Binance Exchange Filter Completeness & Fail-Closed Behavior', () => {
    it('parseSymbolInfo detects and flags present vs missing filters', () => {
      const incompleteInfo = {
        symbol: 'INCOMPUSDT',
        baseAsset: 'INCOMP',
        quoteAsset: 'USDT',
        filters: [
          {
            filterType: 'PRICE_FILTER',
            tickSize: '0.01',
            minPrice: '0.01',
            maxPrice: '1000.00',
          },
        ],
      };

      const rule = SymbolRulesService.parseSymbolInfo(incompleteInfo);
      expect(rule.filtersPresent).toBeDefined();
      expect(rule.filtersPresent?.priceFilter).toBe(true);
      expect(rule.filtersPresent?.lotSize).toBe(false);
    });

    it('validateAndNormalize fails closed for live trading when LOT_SIZE is missing', () => {
      const incompleteRule = SymbolRulesService.parseSymbolInfo({
        symbol: 'NOLOTUSDT',
        baseAsset: 'NOLOT',
        quoteAsset: 'USDT',
        filters: [
          {
            filterType: 'PRICE_FILTER',
            tickSize: '0.01',
            minPrice: '0.01',
            maxPrice: '1000.00',
          },
        ],
      });

      expect(() => {
        SymbolRulesService.validateAndNormalize({
          symbol: 'NOLOTUSDT',
          quantity: '1.0',
          price: '50.00',
          accountMode: 'live',
          rule: incompleteRule,
        });
      }).toThrow(AuthoritativeExchangeRulesUnavailableError);
    });

    it('validateAndNormalize allows paper trading with default fallback rules', () => {
      const incompleteRule = SymbolRulesService.parseSymbolInfo({
        symbol: 'PAPERTESTUSDT',
        baseAsset: 'PAPER',
        quoteAsset: 'USDT',
        filters: [
          {
            filterType: 'PRICE_FILTER',
            tickSize: '0.01',
            minPrice: '0.01',
            maxPrice: '1000.00',
          },
        ],
      });

      const normalized = SymbolRulesService.validateAndNormalize({
        symbol: 'PAPERTESTUSDT',
        quantity: '1.0',
        price: '50.00',
        accountMode: 'paper',
        rule: incompleteRule,
      });

      expect(normalized.quantityStr).toBe('1.00000');
      expect(normalized.priceStr).toBe('50.00');
      expect(normalized.notionalStr).toBe('50.00');
    });
  });

  // =========================================================================
  // 6. Reservation Invariants
  // =========================================================================
  describe('6. Reservation Invariants & Exact Settlement', () => {
    it('verifies reservation invariant: consumed_minor + released_minor <= amount_minor', async () => {
      const db = getDb();
      const orderId = `ord_res_inv_${Date.now()}`;
      const accountId = `acc_res_inv_${Date.now()}`;

      await db.execute(
        `INSERT INTO ledger_accounts (id, user_id, account_mode, account_type, asset_or_currency, balance_minor, reserved_minor, created_at, updated_at)
         VALUES (?, ?, 'live', 'trading_allocated', 'USDT', 500000, 0, ?, ?)`,
        [accountId, userId, Date.now(), Date.now()]
      );

      await LedgerService.reserveOrderFunds({
        userId,
        orderId,
        accountMode: 'live',
        accountType: 'trading_allocated',
        assetOrCurrency: 'USDT',
        amountMinor: 500_000n,
      });

      const resBefore = await db.queryOne<any>(
        `SELECT * FROM order_reservations WHERE order_id = ?`,
        [orderId]
      );
      expect(BigInt(resBefore.amount_minor)).toBe(500_000n);
      expect(BigInt(resBefore.consumed_minor)).toBe(0n);
      expect(BigInt(resBefore.released_minor)).toBe(0n);

      await db.transaction(async (tx) => {
        await LedgerService.consumeOrderReservation({
          orderId,
          accountId,
          amountMinor: 300_000n,
          tx,
        });
      });

      const resMid = await db.queryOne<any>(
        `SELECT * FROM order_reservations WHERE order_id = ?`,
        [orderId]
      );
      expect(BigInt(resMid.consumed_minor)).toBe(300_000n);
      expect(BigInt(resMid.released_minor)).toBe(0n);
      expect(BigInt(resMid.consumed_minor) + BigInt(resMid.released_minor)).toBeLessThanOrEqual(BigInt(resMid.amount_minor));

      await LedgerService.releaseOrderReservation({ orderId });

      const resFinal = await db.queryOne<any>(
        `SELECT * FROM order_reservations WHERE order_id = ?`,
        [orderId]
      );
      expect(BigInt(resFinal.consumed_minor)).toBe(300_000n);
      expect(BigInt(resFinal.released_minor)).toBe(200_000n);
      expect(BigInt(resFinal.consumed_minor) + BigInt(resFinal.released_minor)).toBe(BigInt(resFinal.amount_minor));
    });
  });
});
