import { describe, it, expect, beforeEach } from 'vitest';
import { FXService, PAPER_SIMULATION_FX_RATE_INR_USD } from '../services/fxService';
import { getDb } from '../db';

describe('Foreign Exchange (FX) Service Suite', () => {
  beforeEach(async () => {
    const db = getDb();
    await db.execute('DELETE FROM fx_quotes');
  });

  it('generates, persists and retrieves paper mode FX quotes correctly', async () => {
    const db = getDb();
    const quote = await FXService.getQuote(db, 'USD', 'INR', { mode: 'paper' });

    expect(quote.quoteId).toBeDefined();
    expect(quote.baseCurrency).toBe('USD');
    expect(quote.quoteCurrency).toBe('INR');
    expect(quote.rateMinor).toBe(PAPER_SIMULATION_FX_RATE_INR_USD);
    expect(quote.effectiveRate).toBe('87.20000000');
    expect(quote.source).toBe('PAPER_SIMULATION');
    expect(quote.validUntil).toBeGreaterThan(Date.now());

    // Verify persisted into fx_quotes table
    const stored = await db.queryOne<any>('SELECT * FROM fx_quotes WHERE id = ?', [quote.quoteId]);
    expect(stored).toBeDefined();
    expect(stored.source).toBe('PAPER_SIMULATION');
    expect(BigInt(stored.rate_minor)).toBe(PAPER_SIMULATION_FX_RATE_INR_USD);

    // Verify getActiveQuote finds it
    const active = await FXService.getActiveQuote(db, 'USD', 'INR');
    expect(active).not.toBeNull();
    expect(active?.quoteId).toBe(quote.quoteId);
  });

  it('performs exact integer arithmetic currency conversions without floating-point errors', async () => {
    const db = getDb();
    const quote = await FXService.getQuote(db, 'USD', 'INR', { mode: 'paper' });

    // $100.00 USD (10,000 cents) at 87.20 INR/USD should be exactly 872,000 paise (₹8,720.00)
    const usdCents = 10_000n;
    const inrPaise = FXService.convertMinor(usdCents, 'USD', 'INR', quote);
    expect(inrPaise).toBe(872_000n);

    // Reverse: ₹8,720.00 (872,000 paise) should convert back to 10,000 cents ($100.00)
    const convertedBackUSD = FXService.convertMinor(inrPaise, 'INR', 'USD', quote);
    expect(convertedBackUSD).toBe(10_000n);

    // Identity conversion
    const identityUSD = FXService.convertMinor(50_000n, 'USD', 'USD', quote);
    expect(identityUSD).toBe(50_000n);
  });

  it('strictly fails-closed in live mode when no authoritative quote is configured', async () => {
    const db = getDb();

    // No quotes exist in DB, and mode is live (or undefined)
    await expect(
      FXService.getQuote(db, 'USD', 'INR', { mode: 'live' })
    ).rejects.toThrow(/FX oracle\/feed must be configured for live mode/);

    await expect(
      FXService.getQuote(db, 'USD', 'INR')
    ).rejects.toThrow(/FX oracle\/feed must be configured for live mode/);
  });

  it('ignores expired quotes in live mode', async () => {
    const db = getDb();
    const expiredTime = Date.now() - 60_000; // 1 minute ago

    await db.execute(
      `INSERT INTO fx_quotes
        (id, base_currency, quote_currency, rate_minor, rate_decimals, effective_rate, source, valid_from, valid_until, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'quote_expired_001',
        'USD',
        'INR',
        '8650000000',
        8,
        '86.50000000',
        'ORACLE_FEED',
        expiredTime - 60_000,
        expiredTime,
        expiredTime - 60_000,
      ]
    );

    const active = await FXService.getActiveQuote(db, 'USD', 'INR');
    expect(active).toBeNull();

    await expect(
      FXService.getQuote(db, 'USD', 'INR', { mode: 'live' })
    ).rejects.toThrow(/FX oracle\/feed must be configured for live mode/);
  });
});
