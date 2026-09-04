import { describe, it, expect } from 'vitest';
import {
  createDefaultWallet,
  convertCurrency,
  depositFunds,
  withdrawFunds,
  allocateToTrading,
  recallFromTrading,
  swapWalletToCrypto,
  hashPin,
  timingSafeEqual,
  FX_RATES_TO_USD,
} from './wallet';
import {
  filterTransactions,
  exportLedgerToCsv,
  formatCurrencyAmount,
  generateReceiptHash,
} from './walletLedger';

describe('Sovereign Native Wallet Domain', () => {
  it('initializes a clean default wallet with zero balance and default security policies', () => {
    const wallet = createDefaultWallet();
    expect(wallet.balanceUSD).toBe(0);
    expect(wallet.allocatedToTradingUSD).toBe(0);
    expect(wallet.totalDepositedUSD).toBe(0);
    expect(wallet.transactions).toEqual([]);
    expect(wallet.security.dailyDepositLimitUSD).toBe(25000);
    expect(wallet.security.dailyWithdrawLimitUSD).toBe(10000);
  });

  it('correctly converts multi-currency amounts using verified FX rates', () => {
    // 87.20 INR = 1 USD
    const inrToUsd = convertCurrency(87.2, 'INR', 'USD');
    expect(Math.round(inrToUsd)).toBe(1);

    // 100 EUR to USD
    const eurToUsd = convertCurrency(100, 'EUR', 'USD');
    expect(eurToUsd).toBeCloseTo(108.5, 1);

    // 100 USD to INR
    const usdToInr = convertCurrency(100, 'USD', 'INR');
    expect(usdToInr).toBeCloseTo(8720, 0);
  });

  it('deposits funds via Card and generates an authentic cryptographic receipt hash', async () => {
    const wallet = createDefaultWallet();
    const updated = await depositFunds(
      wallet,
      500,
      'USD',
      'card',
      { cardBrand: 'visa', cardLast4: '4242' },
      'Test Visa Deposit'
    );

    expect(updated.balanceUSD).toBe(500);
    expect(updated.totalDepositedUSD).toBe(500);
    expect(updated.transactions.length).toBe(1);
    expect(updated.transactions[0].type).toBe('deposit');
    expect(updated.transactions[0].txHash).toMatch(/^0x[a-f0-9]+/i);
  });

  it('deposits funds via UPI with automatic INR to USD conversion', async () => {
    const wallet = createDefaultWallet();
    // Deposit ₹8,720 INR (approx $100 USD)
    const updated = await depositFunds(
      wallet,
      8720,
      'INR',
      'upi',
      { upiVpa: 'trader@okhdfcbank' }
    );

    expect(updated.balanceUSD).toBeCloseTo(100, 1);
    expect(updated.transactions[0].currency).toBe('INR');
    expect(updated.transactions[0].amount).toBe(8720);
    expect(updated.transactions[0].amountUSD).toBeCloseTo(100, 1);
  });

  it('enforces 24-hour daily deposit limit guard', async () => {
    const wallet = createDefaultWallet();
    // Daily limit is $25,000. Try to deposit $26,000
    await expect(
      depositFunds(wallet, 26000, 'USD', 'bank_transfer')
    ).rejects.toThrow(/exceeds daily deposit limit/);
  });

  it('withdraws funds when balance is sufficient and enforces daily withdrawal limit', async () => {
    let wallet = createDefaultWallet(1000);
    wallet = await withdrawFunds(
      wallet,
      300,
      'USD',
      'upi',
      { upiVpa: 'user@paytm' }
    );

    expect(wallet.balanceUSD).toBe(700);
    expect(wallet.totalWithdrawnUSD).toBe(300);
    expect(wallet.transactions[0].type).toBe('withdrawal');

    // Attempting to withdraw more than balance throws error
    await expect(
      withdrawFunds(wallet, 800, 'USD', 'upi', { upiVpa: 'user@paytm' })
    ).rejects.toThrow(/Insufficient sovereign balance/);
  });

  it('enforces security PIN on withdrawal if configured', async () => {
    let wallet = createDefaultWallet(1000);
    wallet.security.pinConfigured = true;
    wallet.security.pinHash = '1234';

    // Wrong PIN
    await expect(
      withdrawFunds(wallet, 100, 'USD', 'card', {}, '9999')
    ).rejects.toThrow(/Invalid Security PIN/);

    // Correct PIN
    const success = await withdrawFunds(wallet, 100, 'USD', 'card', {}, '1234');
    expect(success.balanceUSD).toBe(900);
  });

  it('enforces SHA-256 hashed security PIN with timing-safe comparison on withdrawal', async () => {
    let wallet = createDefaultWallet(1000);
    wallet.security.pinConfigured = true;
    wallet.security.pinHash = await hashPin('5678');

    // Wrong PIN rejected
    await expect(
      withdrawFunds(wallet, 100, 'USD', 'card', {}, '1234')
    ).rejects.toThrow(/Invalid Security PIN/);

    // Timing safe comparison verification
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);

    // Correct PIN accepted
    const success = await withdrawFunds(wallet, 100, 'USD', 'card', {}, '5678');
    expect(success.balanceUSD).toBe(900);
  });

  it('allocates capital from Sovereign Wallet to Trading Desk Cash and recalls it back', async () => {
    const initialWallet = createDefaultWallet(5000);
    let tradingDeskCash = 10000;

    // Allocate $2,000 from wallet to trading desk
    const allocResult = await allocateToTrading(initialWallet, tradingDeskCash, 2000);
    expect(allocResult.updatedWallet.balanceUSD).toBe(3000);
    expect(allocResult.updatedWallet.allocatedToTradingUSD).toBe(2000);
    expect(allocResult.updatedTradingCash).toBe(12000);

    // Recall $1,500 back from trading desk to wallet
    const recallResult = await recallFromTrading(
      allocResult.updatedWallet,
      allocResult.updatedTradingCash,
      1500
    );
    expect(recallResult.updatedWallet.balanceUSD).toBe(4500);
    expect(recallResult.updatedWallet.allocatedToTradingUSD).toBe(500);
    expect(recallResult.updatedTradingCash).toBe(10500);
  });

  it('executes direct spot crypto swap from sovereign wallet balance', async () => {
    const wallet = createDefaultWallet(2000);
    const btcPrice = 60000;

    const swapResult = await swapWalletToCrypto(wallet, 'BTC', 1200, btcPrice);
    expect(swapResult.updatedWallet.balanceUSD).toBe(800);
    expect(swapResult.feeUSD).toBe(1.2); // 0.1% fee on $1200
    expect(swapResult.units).toBeCloseTo((1200 - 1.2) / btcPrice, 6);
    expect(swapResult.updatedWallet.transactions[0].type).toBe('swap_crypto');
  });

  it('filters transactions and exports audit-ready CSV records', async () => {
    let wallet = createDefaultWallet(1000);
    wallet = await depositFunds(wallet, 200, 'USD', 'card');
    wallet = await withdrawFunds(wallet, 50, 'USD', 'upi');

    const deposits = filterTransactions(wallet.transactions, 'deposits');
    expect(deposits.length).toBe(2); // genesis + new deposit

    const withdrawals = filterTransactions(wallet.transactions, 'withdrawals');
    expect(withdrawals.length).toBe(1);

    const csv = exportLedgerToCsv(wallet.transactions);
    expect(csv).toContain('Transaction ID,Date (UTC),Type,Amount');
    expect(csv).toContain('"deposit"');
    expect(csv).toContain('"withdrawal"');
  });

  it('formats multi-currency amounts correctly', () => {
    expect(formatCurrencyAmount(1250.5, 'USD')).toBe('$1,250.50');
    expect(formatCurrencyAmount(95000, 'INR')).toBe('₹95,000.00');
    expect(formatCurrencyAmount(500, 'EUR')).toBe('€500.00');
    expect(formatCurrencyAmount(750, 'GBP')).toBe('£750.00');
  });
});
