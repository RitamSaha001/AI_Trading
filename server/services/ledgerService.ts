import { DBClient, getDb } from '../db';
import { AuditService } from './auditService';
import {
  toCashMinor,
  toAssetMinor,
  fromCashMinor,
  fromAssetMinor,
  fromCashMinorToDisplayNumber,
  fromAssetMinorToDisplayNumber,
  getAssetDecimals,
  computeNotionalMinor,
  computeSoldCostBasis,
  ExactDecimal,
} from './precision';
import crypto from 'node:crypto';

export type LedgerAccountType =
  | 'sovereign_cash'       // Liquid cash in Sovereign Wallet
  | 'trading_allocated'   // Funds allocated to the active trading desk
  | 'crypto_holdings'     // Spot crypto asset lots held
  | 'equity_holdings'     // Cash & Carry / Demat equity holdings (for Indian equities)
  | 'asset_holdings'      // Generalized asset holdings (alias/superset)
  | 'reserve_escrow'      // Escrow for open orders or pending settlements
  | 'fee_treasury'        // System collected fees
  | 'realized_pnl'        // Realized P&L equity account
  | 'trading_clearing'    // Internal clearing account for double-entry multi-asset settlement
  | 'settlement_clearing' // External funding clearing account
  | 'reconciliation_clearing'; // Audit clearing account for reconciliation adjustments

export class UnbalancedLedgerTransactionError extends Error {
  readonly transactionId: string;
  readonly discrepancies: Record<string, bigint>;

  constructor(transactionId: string, discrepancies: Record<string, bigint>) {
    super(`Unbalanced ledger transaction ${transactionId}: ${JSON.stringify(discrepancies)}`);
    this.name = 'UnbalancedLedgerTransactionError';
    this.transactionId = transactionId;
    this.discrepancies = discrepancies;
  }
}

export interface LedgerAccountRecord {
  id: string;
  user_id: string;
  account_mode: 'live' | 'paper';
  account_type: LedgerAccountType;
  asset_or_currency: string;
  balance_minor: number | bigint;
  reserved_minor: number | bigint;
  created_at: number;
  updated_at: number;
}

export interface LedgerEntryRecord {
  id: string;
  transaction_id: string;
  account_id: string;
  user_id: string;
  account_mode: 'live' | 'paper';
  entry_type: 'debit' | 'credit';
  amount_minor: number | bigint;
  balance_after_minor: number | bigint;
  currency_or_asset: string;
  reference_type: string;
  reference_id: string;
  idempotency_key?: string;
  order_id?: string;
  fill_id?: string;
  description: string;
  created_at: number;
}

export interface AuthoritativePositionRecord {
  id: string;
  user_id: string;
  account_mode: 'live' | 'paper';
  asset: string;
  total_quantity_minor: number | bigint;
  reserved_quantity_minor: number | bigint;
  cost_basis_minor: number | bigint;
  realized_pnl_minor: number | bigint;
  total_fees_minor: number | bigint;
  created_at: number;
  updated_at: number;
}

export interface ProcessFillParams {
  userId: string;
  accountMode?: 'live' | 'paper';
  orderId: string;
  fillId: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  side: 'BUY' | 'SELL';
  price: number | string | ExactDecimal;
  quantity: number | string | ExactDecimal;
  fee?: number | string | ExactDecimal;
  feeAsset?: string;
  commissionStatus?: 'ESTIMATED' | 'AUTHORITATIVE' | 'PENDING' | 'UNRESOLVED';
  holdingsAccountType?: 'crypto_holdings' | 'equity_holdings' | 'asset_holdings';
  accountingEventId?: string;
  canonicalFillKey?: string;
  executedAt?: number;
  idempotencyKey?: string;
  tx?: DBClient;
}

export interface ProcessFillResult {
  alreadyProcessed: boolean;
  transactionId: string;
  cashBalanceAfterMinor: bigint;
  assetBalanceAfterMinor: bigint;
  feeMinor: bigint;
  realizedPnlMinor?: bigint;
  costBasisMinor?: bigint;
  totalQuantityMinor: bigint;
  priceExact?: string;
  quantityExact?: string;
  notionalExact?: string;
  feeExact?: string;
  realizedPnlExact?: string;
}

export interface AuthoritativeAccountProjection {
  userId: string;
  accountMode: 'live' | 'paper';
  cash: {
    totalMinor: bigint;
    reservedMinor: bigint;
    availableMinor: bigint;
    total: number;
    reserved: number;
    available: number;
    currency: string;
  };
  positions: Record<
    string,
    {
      asset: string;
      totalQuantityMinor: bigint;
      reservedQuantityMinor: bigint;
      availableQuantityMinor: bigint;
      totalQuantity: number;
      reservedQuantity: number;
      availableQuantity: number;
      costBasisMinor: bigint;
      costBasisUSD: number;
      avgCostBasisUSD: number;
      realizedPnlMinor: bigint;
      realizedPnlUSD: number;
      totalFeesMinor: bigint;
      totalFeesUSD: number;
    }
  >;
  pnl: {
    realizedPnlMinor: bigint;
    realizedPnlUSD: number;
    totalFeesMinor: bigint;
    totalFeesUSD: number;
  };
}

export interface ReplayVerificationResult {
  consistent: boolean;
  entriesCount: number;
  accountsReplayed: Record<string, bigint>;
  discrepancies: string[];
}

export class LedgerService {
  /**
   * Retrieves or creates a ledger account for a user, asset, and account mode in an ACID transaction.
   * Backward compatible with (userId, accountType, assetOrCurrency, db).
   */
  static async getOrCreateAccount(
    userId: string,
    accountType: LedgerAccountType,
    assetOrCurrency: string,
    modeOrDb?: 'live' | 'paper' | DBClient,
    maybeDb?: DBClient
  ): Promise<LedgerAccountRecord> {
    let accountMode: 'live' | 'paper' = 'live';
    let db: DBClient = getDb();

    if (typeof modeOrDb === 'string') {
      accountMode = modeOrDb;
      if (maybeDb) db = maybeDb;
    } else if (modeOrDb && typeof modeOrDb === 'object') {
      db = modeOrDb;
    }

    const existing = await db.queryOne<LedgerAccountRecord>(
      `SELECT * FROM ledger_accounts WHERE user_id = ? AND account_mode = ? AND account_type = ? AND asset_or_currency = ?`,
      [userId, accountMode, accountType, assetOrCurrency]
    );

    if (existing) return existing;

    const id = `acc_${userId.slice(0, 6)}_${accountMode}_${accountType}_${assetOrCurrency.toLowerCase()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = Date.now();

    try {
      await db.execute(
        `INSERT INTO ledger_accounts (
          id, user_id, account_mode, account_type, asset_or_currency, balance_minor, reserved_minor, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
        ON CONFLICT(user_id, account_mode, account_type, asset_or_currency) DO NOTHING`,
        [id, userId, accountMode, accountType, assetOrCurrency, now, now]
      );
    } catch {
      // In case of concurrency race
    }

    const created = await db.queryOne<LedgerAccountRecord>(
      `SELECT * FROM ledger_accounts WHERE user_id = ? AND account_mode = ? AND account_type = ? AND asset_or_currency = ?`,
      [userId, accountMode, accountType, assetOrCurrency]
    );

    return created!;
  }

  /**
   * Retrieves or creates an authoritative position projection record.
   */
  static async getOrCreateAuthoritativePosition(
    userId: string,
    accountMode: 'live' | 'paper',
    asset: string,
    db: DBClient = getDb()
  ): Promise<AuthoritativePositionRecord> {
    const existing = await db.queryOne<AuthoritativePositionRecord>(
      `SELECT * FROM authoritative_positions WHERE user_id = ? AND account_mode = ? AND asset = ?`,
      [userId, accountMode, asset]
    );
    if (existing) return existing;

    const id = `pos_${userId.slice(0, 6)}_${accountMode}_${asset.toLowerCase()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = Date.now();

    try {
      await db.execute(
        `INSERT INTO authoritative_positions (
          id, user_id, account_mode, asset, total_quantity_minor, reserved_quantity_minor,
          cost_basis_minor, realized_pnl_minor, total_fees_minor, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, ?, ?)
        ON CONFLICT(user_id, account_mode, asset) DO NOTHING`,
        [id, userId, accountMode, asset, now, now]
      );
    } catch {
      // Concurrency race
    }

    const created = await db.queryOne<AuthoritativePositionRecord>(
      `SELECT * FROM authoritative_positions WHERE user_id = ? AND account_mode = ? AND asset = ?`,
      [userId, accountMode, asset]
    );
    return created!;
  }

  /**
   * Acquires a row-level lock (SELECT ... FOR UPDATE) on a ledger account within a transaction
   * and returns the fresh authoritative record.
   */
  static async lockAccount(accountId: string, tx: DBClient): Promise<LedgerAccountRecord> {
    const row = await tx.queryOne<LedgerAccountRecord>(
      `SELECT * FROM ledger_accounts WHERE id = ? FOR UPDATE`,
      [accountId]
    );
    if (!row) {
      throw new Error(`Ledger account ${accountId} not found for row lock`);
    }
    return row;
  }

  /**
   * Deterministically locks multiple ledger accounts in sorted ID order within a transaction
   * to mathematically prevent deadlocks under high concurrency.
   * Returns a Map of accountId -> LedgerAccountRecord.
   */
  static async lockAccounts(accountIds: string[], tx: DBClient): Promise<Map<string, LedgerAccountRecord>> {
    const uniqueSorted = Array.from(new Set(accountIds)).sort();
    const map = new Map<string, LedgerAccountRecord>();
    for (const id of uniqueSorted) {
      const locked = await this.lockAccount(id, tx);
      map.set(id, locked);
    }
    return map;
  }

  /**
   * Executes a double-entry journal transaction moving funds between two accounts.
   */
  static async transfer(params: {
    userId: string;
    accountMode?: 'live' | 'paper';
    fromAccountType: LedgerAccountType;
    toAccountType: LedgerAccountType;
    assetOrCurrency: string;
    amountMinor: bigint | number;
    referenceType: string;
    referenceId: string;
    description: string;
    idempotencyKey?: string;
  }): Promise<{ transactionId: string; fromBalanceAfter: bigint; toBalanceAfter: bigint }> {
    const amount = BigInt(params.amountMinor);
    if (amount <= 0n) {
      throw new Error('Transfer amount must be strictly positive');
    }

    const accountMode = params.accountMode || 'live';
    const db = getDb();

    return db.transaction(async (tx) => {
      const fromAcc = await this.getOrCreateAccount(
        params.userId,
        params.fromAccountType,
        params.assetOrCurrency,
        accountMode,
        tx
      );
      const toAcc = await this.getOrCreateAccount(
        params.userId,
        params.toAccountType,
        params.assetOrCurrency,
        accountMode,
        tx
      );

      // Deterministically acquire row-level locks in sorted ID order to eliminate deadlocks and race conditions
      const lockedMap = await this.lockAccounts([fromAcc.id, toAcc.id], tx);
      const lockedFrom = lockedMap.get(fromAcc.id)!;
      const lockedTo = lockedMap.get(toAcc.id)!;

      const fromBal = BigInt(lockedFrom.balance_minor);
      const fromReserved = BigInt(lockedFrom.reserved_minor);
      const spendable = fromBal - fromReserved;

      if (spendable < amount) {
        throw new Error(
          `Insufficient spendable balance in ${params.fromAccountType}. Spendable: ${spendable.toString()}, required: ${amount.toString()}`
        );
      }

      const txId = `tx_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const now = Date.now();

      const newFromBal = fromBal - amount;
      const newToBal = BigInt(lockedTo.balance_minor) + amount;

      // Update From Account
      await tx.execute(
        `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
        [newFromBal, now, fromAcc.id]
      );

      // Record Debit Entry
      const debitEntryId = `ent_deb_${crypto.randomBytes(8).toString('hex')}`;
      await tx.execute(
        `INSERT INTO ledger_entries (
          id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
          balance_after_minor, currency_or_asset, reference_type, reference_id,
          idempotency_key, description, created_at
        ) VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          debitEntryId,
          txId,
          fromAcc.id,
          params.userId,
          accountMode,
          amount,
          newFromBal,
          params.assetOrCurrency,
          params.referenceType,
          params.referenceId,
          params.idempotencyKey || null,
          params.description || 'Internal allocation transfer',
          now,
        ]
      );

      // Update To Account
      await tx.execute(
        `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
        [newToBal, now, toAcc.id]
      );

      // Record Credit Entry
      const creditEntryId = `ent_crd_${crypto.randomBytes(8).toString('hex')}`;
      await tx.execute(
        `INSERT INTO ledger_entries (
          id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
          balance_after_minor, currency_or_asset, reference_type, reference_id,
          idempotency_key, description, created_at
        ) VALUES (?, ?, ?, ?, ?, 'credit', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          creditEntryId,
          txId,
          toAcc.id,
          params.userId,
          accountMode,
          amount,
          newToBal,
          params.assetOrCurrency,
          params.referenceType,
          params.referenceId,
          params.idempotencyKey || null,
          params.description || 'Internal allocation transfer',
          now,
        ]
      );

      await this.assertTransactionBalanced(tx, txId);

      await AuditService.logEvent({
        userId: params.userId,
        eventType: 'LEDGER_TRANSFER',
        source: 'ledger_service',
        actor: 'system',
        idempotencyKey: params.idempotencyKey,
        externalId: params.referenceId,
        metadata: {
          accountMode,
          fromAccount: params.fromAccountType,
          toAccount: params.toAccountType,
          asset: params.assetOrCurrency,
          amountMinor: amount,
          transactionId: txId,
        },
        result: 'SUCCESS',
      });

      return {
        transactionId: txId,
        fromBalanceAfter: newFromBal,
        toBalanceAfter: newToBal,
      };
    });
  }

  /**
   * Asserts that a double-entry transaction has balanced debits and credits per currency.
   * Throws UnbalancedLedgerTransactionError if sum(debits) !== sum(credits) for any asset.
   */
  static async assertTransactionBalanced(tx: DBClient, transactionId: string): Promise<void> {
    const entries = await tx.query<{
      entry_type: 'debit' | 'credit';
      amount_minor: number | bigint;
      currency_or_asset: string;
    }>(
      `SELECT entry_type, amount_minor, currency_or_asset FROM ledger_entries WHERE transaction_id = ?`,
      [transactionId]
    );

    if (entries.length === 0) {
      throw new Error(`Transaction ${transactionId} has no journal entries to verify balance`);
    }

    const netByAsset: Record<string, bigint> = {};
    for (const ent of entries) {
      const asset = ent.currency_or_asset;
      if (!netByAsset[asset]) {
        netByAsset[asset] = 0n;
      }
      const amount = BigInt(ent.amount_minor);
      if (ent.entry_type === 'credit') {
        netByAsset[asset] += amount;
      } else if (ent.entry_type === 'debit') {
        netByAsset[asset] -= amount;
      }
    }

    const discrepancies: Record<string, bigint> = {};
    for (const [asset, net] of Object.entries(netByAsset)) {
      if (net !== 0n) {
        discrepancies[asset] = net;
      }
    }

    if (Object.keys(discrepancies).length > 0) {
      throw new UnbalancedLedgerTransactionError(transactionId, discrepancies);
    }
  }

  /**
   * Credits a deposit directly into the user's sovereign cash ledger account.
   */
  static async creditDeposit(
    params: {
      userId: string;
      accountMode?: 'live' | 'paper';
      assetOrCurrency: string;
      amountMinor: bigint | number;
      paymentId: string;
      description: string;
      idempotencyKey?: string;
    },
    client?: DBClient
  ): Promise<{ transactionId: string; balanceAfter: bigint }> {
    const amount = BigInt(params.amountMinor);
    if (amount <= 0n) {
      throw new Error('Deposit amount must be strictly positive');
    }

    const accountMode = params.accountMode || 'live';

    const runner = async (tx: DBClient) => {
      const clearingAcc = await this.getOrCreateAccount(
        params.userId,
        'settlement_clearing',
        params.assetOrCurrency,
        accountMode,
        tx
      );
      const acc = await this.getOrCreateAccount(
        params.userId,
        'sovereign_cash',
        params.assetOrCurrency,
        accountMode,
        tx
      );

      // Deterministically acquire row-level locks in sorted ID order
      const lockedMap = await this.lockAccounts([clearingAcc.id, acc.id], tx);
      const lockedClearing = lockedMap.get(clearingAcc.id)!;
      const lockedAcc = lockedMap.get(acc.id)!;

      const txId = `dep_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const now = Date.now();

      // 1. Debit Settlement Clearing (External Funding Source)
      const currentClearingBal = BigInt(lockedClearing.balance_minor);
      const newClearingBal = currentClearingBal - amount;
      await tx.execute(
        `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
        [newClearingBal, now, clearingAcc.id]
      );

      const debitEntryId = `ent_deb_${crypto.randomBytes(8).toString('hex')}`;
      await tx.execute(
        `INSERT INTO ledger_entries (
          id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
          balance_after_minor, currency_or_asset, reference_type, reference_id,
          idempotency_key, description, created_at
        ) VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?, 'deposit_source', ?, ?, ?, ?)`,
        [
          debitEntryId,
          txId,
          clearingAcc.id,
          params.userId,
          accountMode,
          amount,
          newClearingBal,
          params.assetOrCurrency,
          params.paymentId,
          params.idempotencyKey ? `${params.idempotencyKey}_clearing` : null,
          `External settlement clearing for deposit ${params.paymentId}`,
          now,
        ]
      );

      // 2. Credit Sovereign Cash
      const currentBal = BigInt(lockedAcc.balance_minor);
      const newBal = currentBal + amount;

      await tx.execute(
        `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
        [newBal, now, acc.id]
      );

      const entryId = `ent_crd_${crypto.randomBytes(8).toString('hex')}`;
      await tx.execute(
        `INSERT INTO ledger_entries (
          id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
          balance_after_minor, currency_or_asset, reference_type, reference_id,
          idempotency_key, description, created_at
        ) VALUES (?, ?, ?, ?, ?, 'credit', ?, ?, ?, 'deposit', ?, ?, ?, ?)`,
        [
          entryId,
          txId,
          acc.id,
          params.userId,
          accountMode,
          amount,
          newBal,
          params.assetOrCurrency,
          params.paymentId,
          params.idempotencyKey || null,
          params.description || 'Deposit credited',
          now,
        ]
      );

      await this.assertTransactionBalanced(tx, txId);

      await AuditService.logEvent({
        userId: params.userId,
        eventType: 'LEDGER_DEPOSIT_CREDITED',
        source: 'payment_settlement',
        actor: 'system',
        idempotencyKey: params.idempotencyKey,
        externalId: params.paymentId,
        metadata: {
          accountMode,
          asset: params.assetOrCurrency,
          amountMinor: amount,
          newBalanceMinor: newBal,
        },
        result: 'SUCCESS',
      });

      return { transactionId: txId, balanceAfter: newBal };
    };

    if (client) {
      return runner(client);
    }
    return getDb().transaction(runner);
  }

  /**
   * Safely checks the available unreserved balance for a user in sovereign_cash without debiting.
   */
  static async getAvailableUnreservedBalance(
    userId: string,
    assetOrCurrency: string,
    accountMode: 'live' | 'paper' = 'live',
    client?: DBClient
  ): Promise<bigint> {
    const db = client || getDb();
    const acc = await db.queryOne<LedgerAccountRecord>(
      `SELECT * FROM ledger_accounts WHERE user_id = ? AND account_type = 'sovereign_cash' AND asset_or_currency = ? AND account_mode = ?`,
      [userId, assetOrCurrency, accountMode]
    );
    if (!acc) return 0n;
    const bal = BigInt(acc.balance_minor);
    const res = BigInt(acc.reserved_minor);
    return bal > res ? bal - res : 0n;
  }

  /**
   * Economically reserves sovereign cash before an external refund is initiated.
   * Prevents double-spending while external provider refund is in-flight or in REFUND_UNKNOWN.
   */
  static async reserveRefundCash(
    params: {
      userId: string;
      assetOrCurrency: string;
      amountMinor: bigint | number;
      accountMode?: 'live' | 'paper';
      refundId: string;
      description?: string;
    },
    client?: DBClient
  ): Promise<void> {
    const amount = BigInt(params.amountMinor);
    if (amount <= 0n) {
      throw new Error('Reservation amount must be strictly positive');
    }
    const accountMode = params.accountMode || 'live';

    const runner = async (tx: DBClient) => {
      const acc = await this.getOrCreateAccount(
        params.userId,
        'sovereign_cash',
        params.assetOrCurrency,
        accountMode,
        tx
      );

      const lockedAcc = await this.lockAccount(acc.id, tx);
      const bal = BigInt(lockedAcc.balance_minor);
      const res = BigInt(lockedAcc.reserved_minor);
      if (bal - res < amount) {
        throw new Error(
          `Insufficient unreserved balance for refund reservation: available ${(bal - res).toString()}, requested ${amount.toString()}`
        );
      }

      const newReserved = res + amount;
      await tx.execute(
        `UPDATE ledger_accounts SET reserved_minor = ?, updated_at = ? WHERE id = ?`,
        [newReserved, Date.now(), acc.id]
      );

      await AuditService.logEvent({
        userId: params.userId,
        eventType: 'REFUND_CASH_RESERVED',
        source: 'payment_refund',
        actor: 'system',
        externalId: params.refundId,
        metadata: {
          accountMode,
          asset: params.assetOrCurrency,
          amountMinor: amount,
          newReservedMinor: newReserved,
        },
        result: 'SUCCESS',
      });
    };

    if (client) return runner(client);
    return getDb().transaction(runner);
  }

  /**
   * Releases an economic refund cash reservation if external provider refund fails.
   */
  static async releaseRefundCashReservation(
    params: {
      userId: string;
      assetOrCurrency: string;
      amountMinor: bigint | number;
      accountMode?: 'live' | 'paper';
      refundId: string;
    },
    client?: DBClient
  ): Promise<void> {
    const amount = BigInt(params.amountMinor);
    if (amount <= 0n) return;
    const accountMode = params.accountMode || 'live';

    const runner = async (tx: DBClient) => {
      const acc = await this.getOrCreateAccount(
        params.userId,
        'sovereign_cash',
        params.assetOrCurrency,
        accountMode,
        tx
      );

      const lockedAcc = await this.lockAccount(acc.id, tx);
      const res = BigInt(lockedAcc.reserved_minor);
      const newReserved = res > amount ? res - amount : 0n;

      await tx.execute(
        `UPDATE ledger_accounts SET reserved_minor = ?, updated_at = ? WHERE id = ?`,
        [newReserved, Date.now(), acc.id]
      );

      await AuditService.logEvent({
        userId: params.userId,
        eventType: 'REFUND_CASH_RESERVATION_RELEASED',
        source: 'payment_refund',
        actor: 'system',
        externalId: params.refundId,
        metadata: {
          accountMode,
          asset: params.assetOrCurrency,
          amountMinor: amount,
          newReservedMinor: newReserved,
        },
        result: 'SUCCESS',
      });
    };

    if (client) return runner(client);
    return getDb().transaction(runner);
  }

  /**
   * Debits a refund from the user's sovereign cash ledger account.
   * Reverse of creditDeposit: debits sovereign_cash, credits settlement_clearing.
   * If isReserved is true, also releases the reservation on reserved_minor.
   */
  static async debitRefund(
    params: {
      userId: string;
      accountMode?: 'live' | 'paper';
      assetOrCurrency: string;
      amountMinor: bigint | number;
      refundId: string;
      description: string;
      idempotencyKey?: string;
      isReserved?: boolean;
    },
    client?: DBClient
  ): Promise<{ transactionId: string; balanceAfter: bigint }> {
    const amount = BigInt(params.amountMinor);
    if (amount <= 0n) {
      throw new Error('Refund amount must be strictly positive');
    }

    const accountMode = params.accountMode || 'live';

    const runner = async (tx: DBClient) => {
      const clearingAcc = await this.getOrCreateAccount(
        params.userId,
        'settlement_clearing',
        params.assetOrCurrency,
        accountMode,
        tx
      );
      const acc = await this.getOrCreateAccount(
        params.userId,
        'sovereign_cash',
        params.assetOrCurrency,
        accountMode,
        tx
      );

      // Deterministically acquire row-level locks in sorted ID order
      const lockedMap = await this.lockAccounts([acc.id, clearingAcc.id], tx);
      const lockedAcc = lockedMap.get(acc.id)!;
      const lockedClearing = lockedMap.get(clearingAcc.id)!;

      const txId = `ref_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const now = Date.now();

      const currentBal = BigInt(lockedAcc.balance_minor);
      const reserved = BigInt(lockedAcc.reserved_minor);

      if (params.isReserved) {
        if (currentBal < amount) {
          throw new Error('Insufficient balance for refund debit');
        }
      } else {
        if (currentBal - reserved < amount) {
          throw new Error('Insufficient unreserved balance for refund debit');
        }
      }

      // 1. Debit Sovereign Cash (and consume reservation if previously reserved)
      const newBal = currentBal - amount;
      const newReserved = params.isReserved ? (reserved >= amount ? reserved - amount : 0n) : reserved;
      await tx.execute(
        `UPDATE ledger_accounts SET balance_minor = ?, reserved_minor = ?, updated_at = ? WHERE id = ?`,
        [newBal, newReserved, now, acc.id]
      );

      const debitEntryId = `ent_deb_${crypto.randomBytes(8).toString('hex')}`;
      await tx.execute(
        `INSERT INTO ledger_entries (
          id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
          balance_after_minor, currency_or_asset, reference_type, reference_id,
          idempotency_key, description, created_at
        ) VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?, 'refund_debit', ?, ?, ?, ?)`,
        [
          debitEntryId,
          txId,
          acc.id,
          params.userId,
          accountMode,
          amount,
          newBal,
          params.assetOrCurrency,
          params.refundId,
          params.idempotencyKey || null,
          params.description,
          now,
        ]
      );

      // 2. Credit Settlement Clearing
      const currentClearingBal = BigInt(lockedClearing.balance_minor);
      const newClearingBal = currentClearingBal + amount;
      await tx.execute(
        `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
        [newClearingBal, now, clearingAcc.id]
      );

      const creditEntryId = `ent_crd_${crypto.randomBytes(8).toString('hex')}`;
      await tx.execute(
        `INSERT INTO ledger_entries (
          id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
          balance_after_minor, currency_or_asset, reference_type, reference_id,
          idempotency_key, description, created_at
        ) VALUES (?, ?, ?, ?, ?, 'credit', ?, ?, ?, 'refund_source', ?, ?, ?, ?)`,
        [
          creditEntryId,
          txId,
          clearingAcc.id,
          params.userId,
          accountMode,
          amount,
          newClearingBal,
          params.assetOrCurrency,
          params.refundId,
          params.idempotencyKey ? `${params.idempotencyKey}_clearing` : null,
          `External settlement clearing for refund ${params.refundId}`,
          now,
        ]
      );

      await this.assertTransactionBalanced(tx, txId);

      await AuditService.logEvent({
        userId: params.userId,
        eventType: 'LEDGER_REFUND_DEBITED',
        source: 'payment_refund',
        actor: 'system',
        idempotencyKey: params.idempotencyKey,
        externalId: params.refundId,
        metadata: {
          accountMode,
          asset: params.assetOrCurrency,
          amountMinor: amount.toString(),
          newBalanceMinor: newBal.toString(),
        },
        result: 'SUCCESS',
      });

      return { transactionId: txId, balanceAfter: newBal };
    };

    if (client) {
      return runner(client);
    }
    return getDb().transaction(runner);
  }

  /**
   * Atomically reserves capital for an open order so concurrent orders cannot overspend.
   */
  static async reserveBalance(params: {
    userId: string;
    accountMode?: 'live' | 'paper';
    accountType: LedgerAccountType;
    assetOrCurrency: string;
    amountMinor: bigint | number;
    referenceId: string;
  }): Promise<boolean> {
    const amount = BigInt(params.amountMinor);
    if (amount <= 0n) return true;

    const accountMode = params.accountMode || 'live';
    const db = getDb();

    return db.transaction(async (tx) => {
      const acc = await this.getOrCreateAccount(
        params.userId,
        params.accountType,
        params.assetOrCurrency,
        accountMode,
        tx
      );

      const lockedAcc = await this.lockAccount(acc.id, tx);
      const bal = BigInt(lockedAcc.balance_minor);
      const reserved = BigInt(lockedAcc.reserved_minor);
      const free = bal - reserved;

      if (free < amount) {
        throw new Error(
          `Insufficient free balance to reserve in ${params.accountType}: free ${free.toString()}, requested ${amount.toString()}`
        );
      }

      const newReserved = reserved + amount;
      const now = Date.now();

      await tx.execute(
        `UPDATE ledger_accounts SET reserved_minor = ?, updated_at = ? WHERE id = ?`,
        [newReserved, now, acc.id]
      );

      return true;
    });
  }

  /**
   * Releases an existing reservation back to free balance.
   */
  static async releaseReservation(params: {
    userId: string;
    accountMode?: 'live' | 'paper';
    accountType: LedgerAccountType;
    assetOrCurrency: string;
    amountMinor: bigint | number;
    referenceId: string;
  }): Promise<boolean> {
    const amount = BigInt(params.amountMinor);
    if (amount <= 0n) return true;

    const accountMode = params.accountMode || 'live';
    const db = getDb();

    return db.transaction(async (tx) => {
      const acc = await this.getOrCreateAccount(
        params.userId,
        params.accountType,
        params.assetOrCurrency,
        accountMode,
        tx
      );

      const lockedAcc = await this.lockAccount(acc.id, tx);
      const currentReserved = BigInt(lockedAcc.reserved_minor);
      const newReserved = currentReserved >= amount ? currentReserved - amount : 0n;
      const now = Date.now();

      await tx.execute(
        `UPDATE ledger_accounts SET reserved_minor = ?, updated_at = ? WHERE id = ?`,
        [newReserved, now, acc.id]
      );

      return true;
    });
  }

  /**
   * Persistent order reservation: creates an auditable record in order_reservations
   * and increments ledger_accounts.reserved_minor in an ACID transaction.
   */
  static async reserveOrderFunds(params: {
    userId: string;
    orderId: string;
    accountMode?: 'live' | 'paper';
    accountType: LedgerAccountType;
    assetOrCurrency: string;
    amountMinor: bigint | number;
    tx?: DBClient;
  }): Promise<void> {
    const amount = BigInt(params.amountMinor);
    if (amount <= 0n) return;

    const accountMode = params.accountMode || 'live';
    const executeInTx = async (tx: DBClient) => {
      const acc = await this.getOrCreateAccount(
        params.userId,
        params.accountType,
        params.assetOrCurrency,
        accountMode,
        tx
      );

      const lockedAcc = await this.lockAccount(acc.id, tx);
      const bal = BigInt(lockedAcc.balance_minor);
      const reserved = BigInt(lockedAcc.reserved_minor);
      const free = bal - reserved;

      if (free < amount) {
        throw new Error(
          `Insufficient free balance to reserve in ${params.accountType}: free ${free.toString()}, requested ${amount.toString()}`
        );
      }

      const newReserved = reserved + amount;
      const now = Date.now();

      await tx.execute(
        `UPDATE ledger_accounts SET reserved_minor = ?, updated_at = ? WHERE id = ?`,
        [newReserved, now, acc.id]
      );

      const resId = `res_${params.orderId}_${crypto.randomBytes(4).toString('hex')}`;
      await tx.execute(
        `INSERT INTO order_reservations (
          id, order_id, account_id, user_id, account_mode, asset_or_currency,
          amount_minor, consumed_minor, released_minor, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'ACTIVE', ?, ?)`,
        [
          resId,
          params.orderId,
          acc.id,
          params.userId,
          accountMode,
          params.assetOrCurrency,
          amount,
          now,
          now,
        ]
      );

      if (params.accountType === 'trading_allocated') {
        await tx.execute(
          `UPDATE exchange_orders SET reserved_cash_minor = ?, reserved_cash = 0.0 WHERE client_order_id = ?`,
          [amount, params.orderId]
        );
      } else if (params.accountType === 'crypto_holdings' || params.accountType === 'equity_holdings' || params.accountType === 'asset_holdings') {
        await tx.execute(
          `UPDATE exchange_orders SET reserved_qty_minor = ?, reserved_qty = 0.0 WHERE client_order_id = ?`,
          [amount, params.orderId]
        );
      }
    };

    if (params.tx) {
      await executeInTx(params.tx);
    } else {
      await getDb().transaction(executeInTx);
    }
  }

  /**
   * Consumes an active order reservation during fill settlement, ensuring no double-consumption.
   */
  static async consumeOrderReservation(params: {
    orderId: string;
    accountId?: string;
    amountMinor: bigint | number;
    tx: DBClient;
  }): Promise<{ consumedMinor: bigint }> {
    const amount = BigInt(params.amountMinor);
    if (amount <= 0n) return { consumedMinor: 0n };

    let reservation: any;
    if (params.accountId) {
      reservation = await params.tx.queryOne<any>(
        `SELECT * FROM order_reservations WHERE order_id = ? AND account_id = ? AND status IN ('ACTIVE', 'PARTIALLY_CONSUMED') FOR UPDATE`,
        [params.orderId, params.accountId]
      );
    } else {
      reservation = await params.tx.queryOne<any>(
        `SELECT * FROM order_reservations WHERE order_id = ? AND status IN ('ACTIVE', 'PARTIALLY_CONSUMED') FOR UPDATE`,
        [params.orderId]
      );
    }

    if (!reservation) {
      return { consumedMinor: 0n };
    }

    const totalAmount = BigInt(reservation.amount_minor);
    const alreadyConsumed = BigInt(reservation.consumed_minor);
    const alreadyReleased = BigInt(reservation.released_minor);
    const available = totalAmount - alreadyConsumed - alreadyReleased;

    const toConsume = amount < available ? amount : available;
    if (toConsume <= 0n) return { consumedMinor: 0n };

    const newConsumed = alreadyConsumed + toConsume;
    const isFullySettled = (newConsumed + alreadyReleased) >= totalAmount;
    const newStatus = isFullySettled ? 'CONSUMED' : 'PARTIALLY_CONSUMED';
    const now = Date.now();

    await params.tx.execute(
      `UPDATE order_reservations SET consumed_minor = ?, status = ?, updated_at = ? WHERE id = ?`,
      [newConsumed, newStatus, now, reservation.id]
    );

    const lockedAcc = await this.lockAccount(reservation.account_id, params.tx);
    if (lockedAcc) {
      const currentReserved = BigInt(lockedAcc.reserved_minor);
      const newReserved = currentReserved >= toConsume ? currentReserved - toConsume : 0n;
      await params.tx.execute(
        `UPDATE ledger_accounts SET reserved_minor = ?, updated_at = ? WHERE id = ?`,
        [newReserved, now, lockedAcc.id]
      );
    }

    return { consumedMinor: toConsume };
  }

  /**
   * Releases any remaining unconsumed reservation for an order back to available balance.
   */
  static async releaseOrderReservation(
    paramsOrOrderId: {
      orderId: string;
      tx?: DBClient;
    } | string
  ): Promise<{ releasedMinor: bigint }> {
    const params = typeof paramsOrOrderId === 'string' ? { orderId: paramsOrOrderId } : paramsOrOrderId;
    const executeInTx = async (tx: DBClient): Promise<{ releasedMinor: bigint }> => {
      const reservations = await tx.query<any>(
        `SELECT * FROM order_reservations WHERE order_id = ? AND status IN ('ACTIVE', 'PARTIALLY_CONSUMED') FOR UPDATE`,
        [params.orderId]
      );

      let totalReleased = 0n;
      const now = Date.now();

      for (const res of reservations) {
        const totalAmount = BigInt(res.amount_minor);
        const consumed = BigInt(res.consumed_minor);
        const alreadyReleased = BigInt(res.released_minor);
        const unconsumed = totalAmount - consumed - alreadyReleased;

        if (unconsumed > 0n) {
          const newReleased = alreadyReleased + unconsumed;
          const newStatus = consumed > 0n ? 'PARTIALLY_CONSUMED' : 'RELEASED';
          await tx.execute(
            `UPDATE order_reservations SET released_minor = ?, status = ?, updated_at = ? WHERE id = ?`,
            [newReleased, newStatus, now, res.id]
          );

          const lockedAcc = await this.lockAccount(res.account_id, tx);
          if (lockedAcc) {
            const currentReserved = BigInt(lockedAcc.reserved_minor);
            const newReserved = currentReserved >= unconsumed ? currentReserved - unconsumed : 0n;
            await tx.execute(
              `UPDATE ledger_accounts SET reserved_minor = ?, updated_at = ? WHERE id = ?`,
              [newReserved, now, lockedAcc.id]
            );
          }

          totalReleased += unconsumed;
        }
      }

      await tx.execute(
        `UPDATE exchange_orders SET reserved_cash = 0.0, reserved_qty = 0.0, reserved_cash_minor = 0, reserved_qty_minor = 0 WHERE client_order_id = ?`,
        [params.orderId]
      );

      return { releasedMinor: totalReleased };
    };

    if (params.tx) {
      return executeInTx(params.tx);
    } else {
      return getDb().transaction(executeInTx);
    }
  }

  /**
   * Processes a validated exchange execution fill into the double-entry ledger with strict idempotency.
   */
  static async processFill(params: ProcessFillParams): Promise<ProcessFillResult> {
    const accountMode = params.accountMode || 'live';
    const accountingEventId =
      params.accountingEventId || `settlement:binance:${params.userId}:${params.symbol}:${params.fillId}`;
    const idempKey =
      params.idempotencyKey || `fill_${accountMode}_${params.orderId}_${params.fillId}`;

    const db = getDb();

    // Perform ACID Fill Accounting with strict transactional idempotency check
    const executeInTx = async (tx: DBClient) => {
      // 1. Strict Server-Side Idempotency Check inside transaction via accounting_events and ledger_entries
      const existingEvent = await tx.queryOne<{ event_id: string; transaction_id: string }>(
        `SELECT event_id, transaction_id FROM accounting_events WHERE event_id = ?`,
        [accountingEventId]
      );

      const existingEntry = await tx.queryOne<LedgerEntryRecord>(
        `SELECT * FROM ledger_entries WHERE idempotency_key = ? OR (user_id = ? AND order_id = ? AND reference_type = 'trade_fill' AND fill_id = ? AND account_mode = ?)`,
        [idempKey, params.userId, params.orderId, params.fillId, accountMode]
      );

      if (existingEvent || existingEntry) {
        // Already processed! Return current authoritative account state without duplicate accounting
        const holdingAccType: LedgerAccountType =
          params.holdingsAccountType || (params.quoteAsset === 'INR' ? 'equity_holdings' : 'crypto_holdings');
        const cashAcc = await this.getOrCreateAccount(
          params.userId,
          'trading_allocated',
          params.quoteAsset,
          accountMode,
          tx
        );
        const assetAcc = await this.getOrCreateAccount(
          params.userId,
          holdingAccType,
          params.baseAsset,
          accountMode,
          tx
        );
        const pos = await this.getOrCreateAuthoritativePosition(
          params.userId,
          accountMode,
          params.baseAsset,
          tx
        );

        return {
          alreadyProcessed: true,
          transactionId: existingEvent?.transaction_id || existingEntry?.transaction_id || '',
          cashBalanceAfterMinor: BigInt(cashAcc.balance_minor),
          assetBalanceAfterMinor: BigInt(assetAcc.balance_minor),
          feeMinor: 0n,
          costBasisMinor: BigInt(pos.cost_basis_minor),
          realizedPnlMinor: BigInt(pos.realized_pnl_minor),
          totalQuantityMinor: BigInt(pos.total_quantity_minor),
        };
      }

      const priceDec = params.price instanceof ExactDecimal ? params.price : ExactDecimal.from(params.price);
      const qtyDec = params.quantity instanceof ExactDecimal ? params.quantity : ExactDecimal.from(params.quantity);
      const notionalDec = priceDec.mul(qtyDec);

      const priceExact = priceDec.toString();
      const quantityExact = qtyDec.toString();
      const notionalExact = notionalDec.toString();

      const notionalCashMinor = notionalDec.toMinor(2);
      const assetDecimals = getAssetDecimals(params.baseAsset);
      const qtyAssetMinor = qtyDec.toMinor(assetDecimals);

      const feeAsset = params.feeAsset || params.quoteAsset;
      let feeDec: ExactDecimal;
      let feeMinor: bigint;

      if (params.fee !== undefined && params.fee !== null) {
        feeDec = params.fee instanceof ExactDecimal ? params.fee : ExactDecimal.from(params.fee);
        feeMinor = feeDec.toMinor(getAssetDecimals(feeAsset));
      } else if (accountMode === 'paper') {
        feeDec = ExactDecimal.zero();
        feeMinor = 0n;
      } else {
        const holdingAccType: LedgerAccountType =
          params.holdingsAccountType || (params.quoteAsset === 'INR' ? 'equity_holdings' : 'crypto_holdings');
        if (params.side === 'BUY') {
          const cashAccCheck = await this.getOrCreateAccount(
            params.userId,
            'trading_allocated',
            params.quoteAsset,
            accountMode,
            tx
          );
          const currentCashBal = BigInt(cashAccCheck.balance_minor);
          if (currentCashBal < notionalCashMinor) {
            throw new Error(
              `Insufficient cash balance to settle fill: current ${currentCashBal.toString()}, needed ${notionalCashMinor.toString()}`
            );
          }
        } else {
          const assetAccCheck = await this.getOrCreateAccount(
            params.userId,
            holdingAccType,
            params.baseAsset,
            accountMode,
            tx
          );
          const currentAssetBal = BigInt(assetAccCheck.balance_minor);
          if (currentAssetBal < qtyAssetMinor) {
            throw new Error(
              `Insufficient asset balance to settle sell fill: current ${currentAssetBal.toString()}, needed ${qtyAssetMinor.toString()}`
            );
          }
        }
        throw new Error(
          `Cannot settle fill ${params.fillId} for order ${params.orderId}: authoritative commission fee is required. Estimated or fallback fees are forbidden.`
        );
      }
      const feeExact = feeDec.toString();

      const txId = `tx_fill_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const now = params.executedAt || Date.now();

      // Relevant user accounts
      const holdingAccType: LedgerAccountType =
        params.holdingsAccountType || (params.quoteAsset === 'INR' ? 'equity_holdings' : 'crypto_holdings');
      const cashAcc = await this.getOrCreateAccount(
        params.userId,
        'trading_allocated',
        params.quoteAsset,
        accountMode,
        tx
      );
      const assetAcc = await this.getOrCreateAccount(
        params.userId,
        holdingAccType,
        params.baseAsset,
        accountMode,
        tx
      );
      const feeTreasuryAcc = await this.getOrCreateAccount(
        params.userId,
        'fee_treasury',
        feeAsset,
        accountMode,
        tx
      );
      const clearingQuoteAcc = await this.getOrCreateAccount(
        params.userId,
        'trading_clearing',
        params.quoteAsset,
        accountMode,
        tx
      );
      const clearingBaseAcc = await this.getOrCreateAccount(
        params.userId,
        'trading_clearing',
        params.baseAsset,
        accountMode,
        tx
      );

      // Deterministically acquire row-level locks on all involved accounts in sorted ID order
      const lockedAccs = await this.lockAccounts(
        [cashAcc.id, assetAcc.id, feeTreasuryAcc.id, clearingQuoteAcc.id, clearingBaseAcc.id],
        tx
      );
      const lockedCash = lockedAccs.get(cashAcc.id)!;
      const lockedAsset = lockedAccs.get(assetAcc.id)!;
      const lockedTreasury = lockedAccs.get(feeTreasuryAcc.id)!;
      const lockedClearingQuote = lockedAccs.get(clearingQuoteAcc.id)!;
      const lockedClearingBase = lockedAccs.get(clearingBaseAcc.id)!;

      const pos = await this.getOrCreateAuthoritativePosition(
        params.userId,
        accountMode,
        params.baseAsset,
        tx
      );

      let newCashBal: bigint;
      let newAssetBal: bigint;
      let realizedPnlMinor: bigint | undefined;
      let realizedPnlExact: string | undefined;
      let newCostBasisMinor: bigint;
      let newTotalQtyMinor: bigint;

      if (params.side === 'BUY') {
        const totalCashNeeded = feeAsset === params.quoteAsset ? (notionalCashMinor + feeMinor) : notionalCashMinor;
        const currentCashBal = BigInt(lockedCash.balance_minor);

        if (currentCashBal < totalCashNeeded) {
          throw new Error(
            `Insufficient cash balance to settle fill: current ${currentCashBal.toString()}, needed ${totalCashNeeded.toString()}`
          );
        }

        // Consume order reservation
        const { consumedMinor } = await this.consumeOrderReservation({
          orderId: params.orderId,
          accountId: cashAcc.id,
          amountMinor: totalCashNeeded,
          tx,
        });

        // Refresh account to get updated reserved_minor from consumeOrderReservation
        const refreshedCashAcc = await tx.queryOne<LedgerAccountRecord>(
          `SELECT * FROM ledger_accounts WHERE id = ?`,
          [cashAcc.id]
        );
        let currentReserved = BigInt(refreshedCashAcc?.reserved_minor ?? 0);
        if (consumedMinor === 0n && currentReserved > 0n) {
          const directRelease = currentReserved >= totalCashNeeded ? totalCashNeeded : currentReserved;
          currentReserved -= directRelease;
        }

        newCashBal = currentCashBal - totalCashNeeded;
        await tx.execute(
          `UPDATE ledger_accounts SET balance_minor = ?, reserved_minor = ?, updated_at = ? WHERE id = ?`,
          [newCashBal, currentReserved, now, cashAcc.id]
        );

        // 1. Quote Leg (Notional): Debit user cash, Credit trading clearing
        await tx.execute(
          `INSERT INTO ledger_entries (
            id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
            balance_after_minor, currency_or_asset, reference_type, reference_id,
            idempotency_key, order_id, fill_id, description, created_at
          ) VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?, 'trade_fill', ?, ?, ?, ?, ?, ?)`,
          [
            `ent_deb_csh_${crypto.randomBytes(8).toString('hex')}`,
            txId,
            cashAcc.id,
            params.userId,
            accountMode,
            notionalCashMinor,
            currentCashBal - notionalCashMinor,
            params.quoteAsset,
            params.orderId,
            idempKey,
            params.orderId,
            params.fillId,
            `BUY ${quantityExact} ${params.baseAsset} @ ${priceExact} ${params.quoteAsset}`,
            now,
          ]
        );

        const currentClearingQuoteBal = BigInt(clearingQuoteAcc.balance_minor);
        const newClearingQuoteBal = currentClearingQuoteBal + notionalCashMinor;
        await tx.execute(
          `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
          [newClearingQuoteBal, now, clearingQuoteAcc.id]
        );
        await tx.execute(
          `INSERT INTO ledger_entries (
            id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
            balance_after_minor, currency_or_asset, reference_type, reference_id,
            idempotency_key, order_id, fill_id, description, created_at
          ) VALUES (?, ?, ?, ?, ?, 'credit', ?, ?, ?, 'trading_clearing', ?, ?, ?, ?, ?, ?)`,
          [
            `ent_crd_clr_q_${crypto.randomBytes(8).toString('hex')}`,
            txId,
            clearingQuoteAcc.id,
            params.userId,
            accountMode,
            notionalCashMinor,
            newClearingQuoteBal,
            params.quoteAsset,
            params.orderId,
            idempKey ? `${idempKey}_clr_q` : null,
            params.orderId,
            null,
            `Clearing quote proceeds for BUY ${params.orderId}`,
            now,
          ]
        );

        // 2. Base Leg (Quantity): Debit trading clearing, Credit user asset
        const currentClearingBaseBal = BigInt(clearingBaseAcc.balance_minor);
        const newClearingBaseBal = currentClearingBaseBal - qtyAssetMinor;
        await tx.execute(
          `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
          [newClearingBaseBal, now, clearingBaseAcc.id]
        );
        await tx.execute(
          `INSERT INTO ledger_entries (
            id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
            balance_after_minor, currency_or_asset, reference_type, reference_id,
            idempotency_key, order_id, fill_id, description, created_at
          ) VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?, 'trading_clearing', ?, ?, ?, ?, ?, ?)`,
          [
            `ent_deb_clr_b_${crypto.randomBytes(8).toString('hex')}`,
            txId,
            clearingBaseAcc.id,
            params.userId,
            accountMode,
            qtyAssetMinor,
            newClearingBaseBal,
            params.baseAsset,
            params.orderId,
            idempKey ? `${idempKey}_clr_b` : null,
            params.orderId,
            null,
            `Clearing base quantity for BUY ${params.orderId}`,
            now,
          ]
        );

        const currentAssetBal = BigInt(assetAcc.balance_minor);
        newAssetBal = currentAssetBal + qtyAssetMinor;
        await tx.execute(
          `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
          [newAssetBal, now, assetAcc.id]
        );
        await tx.execute(
          `INSERT INTO ledger_entries (
            id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
            balance_after_minor, currency_or_asset, reference_type, reference_id,
            idempotency_key, order_id, fill_id, description, created_at
          ) VALUES (?, ?, ?, ?, ?, 'credit', ?, ?, ?, 'trade_fill', ?, ?, ?, ?, ?, ?)`,
          [
            `ent_crd_ast_${crypto.randomBytes(8).toString('hex')}`,
            txId,
            assetAcc.id,
            params.userId,
            accountMode,
            qtyAssetMinor,
            newAssetBal,
            params.baseAsset,
            params.orderId,
            idempKey,
            params.orderId,
            params.fillId,
            `Acquired ${quantityExact} ${params.baseAsset}`,
            now,
          ]
        );

        // 3. Fee Leg (Debit fee payer account, Credit fee treasury)
        if (feeMinor > 0n) {
          const currentTreasuryBal = BigInt(feeTreasuryAcc.balance_minor);
          const newTreasuryBal = currentTreasuryBal + feeMinor;
          await tx.execute(
            `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
            [newTreasuryBal, now, feeTreasuryAcc.id]
          );

          if (feeAsset === params.quoteAsset) {
            await tx.execute(
              `INSERT INTO ledger_entries (
                id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
                balance_after_minor, currency_or_asset, reference_type, reference_id,
                idempotency_key, order_id, fill_id, description, created_at
              ) VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?, 'fee', ?, ?, ?, ?, ?, ?)`,
              [
                `ent_deb_fee_${crypto.randomBytes(8).toString('hex')}`,
                txId,
                cashAcc.id,
                params.userId,
                accountMode,
                feeMinor,
                newCashBal,
                feeAsset,
                params.orderId,
                null,
                params.orderId,
                params.fillId,
                `Trading fee for BUY ${params.orderId}`,
                now,
              ]
            );
          } else if (feeAsset === params.baseAsset) {
            newAssetBal = newAssetBal - feeMinor;
            await tx.execute(
              `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
              [newAssetBal, now, assetAcc.id]
            );
            await tx.execute(
              `INSERT INTO ledger_entries (
                id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
                balance_after_minor, currency_or_asset, reference_type, reference_id,
                idempotency_key, order_id, fill_id, description, created_at
              ) VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?, 'fee', ?, ?, ?, ?, ?, ?)`,
              [
                `ent_deb_fee_${crypto.randomBytes(8).toString('hex')}`,
                txId,
                assetAcc.id,
                params.userId,
                accountMode,
                feeMinor,
                newAssetBal,
                feeAsset,
                params.orderId,
                null,
                params.orderId,
                params.fillId,
                `Base asset trading fee for BUY ${params.orderId}`,
                now,
              ]
            );
          } else {
            // Third asset fee (e.g. BNB)
            const thirdAssetAcc = await this.getOrCreateAccount(
              params.userId,
              'crypto_holdings',
              feeAsset,
              accountMode,
              tx
            );
            const currentThirdBal = BigInt(thirdAssetAcc.balance_minor);
            const newThirdBal = currentThirdBal - feeMinor;
            await tx.execute(
              `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
              [newThirdBal, now, thirdAssetAcc.id]
            );
            await tx.execute(
              `INSERT INTO ledger_entries (
                id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
                balance_after_minor, currency_or_asset, reference_type, reference_id,
                idempotency_key, order_id, fill_id, description, created_at
              ) VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?, 'fee', ?, ?, ?, ?, ?, ?)`,
              [
                `ent_deb_fee_${crypto.randomBytes(8).toString('hex')}`,
                txId,
                thirdAssetAcc.id,
                params.userId,
                accountMode,
                feeMinor,
                newThirdBal,
                feeAsset,
                params.orderId,
                null,
                params.orderId,
                params.fillId,
                `Third asset (${feeAsset}) trading fee for BUY ${params.orderId}`,
                now,
              ]
            );
          }

          await tx.execute(
            `INSERT INTO ledger_entries (
              id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
              balance_after_minor, currency_or_asset, reference_type, reference_id,
              idempotency_key, order_id, fill_id, description, created_at
            ) VALUES (?, ?, ?, ?, ?, 'credit', ?, ?, ?, 'fee', ?, ?, ?, ?, ?, ?)`,
            [
              `ent_crd_fee_${crypto.randomBytes(8).toString('hex')}`,
              txId,
              feeTreasuryAcc.id,
              params.userId,
              accountMode,
              feeMinor,
              newTreasuryBal,
              feeAsset,
              params.orderId,
              null,
              params.orderId,
              params.fillId,
              `Collected trading fee for BUY ${params.orderId}`,
              now,
            ]
          );
        }

        // Capitalized cost basis
        const capitalizedAcquisitionCost = feeAsset === params.quoteAsset ? (notionalCashMinor + feeMinor) : notionalCashMinor;
        const priorTotalCost = BigInt(pos.cost_basis_minor);
        const priorTotalQty = BigInt(pos.total_quantity_minor);
        newCostBasisMinor = priorTotalCost + capitalizedAcquisitionCost;
        newTotalQtyMinor = priorTotalQty + qtyAssetMinor;
        const newTotalFees = BigInt(pos.total_fees_minor) + (feeAsset === params.quoteAsset ? feeMinor : 0n);

        await tx.execute(
          `UPDATE authoritative_positions SET
            total_quantity_minor = ?, cost_basis_minor = ?, total_fees_minor = ?, updated_at = ?
           WHERE id = ?`,
          [newTotalQtyMinor, newCostBasisMinor, newTotalFees, now, pos.id]
        );
      } else {
        // SELL
        const currentAssetBal = BigInt(lockedAsset.balance_minor);
        if (currentAssetBal < qtyAssetMinor) {
          throw new Error(
            `Insufficient asset balance to settle sell fill: current ${currentAssetBal.toString()}, needed ${qtyAssetMinor.toString()}`
          );
        }

        // Consume order reservation
        const { consumedMinor } = await this.consumeOrderReservation({
          orderId: params.orderId,
          accountId: assetAcc.id,
          amountMinor: qtyAssetMinor,
          tx,
        });

        // Refresh account to get updated reserved_minor from consumeOrderReservation
        const refreshedAssetAcc = await tx.queryOne<LedgerAccountRecord>(
          `SELECT * FROM ledger_accounts WHERE id = ?`,
          [assetAcc.id]
        );
        let currentReserved = BigInt(refreshedAssetAcc?.reserved_minor ?? 0);
        if (consumedMinor === 0n && currentReserved > 0n) {
          const directRelease = currentReserved >= qtyAssetMinor ? qtyAssetMinor : currentReserved;
          currentReserved -= directRelease;
        }

        newAssetBal = currentAssetBal - qtyAssetMinor;
        await tx.execute(
          `UPDATE ledger_accounts SET balance_minor = ?, reserved_minor = ?, updated_at = ? WHERE id = ?`,
          [newAssetBal, currentReserved, now, assetAcc.id]
        );

        // 1. Base Leg (Quantity): Debit user asset, Credit trading clearing
        await tx.execute(
          `INSERT INTO ledger_entries (
            id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
            balance_after_minor, currency_or_asset, reference_type, reference_id,
            idempotency_key, order_id, fill_id, description, created_at
          ) VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?, 'trade_fill', ?, ?, ?, ?, ?, ?)`,
          [
            `ent_deb_ast_${crypto.randomBytes(8).toString('hex')}`,
            txId,
            assetAcc.id,
            params.userId,
            accountMode,
            qtyAssetMinor,
            newAssetBal,
            params.baseAsset,
            params.orderId,
            idempKey,
            params.orderId,
            params.fillId,
            `Disposed ${quantityExact} ${params.baseAsset} @ ${priceExact} ${params.quoteAsset}`,
            now,
          ]
        );

        const currentClearingBaseBal = BigInt(clearingBaseAcc.balance_minor);
        const newClearingBaseBal = currentClearingBaseBal + qtyAssetMinor;
        await tx.execute(
          `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
          [newClearingBaseBal, now, clearingBaseAcc.id]
        );
        await tx.execute(
          `INSERT INTO ledger_entries (
            id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
            balance_after_minor, currency_or_asset, reference_type, reference_id,
            idempotency_key, order_id, fill_id, description, created_at
          ) VALUES (?, ?, ?, ?, ?, 'credit', ?, ?, ?, 'trading_clearing', ?, ?, ?, ?, ?, ?)`,
          [
            `ent_crd_clr_b_${crypto.randomBytes(8).toString('hex')}`,
            txId,
            clearingBaseAcc.id,
            params.userId,
            accountMode,
            qtyAssetMinor,
            newClearingBaseBal,
            params.baseAsset,
            params.orderId,
            idempKey ? `${idempKey}_clr_b` : null,
            params.orderId,
            null,
            `Clearing base disposal for SELL ${params.orderId}`,
            now,
          ]
        );

        // 2. Realized P&L Calculation
        const priorTotalCost = BigInt(pos.cost_basis_minor);
        const priorTotalQty = BigInt(pos.total_quantity_minor);
        const soldCostBasisMinor = computeSoldCostBasis(priorTotalCost, qtyAssetMinor, priorTotalQty);
        const netProceedsMinor = feeAsset === params.quoteAsset ? (notionalCashMinor - feeMinor) : notionalCashMinor;
        realizedPnlMinor = netProceedsMinor - soldCostBasisMinor;
        realizedPnlExact = fromCashMinor(realizedPnlMinor).toString();

        // 3. Quote Leg (Gross Notional): Debit trading clearing, Credit user cash
        const currentClearingQuoteBal = BigInt(clearingQuoteAcc.balance_minor);
        const newClearingQuoteBal = currentClearingQuoteBal - notionalCashMinor;
        await tx.execute(
          `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
          [newClearingQuoteBal, now, clearingQuoteAcc.id]
        );
        await tx.execute(
          `INSERT INTO ledger_entries (
            id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
            balance_after_minor, currency_or_asset, reference_type, reference_id,
            idempotency_key, order_id, fill_id, description, created_at
          ) VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?, 'trading_clearing', ?, ?, ?, ?, ?, ?)`,
          [
            `ent_deb_clr_q_${crypto.randomBytes(8).toString('hex')}`,
            txId,
            clearingQuoteAcc.id,
            params.userId,
            accountMode,
            notionalCashMinor,
            newClearingQuoteBal,
            params.quoteAsset,
            params.orderId,
            idempKey ? `${idempKey}_clr_q` : null,
            params.orderId,
            null,
            `Clearing quote proceeds for SELL ${params.orderId}`,
            now,
          ]
        );

        const currentCashBal = BigInt(cashAcc.balance_minor);
        newCashBal = currentCashBal + netProceedsMinor;
        await tx.execute(
          `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
          [newCashBal, now, cashAcc.id]
        );
        await tx.execute(
          `INSERT INTO ledger_entries (
            id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
            balance_after_minor, currency_or_asset, reference_type, reference_id,
            idempotency_key, order_id, fill_id, description, created_at
          ) VALUES (?, ?, ?, ?, ?, 'credit', ?, ?, ?, 'trade_fill', ?, ?, ?, ?, ?, ?)`,
          [
            `ent_crd_csh_${crypto.randomBytes(8).toString('hex')}`,
            txId,
            cashAcc.id,
            params.userId,
            accountMode,
            notionalCashMinor,
            currentCashBal + notionalCashMinor,
            params.quoteAsset,
            params.orderId,
            idempKey,
            params.orderId,
            params.fillId,
            `Gross proceeds from SELL ${params.orderId}`,
            now,
          ]
        );

        // 4. Fee Leg
        if (feeMinor > 0n) {
          const currentTreasuryBal = BigInt(feeTreasuryAcc.balance_minor);
          const newTreasuryBal = currentTreasuryBal + feeMinor;
          await tx.execute(
            `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
            [newTreasuryBal, now, feeTreasuryAcc.id]
          );

          if (feeAsset === params.quoteAsset) {
            await tx.execute(
              `INSERT INTO ledger_entries (
                id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
                balance_after_minor, currency_or_asset, reference_type, reference_id,
                idempotency_key, order_id, fill_id, description, created_at
              ) VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?, 'fee', ?, ?, ?, ?, ?, ?)`,
              [
                `ent_deb_fee_${crypto.randomBytes(8).toString('hex')}`,
                txId,
                cashAcc.id,
                params.userId,
                accountMode,
                feeMinor,
                newCashBal,
                feeAsset,
                params.orderId,
                null,
                params.orderId,
                params.fillId,
                `Trading fee for SELL ${params.orderId}`,
                now,
              ]
            );
          } else {
            // Base or third asset fee
            const feeSourceAcc = feeAsset === params.baseAsset ? assetAcc : await this.getOrCreateAccount(params.userId, 'crypto_holdings', feeAsset, accountMode, tx);
            const curBal = BigInt(feeSourceAcc.balance_minor);
            await tx.execute(
              `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
              [curBal - feeMinor, now, feeSourceAcc.id]
            );
            await tx.execute(
              `INSERT INTO ledger_entries (
                id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
                balance_after_minor, currency_or_asset, reference_type, reference_id,
                idempotency_key, order_id, fill_id, description, created_at
              ) VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?, 'fee', ?, ?, ?, ?, ?, ?)`,
              [
                `ent_deb_fee_${crypto.randomBytes(8).toString('hex')}`,
                txId,
                feeSourceAcc.id,
                params.userId,
                accountMode,
                feeMinor,
                curBal - feeMinor,
                feeAsset,
                params.orderId,
                null,
                params.orderId,
                params.fillId,
                `Trading fee for SELL ${params.orderId}`,
                now,
              ]
            );
          }

          await tx.execute(
            `INSERT INTO ledger_entries (
              id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
              balance_after_minor, currency_or_asset, reference_type, reference_id,
              idempotency_key, order_id, fill_id, description, created_at
            ) VALUES (?, ?, ?, ?, ?, 'credit', ?, ?, ?, 'fee', ?, ?, ?, ?, ?, ?)`,
            [
              `ent_crd_fee_${crypto.randomBytes(8).toString('hex')}`,
              txId,
              feeTreasuryAcc.id,
              params.userId,
              accountMode,
              feeMinor,
              newTreasuryBal,
              feeAsset,
              params.orderId,
              null,
              params.orderId,
              params.fillId,
              `Collected trading fee for SELL ${params.orderId}`,
              now,
            ]
          );
        }

        // 5. Realized P&L Journal Entry & Clearing Offset
        const pnlAcc = await this.getOrCreateAccount(
          params.userId,
          'realized_pnl',
          params.quoteAsset,
          accountMode,
          tx
        );
        const currentPnlBal = BigInt(pnlAcc.balance_minor);
        const newPnlBal = currentPnlBal + realizedPnlMinor;
        await tx.execute(
          `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
          [newPnlBal, now, pnlAcc.id]
        );

        const absPnl = realizedPnlMinor < 0n ? -realizedPnlMinor : realizedPnlMinor;
        if (realizedPnlMinor > 0n) {
          // Gain: Credit pnlAcc, Debit clearingQuoteAcc
          const curClr = BigInt(clearingQuoteAcc.balance_minor);
          await tx.execute(
            `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
            [curClr - absPnl, now, clearingQuoteAcc.id]
          );
          await tx.execute(
            `INSERT INTO ledger_entries (
              id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
              balance_after_minor, currency_or_asset, reference_type, reference_id,
              idempotency_key, order_id, fill_id, description, created_at
            ) VALUES (?, ?, ?, ?, ?, 'credit', ?, ?, ?, 'realized_pnl', ?, ?, ?, ?, ?, ?)`,
            [
              `ent_pnl_${crypto.randomBytes(8).toString('hex')}`,
              txId,
              pnlAcc.id,
              params.userId,
              accountMode,
              absPnl,
              newPnlBal,
              params.quoteAsset,
              params.orderId,
              null,
              params.orderId,
              params.fillId,
              `Realized gain on SELL ${params.baseAsset}: +${fromCashMinor(realizedPnlMinor)} ${params.quoteAsset}`,
              now,
            ]
          );
          await tx.execute(
            `INSERT INTO ledger_entries (
              id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
              balance_after_minor, currency_or_asset, reference_type, reference_id,
              idempotency_key, order_id, fill_id, description, created_at
            ) VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?, 'realized_pnl_clearing', ?, ?, ?, ?, ?, ?)`,
            [
              `ent_pnl_clr_${crypto.randomBytes(8).toString('hex')}`,
              txId,
              clearingQuoteAcc.id,
              params.userId,
              accountMode,
              absPnl,
              curClr - absPnl,
              params.quoteAsset,
              params.orderId,
              null,
              params.orderId,
              null,
              `Clearing offset for realized gain on SELL ${params.baseAsset}`,
              now,
            ]
          );
        } else if (realizedPnlMinor < 0n) {
          // Loss: Debit pnlAcc, Credit clearingQuoteAcc
          const curClr = BigInt(clearingQuoteAcc.balance_minor);
          await tx.execute(
            `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
            [curClr + absPnl, now, clearingQuoteAcc.id]
          );
          await tx.execute(
            `INSERT INTO ledger_entries (
              id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
              balance_after_minor, currency_or_asset, reference_type, reference_id,
              idempotency_key, order_id, fill_id, description, created_at
            ) VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?, 'realized_pnl', ?, ?, ?, ?, ?, ?)`,
            [
              `ent_pnl_${crypto.randomBytes(8).toString('hex')}`,
              txId,
              pnlAcc.id,
              params.userId,
              accountMode,
              absPnl,
              newPnlBal,
              params.quoteAsset,
              params.orderId,
              null,
              params.orderId,
              params.fillId,
              `Realized loss on SELL ${params.baseAsset}: -${fromCashMinor(absPnl)} ${params.quoteAsset}`,
              now,
            ]
          );
          await tx.execute(
            `INSERT INTO ledger_entries (
              id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
              balance_after_minor, currency_or_asset, reference_type, reference_id,
              idempotency_key, order_id, fill_id, description, created_at
            ) VALUES (?, ?, ?, ?, ?, 'credit', ?, ?, ?, 'realized_pnl_clearing', ?, ?, ?, ?, ?, ?)`,
            [
              `ent_pnl_clr_${crypto.randomBytes(8).toString('hex')}`,
              txId,
              clearingQuoteAcc.id,
              params.userId,
              accountMode,
              absPnl,
              curClr + absPnl,
              params.quoteAsset,
              params.orderId,
              null,
              params.orderId,
              null,
              `Clearing offset for realized loss on SELL ${params.baseAsset}`,
              now,
            ]
          );
        }

        // 6. Update Position Record
        newTotalQtyMinor = priorTotalQty >= qtyAssetMinor ? priorTotalQty - qtyAssetMinor : 0n;
        newCostBasisMinor =
          newTotalQtyMinor === 0n
            ? 0n
            : priorTotalCost >= soldCostBasisMinor
              ? priorTotalCost - soldCostBasisMinor
              : 0n;
        const newRealizedPnl = BigInt(pos.realized_pnl_minor) + realizedPnlMinor;
        const newTotalFees = BigInt(pos.total_fees_minor) + (feeAsset === params.quoteAsset ? feeMinor : 0n);

        await tx.execute(
          `UPDATE authoritative_positions SET
            total_quantity_minor = ?, cost_basis_minor = ?, realized_pnl_minor = ?,
            total_fees_minor = ?, updated_at = ?
           WHERE id = ?`,
          [
            newTotalQtyMinor,
            newCostBasisMinor,
            newRealizedPnl,
            newTotalFees,
            now,
            pos.id,
          ]
        );
      }

      // Assert Invariants
      if (newCashBal < 0n) {
        throw new Error(`Accounting invariant violated: Negative available cash (${newCashBal})`);
      }
      if (newAssetBal < 0n) {
        throw new Error(`Accounting invariant violated: Negative asset balance (${newAssetBal})`);
      }

      // Mark fill as processed in exchange_fills table if present
      await tx.execute(
        `UPDATE exchange_fills SET
          ledger_processed = 1, ledger_transaction_id = ?, price_exact = ?, qty_exact = ?,
          commission_exact = ?, quote_qty_exact = ?
         WHERE (order_id = ? AND exchange_trade_id = ?) OR (canonical_fill_key = ?)`,
        [txId, priceExact, quantityExact, feeExact, notionalExact, params.orderId, params.fillId, params.canonicalFillKey || '']
      );

      // Record independent double-entry accounting event for idempotency
      try {
        await tx.execute(
          `INSERT INTO accounting_events (
            event_id, transaction_id, user_id, account_mode, event_type, fill_id, order_id, created_at
          ) VALUES (?, ?, ?, ?, 'FILL_SETTLEMENT', ?, ?, ?)`,
          [
            accountingEventId,
            txId,
            params.userId,
            accountMode,
            params.fillId,
            params.orderId,
            now,
          ]
        );
      } catch (eventErr: any) {
        if (
          String(eventErr.message).includes('UNIQUE constraint failed') ||
          String(eventErr.message).includes('duplicate key') ||
          eventErr.code === '23505'
        ) {
          return {
            alreadyProcessed: true,
            transactionId: txId,
            cashBalanceAfterMinor: BigInt(cashAcc.balance_minor),
            assetBalanceAfterMinor: BigInt(assetAcc.balance_minor),
            feeMinor: 0n,
            costBasisMinor: BigInt(pos.cost_basis_minor),
            realizedPnlMinor: BigInt(pos.realized_pnl_minor),
            totalQuantityMinor: BigInt(pos.total_quantity_minor),
          };
        }
        throw eventErr;
      }

      // Verify transaction is balanced per currency!
      await this.assertTransactionBalanced(tx, txId);

      await AuditService.logEvent({
        userId: params.userId,
        eventType: 'LEDGER_TRADE_FILL_SETTLED',
        source: 'ledger_service',
        actor: 'execution_system',
        idempotencyKey: idempKey,
        externalId: params.fillId,
        metadata: {
          accountMode,
          orderId: params.orderId,
          fillId: params.fillId,
          side: params.side,
          symbol: params.symbol,
          quantity: quantityExact,
          price: priceExact,
          feeMinor: feeMinor,
          realizedPnlMinor: realizedPnlMinor !== undefined ? realizedPnlMinor : undefined,
          transactionId: txId,
          accountingEventId,
        },
        result: 'SUCCESS',
      });

      return {
        alreadyProcessed: false,
        transactionId: txId,
        cashBalanceAfterMinor: newCashBal,
        assetBalanceAfterMinor: newAssetBal,
        feeMinor,
        realizedPnlMinor,
        costBasisMinor: newCostBasisMinor,
        totalQuantityMinor: newTotalQtyMinor,
        priceExact,
        quantityExact,
        notionalExact,
        feeExact,
        realizedPnlExact,
      };
    };

    if (params.tx) {
      return executeInTx(params.tx);
    }
    return db.transaction(executeInTx);
  }

  /**
   * Fetches all balances for a user across sovereign, trading, and crypto holdings.
   */
  static async getUserBalances(
    userId: string,
    accountMode: 'live' | 'paper' = 'live'
  ): Promise<Record<string, { balance: number; reserved: number; free: number }>> {
    const db = getDb();
    const rows = await db.query<LedgerAccountRecord>(
      `SELECT * FROM ledger_accounts WHERE user_id = ? AND account_mode = ?`,
      [userId, accountMode]
    );

    const result: Record<string, { balance: number; reserved: number; free: number }> = {};

    for (const r of rows) {
      const key = `${r.account_type}:${r.asset_or_currency}`;
      // PRECISION_BOUNDARY: legacy number conversion for backward-compatible getUserBalances display API
      const bal = Number(r.balance_minor);
      const res = Number(r.reserved_minor);
      result[key] = {
        balance: bal,
        reserved: res,
        free: Math.max(0, bal - res), // PRECISION_BOUNDARY: legacy display projection
      };
    }

    return result;
  }

  /**
   * Builds an authoritative, consolidated account projection including cash,
   * asset holdings, volume-weighted cost basis, realized P&L, and fees.
   */
  static async getAuthoritativeProjection(
    userId: string,
    accountMode: 'live' | 'paper' = 'live'
  ): Promise<AuthoritativeAccountProjection> {
    const db = getDb();

    // Query Cash Accounts
    const cashRows = await db.query<LedgerAccountRecord>(
      `SELECT * FROM ledger_accounts WHERE user_id = ? AND account_mode = ? AND account_type IN ('trading_allocated', 'sovereign_cash')`,
      [userId, accountMode]
    );

    let totalCashMinor = 0n;
    let reservedCashMinor = 0n;
    let preferredCurrency = 'USDT';

    for (const row of cashRows) {
      if (row.account_type === 'trading_allocated') {
        totalCashMinor += BigInt(row.balance_minor);
        reservedCashMinor += BigInt(row.reserved_minor);
        preferredCurrency = row.asset_or_currency;
      }
    }

    // Query Positions
    const posRows = await db.query<AuthoritativePositionRecord>(
      `SELECT * FROM authoritative_positions WHERE user_id = ? AND account_mode = ?`,
      [userId, accountMode]
    );

    const positions: AuthoritativeAccountProjection['positions'] = {};
    let cumulativeRealizedPnlMinor = 0n;
    let cumulativeTotalFeesMinor = 0n;

    for (const p of posRows) {
      const totalQtyMinor = BigInt(p.total_quantity_minor);
      const reservedQtyMinor = BigInt(p.reserved_quantity_minor);
      const costBasisMinor = BigInt(p.cost_basis_minor);
      const rPnlMinor = BigInt(p.realized_pnl_minor);
      const feesMinor = BigInt(p.total_fees_minor);

      cumulativeRealizedPnlMinor += rPnlMinor;
      cumulativeTotalFeesMinor += feesMinor;

      // PRECISION_BOUNDARY: legacy number conversion for backward-compatible getUserPositions display API
      const totalQty = fromAssetMinorToDisplayNumber(totalQtyMinor);
      const reservedQty = fromAssetMinorToDisplayNumber(reservedQtyMinor);
      const costBasisUSD = fromCashMinorToDisplayNumber(costBasisMinor);
      const avgCostBasisUSD = totalQty > 0 ? costBasisUSD / totalQty : 0;

      positions[p.asset] = {
        asset: p.asset,
        totalQuantityMinor: totalQtyMinor,
        reservedQuantityMinor: reservedQtyMinor,
        availableQuantityMinor: totalQtyMinor >= reservedQtyMinor ? totalQtyMinor - reservedQtyMinor : 0n,
        totalQuantity: totalQty,
        reservedQuantity: reservedQty,
        availableQuantity: Math.max(0, totalQty - reservedQty), // PRECISION_BOUNDARY: legacy display projection
        costBasisMinor,
        costBasisUSD,
        avgCostBasisUSD,
        realizedPnlMinor: rPnlMinor,
        realizedPnlUSD: fromCashMinorToDisplayNumber(rPnlMinor),
        totalFeesMinor: feesMinor,
        totalFeesUSD: fromCashMinorToDisplayNumber(feesMinor),
      };
    }

    const availableCashMinor =
      totalCashMinor >= reservedCashMinor ? totalCashMinor - reservedCashMinor : 0n;

    return {
      userId,
      accountMode,
      cash: {
        totalMinor: totalCashMinor,
        reservedMinor: reservedCashMinor,
        availableMinor: availableCashMinor,
        total: fromCashMinorToDisplayNumber(totalCashMinor),
        reserved: fromCashMinorToDisplayNumber(reservedCashMinor),
        available: fromCashMinorToDisplayNumber(availableCashMinor),
        currency: preferredCurrency,
      },
      positions,
      pnl: {
        realizedPnlMinor: cumulativeRealizedPnlMinor,
        realizedPnlUSD: fromCashMinorToDisplayNumber(cumulativeRealizedPnlMinor),
        totalFeesMinor: cumulativeTotalFeesMinor,
        totalFeesUSD: fromCashMinorToDisplayNumber(cumulativeTotalFeesMinor),
      },
    };
  }

  /**
   * Invariant Verification: Replays the append-only ledger journal from beginning to end,
   * verifying that every balance strictly matches the calculated entry sum.
   */
  static async replayAccountState(
    userId: string,
    accountMode: 'live' | 'paper' = 'live'
  ): Promise<ReplayVerificationResult> {
    const db = getDb();
    const entries = await db.query<LedgerEntryRecord>(
      `SELECT * FROM ledger_entries WHERE user_id = ? AND account_mode = ? ORDER BY created_at ASC, id ASC`,
      [userId, accountMode]
    );

    const accountsReplayed: Record<string, bigint> = {};
    for (const ent of entries) {
      if (!accountsReplayed[ent.account_id]) {
        accountsReplayed[ent.account_id] = 0n;
      }
      if (ent.entry_type === 'credit') {
        accountsReplayed[ent.account_id] += BigInt(ent.amount_minor);
      } else if (ent.entry_type === 'debit') {
        accountsReplayed[ent.account_id] -= BigInt(ent.amount_minor);
      }
    }

    const recordedAccounts = await db.query<LedgerAccountRecord>(
      `SELECT * FROM ledger_accounts WHERE user_id = ? AND account_mode = ?`,
      [userId, accountMode]
    );

    const discrepancies: string[] = [];
    for (const acc of recordedAccounts) {
      const replayed = accountsReplayed[acc.id] ?? 0n;
      const recorded = BigInt(acc.balance_minor);
      if (replayed !== recorded) {
        discrepancies.push(
          `Account ${acc.id} (${acc.account_type}:${acc.asset_or_currency}) mismatch: recorded ${recorded.toString()}, replayed ${replayed.toString()}`
        );
      }
    }

    return {
      consistent: discrepancies.length === 0,
      entriesCount: entries.length,
      accountsReplayed,
      discrepancies,
    };
  }

  /**
   * Applies an auditable reconciliation adjustment to a ledger account,
   * creating explicit adjustment journal entries rather than silently overwriting.
   */
  static async applyReconciliationAdjustment(params: {
    userId: string;
    accountMode?: 'live' | 'paper';
    assetOrCurrency: string;
    accountType: LedgerAccountType;
    adjustmentMinor: bigint | number;
    reason: string;
    mismatchId?: string;
    idempotencyKey?: string;
  }): Promise<{ transactionId: string; balanceAfter: bigint }> {
    const adjustment = BigInt(params.adjustmentMinor);
    if (adjustment === 0n) {
      throw new Error('Reconciliation adjustment cannot be zero');
    }

    const accountMode = params.accountMode || 'live';
    const db = getDb();

    return db.transaction(async (tx) => {
      const clearingAcc = await this.getOrCreateAccount(
        params.userId,
        'reconciliation_clearing',
        params.assetOrCurrency,
        accountMode,
        tx
      );
      const acc = await this.getOrCreateAccount(
        params.userId,
        params.accountType,
        params.assetOrCurrency,
        accountMode,
        tx
      );

      // Deterministically acquire row-level locks in sorted ID order
      const lockedMap = await this.lockAccounts([clearingAcc.id, acc.id], tx);
      const lockedAcc = lockedMap.get(acc.id)!;
      const lockedClearing = lockedMap.get(clearingAcc.id)!;

      const currentBal = BigInt(lockedAcc.balance_minor);
      const newBal = currentBal + adjustment;

      if (newBal < 0n) {
        throw new Error(
          `Reconciliation adjustment would result in negative balance (${newBal.toString()})`
        );
      }

      const txId = `adj_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const now = Date.now();

      await tx.execute(
        `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
        [newBal, now, acc.id]
      );

      const entryType = adjustment > 0n ? 'credit' : 'debit';
      const absAmount = adjustment < 0n ? -adjustment : adjustment;

      await tx.execute(
        `INSERT INTO ledger_entries (
          id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
          balance_after_minor, currency_or_asset, reference_type, reference_id,
          idempotency_key, description, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reconciliation_adjustment', ?, ?, ?, ?)`,
        [
          `ent_adj_${crypto.randomBytes(8).toString('hex')}`,
          txId,
          acc.id,
          params.userId,
          accountMode,
          entryType,
          absAmount,
          newBal,
          params.assetOrCurrency,
          params.mismatchId || `mismatch_${now}`,
          params.idempotencyKey || null,
          `Audited Reconciliation Adjustment: ${params.reason}`,
          now,
        ]
      );

      // Clearing offsetting leg
      const currentClearingBal = BigInt(lockedClearing.balance_minor);
      const newClearingBal = currentClearingBal - adjustment;
      await tx.execute(
        `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
        [newClearingBal, now, clearingAcc.id]
      );

      const clearingEntryType = adjustment > 0n ? 'debit' : 'credit';
      await tx.execute(
        `INSERT INTO ledger_entries (
          id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
          balance_after_minor, currency_or_asset, reference_type, reference_id,
          idempotency_key, description, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reconciliation_clearing', ?, ?, ?, ?)`,
        [
          `ent_adj_clr_${crypto.randomBytes(8).toString('hex')}`,
          txId,
          clearingAcc.id,
          params.userId,
          accountMode,
          clearingEntryType,
          absAmount,
          newClearingBal,
          params.assetOrCurrency,
          params.mismatchId || `mismatch_${now}`,
          params.idempotencyKey ? `${params.idempotencyKey}_clearing` : null,
          `Clearing offset for adjustment: ${params.reason}`,
          now,
        ]
      );

      await this.assertTransactionBalanced(tx, txId);

      await AuditService.logEvent({
        userId: params.userId,
        eventType: 'LEDGER_RECONCILIATION_ADJUSTMENT',
        source: 'reconciliation_worker',
        actor: 'system',
        idempotencyKey: params.idempotencyKey,
        externalId: params.mismatchId,
        metadata: {
          accountMode,
          accountType: params.accountType,
          asset: params.assetOrCurrency,
          adjustmentMinor: adjustment,
          newBalanceMinor: newBal,
          reason: params.reason,
        },
        result: 'SUCCESS',
      });

      return { transactionId: txId, balanceAfter: newBal };
    });
  }

  /**
   * Verifies the double-entry accounting integrity invariant for a specific account:
   * sum of all entries for an account must strictly match the current stored balance.
   */
  static async verifyAccountInvariant(
    accountId: string
  ): Promise<{ valid: boolean; calculatedBalance: bigint; recordedBalance: bigint }> {
    const db = getDb();
    const acc = await db.queryOne<LedgerAccountRecord>(
      `SELECT * FROM ledger_accounts WHERE id = ?`,
      [accountId]
    );
    if (!acc) throw new Error(`Account ${accountId} not found`);

    const entries = await db.query<{ entry_type: string; amount_minor: number }>(
      `SELECT entry_type, amount_minor FROM ledger_entries WHERE account_id = ? ORDER BY created_at ASC`,
      [accountId]
    );

    let sum = 0n;
    for (const ent of entries) {
      if (ent.entry_type === 'credit') {
        sum += BigInt(ent.amount_minor);
      } else if (ent.entry_type === 'debit') {
        sum -= BigInt(ent.amount_minor);
      }
    }

    const recorded = BigInt(acc.balance_minor);
    return {
      valid: sum === recorded,
      calculatedBalance: sum,
      recordedBalance: recorded,
    };
  }
}
