import { getDb } from '../../../db';
import { BrokerId, BrokerInstrument } from '../brokerTypes';
import { UpstoxInstrumentRegistry } from '../upstox/upstoxInstrumentRegistry';

export type BrokerInstrumentSource = 'BROKER_SCRIP_MASTER' | 'REFERENCE_MAPPING';

export interface CatalogInstrument extends BrokerInstrument {
  displayName?: string;
  executionEligible: boolean;
  source: BrokerInstrumentSource;
  sourceVersion?: string;
  importedAt: number;
}

export class BrokerInstrumentCatalogService {
  static async list(
    broker: BrokerId | string,
    options: { query?: string; exchange?: string; segment?: string; limit?: number } = {},
  ): Promise<CatalogInstrument[]> {
    const clauses = ['broker = ?', 'active = TRUE'];
    const params: any[] = [broker];
    if (options.query?.trim()) {
      clauses.push('(UPPER(trading_symbol) LIKE ? OR UPPER(COALESCE(display_name, \'\')) LIKE ?)');
      const pattern = `%${options.query.trim().toUpperCase()}%`;
      params.push(pattern, pattern);
    }
    if (options.exchange?.trim()) {
      clauses.push('exchange = ?');
      params.push(options.exchange.trim().toUpperCase());
    }
    if (options.segment?.trim()) {
      clauses.push('segment = ?');
      params.push(options.segment.trim());
    }
    params.push(Math.min(Math.max(Number(options.limit) || 100, 1), 500));
    const rows = await getDb().query<any>(
      `SELECT * FROM broker_instruments WHERE ${clauses.join(' AND ')} ORDER BY trading_symbol ASC LIMIT ?`,
      params,
    );
    return rows.map((row) => this.fromRow(row));
  }

  static async get(broker: BrokerId | string, symbolOrKey: string): Promise<CatalogInstrument | null> {
    const row = await getDb().queryOne<any>(
      `SELECT * FROM broker_instruments
       WHERE broker = ? AND active = TRUE AND (instrument_key = ? OR UPPER(trading_symbol) = ?)
       LIMIT 1`,
      [broker, symbolOrKey, symbolOrKey.toUpperCase()],
    );
    return row ? this.fromRow(row) : null;
  }

  static async upsertSnapshot(
    broker: BrokerId | string,
    instruments: CatalogInstrument[],
    source: BrokerInstrumentSource,
    sourceVersion?: string,
  ): Promise<number> {
    if (instruments.length === 0) return 0;
    const now = Date.now();
    await getDb().transaction(async (tx) => {
      for (const instrument of instruments) {
        if (!instrument.instrumentKey || !instrument.tradingSymbol || !instrument.exchange || !instrument.segment) {
          throw new Error('Broker catalog entry is missing an execution identity field.');
        }
        await tx.execute(
          `INSERT INTO broker_instruments (
            broker, instrument_key, trading_symbol, display_name, exchange, segment, instrument_type,
            currency, instrument_token, isin, tick_size, lot_size, min_quantity, max_quantity,
            expiry, strike, option_type, active, execution_eligible, source, source_version, imported_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(broker, instrument_key) DO UPDATE SET
            trading_symbol = excluded.trading_symbol, display_name = excluded.display_name,
            exchange = excluded.exchange, segment = excluded.segment, instrument_type = excluded.instrument_type,
            currency = excluded.currency, instrument_token = excluded.instrument_token, isin = excluded.isin,
            tick_size = excluded.tick_size, lot_size = excluded.lot_size, min_quantity = excluded.min_quantity,
            max_quantity = excluded.max_quantity, expiry = excluded.expiry, strike = excluded.strike,
            option_type = excluded.option_type, active = excluded.active,
            execution_eligible = excluded.execution_eligible, source = excluded.source,
            source_version = excluded.source_version, imported_at = excluded.imported_at, updated_at = excluded.updated_at`,
          [
            broker, instrument.instrumentKey, instrument.tradingSymbol, instrument.displayName || null,
            instrument.exchange, instrument.segment, instrument.instrumentType, instrument.currency,
            instrument.instrumentToken || null, instrument.isin || null, instrument.tickSize || null,
            instrument.lotSize || null, instrument.minQuantity || null, instrument.maxQuantity || null,
            instrument.expiry || null, instrument.strike || null, instrument.optionType || null,
            instrument.active ? 1 : 0, instrument.executionEligible ? 1 : 0, source, sourceVersion || null, now, now,
          ],
        );
      }
    });
    return instruments.length;
  }

  static async bootstrapReferenceEquities(broker: 'kotak_neo' | 'flattrade'): Promise<number> {
    const entries: CatalogInstrument[] = UpstoxInstrumentRegistry.getAll()
      .filter((instrument) => instrument.active)
      .map((instrument) => ({
        broker,
        exchange: instrument.exchange,
        segment: this.referenceSegment(broker, instrument.segment, instrument.exchange),
        instrumentKey: this.referenceInstrumentKey(broker, instrument),
        tradingSymbol: this.referenceTradingSymbol(instrument),
        displayName: instrument.companyName,
        instrumentToken: undefined,
        instrumentType: instrument.instrumentType || 'EQUITY',
        currency: 'INR',
        quoteAsset: 'INR',
        baseAsset: instrument.tradingSymbol,
        tickSize: instrument.tickSize.toFixed(2),
        lotSize: instrument.lotSize,
        minQuantity: String(instrument.minQuantity),
        maxQuantity: String(instrument.maxQuantity),
        isin: instrument.isin,
        active: true,
        executionEligible: false,
        source: 'REFERENCE_MAPPING',
        expiry: instrument.expiryDate,
        strike: instrument.strikePrice === undefined ? undefined : String(instrument.strikePrice),
        optionType: instrument.optionType,
        sourceVersion: 'indian-reference-instruments-v2',
        importedAt: Date.now(),
      }));
    return this.upsertSnapshot(broker, entries, 'REFERENCE_MAPPING', 'indian-reference-instruments-v2');
  }

  private static referenceTradingSymbol(instrument: ReturnType<typeof UpstoxInstrumentRegistry.getAll>[number]): string {
    return (instrument.instrumentType || 'EQUITY') === 'EQUITY' && !instrument.tradingSymbol.endsWith('-EQ')
      ? `${instrument.tradingSymbol}-EQ`
      : instrument.tradingSymbol;
  }

  private static referenceSegment(
    broker: 'kotak_neo' | 'flattrade',
    segment: string,
    exchange: string,
  ): string {
    if (broker === 'kotak_neo') {
      if (segment === 'NSE_EQ') return 'nse_cm';
      if (segment === 'BSE_EQ') return 'bse_cm';
      if (segment === 'NSE_FO') return 'nse_fo';
      if (segment === 'BSE_FO') return 'bse_fo';
      return exchange.toLowerCase();
    }
    if (segment === 'NSE_FO') return 'NFO';
    if (segment === 'BSE_FO') return 'BFO';
    return exchange.toUpperCase();
  }

  private static referenceInstrumentKey(
    broker: 'kotak_neo' | 'flattrade',
    instrument: ReturnType<typeof UpstoxInstrumentRegistry.getAll>[number],
  ): string {
    const segment = this.referenceSegment(broker, instrument.segment, instrument.exchange);
    return `${segment}|${this.referenceTradingSymbol(instrument)}`;
  }

  private static fromRow(row: any): CatalogInstrument {
    return {
      broker: row.broker,
      exchange: row.exchange,
      segment: row.segment,
      instrumentKey: row.instrument_key,
      tradingSymbol: row.trading_symbol,
      displayName: row.display_name || undefined,
      instrumentToken: row.instrument_token || undefined,
      instrumentType: row.instrument_type,
      currency: row.currency,
      tickSize: row.tick_size || undefined,
      lotSize: row.lot_size === null || row.lot_size === undefined ? undefined : Number(row.lot_size),
      minQuantity: row.min_quantity || undefined,
      maxQuantity: row.max_quantity || undefined,
      expiry: row.expiry || undefined,
      strike: row.strike || undefined,
      optionType: row.option_type || undefined,
      isin: row.isin || undefined,
      active: Boolean(row.active),
      executionEligible: Boolean(row.execution_eligible),
      source: row.source,
      sourceVersion: row.source_version || undefined,
      importedAt: Number(row.imported_at),
    };
  }
}
