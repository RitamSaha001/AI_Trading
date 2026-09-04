import { DBClient, getDb } from '../db';
import { AuditService } from './auditService';
import {
  toCashMinor,
  toAssetMinor,
  fromCashMinor,
  fromAssetMinor,
  computeNotionalMinor,
  computeSoldCostBasis,
} from './precision';
import crypto from 'node:crypto';

export type LedgerAccountType =
  | 'sovereign_cash'       // Liquid cash in Sovereign Wallet
  | 'trading_allocated'   // Funds allocated to the active trading desk
  | 'crypto_holdings'     // Spot crypto asset lots held
  | 'reserve_escrow'      // Escrow for open orders or pending settlements
  | 'fee_treasury'        // System collected fees
  | 'realized_pnl';       // Realized P&L equity account

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
  price: number;
  quantity: number;
  fee?: number;
  feeAsset?: string;
  executedAt?: number;
  idempotencyKey?: string;
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

    await db.execute(
      `INSERT INTO ledger_accounts (
        id, user_id, account_mode, account_type, asset_or_currency, balance_minor, reserved_minor, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      [id, userId, accountMode, accountType, assetOrCurrency, now, now]
    );

    const created = await db.queryOne<LedgerAccountRecord>(
      `SELECT * FROM ledger_accounts WHERE id = ?`,
      [id]
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

    await db.execute(
      `INSERT INTO authoritative_positions (
        id, user_id, account_mode, asset, total_quantity_minor, reserved_quantity_minor,
        cost_basis_minor, realized_pnl_minor, total_fees_minor, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, ?, ?)`,
      [id, userId, accountMode, asset, now, now]
    );

    const created = await db.queryOne<AuthoritativePositionRecord>(
      `SELECT * FROM authoritative_positions WHERE id = ?`,
      [id]
    );
    return created!;
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
          Number(amount),
          Number(newFromBal),
          params.assetOrCurrency,
          params.referenceType,
          params.referenceId,
          params.idempotencyKey || null,
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
          Number(amount),
          Number(newToBal),
          params.assetOrCurrency,
          params.referenceType,
          params.referenceId,
          params.idempotencyKey || null,
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
          accountMode,
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
    accountMode?: 'live' | 'paper';
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

    const accountMode = params.accountMode || 'live';
    const db = getDb();

    return db.transaction(async (tx) => {
      const acc = await this.getOrCreateAccount(
        params.userId,
        'sovereign_cash',
        params.assetOrCurrency,
        accountMode,
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
          Number(amount),
          Number(newBal),
          params.assetOrCurrency,
          params.paymentId,
          params.idempotencyKey || null,
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
          accountMode,
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

      const bal = BigInt(acc.balance_minor);
      const reserved = BigInt(acc.reserved_minor);
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
   * Processes a validated exchange execution fill into the double-entry ledger with strict idempotency.
   */
  static async processFill(params: ProcessFillParams): Promise<ProcessFillResult> {
    const accountMode = params.accountMode || 'live';
    const idempKey =
      params.idempotencyKey || `fill_${accountMode}_${params.orderId}_${params.fillId}`;

    const db = getDb();

    // 1. Strict Server-Side Idempotency Check
    const existingEntry = await db.queryOne<LedgerEntryRecord>(
      `SELECT * FROM ledger_entries WHERE idempotency_key = ? OR (reference_type = 'trade_fill' AND fill_id = ? AND account_mode = ?)`,
      [idempKey, params.fillId, accountMode]
    );

    if (existingEntry) {
      // Already processed! Return current authoritative account state without duplicate accounting
      const cashAcc = await this.getOrCreateAccount(
        params.userId,
        'trading_allocated',
        params.quoteAsset,
        accountMode
      );
      const assetAcc = await this.getOrCreateAccount(
        params.userId,
        'crypto_holdings',
        params.baseAsset,
        accountMode
      );
      const pos = await this.getOrCreateAuthoritativePosition(
        params.userId,
        accountMode,
        params.baseAsset
      );

      return {
        alreadyProcessed: true,
        transactionId: existingEntry.transaction_id,
        cashBalanceAfterMinor: BigInt(cashAcc.balance_minor),
        assetBalanceAfterMinor: BigInt(assetAcc.balance_minor),
        feeMinor: 0n,
        costBasisMinor: BigInt(pos.cost_basis_minor),
        realizedPnlMinor: BigInt(pos.realized_pnl_minor),
        totalQuantityMinor: BigInt(pos.total_quantity_minor),
      };
    }

    // 2. Perform ACID Fill Accounting
    return db.transaction(async (tx) => {
      const qtyAssetMinor = toAssetMinor(params.quantity);
      const priceCashMinor = toCashMinor(params.price);
      const notionalCashMinor = computeNotionalMinor(qtyAssetMinor, priceCashMinor);
      const feeCashMinor = toCashMinor(
        params.fee !== undefined ? params.fee : Number(notionalCashMinor) / 100 * 0.00075
      );
      const feeAsset = params.feeAsset || params.quoteAsset;

      const txId = `tx_fill_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const now = params.executedAt || Date.now();

      // Accounts
      const cashAcc = await this.getOrCreateAccount(
        params.userId,
        'trading_allocated',
        params.quoteAsset,
        accountMode,
        tx
      );
      const assetAcc = await this.getOrCreateAccount(
        params.userId,
        'crypto_holdings',
        params.baseAsset,
        accountMode,
        tx
      );
      const feeAcc = await this.getOrCreateAccount(
        params.userId,
        'fee_treasury',
        feeAsset,
        accountMode,
        tx
      );
      const pos = await this.getOrCreateAuthoritativePosition(
        params.userId,
        accountMode,
        params.baseAsset,
        tx
      );

      let newCashBal: bigint;
      let newAssetBal: bigint;
      let realizedPnlMinor: bigint | undefined;
      let newCostBasisMinor: bigint;
      let newTotalQtyMinor: bigint;

      if (params.side === 'BUY') {
        const totalCashNeeded = notionalCashMinor + feeCashMinor;
        const currentCashBal = BigInt(cashAcc.balance_minor);

        if (currentCashBal < totalCashNeeded) {
          throw new Error(
            `Insufficient cash balance to settle fill: current ${currentCashBal.toString()}, needed ${totalCashNeeded.toString()}`
          );
        }

        // Release reservation for the filled portion
        const currentReserved = BigInt(cashAcc.reserved_minor);
        const releaseAmount = currentReserved >= totalCashNeeded ? totalCashNeeded : currentReserved;
        const newReserved = currentReserved - releaseAmount;

        newCashBal = currentCashBal - totalCashNeeded;
        await tx.execute(
          `UPDATE ledger_accounts SET balance_minor = ?, reserved_minor = ?, updated_at = ? WHERE id = ?`,
          [Number(newCashBal), Number(newReserved), now, cashAcc.id]
        );

        // Credit Asset Holdings
        const currentAssetBal = BigInt(assetAcc.balance_minor);
        newAssetBal = currentAssetBal + qtyAssetMinor;
        await tx.execute(
          `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
          [Number(newAssetBal), now, assetAcc.id]
        );

        // Credit Fee Treasury
        const currentFeeBal = BigInt(feeAcc.balance_minor);
        const newFeeBal = currentFeeBal + feeCashMinor;
        await tx.execute(
          `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
          [Number(newFeeBal), now, feeAcc.id]
        );

        // Journal Entries
        // 1. Cash Debit (Trade Notional)
        await tx.execute(
          `INSERT INTO ledger_entries (
            id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
            balance_after_minor, currency_or_asset, reference_type, reference_id,
            idempotency_key, order_id, fill_id, description, created_at
          ) VALUES (?, ?, ?, ?, ?, 'debit', ?, ?, ?, 'trade_fill', ?, ?, ?, ?, ?, ?)`,
          [
            `ent_deb_${crypto.randomBytes(8).toString('hex')}`,
            txId,
            cashAcc.id,
            params.userId,
            accountMode,
            Number(notionalCashMinor),
            Number(currentCashBal - notionalCashMinor),
            params.quoteAsset,
            params.orderId,
            idempKey,
            params.orderId,
            params.fillId,
            `BUY ${params.quantity} ${params.baseAsset} @ ${params.price} ${params.quoteAsset}`,
            now,
          ]
        );

        // 2. Fee Debit (Cash Account)
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
            Number(feeCashMinor),
            Number(newCashBal),
            feeAsset,
            params.orderId,
            null,
            params.orderId,
            params.fillId,
            `Trading fee for BUY ${params.orderId}`,
            now,
          ]
        );

        // 3. Fee Credit (Treasury Account)
        await tx.execute(
          `INSERT INTO ledger_entries (
            id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
            balance_after_minor, currency_or_asset, reference_type, reference_id,
            idempotency_key, order_id, fill_id, description, created_at
          ) VALUES (?, ?, ?, ?, ?, 'credit', ?, ?, ?, 'fee', ?, ?, ?, ?, ?, ?)`,
          [
            `ent_crd_fee_${crypto.randomBytes(8).toString('hex')}`,
            txId,
            feeAcc.id,
            params.userId,
            accountMode,
            Number(feeCashMinor),
            Number(newFeeBal),
            feeAsset,
            params.orderId,
            null,
            params.orderId,
            params.fillId,
            `Collected trading fee for BUY ${params.orderId}`,
            now,
          ]
        );

        // 4. Asset Credit (Crypto Holdings)
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
            Number(qtyAssetMinor),
            Number(newAssetBal),
            params.baseAsset,
            params.orderId,
            idempKey,
            params.orderId,
            params.fillId,
            `Acquired ${params.quantity} ${params.baseAsset}`,
            now,
          ]
        );

        // Update Authoritative Position Projection (Capitalized Cost Basis)
        const capitalizedAcquisitionCost = notionalCashMinor + feeCashMinor;
        const priorTotalCost = BigInt(pos.cost_basis_minor);
        const priorTotalQty = BigInt(pos.total_quantity_minor);
        newCostBasisMinor = priorTotalCost + capitalizedAcquisitionCost;
        newTotalQtyMinor = priorTotalQty + qtyAssetMinor;
        const newTotalFees = BigInt(pos.total_fees_minor) + feeCashMinor;

        await tx.execute(
          `UPDATE authoritative_positions SET
            total_quantity_minor = ?, cost_basis_minor = ?, total_fees_minor = ?, updated_at = ?
           WHERE id = ?`,
          [Number(newTotalQtyMinor), Number(newCostBasisMinor), Number(newTotalFees), now, pos.id]
        );
      } else {
        // SELL
        const currentAssetBal = BigInt(assetAcc.balance_minor);
        if (currentAssetBal < qtyAssetMinor) {
          throw new Error(
            `Insufficient asset balance to settle sell fill: current ${currentAssetBal.toString()}, needed ${qtyAssetMinor.toString()}`
          );
        }

        // Release asset reservation for the filled portion
        const currentReserved = BigInt(assetAcc.reserved_minor);
        const releaseAmount = currentReserved >= qtyAssetMinor ? qtyAssetMinor : currentReserved;
        const newReserved = currentReserved - releaseAmount;

        newAssetBal = currentAssetBal - qtyAssetMinor;
        await tx.execute(
          `UPDATE ledger_accounts SET balance_minor = ?, reserved_minor = ?, updated_at = ? WHERE id = ?`,
          [Number(newAssetBal), Number(newReserved), now, assetAcc.id]
        );

        // Realized P&L Calculation:
        // Net Proceeds = Notional - Fee
        // Sold Cost Basis = (Total Cost Basis * Sold Quantity) / Total Quantity
        // Realized P&L = Net Proceeds - Sold Cost Basis
        const priorTotalCost = BigInt(pos.cost_basis_minor);
        const priorTotalQty = BigInt(pos.total_quantity_minor);
        const soldCostBasisMinor = computeSoldCostBasis(priorTotalCost, qtyAssetMinor, priorTotalQty);
        const netProceedsMinor = notionalCashMinor - feeCashMinor;
        realizedPnlMinor = netProceedsMinor - soldCostBasisMinor;

        // Credit Cash Account with Net Proceeds
        const currentCashBal = BigInt(cashAcc.balance_minor);
        newCashBal = currentCashBal + netProceedsMinor;
        await tx.execute(
          `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
          [Number(newCashBal), now, cashAcc.id]
        );

        // Credit Fee Treasury
        const currentFeeBal = BigInt(feeAcc.balance_minor);
        const newFeeBal = currentFeeBal + feeCashMinor;
        await tx.execute(
          `UPDATE ledger_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?`,
          [Number(newFeeBal), now, feeAcc.id]
        );

        // Journal Entries
        // 1. Asset Debit
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
            Number(qtyAssetMinor),
            Number(newAssetBal),
            params.baseAsset,
            params.orderId,
            idempKey,
            params.orderId,
            params.fillId,
            `Disposed ${params.quantity} ${params.baseAsset} @ ${params.price} ${params.quoteAsset}`,
            now,
          ]
        );

        // 2. Cash Credit (Gross Notional)
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
            Number(notionalCashMinor),
            Number(currentCashBal + notionalCashMinor),
            params.quoteAsset,
            params.orderId,
            idempKey,
            params.orderId,
            params.fillId,
            `Gross proceeds from SELL ${params.orderId}`,
            now,
          ]
        );

        // 3. Fee Debit (Cash Account)
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
            Number(feeCashMinor),
            Number(newCashBal),
            feeAsset,
            params.orderId,
            null,
            params.orderId,
            params.fillId,
            `Trading fee for SELL ${params.orderId}`,
            now,
          ]
        );

        // 4. Fee Credit (Treasury Account)
        await tx.execute(
          `INSERT INTO ledger_entries (
            id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
            balance_after_minor, currency_or_asset, reference_type, reference_id,
            idempotency_key, order_id, fill_id, description, created_at
          ) VALUES (?, ?, ?, ?, ?, 'credit', ?, ?, ?, 'fee', ?, ?, ?, ?, ?, ?)`,
          [
            `ent_crd_fee_${crypto.randomBytes(8).toString('hex')}`,
            txId,
            feeAcc.id,
            params.userId,
            accountMode,
            Number(feeCashMinor),
            Number(newFeeBal),
            feeAsset,
            params.orderId,
            null,
            params.orderId,
            params.fillId,
            `Collected trading fee for SELL ${params.orderId}`,
            now,
          ]
        );

        // 5. Realized P&L Journal Entry
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
          [Number(newPnlBal), now, pnlAcc.id]
        );

        const absPnl = realizedPnlMinor < 0n ? -realizedPnlMinor : realizedPnlMinor;
        const pnlEntryType = realizedPnlMinor >= 0n ? 'credit' : 'debit';
        await tx.execute(
          `INSERT INTO ledger_entries (
            id, transaction_id, account_id, user_id, account_mode, entry_type, amount_minor,
            balance_after_minor, currency_or_asset, reference_type, reference_id,
            idempotency_key, order_id, fill_id, description, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'realized_pnl', ?, ?, ?, ?, ?, ?)`,
          [
            `ent_pnl_${crypto.randomBytes(8).toString('hex')}`,
            txId,
            pnlAcc.id,
            params.userId,
            accountMode,
            pnlEntryType,
            Number(absPnl),
            Number(newPnlBal),
            params.quoteAsset,
            params.orderId,
            null,
            params.orderId,
            params.fillId,
            `Realized P&L on SELL ${params.baseAsset}: ${realizedPnlMinor >= 0n ? '+' : ''}${fromCashMinor(realizedPnlMinor)} ${params.quoteAsset}`,
            now,
          ]
        );

        // Update Authoritative Position Projection
        newTotalQtyMinor = priorTotalQty >= qtyAssetMinor ? priorTotalQty - qtyAssetMinor : 0n;
        newCostBasisMinor =
          newTotalQtyMinor === 0n
            ? 0n
            : priorTotalCost >= soldCostBasisMinor
              ? priorTotalCost - soldCostBasisMinor
              : 0n;
        const newRealizedPnl = BigInt(pos.realized_pnl_minor) + realizedPnlMinor;
        const newTotalFees = BigInt(pos.total_fees_minor) + feeCashMinor;

        await tx.execute(
          `UPDATE authoritative_positions SET
            total_quantity_minor = ?, cost_basis_minor = ?, realized_pnl_minor = ?,
            total_fees_minor = ?, updated_at = ?
           WHERE id = ?`,
          [
            Number(newTotalQtyMinor),
            Number(newCostBasisMinor),
            Number(newRealizedPnl),
            Number(newTotalFees),
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
        `UPDATE exchange_fills SET ledger_processed = 1, ledger_transaction_id = ? WHERE order_id = ? AND exchange_trade_id = ?`,
        [txId, params.orderId, params.fillId]
      );

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
          quantity: params.quantity,
          price: params.price,
          feeMinor: Number(feeCashMinor),
          realizedPnlMinor: realizedPnlMinor !== undefined ? Number(realizedPnlMinor) : undefined,
          transactionId: txId,
        },
        result: 'SUCCESS',
      });

      return {
        alreadyProcessed: false,
        transactionId: txId,
        cashBalanceAfterMinor: newCashBal,
        assetBalanceAfterMinor: newAssetBal,
        feeMinor: feeCashMinor,
        realizedPnlMinor,
        costBasisMinor: newCostBasisMinor,
        totalQuantityMinor: newTotalQtyMinor,
      };
    });
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

      const totalQty = fromAssetMinor(totalQtyMinor);
      const reservedQty = fromAssetMinor(reservedQtyMinor);
      const costBasisUSD = fromCashMinor(costBasisMinor);
      const avgCostBasisUSD = totalQty > 0 ? costBasisUSD / totalQty : 0;

      positions[p.asset] = {
        asset: p.asset,
        totalQuantityMinor: totalQtyMinor,
        reservedQuantityMinor: reservedQtyMinor,
        availableQuantityMinor: totalQtyMinor >= reservedQtyMinor ? totalQtyMinor - reservedQtyMinor : 0n,
        totalQuantity: totalQty,
        reservedQuantity: reservedQty,
        availableQuantity: Math.max(0, totalQty - reservedQty),
        costBasisMinor,
        costBasisUSD,
        avgCostBasisUSD,
        realizedPnlMinor: rPnlMinor,
        realizedPnlUSD: fromCashMinor(rPnlMinor),
        totalFeesMinor: feesMinor,
        totalFeesUSD: fromCashMinor(feesMinor),
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
        total: fromCashMinor(totalCashMinor),
        reserved: fromCashMinor(reservedCashMinor),
        available: fromCashMinor(availableCashMinor),
        currency: preferredCurrency,
      },
      positions,
      pnl: {
        realizedPnlMinor: cumulativeRealizedPnlMinor,
        realizedPnlUSD: fromCashMinor(cumulativeRealizedPnlMinor),
        totalFeesMinor: cumulativeTotalFeesMinor,
        totalFeesUSD: fromCashMinor(cumulativeTotalFeesMinor),
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
      const acc = await this.getOrCreateAccount(
        params.userId,
        params.accountType,
        params.assetOrCurrency,
        accountMode,
        tx
      );

      const currentBal = BigInt(acc.balance_minor);
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
        [Number(newBal), now, acc.id]
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
          Number(absAmount),
          Number(newBal),
          params.assetOrCurrency,
          params.mismatchId || `mismatch_${now}`,
          params.idempotencyKey || null,
          `Audited Reconciliation Adjustment: ${params.reason}`,
          now,
        ]
      );

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
          adjustmentMinor: Number(adjustment),
          newBalanceMinor: Number(newBal),
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
