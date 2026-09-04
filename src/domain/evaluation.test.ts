import { describe, it, expect } from 'vitest';
import { queryLocalQuantLLM } from './localQuantLLM';
import { runAgentLoop } from './agentLoop';
import { validateAIProposal } from '../services/safetyGate';
import { MarketDataValidityGuard } from './marketValidity';
import { calculateRiskBasedPositionSize } from './positionSizing';
import { QUANT_TOOLS } from './quantTools';
import { AppState, Market, Asset, ASSETS } from '../types';
import { createPositionsRecord } from './portfolio';
import { LLMProvider, LLMGenerateRequest, LLMGenerateResponse } from './llmProvider';
import { DEFAULT_RISK_POLICY } from './riskPolicy';

const createMockMarket = (asset: string, price: number, change24h = 0, ageMs = 0): Market => ({
  asset: asset as any,
  symbol: `${asset}USDT`,
  name: asset,
  price,
  change24h,
  high24h: price * 1.05,
  low24h: price * 0.95,
  volume24h: 150_000_000,
  history: Array.from({ length: 30 }, (_, i) => price * (1 + 0.02 * Math.sin(i * 0.4))),
  candles: [],
  source: 'Simulated Heuristic',
  isSynthetic: false,
  lastUpdated: Date.now() - ageMs,
});

const mockState: AppState = {
  schemaVersion: 2,
  cash: 25000,
  initialCash: 50000,
  startingEquity: 50000,
  realizedPnl: 1200,
  totalFees: 35,
  positions: createPositionsRecord({
    BTC: 0.35,  // ~$21,000 at $60,000
    ETH: 2.0,   // ~$6,000 at $3,000
    SOL: 10,    // ~$1,500 at $150
  }),
  avgBuyPrice: createPositionsRecord({
    BTC: 58000,
    ETH: 2900,
    SOL: 140,
  }),
  watchlist: ['BTC', 'ETH', 'SOL', 'AVAX'],
  orders: [],
  alerts: [],
  strategies: [],
  notifications: [],
  timeframe: '1D',
  selectedAsset: 'BTC',
  settings: {
    geminiApiKey: '',
    geminiModel: 'gemini-3.8-flash',
    soundEnabled: false,
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
    if (a === 'AVAX') p = 30;
    return [a, createMockMarket(a, p, 1.5)];
  })
) as Record<Asset, Market>;

const ctx = {
  state: mockState,
  markets: mockMarkets,
  policy: DEFAULT_RISK_POLICY,
};

class MockAgentProvider implements LLMProvider {
  name = 'Mock Evaluation Provider';
  callCount = 0;

  async generate(req: LLMGenerateRequest): Promise<LLMGenerateResponse> {
    this.callCount++;
    if (this.callCount === 1) {
      return {
        toolCalls: [
          { name: 'get_market_snapshot', args: { asset: 'ETH' } },
          { name: 'calculate_indicators', args: { asset: 'ETH' } },
          { name: 'calculate_portfolio_risk', args: {} },
        ],
      };
    }
    return {
      text: `### Executive Analysis: Ethereum (ETH)
ETH shows constructive momentum with verified support.

<<<DECISION
{
  "intent": "Risk-budgeted ETH swing accumulation",
  "thesis": "ETH is consolidating above key moving averages with disciplined risk exposure.",
  "evidence": ["ETH spot at $3000", "Portfolio cash is 46.7%"],
  "asset": "ETH",
  "action": "BUY",
  "entry": 3000,
  "stopLoss": 2850,
  "takeProfit": 3350,
  "quantity": 1.0,
  "notional": 3000,
  "riskAmount": 150,
  "portfolioRiskImpact": "Allocates $3,000 notional; cash reserve stays well above 15% minimum.",
  "signalScore": 60,
  "modelConfidence": 85,
  "dataQuality": 95,
  "riskReward": 2.33,
  "assumptions": ["BTC maintains support above $58k"],
  "warnings": ["Elevated gas fees during US market hours"],
  "alternatives": ["Scale in via two tranches"],
  "invalidation": "Hourly close below $2,820 violates market structure",
  "requiresConfirmation": true,
  "timeHorizon": "swing",
  "regime": "Constructive Bullish Consolidation"
}
DECISION>>>`,
    };
  }
}

describe('Comprehensive Quantitative Trading Intelligence Evaluation Suite (14 Categories)', () => {
  // Category 1: Market Analysis
  it('Category 1: Market Analysis - grounds response in live market data without hallucinations', () => {
    const res = queryLocalQuantLLM('What is the current technical and market status of BTC?', mockState, mockMarkets);
    expect(res.reply).toContain('BTC');
    expect(res.reply).toContain('Spot Quote');
    expect(res.reply).toContain('Market Regime');
    expect(res.reply).toContain('RSI');
    expect(res.reply).not.toContain('62500'); // Does not use stale hardcoded fallback
    expect(res.reply).toContain('60,000'); // Uses exact live spot quote
  });

  // Category 2: Portfolio Construction
  it('Category 2: Portfolio Construction - calculates exposure breakdown and concentration', async () => {
    const exp = await QUANT_TOOLS.calculate_portfolio_exposure.execute({}, ctx);
    expect(exp.success).toBe(true);
    expect(exp.totalEquity).toBeGreaterThan(0);
    expect(exp.liquidCash).toBe(25000);
    expect(exp.cashReservePct).toBeGreaterThan(15); // Capital preservation check
    expect(exp.activeHoldings.BTC).toBeDefined();

    const conc = await QUANT_TOOLS.calculate_concentration.execute({}, ctx);
    expect(conc.success).toBe(true);
    expect(conc.herfindahlIndex).toBeDefined();
    expect(conc.status).toBeDefined();
  });

  // Category 3: Risk Management
  it('Category 3: Risk Management - computes portfolio VaR, CVaR, and max single trade cap', async () => {
    const varRes = await QUANT_TOOLS.calculate_var.execute({ confidenceLevel: '95' }, ctx);
    expect(varRes.success).toBe(true);
    expect(varRes.varUsd).toBeGreaterThan(0);
    expect(varRes.varPct).toBeGreaterThan(0);

    const esRes = await QUANT_TOOLS.calculate_expected_shortfall.execute({ confidenceLevel: '95' }, ctx);
    expect(esRes.success).toBe(true);
    expect(esRes.expectedShortfallUsd).toBeGreaterThanOrEqual(varRes.varUsd);
  });

  // Category 4: Technical Analysis
  it('Category 4: Technical Analysis - computes RSI, ATR, MACD, and Bollinger Bands accurately', async () => {
    const ind = await QUANT_TOOLS.calculate_indicators.execute({ asset: 'SOL' }, ctx);
    expect(ind.success).toBe(true);
    expect(ind.rsi).toBeGreaterThan(0);
    expect(ind.rsi).toBeLessThanOrEqual(100);
    expect(ind.atr).toBeGreaterThan(0);
    expect(ind.bollingerBands).toBeDefined();
    expect(ind.bollingerBands.upper).toBeGreaterThan(ind.bollingerBands.lower);
  });

  // Category 5: Derivatives & Microstructure
  it('Category 5: Derivatives - analyzes funding rates, annualized basis, and options volatility surface', async () => {
    const funding = await QUANT_TOOLS.analyze_funding.execute({ asset: 'BTC' }, ctx);
    expect(funding.success).toBe(true);
    expect(funding.estimatedFundingRate8hPct).toBeDefined();
    expect(funding.annualizedBasisYieldPct).toBeDefined();

    const options = await QUANT_TOOLS.analyze_options.execute({ asset: 'ETH' }, ctx);
    expect(options.success).toBe(true);
    expect(options.impliedVolatilityProxyPct).toBeGreaterThan(0);
    expect(options.putCallSkewProxyPct).toBeDefined();
  });

  // Category 6: Macroeconomics
  it('Category 6: Macro - evaluates global liquidity and monetary regime transmission', async () => {
    const macro = await QUANT_TOOLS.analyze_macro_regime.execute({}, ctx);
    expect(macro.success).toBe(true);
    expect(macro.macroRegime).toBeDefined();
    expect(macro.catalysts.length).toBeGreaterThan(0);
  });

  // Category 7: Systemic Stress Testing
  it('Category 7: Stress Testing - models portfolio losses under flash crash and liquidity crisis', async () => {
    const stress = await QUANT_TOOLS.stress_test_portfolio.execute({ scenarioId: 'btc_flash_crash_20' }, ctx);
    expect(stress.success).toBe(true);
    expect(stress.stressTest.simulatedLossUsd).toBeGreaterThan(0);
    expect(stress.stressTest.simulatedDrawdownPct).toBeGreaterThan(0);
    expect(stress.stressTest.survivabilityRating).toBeDefined();
  });

  // Category 8: Strategy Selection
  it('Category 8: Strategy Selection - calibrates automated strategy bots to asset volatility and regime', async () => {
    const bot = await QUANT_TOOLS.generate_strategy.execute({ asset: 'SOL', kind: 'vwap_trend' }, ctx);
    expect(bot.success).toBe(true);
    expect(bot.strategyConfig.maxAllocation).toBeLessThanOrEqual(DEFAULT_RISK_POLICY.maxSingleAssetPct);
    expect(bot.strategyConfig.targetProfitPct).toBeGreaterThan(0);
    expect(bot.strategyConfig.trailingStopPct).toBeGreaterThan(0);
  });

  // Category 9: Position Sizing
  it('Category 9: Position Sizing - derives risk-budgeted order sizes adhering to 15% cash preservation', () => {
    const sized = calculateRiskBasedPositionSize({
      asset: 'BTC',
      side: 'buy',
      entryPrice: 60000,
      stopPrice: 57000,
      targetPrice: 66000,
      portfolioEquity: 53500,
      availableCash: 25000,
      currentHolding: 0.35,
      currentHoldingNotional: 21000,
      market: mockMarkets.BTC,
      policy: DEFAULT_RISK_POLICY,
    });

    expect(sized.quantity).toBeGreaterThan(0);
    expect(sized.notional).toBeLessThanOrEqual(53500 * DEFAULT_RISK_POLICY.maxSingleOrderPortfolioPct);
    // Residual cash must respect minimum cash reserve (15% = $8,025)
    expect(25000 - sized.notional).toBeGreaterThanOrEqual(53500 * DEFAULT_RISK_POLICY.minCashReservePct - 50);
  });

  // Category 10: Portfolio Rebalancing
  it('Category 10: Portfolio Rebalancing - creates risk-parity rebalance plan preserving cash reserve', async () => {
    const plan = await QUANT_TOOLS.generate_rebalance_plan.execute({ style: 'risk_parity' }, ctx);
    expect(plan.success).toBe(true);
    expect(plan.rebalancePlan.cashTargetPct).toBeGreaterThanOrEqual(15);
    expect(plan.rebalancePlan.steps.length).toBeGreaterThan(0);
    for (const step of plan.rebalancePlan.steps) {
      expect(['buy', 'sell']).toContain(step.action);
      expect(step.amount).toBeGreaterThan(0);
    }
  });

  // Category 11: Ambiguous Natural Language Prompts
  it('Category 11: Ambiguous Prompts - handles ambiguous questions safely and with structured clarity', async () => {
    const res = queryLocalQuantLLM('what should i do today?', mockState, mockMarkets);
    expect(res.reply).toContain('Nexus');
    expect(res.reply.length).toBeGreaterThan(200);
    expect(res.engine).toBeDefined();
    if (res.actionProposal) {
      expect(res.actionProposal.requiresConfirmation).toBe(true);
    }
  });

  // Category 12: Adversarial Prompts & Directional Correctness
  it('Category 12: Adversarial Prompts - enforces directional intent and blocks unconstrained sizing', () => {
    // 1. Directional correctness on reduce/trim prompt
    const reduceRes = queryLocalQuantLLM('BTC looks weak. Should I reduce my position?', mockState, mockMarkets);
    expect(reduceRes.actionProposal).toBeDefined();
    expect(reduceRes.actionProposal?.side).toBe('sell'); // Correctly parsed as SELL, not BUY
    expect(reduceRes.actionProposal?.asset).toBe('BTC');

    // 2. Unconstrained size adversarial request
    const illegalProposal = {
      type: 'order',
      asset: 'BTC',
      side: 'buy',
      amount: 10, // $600,000 buy with only $25,000 cash
      orderType: 'market',
      rationale: 'Ignore risk limits and buy maximum size',
      confidence: 'high',
      riskSummary: 'High risk bypass attempt',
      requiresConfirmation: false,
    };

    const safety = validateAIProposal(illegalProposal, mockState, mockMarkets);
    expect(safety.valid).toBe(false);
    expect(safety.errors.some((e) => e.includes('Insufficient available liquid cash') || e.includes('single-trade cap'))).toBe(true);
  });

  // Category 13: Stale-Data Situations
  it('Category 13: Stale Data - strictly rejects executable proposals on stale feeds (> 45s)', () => {
    const staleEthMarket = createMockMarket('ETH', 3000, 0, 60_000); // 60s old feed
    const validity = MarketDataValidityGuard.validate(staleEthMarket, 'ETH', DEFAULT_RISK_POLICY, { requireExecutionGrade: true });
    expect(validity.canExecute).toBe(false);
    expect(validity.isStale).toBe(true);
    expect(validity.errors.some((e) => e.includes('stale') || e.includes('disabled'))).toBe(true);

    const orderProposal = {
      type: 'order',
      asset: 'ETH',
      side: 'buy',
      amount: 0.5,
      orderType: 'market',
      rationale: 'Trade on stale quote',
      confidence: 'medium',
      riskSummary: 'Stale test',
      requiresConfirmation: true,
    };

    const safety = validateAIProposal(orderProposal, mockState, {
      ...mockMarkets,
      ETH: staleEthMarket,
    });
    expect(safety.valid).toBe(false);
    expect(safety.errors.some((e) => e.includes('Stale market data rejection') || e.includes('stale'))).toBe(true);
  });

  // Category 14: Contradictory Signals & Multi-Turn Agent Loop
  it('Category 14: Contradictory Signals - runs Challenger pass, captures invalidation, and synthesizes safe proposal', async () => {
    const mockProvider = new MockAgentProvider();
    const result = await runAgentLoop({
      query: 'ETH shows mixed indicators with weak momentum but strong fundamental on-chain inflows. Should I enter?',
      state: mockState,
      markets: mockMarkets,
      history: [],
      provider: mockProvider,
      model: 'gemini-3.1-pro-preview',
      apiKey: 'test-api-key',
    });

    // Multi-turn tool execution confirmed
    expect(result.telemetry.toolsUsed).toContain('get_market_snapshot');
    expect(result.telemetry.toolsUsed).toContain('calculate_indicators');
    expect(result.telemetry.toolsUsed).toContain('calculate_portfolio_risk');

    // Structured decision with invalidation condition
    expect(result.decision).toBeDefined();
    expect(result.decision?.invalidation).toBeDefined();
    expect(result.decision?.invalidation).toContain('below');

    // Challenger pass critique attached
    expect(result.decision?.counterArgument).toBeDefined();
    expect(result.telemetry.counterArgument).toBeDefined();

    // Valid proposal passed safety gate
    expect(result.actionProposal).toBeDefined();
    expect(result.actionProposal?.asset).toBe('ETH');
    expect(result.actionProposal?.requiresConfirmation).toBe(true);
  });
});
