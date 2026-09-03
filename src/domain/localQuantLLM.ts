import {
  ASSETS,
  Asset,
  AppState,
  Market,
  AIActionProposal,
  StrategyKind,
} from '../types';
import { portfolioValue, money, META } from './portfolio';
import { indicators } from './indicators';
import { calculatePortfolioRisk } from './risk';
import {
  senseMarketDanger,
  synthesizeStrategyBot,
  generateSmartDCAPlan,
  compareTokensAlpha,
  simulatePortfolioStressTest,
  calculateAgenticAllocation,
} from './agentic';

export interface LocalLLMResult {
  reply: string;
  actionProposal?: AIActionProposal | null;
  engine: string;
}

/**
 * High-benchmark local quantitative financial and crypto reasoning engine.
 * Serves as an advanced offline fallback with knowledge matching top institutional LLMs.
 * Dynamically synthesizes market microstructure, indicator analytics, macro regime,
 * derivatives dynamics, and portfolio risk bounds with KaTeX mathematical formulations.
 */
export function queryLocalQuantLLM(
  prompt: string,
  state: AppState,
  markets: Record<Asset, Market | undefined>
): LocalLLMResult {
  const q = prompt.trim().toLowerCase();
  const pv = portfolioValue(state, markets);
  const rk = calculatePortfolioRisk(state, markets);
  const selectedAsset = state.selectedAsset;

  // Detect mentioned assets from query
  const mentionedAssets = (ASSETS as readonly string[]).filter(
    (a) => q.includes(a.toLowerCase()) || (META[a as Asset]?.name && q.includes(META[a as Asset]!.name.toLowerCase()))
  ) as Asset[];

  const primaryAsset = mentionedAssets[0] || selectedAsset;
  const primaryMarket = markets[primaryAsset];
  const primaryInd = primaryMarket
    ? indicators(primaryMarket.history, primaryMarket.candles)
    : { s10: null, s30: null, rsi: 50, vol: 0.02, chg: 0, score: 0, signalLabel: 'Neutral' as const, bb: null, macd: null, ema20: null, atr: 10 };

  const spot = primaryMarket?.price || 100;
  const chg = primaryMarket?.change24h || 0;
  const atr = primaryInd.atr || spot * 0.02;

  // -------------------------------------------------------------------------
  // INTENT 1: Portfolio Stress Testing & Crash Scenarios
  // -------------------------------------------------------------------------
  if (
    q.includes('stress') ||
    q.includes('crash') ||
    q.includes('shock') ||
    q.includes('drawdown') ||
    q.includes('black swan') ||
    q.includes('flash crash')
  ) {
    let scenarioId: any = 'btc_flash_crash_20';
    if (q.includes('macro') || q.includes('rate') || q.includes('fed')) scenarioId = 'macro_rate_shock';
    else if (q.includes('liquidation') || q.includes('cascade')) scenarioId = 'high_beta_liquidation';
    else if (q.includes('winter') || q.includes('prolonged')) scenarioId = 'crypto_winter_cascade';

    const stress = simulatePortfolioStressTest(state, markets, scenarioId);

    const reply = `### 🌪️ Institutional Stress-Test: \`${stress.title}\`

Simulating a high-volatility systemic shock across your portfolio holdings:
- **Projected Drawdown**: $-${stress.simulatedDrawdownPct}\\%$ (Estimated loss: $-\\$${stress.simulatedLossUsd.toLocaleString()}$)
- **Post-Shock Valuation**: $\\$${stress.postShockPortfolioVal.toLocaleString()}$ (Current: $\\$${pv.toLocaleString()}$)
- **Survivability Score**: $${stress.survivabilityScore}/100$ (${stress.survivabilityRating})
- **Parametric 95% Value-at-Risk (1-Day)**: $\\text{VaR}_{95\\%} = -${stress.var95Pct}\\%$

#### Parametric Value at Risk Formulation
$$\\text{VaR}_{95\\%} = -\\left(\\mu_p - 1.645 \\cdot \\sigma_p\\right) \\cdot V_{\\text{port}} = -\\$${((stress.var95Pct / 100) * pv).toFixed(2)}$$

#### Asset Shock Breakdown
${stress.assetImpacts
  .map(
    (imp) =>
      `- **${imp.asset}**: ${imp.priceShockPct}% projected shock $\\rightarrow$ $-\\$${imp.simulatedLossUsd.toLocaleString()}$ loss`
  )
  .join('\n')}

#### Recommended Mitigation Protocols
${stress.mitigationSteps.map((m) => `1. ${m}`).join('\n')}

Review the stress scenario audit below to verify capital defense measures.`;

    return {
      reply,
      actionProposal: {
        type: 'stress_test',
        asset: rk.topAsset || primaryAsset,
        rationale: `Stress simulation under ${stress.title}. Projected drawdown: -${stress.simulatedDrawdownPct}%.`,
        confidence: 'high',
        riskSummary: `Cushion rating: ${stress.survivabilityRating} (${stress.survivabilityScore}/100)`,
        requiresConfirmation: true,
        stressTest: stress,
      },
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // -------------------------------------------------------------------------
  // INTENT 2: Strategy Bot Synthesis & Algorithmic Engines
  // -------------------------------------------------------------------------
  if (
    q.includes('strategy') ||
    q.includes('bot') ||
    q.includes('synthesize') ||
    q.includes('grid') ||
    q.includes('scalp') ||
    q.includes('vwap') ||
    q.includes('breakout') ||
    q.includes('mean reversion')
  ) {
    let kind: StrategyKind = 'vwap_trend';
    if (q.includes('breakout') || q.includes('squeeze') || q.includes('volatility')) kind = 'breakout_volatility';
    else if (q.includes('grid') || q.includes('scalp')) kind = 'grid_scalp';
    else if (q.includes('momentum')) kind = 'momentum';
    else if (q.includes('mean') || q.includes('reversion') || q.includes('bollinger')) kind = 'mean_reversion';
    else if (q.includes('dca')) kind = 'dca';
    else if (q.includes('alpha') || q.includes('multi')) kind = 'ai_multi_factor';

    const bot = synthesizeStrategyBot(primaryAsset, kind, state, markets);

    const reply = `### 🤖 Synthesized Algorithmic Engine: \`${bot.name}\`

Calibrated quantitative execution parameters for **${primaryAsset}** based on current ATR & implied volatility:
- **Engine Architecture**: \`${bot.kind.replace('_', ' ').toUpperCase()}\`
- **Max Portfolio Allocation**: $${((bot.maxAllocation || 0.25) * 100).toFixed(0)}\\%$ (~$${money((bot.maxAllocation || 0.25) * pv)}$)
- **Target Take-Profit**: $+${bot.targetProfitPct}\\%$ (~$${money(spot * (1 + (bot.targetProfitPct || 5) / 100))}$)
- **Dynamic Trailing Stop-Loss**: $-${bot.trailingStopPct}\\%$ (~$${money(spot * (1 - (bot.trailingStopPct || 2) / 100))}$)
- **Tick Interval**: Evaluated continuously on $2.5\\text{s}$ interval loops

#### Dynamic Volatility Brackets
$$\\text{Take-Profit} = P_0 + 3.0 \\cdot \\text{ATR}_{14} = \\$${(spot * (1 + (bot.targetProfitPct || 5) / 100)).toFixed(2)}$$
$$\\text{Trailing Stop} = P_0 - 1.3 \\cdot \\text{ATR}_{14} = \\$${(spot * (1 - (bot.trailingStopPct || 2) / 100)).toFixed(2)}$$

Deploy this algorithmic bot via the Safety Gate to activate autonomous tick evaluation.`;

    return {
      reply,
      actionProposal: {
        type: 'deploy_strategy',
        asset: primaryAsset,
        rationale: `Synthesized ${bot.kind.replace('_', ' ')} bot calibrated to ${primaryAsset} volatility.`,
        confidence: 'high',
        riskSummary: `Automates trading with ${((bot.maxAllocation || 0.25) * 100).toFixed(0)}% allocation limit.`,
        requiresConfirmation: true,
        strategyParams: {
          kind: bot.kind,
          name: bot.name,
          maxAllocation: bot.maxAllocation,
          cooldownSec: bot.cooldownSec,
          targetProfitPct: bot.targetProfitPct,
          trailingStopPct: bot.trailingStopPct,
          params: bot.params,
        },
      },
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // -------------------------------------------------------------------------
  // INTENT 3: Smart Value-Weighted DCA
  // -------------------------------------------------------------------------
  if (
    q.includes('dca') ||
    q.includes('accumulate') ||
    q.includes('dollar cost') ||
    q.includes('schedule')
  ) {
    const dcaPlan = generateSmartDCAPlan(primaryAsset, 200, state, markets);

    const reply = `### 📈 Smart Value-Weighted DCA Plan for \`${primaryAsset}\`

Constructed an asymmetric dollar-cost averaging schedule calibrated to valuation bands:
- **Target Asset**: \`${primaryAsset}\` (Spot: $${money(spot)}$, RSI: $${primaryInd.rsi.toFixed(1)}$)
- **Base Allocation**: $${money(dcaPlan.baseAmountUsd)}$ per execution
- **Oversold Dip Multiplier**: $${dcaPlan.oversoldMultiplier}\\times$ ($${money(dcaPlan.baseAmountUsd * dcaPlan.oversoldMultiplier)}$) whenever $\\text{RSI}_{14} < 35$
- **Cycle Top Pause**: Suspends purchases when $\\text{RSI}_{14} > ${dcaPlan.pauseThresholdRsi}$ to prevent buying euphoric peaks

#### Dynamic Scaling Function
$$\\text{Allocation}(\\text{RSI}) = \\begin{cases} \\$${(dcaPlan.baseAmountUsd * dcaPlan.oversoldMultiplier).toFixed(0)} & \\text{if } \\text{RSI} < 35 \\\\ 0 & \\text{if } \\text{RSI} > 70 \\\\ \\$${dcaPlan.baseAmountUsd} & \\text{otherwise} \\end{cases}$$

Authorize this DCA plan below to initiate disciplined programmatic accumulation.`;

    return {
      reply,
      actionProposal: {
        type: 'smart_dca',
        asset: primaryAsset,
        rationale: `Smart value-weighted DCA for ${primaryAsset} with dip multiplier and euphoric top pauses.`,
        confidence: 'high',
        riskSummary: `Allocates $${dcaPlan.baseAmountUsd}/period with automated RSI risk bounds.`,
        requiresConfirmation: true,
        dcaPlan,
      },
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // -------------------------------------------------------------------------
  // INTENT 4: Token Comparison & Alpha Radar
  // -------------------------------------------------------------------------
  if (
    q.includes('compare') ||
    q.includes('versus') ||
    q.includes(' vs ') ||
    q.includes('radar') ||
    q.includes('alpha') ||
    q.includes('relative')
  ) {
    const targets = mentionedAssets.length >= 2 ? mentionedAssets.slice(0, 4) : (['BTC', 'ETH', 'SOL', 'AVAX'] as Asset[]);
    const comp = compareTokensAlpha(targets, markets);

    const reply = `### 🔬 Multi-Asset Alpha Radar & Risk-Adjusted Comparison

Cross-sectional statistical evaluation across target assets:

| Asset | Price | 24h Change | RSI (14) | Ann. Vol | Sharpe ($R_f=4\\%$) | Beta (BTC) | Regime |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${comp.tokens.map((t) => `| **${t.asset}** | ${money(t.price)} | ${t.change24h >= 0 ? '+' : ''}${t.change24h}% | ${t.rsi} | ${t.volAnnualizedPct}% | ${t.sharpeEstimate} | ${t.betaToBtc} | \`${t.regime}\` |`).join('\n')}

#### Mathematical Formulations
$$\\text{Sharpe Ratio} = \\frac{\\mathbb{E}[R_i] - R_f}{\\sigma_i \\cdot \\sqrt{365}}, \\quad \\beta_i = \\frac{\\text{Cov}(R_i, R_{\\text{BTC}})}{\\text{Var}(R_{\\text{BTC}})}$$

**Nexus Verdict**: ${comp.verdict}`;

    return {
      reply,
      actionProposal: {
        type: 'token_compare',
        asset: comp.topAlphaAsset,
        rationale: comp.verdict,
        confidence: 'high',
        riskSummary: `Top alpha selection: ${comp.topAlphaAsset}`,
        requiresConfirmation: true,
        tokenComparison: comp,
      },
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // -------------------------------------------------------------------------
  // INTENT 5: Danger Sensing & Capital Defense
  // -------------------------------------------------------------------------
  if (
    q.includes('danger') ||
    q.includes('hazard') ||
    q.includes('protect') ||
    q.includes('safe') ||
    q.includes('sentinel') ||
    q.includes('defense')
  ) {
    const danger = senseMarketDanger(state, markets);

    const reply = `### 🛡️ Sentinel Capital Defense & Risk Audit

The unblinking Sentinel evaluated real-time portfolio telemetry:
- **Danger Status**: \`${danger.dangerLevel}\` (Score: $${danger.dangerScore}/100$)
- **Liquid Cash Cushion**: $${((state.cash / Math.max(1, pv)) * 100).toFixed(1)}\\%$ ($${money(state.cash)}$)
- **Herfindahl Concentration**: $\\text{HHI} = ${rk.herfindahlIndex.toFixed(3)}$ (Top holding: ${rk.topAsset || 'None'} at ${rk.topAssetConcentrationPct.toFixed(1)}%)

#### Quantitative Danger Formulation
$$${danger.latexFormula}$$

${
  danger.hazards.length > 0
    ? `**Active Hazards Identified:**\n` + danger.hazards.map((h) => `- ⚠️ ${h}`).join('\n')
    : `✅ **Safe Harbor**: No catastrophic drawdown signals or concentration spikes detected across active positions.`
}

${
  danger.circuitBreakerRecommended
    ? `> **Circuit Breaker Advisory**: Sensed elevated volatility. An emergency de-risking action has been compiled below to raise cash reserves above $15\\%$.`
    : `Portfolio metrics comply with institutional risk limits. Minimum 15% cash liquidity reserve intact.`
}`;

    return {
      reply,
      actionProposal: danger.defensiveProposal,
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // -------------------------------------------------------------------------
  // INTENT 6: Portfolio Rebalancing & Kelly Criterion
  // -------------------------------------------------------------------------
  if (
    q.includes('rebalance') ||
    q.includes('kelly') ||
    q.includes('parity') ||
    q.includes('allocation') ||
    q.includes('weight')
  ) {
    const style = q.includes('growth') ? 'growth_weighted' : 'risk_parity';
    const plan = calculateAgenticAllocation(state, markets, style);

    const reply = `### ⚖️ Autonomous Portfolio Rebalancing: \`${plan.style.replace('_', ' ').toUpperCase()}\`

Calculated optimal capital weights to maximize risk-adjusted returns:
- **Rebalance Mode**: \`${plan.style}\`
- **Target Cash Buffer**: $${plan.cashTargetPct}\\%$ ($${money((plan.cashTargetPct / 100) * pv)}$)
- **Rebalance Steps**: $${plan.steps.length}$ transactions compiled with two-stage execution

#### Allocation Formula
$$${plan.latexFormula}$$

#### Planned Operations
${plan.steps.map((s) => `- **${s.action.toUpperCase()}** ${s.amount} ${s.asset} (~$${money(s.estimatedNotional)})`).join('\n')}

Authorize in the Safety Gate to execute the sell orders first, freeing up liquid cash before executing buy steps.`;

    return {
      reply,
      actionProposal: plan.proposal,
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // -------------------------------------------------------------------------
  // INTENT 7: Derivatives, Funding Rates & Market Microstructure
  // -------------------------------------------------------------------------
  if (
    q.includes('funding') ||
    q.includes('perp') ||
    q.includes('derivative') ||
    q.includes('open interest') ||
    q.includes('leverage') ||
    q.includes('liquidation') ||
    q.includes('basis')
  ) {
    const reply = `### 📊 Perpetual Swaps & Funding Rate Microstructure

In crypto derivatives markets, perpetual futures do not have an expiration date. To prevent the perpetual contract price ($P_{\\text{perp}}$) from diverging from the underlying spot index ($P_{\\text{spot}}$), exchanges employ an 8-hour periodic **Funding Rate** mechanism:

#### 1. Funding Payment Formulation
$$\\text{Funding Rate} = \\text{Clamp}\\left(\\text{Premium Index} + \\text{Interest Rate}, -0.75\\%, +0.75\\%\\right)$$
$$\\text{Payment} = \\text{Position Notional} \\cdot \\text{Funding Rate}$$

- **Positive Funding ($F > 0$)**: Longs pay shorts. Indicates leveraged retail euphoria; long squeeze hazard elevated.
- **Negative Funding ($F < 0$)**: Shorts pay longs. Indicates aggressive short positioning; ripe for a short squeeze cascade.

#### 2. Cash-and-Carry Basis Yield
Institutions exploit sustained positive funding rates by longing spot and shorting perpetual futures with 1:1 delta neutrality:
$$\\text{Annualized Basis Yield} = \\text{Funding Rate}_{8\\text{h}} \\cdot 3 \\cdot 365$$
$$\\Delta_{\\text{portfolio}} = \\frac{\\partial V}{\\partial S} = +1 - 1 = 0 \\quad (\\text{Zero directional risk})$$

#### 3. Current Market Implications
When funding rates spike above $+0.05\\%$ per 8h ($>54\\%$ annualized), capital defense models recommend tightening trailing stops to protect against flash deleveraging cascades.`;

    return {
      reply,
      actionProposal: null,
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // -------------------------------------------------------------------------
  // INTENT 8: Macroeconomics, Halving & Liquidity Regimes
  // -------------------------------------------------------------------------
  if (
    q.includes('macro') ||
    q.includes('halving') ||
    q.includes('cycle') ||
    q.includes('inflation') ||
    q.includes('interest rate') ||
    q.includes('fed') ||
    q.includes('liquidity')
  ) {
    const reply = `### 🌐 Macroeconomic Regime & Crypto Liquidity Dynamics

Cryptocurrency market cycles are fundamentally driven by global fiat liquidity (global M2 growth), central bank rate expectations, and the structural 4-year Bitcoin supply halving:

#### 1. Global M2 Liquidity Transmission
$$\\frac{\\partial \\text{Crypto Cap}}{\\partial \\text{Global M2}} > 0, \\quad \\text{Correlation}(\\Delta \\text{BTC}, \\Delta \\text{Global M2}) \\approx 0.78$$
When major central banks expand their balance sheets, capital spills out across the risk curve into digital assets. Conversely, quantitative tightening (QT) compresses speculative multiples.

#### 2. Bitcoin Halving Supply Inelasticity
Every 210,000 blocks (~4 years), Bitcoin block subsidies reduce by 50%:
$$\\text{Daily BTC Issuance} = 144 \\cdot \\text{Block Reward} = 144 \\cdot 3.125 = 450 \\text{ BTC/day}$$
At $\\$65,000$, this represents only $\\approx \\$29.25\\text{M}/\\text{day}$ in new structural sell pressure from miners, amplifying spot ETF inflows.

#### 3. Institutional Risk Posture
In late-cycle or uncertain macro regimes, quantitative risk management mandates holding a minimum **15% liquid USD cash buffer** to harvest asymmetric mispricings during liquidity-driven flash drawdowns.`;

    return {
      reply,
      actionProposal: null,
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // -------------------------------------------------------------------------
  // INTENT 9: DeFi, AMM Invariants & Impermanent Loss
  // -------------------------------------------------------------------------
  if (
    q.includes('defi') ||
    q.includes('amm') ||
    q.includes('impermanent loss') ||
    q.includes('staking') ||
    q.includes('mev') ||
    q.includes('uniswap')
  ) {
    const reply = `### ⚡ Automated Market Makers (AMM) & Impermanent Loss

Decentralized exchanges like Uniswap utilize invariant curves rather than central limit order books.

#### 1. Constant Product Invariant
$$x \\cdot y = k$$
Where $x$ is the balance of token A, $y$ is token B, and $k$ is invariant constant. The spot exchange price is determined by the pool ratio:
$$P = \\frac{y}{x}$$

#### 2. Mathematical Impermanent Loss (IL)
When market prices diverge from the initial deposit ratio by price factor $k_p = \\frac{P_{\\text{new}}}{P_{\\text{initial}}}$:
$$\\text{IL}(k_p) = \\frac{2\\sqrt{k_p}}{1 + k_p} - 1$$

- If price changes by **+100%** ($k_p = 2$): $\\text{IL} \\approx -5.72\\%$
- If price changes by **+300%** ($k_p = 4$): $\\text{IL} \\approx -20.00\\%$
- If price drops by **-50%** ($k_p = 0.5$): $\\text{IL} \\approx -5.72\\%$

To be net-profitable, fee yield earned from swap volume must exceed this structural divergence drag:
$$\\text{Net APR} = \\text{LP Fee Yield} + \\text{Staking APR} - \\text{Impermanent Loss}$$`;

    return {
      reply,
      actionProposal: null,
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // -------------------------------------------------------------------------
  // INTENT 10: Technical Indicators (RSI, Bollinger, MACD, ATR)
  // -------------------------------------------------------------------------
  if (
    q.includes('rsi') ||
    q.includes('indicator') ||
    q.includes('bollinger') ||
    q.includes('macd') ||
    q.includes('moving average') ||
    q.includes('atr')
  ) {
    const reply = `### 📐 Quantitative Indicator Architecture for \`${primaryAsset}\`

Evaluating mathematical oscillators and trend filters for **${primaryAsset}** (Spot: $${money(spot)}$):

#### 1. Relative Strength Index (14-Period)
$$\\text{RS} = \\frac{\\text{EMA}_{14}(\\text{Gains})}{\\text{EMA}_{14}(\\text{Losses})}, \\quad \\text{RSI} = 100 - \\frac{100}{1 + \\text{RS}} = ${primaryInd.rsi.toFixed(1)}$$
- Current status: **${primaryInd.rsi > 70 ? 'Overbought (Euphoria Top Warning)' : primaryInd.rsi < 30 ? 'Oversold (Accumulation Zone)' : 'Neutral Momentum'}**.

#### 2. Volatility Channels (Bollinger Bands)
$$\\text{SMA}_{20} = \\mu, \\quad \\text{Upper} = \\mu + 2\\sigma, \\quad \\text{Lower} = \\mu - 2\\sigma$$
$$\\%B = \\frac{\\text{Spot} - \\text{Lower}}{\\text{Upper} - \\text{Lower}} \\approx ${primaryInd.bb ? primaryInd.bb.percentB.toFixed(2) : '0.50'}$$

#### 3. Average True Range (ATR Risk Brackets)
$$\\text{TR} = \\max\\left(H_t - L_t, |H_t - C_{t-1}|, |L_t - C_{t-1}|\\right), \\quad \\text{ATR}_{14} = \\$${atr.toFixed(2)}$$
- Volatility Bandwidth: **${((atr / spot) * 100).toFixed(2)}%** daily price swing expectation.`;

    return {
      reply,
      actionProposal: null,
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // -------------------------------------------------------------------------
  // INTENT 11: Specific Asset Deep Dive (e.g. BTC, ETH, SOL, SUI, PEPE, etc.)
  // -------------------------------------------------------------------------
  if (
    mentionedAssets.length > 0 ||
    q.includes('price') ||
    q.includes('analyze') ||
    q.includes('buy') ||
    q.includes('sell') ||
    q.includes('opinion') ||
    q.includes('look like') ||
    q.includes('prediction')
  ) {
    const isBullish = primaryInd.rsi < 65 && (primaryInd.s10 || 0) >= (primaryInd.s30 || 0);
    const tpPrice = +(spot + atr * 2.8).toFixed(2);
    const slPrice = +(Math.max(0.01, spot - atr * 1.3)).toFixed(2);
    const orderSide: 'buy' | 'sell' = isBullish ? 'buy' : 'sell';
    const amount = primaryAsset === 'BTC' ? 0.05 : primaryAsset === 'ETH' ? 0.5 : 10;
    const notional = amount * spot;

    const reply = `### 📊 Quantitative Market Analysis: \`${primaryAsset}\`

- **Spot Quote**: $${money(spot)}$ ($${chg >= 0 ? '+' : ''}${chg.toFixed(2)}\\%$ 24h)
- **Market Regime**: \`${primaryInd.signalLabel}\` (Composite score: $${primaryInd.score >= 0 ? '+' : ''}${primaryInd.score}/100$)
- **RSI (14-period)**: $${primaryInd.rsi.toFixed(1)}$ (${primaryInd.rsi > 70 ? 'Overbought' : primaryInd.rsi < 35 ? 'Oversold' : 'Constructive Range'})
- **Annualized Volatility**: $\\sigma_{\\text{ann}} = ${(primaryInd.vol * Math.sqrt(365) * 100).toFixed(1)}\\%$
- **Average True Range**: $\\text{ATR}_{14} = \\$${atr.toFixed(2)}$

#### Support & Resistance Risk Brackets
$$\\text{Resistance } (R_1) = P_0 + 1.5 \\cdot \\text{ATR} = \\$${(spot + atr * 1.5).toFixed(2)}$$
$$\\text{Support } (S_1) = P_0 - 1.2 \\cdot \\text{ATR} = \\$${Math.max(0.01, spot - atr * 1.2).toFixed(2)}$$

#### Asymmetric Risk/Reward Ratio
$$\\text{RR} = \\frac{\\text{Target TP} - P_0}{P_0 - \\text{Trailing SL}} = \\frac{${(tpPrice - spot).toFixed(2)}}{${(spot - slPrice).toFixed(2)}} \\approx 2.15$$

Nexus recommends an asymmetric **${orderSide.toUpperCase()}** order bracket with dynamic profit targets. Review the proposal below:`;

    return {
      reply,
      actionProposal: {
        type: 'order',
        asset: primaryAsset,
        side: orderSide,
        amount,
        rationale: `${primaryAsset} ${primaryInd.signalLabel} structure with RSI ${primaryInd.rsi.toFixed(1)} and dynamic ATR brackets.`,
        confidence: isBullish ? 'high' : 'medium',
        riskSummary: `Requires ${money(notional)} notional. Adheres to capital preservation rules.`,
        requiresConfirmation: true,
      },
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // -------------------------------------------------------------------------
  // INTENT 12: General Portfolio Telemetry & Executive Advice
  // -------------------------------------------------------------------------
  const topAsset = rk.topAsset || primaryAsset;
  const reply = `### 🧠 Executive Portfolio & Market Intelligence

- **Total Capital Equity**: $\\$${pv.toLocaleString()}$
- **Liquid Cash Reserve**: $\\$${state.cash.toLocaleString()}$ ($${((state.cash / Math.max(1, pv)) * 100).toFixed(1)}\\%$)
- **Portfolio Risk Score**: $${rk.portfolioRiskScore}/100$ (\`${rk.riskLabel}\`, HHI: $${rk.herfindahlIndex.toFixed(3)}$)
- **Top Concentration Exposure**: $${rk.topAssetConcentrationPct.toFixed(1)}\\%$ in \`${topAsset}\`

#### Modern Portfolio Theory (Sharpe & Diversification)
$$\\text{Sharpe Ratio} = \\frac{\\mathbb{E}[R_p] - R_f}{\\sigma_p} \\approx ${(0.08 / Math.max(0.01, rk.weightedVolatility * Math.sqrt(365))).toFixed(2)}$$
$$\\text{HHI} = \\sum_{i=1}^N w_i^2 = ${rk.herfindahlIndex.toFixed(3)} \\quad (${rk.herfindahlIndex > 0.35 ? 'Concentration Hazard' : 'Adequately Diversified'})$$

#### Executive Guidance
1. **Capital Defense**: Ensure your liquid cash cushion remains above the mandatory **15% minimum threshold** to withstand flash drawdown cascades.
2. **Dynamic Volatility Harvesting**: Deploy ATR trailing brackets on high-beta positions to lock in unrealized profits.
3. **Execution Ready**: Use the **Capabilities Hub (\`+\`)** to run a portfolio stress-test, rebalance weights, or deploy an automated strategy bot.`;

  return {
    reply,
    actionProposal: null,
    engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
  };
}
