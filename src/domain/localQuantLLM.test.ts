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
    if (a === 'RELIANCE') p = 2800;
    if (a === 'TCS') p = 4000;
    if (a === 'INFY') p = 1800;
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

  it('answers MEV, sandwich attacks, and order flow microstructure queries', () => {
    const res = queryLocalQuantLLM('How do sandwich attacks and MEV searchers profit?', mockState, mockMarkets);
    expect(res.reply).toContain('Maximal Extractable Value');
    expect(res.reply).toContain('P_{\\text{max}}');
    expect(res.reply).toContain('Loss Versus Rebalancing');
    expect(res.reply).toContain('\\text{LVR}');
  });

  it('analyzes options volatility surfaces, skew, and Greeks', () => {
    const res = queryLocalQuantLLM('Explain 25-delta put-call skew and implied volatility smile', mockState, mockMarkets);
    expect(res.reply).toContain('Volatility Smile');
    expect(res.reply).toContain('Black-Scholes');
    expect(res.reply).toContain('\\text{Vega } (\\mathcal{V})');
    expect(res.reply).toContain('\\text{25-Delta Put-Call Skew}');
  });

  it('deconstructs staking vs lending risks and yield curves', () => {
    const res = queryLocalQuantLLM('Compare liquid staking LST yield vs Aave lending risk', mockState, mockMarkets);
    expect(res.reply).toContain('Liquid Staking (LST) vs DeFi Lending');
    expect(res.reply).toContain('Comparative Risk Matrix');
    expect(res.reply).toContain('Slashing Risk');
    expect(res.reply).toContain('U_{\\text{kink}}');
  });

  it('audits portfolio concentration with live Herfindahl-Hirschman index (HHI)', () => {
    const res = queryLocalQuantLLM('Is my portfolio too concentrated? What is my HHI?', mockState, mockMarkets);
    expect(res.reply).toContain('Herfindahl-Hirschman Index');
    expect(res.reply).toContain('\\text{HHI} =');
    expect(res.reply).toContain('Institutional Concentration Thresholds');
  });

  it('analyzes Layer-2 rollup gas economics, blobs, and proof latency', () => {
    const res = queryLocalQuantLLM('Compare Optimistic vs ZK rollups finality and fees', mockState, mockMarkets);
    expect(res.reply).toContain('Layer-2 Rollup Microeconomics');
    expect(res.reply).toContain('EIP-4844');
    expect(res.reply).toContain('Optimistic vs ZK Rollup Architecture');
    expect(res.reply).toContain('Validity Proofs');
  });

  it('executes autonomous multi-step agentic workflows with 4-phase execution blueprints', () => {
    const res = queryLocalQuantLLM('Audit my portfolio, hedge my risk, and deploy an automated bot', mockState, mockMarkets);
    expect(res.reply).toContain('Autonomous Agentic Workflow');
    expect(res.reply).toContain('4-Phase Execution Roadmap');
    expect(res.reply).toContain('Phase 1: Capital Defense');
    expect(res.reply).toContain('Phase 4: Sentinel Vigilance');
    expect(res.actionProposal).toBeDefined();
    expect(res.actionProposal?.requiresConfirmation).toBe(true);
  });

  it('handles friendly human greetings and capability introduction warmly', () => {
    const res = queryLocalQuantLLM('Hello! Who are you and what can you do for me?', mockState, mockMarkets);
    expect(res.reply).toContain('Nexus Intelligence');
    expect(res.reply).toContain('What I Can Do for You');
    expect(res.reply).toContain('Autonomous Agentic Workflows');
    expect(res.reply).toContain('Capabilities Hub');
  });

  it('provides deep psychological guidance on quitting job to trade full-time', () => {
    const res = queryLocalQuantLLM('I want to quit my job to trade full time. What do you think?', mockState, mockMarkets);
    expect(res.reply).toContain('Thinking of Quitting Your Job to Trade Full-Time');
    expect(res.reply).toContain('Living Expenses');
    expect(res.reply).toContain('Mental Capital Drain');
    expect(res.reply).toContain('The Professional Blueprint');
  });

  it('neutralizes emotional FOMO with quantitative reality', () => {
    const res = queryLocalQuantLLM('I have massive FOMO on this pump, should I buy now?', mockState, mockMarkets);
    expect(res.reply).toContain('Emotional Circuit Breaker: Neutralizing FOMO');
    expect(res.reply).toContain('Never Chase the Bid');
    expect(res.reply).toContain('Mean-Reversion');
  });

  it('explains blockchain in clear storytelling for a child or grandmother (ELI5)', () => {
    const res = queryLocalQuantLLM('Explain blockchain to my grandmother in simple words', mockState, mockMarkets);
    expect(res.reply).toContain('Magic Shared Notebook');
    expect(res.reply).toContain('Double-Spending');
  });

  it('eloquently articulates Satoshi Nakamoto vision and Byzantine Generals resolution', () => {
    const res = queryLocalQuantLLM('What was Satoshi Nakamoto vision in the Bitcoin whitepaper?', mockState, mockMarkets);
    expect(res.reply).toContain('Byzantine Generals Problem');
    expect(res.reply).toContain('Proof-of-Work');
    expect(res.reply).toContain('Genesis Block');
  });

  it('shares clever quantitative crypto humor when asked for a joke', () => {
    const res = queryLocalQuantLLM('Tell me a funny crypto trading joke', mockState, mockMarkets);
    expect(res.reply).toContain('Quantitative & Crypto Trading Humor');
    expect(res.reply).toContain('Sandwich Bot');
  });

  it('answers freeform open-ended economic questions with dynamic telemetry grounding', () => {
    const res = queryLocalQuantLLM('How might quantum computing impact RSA and elliptic curve cryptography in finance?', mockState, mockMarkets);
    expect(res.reply).toContain('Contextual Market Analysis');
    expect(res.reply).toContain('Current Portfolio Baseline');
    expect(res.reply).toContain('Total Capital Equity');
  });

  it('generates distinct, non-identical responses for different prompts (no static repetitive template)', () => {
    const res1 = queryLocalQuantLLM('Should I sell ETH?', mockState, mockMarkets);
    const res2 = queryLocalQuantLLM('How do funding rates work?', mockState, mockMarkets);
    const res3 = queryLocalQuantLLM('Run a stress test on my portfolio', mockState, mockMarkets);
    const res4 = queryLocalQuantLLM('Tell me a joke', mockState, mockMarkets);

    expect(res1.reply).not.toEqual(res2.reply);
    expect(res2.reply).not.toEqual(res3.reply);
    expect(res3.reply).not.toEqual(res4.reply);
    expect(res1.reply).toContain('ETH');
    expect(res2.reply).toContain('Funding Rate');
    expect(res3.reply).toContain('Stress-Test');
    expect(res4.reply).toContain('Humor');
  });

  it('evaluates NSE equities and futures cash-and-carry basis arbitrage', () => {
    const res = queryLocalQuantLLM('Explain NSE cash-and-carry basis trade and cost of carry', mockState, mockMarkets);
    expect(res.reply).toContain('NSE Equities & Futures Cash-and-Carry Basis Microstructure');
    expect(res.reply).toContain('Annualized Basis Yield');
    expect(res.reply).toContain('RBI risk-free repo rate');
    expect(res.reply).toContain('Delta');
  });

  it('evaluates TTM Volatility Squeeze and Half-Kelly position sizing', () => {
    const res = queryLocalQuantLLM('What is the TTM squeeze status and optimal Half-Kelly sizing for RELIANCE?', mockState, mockMarkets);
    expect(res.reply).toContain('TTM Volatility Squeeze & Half-Kelly Sizing Architecture');
    expect(res.reply).toContain('Keltner Channel');
    expect(res.reply).toContain('Half-Kelly');
    expect(res.reply).toContain('f^*');
  });

  it('analyzes Indian macroeconomic cycle, RBI repo rate, and FII/DII liquidity', () => {
    const res = queryLocalQuantLLM('How does RBI repo rate and FII DII institutional liquidity impact Nifty?', mockState, mockMarkets);
    expect(res.reply).toContain('Indian Macroeconomic Cycle & Institutional Liquidity Dynamics');
    expect(res.reply).toContain('RBI Repo Rate');
    expect(res.reply).toContain('G-Sec Yield');
    expect(res.reply).toContain('FII');
  });

  it('evaluates high-frequency order flow imbalance (OFI) and Kyle lambda', () => {
    const res = queryLocalQuantLLM('Explain order flow imbalance OFI and Kyle lambda price impact on NSE', mockState, mockMarkets);
    expect(res.reply).toContain('High-Frequency Market Microstructure: OFI & Kyle\'s Lambda');
    expect(res.reply).toContain('Kyle\'s Lambda');
    expect(res.reply).toContain('Order Flow Imbalance');
  });

  // ==========================================================================
  // ENHANCED 1-CLICK QUANT TOOLS & SLASH COMMANDS TESTS
  // ==========================================================================
  it('executes /audit and audit instantly with Sentinel risk, HHI, and liquid cash check', () => {
    const resSlash = queryLocalQuantLLM('/audit', mockState, mockMarkets);
    expect(resSlash.reply).toContain('Sentinel Portfolio Danger & Risk Audit');
    expect(resSlash.reply).toContain('Herfindahl Index (HHI)');
    expect(resSlash.reply).toContain('\\text{Danger}');
    expect(resSlash.reply).toContain('Total Portfolio Equity');

    const resWord = queryLocalQuantLLM('audit', mockState, mockMarkets);
    expect(resWord.reply).toContain('Sentinel Portfolio Danger & Risk Audit');
  });

  it('executes /scan and scan with Multi-Asset Alpha Radar and asymmetric R:R setups', () => {
    const res = queryLocalQuantLLM('/scan', mockState, mockMarkets);
    expect(res.reply).toContain('Multi-Asset Alpha Radar Scanner');
    expect(res.reply).toContain('Factor Matrix & Alpha Rankings');
    expect(res.reply).toContain('Alpha Score');
    expect(res.reply).toContain('Reward-to-Risk');
    expect(res.actionProposal).toBeDefined();
    expect(res.actionProposal?.type).toBe('order');
    expect(res.actionProposal?.side).toBe('buy');
  });

  it('executes /scan nse with Indian Equities and enforces integer shares and ₹0.05 tick size', () => {
    const upstoxState: AppState = {
      ...mockState,
      accountMode: 'upstox',
      cash: 25000,
      selectedAsset: 'RELIANCE',
    };
    const res = queryLocalQuantLLM('/scan nse', upstoxState, mockMarkets);
    expect(res.reply).toContain('Multi-Asset Alpha Radar Scanner');
    expect(res.reply).toContain('Top 10 NSE Indian Bluechips');
    expect(res.reply).toContain('₹');
    expect(res.reply).toContain('Integer equity delivery shares');

    expect(res.actionProposal).toBeDefined();
    if (res.actionProposal) {
      expect(Number.isInteger(res.actionProposal.amount)).toBe(true);
      expect((res.actionProposal.amount || 0) >= 1).toBe(true);
      if (res.actionProposal.limitPrice) {
        // Must align to 0.05 tick
        const rem = Math.round((res.actionProposal.limitPrice % 0.05) * 100) / 100;
        expect(rem === 0 || rem === 0.05).toBe(true);
      }
    }
  });

  it('executes /bot and synthesizes institutional strategy bot with dynamic ATR brackets', () => {
    const res = queryLocalQuantLLM('/bot SOL', mockState, mockMarkets);
    expect(res.reply).toContain('Strategy Bot Architecture');
    expect(res.reply).toContain('Institutional VWAP Momentum Engine');
    expect(res.reply).toContain('Normalized ATR Volatility');
    expect(res.reply).toContain('Dynamic Take-Profit (TP)');
    expect(res.reply).toContain('Trailing Stop-Loss (SL)');

    expect(res.actionProposal).toBeDefined();
    expect(res.actionProposal?.type).toBe('deploy_strategy');
    expect(res.actionProposal?.strategyParams?.kind).toBe('vwap_trend');
    expect(res.actionProposal?.strategyParams?.targetProfitPct).toBeGreaterThan(0);
  });

  it('executes /dca and formulates Smart Value-Weighted DCA plan with dip multipliers', () => {
    const res = queryLocalQuantLLM('/dca BTC', mockState, mockMarkets);
    expect(res.reply).toContain('Smart Value-Weighted DCA Accumulator');
    expect(res.reply).toContain('Dynamic Accumulation Matrix');
    expect(res.reply).toContain('Deep Oversold Dip');
    expect(res.reply).toContain('1.60x');
    expect(res.reply).toContain('Euphoria Circuit Breaker');

    expect(res.actionProposal).toBeDefined();
    expect(res.actionProposal?.type).toBe('smart_dca');
    expect(res.actionProposal?.dcaPlan?.oversoldMultiplier).toBe(1.6);
  });

  it('executes /rebalance and computes Quarter-Kelly two-stage rebalancing plan', () => {
    const res = queryLocalQuantLLM('/rebalance', mockState, mockMarkets);
    expect(res.reply).toContain('Fractional Kelly Portfolio Rebalancing');
    expect(res.reply).toContain('Quarter-Kelly Optimal');
    expect(res.reply).toContain('Two-Stage Execution Schedule');
    expect(res.actionProposal).toBeDefined();
    expect(res.actionProposal?.type).toBe('rebalance');
  });

  it('executes /stress and simulates portfolio flash crashes, rate hikes, and 95% VaR', () => {
    const res = queryLocalQuantLLM('/stress', mockState, mockMarkets);
    expect(res.reply).toContain('Quantitative Portfolio Stress-Test & Crisis Simulation');
    expect(res.reply).toContain('Crisis Simulation Matrix');
    expect(res.reply).toContain('95% Parametric VaR');
    expect(res.reply).toContain('Survivability Rating');
    expect(res.actionProposal).toBeDefined();
    expect(res.actionProposal?.type).toBe('stress_test');
  });

  it('executes /help and displays interactive quant commands cheatsheet', () => {
    const res = queryLocalQuantLLM('/help', mockState, mockMarkets);
    expect(res.reply).toContain('Nexus Deterministic Quant Tools & Slash Commands');
    expect(res.reply).toContain('/audit');
    expect(res.reply).toContain('/scan');
    expect(res.reply).toContain('/bot');
    expect(res.reply).toContain('/dca');
    expect(res.reply).toContain('/rebalance');
    expect(res.reply).toContain('/stress');
    expect(res.reply).toContain('Native Indian Equities (Upstox) Invariants');
  });

  it('provides native Upstox NSE equity deep quant analysis with integer shares and ₹2,000 cash floor defense', () => {
    const upstoxState: AppState = {
      ...mockState,
      accountMode: 'upstox',
      cash: 15000,
      selectedAsset: 'RELIANCE',
    };
    const res = queryLocalQuantLLM('analyze RELIANCE', upstoxState, mockMarkets);
    expect(res.reply).toContain('Quantitative NSE Equity Analysis: RELIANCE');
    expect(res.reply).toContain('₹');
    expect(res.reply).toContain('₹0.05 NSE Compliant');
    expect(res.reply).toContain('Upstox Order Formulation & Safety Directives');

    expect(res.actionProposal).toBeDefined();
    if (res.actionProposal) {
      expect(res.actionProposal.asset).toBe('RELIANCE');
      expect(Number.isInteger(res.actionProposal.amount)).toBe(true);
      // Verify cash floor: cash - notional must be >= 2000
      const notional = (res.actionProposal.amount || 0) * (res.actionProposal.limitPrice || 2800);
      expect(upstoxState.cash - notional).toBeGreaterThanOrEqual(2000);
    }
  });
});

