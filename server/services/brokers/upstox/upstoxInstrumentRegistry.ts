/**
 * Authoritative Upstox Indian Equities Instrument Registry
 * 
 * Provides verified metadata for NSE/BSE equities:
 * - Authoritative Upstox instrument_key (e.g. NSE_EQ|INE002A01018)
 * - Exchange, segment, ISIN, tick size (0.05 INR), lot size (1 for cash)
 * - Freeze quantity (exchange max per-order slice limit)
 * - Dynamic price bands / circuit limits (upper / lower circuit)
 */

export interface AuthoritativeInstrument {
  instrumentKey: string;
  tradingSymbol: string;
  companyName: string;
  exchange: 'NSE' | 'BSE';
  segment: 'NSE_EQ' | 'BSE_EQ' | 'NSE_FO' | 'BSE_FO' | string;
  isin: string;
  tickSize: number;
  lotSize: number;
  minQuantity: number;
  maxQuantity: number;
  freezeQuantity: number;
  currency: 'INR';
  lowerCircuitLimit?: number;
  upperCircuitLimit?: number;
  lastPrice?: number;
  active: boolean;
  instrumentType?: 'EQUITY' | 'FUT' | 'OPT' | 'INDEX';
  expiryDate?: string;
  strikePrice?: number;
  optionType?: 'CE' | 'PE';
  contractMultiplier?: number;
}

export class UpstoxInstrumentRegistry {
  // Master definitions for liquid Nifty 50, F&O derivatives, and major Indian equities
  private static readonly MASTER_INSTRUMENTS: Record<string, AuthoritativeInstrument> = {
    NIFTY_FUT: {
      instrumentKey: 'NSE_FO|NIFTY24SEP',
      tradingSymbol: 'NIFTY_FUT',
      companyName: 'Nifty 50 Futures',
      exchange: 'NSE',
      segment: 'NSE_FO',
      isin: 'NSE_FO_NIFTY_FUT',
      tickSize: 0.05,
      lotSize: 25,
      minQuantity: 25,
      maxQuantity: 1800,
      freezeQuantity: 1800,
      currency: 'INR',
      instrumentType: 'FUT',
      contractMultiplier: 1,
      lastPrice: 24650.0,
      active: true,
    },
    BANKNIFTY_FUT: {
      instrumentKey: 'NSE_FO|BANKNIFTY24SEP',
      tradingSymbol: 'BANKNIFTY_FUT',
      companyName: 'Bank Nifty Futures',
      exchange: 'NSE',
      segment: 'NSE_FO',
      isin: 'NSE_FO_BANKNIFTY_FUT',
      tickSize: 0.05,
      lotSize: 15,
      minQuantity: 15,
      maxQuantity: 900,
      freezeQuantity: 900,
      currency: 'INR',
      instrumentType: 'FUT',
      contractMultiplier: 1,
      lastPrice: 51200.0,
      active: true,
    },
    RELIANCE: {
      instrumentKey: 'NSE_EQ|INE002A01018',
      tradingSymbol: 'RELIANCE',
      companyName: 'Reliance Industries Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE002A01018',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 10000,
      currency: 'INR',
      lowerCircuitLimit: 2000.0,
      upperCircuitLimit: 3500.0,
      lastPrice: 2800.0,
      active: true,
    },
    TCS: {
      instrumentKey: 'NSE_EQ|INE467B01029',
      tradingSymbol: 'TCS',
      companyName: 'Tata Consultancy Services Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE467B01029',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 8000,
      currency: 'INR',
      lowerCircuitLimit: 3600.0,
      upperCircuitLimit: 4400.0,
      lastPrice: 4000.0,
      active: true,
    },
    INFY: {
      instrumentKey: 'NSE_EQ|INE009A01021',
      tradingSymbol: 'INFY',
      companyName: 'Infosys Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE009A01021',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 15000,
      currency: 'INR',
      lowerCircuitLimit: 1600.0,
      upperCircuitLimit: 2000.0,
      lastPrice: 1800.0,
      active: true,
    },
    HDFCBANK: {
      instrumentKey: 'NSE_EQ|INE040A01034',
      tradingSymbol: 'HDFCBANK',
      companyName: 'HDFC Bank Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE040A01034',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 20000,
      currency: 'INR',
      lowerCircuitLimit: 1450.0,
      upperCircuitLimit: 1750.0,
      lastPrice: 1600.0,
      active: true,
    },
    ICICIBANK: {
      instrumentKey: 'NSE_EQ|INE090A01021',
      tradingSymbol: 'ICICIBANK',
      companyName: 'ICICI Bank Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE090A01021',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 25000,
      currency: 'INR',
      lowerCircuitLimit: 1050.0,
      upperCircuitLimit: 1300.0,
      lastPrice: 1180.0,
      active: true,
    },
    SBIN: {
      instrumentKey: 'NSE_EQ|INE062A01020',
      tradingSymbol: 'SBIN',
      companyName: 'State Bank of India',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE062A01020',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 30000,
      currency: 'INR',
      lowerCircuitLimit: 720.0,
      upperCircuitLimit: 880.0,
      lastPrice: 800.0,
      active: true,
    },
    BHARTIARTL: {
      instrumentKey: 'NSE_EQ|INE397D01024',
      tradingSymbol: 'BHARTIARTL',
      companyName: 'Bharti Airtel Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE397D01024',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 20000,
      currency: 'INR',
      lowerCircuitLimit: 1400.0,
      upperCircuitLimit: 1750.0,
      lastPrice: 1580.0,
      active: true,
    },
    ITC: {
      instrumentKey: 'NSE_EQ|INE154A01025',
      tradingSymbol: 'ITC',
      companyName: 'ITC Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE154A01025',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 40000,
      currency: 'INR',
      lowerCircuitLimit: 430.0,
      upperCircuitLimit: 530.0,
      lastPrice: 480.0,
      active: true,
    },
    KOTAKBANK: {
      instrumentKey: 'NSE_EQ|INE237A01028',
      tradingSymbol: 'KOTAKBANK',
      companyName: 'Kotak Mahindra Bank Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE237A01028',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 15000,
      currency: 'INR',
      lowerCircuitLimit: 1600.0,
      upperCircuitLimit: 1980.0,
      lastPrice: 1780.0,
      active: true,
    },
    LT: {
      instrumentKey: 'NSE_EQ|INE018A01030',
      tradingSymbol: 'LT',
      companyName: 'Larsen & Toubro Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE018A01030',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 8000,
      currency: 'INR',
      lowerCircuitLimit: 3200.0,
      upperCircuitLimit: 3950.0,
      lastPrice: 3580.0,
      active: true,
    },
    TATAMOTORS: {
      instrumentKey: 'NSE_EQ|INE155A01022',
      tradingSymbol: 'TATAMOTORS',
      companyName: 'Tata Motors Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE155A01022',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 25000,
      currency: 'INR',
      lowerCircuitLimit: 850.0,
      upperCircuitLimit: 1100.0,
      lastPrice: 975.0,
      active: true,
    },
    MARUTI: {
      instrumentKey: 'NSE_EQ|INE585B01010',
      tradingSymbol: 'MARUTI',
      companyName: 'Maruti Suzuki India Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE585B01010',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 3000,
      currency: 'INR',
      lowerCircuitLimit: 11000.0,
      upperCircuitLimit: 13500.0,
      lastPrice: 12200.0,
      active: true,
    },
    SUNPHARMA: {
      instrumentKey: 'NSE_EQ|INE044A01036',
      tradingSymbol: 'SUNPHARMA',
      companyName: 'Sun Pharmaceutical Industries Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE044A01036',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 15000,
      currency: 'INR',
      lowerCircuitLimit: 1550.0,
      upperCircuitLimit: 1900.0,
      lastPrice: 1720.0,
      active: true,
    },
    TATASTEEL: {
      instrumentKey: 'NSE_EQ|INE081A01020',
      tradingSymbol: 'TATASTEEL',
      companyName: 'Tata Steel Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE081A01020',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 50000,
      currency: 'INR',
      lowerCircuitLimit: 135.0,
      upperCircuitLimit: 175.0,
      lastPrice: 155.0,
      active: true,
    },
    AXISBANK: {
      instrumentKey: 'NSE_EQ|INE238A01034',
      tradingSymbol: 'AXISBANK',
      companyName: 'Axis Bank Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE238A01034',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 20000,
      currency: 'INR',
      lowerCircuitLimit: 1080.0,
      upperCircuitLimit: 1320.0,
      lastPrice: 1200.0,
      active: true,
    },
    BAJFINANCE: {
      instrumentKey: 'NSE_EQ|INE296A01024',
      tradingSymbol: 'BAJFINANCE',
      companyName: 'Bajaj Finance Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE296A01024',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 5000,
      currency: 'INR',
      lowerCircuitLimit: 6200.0,
      upperCircuitLimit: 7800.0,
      lastPrice: 7000.0,
      active: true,
    },
    TITAN: {
      instrumentKey: 'NSE_EQ|INE280A01028',
      tradingSymbol: 'TITAN',
      companyName: 'Titan Company Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE280A01028',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 5000,
      currency: 'INR',
      lowerCircuitLimit: 3000.0,
      upperCircuitLimit: 4000.0,
      lastPrice: 3500.0,
      active: true,
    },
    ASIANPAINT: {
      instrumentKey: 'NSE_EQ|INE021A01026',
      tradingSymbol: 'ASIANPAINT',
      companyName: 'Asian Paints Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE021A01026',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 5000,
      currency: 'INR',
      lowerCircuitLimit: 2500.0,
      upperCircuitLimit: 3500.0,
      lastPrice: 3000.0,
      active: true,
    },
    WIPRO: {
      instrumentKey: 'NSE_EQ|INE075A01022',
      tradingSymbol: 'WIPRO',
      companyName: 'Wipro Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE075A01022',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 10000,
      currency: 'INR',
      lowerCircuitLimit: 400.0,
      upperCircuitLimit: 650.0,
      lastPrice: 520.0,
      active: true,
    },
    NTPC: {
      instrumentKey: 'NSE_EQ|INE733E01010',
      tradingSymbol: 'NTPC',
      companyName: 'NTPC Limited',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE733E01010',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      freezeQuantity: 10000,
      currency: 'INR',
      lowerCircuitLimit: 300.0,
      upperCircuitLimit: 480.0,
      lastPrice: 390.0,
      active: true,
    },
  };

  private static dynamicCache: Map<string, AuthoritativeInstrument> = new Map();

  /**
   * Resolves instrument by symbol, instrument_key, or ISIN.
   * Returns authoritative metadata or null if unverified.
   */
  public static get(symbolOrKey: string): AuthoritativeInstrument | null {
    const raw = symbolOrKey.trim().toUpperCase();
    
    // 1. Direct match by symbol
    if (this.MASTER_INSTRUMENTS[raw]) {
      return this.MASTER_INSTRUMENTS[raw];
    }
    if (this.dynamicCache.has(raw)) {
      return this.dynamicCache.get(raw)!;
    }

    // 2. Format with exchange prefix (e.g. NSE:RELIANCE or NSE_EQ|INE002A01018)
    let extracted = raw;
    if (raw.includes(':')) {
      extracted = raw.split(':')[1];
    } else if (raw.includes('|')) {
      extracted = raw.split('|')[1];
    }

    if (this.MASTER_INSTRUMENTS[extracted]) {
      return this.MASTER_INSTRUMENTS[extracted];
    }
    if (this.dynamicCache.has(extracted)) {
      return this.dynamicCache.get(extracted)!;
    }

    // 3. Match by ISIN or instrumentKey
    for (const inst of Object.values(this.MASTER_INSTRUMENTS)) {
      if (inst.isin === raw || inst.instrumentKey === raw || inst.isin === extracted) {
        return inst;
      }
    }

    return null;
  }

  /**
   * Registers or updates an instrument in the cache (e.g. from Upstox instrument master or live quote).
   */
  public static register(inst: AuthoritativeInstrument): void {
    this.dynamicCache.set(inst.tradingSymbol.toUpperCase(), inst);
    this.dynamicCache.set(inst.instrumentKey.toUpperCase(), inst);
  }

  /**
   * Updates dynamic circuit limits for an instrument.
   */
  public static updateCircuitLimits(
    symbol: string,
    limits: { lower: number; upper: number; lastPrice?: number }
  ): boolean {
    const inst = this.get(symbol);
    if (!inst) return false;
    inst.lowerCircuitLimit = limits.lower;
    inst.upperCircuitLimit = limits.upper;
    if (limits.lastPrice !== undefined) {
      inst.lastPrice = limits.lastPrice;
    }
    this.register(inst);
    return true;
  }

  /**
   * Returns true if the instrument is verified and recognized.
   */
  public static isVerified(symbolOrKey: string): boolean {
    return this.get(symbolOrKey) !== null;
  }

  /**
   * Returns list of all authoritative master and dynamic instruments.
   */
  public static getAll(): AuthoritativeInstrument[] {
    const map = new Map<string, AuthoritativeInstrument>();
    for (const inst of Object.values(this.MASTER_INSTRUMENTS)) {
      map.set(inst.tradingSymbol, inst);
    }
    for (const inst of this.dynamicCache.values()) {
      map.set(inst.tradingSymbol, inst);
    }
    return Array.from(map.values());
  }

  /**
   * Clears dynamic cache (used for test isolation).
   */
  public static resetForTesting(): void {
    this.dynamicCache.clear();
  }
}
