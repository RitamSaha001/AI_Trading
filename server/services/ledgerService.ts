import { DBClient, getDb } from '../db';
import { AuditService } from './auditService';
import crypto from 'node:crypto';

export type LedgerAccountType =
  | 'sovereign_cash'       // Liquid cash in Sovereign Wallet
  | 'trading_allocated'   // Funds allocated to the active trading desk
  | 'crypto_holdings'     // Spot crypto asset lots held
  | 'reserve_escrow'      // Escrow for open orders or pending settlements
  | 'fee_treasury';       // System collected fees

export interface LedgerAccountRecord {
  id: string;
  user_id: string;
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
  entry_type: 'debit' | 'credit';
  amount_minor: number | bigint;
  balance_after_minor: number | bigint;
  currency_or_asset: string;
  reference_type: string;
  reference_id: string;
  description: string;
  created_at: number;
}

export class LedgerService {
  /**
   * Retrieves or creates a ledger account for a user and asset in an ACID transaction.
   */
  static async getOrCreateAccount(
    userId: string,
    accountType: LedgerAccountType,
    assetOrCurrency: string,
    db: DBClient = getDb()
  ): Promise<LedgerAccountRecord> {
    const existing = await db.queryOne<LedgerAccountRecord>(
      `SELECT * FROM ledger_accounts WHERE user_id = ? AND account_type = ? AND asset_or_currency = ?`,
      [userId, accountType, assetOrCurrency]
    );

    if (existing) return existing;

    const id = `acc_${userId.slice(0, 6)}_${accountType}_${assetOrCurrency.toLowerCase()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = Date.now();

    await db.execute(
      `INSERT INTO ledger_accounts (
        id, user_id, account_type, asset_or_currency, balance_minor, reserved_minor, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
      [id, userId, accountType, assetOrCurrency, now, now]
    );

    const created = await db.queryOne<LedgerAccountRecord>(
      `SELECT * FROM ledger_accounts WHERE id = ?`,
      [id]
    );

    return created!;
  }

  /**
   * Executes a double-entry journal transaction moving funds between two accounts.
   */
  static async transfer(params: {
    userId: string;
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

    const db = getDb();

    return db.transaction(async (tx) => {
      const fromAcc = await this.getOrCreateAccount(
        params.userId,
        params.fromAccountType,
        params.assetOrCurrency,
        tx
      );
      const toAcc = await this.getOrCreateAccount(
        params.userId,
        params.toAccountType,
        params.assetOrCurrency,
        tx
      );

      const fromBal = BigInt(fromAcc.balance_minor);
      const fromReserved = BigInt(fromAcc.reserved_minor);
      const spendable = fromBal - fromReserved;

      if (spendable < amount) {
        throw new Error(
          `Insufficient spendable balance in ${params.fromAccountType}. Spendable: ${spendable.toString()}, required: ${amount.toString()}`
        );
      }

      const txId = `tx_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const now = Date.now();

      const newFromBal = fromBal - amount;
      const newToBal = BigInt(toAcc.balance_minor) + amount;

      // Update From Account
      await tx.execute(
        `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
        [Number(newFromBal), now, fromAcc.id]
      );

      // Record Debit Entry
      const debitEntryId = `ent_deb_${crypto.randomBytes(8).toString('hex')}`;
      await tx.execute(
        `INSERT INTO ledger_entries (
          id, transaction_id, account_id, user_id, entry_type, amount_minor,
          balance_after_minor, currency_or_asset, reference_type, reference_id,
          description, created_at
        ) VALUES (?, ?, ?, ?, 'debit', ?, ?, ?, ?, ?, ?, ?)`,
        [
          debitEntryId,
          txId,
          fromAcc.id,
          params.userId,
          Number(amount),
          Number(newFromBal),
          params.assetOrCurrency,
          params.referenceType,
          params.referenceId,
          params.description,
          now,
        ]
      );

      // Update To Account
      await tx.execute(
        `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
        [Number(newToBal), now, toAcc.id]
      );

      // Record Credit Entry
      const creditEntryId = `ent_crd_${crypto.randomBytes(8).toString('hex')}`;
      await tx.execute(
        `INSERT INTO ledger_entries (
          id, transaction_id, account_id, user_id, entry_type, amount_minor,
          balance_after_minor, currency_or_asset, reference_type, reference_id,
          description, created_at
        ) VALUES (?, ?, ?, ?, 'credit', ?, ?, ?, ?, ?, ?, ?)`,
        [
          creditEntryId,
          txId,
          toAcc.id,
          params.userId,
          Number(amount),
          Number(newToBal),
          params.assetOrCurrency,
          params.referenceType,
          params.referenceId,
          params.description,
          now,
        ]
      );

      await AuditService.logEvent({
        userId: params.userId,
        eventType: 'LEDGER_TRANSFER',
        source: 'ledger_service',
        actor: 'system',
        idempotencyKey: params.idempotencyKey,
        externalId: params.referenceId,
        metadata: {
          fromAccount: params.fromAccountType,
          toAccount: params.toAccountType,
          asset: params.assetOrCurrency,
          amountMinor: Number(amount),
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
   * Credits a deposit directly into the user's sovereign cash ledger account.
   */
  static async creditDeposit(params: {
    userId: string;
    assetOrCurrency: string;
    amountMinor: bigint | number;
    paymentId: string;
    description: string;
    idempotencyKey?: string;
  }): Promise<{ transactionId: string; balanceAfter: bigint }> {
    const amount = BigInt(params.amountMinor);
    if (amount <= 0n) {
      throw new Error('Deposit amount must be strictly positive');
    }

    const db = getDb();

    return db.transaction(async (tx) => {
      const acc = await this.getOrCreateAccount(
        params.userId,
        'sovereign_cash',
        params.assetOrCurrency,
        tx
      );

      const txId = `dep_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const now = Date.now();
      const currentBal = BigInt(acc.balance_minor);
      const newBal = currentBal + amount;

      await tx.execute(
        `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
        [Number(newBal), now, acc.id]
      );

      const entryId = `ent_crd_${crypto.randomBytes(8).toString('hex')}`;
      await tx.execute(
        `INSERT INTO ledger_entries (
          id, transaction_id, account_id, user_id, entry_type, amount_minor,
          balance_after_minor, currency_or_asset, reference_type, reference_id,
          description, created_at
        ) VALUES (?, ?, ?, ?, 'credit', ?, ?, ?, 'deposit', ?, ?, ?)`,
        [
          entryId,
          txId,
          acc.id,
          params.userId,
          Number(amount),
          Number(newBal),
          params.assetOrCurrency,
          params.paymentId,
          params.description,
          now,
        ]
      );

      await AuditService.logEvent({
        userId: params.userId,
        eventType: 'LEDGER_DEPOSIT_CREDITED',
        source: 'payment_settlement',
        actor: 'system',
        idempotencyKey: params.idempotencyKey,
        externalId: params.paymentId,
        metadata: {
          asset: params.assetOrCurrency,
          amountMinor: Number(amount),
          newBalanceMinor: Number(newBal),
        },
        result: 'SUCCESS',
      });

      return { transactionId: txId, balanceAfter: newBal };
    });
  }

  /**
   * Atomically reserves capital for an open order so concurrent orders cannot overspend.
   */
  static async reserveBalance(params: {
    userId: string;
    accountType: LedgerAccountType;
    assetOrCurrency: string;
    amountMinor: bigint | number;
    referenceId: string;
  }): Promise<boolean> {
    const amount = BigInt(params.amountMinor);
    if (amount <= 0n) return true;

    const db = getDb();

    return db.transaction(async (tx) => {
      const acc = await this.getOrCreateAccount(
        params.userId,
        params.accountType,
        params.assetOrCurrency,
        tx
      );

      const bal = BigInt(acc.balance_minor);
      const reserved = BigInt(acc.reserved_minor);
      const free = bal - reserved;

      if (free < amount) {
        throw new Error(
          `Insufficient free balance to reserve: free ${free.toString()}, requested ${amount.toString()}`
        );
      }

      const newReserved = reserved + amount;
      const now = Date.now();

      await tx.execute(
        `UPDATE ledger_accounts SET reserved_minor = ?, updated_at = ? WHERE id = ?`,
        [Number(newReserved), now, acc.id]
      );

      return true;
    });
  }

  /**
   * Releases an existing reservation back to free balance.
   */
  static async releaseReservation(params: {
    userId: string;
    accountType: LedgerAccountType;
    assetOrCurrency: string;
    amountMinor: bigint | number;
    referenceId: string;
  }): Promise<boolean> {
    const amount = BigInt(params.amountMinor);
    if (amount <= 0n) return true;

    const db = getDb();

    return db.transaction(async (tx) => {
      const acc = await this.getOrCreateAccount(
        params.userId,
        params.accountType,
        params.assetOrCurrency,
        tx
      );

      const currentReserved = BigInt(acc.reserved_minor);
      const newReserved = currentReserved >= amount ? currentReserved - amount : 0n;
      const now = Date.now();

      await tx.execute(
        `UPDATE ledger_accounts SET reserved_minor = ?, updated_at = ? WHERE id = ?`,
        [Number(newReserved), now, acc.id]
      );

      return true;
    });
  }

  /**
   * Fetches all balances for a user across sovereign, trading, and crypto holdings.
   */
  static async getUserBalances(userId: string): Promise<Record<string, { balance: number; reserved: number; free: number }>> {
    const db = getDb();
    const rows = await db.query<LedgerAccountRecord>(
      `SELECT * FROM ledger_accounts WHERE user_id = ?`,
      [userId]
    );

    const result: Record<string, { balance: number; reserved: number; free: number }> = {};

    for (const r of rows) {
      const key = `${r.account_type}:${r.asset_or_currency}`;
      const bal = Number(r.balance_minor);
      const res = Number(r.reserved_minor);
      result[key] = {
        balance: bal,
        reserved: res,
        free: Math.max(0, bal - res),
      };
    }

    return result;
  }

  /**
   * Verifies the double-entry accounting integrity invariant:
   * sum of all entries for an account must strictly match the current stored balance.
   */
  static async verifyAccountInvariant(accountId: string): Promise<{ valid: boolean; calculatedBalance: bigint; recordedBalance: bigint }> {
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
