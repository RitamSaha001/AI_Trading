/**
 * Binance Symbol Precision & Trading Rules Registry
 * 
 * Defines authoritative tick sizes, step sizes, minimum quantities,
 * and minimum notional values using ExactDecimal to prevent sub-tick drift.
 */

import { ExactDecimal } from './precision';

export interface BinanceSymbolRule {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  tickSize: ExactDecimal;       // Minimum price increment
  stepSize: ExactDecimal;       // Minimum quantity increment
  minQty: ExactDecimal;         // Minimum order quantity
  maxQty: ExactDecimal;         // Maximum order quantity
  minNotional: ExactDecimal;    // Minimum order notional value in quote asset
  pricePrecision: number;       // Decimal places for price
  quantityPrecision: number;    // Decimal places for quantity
}

export interface ValidatedOrderParams {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  quantity: ExactDecimal;
  quantityStr: string;
  price: ExactDecimal;
  priceStr: string;
  notional: ExactDecimal;
  notionalStr: string;
}

const STATIC_SYMBOL_RULES: Record<string, BinanceSymbolRule> = {
  BTCUSDT: {
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    tickSize: ExactDecimal.from('0.01'),
    stepSize: ExactDecimal.from('0.00001'),
    minQty: ExactDecimal.from('0.00001'),
    maxQty: ExactDecimal.from('9000.00'),
    minNotional: ExactDecimal.from('5.00'),
    pricePrecision: 2,
    quantityPrecision: 5,
  },
  ETHUSDT: {
    symbol: 'ETHUSDT',
    baseAsset: 'ETH',
    quoteAsset: 'USDT',
    tickSize: ExactDecimal.from('0.01'),
    stepSize: ExactDecimal.from('0.0001'),
    minQty: ExactDecimal.from('0.0001'),
    maxQty: ExactDecimal.from('9000.00'),
    minNotional: ExactDecimal.from('5.00'),
    pricePrecision: 2,
    quantityPrecision: 4,
  },
  BNBUSDT: {
    symbol: 'BNBUSDT',
    baseAsset: 'BNB',
    quoteAsset: 'USDT',
    tickSize: ExactDecimal.from('0.01'),
    stepSize: ExactDecimal.from('0.001'),
    minQty: ExactDecimal.from('0.001'),
    maxQty: ExactDecimal.from('90000.00'),
    minNotional: ExactDecimal.from('5.00'),
    pricePrecision: 2,
    quantityPrecision: 3,
  },
  SOLUSDT: {
    symbol: 'SOLUSDT',
    baseAsset: 'SOL',
    quoteAsset: 'USDT',
    tickSize: ExactDecimal.from('0.01'),
    stepSize: ExactDecimal.from('0.01'),
    minQty: ExactDecimal.from('0.01'),
    maxQty: ExactDecimal.from('90000.00'),
    minNotional: ExactDecimal.from('5.00'),
    pricePrecision: 2,
    quantityPrecision: 2,
  },
  XRPUSDT: {
    symbol: 'XRPUSDT',
    baseAsset: 'XRP',
    quoteAsset: 'USDT',
    tickSize: ExactDecimal.from('0.0001'),
    stepSize: ExactDecimal.from('0.1'),
    minQty: ExactDecimal.from('0.1'),
    maxQty: ExactDecimal.from('9000000.00'),
    minNotional: ExactDecimal.from('5.00'),
    pricePrecision: 4,
    quantityPrecision: 1,
  },
  DOGEUSDT: {
    symbol: 'DOGEUSDT',
    baseAsset: 'DOGE',
    quoteAsset: 'USDT',
    tickSize: ExactDecimal.from('0.00001'),
    stepSize: ExactDecimal.from('1'),
    minQty: ExactDecimal.from('1'),
    maxQty: ExactDecimal.from('90000000.00'),
    minNotional: ExactDecimal.from('5.00'),
    pricePrecision: 5,
    quantityPrecision: 0,
  },
  ADAUSDT: {
    symbol: 'ADAUSDT',
    baseAsset: 'ADA',
    quoteAsset: 'USDT',
    tickSize: ExactDecimal.from('0.0001'),
    stepSize: ExactDecimal.from('0.1'),
    minQty: ExactDecimal.from('0.1'),
    maxQty: ExactDecimal.from('9000000.00'),
    minNotional: ExactDecimal.from('5.00'),
    pricePrecision: 4,
    quantityPrecision: 1,
  },
  AVAXUSDT: {
    symbol: 'AVAXUSDT',
    baseAsset: 'AVAX',
    quoteAsset: 'USDT',
    tickSize: ExactDecimal.from('0.01'),
    stepSize: ExactDecimal.from('0.01'),
    minQty: ExactDecimal.from('0.01'),
    maxQty: ExactDecimal.from('90000.00'),
    minNotional: ExactDecimal.from('5.00'),
    pricePrecision: 2,
    quantityPrecision: 2,
  },
  DOTUSDT: {
    symbol: 'DOTUSDT',
    baseAsset: 'DOT',
    quoteAsset: 'USDT',
    tickSize: ExactDecimal.from('0.001'),
    stepSize: ExactDecimal.from('0.01'),
    minQty: ExactDecimal.from('0.01'),
    maxQty: ExactDecimal.from('900000.00'),
    minNotional: ExactDecimal.from('5.00'),
    pricePrecision: 3,
    quantityPrecision: 2,
  },
  MATICUSDT: {
    symbol: 'MATICUSDT',
    baseAsset: 'MATIC',
    quoteAsset: 'USDT',
    tickSize: ExactDecimal.from('0.0001'),
    stepSize: ExactDecimal.from('0.1'),
    minQty: ExactDecimal.from('0.1'),
    maxQty: ExactDecimal.from('9000000.00'),
    minNotional: ExactDecimal.from('5.00'),
    pricePrecision: 4,
    quantityPrecision: 1,
  },
  LINKUSDT: {
    symbol: 'LINKUSDT',
    baseAsset: 'LINK',
    quoteAsset: 'USDT',
    tickSize: ExactDecimal.from('0.001'),
    stepSize: ExactDecimal.from('0.01'),
    minQty: ExactDecimal.from('0.01'),
    maxQty: ExactDecimal.from('900000.00'),
    minNotional: ExactDecimal.from('5.00'),
    pricePrecision: 3,
    quantityPrecision: 2,
  },
  LTCUSDT: {
    symbol: 'LTCUSDT',
    baseAsset: 'LTC',
    quoteAsset: 'USDT',
    tickSize: ExactDecimal.from('0.01'),
    stepSize: ExactDecimal.from('0.001'),
    minQty: ExactDecimal.from('0.001'),
    maxQty: ExactDecimal.from('90000.00'),
    minNotional: ExactDecimal.from('5.00'),
    pricePrecision: 2,
    quantityPrecision: 3,
  },
  UNIUSDT: {
    symbol: 'UNIUSDT',
    baseAsset: 'UNI',
    quoteAsset: 'USDT',
    tickSize: ExactDecimal.from('0.001'),
    stepSize: ExactDecimal.from('0.01'),
    minQty: ExactDecimal.from('0.01'),
    maxQty: ExactDecimal.from('900000.00'),
    minNotional: ExactDecimal.from('5.00'),
    pricePrecision: 3,
    quantityPrecision: 2,
  },
  ATOMUSDT: {
    symbol: 'ATOMUSDT',
    baseAsset: 'ATOM',
    quoteAsset: 'USDT',
    tickSize: ExactDecimal.from('0.001'),
    stepSize: ExactDecimal.from('0.01'),
    minQty: ExactDecimal.from('0.01'),
    maxQty: ExactDecimal.from('900000.00'),
    minNotional: ExactDecimal.from('5.00'),
    pricePrecision: 3,
    quantityPrecision: 2,
  },
  NEARUSDT: {
    symbol: 'NEARUSDT',
    baseAsset: 'NEAR',
    quoteAsset: 'USDT',
    tickSize: ExactDecimal.from('0.001'),
    stepSize: ExactDecimal.from('0.1'),
    minQty: ExactDecimal.from('0.1'),
    maxQty: ExactDecimal.from('900000.00'),
    minNotional: ExactDecimal.from('5.00'),
    pricePrecision: 3,
    quantityPrecision: 1,
  },
};

export class SymbolRulesService {
  private static dynamicRules = new Map<string, BinanceSymbolRule>();

  static getRule(symbol: string): BinanceSymbolRule | null {
    const sym = symbol.toUpperCase().trim();
    return this.dynamicRules.get(sym) || STATIC_SYMBOL_RULES[sym] || null;
  }

  static registerRule(rule: BinanceSymbolRule): void {
    this.dynamicRules.set(rule.symbol.toUpperCase().trim(), rule);
  }

  static isSupported(symbol: string): boolean {
    return this.getRule(symbol) !== null;
  }

  /**
   * Validates and normalizes quantity, price, and notional using exact decimal rules.
   * Rejects orders that violate tick size, step size, limits, or minimum notional.
   */
  static validateAndNormalize(
    symbolOrParams:
      | string
      | {
          symbol: string;
          side?: 'BUY' | 'SELL';
          type?: string;
          quantity: string | number | ExactDecimal;
          price?: string | number | ExactDecimal;
        },
    quantity?: string | number | ExactDecimal,
    paramPrice?: string | number | ExactDecimal,
    type: string = 'LIMIT',
    side: 'BUY' | 'SELL' = 'BUY'
  ): ValidatedOrderParams {
    const params =
      typeof symbolOrParams === 'string'
        ? {
            symbol: symbolOrParams,
            quantity: quantity!,
            price: paramPrice,
            type,
            side,
          }
        : {
            ...symbolOrParams,
            side: symbolOrParams.side || 'BUY',
            type: symbolOrParams.type || 'LIMIT',
          };

    const rule = this.getRule(params.symbol);
    if (!rule) {
      throw new Error(`Unsupported trading symbol: ${params.symbol}`);
    }

    const qty = ExactDecimal.from(params.quantity);
    if (qty.lte(ExactDecimal.zero())) {
      throw new Error(`Order quantity must be strictly positive: ${qty.toString()}`);
    }

    // Min / Max Quantity check
    if (qty.lt(rule.minQty)) {
      throw new Error(
        `Quantity ${qty.toString()} is below minimum quantity of ${rule.minQty.toString()} for ${rule.symbol}`
      );
    }
    if (qty.gt(rule.maxQty)) {
      throw new Error(
        `Quantity ${qty.toString()} exceeds maximum quantity of ${rule.maxQty.toString()} for ${rule.symbol}`
      );
    }

    // Step size alignment validation
    const qtyModStep = qty.mod(rule.stepSize);
    if (!qtyModStep.isZero()) {
      // Check if rounding to step size is within an infinitesimal tolerance
      // If not zero, order must be rejected rather than silently altering client intent
      throw new Error(
        `Quantity ${qty.toString()} does not conform to exchange step size ${rule.stepSize.toString()} for ${rule.symbol}`
      );
    }

    // Price validation
    let price: ExactDecimal;
    if (params.type === 'LIMIT') {
      if (!params.price) {
        throw new Error('Price is required for LIMIT orders');
      }
      price = ExactDecimal.from(params.price);
      if (price.lte(ExactDecimal.zero())) {
        throw new Error(`Price must be strictly positive: ${price.toString()}`);
      }
      const priceModTick = price.mod(rule.tickSize);
      if (!priceModTick.isZero()) {
        throw new Error(
          `Price ${price.toString()} does not conform to exchange tick size ${rule.tickSize.toString()} for ${rule.symbol}`
        );
      }
    } else {
      price = params.price ? ExactDecimal.from(params.price) : ExactDecimal.from('50000.00');
    }

    // Notional check
    const notional = qty.mul(price);
    if (notional.lt(rule.minNotional)) {
      throw new Error(
        `Order validation failed: Order notional ${notional.toFixed(2)} ${rule.quoteAsset} is below minimum notional of ${rule.minNotional.toFixed(2)} ${rule.quoteAsset}`
      );
    }

    return {
      symbol: rule.symbol,
      baseAsset: rule.baseAsset,
      quoteAsset: rule.quoteAsset,
      quantity: qty,
      quantityStr: qty.toFixed(rule.quantityPrecision),
      price,
      priceStr: price.toFixed(rule.pricePrecision),
      notional,
      notionalStr: notional.toFixed(rule.pricePrecision),
    };
  }
}
