/**
 * Generic Instrument Rules & Precision Validation Service
 * 
 * Coordinates venue-specific rules (tick size, lot size, min notional, step size)
 * across brokers (Binance, future Upstox) and normalizes them into BrokerInstrument
 * definitions for server-authoritative validation.
 */

import { BrokerId, BrokerInstrument, BrokerOrderRequest } from './brokers/brokerTypes';
import { SymbolRulesService, BinanceSymbolRule } from './symbolRules';
import { ExactDecimal } from './precision';
import { UpstoxInstrumentProvider } from './brokers/upstox/upstoxInstrumentProvider';

export interface InstrumentRulesProvider {
  readonly broker: BrokerId;
  getInstrument(symbolOrKey: string): Promise<BrokerInstrument | null> | BrokerInstrument | null;
  validateOrder(order: BrokerOrderRequest): Promise<{ isValid: boolean; error?: string }> | { isValid: boolean; error?: string };
  refreshRules?(): Promise<void>;
}

export class BinanceInstrumentProvider implements InstrumentRulesProvider {
  public readonly broker: BrokerId = 'binance';

  getInstrument(symbolOrKey: string): BrokerInstrument | null {
    try {
      const rule = SymbolRulesService.getRule(symbolOrKey);
      return this.mapRuleToInstrument(rule);
    } catch {
      return null;
    }
  }

  validateOrder(order: BrokerOrderRequest): { isValid: boolean; error?: string } {
    try {
      SymbolRulesService.validateAndNormalize({
        symbol: order.symbol,
        quantity: order.quantity,
        price: order.price,
        type: order.type === 'MARKET' ? 'MARKET' : 'LIMIT',
        side: order.side,
        accountMode: order.accountMode || 'paper',
      });
      return { isValid: true };
    } catch (err: any) {
      return { isValid: false, error: err.message };
    }
  }

  async refreshRules(): Promise<void> {
    await SymbolRulesService.refreshRules();
  }

  private mapRuleToInstrument(rule: BinanceSymbolRule): BrokerInstrument {
    return {
      broker: 'binance',
      exchange: 'BINANCE',
      segment: 'SPOT',
      instrumentKey: `BINANCE:${rule.symbol}`,
      tradingSymbol: rule.symbol,
      instrumentType: 'CRYPTO_SPOT',
      currency: rule.quoteAsset,
      baseAsset: rule.baseAsset,
      quoteAsset: rule.quoteAsset,
      tickSize: rule.tickSize.toString(),
      stepSize: rule.stepSize.toString(),
      minQuantity: rule.minQty.toString(),
      maxQuantity: rule.maxQty.toString(),
      minNotional: rule.minNotional.toString(),
      pricePrecision: rule.pricePrecision,
      quantityPrecision: rule.quantityPrecision,
      active: true,
    };
  }
}

export class InstrumentRulesService {
  private static providers: Map<string, InstrumentRulesProvider> = new Map();

  static {
    // Register standard production providers
    this.registerProvider(new BinanceInstrumentProvider());
    this.registerProvider(new UpstoxInstrumentProvider());
  }

  static registerProvider(provider: InstrumentRulesProvider): void {
    this.providers.set(provider.broker, provider);
  }

  static getProvider(broker: BrokerId = 'binance'): InstrumentRulesProvider | undefined {
    return this.providers.get(broker);
  }

  static async getInstrument(broker: BrokerId = 'binance', symbolOrKey: string): Promise<BrokerInstrument | null> {
    const provider = this.getProvider(broker);
    if (!provider) return null;
    return provider.getInstrument(symbolOrKey);
  }

  static async validateOrder(order: BrokerOrderRequest): Promise<{ isValid: boolean; error?: string }> {
    const broker = order.broker || 'binance';
    const provider = this.getProvider(broker);
    if (!provider) {
      return { isValid: true }; // Pass if no strict validator registered for broker
    }
    return provider.validateOrder(order);
  }

  static async refreshRules(broker?: BrokerId): Promise<void> {
    if (broker) {
      const provider = this.getProvider(broker);
      if (provider?.refreshRules) {
        await provider.refreshRules();
      }
    } else {
      for (const provider of this.providers.values()) {
        if (provider.refreshRules) {
          await provider.refreshRules();
        }
      }
    }
  }

  static hasProvider(broker: BrokerId | string): boolean {
    return this.providers.has(broker);
  }

  static getRules(symbolOrKey: string, broker: BrokerId = 'binance'): BrokerInstrument | null {
    const provider = this.getProvider(broker);
    if (!provider) return null;
    const res = provider.getInstrument(symbolOrKey);
    return (res instanceof Promise ? null : res) as BrokerInstrument | null;
  }

  static resetForTesting(): void {
    this.providers.clear();
    this.registerProvider(new BinanceInstrumentProvider());
    this.registerProvider(new UpstoxInstrumentProvider());
  }
}
