/**
 * Upstox Instrument Rules & Indian Equities Provider
 *
 * Implements InstrumentRulesProvider for Upstox (NSE / BSE).
 * Normalizes Indian equity instruments, tick sizes (0.05 INR),
 * lot sizes (1 for equity cash), and validates order constraints.
 */

import { BrokerId, BrokerInstrument, BrokerOrderRequest } from '../brokerTypes';
import { InstrumentRulesProvider } from '../../instrumentRules';
import { ExactDecimal } from '../../precision';

export interface UpstoxStaticSymbolRule {
  symbol: string;
  tradingSymbol: string;
  exchange: 'NSE' | 'BSE';
  segment: 'NSE_EQ' | 'BSE_EQ';
  isin: string;
  tickSize: number;
  lotSize: number;
  minQuantity: number;
  maxQuantity: number;
  currency: string;
}

export class UpstoxInstrumentProvider implements InstrumentRulesProvider {
  public readonly broker: BrokerId = 'upstox';

  // Static authoritative definitions for liquid NSE/BSE equities
  private static readonly KNOWN_INSTRUMENTS: Record<string, UpstoxStaticSymbolRule> = {
    RELIANCE: {
      symbol: 'RELIANCE',
      tradingSymbol: 'RELIANCE',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE002A01018',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      currency: 'INR',
    },
    TCS: {
      symbol: 'TCS',
      tradingSymbol: 'TCS',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE467B01029',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      currency: 'INR',
    },
    INFY: {
      symbol: 'INFY',
      tradingSymbol: 'INFY',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE009A01021',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      currency: 'INR',
    },
    HDFCBANK: {
      symbol: 'HDFCBANK',
      tradingSymbol: 'HDFCBANK',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE040A01034',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      currency: 'INR',
    },
    ICICIBANK: {
      symbol: 'ICICIBANK',
      tradingSymbol: 'ICICIBANK',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE090A01021',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      currency: 'INR',
    },
    SBIN: {
      symbol: 'SBIN',
      tradingSymbol: 'SBIN',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE062A01020',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      currency: 'INR',
    },
    BHARTIARTL: {
      symbol: 'BHARTIARTL',
      tradingSymbol: 'BHARTIARTL',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE397D01024',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      currency: 'INR',
    },
    ITC: {
      symbol: 'ITC',
      tradingSymbol: 'ITC',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE154A01025',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      currency: 'INR',
    },
    KOTAKBANK: {
      symbol: 'KOTAKBANK',
      tradingSymbol: 'KOTAKBANK',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE237A01028',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      currency: 'INR',
    },
    LT: {
      symbol: 'LT',
      tradingSymbol: 'LT',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      isin: 'INE018A01030',
      tickSize: 0.05,
      lotSize: 1,
      minQuantity: 1,
      maxQuantity: 100000,
      currency: 'INR',
    },
  };

  /**
   * Resolves instrument definition by trading symbol or canonical key.
   */
  public getInstrument(symbolOrKey: string): BrokerInstrument | null {
    const cleanKey = symbolOrKey.trim().toUpperCase();
    
    // Check if key is formatted as exchange:symbol or segment|isin
    let symbol = cleanKey;
    if (cleanKey.includes(':')) {
      symbol = cleanKey.split(':')[1];
    } else if (cleanKey.includes('|')) {
      const parts = cleanKey.split('|');
      // If ISIN is provided, find symbol by ISIN
      const isinMatch = Object.values(UpstoxInstrumentProvider.KNOWN_INSTRUMENTS).find(
        (i) => i.isin === parts[1] || i.symbol === parts[1]
      );
      if (isinMatch) return this.mapToBrokerInstrument(isinMatch);
      symbol = parts[1];
    }

    const known = UpstoxInstrumentProvider.KNOWN_INSTRUMENTS[symbol];
    if (known) {
      return this.mapToBrokerInstrument(known);
    }

    // Dynamic resolution for other valid Indian equity symbols
    if (/^[A-Z0-9_-]{2,20}$/.test(symbol) && !symbol.includes('USDT') && !symbol.includes('BUSD')) {
      const generic: UpstoxStaticSymbolRule = {
        symbol,
        tradingSymbol: symbol,
        exchange: 'NSE',
        segment: 'NSE_EQ',
        isin: '',
        tickSize: 0.05,
        lotSize: 1,
        minQuantity: 1,
        maxQuantity: 100000,
        currency: 'INR',
      };
      return this.mapToBrokerInstrument(generic);
    }

    return null;
  }

  /**
   * Authoritative server-side pre-trade order validation.
   */
  public validateOrder(order: BrokerOrderRequest): { isValid: boolean; error?: string } {
    if (!order.symbol || !order.symbol.trim()) {
      return { isValid: false, error: 'Symbol is required' };
    }

    const instrument = this.getInstrument(order.symbol);
    if (!instrument) {
      return { isValid: false, error: `Unsupported Upstox instrument: ${order.symbol}` };
    }

    if (order.side !== 'BUY' && order.side !== 'SELL') {
      return { isValid: false, error: `Invalid order side: ${order.side}` };
    }

    const allowedTypes = ['MARKET', 'LIMIT', 'STOP_LOSS_LIMIT'];
    if (!allowedTypes.includes(order.type)) {
      return { isValid: false, error: `Unsupported order type for Upstox: ${order.type}` };
    }

    // Quantity validation (must be positive integer multiple of lotSize)
    const lotSize = instrument.lotSize || 1;
    if (!order.quantity || order.quantity <= 0 || !Number.isInteger(order.quantity)) {
      return { isValid: false, error: 'Quantity must be a positive integer for Indian equities' };
    }

    if (order.quantity % lotSize !== 0) {
      return { isValid: false, error: `Quantity ${order.quantity} must be a multiple of lot size ${lotSize}` };
    }

    const minQty = Number(instrument.minQuantity || 1);
    const maxQty = Number(instrument.maxQuantity || 100000);
    if (order.quantity < minQty) {
      return { isValid: false, error: `Quantity ${order.quantity} below minimum ${minQty}` };
    }
    if (order.quantity > maxQty) {
      return { isValid: false, error: `Quantity ${order.quantity} exceeds maximum ${maxQty}` };
    }

    // Price validation for limit orders
    if (order.type === 'LIMIT' || order.type === 'STOP_LOSS_LIMIT') {
      if (order.price === undefined || order.price === null || order.price <= 0) {
        return { isValid: false, error: 'Price must be greater than 0 for LIMIT orders' };
      }

      const tickDec = ExactDecimal.from(instrument.tickSize || '0.05');
      const priceDec = ExactDecimal.from(order.price);
      
      // Verify price is a multiple of tick size (0.05 INR)
      const tickMinor = tickDec.toMinor(2); // 5
      const priceMinor = priceDec.toMinor(2);
      if (priceMinor % tickMinor !== 0n) {
        return {
          isValid: false,
          error: `Price ${order.price} is not a valid tick step (tick size: ${instrument.tickSize})`,
        };
      }
    }

    return { isValid: true };
  }

  public async refreshRules(): Promise<void> {
    // In future phases, dynamically load instrument master CSV from Upstox if configured
  }

  private mapToBrokerInstrument(rule: UpstoxStaticSymbolRule): BrokerInstrument {
    return {
      broker: 'upstox',
      exchange: rule.exchange,
      segment: rule.segment,
      instrumentKey: `${rule.segment}|${rule.isin || rule.symbol}`,
      tradingSymbol: rule.tradingSymbol,
      instrumentToken: rule.isin ? `${rule.segment}|${rule.isin}` : undefined,
      instrumentType: 'EQUITY',
      currency: rule.currency,
      baseAsset: rule.symbol,
      quoteAsset: rule.currency,
      tickSize: rule.tickSize.toFixed(2),
      stepSize: rule.lotSize.toString(),
      minQuantity: rule.minQuantity.toString(),
      maxQuantity: rule.maxQuantity.toString(),
      lotSize: rule.lotSize,
      pricePrecision: 2,
      quantityPrecision: 0,
      active: true,
    };
  }
}
