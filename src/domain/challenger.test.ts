import { describe, it, expect } from 'vitest';
import { challengeTradingDecision } from './challenger';
import { AppState, Market, ASSETS } from '../types';
import { createPositionsRecord } from './portfolio';

const mockState: AppState = {
  schemaVersion: 2,
  cash: 15000,
  initialCash: 50000,
  startingEquity: 50000,
  realizedPnl: 0,
  totalFees: 0,
  positions: createPositionsRecord({
    BTC: 0.5, // $30,000
  }),
  avgBuyPrice: createPositionsRecord({
    BTC: 55000,
  }),
  watchlist: ['BTC', 'ETH'],
  orders: [],
  alerts: [],
  strategies: [],
  notifications: [],
  timeframe: '1D',
  selectedAsset: 'ETH',
  settings: {
    geminiApiKey: '',
    geminiModel: 'gemini-3.1-pro-preview',
    soundEnabled: true,
    enableWebSocket: true,
    theme: 'light',
    maxSlippageBps: 20,
  },
};

const mockMarkets: Record<string, Market> = {
  BTC: {
    asset: 'BTC',
    symbol: 'BTCUSDT',
    name: 'Bitcoin',
    price: 60000,
    change24h: 1.5,
    high24h: 61000,
    low24h: 59000,
    volume24h: 500000000,
    history: Array.from({ length: 30 }, (_, i) => 60000 + i * 20),
    candles: [],
    source: 'Binance REST',
    isSynthetic: false,
    lastUpdated: Date.now(),
  },
  ETH: {
    asset: 'ETH',
    symbol: 'ETHUSDT',
    name: 'Ethereum',
    price: 3000,
    change24h: 4.5,
    high24h: 3100,
    low24h: 2900,
    volume24h: 200000000,
    // Steep uptrend causing RSI > 75
    history: Array.from({ length: 30 }, (_, i) => 2500 + i * 25),
    candles: [],
    source: 'Binance REST',
    isSynthetic: false,
    lastUpdated: Date.now(),
  },
};

describe('Domain: Challenger Self-Check Pass', () => {
  it('challenges overbought oscillator conditions on buy directives', () => {
    // ETH has RSI > 70 in our mock
    const res = challengeTradingDecision(
      {
        asset: 'ETH',
        action: 'BUY',
        notional: 3000,
        quantity: 1,
      },
      mockState,
      mockMarkets as any
    );

    expect(res.hasCriticalConcerns).toBe(true);
    expect(res.concerns.some((c) => /overbought/i.test(c))).toBe(true);
    expect(res.counterArgument).toBeDefined();
    expect(res.mitigations.length).toBeGreaterThan(0);
  });

  it('challenges trades that would deplete liquid cash buffer below minimum reserve', () => {
    // Total portfolio: $45,000. Cash is $15,000. Minimum 15% cash reserve is $6,750.
    // Proposing to spend $12,000 on ETH would leave only $3,000 cash (< 7%)
    const res = challengeTradingDecision(
      {
        asset: 'ETH',
        action: 'BUY',
        notional: 12000,
        quantity: 4,
      },
      mockState,
      mockMarkets as any
    );

    expect(res.hasCriticalConcerns).toBe(true);
    expect(res.concerns.some((c) => /cash buffer|capital defense/i.test(c))).toBe(true);
  });

  it('challenges trades that breach single-asset concentration ceiling', () => {
    // Total portfolio: $45,000. 50% cap is $22,500. Current BTC is $30,000 (already 66%).
    // Proposing to buy more BTC violates single asset cap.
    const res = challengeTradingDecision(
      {
        asset: 'BTC',
        action: 'BUY',
        notional: 5000,
        quantity: 0.08,
      },
      mockState,
      mockMarkets as any
    );

    expect(res.hasCriticalConcerns).toBe(true);
    expect(res.concerns.some((c) => /breaching.*single-asset cap/i.test(c))).toBe(true);
  });

  it('returns peaceful confirmation when no trade action is proposed', () => {
    const res = challengeTradingDecision(
      {
        action: 'HOLD',
        thesis: 'Awaiting trend confirmation',
      },
      mockState,
      mockMarkets as any
    );

    expect(res.hasCriticalConcerns).toBe(false);
    expect(res.counterArgument).toContain('disciplined patience');
  });

  it('detects high correlation hazard between proposed asset and core holding', () => {
    // Propose buying SOL, which perfectly correlates with BTC (mocking same proportional history)
    const btcHist = mockMarkets.BTC.history;
    const solHist = btcHist.map((p) => p * 0.0025); // exactly 1.0 correlation
    const correlatedMarkets: any = {
      ...mockMarkets,
      SOL: {
        asset: 'SOL',
        price: 150,
        history: solHist,
        candles: [],
        lastUpdated: Date.now(),
      },
    };

    const res = challengeTradingDecision(
      {
        asset: 'SOL',
        action: 'BUY',
        notional: 1000,
        quantity: 6.6,
      },
      mockState,
      correlatedMarkets
    );

    expect(res.concerns.some((c) => /High correlation/i.test(c))).toBe(true);
  });

  it('properly annualizes volatility according to timeframeMinutes parameter', () => {
    // 1-minute candle timeframe (1440 periods per day) vs 1-day
    const volatileHist = Array.from({ length: 30 }, (_, i) => 100 * (1 + (i % 2 === 0 ? 0.03 : -0.03)));
    const volatileMarkets: any = {
      ...mockMarkets,
      AVAX: {
        asset: 'AVAX',
        price: 100,
        history: volatileHist,
        candles: [],
        lastUpdated: Date.now(),
      },
    };

    // 1-minute timeframe (1440 min/day) dramatically amplifies annualized volatility
    const res1m = challengeTradingDecision(
      {
        asset: 'AVAX',
        action: 'BUY',
        notional: 1000,
        quantity: 10,
      },
      mockState,
      volatileMarkets,
      undefined,
      1 // 1-minute candles
    );

    expect(res1m.concerns.some((c) => /Excessive volatility regime/i.test(c))).toBe(true);
  });

  it('guards against NaN indicator values and flags insufficient price data', () => {
    // Market with very few ticks where RSI cannot be computed
    const flatMarkets: any = {
      ...mockMarkets,
      LINK: {
        asset: 'LINK',
        price: 15,
        history: [15, 15, 15], // Only 3 ticks (< 14 needed for RSI)
        candles: [],
        lastUpdated: Date.now(),
      },
    };

    const res = challengeTradingDecision(
      {
        asset: 'LINK',
        action: 'BUY',
        notional: 300,
        quantity: 20,
      },
      mockState,
      flatMarkets
    );

    expect(res.concerns.some((c) => /RSI indicator unavailable|Weak sample size/i.test(c))).toBe(true);
  });

  it('flags trend conflict when spot price is below 30-period trend SMA', () => {
    // Downward trending history where current price is well below SMA30
    const downtrendHistory = Array.from({ length: 35 }, (_, i) => 100 - i * 1.5);
    const currentPrice = downtrendHistory[downtrendHistory.length - 1]; // ~$49
    const downtrendMarkets: any = {
      ...mockMarkets,
      DOT: {
        asset: 'DOT',
        price: currentPrice,
        history: downtrendHistory,
        candles: [],
        lastUpdated: Date.now(),
      },
    };

    const res = challengeTradingDecision(
      {
        asset: 'DOT',
        action: 'BUY',
        notional: 500,
        quantity: 10,
      },
      mockState,
      downtrendMarkets
    );

    expect(res.concerns.some((c) => /Trend conflict.*falling knife/i.test(c))).toBe(true);
  });
});
