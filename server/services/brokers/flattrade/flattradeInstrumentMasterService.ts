import crypto from 'node:crypto';
import { BrokerInstrumentCatalogService, CatalogInstrument } from '../shared/brokerInstrumentCatalogService';

export interface FlattradeInstrumentMasterStatus {
  isLoaded: boolean;
  version?: string;
  checksum?: string;
  totalInstruments: number;
  importedAt?: number;
  source: 'BROKER_SCRIP_MASTER' | 'UNAVAILABLE';
}

export class FlattradeInstrumentMasterService {
  private static status: FlattradeInstrumentMasterStatus = {
    isLoaded: false,
    totalInstruments: 0,
    source: 'UNAVAILABLE',
  };

  static async ingestCsv(input: { csv: string; exchange: string; version: string }): Promise<{ count: number; checksum: string }> {
    const records = this.parseCsv(input.csv);
    const instruments = records.map((record) => this.toCatalogInstrument(record, input.exchange)).filter((instrument): instrument is CatalogInstrument => Boolean(instrument));
    if (instruments.length === 0) {
      throw new Error('Flattrade scrip master contains no valid instruments.');
    }
    const checksum = crypto.createHash('sha256').update(input.csv).digest('hex');
    const count = await BrokerInstrumentCatalogService.upsertSnapshot('flattrade', instruments, 'BROKER_SCRIP_MASTER', input.version);
    this.status = {
      isLoaded: true,
      version: input.version,
      checksum,
      totalInstruments: count,
      importedAt: Date.now(),
      source: 'BROKER_SCRIP_MASTER',
    };
    return { count, checksum };
  }

  static getStatus(): FlattradeInstrumentMasterStatus {
    return { ...this.status };
  }

  static resetForTesting(): void {
    this.status = { isLoaded: false, totalInstruments: 0, source: 'UNAVAILABLE' };
  }

  private static toCatalogInstrument(record: Record<string, string>, fallbackExchange: string): CatalogInstrument | null {
    const tradingSymbol = this.value(record, 'TradingSymbol', 'tsym', 'Symbol', 'symbol');
    const token = this.value(record, 'Token', 'token', 'InstrumentToken', 'instrument_token');
    if (!tradingSymbol || !token) return null;
    const exchange = this.value(record, 'Exchange', 'exch', 'Exch') || fallbackExchange;
    const instrumentType = this.inferInstrumentType(this.value(record, 'Instrument', 'instrument', 'InstrumentType', 'instrument_type'), tradingSymbol);
    const expiry = this.value(record, 'Expiry', 'expiry', 'ExpiryDate');
    const strike = this.value(record, 'StrikePrice', 'strike_price', 'Strike');
    const optionType = this.value(record, 'OptionType', 'option_type', 'OptType');
    return {
      broker: 'flattrade',
      exchange,
      segment: exchange,
      instrumentKey: `${exchange}|${token}`,
      tradingSymbol,
      displayName: this.value(record, 'CompanyName', 'company_name', 'Name') || undefined,
      instrumentToken: token,
      instrumentType,
      currency: 'INR',
      tickSize: this.value(record, 'TickSize', 'tick_size', 'Ti') || undefined,
      lotSize: this.toPositiveNumber(this.value(record, 'LotSize', 'lot_size', 'Ls')),
      minQuantity: this.value(record, 'MinQty', 'min_quantity') || undefined,
      maxQuantity: this.value(record, 'MaxQty', 'max_quantity') || undefined,
      expiry: expiry || undefined,
      strike: strike || undefined,
      optionType: optionType === 'CE' || optionType === 'PE' ? optionType : undefined,
      isin: this.value(record, 'ISIN', 'isin') || undefined,
      active: true,
      executionEligible: false,
      source: 'BROKER_SCRIP_MASTER',
      importedAt: Date.now(),
    };
  }

  private static parseCsv(csv: string): Record<string, string>[] {
    const rows = csv.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => this.parseCsvLine(line));
    if (rows.length < 2) return [];
    const headers = rows[0].map((value) => value.trim());
    return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])));
  }

  private static parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (character === ',' && !quoted) {
        fields.push(current.trim());
        current = '';
      } else {
        current += character;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  private static value(record: Record<string, string>, ...keys: string[]): string {
    const byLowercase = Object.fromEntries(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]));
    for (const key of keys) {
      const value = record[key] ?? byLowercase[key.toLowerCase()];
      if (value?.trim()) return value.trim();
    }
    return '';
  }

  private static inferInstrumentType(rawType: string, tradingSymbol: string): string {
    const value = rawType.toUpperCase();
    if (value.includes('OPT') || /(?:CE|PE)$/.test(tradingSymbol)) return 'OPT';
    if (value.includes('FUT') || tradingSymbol.includes('FUT')) return 'FUT';
    if (value.includes('INDEX')) return 'INDEX';
    if (value.includes('CUR')) return 'CURRENCY';
    if (value.includes('COM')) return 'COMMODITY';
    return 'EQUITY';
  }

  private static toPositiveNumber(value: string): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
}
