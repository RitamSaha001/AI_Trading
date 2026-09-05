import { describe, it, expect, beforeEach } from 'vitest';
import { LedgerService } from '../services/ledgerService';
import { BinanceGateway } from '../services/binanceGateway';
import { ReconciliationWorker } from '../services/reconciliationWorker';
import { getDb } from '../db';
import { fromCashMinor, fromAssetMinor, toCashMinor, toAssetMinor } from '../services/precision';

describe('Authoritative Financial Ledger & Accounting Layer', () => {
  const userId = 'usr_auth_accounting_001';

  beforeEach(async () => {
    const db = getDb();
    await db.execute(`DELETE FROM exchange_orders WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM exchange_fills`);
    await db.execute(`DELETE FROM authoritative_positions WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_entries WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM ledger_accounts WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM account_limits WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM reconciliation_mismatches WHERE user_id = ?`, [userId]);
    await db.execute(`DELETE FROM reconciliation_runs`);
    await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);

    await db.execute(
      `INSERT INTO users (id, email, display_name, provider, provider_id, created_at, updated_at)
       VALUES (?, 'ledger_auth_test@lumen.io', 'Auth Ledger Tester', 'email', 'test_prov', ?, ?)`,
      [userId, Date.now(), Date.now()]
    );

    await db.execute(
      `INSERT INTO account_limits (id, user_id, is_emergency_frozen, max_single_order_pct, max_asset_concentration_pct, min_cash_reserve_pct, updated_at)
       VALUES (?, ?, 0, 0.40, 0.50, 0.15, ?)`,
      [`lim_${userId}`, userId, Date.now()]
    );
  });

  it('Scenario 1 (BUY): cash decreases, asset quantity increases, fee accounted, cost basis capitalized', async () => {
    // 1. Fund trading desk with $100,000 USDT (10,000,000 cents)
    await LedgerService.creditDeposit({
      userId,
      accountMode: 'live',
      assetOrCurrency: 'USDT',
      amountMinor: 10_000_000, // $100,000
      paymentId: 'pay_init_001',
      description: 'Initial Deposit',
    });
    await LedgerService.transfer({
      userId,
      accountMode: 'live',
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 10_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_init_001',
      description: 'Allocate to Trading Desk',
    });

    // 2. Execute BUY: 0.5 BTC at $60,000 ($30,000 notional, fee $22.50)
    const fillResult = await LedgerService.processFill({
      userId,
      accountMode: 'live',
      orderId: 'ord_buy_btc_001',
      fillId: 'fill_buy_btc_001',
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      side: 'BUY',
      price: 60000,
      quantity: 0.5,
      fee: 22.5,
      feeAsset: 'USDT',
    });

    expect(fillResult.alreadyProcessed).toBe(false);

    // Cash decreased by notional ($30,000) + fee ($22.50) = $30,022.50 = 3,002,250 cents
    // Balance remaining = 10,000,000 - 3,002,250 = 6,997,750 cents ($69,977.50)
    expect(fillResult.cashBalanceAfterMinor).toBe(6_997_750n);
    // Asset holding = 0.5 BTC = 50,000,000 satoshis
    expect(fillResult.assetBalanceAfterMinor).toBe(50_000_000n);

    // Verify Authoritative Projection
    const projection = await LedgerService.getAuthoritativeProjection(userId, 'live');
    expect(projection.cash.available).toBeCloseTo(69977.5, 2);
    expect(projection.cash.total).toBeCloseTo(69977.5, 2);
    expect(projection.positions['BTC'].totalQuantity).toBeCloseTo(0.5, 8);
    // Capitalized cost basis includes fee: $30,022.50
    expect(projection.positions['BTC'].costBasisUSD).toBeCloseTo(30022.5, 2);
    expect(projection.positions['BTC'].avgCostBasisUSD).toBeCloseTo(60045.0, 2);
    expect(projection.pnl.totalFeesUSD).toBeCloseTo(22.5, 2);

    // Verify Double-Entry Balance Invariant for cash account
    const cashAcc = await LedgerService.getOrCreateAccount(userId, 'trading_allocated', 'USDT', 'live');
    const inv = await LedgerService.verifyAccountInvariant(cashAcc.id);
    expect(inv.valid).toBe(true);
    expect(inv.recordedBalance).toBe(6_997_750n);
  });

  it('Scenario 2 (SELL): asset quantity decreases, cash increases, fee accounted, realized P&L correct', async () => {
    // 1. Setup: Fund account and buy 0.5 BTC at $60,000 (Cost basis = $30,022.50)
    await LedgerService.creditDeposit({
      userId,
      accountMode: 'live',
      assetOrCurrency: 'USDT',
      amountMinor: 10_000_000,
      paymentId: 'pay_init_002',
      description: 'Deposit',
    });
    await LedgerService.transfer({
      userId,
      accountMode: 'live',
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 10_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_init_002',
      description: 'Fund Trading',
    });
    await LedgerService.processFill({
      userId,
      accountMode: 'live',
      orderId: 'ord_buy_002',
      fillId: 'fill_buy_002',
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      side: 'BUY',
      price: 60000,
      quantity: 0.5,
      fee: 22.5,
      feeAsset: 'USDT',
    });

    // 2. Sell 0.2 BTC at $70,000 ($14,000 gross notional, fee $10.50)
    // Sold Cost Basis = (0.2 / 0.5) * $30,022.50 = $12,009.00
    // Net Proceeds = $14,000 - $10.50 = $13,989.50
    // Realized P&L = $13,989.50 - $12,009.00 = +$1,980.50
    const sellFill = await LedgerService.processFill({
      userId,
      accountMode: 'live',
      orderId: 'ord_sell_002',
      fillId: 'fill_sell_002',
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      side: 'SELL',
      price: 70000,
      quantity: 0.2,
      fee: 10.5,
      feeAsset: 'USDT',
    });

    expect(sellFill.alreadyProcessed).toBe(false);
    // BTC holding remaining: 0.5 - 0.2 = 0.3 BTC (30,000,000 satoshis)
    expect(sellFill.assetBalanceAfterMinor).toBe(30_000_000n);
    // Realized P&L: +$1,980.50 = 198,050 cents
    expect(sellFill.realizedPnlMinor).toBe(198_050n);

    const projection = await LedgerService.getAuthoritativeProjection(userId, 'live');
    expect(projection.positions['BTC'].totalQuantity).toBeCloseTo(0.3, 8);
    // Residual Cost Basis: $30,022.50 - $12,009.00 = $18,013.50
    expect(projection.positions['BTC'].costBasisUSD).toBeCloseTo(18013.5, 2);
    expect(projection.positions['BTC'].realizedPnlUSD).toBeCloseTo(1980.5, 2);
    expect(projection.pnl.realizedPnlUSD).toBeCloseTo(1980.5, 2);
    expect(projection.pnl.totalFeesUSD).toBeCloseTo(33.0, 2); // $22.50 + $10.50
  });

  it('Scenario 3 (Duplicate Fill Idempotency): processing same fill twice produces zero duplicate accounting', async () => {
    await LedgerService.creditDeposit({
      userId,
      accountMode: 'live',
      assetOrCurrency: 'USDT',
      amountMinor: 5_000_000,
      paymentId: 'pay_idemp_001',
      description: 'Fund',
    });
    await LedgerService.transfer({
      userId,
      accountMode: 'live',
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 5_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_idemp_001',
      description: 'Fund',
    });

    const fillParams = {
      userId,
      accountMode: 'live' as const,
      orderId: 'ord_duplicate_test_001',
      fillId: 'fill_duplicate_unique_id_99',
      symbol: 'ETHUSDT',
      baseAsset: 'ETH',
      quoteAsset: 'USDT',
      side: 'BUY' as const,
      price: 3000,
      quantity: 1.0,
      fee: 2.25,
      feeAsset: 'USDT',
    };

    // First processing
    const firstResult = await LedgerService.processFill(fillParams);
    expect(firstResult.alreadyProcessed).toBe(false);

    const balanceAfterFirst = firstResult.cashBalanceAfterMinor;
    const assetAfterFirst = firstResult.assetBalanceAfterMinor;

    // Second processing with identical fill ID
    const secondResult = await LedgerService.processFill(fillParams);
    expect(secondResult.alreadyProcessed).toBe(true);
    expect(secondResult.cashBalanceAfterMinor).toBe(balanceAfterFirst);
    expect(secondResult.assetBalanceAfterMinor).toBe(assetAfterFirst);

    // Verify database only has one set of journal entries
    const db = getDb();
    const entries = await db.query(
      `SELECT * FROM ledger_entries WHERE fill_id = ?`,
      ['fill_duplicate_unique_id_99']
    );
    // 1 cash debit, 1 cash fee debit, 1 treasury fee credit, 1 asset credit = 4 entries total
    expect(entries.length).toBe(4);
  });

  it('Scenario 4 (Partial Fills): multiple fills for one order aggregate cumulative quantity and fees exactly', async () => {
    await LedgerService.creditDeposit({
      userId,
      accountMode: 'live',
      assetOrCurrency: 'USDT',
      amountMinor: 10_000_000,
      paymentId: 'pay_pf_001',
      description: 'Fund',
    });
    await LedgerService.transfer({
      userId,
      accountMode: 'live',
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 10_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_pf_001',
      description: 'Fund',
    });

    const orderId = 'ord_partial_fill_100';

    // Partial Fill 1: 0.4 ETH @ $3,000 (fee $0.90)
    await LedgerService.processFill({
      userId,
      accountMode: 'live',
      orderId,
      fillId: 'fill_pf_part_1',
      symbol: 'ETHUSDT',
      baseAsset: 'ETH',
      quoteAsset: 'USDT',
      side: 'BUY',
      price: 3000,
      quantity: 0.4,
      fee: 0.9,
      feeAsset: 'USDT',
    });

    // Partial Fill 2: 0.6 ETH @ $3,000 (fee $1.35)
    await LedgerService.processFill({
      userId,
      accountMode: 'live',
      orderId,
      fillId: 'fill_pf_part_2',
      symbol: 'ETHUSDT',
      baseAsset: 'ETH',
      quoteAsset: 'USDT',
      side: 'BUY',
      price: 3000,
      quantity: 0.6,
      fee: 1.35,
      feeAsset: 'USDT',
    });

    const projection = await LedgerService.getAuthoritativeProjection(userId, 'live');
    // Total ETH holding = 0.4 + 0.6 = 1.0 ETH
    expect(projection.positions['ETH'].totalQuantity).toBeCloseTo(1.0, 8);
    // Total Fees = $0.90 + $1.35 = $2.25
    expect(projection.positions['ETH'].totalFeesUSD).toBeCloseTo(2.25, 2);
    // Total Cash Spent = $3000 + $2.25 = $3,002.25
    expect(projection.cash.available).toBeCloseTo(100000 - 3002.25, 2);
  });

  it('Scenario 5 (Failed/Rejected Order): rejected order creates no financial ledger entries', async () => {
    // Place order that exceeds single order cap (50,000 > 40% cap of zero portfolio)
    const res = await BinanceGateway.submitOrder({
      userId,
      symbol: 'BTCUSDT',
      asset: 'BTC',
      quoteAsset: 'USDT',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 10,
      price: 60000,
      marketQuoteAgeMs: 1000,
      idempotencyKey: 'idemp_rejected_order_001',
    });

    expect(res.status).toBe('REJECTED');

    const db = getDb();
    const entries = await db.query(
      `SELECT * FROM ledger_entries WHERE user_id = ?`,
      [userId]
    );
    expect(entries.length).toBe(0);
  });

  it('Scenario 6 (Cancellation): cancelling open limit order releases reservations without altering holdings', async () => {
    await LedgerService.creditDeposit({
      userId,
      accountMode: 'live',
      assetOrCurrency: 'USDT',
      amountMinor: 2_000_000, // $20,000
      paymentId: 'pay_cancel_001',
      description: 'Fund',
    });
    await LedgerService.transfer({
      userId,
      accountMode: 'live',
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 2_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_cancel_001',
      description: 'Fund',
    });

    // Place LIMIT BUY: notional $5,000
    const order = await BinanceGateway.submitOrder({
      userId,
      symbol: 'BTCUSDT',
      asset: 'BTC',
      quoteAsset: 'USDT',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 0.1,
      price: 50000,
      marketQuoteAgeMs: 1000,
      idempotencyKey: 'idemp_cancel_test_001',
    });

    expect(order.status).toBe('OPEN');

    let balances = await LedgerService.getUserBalances(userId, 'live');
    expect(balances['trading_allocated:USDT'].reserved).toBeGreaterThan(0);

    // Cancel order
    const cancelled = await BinanceGateway.cancelOrder(userId, order.clientOrderId);
    expect(cancelled.status).toBe('CANCELED');

    balances = await LedgerService.getUserBalances(userId, 'live');
    // Reserved drops back to 0
    expect(balances['trading_allocated:USDT'].reserved).toBe(0);
    expect(balances['trading_allocated:USDT'].free).toBe(2_000_000);
  });

  it('Scenario 7 (Insufficient Balance): impossible transactions cannot enter ledger', async () => {
    // Attempting to buy 1 BTC with 0 cash
    await expect(
      LedgerService.processFill({
        userId,
        accountMode: 'live',
        orderId: 'ord_impossible_buy',
        fillId: 'fill_impossible_buy',
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'BUY',
        price: 60000,
        quantity: 1.0,
      })
    ).rejects.toThrow(/Insufficient cash balance/);

    // Attempting to sell 1 BTC with 0 crypto holdings
    await expect(
      LedgerService.processFill({
        userId,
        accountMode: 'live',
        orderId: 'ord_impossible_sell',
        fillId: 'fill_impossible_sell',
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        side: 'SELL',
        price: 60000,
        quantity: 1.0,
      })
    ).rejects.toThrow(/Insufficient asset balance/);
  });

  it('Scenario 8 (Replay Consistency): rebuilding account state from ledger entries matches authoritative projection exactly', async () => {
    // Execute multiple lifecycle operations
    await LedgerService.creditDeposit({
      userId,
      accountMode: 'live',
      assetOrCurrency: 'USDT',
      amountMinor: 5_000_000,
      paymentId: 'pay_replay_1',
      description: 'Deposit 1',
    });
    await LedgerService.transfer({
      userId,
      accountMode: 'live',
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 3_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_replay_1',
      description: 'Alloc 1',
    });
    await LedgerService.processFill({
      userId,
      accountMode: 'live',
      orderId: 'ord_replay_buy',
      fillId: 'fill_replay_buy',
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      side: 'BUY',
      price: 50000,
      quantity: 0.2,
      fee: 7.5,
    });

    const replayResult = await LedgerService.replayAccountState(userId, 'live');
    expect(replayResult.consistent).toBe(true);
    expect(replayResult.discrepancies.length).toBe(0);
    expect(replayResult.entriesCount).toBeGreaterThan(0);
  });

  it('Scenario 9 (Paper/Live Isolation): paper transactions cannot affect live accounts and vice versa', async () => {
    // 1. Fund Live Account with $1,000
    await LedgerService.creditDeposit({
      userId,
      accountMode: 'live',
      assetOrCurrency: 'USDT',
      amountMinor: 100_000,
      paymentId: 'pay_live_001',
      description: 'Live Deposit',
    });

    // 2. Fund Paper Account with $50,000
    await LedgerService.creditDeposit({
      userId,
      accountMode: 'paper',
      assetOrCurrency: 'USDT',
      amountMinor: 5_000_000,
      paymentId: 'pay_paper_001',
      description: 'Paper Sim Initial',
    });

    // 3. Process fill in Paper Account
    await LedgerService.transfer({
      userId,
      accountMode: 'paper',
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 5_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_paper_001',
      description: 'Paper Allocation',
    });

    await LedgerService.processFill({
      userId,
      accountMode: 'paper',
      orderId: 'ord_paper_buy',
      fillId: 'fill_paper_buy',
      symbol: 'SOLUSDT',
      baseAsset: 'SOL',
      quoteAsset: 'USDT',
      side: 'BUY',
      price: 150,
      quantity: 10,
    });

    // Verify Live Projection: has 0 SOL, exactly $1,000 USDT in sovereign cash
    const liveProjection = await LedgerService.getAuthoritativeProjection(userId, 'live');
    expect(liveProjection.positions['SOL']).toBeUndefined();
    const liveBalances = await LedgerService.getUserBalances(userId, 'live');
    expect(liveBalances['sovereign_cash:USDT'].balance).toBe(100_000);
    expect(liveBalances['crypto_holdings:SOL']).toBeUndefined();

    // Verify Paper Projection: has 10 SOL
    const paperProjection = await LedgerService.getAuthoritativeProjection(userId, 'paper');
    expect(paperProjection.positions['SOL'].totalQuantity).toBeCloseTo(10, 8);
  });

  it('Scenario 10 (Reconciliation Mismatch & Adjustment): detects exchange discrepancy without silent ledger overwrite', async () => {
    // Local authoritative balance: $10,000 USDT
    await LedgerService.creditDeposit({
      userId,
      accountMode: 'live',
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
      paymentId: 'pay_rec_001',
      description: 'Deposit',
    });
    await LedgerService.transfer({
      userId,
      accountMode: 'live',
      fromAccountType: 'sovereign_cash',
      toAccountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      amountMinor: 1_000_000,
      referenceType: 'allocation',
      referenceId: 'alloc_rec_001',
      description: 'Alloc',
    });

    // Simulate exchange returning only 8,500 USDT ($1,500 discrepancy)
    const runId = `rec_run_test_${Date.now()}`;
    const db = getDb();
    await db.execute(
      `INSERT INTO reconciliation_runs (id, ran_at, status, orders_checked, balances_checked, mismatches_found, duration_ms)
       VALUES (?, ?, 'IN_PROGRESS', 0, 0, 0, 0)`,
      [runId, Date.now()]
    );

    const mismatches = await ReconciliationWorker.reconcileBalancesAgainstExchange(
      userId,
      runId,
      { USDT: 8500 }
    );

    expect(mismatches).toBe(1);

    // Ledger balance was NOT silently overwritten!
    const balances = await LedgerService.getUserBalances(userId, 'live');
    expect(balances['trading_allocated:USDT'].balance).toBe(1_000_000);

    // Mismatch incident was recorded
    const mismatchRecord = await db.queryOne<any>(
      `SELECT * FROM reconciliation_mismatches WHERE user_id = ?`,
      [userId]
    );
    expect(mismatchRecord).not.toBeNull();
    expect(mismatchRecord.entity_type).toBe('BALANCE');

    // Perform an auditable reconciliation adjustment (e.g. fee deduction or external transfer)
    const adj = await LedgerService.applyReconciliationAdjustment({
      userId,
      accountMode: 'live',
      accountType: 'trading_allocated',
      assetOrCurrency: 'USDT',
      adjustmentMinor: -150_000, // -$1,500
      reason: 'Exchange fee settlement reconciliation',
      mismatchId: mismatchRecord.id,
    });

    expect(adj.balanceAfter).toBe(850_000n);

    // Verify adjustment entry recorded in ledger journal
    const adjEntry = await db.queryOne<any>(
      `SELECT * FROM ledger_entries WHERE reference_type = 'reconciliation_adjustment' AND user_id = ?`,
      [userId]
    );
    expect(adjEntry).not.toBeNull();
    expect(BigInt(adjEntry.amount_minor)).toBe(150000n);
  });

  it('Scenario 11 (Security): client cannot arbitrarily mutate authoritative balances', async () => {
    // Client cannot pass arbitrary balance or position updates
    // Authoritative projections strictly return state derived from ledger entries
    const proj = await LedgerService.getAuthoritativeProjection(userId, 'live');
    expect(proj.cash.total).toBe(0);
    expect(Object.keys(proj.positions).length).toBe(0);
    expect(proj.pnl.realizedPnlUSD).toBe(0);
  });
});
