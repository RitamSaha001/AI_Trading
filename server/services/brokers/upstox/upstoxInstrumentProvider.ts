/**
 * Upstox Instrument Rules & Indian Equities Provider
 *
 * Implements InstrumentRulesProvider for Upstox (NSE / BSE).
 * Normalizes Indian equity instruments, tick sizes (0.05 INR),
 * lot sizes (1 for equity cash), and validates order constraints
 * including exchange price bands / circuit limits.
 */

import { BrokerId, BrokerInstrument, BrokerOrderRequest } from '../brokerTypes';
import { InstrumentRulesProvider } from '../../instrumentRules';
import { ExactDecimal } from '../../precision';
import { AuthoritativeInstrument, UpstoxInstrumentRegistry } from './upstoxInstrumentRegistry';

export class UpstoxInstrumentProvider implements InstrumentRulesProvider {
  public readonly broker: BrokerId = 'upstox';

  /**
   * Resolves instrument definition from the authoritative UpstoxInstrumentRegistry.
   * Returns null if unverified.
   */
  public getInstrument(symbolOrKey: string): BrokerInstrument | null {
    const authInst = UpstoxInstrumentRegistry.get(symbolOrKey);
    if (!authInst) {
      return null;
    }
    return this.mapToBrokerInstrument(authInst);
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
      return { isValid: false, error: `Unsupported Upstox instrument: ${order.symbol}. Not found in authoritative registry.` };
    }

    if (order.side !== 'BUY' && order.side !== 'SELL') {
      return { isValid: false, error: `Invalid order side: ${order.side}` };
    }

    const allowedTypes = ['MARKET', 'LIMIT', 'STOP_LOSS', 'STOP_LOSS_LIMIT', 'SL', 'SL-M', 'SL_M'];
    if (!allowedTypes.includes(order.type)) {
      return { isValid: false, error: `Unsupported order type for Upstox: ${order.type}` };
    }

    // Quantity validation (must be positive integer multiple of lotSize)
    const lotSize = instrument.lotSize || 1;
    const qtyNum = typeof order.quantity === 'number' ? order.quantity : Number(order.quantity);
    if (!qtyNum || qtyNum <= 0 || !Number.isInteger(qtyNum)) {
      return { isValid: false, error: 'Quantity must be a positive integer for Indian equities' };
    }

    if (qtyNum % lotSize !== 0) {
      return { isValid: false, error: `Quantity ${qtyNum} must be a multiple of lot size ${lotSize}` };
    }

    const minQty = Number(instrument.minQuantity || 1);
    const maxQty = Number(instrument.maxQuantity || 100000);
    if (qtyNum < minQty) {
      return { isValid: false, error: `Quantity ${qtyNum} below minimum ${minQty}` };
    }
    if (qtyNum > maxQty) {
      return { isValid: false, error: `Quantity ${qtyNum} exceeds maximum ${maxQty}` };
    }

    // Freeze quantity check
    const authInst = UpstoxInstrumentRegistry.get(order.symbol);
    if (authInst?.freezeQuantity && qtyNum > authInst.freezeQuantity && !order.slice) {
      return {
        isValid: false,
        error: `Quantity ${qtyNum} exceeds exchange freeze limit of ${authInst.freezeQuantity}. Enable auto-slicing (slice=true).`,
      };
    }

    // Price validation for limit and stop-loss orders
    const isPriceOrder = ['LIMIT', 'STOP_LOSS_LIMIT', 'SL'].includes(order.type);
    if (isPriceOrder) {
      const priceNum = typeof order.price === 'number' ? order.price : Number(order.price);
      if (order.price === undefined || order.price === null || isNaN(priceNum) || priceNum <= 0) {
        return { isValid: false, error: 'Price must be greater than 0 for LIMIT orders' };
      }

      const tickDec = ExactDecimal.from(instrument.tickSize || '0.05');
      const priceDec = ExactDecimal.from(priceNum);
      
      // Verify price is a multiple of tick size (0.05 INR)
      const tickMinor = tickDec.toMinor(2); // 5
      const priceMinor = priceDec.toMinor(2);
      if (priceMinor % tickMinor !== 0n) {
        return {
          isValid: false,
          error: `Price ${priceNum} is not a valid tick step (tick size: ${instrument.tickSize})`,
        };
      }

      // Exchange price band / circuit limit checks (Finding 8)
      if (authInst?.lowerCircuitLimit !== undefined && priceNum < authInst.lowerCircuitLimit) {
        return {
          isValid: false,
          error: `Price ${priceNum} INR breaches exchange lower circuit limit of ${authInst.lowerCircuitLimit} INR`,
        };
      }
      if (authInst?.upperCircuitLimit !== undefined && priceNum > authInst.upperCircuitLimit) {
        return {
          isValid: false,
          error: `Price ${priceNum} INR breaches exchange upper circuit limit of ${authInst.upperCircuitLimit} INR`,
        };
      }
    }

    return { isValid: true };
  }

  public async refreshRules(): Promise<void> {
    // UpstoxInstrumentRegistry handles caching and dynamic updates
  }

  private mapToBrokerInstrument(rule: AuthoritativeInstrument): BrokerInstrument {
    return {
      broker: 'upstox',
      exchange: rule.exchange,
      segment: rule.segment,
      instrumentKey: rule.instrumentKey,
      tradingSymbol: rule.tradingSymbol,
      instrumentToken: rule.instrumentKey,
      instrumentType: 'EQUITY',
      currency: rule.currency,
      baseAsset: rule.tradingSymbol,
      quoteAsset: rule.currency,
      tickSize: rule.tickSize.toFixed(2),
      stepSize: rule.lotSize.toString(),
      minQuantity: rule.minQuantity.toString(),
      maxQuantity: rule.maxQuantity.toString(),
      lotSize: rule.lotSize,
      pricePrecision: 2,
      quantityPrecision: 0,
      active: rule.active,
    };
  }
}
