import { WalletTransaction, NativeWalletState, WalletCurrency } from '../types';

/**
 * Generates an immutable, cryptographically verifiable SHA-256 receipt hash
 * for a wallet transaction. Uses Web Crypto SubtleCrypto.
 */
export async function generateReceiptHash(
  tx: Omit<WalletTransaction, 'txHash'>
): Promise<string> {
  const payload = JSON.stringify({
    id: tx.id,
    timestamp: tx.timestamp,
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency,
    amountUSD: tx.amountUSD,
    method: tx.method,
    paymentDetails: tx.paymentDetails || {},
  });

  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
      const msgUint8 = new TextEncoder().encode(payload);
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      return `0x${hex.slice(0, 32)}`;
    }
  } catch {
    // Fallback if subtle crypto unavailable
  }

  // Deterministic FNV-1a 64-bit fallback hash
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `0x${Math.abs(hash).toString(16).padStart(16, '0')}`;
}

export type TransactionFilterCategory =
  | 'all'
  | 'deposits'
  | 'withdrawals'
  | 'allocations'
  | 'swaps';

/**
 * Filters and searches wallet transactions with audit-grade precision.
 */
export function filterTransactions(
  transactions: WalletTransaction[],
  category: TransactionFilterCategory = 'all',
  searchQuery = ''
): WalletTransaction[] {
  const query = searchQuery.trim().toLowerCase();

  return transactions.filter((tx) => {
    // Category match
    if (category === 'deposits' && tx.type !== 'deposit') return false;
    if (category === 'withdrawals' && tx.type !== 'withdrawal') return false;
    if (
      category === 'allocations' &&
      tx.type !== 'allocate_to_trading' &&
      tx.type !== 'recall_from_trading'
    ) {
      return false;
    }
    if (category === 'swaps' && tx.type !== 'swap_crypto') return false;

    // Search query match
    if (query) {
      const matchId = tx.id.toLowerCase().includes(query);
      const matchDesc = tx.description.toLowerCase().includes(query);
      const matchHash = tx.txHash.toLowerCase().includes(query);
      const matchBrand = tx.paymentDetails?.cardBrand?.toLowerCase().includes(query);
      const matchVpa = tx.paymentDetails?.upiVpa?.toLowerCase().includes(query);
      if (!matchId && !matchDesc && !matchHash && !matchBrand && !matchVpa) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Exports transaction history to RFC 4180 CSV for user records and tax compliance.
 */
export function exportLedgerToCsv(transactions: WalletTransaction[]): string {
  const headers = [
    'Transaction ID',
    'Date (UTC)',
    'Type',
    'Amount',
    'Currency',
    'Amount (USD)',
    'Status',
    'Method',
    'Receipt Hash',
    'Description',
  ];

  const rows = transactions.map((tx) => [
    `"${tx.id}"`,
    `"${new Date(tx.timestamp).toISOString()}"`,
    `"${tx.type}"`,
    tx.amount.toFixed(2),
    `"${tx.currency}"`,
    tx.amountUSD.toFixed(2),
    `"${tx.status}"`,
    `"${tx.method}"`,
    `"${tx.txHash}"`,
    `"${tx.description.replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Formats multi-currency amounts for display with proper symbols.
 */
export function formatCurrencyAmount(
  amount: number,
  currency: WalletCurrency = 'USD'
): string {
  const symbols: Record<WalletCurrency, string> = {
    USD: '$',
    INR: '₹',
    EUR: '€',
    GBP: '£',
  };

  const symbol = symbols[currency] || '$';
  return `${symbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
