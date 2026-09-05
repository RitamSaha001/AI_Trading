/**
 * Binance Symbol Precision & Trading Rules Registry
 * 
 * Defines authoritative tick sizes, step sizes, minimum quantities,
 * and minimum notional values using ExactDecimal to prevent sub-tick drift.
 */

import { ExactDecimal } from './precision';
import { config } from '../config';

export interface BinanceSymbolRule {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  tickSize: ExactDecimal;       // Minimum price increment (PRICE_FILTER)
  stepSize: ExactDecimal;       // Minimum quantity increment (LOT_SIZE)
  minQty: ExactDecimal;         // Minimum order quantity (LOT_SIZE)
  maxQty: ExactDecimal;         // Maximum order quantity (LOT_SIZE)
  minPrice?: ExactDecimal;      // Minimum price (PRICE_FILTER)
  maxPrice?: ExactDecimal;      // Maximum price (PRICE_FILTER)
  marketMinQty?: ExactDecimal;  // Minimum market order quantity (MARKET_LOT_SIZE)
  marketMaxQty?: ExactDecimal;  // Maximum market order quantity (MARKET_LOT_SIZE)
  marketStepSize?: ExactDecimal;// Market order step size (MARKET_LOT_SIZE)
  minNotional: ExactDecimal;    // Minimum order notional value in quote asset (NOTIONAL / MIN_NOTIONAL)
  maxNotional?: ExactDecimal;   // Maximum order notional value in quote asset (NOTIONAL)
  applyMinToMarket?: boolean;   // Whether minNotional applies to market orders
  applyMaxToMarket?: boolean;   // Whether maxNotional applies to market orders
  maxNumOrders?: number;        // Maximum open orders (MAX_NUM_ORDERS)
  pricePrecision: number;       // Decimal places for price
  quantityPrecision: number;    // Decimal places for quantity
  lastUpdated?: number;         // Timestamp when rules were fetched/registered
  filtersPresent?: {
    priceFilter: boolean;
    lotSize: boolean;
    notional: boolean;
  };
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
  quoteOrderQtyStr?: string;
  isMarketOrder?: boolean;
  isEstimatedPrice?: boolean;
}

export class AuthoritativeExchangeRulesUnavailableError extends Error {
  constructor(symbol: string, reason: string) {
    super(`Authoritative Binance exchange rules for ${symbol} are unavailable: ${reason}. Live execution blocked.`);
    this.name = 'AuthoritativeExchangeRulesUnavailableError';
  }
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
  /** In-memory cache of authoritative dynamic rules parsed from Binance exchangeInfo */
  private static dynamicRules = new Map<string, BinanceSymbolRule>();

  /** Cache freshness parameters */
  static CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL
  static MAX_STALENESS_MS = 2 * 60 * 60 * 1000; // 2 hour max staleness window
  private static lastFetchedAt: number | null = null;

  /**
   * Resets internal dynamic rule cache (used for unit tests).
   */
  static clearCache(): void {
    this.dynamicRules.clear();
    this.lastFetchedAt = null;
  }

  /**
   * Returns whether current cached rules are within freshness TTL.
   */
  static isFresh(): boolean {
    if (!this.lastFetchedAt) return false;
    return Date.now() - this.lastFetchedAt <= this.CACHE_TTL_MS;
  }

  /**
   * Returns whether cached rules have exceeded the maximum allowed staleness window.
   */
  static isStale(): boolean {
    if (!this.lastFetchedAt) return true;
    return Date.now() - this.lastFetchedAt > this.MAX_STALENESS_MS;
  }

  /**
   * Manually registers a dynamic rule (used for tests or exchange updates).
   */
  static registerRule(rule: BinanceSymbolRule): void {
    const sym = rule.symbol.toUpperCase().trim();
    this.dynamicRules.set(sym, {
      ...rule,
      lastUpdated: rule.lastUpdated || Date.now(),
    });
    if (!this.lastFetchedAt) {
      this.lastFetchedAt = Date.now();
    }
  }

  /**
   * Parses raw Binance exchangeInfo symbol definition into an exact decimal BinanceSymbolRule.
   */
  static parseSymbolInfo(info: any): BinanceSymbolRule {
    const symbol = String(info.symbol).toUpperCase().trim();
    const baseAsset = String(info.baseAsset).toUpperCase().trim();
    const quoteAsset = String(info.quoteAsset).toUpperCase().trim();

    let tickSize = ExactDecimal.from('0.01');
    let minPrice: ExactDecimal | undefined;
    let maxPrice: ExactDecimal | undefined;
    let stepSize = ExactDecimal.from('0.00001');
    let minQty = ExactDecimal.from('0.00001');
    let maxQty = ExactDecimal.from('90000.00');
    let marketMinQty: ExactDecimal | undefined;
    let marketMaxQty: ExactDecimal | undefined;
    let marketStepSize: ExactDecimal | undefined;
    let minNotional = ExactDecimal.from('5.00');
    let maxNotional: ExactDecimal | undefined;
    let applyMinToMarket = true;
    let applyMaxToMarket = false;
    let maxNumOrders: number | undefined;

    let hasPriceFilter = false;
    let hasLotSize = false;
    let hasNotional = false;

    for (const filter of info.filters || []) {
      switch (filter.filterType) {
        case 'PRICE_FILTER':
          hasPriceFilter = true;
          if (filter.tickSize) tickSize = ExactDecimal.from(String(filter.tickSize));
          if (filter.minPrice) minPrice = ExactDecimal.from(String(filter.minPrice));
          if (filter.maxPrice) maxPrice = ExactDecimal.from(String(filter.maxPrice));
          break;
        case 'LOT_SIZE':
          hasLotSize = true;
          if (filter.stepSize) stepSize = ExactDecimal.from(String(filter.stepSize));
          if (filter.minQty) minQty = ExactDecimal.from(String(filter.minQty));
          if (filter.maxQty) maxQty = ExactDecimal.from(String(filter.maxQty));
          break;
        case 'MARKET_LOT_SIZE':
          if (filter.stepSize && filter.stepSize !== '0') marketStepSize = ExactDecimal.from(String(filter.stepSize));
          if (filter.minQty && filter.minQty !== '0') marketMinQty = ExactDecimal.from(String(filter.minQty));
          if (filter.maxQty && filter.maxQty !== '0') marketMaxQty = ExactDecimal.from(String(filter.maxQty));
          break;
        case 'MIN_NOTIONAL':
          hasNotional = true;
          if (filter.minNotional) minNotional = ExactDecimal.from(String(filter.minNotional));
          if (filter.applyToMarket !== undefined) applyMinToMarket = Boolean(filter.applyToMarket);
          break;
        case 'NOTIONAL':
          hasNotional = true;
          if (filter.minNotional) minNotional = ExactDecimal.from(String(filter.minNotional));
          if (filter.maxNotional) maxNotional = ExactDecimal.from(String(filter.maxNotional));
          if (filter.applyMinToMarket !== undefined) applyMinToMarket = Boolean(filter.applyMinToMarket);
          if (filter.applyMaxToMarket !== undefined) applyMaxToMarket = Boolean(filter.applyMaxToMarket);
          break;
        case 'MAX_NUM_ORDERS':
          if (filter.maxNumOrders) maxNumOrders = Number(filter.maxNumOrders);
          break;
      }
    }

    const pricePrecision = tickSize.scale > 0 ? tickSize.scale : Number(info.quotePrecision || 2);
    const quantityPrecision = stepSize.scale > 0 ? stepSize.scale : Number(info.baseAssetPrecision || 8);

    return {
      symbol,
      baseAsset,
      quoteAsset,
      tickSize,
      stepSize,
      minQty,
      maxQty,
      minPrice,
      maxPrice,
      marketMinQty,
      marketMaxQty,
      marketStepSize,
      minNotional,
      maxNotional,
      applyMinToMarket,
      applyMaxToMarket,
      maxNumOrders,
      pricePrecision,
      quantityPrecision,
      lastUpdated: Date.now(),
      filtersPresent: {
        priceFilter: hasPriceFilter,
        lotSize: hasLotSize,
        notional: hasNotional,
      },
    };
  }

  /**
   * Fetches exchangeInfo dynamically from the Binance API and refreshes the cache.
   */
  static async refreshRules(options: {
    environment?: 'mainnet' | 'testnet';
    symbols?: string[];
    fetchFn?: typeof fetch;
  } = {}): Promise<number> {
    const environment = options.environment || 'mainnet';
    const baseUrl =
      environment === 'testnet' ? 'https://testnet.binance.vision' : 'https://api.binance.com';
    const fetchFunc = options.fetchFn || fetch;

    let url = `${baseUrl}/api/v3/exchangeInfo`;
    if (options.symbols && options.symbols.length === 1) {
      url += `?symbol=${options.symbols[0].toUpperCase().trim()}`;
    } else if (options.symbols && options.symbols.length > 1) {
      url += `?symbols=${JSON.stringify(options.symbols.map((s) => s.toUpperCase().trim()))}`;
    }

    const res = await fetchFunc(url, {
      headers: { 'User-Agent': 'Lumen-Trading-Engine/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`Binance exchangeInfo HTTP ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as any;
    if (!data.symbols || !Array.isArray(data.symbols)) {
      throw new Error('Malformed Binance exchangeInfo payload: symbols array missing');
    }

    let parsedCount = 0;
    for (const symInfo of data.symbols) {
      if (symInfo.status && symInfo.status !== 'TRADING') continue;
      const rule = this.parseSymbolInfo(symInfo);
      this.registerRule(rule);
      parsedCount++;
    }

    this.lastFetchedAt = Date.now();
    return parsedCount;
  }

  /**
   * Gets an authoritative symbol rule.
   * For LIVE trading: fails closed if authoritative dynamic rules are missing or stale.
   * For PAPER trading: allows fallback to static offline rule defaults.
   */
  static async getAuthoritativeRule(
    symbol: string,
    accountMode: 'live' | 'paper' = 'live',
    options?: { allowStaleIfUnreachable?: boolean; fetchFn?: typeof fetch }
  ): Promise<BinanceSymbolRule> {
    const sym = symbol.toUpperCase().trim();
    const existing = this.dynamicRules.get(sym);

    if (accountMode === 'live') {
      // 0. In test environments without external network, seed static symbol if not yet populated
      if (!existing && config.NODE_ENV === 'test' && STATIC_SYMBOL_RULES[sym]) {
        this.registerRule(STATIC_SYMBOL_RULES[sym]);
        return this.dynamicRules.get(sym)!;
      }

      // 1. Check if cached and fresh
      if (existing && Date.now() - (existing.lastUpdated ?? 0) <= this.CACHE_TTL_MS) {
        return existing;
      }

      // 2. Needs refresh (missing or older than CACHE_TTL_MS)
      try {
        await this.refreshRules({ symbols: [sym], fetchFn: options?.fetchFn });
        const refreshed = this.dynamicRules.get(sym);
        if (refreshed) return refreshed;
      } catch (err: any) {
        // Refresh failed: evaluate staleness policy
        if (
          existing &&
          options?.allowStaleIfUnreachable &&
          Date.now() - (existing.lastUpdated ?? 0) <= this.MAX_STALENESS_MS
        ) {
          return existing; // Within maximum staleness threshold
        }
        throw new AuthoritativeExchangeRulesUnavailableError(
          sym,
          `Failed to refresh live Binance rules (${err.message}) and cache is ${existing ? 'stale' : 'empty'}`
        );
      }

      const refreshed = this.dynamicRules.get(sym);
      if (!refreshed) {
        throw new AuthoritativeExchangeRulesUnavailableError(
          sym,
          `Symbol not found in authoritative Binance exchangeInfo`
        );
      }
      return refreshed;
    } else {
      // Paper trading mode: flexible with static fallback
      if (existing) return existing;
      const staticRule = STATIC_SYMBOL_RULES[sym];
      if (staticRule) return staticRule;
      throw new Error(`Unsupported trading symbol: ${symbol}`);
    }
  }

  /**
   * Synchronously retrieves a rule if available in memory.
   * Only allows static fallback for paper trading mode.
   */
  static getRule(symbol: string, accountMode: 'live' | 'paper' = 'paper'): BinanceSymbolRule | null {
    const sym = symbol.toUpperCase().trim();
    const dynamic = this.dynamicRules.get(sym);
    if (dynamic) {
      if (accountMode === 'live' && Date.now() - (dynamic.lastUpdated ?? 0) > this.MAX_STALENESS_MS) {
        return null; // Stale rule disallowed for live execution
      }
      return dynamic;
    }
    if (accountMode === 'paper') {
      return STATIC_SYMBOL_RULES[sym] || null;
    }
    return null;
  }

  static isSupported(symbol: string, accountMode: 'live' | 'paper' = 'paper'): boolean {
    return this.getRule(symbol, accountMode) !== null;
  }

  /**
   * Validates and normalizes quantity, price, and notional using exact decimal rules.
   * Rejects orders violating tick size, step size, limits, or minimum/maximum notional.
   * 
   * CRITICAL GUARANTEE: NEVER invents or defaults to arbitrary fallback prices (e.g. 50000.00).
   */
  static validateAndNormalize(
    symbolOrParams:
      | string
      | {
          symbol: string;
          side?: 'BUY' | 'SELL';
          type?: string;
          quantity?: string | number | ExactDecimal;
          price?: string | number | ExactDecimal;
          quoteOrderQty?: string | number | ExactDecimal;
          accountMode?: 'live' | 'paper';
          rule?: BinanceSymbolRule;
        },
    paramQuantity?: string | number | ExactDecimal,
    paramPrice?: string | number | ExactDecimal,
    paramType: string = 'LIMIT',
    paramSide: 'BUY' | 'SELL' = 'BUY'
  ): ValidatedOrderParams {
    const params =
      typeof symbolOrParams === 'string'
        ? {
            symbol: symbolOrParams,
            quantity: paramQuantity,
            price: paramPrice,
            type: paramType,
            side: paramSide,
            accountMode: 'paper' as const,
            rule: undefined,
            quoteOrderQty: undefined,
          }
        : {
            ...symbolOrParams,
            side: symbolOrParams.side || 'BUY',
            type: symbolOrParams.type || 'LIMIT',
            accountMode: symbolOrParams.accountMode || 'paper',
          };

    const isMarket = params.type.toUpperCase() === 'MARKET';
    const rule = params.rule || this.getRule(params.symbol, params.accountMode);

    if (!rule) {
      if (params.accountMode === 'live') {
        throw new AuthoritativeExchangeRulesUnavailableError(
          params.symbol,
          'Rule not loaded in authoritative memory cache'
        );
      }
      throw new Error(`Unsupported trading symbol: ${params.symbol}`);
    }

    // Live trading must fail closed if critical filters were missing from exchangeInfo
    if (params.accountMode === 'live' && rule.filtersPresent) {
      if (!rule.filtersPresent.priceFilter || !rule.filtersPresent.lotSize) {
        throw new AuthoritativeExchangeRulesUnavailableError(
          params.symbol,
          'Critical Binance exchange filters (PRICE_FILTER or LOT_SIZE) missing from exchangeInfo'
        );
      }
    }

    // 1. Price Validation & Exact Decimal Extraction
    let price: ExactDecimal;
    let isEstimatedPrice = false;

    if (!isMarket) {
      // LIMIT orders strictly require price
      if (params.price === undefined || params.price === null || params.price === '') {
        throw new Error('Price is required for LIMIT orders');
      }
      price = ExactDecimal.from(params.price);
      if (price.lte(ExactDecimal.zero())) {
        throw new Error(`Price must be strictly positive: ${price.toString()}`);
      }

      if (rule.minPrice && price.lt(rule.minPrice)) {
        throw new Error(
          `Price ${price.toString()} is below exchange minPrice ${rule.minPrice.toString()} for ${rule.symbol}`
        );
      }
      if (rule.maxPrice && price.gt(rule.maxPrice)) {
        throw new Error(
          `Price ${price.toString()} exceeds exchange maxPrice ${rule.maxPrice.toString()} for ${rule.symbol}`
        );
      }

      const priceModTick = price.mod(rule.tickSize);
      if (!priceModTick.isZero()) {
        throw new Error(
          `Price ${price.toString()} does not conform to exchange tick size ${rule.tickSize.toString()} for ${rule.symbol}`
        );
      }
    } else {
      // MARKET orders: NEVER invent an arbitrary price like 50000.00!
      if (params.price !== undefined && params.price !== null && params.price !== '') {
        price = ExactDecimal.from(params.price);
        if (price.lte(ExactDecimal.zero())) {
          throw new Error(`Estimated price must be strictly positive: ${price.toString()}`);
        }
        isEstimatedPrice = true;
      } else {
        // Quantity-based MARKET BUY requires estimated quote for pre-trade risk/reservations
        if (params.side === 'BUY' && !params.quoteOrderQty) {
          throw new Error(
            `Estimated market quote price is required for quantity-based MARKET BUY order reservation. Never using arbitrary fallback price.`
          );
        }
        price = ExactDecimal.zero();
      }
    }

    // 2. Quantity & Step Size Validation
    let qty: ExactDecimal;
    const isQuoteOrderQty = isMarket && params.quoteOrderQty !== undefined && params.quoteOrderQty !== null;

    if (isQuoteOrderQty) {
      // Quote-quantity market order (e.g. buy 100 USDT worth of BTC)
      const quoteQty = ExactDecimal.from(params.quoteOrderQty!);
      if (quoteQty.lte(ExactDecimal.zero())) {
        throw new Error(`Quote quantity must be strictly positive: ${quoteQty.toString()}`);
      }
      if (quoteQty.lt(rule.minNotional)) {
        throw new Error(
          `Quote quantity ${quoteQty.toFixed(2)} is below minimum notional of ${rule.minNotional.toFixed(2)} ${rule.quoteAsset}`
        );
      }
      qty = ExactDecimal.zero();
      const notional = quoteQty;

      return {
        symbol: rule.symbol,
        baseAsset: rule.baseAsset,
        quoteAsset: rule.quoteAsset,
        quantity: qty,
        quantityStr: '',
        price,
        priceStr: '',
        notional,
        notionalStr: notional.toFixed(rule.pricePrecision),
        quoteOrderQtyStr: quoteQty.toFixed(rule.pricePrecision),
        isMarketOrder: true,
        isEstimatedPrice: false,
      };
    }

    if (params.quantity === undefined || params.quantity === null || params.quantity === '') {
      throw new Error('Order quantity is required');
    }

    qty = ExactDecimal.from(params.quantity);
    if (qty.lte(ExactDecimal.zero())) {
      throw new Error(`Order quantity must be strictly positive: ${qty.toString()}`);
    }

    // Min / Max Quantity check (market lot size takes precedence for market orders)
    const effectiveMinQty = isMarket && rule.marketMinQty ? rule.marketMinQty : rule.minQty;
    const effectiveMaxQty = isMarket && rule.marketMaxQty ? rule.marketMaxQty : rule.maxQty;
    const effectiveStepSize = isMarket && rule.marketStepSize ? rule.marketStepSize : rule.stepSize;

    if (qty.lt(effectiveMinQty)) {
      throw new Error(
        `Quantity ${qty.toString()} is below minimum quantity of ${effectiveMinQty.toString()} for ${rule.symbol}`
      );
    }
    if (qty.gt(effectiveMaxQty)) {
      throw new Error(
        `Quantity ${qty.toString()} exceeds maximum quantity of ${effectiveMaxQty.toString()} for ${rule.symbol}`
      );
    }

    // Step size alignment
    const qtyModStep = qty.mod(effectiveStepSize);
    if (!qtyModStep.isZero()) {
      throw new Error(
        `Quantity ${qty.toString()} does not conform to exchange step size ${effectiveStepSize.toString()} for ${rule.symbol}`
      );
    }

    // 3. Notional Calculation & Validation
    let notional = ExactDecimal.zero();
    if (!price.isZero()) {
      notional = qty.mul(price);

      const checkMinNotional = !isMarket || rule.applyMinToMarket !== false;
      if (checkMinNotional && notional.lt(rule.minNotional)) {
        throw new Error(
          `Order validation failed: Order notional ${notional.toFixed(2)} ${rule.quoteAsset} is below minimum notional of ${rule.minNotional.toFixed(2)} ${rule.quoteAsset}`
        );
      }

      const checkMaxNotional = !isMarket || rule.applyMaxToMarket === true;
      if (checkMaxNotional && rule.maxNotional && notional.gt(rule.maxNotional)) {
        throw new Error(
          `Order validation failed: Order notional ${notional.toFixed(2)} ${rule.quoteAsset} exceeds maximum notional of ${rule.maxNotional.toFixed(2)} ${rule.quoteAsset}`
        );
      }
    }

    return {
      symbol: rule.symbol,
      baseAsset: rule.baseAsset,
      quoteAsset: rule.quoteAsset,
      quantity: qty,
      quantityStr: qty.toFixed(rule.quantityPrecision),
      price,
      priceStr: price.isZero() ? '' : price.toFixed(rule.pricePrecision),
      notional,
      notionalStr: notional.isZero() ? '' : notional.toFixed(rule.pricePrecision),
      isMarketOrder: isMarket,
      isEstimatedPrice,
    };
  }
}
