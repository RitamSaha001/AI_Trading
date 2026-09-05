import crypto from 'node:crypto';
import { DBClient } from '../db';

export interface FXQuote {
  quoteId: string;
  baseCurrency: string;
  quoteCurrency: string;
  rateMinor: bigint;
  effectiveRate: string;
  source: string;
  validUntil: number;
}

/**
 * Paper/Sandbox simulation rate ONLY: 1 USD = 87.20 INR, scaled to 1e8 for integer arithmetic.
 * Live mode MUST use server-authoritative FX quotes from an institutional oracle/bank feed.
 */
export const PAPER_SIMULATION_FX_RATE_INR_USD = 8720000000n; // 87.20 * 1e8

export class FXService {
  /**
   * Obtains an FX quote for the given currency pair.
   *
   * - In paper mode: returns a simulation quote using the fixed PAPER_SIMULATION_FX_RATE_INR_USD.
   * - In live mode: fetches the most recent unexpired quote from the fx_quotes table.
   *   If no valid quote exists, throws an error — live mode NEVER falls back to hardcoded rates.
   *
   * All quotes are persisted to the fx_quotes table for auditability.
   */
  static async getQuote(
    db: DBClient,
    baseCurrency: string,
    quoteCurrency: string,
    options?: { mode?: 'paper' | 'live' }
  ): Promise<FXQuote> {
    if (options?.mode === 'paper') {
      if (
        (baseCurrency === 'USD' && quoteCurrency === 'INR') ||
        (baseCurrency === 'INR' && quoteCurrency === 'USD')
      ) {
        const quoteId = crypto.randomUUID();
        const now = Date.now();
        const validUntil = now + 24 * 60 * 60 * 1000; // 24h validity for paper quotes

        const quote: FXQuote = {
          quoteId,
          baseCurrency: 'USD',
          quoteCurrency: 'INR',
          rateMinor: PAPER_SIMULATION_FX_RATE_INR_USD,
          effectiveRate: '87.20000000',
          source: 'PAPER_SIMULATION',
          validUntil,
        };

        await db.execute(
          `INSERT INTO fx_quotes
            (id, base_currency, quote_currency, rate_minor, rate_decimals, effective_rate, source, valid_from, valid_until, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            quoteId,
            'USD',
            'INR',
            PAPER_SIMULATION_FX_RATE_INR_USD.toString(),
            8,
            '87.20000000',
            'PAPER_SIMULATION',
            now,
            validUntil,
            now,
          ]
        );

        return quote;
      }
      throw new Error(`Unsupported currency pair for paper mode: ${baseCurrency}/${quoteCurrency}`);
    }

    // Live mode: query for active unexpired quote
    const activeQuote = await this.getActiveQuote(db, baseCurrency, quoteCurrency);
    if (!activeQuote) {
      throw new Error(
        `No valid FX quote for ${baseCurrency}/${quoteCurrency}. ` +
        `FX oracle/feed must be configured for live mode. Live settlement cannot proceed without an authoritative exchange rate.`
      );
    }
    return activeQuote;
  }

  /**
   * Fetches the most recent non-expired FX quote from the database.
   */
  static async getActiveQuote(
    db: DBClient,
    baseCurrency: string,
    quoteCurrency: string
  ): Promise<FXQuote | null> {
    const now = Date.now();
    const row = await db.queryOne<{
      id: string;
      base_currency: string;
      quote_currency: string;
      rate_minor: string | bigint;
      effective_rate: string;
      source: string;
      valid_until: number | bigint;
    }>(
      `SELECT id, base_currency, quote_currency, rate_minor, effective_rate, source, valid_until
       FROM fx_quotes
       WHERE base_currency = ? AND quote_currency = ? AND valid_until > ?
       ORDER BY created_at DESC LIMIT 1`,
      [baseCurrency, quoteCurrency, now]
    );

    if (!row) {
      return null;
    }

    return {
      quoteId: row.id,
      baseCurrency: row.base_currency,
      quoteCurrency: row.quote_currency,
      rateMinor: BigInt(row.rate_minor),
      effectiveRate: row.effective_rate,
      source: row.source,
      validUntil: Number(row.valid_until),
    };
  }

  /**
   * Pure integer arithmetic currency conversion using a persisted FX quote.
   *
   * The quote's rateMinor is the USD→INR rate scaled by 1e8.
   * For example, 87.20 INR/USD → rateMinor = 8720000000n
   *
   * USD→INR: resultMinor = (amountMinor * rateMinor) / 100_000_000n
   * INR→USD: resultMinor = (amountMinor * 100_000_000n) / rateMinor
   *
   * Uses BigInt throughout — zero floating-point math.
   */
  static convertMinor(
    amountMinor: bigint,
    fromCurrency: string,
    toCurrency: string,
    quote: FXQuote
  ): bigint {
    if (fromCurrency === toCurrency) {
      return amountMinor;
    }

    if (fromCurrency === 'USD' && toCurrency === 'INR') {
      return (amountMinor * quote.rateMinor) / 100_000_000n;
    } else if (fromCurrency === 'INR' && toCurrency === 'USD') {
      return (amountMinor * 100_000_000n) / quote.rateMinor;
    }

    throw new Error(`Unsupported conversion: ${fromCurrency} → ${toCurrency}`);
  }
}
