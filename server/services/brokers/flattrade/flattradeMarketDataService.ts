import { BrokerMarketQuote } from '../brokerTypes';
import { FlattradeClient, FlattradeSession } from './flattradeClient';

export interface FlattradeCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openInterest?: number;
}

export interface FlattradeOptionContract {
  exchange: string;
  tradingSymbol: string;
  token: string;
  optionType?: 'CE' | 'PE';
  strikePrice?: string;
  tickSize?: string;
  lotSize?: string;
}

export interface FlattradeOptionGreeks {
  callPrice?: number;
  putPrice?: number;
  callDelta?: number;
  putDelta?: number;
  callGamma?: number;
  putGamma?: number;
  callTheta?: number;
  putTheta?: number;
  callVega?: number;
  putVega?: number;
  raw: unknown;
}

interface ResolvedScrip {
  exchange: string;
  tradingSymbol: string;
  token: string;
}

export class FlattradeMarketDataService {
  static async getQuote(
    session: FlattradeSession,
    symbol: string,
    exchange = 'NSE',
    instrumentToken?: string,
  ): Promise<BrokerMarketQuote | null> {
    const resolved = await this.resolveScrip(session, symbol, exchange, instrumentToken);
    if (!resolved) return null;
    const response = await FlattradeClient.getQuotes(session, resolved.exchange, resolved.token);
    const data = this.firstRecord(response);
    if (!data) return null;
    const lastPrice = this.number(data.lp ?? data.ltp ?? data.last_price);
    if (lastPrice === undefined) return null;
    return {
      instrumentKey: `${resolved.exchange}|${resolved.token}`,
      symbol: resolved.tradingSymbol,
      price: lastPrice,
      lastPrice,
      lastQty: this.number(data.ltq ?? data.lttq),
      bidPrice: this.number(data.bp1 ?? data.bidprice ?? data.bp),
      bidQty: this.number(data.bq1 ?? data.bidqty ?? data.bq),
      askPrice: this.number(data.sp1 ?? data.askprice ?? data.ap),
      askQty: this.number(data.sq1 ?? data.askqty ?? data.aq),
      quoteTime: this.parseTime(data.ltt ?? data.request_time) || Date.now(),
      isAuthoritative: true,
      isSynthetic: false,
      source: 'FLATTRADE_API',
    };
  }

  static async getQuotesBatch(
    session: FlattradeSession,
    symbols: string[],
    exchange = 'NSE',
  ): Promise<Record<string, BrokerMarketQuote>> {
    const results: Record<string, BrokerMarketQuote> = {};
    for (let index = 0; index < symbols.length; index += 4) {
      const batch = symbols.slice(index, index + 4);
      const quotes = await Promise.all(batch.map(async (symbol) => ({ symbol, quote: await this.getQuote(session, symbol, exchange) })));
      for (const { symbol, quote } of quotes) {
        if (quote) results[symbol] = quote;
      }
    }
    return results;
  }

  static async getCandles(
    session: FlattradeSession,
    input: { symbol: string; exchange?: string; intervalMinutes?: number; from?: Date; to?: Date; instrumentToken?: string },
  ): Promise<FlattradeCandle[]> {
    const exchange = input.exchange || 'NSE';
    const resolved = await this.resolveScrip(session, input.symbol, exchange, input.instrumentToken);
    if (!resolved) return [];
    const to = input.to || new Date();
    const from = input.from || new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const response = await FlattradeClient.getTimePriceData(
      session,
      resolved.exchange,
      resolved.token,
      Math.floor(from.getTime() / 1000),
      Math.floor(to.getTime() / 1000),
      this.normalizeInterval(input.intervalMinutes || 5),
    );
    const values = this.records(response);
    return values.map((value) => ({
      time: this.parseTime(value.time ?? value.ssboe) || 0,
      open: this.number(value.into) || 0,
      high: this.number(value.inth) || 0,
      low: this.number(value.intl) || 0,
      close: this.number(value.intc) || 0,
      volume: this.number(value.intv ?? value.v) || 0,
      openInterest: this.number(value.oi),
    })).filter((candle) => candle.time > 0 && candle.close > 0).sort((left, right) => left.time - right.time);
  }

  static async getOptionChain(
    session: FlattradeSession,
    input: { exchange: string; symbol: string; strikePrice: string; count?: number },
  ): Promise<FlattradeOptionContract[]> {
    const response = await FlattradeClient.getOptionChain(session, input.exchange, input.symbol, input.strikePrice, input.count);
    return this.records(response).map((value) => ({
      exchange: String(value.exch || input.exchange),
      tradingSymbol: String(value.tsym || ''),
      token: String(value.token || ''),
      optionType: value.optt === 'CE' || value.optt === 'PE' ? value.optt : undefined,
      strikePrice: value.strprc === undefined ? undefined : String(value.strprc),
      tickSize: value.ti === undefined ? undefined : String(value.ti),
      lotSize: value.ls === undefined ? undefined : String(value.ls),
    })).filter((contract) => Boolean(contract.tradingSymbol && contract.token));
  }

  static async getOptionGreeks(
    session: FlattradeSession,
    input: { expiryDate: string; strikePrice: string; spotPrice: string; interestRate: string; volatility: string; optionType: 'CE' | 'PE' },
  ): Promise<FlattradeOptionGreeks> {
    const response = await FlattradeClient.getOptionGreek(session, input);
    const data = this.firstRecord(response) || {};
    return {
      callPrice: this.number(data.cal_price),
      putPrice: this.number(data.put_price),
      callDelta: this.number(data.cal_delta),
      putDelta: this.number(data.put_delta),
      callGamma: this.number(data.cal_gamma),
      putGamma: this.number(data.put_gamma),
      callTheta: this.number(data.cal_theta),
      putTheta: this.number(data.put_theta),
      callVega: this.number(data.cal_vega),
      putVega: this.number(data.put_vega),
      raw: response,
    };
  }

  private static async resolveScrip(
    session: FlattradeSession,
    symbol: string,
    exchange: string,
    instrumentToken?: string,
  ): Promise<ResolvedScrip | null> {
    if (instrumentToken) {
      return { exchange, tradingSymbol: symbol, token: instrumentToken };
    }
    const response = await FlattradeClient.searchScrip(session, exchange, symbol);
    const match = this.records(response).find((value) => String(value.tsym || '').toUpperCase() === symbol.toUpperCase()) || this.firstRecord(response);
    if (!match?.token) return null;
    return {
      exchange: String(match.exch || exchange),
      tradingSymbol: String(match.tsym || symbol),
      token: String(match.token),
    };
  }

  private static normalizeInterval(interval: number): number {
    return [1, 3, 5, 10, 15, 30, 60, 120].includes(interval) ? interval : 5;
  }

  private static records(response: any): any[] {
    const data = response?.data ?? response;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.values)) return data.values;
    if (Array.isArray(data?.data)) return data.data;
    return data && typeof data === 'object' ? [data] : [];
  }

  private static firstRecord(response: any): any | null {
    return this.records(response)[0] || null;
  }

  private static number(value: unknown): number | undefined {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }

  private static parseTime(value: unknown): number | undefined {
    if (typeof value === 'number' && value > 1_000_000_000_000) return value;
    if (typeof value === 'number' && value > 1_000_000_000) return value * 1000;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
