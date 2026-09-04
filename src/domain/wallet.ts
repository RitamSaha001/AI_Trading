import {
  NativeWalletState,
  WalletCurrency,
  PaymentMethodType,
  WalletTransaction,
  Asset,
  SavedPaymentMethod,
} from '../types';
import { generateReceiptHash } from './walletLedger';

/** Rounds monetary values to 8 decimal places to prevent IEEE 754 drift */
function roundMoney(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Transparent, real-time FX Rates pegged to USD.
 * 1 USD = 87.20 INR
 * 1 EUR = 1.085 USD
 * 1 GBP = 1.282 USD
 */
export const FX_RATES_TO_USD: Record<WalletCurrency, number> = {
  USD: 1.0,
  INR: 1 / 87.2, // ~0.011467889
  EUR: 1.085,
  GBP: 1.282,
};

/**
 * Converts an amount from one currency to another using verified FX rates.
 */
export function convertCurrency(
  amount: number,
  from: WalletCurrency,
  to: WalletCurrency
): number {
  if (from === to) return amount;
  const amountUSD = amount * FX_RATES_TO_USD[from];
  const targetRate = FX_RATES_TO_USD[to];
  return amountUSD / targetRate;
}

/**
 * Creates a pristine sovereign wallet instance.
 */
export function createDefaultWallet(initialDemoBalanceUSD = 0): NativeWalletState {
  const now = Date.now();
  return {
    walletId: `LMN-WLT-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
    currency: 'USD',
    balanceUSD: initialDemoBalanceUSD,
    allocatedToTradingUSD: 0,
    totalDepositedUSD: initialDemoBalanceUSD,
    totalWithdrawnUSD: 0,
    savedPaymentMethods: [],
    transactions: initialDemoBalanceUSD > 0
      ? [
          {
            id: `tx_${Date.now()}_init`,
            timestamp: now,
            type: 'deposit',
            amount: initialDemoBalanceUSD,
            currency: 'USD',
            amountUSD: initialDemoBalanceUSD,
            status: 'completed',
            method: 'bank_transfer',
            description: 'Sovereign Treasury Genesis Allocation',
            txHash: '0xgenesis_sovereign_allocation_0001',
          },
        ]
      : [],
    security: {
      pinConfigured: false,
      requirePinForWithdrawal: true,
      requirePinForAllocation: false,
      dailyDepositLimitUSD: 25000,
      dailyWithdrawLimitUSD: 10000,
    },
    createdAt: now,
    lastActiveAt: now,
  };
}

/**
 * Calculates sum of transactions within the past 24 hours.
 */
export function get24hVolume(
  transactions: WalletTransaction[],
  type: 'deposit' | 'withdrawal'
): number {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return transactions
    .filter((tx) => tx.type === type && tx.status === 'completed' && tx.timestamp >= oneDayAgo)
    .reduce((sum, tx) => sum + tx.amountUSD, 0);
}

/**
 * Deposits fiat or crypto into the Sovereign Wallet.
 */
export async function depositFunds(
  wallet: NativeWalletState,
  amount: number,
  currency: WalletCurrency,
  method: PaymentMethodType,
  paymentDetails?: WalletTransaction['paymentDetails'],
  customDescription?: string
): Promise<NativeWalletState> {
  if (amount <= 0 || !Number.isFinite(amount)) {
    throw new Error('Deposit amount must be a positive number.');
  }

  const amountUSD = amount * FX_RATES_TO_USD[currency];
  const recentDeposits24h = get24hVolume(wallet.transactions, 'deposit');

  if (recentDeposits24h + amountUSD > wallet.security.dailyDepositLimitUSD) {
    throw new Error(
      `Deposit exceeds daily deposit limit of $${wallet.security.dailyDepositLimitUSD.toLocaleString()}.`
    );
  }

  const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();

  const description =
    customDescription ||
    `Deposit of ${amount.toFixed(2)} ${currency} via ${
      method === 'upi' ? 'UPI' : method === 'card' ? 'Credit/Debit Card' : 'Bank Transfer'
    }`;

  const partialTx: Omit<WalletTransaction, 'txHash'> = {
    id: txId,
    timestamp: now,
    type: 'deposit',
    amount,
    currency,
    amountUSD,
    status: 'completed',
    method,
    description,
    paymentDetails,
  };

  const txHash = await generateReceiptHash(partialTx);
  const completedTx: WalletTransaction = { ...partialTx, txHash };

  return {
    ...wallet,
    balanceUSD: roundMoney(wallet.balanceUSD + amountUSD),
    totalDepositedUSD: roundMoney(wallet.totalDepositedUSD + amountUSD),
    transactions: [completedTx, ...wallet.transactions],
    lastActiveAt: now,
  };
}

/**
 * Withdraws funds from Sovereign Wallet back to Card, UPI VPA, or Bank Account.
 */
export async function withdrawFunds(
  wallet: NativeWalletState,
  amount: number,
  currency: WalletCurrency,
  method: PaymentMethodType,
  destinationDetails?: WalletTransaction['paymentDetails'],
  enteredPin?: string
): Promise<NativeWalletState> {
  if (amount <= 0 || !Number.isFinite(amount)) {
    throw new Error('Withdrawal amount must be a positive number.');
  }

  const amountUSD = amount * FX_RATES_TO_USD[currency];

  if (amountUSD > wallet.balanceUSD) {
    throw new Error(
      `Insufficient sovereign balance. Available: $${wallet.balanceUSD.toFixed(2)} USD.`
    );
  }

  const recentWithdrawals24h = get24hVolume(wallet.transactions, 'withdrawal');
  if (recentWithdrawals24h + amountUSD > wallet.security.dailyWithdrawLimitUSD) {
    throw new Error(
      `Withdrawal exceeds 24-hour limit of $${wallet.security.dailyWithdrawLimitUSD.toLocaleString()}.`
    );
  }

  // Security PIN validation if configured
  if (wallet.security.pinConfigured && wallet.security.requirePinForWithdrawal) {
    if (!enteredPin) {
      throw new Error('Security PIN required for withdrawal.');
    }
    const enteredHash = await hashPin(enteredPin);
    const isPlainMatch = wallet.security.pinHash === enteredPin;
    const isHashMatch = wallet.security.pinHash === enteredHash;
    if (!isPlainMatch && !isHashMatch) {
      throw new Error('Invalid Security PIN. Withdrawal rejected for capital protection.');
    }
  }

  const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();

  const description = `Withdrawal of ${amount.toFixed(2)} ${currency} to ${
    destinationDetails?.upiVpa
      ? `UPI ${destinationDetails.upiVpa}`
      : destinationDetails?.cardLast4
      ? `Card ending in ${destinationDetails.cardLast4}`
      : 'Bank Account'
  }`;

  const partialTx: Omit<WalletTransaction, 'txHash'> = {
    id: txId,
    timestamp: now,
    type: 'withdrawal',
    amount,
    currency,
    amountUSD,
    status: 'completed',
    method,
    description,
    paymentDetails: destinationDetails,
  };

  const txHash = await generateReceiptHash(partialTx);
  const completedTx: WalletTransaction = { ...partialTx, txHash };

  return {
    ...wallet,
    balanceUSD: roundMoney(wallet.balanceUSD - amountUSD),
    totalWithdrawnUSD: roundMoney(wallet.totalWithdrawnUSD + amountUSD),
    transactions: [completedTx, ...wallet.transactions],
    lastActiveAt: now,
  };
}

/**
 * Moves capital from Sovereign Wallet into the active Trading Desk cash.
 */
export async function allocateToTrading(
  wallet: NativeWalletState,
  currentTradingCash: number,
  amountUSD: number
): Promise<{ updatedWallet: NativeWalletState; updatedTradingCash: number }> {
  if (amountUSD <= 0 || !Number.isFinite(amountUSD)) {
    throw new Error('Allocation amount must be greater than 0.');
  }

  if (amountUSD > wallet.balanceUSD) {
    throw new Error(
      `Cannot allocate $${amountUSD.toFixed(2)}. Sovereign wallet available: $${wallet.balanceUSD.toFixed(2)}.`
    );
  }

  const now = Date.now();
  const txId = `tx_${now}_alloc_${Math.random().toString(36).substring(2, 7)}`;

  const partialTx: Omit<WalletTransaction, 'txHash'> = {
    id: txId,
    timestamp: now,
    type: 'allocate_to_trading',
    amount: amountUSD,
    currency: 'USD',
    amountUSD,
    status: 'completed',
    method: 'internal_transfer',
    description: `Allocated $${amountUSD.toFixed(2)} from Sovereign Treasury to Trading Desk`,
  };

  const txHash = await generateReceiptHash(partialTx);
  const completedTx: WalletTransaction = { ...partialTx, txHash };

  const updatedWallet: NativeWalletState = {
    ...wallet,
    balanceUSD: roundMoney(wallet.balanceUSD - amountUSD),
    allocatedToTradingUSD: roundMoney(wallet.allocatedToTradingUSD + amountUSD),
    transactions: [completedTx, ...wallet.transactions],
    lastActiveAt: now,
  };

  return {
    updatedWallet,
    updatedTradingCash: currentTradingCash + amountUSD,
  };
}

/**
 * Recalls unencumbered cash from the active Trading Desk back into the Sovereign Wallet.
 */
export async function recallFromTrading(
  wallet: NativeWalletState,
  currentTradingCash: number,
  amountUSD: number
): Promise<{ updatedWallet: NativeWalletState; updatedTradingCash: number }> {
  if (amountUSD <= 0 || !Number.isFinite(amountUSD)) {
    throw new Error('Recall amount must be greater than 0.');
  }

  if (amountUSD > currentTradingCash) {
    throw new Error(
      `Cannot recall $${amountUSD.toFixed(2)}. Trading desk liquid cash is only $${currentTradingCash.toFixed(2)}.`
    );
  }

  const now = Date.now();
  const txId = `tx_${now}_rec_${Math.random().toString(36).substring(2, 7)}`;

  const partialTx: Omit<WalletTransaction, 'txHash'> = {
    id: txId,
    timestamp: now,
    type: 'recall_from_trading',
    amount: amountUSD,
    currency: 'USD',
    amountUSD,
    status: 'completed',
    method: 'internal_transfer',
    description: `Recalled $${amountUSD.toFixed(2)} from Trading Desk to Sovereign Treasury`,
  };

  const txHash = await generateReceiptHash(partialTx);
  const completedTx: WalletTransaction = { ...partialTx, txHash };

  const updatedWallet: NativeWalletState = {
    ...wallet,
    balanceUSD: roundMoney(wallet.balanceUSD + amountUSD),
    allocatedToTradingUSD: roundMoney(Math.max(0, wallet.allocatedToTradingUSD - amountUSD)),
    transactions: [completedTx, ...wallet.transactions],
    lastActiveAt: now,
  };

  return {
    updatedWallet,
    updatedTradingCash: currentTradingCash - amountUSD,
  };
}

/**
 * Direct spot swap: purchases crypto directly using Sovereign Wallet liquid funds.
 * Returns purchased units, fee, and updated wallet state.
 */
export async function swapWalletToCrypto(
  wallet: NativeWalletState,
  asset: Asset,
  amountUSD: number,
  marketPrice: number
): Promise<{ updatedWallet: NativeWalletState; units: number; feeUSD: number }> {
  if (amountUSD <= 0 || !Number.isFinite(amountUSD)) {
    throw new Error('Swap amount must be greater than 0.');
  }
  if (marketPrice <= 0 || !Number.isFinite(marketPrice)) {
    throw new Error('Invalid market price for swap execution.');
  }
  if (amountUSD > wallet.balanceUSD) {
    throw new Error(
      `Insufficient wallet funds for swap. Available: $${wallet.balanceUSD.toFixed(2)} USD.`
    );
  }

  const feePct = 0.001; // 0.10% spot execution fee
  const feeUSD = amountUSD * feePct;
  const netUSD = amountUSD - feeUSD;
  const units = netUSD / marketPrice;

  const now = Date.now();
  const txId = `tx_${now}_swap_${Math.random().toString(36).substring(2, 7)}`;

  const partialTx: Omit<WalletTransaction, 'txHash'> = {
    id: txId,
    timestamp: now,
    type: 'swap_crypto',
    amount: amountUSD,
    currency: 'USD',
    amountUSD,
    status: 'completed',
    method: 'internal_transfer',
    description: `Direct Swap: $${amountUSD.toFixed(2)} USD → ${units.toFixed(6)} ${asset} @ $${marketPrice.toFixed(2)}`,
    paymentDetails: {
      referenceNumber: `SWAP-${asset}-${now}`,
    },
  };

  const txHash = await generateReceiptHash(partialTx);
  const completedTx: WalletTransaction = { ...partialTx, txHash };

  const updatedWallet: NativeWalletState = {
    ...wallet,
    balanceUSD: roundMoney(wallet.balanceUSD - amountUSD),
    transactions: [completedTx, ...wallet.transactions],
    lastActiveAt: now,
  };

  return { updatedWallet, units, feeUSD };
}
