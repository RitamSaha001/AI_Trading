import { describe, it, expect } from 'vitest';
import { queryLocalQuantLLM } from './localQuantLLM';
import { AppState, Market, ASSETS } from '../types';
import { createPositionsRecord } from './portfolio';

const createMockMarket = (asset: string, price: number, change24h = 0): Market => ({
  asset: asset as any,
  symbol: `${asset}USDT`,
  name: asset,
  price,
  change24h,
  high24h: price * 1.05,
  low24h: price * 0.95,
  volume24h: 100000000,
  history: Array.from({ length: 30 }, (_, i) => price * (1 + 0.03 * Math.sin(i * 0.5))),
  candles: [],
  source: 'Simulated Heuristic',
  isSynthetic: false,
  lastUpdated: Date.now(),
});

const mockState: AppState = {
  schemaVersion: 2,
  cash: 20000,
  initialCash: 50000,
  startingEquity: 50000,
  realizedPnl: 2500,
  totalFees: 45,
  positions: createPositionsRecord({
    BTC: 0.5, // 30,000
    ETH: 3,   // 9,000
  }),
  avgBuyPrice: createPositionsRecord({
    BTC: 58000,
    ETH: 2900,
  }),
  watchlist: ['BTC', 'ETH', 'SOL'],
  orders: [],
  alerts: [],
  strategies: [],
  notifications: [],
  timeframe: '1D',
  selectedAsset: 'BTC',
  settings: {
    geminiApiKey: '',
    geminiModel: 'gemini-3.8-flash',
    soundEnabled: true,
    enableWebSocket: true,
    theme: 'light',
    maxSlippageBps: 20,
  },
};

const mockMarkets = Object.fromEntries(
  ASSETS.map((a) => {
    let p = 100;
    if (a === 'BTC') p = 60000;
    if (a === 'ETH') p = 3000;
    if (a === 'SOL') p = 150;
    return [a, createMockMarket(a, p, 2.5)];
  })
) as Record<any, Market>;

describe('LocalQuantLLM High-Benchmark Fallback Engine', () => {
  it('dynamically answers asset specific questions with KaTeX and asymmetric brackets', () => {
    const res = queryLocalQuantLLM('What is the quantitative outlook for SOL?', mockState, mockMarkets);
    expect(res.engine).toContain('Local Quantitative LLM');
    expect(res.reply).toContain('SOL');
    expect(res.reply).toContain('Support & Resistance');
    expect(res.reply).toContain('\\text{ATR}');
    expect(res.actionProposal).toBeDefined();
    expect(res.actionProposal?.asset).toBe('SOL');
  });

  it('answers derivatives and funding rate queries with microstructure theory', () => {
    const res = queryLocalQuantLLM('Explain funding rates and perpetual futures', mockState, mockMarkets);
    expect(res.reply).toContain('Perpetual Swaps');
    expect(res.reply).toContain('Funding Payment Formulation');
    expect(res.reply).toContain('Basis Yield');
    expect(res.reply).toContain('\\text{Funding Rate}');
  });

  it('explains AMM invariants and impermanent loss with KaTeX formula', () => {
    const res = queryLocalQuantLLM('What is impermanent loss in Uniswap DeFi?', mockState, mockMarkets);
    expect(res.reply).toContain('Automated Market Makers');
    expect(res.reply).toContain('x \\cdot y = k');
    expect(res.reply).toContain('\\text{IL}(k_p)');
  });

  it('answers macro cycle and halving questions with quantitative fundamentals', () => {
    const res = queryLocalQuantLLM('How does Bitcoin halving and global M2 liquidity impact cycles?', mockState, mockMarkets);
    expect(res.reply).toContain('Macroeconomic Regime');
    expect(res.reply).toContain('Global M2');
    expect(res.reply).toContain('Daily BTC Issuance');
  });

  it('evaluates technical indicators mathematically', () => {
    const res = queryLocalQuantLLM('Explain how RSI and Bollinger Bands are calculated', mockState, mockMarkets);
    expect(res.reply).toContain('Relative Strength Index');
    expect(res.reply).toContain('Bollinger Bands');
    expect(res.reply).toContain('%B');
  });

  it('generates distinct, non-identical responses for different prompts (no static repetitive template)', () => {
    const res1 = queryLocalQuantLLM('Should I sell ETH?', mockState, mockMarkets);
    const res2 = queryLocalQuantLLM('How do funding rates work?', mockState, mockMarkets);
    const res3 = queryLocalQuantLLM('Run a stress test on my portfolio', mockState, mockMarkets);

    expect(res1.reply).not.toEqual(res2.reply);
    expect(res2.reply).not.toEqual(res3.reply);
    expect(res1.reply).toContain('ETH');
    expect(res2.reply).toContain('Funding Rate');
    expect(res3.reply).toContain('Stress-Test');
  });
});
