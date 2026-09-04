import { describe, it, expect } from 'vitest';
import { QUANT_TOOLS, ToolExecutionContext } from './quantTools';
import { AppState, Market, ASSETS } from '../types';
import { createPositionsRecord } from './portfolio';
import { DEFAULT_RISK_POLICY } from './riskPolicy';

const mockState: AppState = {
  schemaVersion: 2,
  cash: 25000,
  initialCash: 60000,
  startingEquity: 60000,
  realizedPnl: 1200,
  totalFees: 30,
  positions: createPositionsRecord({
    BTC: 0.4, // $24,000
    ETH: 2.0, // $6,000
  }),
  avgBuyPrice: createPositionsRecord({
    BTC: 58000,
    ETH: 2800,
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
    geminiModel: 'gemini-3.1-pro-preview',
    soundEnabled: true,
    enableWebSocket: true,
    theme: 'light',
    maxSlippageBps: 20,
  },
};

const createMockMarket = (asset: string, price: number, chg = 1.5): Market => ({
  asset: asset as any,
  symbol: `${asset}USDT`,
  name: asset,
  price,
  change24h: chg,
  high24h: price * 1.04,
  low24h: price * 0.96,
  volume24h: 120000000,
  history: Array.from({ length: 30 }, (_, i) => price * (1 + 0.02 * Math.sin(i * 0.4))),
  candles: Array.from({ length: 20 }, (_, i) => ({
    time: Date.now() - (20 - i) * 86400000,
    open: price * 0.99,
    high: price * 1.02,
    low: price * 0.98,
    close: price,
    volume: 10000,
  })),
  source: 'Binance REST',
  isSynthetic: false,
  lastUpdated: Date.now(),
});

const mockMarkets: Record<string, Market> = {
  BTC: createMockMarket('BTC', 60000, 2.0),
  ETH: createMockMarket('ETH', 3000, -1.0),
  SOL: createMockMarket('SOL', 150, 4.5),
  AVAX: createMockMarket('AVAX', 30, 0.5),
};

const ctx: ToolExecutionContext = {
  state: mockState,
  markets: mockMarkets as any,
  policy: DEFAULT_RISK_POLICY,
};

describe('Domain: Quantitative Tool Registry (26 Typed Tools)', () => {
  it('tool: get_market_snapshot returns real-time quote and quality score', async () => {
    const res = await QUANT_TOOLS.get_market_snapshot.execute({ asset: 'BTC' }, ctx);
    expect(res.success).toBe(true);
    expect(res.price).toBe(60000);
    expect(res.dataQualityScore).toBeGreaterThanOrEqual(80);
  });

  it('tool: get_market_history retrieves historical price series', async () => {
    const res = await QUANT_TOOLS.get_market_history.execute({ asset: 'BTC', timeframe: '1D' }, ctx);
    expect(res.success).toBe(true);
    expect(res.history.length).toBe(30);
    expect(res.currentClose).toBeDefined();
  });

  it('tool: calculate_indicators computes RSI, ATR, MACD, and Bollinger Bands', async () => {
    const res = await QUANT_TOOLS.calculate_indicators.execute({ asset: 'BTC' }, ctx);
    expect(res.success).toBe(true);
    expect(res.rsi).toBeDefined();
    expect(res.atr).toBeDefined();
    expect(res.bollingerBands).toBeDefined();
  });

  it('tool: analyze_market_regime diagnoses trend, choppiness, and strategy suitability', async () => {
    const res = await QUANT_TOOLS.analyze_market_regime.execute({ asset: 'BTC' }, ctx);
    expect(res.success).toBe(true);
    expect(res.regime).toBeDefined();
    expect(res.suitableStrategies.length).toBeGreaterThan(0);
  });

  it('tool: calculate_portfolio_risk evaluates composite risk score', async () => {
    const res = await QUANT_TOOLS.calculate_portfolio_risk.execute({}, ctx);
    expect(res.success).toBe(true);
    expect(res.portfolioRiskScore).toBeGreaterThan(0);
    expect(res.riskLabel).toBeDefined();
    expect(res.topAssetConcentrationPct).toBeGreaterThan(0);
  });

  it('tool: calculate_portfolio_exposure breaks down positions and cash buffer', async () => {
    const res = await QUANT_TOOLS.calculate_portfolio_exposure.execute({}, ctx);
    expect(res.success).toBe(true);
    expect(res.totalEquity).toBe(55000); // 25,000 cash + 24,000 BTC + 6,000 ETH
    expect(res.liquidCash).toBe(25000);
    expect(res.activeHoldings.BTC).toBeDefined();
  });

  it('tool: calculate_concentration computes Herfindahl-Hirschman index', async () => {
    const res = await QUANT_TOOLS.calculate_concentration.execute({}, ctx);
    expect(res.success).toBe(true);
    expect(res.herfindahlIndex).toBeDefined();
    expect(res.status).toBeDefined();
  });

  it('tool: calculate_correlation_matrix computes pairwise correlation', async () => {
    const res = await QUANT_TOOLS.calculate_correlation_matrix.execute({ assets: 'BTC,ETH,SOL' }, ctx);
    expect(res.success).toBe(true);
    expect(res.correlationMatrix.BTC.BTC).toBe(1.0);
    expect(res.correlationMatrix.BTC.ETH).toBeDefined();
  });

  it('tool: calculate_beta calculates market sensitivity against BTC', async () => {
    const res = await QUANT_TOOLS.calculate_beta.execute({ asset: 'SOL', benchmark: 'BTC' }, ctx);
    expect(res.success).toBe(true);
    expect(res.beta).toBeDefined();
    expect(res.interpretation).toBeDefined();
  });

  it('tool: calculate_volatility returns daily and annualized volatility', async () => {
    const res = await QUANT_TOOLS.calculate_volatility.execute({ asset: 'BTC' }, ctx);
    expect(res.success).toBe(true);
    expect(res.dailyVolatilityPct).toBeGreaterThan(0);
    expect(res.annualizedVolatilityPct).toBeGreaterThan(0);
  });

  it('tool: calculate_var computes 95% and 99% portfolio Value at Risk', async () => {
    const res = await QUANT_TOOLS.calculate_var.execute({ confidenceLevel: '95' }, ctx);
    expect(res.success).toBe(true);
    expect(res.varPct).toBeGreaterThan(0);
    expect(res.varUsd).toBeGreaterThan(0);
  });

  it('tool: calculate_expected_shortfall computes CVaR tail loss', async () => {
    const res = await QUANT_TOOLS.calculate_expected_shortfall.execute({ confidenceLevel: '95' }, ctx);
    expect(res.success).toBe(true);
    expect(res.expectedShortfallPct).toBeGreaterThan(0);
    expect(res.expectedShortfallUsd).toBeGreaterThan(0);
  });

  it('tool: stress_test_portfolio simulates market shock scenarios', async () => {
    const res = await QUANT_TOOLS.stress_test_portfolio.execute({ scenarioId: 'btc_flash_crash_20' }, ctx);
    expect(res.success).toBe(true);
    expect(res.stressTest.simulatedLossUsd).toBeGreaterThan(0);
    expect(res.stressTest.survivabilityRating).toBeDefined();
  });

  it('tool: compare_assets compares cross-asset alpha, Sharpe, and momentum', async () => {
    const res = await QUANT_TOOLS.compare_assets.execute({ assets: 'BTC,ETH,SOL' }, ctx);
    expect(res.success).toBe(true);
    expect(res.comparison.tokens.length).toBe(3);
    expect(res.comparison.topAlphaAsset).toBeDefined();
  });

  it('tool: calculate_position_size derives risk-budgeted order quantity', async () => {
    const res = await QUANT_TOOLS.calculate_position_size.execute(
      { asset: 'SOL', side: 'buy', entryPrice: 150, stopPrice: 140, targetPrice: 175 },
      ctx
    );
    expect(res.success).toBe(true);
    expect(res.quantity).toBeGreaterThan(0);
    expect(res.riskRewardRatio).toBe(2.5);
    expect(res.notional).toBeGreaterThan(0);
  });

  it('tool: calculate_trade_risk calculates notional and stop distance', async () => {
    const res = await QUANT_TOOLS.calculate_trade_risk.execute(
      { asset: 'SOL', side: 'buy', amount: 10, stopPrice: 140 },
      ctx
    );
    expect(res.success).toBe(true);
    expect(res.notional).toBe(1500); // 10 * 150
    expect(res.maxLossUsd).toBe(100); // 10 * (150 - 140)
  });

  it('tool: calculate_risk_reward computes ratio and expected value', async () => {
    const res = await QUANT_TOOLS.calculate_risk_reward.execute(
      { entryPrice: 100, stopPrice: 95, targetPrice: 112 },
      ctx
    );
    expect(res.success).toBe(true);
    expect(res.riskRewardRatio).toBe(2.4); // 12 / 5 = 2.4
    expect(res.verdict).toContain('Favorable Asymmetric');
  });

  it('tool: generate_rebalance_plan creates asset weight adjustments', async () => {
    const res = await QUANT_TOOLS.generate_rebalance_plan.execute({ style: 'risk_parity' }, ctx);
    expect(res.success).toBe(true);
    expect(res.rebalancePlan.steps).toBeDefined();
  });

  it('tool: generate_dca_plan creates Smart DCA plan with RSI multipliers', async () => {
    const res = await QUANT_TOOLS.generate_dca_plan.execute({ asset: 'BTC', baseAmountUsd: 300 }, ctx);
    expect(res.success).toBe(true);
    expect(res.dcaPlan.baseAmountUsd).toBe(300);
    expect(res.dcaPlan.oversoldMultiplier).toBeGreaterThan(1.0);
  });

  it('tool: generate_strategy synthesizes calibrated bot config', async () => {
    const res = await QUANT_TOOLS.generate_strategy.execute({ asset: 'SOL', kind: 'vwap_trend' }, ctx);
    expect(res.success).toBe(true);
    expect(res.strategyConfig.kind).toBe('vwap_trend');
    expect(res.strategyConfig.asset).toBe('SOL');
  });

  it('tool: analyze_funding calculates 8h funding rate and annualized basis yield', async () => {
    const res = await QUANT_TOOLS.analyze_funding.execute({ asset: 'BTC' }, ctx);
    expect(res.success).toBe(true);
    expect(res.estimatedFundingRate8hPct).toBeDefined();
    expect(res.annualizedBasisYieldPct).toBeDefined();
  });

  it('tool: analyze_options calculates implied volatility and put-call skew proxy', async () => {
    const res = await QUANT_TOOLS.analyze_options.execute({ asset: 'BTC' }, ctx);
    expect(res.success).toBe(true);
    expect(res.impliedVolatilityProxyPct).toBeGreaterThan(0);
    expect(res.putCallSkewProxyPct).toBeDefined();
  });

  it('tool: analyze_liquidity calculates slippage tiers and volume', async () => {
    const res = await QUANT_TOOLS.analyze_liquidity.execute({ asset: 'BTC' }, ctx);
    expect(res.success).toBe(true);
    expect(res.volume24hUsd).toBe(120000000);
    expect(res.estimatedSlippage.order1kUsd).toBeDefined();
  });

  it('tool: analyze_macro_regime returns macro state and catalysts', async () => {
    const res = await QUANT_TOOLS.analyze_macro_regime.execute({}, ctx);
    expect(res.success).toBe(true);
    expect(res.macroRegime).toBeDefined();
    expect(res.catalysts.length).toBeGreaterThan(0);
  });

  it('tool: validate_trade_proposal runs proposal through safety gate', async () => {
    const prop = {
      type: 'order',
      asset: 'SOL',
      side: 'buy',
      amount: 2,
      rationale: 'Breakout purchase',
      confidence: 'high',
      riskSummary: 'Low exposure',
      requiresConfirmation: true,
    };
    const res = await QUANT_TOOLS.validate_trade_proposal.execute({ proposal: JSON.stringify(prop) }, ctx);
    expect(res.success).toBe(true);
    expect(res.validation.valid).toBe(true);
  });

  it('tool: check_execution_constraints validates liquidity, cash floor, and asset cap', async () => {
    const res = await QUANT_TOOLS.check_execution_constraints.execute({ asset: 'SOL' }, ctx);
    expect(res.success).toBe(true);
    expect(res.constraints.canExecuteOrders).toBe(true);
    expect(res.constraints.cashReserveOk).toBe(true);
  });
});
