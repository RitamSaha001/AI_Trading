/**
 * LUMEN-ASTRA-FIN 1.0: FINANCIAL TOKENIZER & ENTITY EXTRACTOR
 * Custom domain tokenizer for financial figures, consensus deltas, and corporate actions.
 */

import { Asset } from '../../../types';
import { FinancialToken } from '../types';

// Exact ticker definitions with company names for high-precision entity resolution
const FLEET_ENTITIES: Record<string, Asset> = {
  RELIANCE: 'RELIANCE',
  'RELIANCE INDUSTRIES': 'RELIANCE',
  RIL: 'RELIANCE',
  TCS: 'TCS',
  'TATA CONSULTANCY': 'TCS',
  INFY: 'INFY',
  INFOSYS: 'INFY',
  HDFCBANK: 'HDFCBANK',
  'HDFC BANK': 'HDFCBANK',
  ICICIBANK: 'ICICIBANK',
  'ICICI BANK': 'ICICIBANK',
  SBIN: 'SBIN',
  'STATE BANK OF INDIA': 'SBIN',
  SBI: 'SBIN',
  BHARTIARTL: 'BHARTIARTL',
  AIRTEL: 'BHARTIARTL',
  'BHARTI AIRTEL': 'BHARTIARTL',
  ITC: 'ITC',
  KOTAKBANK: 'KOTAKBANK',
  'KOTAK MAHINDRA': 'KOTAKBANK',
  'L&T': 'LT',
  LARSEN: 'LT',
  'LARSEN & TOUBRO': 'LT',
  TATAMOTORS: 'TATAMOTORS',
  'TATA MOTORS': 'TATAMOTORS',
  AXISBANK: 'AXISBANK',
  'AXIS BANK': 'AXISBANK',
  MARUTI: 'MARUTI',
  'MARUTI SUZUKI': 'MARUTI',
  SUNPHARMA: 'SUNPHARMA',
  'SUN PHARMA': 'SUNPHARMA',
  TITAN: 'TITAN',
  BAJFINANCE: 'BAJFINANCE',
  'BAJAJ FINANCE': 'BAJFINANCE',
  HINDUNILVR: 'HINDUNILVR',
  HINDUSTAN_UNILEVER: 'HINDUNILVR',
  HUL: 'HINDUNILVR',
  WIPRO: 'WIPRO',
  NTPC: 'NTPC',
  ONGC: 'ONGC',
  HAL: 'HAL',
  'HINDUSTAN AERONAUTICS': 'HAL',
  BEL: 'BEL',
  'BHARAT ELECTRONICS': 'BEL',
  TATASTEEL: 'TATASTEEL',
  'TATA STEEL': 'TATASTEEL',
  COALINDIA: 'COALINDIA',
  'COAL INDIA': 'COALINDIA',
  POWERGRID: 'POWERGRID',
  'POWER GRID': 'POWERGRID',
  BAJAJFINSV: 'BAJAJFINSV',
  'BAJAJ FINSERV': 'BAJAJFINSV',
  ASIANPAINT: 'ASIANPAINT',
  'ASIAN PAINTS': 'ASIANPAINT',
  NESTLEIND: 'NESTLEIND',
  'NESTLE INDIA': 'NESTLEIND',
  ADANIENT: 'ADANIPOWER',
  'ADANI ENTERPRISES': 'ADANIPOWER',
  ADANIPORTS: 'ADANIPOWER',
  'ADANI PORTS': 'ADANIPOWER',
  ULTRACEMCO: 'ULTRACEMCO',
  'ULTRATECH CEMENT': 'ULTRACEMCO',
  JSWSTEEL: 'JSWSTEEL',
  'JSW STEEL': 'JSWSTEEL',
  GRASIM: 'GRASIM',
  HCLTECH: 'HCLTECH',
  'HCL TECHNOLOGIES': 'HCLTECH',
  CIPLA: 'CIPLA',
  DRREDDY: 'DRREDDY',
  'DR REDDY': 'DRREDDY',
  TECHM: 'TECHM',
  'TECH MAHINDRA': 'TECHM',
  INDUSINDBK: 'INDUSINDBK',
  'INDUSIND BANK': 'INDUSINDBK',
  TATACONSUM: 'TATACONSUM',
  'TATA CONSUMER': 'TATACONSUM',
  HINDALCO: 'HINDALCO',
  BRITANNIA: 'BRITANNIA',
  EICHERMOT: 'EICHERMOT',
  'EICHER MOTORS': 'EICHERMOT',
  DIVISLAB: 'DIVISLAB',
  'DIVIS LAB': 'DIVISLAB',
  BPCL: 'BPCL',
  HEROMOTOCO: 'HEROMOTOCO',
  'HERO MOTOCORP': 'HEROMOTOCO',
  APOLLOHOSP: 'APOLLOHOSP',
  'APOLLO HOSPITALS': 'APOLLOHOSP',
  SHRIRAMFIN: 'SHRIRAMFIN',
  'SHRIRAM FINANCE': 'SHRIRAMFIN',
  VEDL: 'VEDL',
  VEDANTA: 'VEDL',
  JIOFIN: 'JIOFIN',
  'JIO FINANCIAL': 'JIOFIN',
  DMART: 'DMART',
  'AVENUE SUPERMARTS': 'DMART',
  TRENT: 'TRENT',
  VBL: 'VBL',
  'VARUN BEVERAGES': 'VBL',
  CHOLAFIN: 'CHOLAFIN',
  'CHOLAMANDALAM': 'CHOLAFIN',
  PIDILITIND: 'PIDILITIND',
  PIDILITE: 'PIDILITIND',
  HAVELLS: 'HAVELLS',
  BANKBARODA: 'BANKBARODA',
  'BANK OF BARODA': 'BANKBARODA',
  PNB: 'PNB',
  'PUNJAB NATIONAL BANK': 'PNB',
  CANBK: 'CANBK',
  'CANARA BANK': 'CANBK',
  UNIONBANK: 'UNIONBANK',
  'UNION BANK': 'UNIONBANK',
  IOC: 'IOC',
  'INDIAN OIL': 'IOC',
  GAIL: 'GAIL',
  MOTHERSON: 'MOTHERSON',
  'SAMVARDHANA MOTHERSON': 'MOTHERSON',
  SIEMENS: 'SIEMENS',
  ABB: 'ABB',
  BHEL: 'BHEL',
  POLYCAB: 'POLYCAB',
  TVSMOTOR: 'TVSMOTOR',
  'TVS MOTOR': 'TVSMOTOR',
  BAJAJ_AUTO: 'BAJAJ-AUTO',
  'BAJAJ AUTO': 'BAJAJ-AUTO',
  MARICO: 'MARICO',
  DABUR: 'DABUR',
  COLPAL: 'COLPAL',
  'COLGATE PALMOLIVE': 'COLPAL',
  GODREJCP: 'GODREJCP',
  'GODREJ CONSUMER': 'GODREJCP',
  MANKIND: 'MANKIND',
  'MANKIND PHARMA': 'MANKIND',
  TORNTPHARM: 'TORNTPHARM',
  'TORRENT PHARMA': 'TORNTPHARM',
  LUPIN: 'LUPIN',
  ZYDUSLIFE: 'ZYDUSLIFE',
  'ZYDUS LIFESCIENCES': 'ZYDUSLIFE',
  AUROPHARMA: 'AUROPHARMA',
  'AUROBINDO PHARMA': 'AUROPHARMA',
  JINDALSTEL: 'JINDALSTEL',
  'JINDAL STEEL': 'JINDALSTEL',
  NMDC: 'NMDC',
  SAIL: 'SAIL',
  INDHOTEL: 'INDHOTEL',
  'INDIAN HOTELS': 'INDHOTEL',
  BERGEPAINT: 'BERGEPAINT',
  'BERGER PAINTS': 'BERGEPAINT',
  AMBUJACEM: 'AMBUJACEM',
  'AMBUJA CEMENTS': 'AMBUJACEM',
  SHREECEM: 'SHREECEM',
  'SHREE CEMENT': 'SHREECEM',
  LTIM: 'LTM',
  LTM: 'LTM',
  'LTIMINDTREE': 'LTM',
  LTTS: 'LTTS',
  'L&T TECHNOLOGY': 'LTTS',
  KPITTECH: 'KPITTECH',
  'KPIT TECH': 'KPITTECH',
  TATAELXSI: 'TATAELXSI',
  'TATA ELXSI': 'TATAELXSI',
  COFORGE: 'COFORGE',
  PERSISTENT: 'PERSISTENT',
  MPHASIS: 'MPHASIS',
  MUTHOOTFIN: 'MUTHOOTFIN',
  'MUTHOOT FINANCE': 'MUTHOOTFIN',
  TATAPOWER: 'TATAPOWER',
  'TATA POWER': 'TATAPOWER',
  ADANIPOWER: 'ADANIPOWER',
  'ADANI POWER': 'ADANIPOWER',
};

export class FinancialTokenizer {
  /**
   * Tokenizes financial text into structured semantic tokens.
   */
  public static tokenize(text: string): FinancialToken[] {
    const tokens: FinancialToken[] = [];
    const normalized = text.replace(/&amp;/g, '&').replace(/&quot;/g, '"');

    // 1. Extract Monetary Values (e.g. ₹5,200 Cr, Rs 450 crore, $120 million)
    const moneyRegex = /(?:₹|rs\.?|inr|\$)\s*([\d,]+(?:\.\d+)?)\s*(crore|cr|lakh|million|billion)?/gi;
    let match: RegExpExecArray | null;
    while ((match = moneyRegex.exec(normalized)) !== null) {
      const num = parseFloat(match[1].replace(/,/g, ''));
      const unitStr = (match[2] || '').toLowerCase();
      let unit: 'INR_CR' | 'INR_LAKH' | 'USD_M' | undefined = 'INR_CR';
      let scaled = num;

      if (unitStr.includes('lakh')) {
        unit = 'INR_LAKH';
        scaled = num * 0.01; // Convert to Crore equivalent for standardization
      } else if (match[0].includes('$')) {
        unit = 'USD_M';
      }

      tokens.push({
        text: match[0],
        lemma: 'MONEY_TOKEN',
        type: 'MONETARY',
        val: scaled,
        unit,
        confidence: 0.95,
      });
    }

    // 2. Extract Percentages (e.g. +24%, -8.5%, 15.2 percent)
    const pctRegex = /([+\-]?\s*\d+(?:\.\d+)?)\s*(?:%|percent|bps)/gi;
    while ((match = pctRegex.exec(normalized)) !== null) {
      const pVal = parseFloat(match[1].replace(/\s+/g, ''));
      const isBps = match[0].toLowerCase().includes('bps');
      tokens.push({
        text: match[0],
        lemma: 'PERCENTAGE_TOKEN',
        type: 'PERCENTAGE',
        val: isBps ? pVal / 100 : pVal,
        unit: isBps ? 'BPS' : 'PCT',
        confidence: 0.95,
      });
    }

    // 3. Extract Tickers & Entities with strict word boundary
    const upperText = normalized.toUpperCase();
    for (const [entityName, ticker] of Object.entries(FLEET_ENTITIES)) {
      const escaped = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(upperText)) {
        // Special guard for 'LT': do not match '&lt;' or 'lt' in generic contexts
        if (entityName === 'LT' && /&LT;|<\s*LT/i.test(normalized)) continue;

        tokens.push({
          text: entityName,
          lemma: ticker,
          type: 'TICKER',
          confidence: 0.98,
        });
      }
    }

    return tokens;
  }

  /**
   * Resolves all unique NSE assets referenced in the headline.
   */
  public static extractAssets(text: string): Asset[] {
    const tokens = this.tokenize(text);
    const set = new Set<Asset>();
    for (const t of tokens) {
      if (t.type === 'TICKER' && t.lemma) {
        set.add(t.lemma as Asset);
      }
    }
    return Array.from(set);
  }
}
