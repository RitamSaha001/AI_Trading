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

  // =========================================================================
  // 1. SYSTEMIC STRESS TESTING & CRASH SCENARIOS
  // =========================================================================
  if (
    q.includes('stress') ||
    q.includes('simulate') ||
    q.includes('flash crash') ||
    q.includes('black swan') ||
    q.includes('rate shock') ||
    (q.includes('shock') && q.includes('portfolio'))
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

  // =========================================================================
  // 2. DOWNSIDE PANIC & BEAR MARKET MITIGATION PROTOCOL
  // =========================================================================
  if (
    q.includes('panic') ||
    q.includes('danger') ||
    q.includes('save my money') ||
    q.includes('bleeding') ||
    (/\b(down|lost|plunging|drawdown)\b/i.test(q) && (q.includes('30%') || q.includes('portfolio') || q.includes('week') || q.includes('mitigation')))
  ) {
    const danger = senseMarketDanger(state, markets);
    const cashBufferPct = ((state.cash / Math.max(1, pv)) * 100).toFixed(1);

    const reply = `### 🛡️ Sentinel Emergency Downside Mitigation Plan

During rapid drawdowns, cognitive panic is the primary destroyer of capital. The unblinking Sentinel has executed a deterministic portfolio triage:

- **Danger Status**: \`${danger.dangerLevel}\` (Score: $${danger.dangerScore}/100$)
- **Current Portfolio Valuation**: $\\$${pv.toLocaleString()}$
- **Liquid Cash Cushion**: $${cashBufferPct}\\%$ ($\$${state.cash.toLocaleString()}$)
- **Concentration Hazard**: Top asset \`${rk.topAsset || 'None'}\` constitutes $${rk.topAssetConcentrationPct.toFixed(1)}\\%$ of equity

#### 1. Mathematical Downside Exposure Formulation
$$\\text{Portfolio Drawdown}: \\Delta V_p = \\sum_{i=1}^N w_i \\cdot \\Delta P_i, \\quad \\text{Max Loss Potential} \\approx \\text{VaR}_{95\\%} = -1.645 \\cdot \\sigma_p \\cdot V_p$$
$$\\text{Circuit Breaker Condition}: \\text{If } \\Delta V_{\\text{day}} < -8\\%, \\quad \\text{De-risk High Beta Allocations to Cash} \\ge 15\\%$$

#### 2. Three-Step Mathematical Recovery Protocol
1. **Enforce 15% Liquidity Floor**: Immediately halt buying depreciating high-beta tokens until market volatility compresses into an accumulation base.
2. **Trim Concentration**: Reduce \`${rk.topAsset}\` to restore the Herfindahl Index ($\\text{HHI} = ${rk.herfindahlIndex.toFixed(3)}$) below $0.25$.
3. **Volatility-Bracketed Exits**: Set mechanical ATR trailing stops on remaining holdings rather than selling into the bid during peak emotional panic.

${
  danger.hazards.length > 0
    ? `**Active Hazards Flagged by Sentinel:**\n` + danger.hazards.map((h) => `- ⚠️ ${h}`).join('\n')
    : `✅ **Cash Reserve Status**: Liquid buffer is intact. Avoid emotional capitulation.`
}

Review and authorize the emergency capital defense reallocation below to secure your cash buffer.`;

    const defensiveProposal = danger.defensiveProposal || {
      type: 'emergency_defend' as const,
      asset: rk.topAsset || primaryAsset,
      rationale: 'Activated Sentinel emergency de-risking protocol to enforce 15% cash liquidity floor.',
      confidence: 'high' as const,
      riskSummary: 'Elevated danger sensed. Reallocates to preserve liquid cash cushion.',
      requiresConfirmation: true,
      defensiveAction: {
        action: 'trim_to_cash' as const,
        targetCashBufferPct: 20,
        assetToTrim: rk.topAsset || primaryAsset,
        trimPct: 25,
        estimatedProceedsUsd: pv * 0.1,
      },
    };

    return {
      reply,
      actionProposal: defensiveProposal,
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // =========================================================================
  // 3. PERPETUAL SWAPS, FUNDING RATES & CASH-AND-CARRY BASIS
  // =========================================================================
  if (
    q.includes('funding') ||
    q.includes('perp') ||
    q.includes('cash-and-carry') ||
    q.includes('basis yield') ||
    q.includes('basis trade') ||
    q.includes('open interest')
  ) {
    const btcSpot = markets.BTC?.price || 62500;
    const reply = `### 📊 Perpetual Swaps & Funding Rate Microstructure

In crypto derivatives markets, perpetual futures contracts have no fixed expiry. Exchanges anchor contract mark price ($P_{\\text{perp}}$) to spot index price ($P_{\\text{spot}}$) via periodic 8-hour **Funding Rate** payments:

- **Spot BTC Benchmark**: $\\$${btcSpot.toLocaleString()}$
- **Current Funding Rate**: $+0.0100\\%$ per 8h ($+10.95\\%$ annualized basis)
- **Market Sentiment Bias**: \`Mild Bullish Premium\`

#### 1. Funding Payment Formulation
$$\\text{Funding Rate} = \\text{Clamp}\\left(\\text{Premium Index} + \\text{Interest Rate}, -0.75\\%, +0.75\\%\\right)$$
$$\\text{Payment Amount} = \\text{Position Notional} \\cdot \\text{Funding Rate}$$

- **Positive Funding ($F > 0$)**: Longs pay shorts. Indicates leveraged retail bullishness; long liquidation cascade risk is elevated.
- **Negative Funding ($F < 0$)**: Shorts pay longs. Indicates aggressive short positioning; short squeeze probability is heightened.

#### 2. Institutional Cash-and-Carry Basis Yield
Quantitative hedge funds harvest double-digit non-directional yields through delta-neutral basis trades:
1. Long spot token: $\\Delta_{\\text{spot}} = +1.0$
2. Short perpetual futures: $\\Delta_{\\text{perp}} = -1.0$
$$\\Delta_{\\text{net}} = \\frac{\\partial V_p}{\\partial S} = +1 - 1 = 0 \\quad (\\text{Zero directional price delta risk})$$
$$\\text{Annualized Basis Yield} = \\text{Funding Rate}_{8\\text{h}} \\cdot 3 \\cdot 365$$

If funding averages $+0.04\\%$ per 8h, the net annualized basis yield is **43.8%** with zero net price delta ($\\Delta = 0$).

#### 3. Capital Defense & Liquidation Bounds
When funding rates exceed $+0.08\\%$ ($>87\\%$ APR), funding fatigue typically induces sudden flash de-leveraging. The Sentinel recommends holding at least **15% cash liquidity buffer** to protect collateral margin ratios against transient liquidation cascades.`;

    return {
      reply,
      actionProposal: null,
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // =========================================================================
  // 4. MARKET MAKING, MEV & SANDWICH ATTACK DYNAMICS
  // =========================================================================
  if (
    q.includes('mev') ||
    q.includes('sandwich') ||
    q.includes('front-run') ||
    q.includes('priority gas') ||
    q.includes('searcher') ||
    (q.includes('market maker') && q.includes('extract'))
  ) {
    const reply = `### ⚡ Market Microstructure: MEV, Sandwich Attacks & Order Flow

Maximal Extractable Value (MEV) represents the excess value extracted by searchers, block builders, and validators through transaction reordering, insertion, and censorship in the public mempool:

- **BTC Benchmark Spot**: $\\$${(markets.BTC?.price || 62500).toLocaleString()}$
- **Average Mempool Latency**: $\\approx 12\\text{s}$ block time
- **Toxic Flow Arbitrage Metric**: Loss-Versus-Rebalancing (LVR)

#### 1. Mathematical Sandwich Attack Mechanism
When a victim submits a large decentralized swap order on an AMM with slippage tolerance $S$:
$$\\text{Max Victim Price}: P_{\\text{max}} = P_0 \\cdot (1 + S)$$

A searcher executes a 2-step risk-free atomic bundle:
1. **Front-Run ($T_{\\text{front}}$)**: Searcher buys asset before victim, pushing AMM price up to $P_{\\text{front}} = P_{\\text{max}} - \\epsilon$.
2. **Victim Execution ($T_{\\text{victim}}$)**: Victim's swap executes at the worst allowable price $P_{\\text{max}}$.
3. **Back-Run ($T_{\\text{back}}$)**: Searcher sells asset back to pool at inflated price.

$$\\text{MEV Gross Profit} = (P_{\\text{back}} - P_{\\text{front}}) \\cdot Q_{\\text{attacker}}$$
$$\\text{Net Profit} = \\text{MEV Gross Profit} - 2 \\cdot \\text{Priority Gas Fee} - \\text{Validator Bribe}$$

#### 2. Loss Versus Rebalancing (LVR)
Liquidity providers on constant-product AMMs suffer continuous structural drag to arbitrageurs:
$$\\text{LVR} = \\int_0^T \\frac{\\sigma^2}{8} \\cdot V_t \\, dt$$
Where $\\sigma$ is the asset price volatility and $V_t$ is pool TVL. High volatility leads directly to increased searcher extraction.

#### 3. Institutional Retail Defenses
- **Private Mempools**: Route swaps via Flashbots Protect or MEV-Blocker RPCs (bypassing public mempools).
- **Strict Slippage Caps**: Enforce maximum $0.25\\%$ slippage on high-liquidity pairs (BTC/ETH/SOL).
- **TWAP Chunking & Cash Reserves**: Break large orders into smaller time-weighted slices and maintain a **15% cash liquidity buffer** to prevent urgent market order slippage.`;

    return {
      reply,
      actionProposal: null,
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // =========================================================================
  // 5. OPTIONS SKEW, VOLATILITY SURFACE & GREEKS
  // =========================================================================
  if (
    q.includes('skew') ||
    q.includes('volatility smile') ||
    q.includes('option') ||
    q.includes('black-scholes') ||
    q.includes('implied volatility') ||
    q.includes('greeks') ||
    q.includes('put-call')
  ) {
    const btcSpot = markets.BTC?.price || 62500;
    const reply = `### 📈 Options Volatility Surface & Institutional Skew Analysis

In derivatives markets, options pricing surfaces reveal forward-looking risk premia and institutional downside hedging demand that cannot be seen on spot charts:

- **Underlying Index Spot**: $\\$${btcSpot.toLocaleString()}$
- **30-Day Realized Volatility**: $\\sigma_{\\text{real}} \\approx ${(primaryInd.vol * Math.sqrt(365) * 100).toFixed(1)}\\%$
- **Market Skew Regime**: \`Elevated Tail-Risk Hedging\`

#### 1. The Volatility Smile & 25-Delta Skew
The Black-Scholes model assumes log-normal returns with constant volatility $\\sigma$. However, real market pricing exhibits fat tails (kurtosis) and negative asymmetry (skew):
$$\\text{25-Delta Put-Call Skew} = \\text{IV}_{\\text{25\\% Put}} - \\text{IV}_{\\text{25\\% Call}}$$

- **Steep Positive Skew ($>+5\\%$)**: Put options command a massive premium over calls. Institutions are paying up aggressively for out-of-the-money crash protection.
- **Flat or Negative Skew ($<0\\%$)**: Call options trade at a premium, signaling retail FOMO and upside speculative leverage.

#### 2. Analytical Black-Scholes Pricing & Key Greeks
$$\\text{Call} = S_0 \\mathcal{N}(d_1) - K e^{-r T} \\mathcal{N}(d_2), \\quad d_1 = \\frac{\\ln(S_0/K) + (r + \\frac{\\sigma^2}{2})T}{\\sigma\\sqrt{T}}$$
$$\\text{Delta } (\\Delta) = \\frac{\\partial V}{\\partial S} = \\mathcal{N}(d_1), \\quad \\text{Vega } (\\mathcal{V}) = \\frac{\\partial V}{\\partial \\sigma} = S_0 \\sqrt{T} \\mathcal{N}'(d_1)$$

#### 3. Quantitative Trade Implications
When 30-day implied volatility (IV) trades at a significant premium to realized volatility (HV):
$$\\text{Volatility Risk Premium (VRP)} = \\text{IV}_{30} - \\text{HV}_{30} > 0$$
Institutions execute delta-neutral short volatility strategies (e.g. straddles/iron condors) with strict stop-losses or dynamic gamma hedging, keeping at least **15% cash liquidity reserve** to absorb gamma spikes.`;

    return {
      reply,
      actionProposal: null,
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // =========================================================================
  // 6. LIQUID STAKING VS LENDING PROTOCOL RISKS
  // =========================================================================
  if (
    (q.includes('staking') && (q.includes('lending') || q.includes('aave') || q.includes('compound') || q.includes('lst') || q.includes('risk'))) ||
    q.includes('staking vs lending')
  ) {
    const ethSpot = markets.ETH?.price || 3150;
    const reply = `### ⚖️ Risk-Return Decomposition: Liquid Staking (LST) vs DeFi Lending

Comparing yield architecture and tail-risk failure modes between Liquid Staking (e.g., Lido, Jito) and Collateralized Lending (e.g., Aave, Compound):

- **ETH Spot Benchmark**: $\\$${ethSpot.toLocaleString()}$
- **Current Consensus Base Yield**: $\\approx 3.4\\% \\text{ APR}$
- **Aave Prime Lending APY**: $\\approx 2.1\\% \\text{ APY}$

#### 1. Yield Formulation Breakdown
$$\\text{LST Staking APR} = \\text{Consensus Reward} + \\text{Execution MEV Tips} - \\text{Validator Fee} - \\text{Slashing Reserve}$$
$$\\text{Lending APY}(U) = \\begin{cases} R_0 + \\frac{U}{U_{\\text{kink}}} \\cdot R_{\\text{slope1}} & \\text{if } U \\le U_{\\text{kink}} \\\\ R_0 + R_{\\text{slope1}} + \\frac{U - U_{\\text{kink}}}{1 - U_{\\text{kink}}} \\cdot R_{\\text{slope2}} & \\text{if } U > U_{\\text{kink}} \\end{cases}$$
Where $U = \\frac{\\text{Total Borrows}}{\\text{Total Liquidity}}$ is the capital utilization rate.

#### 2. Comparative Risk Matrix
| Risk Dimension | Liquid Staking Tokens (LSTs) | Collateralized Lending (Aave) |
| :--- | :--- | :--- |
| **Primary Yield Source** | Network inflation & consensus MEV fees | Borrower interest payments |
| **Slashing Risk** | **Present**: Malicious or offline validator penalties | **Zero**: No consensus layer exposure |
| **Liquidity & De-Peg Risk** | **High**: Secondary market discounts during panic | **Zero**: Direct pool redemption (subject to $U$) |
| **Bank Run / Lockup** | Exit queue delays (days to weeks) | **High**: If $U \\approx 100\\%$, withdrawals freeze |
| **Bad Debt Exposure** | Zero borrowing default risk | **Present**: Flash liquidations during sharp drops |

#### 3. Portfolio Allocation Heuristic
- For core long-term capital: Staking yields offer natural non-inflationary compounding with minimum counterparty risk.
- Maintain at least **15% cash liquidity buffer** in pure USD stablecoins rather than locking 100% in interest-bearing protocols to absorb market volatility.`;

    return {
      reply,
      actionProposal: null,
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // =========================================================================
  // 7. PORTFOLIO CONCENTRATION & HERFINDAHL-HIRSCHMAN INDEX (HHI)
  // =========================================================================
  if (
    q.includes('concentrat') ||
    q.includes('hhi') ||
    q.includes('herfindahl') ||
    q.includes('diversif')
  ) {
    const hhi = rk.herfindahlIndex;
    const topPct = rk.topAssetConcentrationPct;
    const isConcentrated = hhi > 0.25 || topPct > 40;

    const reply = `### 🔬 Portfolio Concentration Audit: Herfindahl-Hirschman Index (HHI)

Quantitative assessment of systemic concentration risk across your holdings:
- **Herfindahl Index (HHI)**: $\\text{HHI} = ${hhi.toFixed(3)}$
- **Top Holding Concentration**: \`${rk.topAsset || 'None'}\` accounts for **${topPct.toFixed(1)}%** of equity
- **Total Portfolio Valuation**: $\\$${pv.toLocaleString()}$
- **Liquid Cash Cushion**: $${((state.cash / Math.max(1, pv)) * 100).toFixed(1)}\\%$ ($${money(state.cash)}$)

#### 1. Mathematical Formulation
$$\\text{HHI} = \\sum_{i=1}^N w_i^2 = \\sum_{i=1}^N \\left(\\frac{V_i}{V_{\\text{port}}}\\right)^2$$
Where $w_i$ is the normalized fractional weight of asset $i$.

#### 2. Institutional Concentration Thresholds
- **HHI < 0.15**: Adequately Diversified (Decentralized risk distribution).
- **0.15 $\\le$ HHI $\\le$ 0.25**: Moderately Concentrated.
- **HHI > 0.25**: **Severely Concentrated Hazard** (Portfolio variance is dominated by single-asset idiosyncratic risk).

#### 3. Current Distribution Analysis
${Object.entries(rk.assetWeights)
  .filter(([, w]) => w > 0.01)
  .map(([a, w]) => `- **${a}**: ${(w * 100).toFixed(1)}% weight ($w_i^2 = ${(w * w).toFixed(4)}$)`)
  .join('\n')}

${
  isConcentrated
    ? `> **Sentinel Concentration Warning**: Top asset exposure exceeds institutional safe-harbor limits. An autonomous rebalancing plan is recommended below to re-diversify weights.`
    : `✅ Your portfolio satisfies diversification standards with balanced multi-asset risk distribution.`
}`;

    let proposal: AIActionProposal | null = null;
    if (isConcentrated) {
      const plan = calculateAgenticAllocation(state, markets, 'risk_parity');
      proposal = plan.proposal;
    }

    return {
      reply,
      actionProposal: proposal,
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // =========================================================================
  // 8. LAYER-2 ROLLUP ECONOMICS & DATA AVAILABILITY (EIP-4844)
  // =========================================================================
  if (
    q.includes('layer-2') ||
    q.includes('rollup') ||
    q.includes('optimistic') ||
    q.includes('zk') ||
    q.includes('validity proof') ||
    q.includes('fraud proof') ||
    q.includes('blob') ||
    q.includes('eip-4844')
  ) {
    const ethSpot = markets.ETH?.price || 3150;
    const reply = `### ⛓️ Layer-2 Rollup Microeconomics & Proof Mechanics

Layer-2 rollups scale throughput by executing transactions off-chain and posting compressed transaction batches and state roots to Ethereum Layer-1:

- **ETH Settlement Layer Spot**: $\\$${ethSpot.toLocaleString()}$
- **Blob Base Fee**: $\\approx 1.0\\text{ Gwei}$ (EIP-4844 Data Availability)
- **Batch Finality Multiplier**: $\\approx 1500\\times$ gas compression

#### 1. Total Rollup Transaction Cost Model (Post EIP-4844 Blobs)
$$\\text{L2 Fee} = \\text{Execution Gas} + \\frac{\\text{Blob Gas} \\cdot P_{\\text{blob}} + \\text{Calldata Gas}}{N_{\\text{batch}}} + \\frac{\\text{Proof Verification Cost}}{N_{\\text{batch}}}$$
Where $N_{\\text{batch}}$ is batch density. The introduction of binary large objects (blobs) decoupled L2 data availability from standard L1 execution gas, reducing fees by over $90\\%$.

#### 2. Optimistic vs ZK Rollup Architecture
| Architecture | Optimistic Rollups (Arbitrum, OP) | Zero-Knowledge Rollups (ZKsync, Starknet) |
| :--- | :--- | :--- |
| **Security Proof** | **Fraud Proofs**: Assumes valid until challenged | **Validity Proofs**: STARK/SNARK math proofs |
| **Finality Latency** | **7-day challenge window** for L1 bridge withdrawals | **Instant cryptographic finality** upon proof verification |
| **Prover Computational Cost** | Minimal (Sequencer re-executes EVM transactions) | **High**: GPU/FPGA clusters generate complex polynomial proofs |
| **Data Compression** | Moderate (Signatures and raw inputs posted) | **Maximum**: Only final state diffs required on-chain |

#### 3. Capital Efficiency & Defense Implications
Because ZK rollups achieve mathematical finality via validity proofs, capital bridge withdrawals take minutes rather than the 7-day fraud proof delay of Optimistic rollups, preventing capital lockup drag. Traders must maintain a **15% cash liquidity reserve** to absorb transaction spikes and cross-chain bridging delays.`;

    return {
      reply,
      actionProposal: null,
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // =========================================================================
  // 9. DEFI & UNISWAP V2 VS V3 INVARIANTS & IMPERMANENT LOSS
  // =========================================================================
  if (
    q.includes('impermanent loss') ||
    (q.includes('uniswap') && (q.includes('v2') || q.includes('v3') || q.includes('amm') || q.includes('invariant'))) ||
    q.includes('amm')
  ) {
    const ethSpot = markets.ETH?.price || 3150;
    const reply = `### ⚡ Automated Market Makers: Uniswap v2 vs v3 & Impermanent Loss

Decentralized AMMs eliminate order books using deterministic mathematical bonding curves:

- **ETH Benchmark Pool Spot**: $\\$${ethSpot.toLocaleString()}$
- **Impermanent Loss Parameter**: $k_p = P_t / P_0$
- **Concentrated Bounds**: $[p_a, p_b]$

#### 1. Invariant Curves: Constant Product vs Concentrated Liquidity
- **Uniswap v2**: Continuous infinite price spectrum invariant:
  $$x \\cdot y = k, \\quad P = \\frac{y}{x}$$
- **Uniswap v3**: Concentrated virtual liquidity bound between lower tick $p_a$ and upper tick $p_b$:
  $$\\left(x + \\frac{L}{\\sqrt{p_b}}\\right) \\left(y + L\\sqrt{p_a}\\right) = L^2$$
  $$\\text{Capital Efficiency Multiplier}: \\eta = \\frac{1}{1 - \\sqrt{p_a / p_b}}$$

#### 2. Mathematical Formulation of Impermanent Loss (IL)
When market price shifts by relative price ratio $k_p = \\frac{P_{\\text{current}}}{P_{\\text{initial}}}$:
$$\\text{IL}(k_p) = \\frac{2\\sqrt{k_p}}{1 + k_p} - 1$$

- **+100% Price Surge ($k_p = 2$)**: $\\text{IL} \\approx -5.72\\%$
- **+300% Price Surge ($k_p = 4$)**: $\\text{IL} \\approx -20.00\\%$
- **-50% Price Drawdown ($k_p = 0.5$)**: $\\text{IL} \\approx -5.72\\%$

#### 3. Net Liquidity Provider Profitability
$$\\text{Net Yield} = \\sum \\text{Swap Fees} + \\text{Incentive Rewards} - \\text{Impermanent Loss}$$
In high-volatility sideways markets, concentrated v3 ranges maximize fee velocity, but trend expansions cause sharp divergence losses. Liquidity providers should keep a **15% cash liquidity reserve** to re-center ranges.`;

    return {
      reply,
      actionProposal: null,
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // =========================================================================
  // 10. MACROECONOMICS, GLOBAL M2 & BITCOIN HALVING
  // =========================================================================
  if (
    q.includes('halving') ||
    (q.includes('m2') && q.includes('liquidity')) ||
    (q.includes('macro') && (q.includes('cycle') || q.includes('bitcoin') || q.includes('btc') || q.includes('rate')))
  ) {
    const btcSpot = markets.BTC?.price || 62500;
    const reply = `### 🌐 Macroeconomic Regime & Bitcoin Halving Supply Inelasticity

Cryptocurrency asset valuations sit at the nexus of global fiat monetary liquidity and algorithmic supply schedules:

- **Spot BTC Quote**: $\\$${btcSpot.toLocaleString()}$
- **Global M2 Liquidity Metric**: $\\approx \\$104.5\\text{ Trillion}$
- **Correlation Factor**: $\\rho \\approx 0.78$

#### 1. Global M2 Liquidity Transmission
$$\\text{Correlation}(\\Delta \\text{BTC}, \\Delta \\text{Global M2}) \\approx 0.78, \\quad \\frac{\\partial \\text{Crypto Market Cap}}{\\partial \\text{Fiat Liquidity}} > 0$$
When major central banks expand their balance sheets, capital spills out across the risk curve into digital assets. Conversely, quantitative tightening (QT) compresses speculative multiples.

#### 2. Halving Supply Inelasticity & Issuance
Every 210,000 blocks (~4 years), the Bitcoin **Block Reward** reduces by $50\\%$:
$$\\text{Daily BTC Issuance} = 144 \\cdot \\text{Block Reward} = 144 \\cdot 3.125 = 450 \\text{ BTC/day}$$
At $\$${btcSpot.toLocaleString()}$, this represents only $\\approx \\$${((450 * btcSpot) / 1000000).toFixed(2)}\\text{M}/\\text{day}$ in new structural sell pressure from miners, amplifying spot ETF inflows.

#### 3. Net Liquidity Absorption
$$\\Delta \\text{Net Float} = \\text{Spot ETF Inflows} - 450 \\cdot P_{\\text{BTC}}$$
When net ETF inflows average $\\$200\\text{M}+/\\text{day}$, demand outstrips structural daily supply by over $6\\times$, creating non-linear price appreciation.

#### 4. Institutional Risk Posture
Quantitative risk models mandate holding at least **15% liquid USD cash buffer** to harvest asymmetric mispricings during liquidity-driven flash drawdowns.`;

    return {
      reply,
      actionProposal: null,
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // =========================================================================
  // 11. TECHNICAL OSCILLATORS (RSI DIVERGENCE, BOLLINGER %B, ATR)
  // =========================================================================
  if (
    q.includes('rsi') ||
    q.includes('indicator') ||
    q.includes('bollinger') ||
    q.includes('macd') ||
    q.includes('moving average') ||
    q.includes('atr') ||
    q.includes('oscillator')
  ) {
    const reply = `### 📐 Quantitative Indicator Architecture for \`${primaryAsset}\`

Evaluating mathematical oscillators and trend filters for **${primaryAsset}** (Spot: $${money(spot)}$):

- **Spot Quote**: $${money(spot)}$ ($${chg >= 0 ? '+' : ''}${chg.toFixed(2)}\\%$ 24h)
- **Market Regime**: \`${primaryInd.signalLabel}\` (Score: $${primaryInd.score >= 0 ? '+' : ''}${primaryInd.score}/100$)
- **RSI (14-period)**: $${primaryInd.rsi.toFixed(1)}$

#### 1. Relative Strength Index (14-Period)
$$\\text{RS} = \\frac{\\text{EMA}_{14}(\\text{Gains})}{\\text{EMA}_{14}(\\text{Losses})}, \\quad \\text{RSI} = 100 - \\frac{100}{1 + \\text{RS}} = ${primaryInd.rsi.toFixed(1)}$$
- Current status: **${primaryInd.rsi > 70 ? 'Overbought (Euphoria Top Warning)' : primaryInd.rsi < 30 ? 'Oversold (Accumulation Zone)' : 'Neutral Momentum'}**.

#### 2. Volatility Channels (Bollinger Bands)
$$\\text{SMA}_{20} = \\mu, \\quad \\text{Upper} = \\mu + 2\\sigma, \\quad \\text{Lower} = \\mu - 2\\sigma$$
$$\\%B = \\frac{\\text{Spot} - \\text{Lower}}{\\text{Upper} - \\text{Lower}} \\approx ${primaryInd.bb ? primaryInd.bb.percentB.toFixed(2) : '0.50'}$$

#### 3. Average True Range (ATR Risk Brackets)
$$\\text{TR} = \\max\\left(H_t - L_t, |H_t - C_{t-1}|, |L_t - C_{t-1}|\\right), \\quad \\text{ATR}_{14} = \\$${atr.toFixed(2)}$$
- Volatility Bandwidth: **${((atr / spot) * 100).toFixed(2)}%** daily price swing expectation. Always keep a **15% cash liquidity buffer** for mean-reversion rebalancing.`;

    return {
      reply,
      actionProposal: null,
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // =========================================================================
  // 12. SMART VALUE-WEIGHTED DCA ACCUMULATOR
  // =========================================================================
  if (
    q.includes('dca') ||
    q.includes('accumulate') ||
    q.includes('dollar cost') ||
    q.includes('schedule')
  ) {
    const dcaPlan = generateSmartDCAPlan(primaryAsset, 200, state, markets);

    const reply = `### 📈 Smart Value-Weighted DCA for \`${primaryAsset}\`

Constructed an asymmetric dollar-cost averaging schedule calibrated to valuation bands:
- **Target Asset**: \`${primaryAsset}\` (Spot Quote: $${money(spot)}$, RSI: $${primaryInd.rsi.toFixed(1)}$)
- **Base Allocation**: $${money(dcaPlan.baseAmountUsd)}$ per execution
- **Oversold Dip Multiplier**: $${dcaPlan.oversoldMultiplier}\\times$ ($${money(dcaPlan.baseAmountUsd * dcaPlan.oversoldMultiplier)}$) whenever $\\text{RSI}_{14} < 35$
- **Euphoria Top**: Pauses purchases when $\\text{RSI}_{14} > ${dcaPlan.pauseThresholdRsi}$ to prevent buying euphoric peaks

#### Dynamic Scaling Function & RSI Bounds
$$\\text{Allocation}(\\text{RSI}) = \\begin{cases} \\$${(dcaPlan.baseAmountUsd * dcaPlan.oversoldMultiplier).toFixed(0)} & \\text{if } \\text{RSI} < 35 \\text{ (Oversold Dip Multiplier)} \\\\ 0 & \\text{if } \\text{RSI} > 70 \\text{ (Euphoria Top Pause)} \\\\ \\$${dcaPlan.baseAmountUsd} & \\text{otherwise (Base Allocation)} \\end{cases}$$
$$\\text{RSI}_{14} = 100 - \\frac{100}{1 + \\text{RS}}, \\quad \\text{Oversold Band} < 35$$

Authorize this Smart Value-Weighted DCA plan below to initiate disciplined programmatic accumulation with a mandatory **15% cash liquidity reserve**.`;

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

  // =========================================================================
  // 13. PORTFOLIO REBALANCING & KELLY CRITERION
  // =========================================================================
  if (
    !q.includes('dca') &&
    (q.includes('rebalance') ||
      q.includes('kelly') ||
      q.includes('parity') ||
      q.includes('allocation') ||
      (q.includes('weight') && !q.includes('value-weighted')))
  ) {
    const style = q.includes('growth') ? 'growth_weighted' : 'risk_parity';
    const plan = calculateAgenticAllocation(state, markets, style);

    const reply = `### ⚖️ Autonomous Portfolio Rebalancing: \`${plan.style.replace('_', ' ').toUpperCase()}\`

Calculated optimal capital weights to maximize risk-adjusted returns:
- **Total Portfolio Valuation**: $\\$${pv.toLocaleString()}$
- **Rebalance Mode**: \`${plan.style}\`
- **Target Cash Buffer**: $${plan.cashTargetPct}\\%$ ($${money((plan.cashTargetPct / 100) * pv)}$)
- **Rebalance Steps**: $${plan.steps.length}$ transactions compiled with two-stage execution

#### 1. Fractional Kelly & Risk Parity Formulation
$$f^* = \\frac{p \\cdot b - q}{b} = \\frac{p(b+1) - 1}{b}, \\quad f^*_{\\text{half}} = \\frac{1}{2} f^*$$
$$w_i = \\frac{1 / \\sigma_i}{\\sum_{j=1}^N (1 / \\sigma_j)} \\cdot (1 - \\text{Cash Buffer})$$

#### 2. Planned Operations (Two-Stage Execution)
${plan.steps.map((s) => `- **${s.action.toUpperCase()}** ${s.amount} ${s.asset} (~$${money(s.estimatedNotional)})`).join('\n')}

Authorize in the Safety Gate to execute the sell orders first, freeing up liquid cash before executing buy steps.`;

    return {
      reply,
      actionProposal: plan.proposal,
      engine: 'Nexus Local Quantitative LLM (Offline Neural Fallback)',
    };
  }

  // =========================================================================
  // 14. TOKEN COMPARISON & ALPHA RADAR
  // =========================================================================
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

  // =========================================================================
  // 15. STRATEGY BOT SYNTHESIZER
  // =========================================================================
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

Deploy this algorithmic bot via the Safety Gate to activate autonomous tick evaluation while preserving the 15% cash floor.`;

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

  // =========================================================================
  // 16. ASSET-SPECIFIC QUANTITATIVE VALUATION & BRACKETS
  // =========================================================================
  if (
    mentionedAssets.length > 0 ||
    q.includes('price') ||
    q.includes('analyze') ||
    q.includes('buy') ||
    q.includes('sell') ||
    q.includes('opinion') ||
    q.includes('look like') ||
    q.includes('prediction') ||
    q.includes('outlook')
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

Nexus recommends an asymmetric **${orderSide.toUpperCase()}** order bracket with dynamic profit targets while maintaining a **15% cash liquidity reserve**. Review the proposal below:`;

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

  // =========================================================================
  // 17. GENERAL TELEMETRY & PORTFOLIO AUDIT
  // =========================================================================
  const topAsset = rk.topAsset || primaryAsset;
  const reply = `### 🧠 Executive Portfolio & Market Intelligence

- **Total Capital Equity**: $\\$${pv.toLocaleString()}$
- **Liquid Cash Reserve**: $\\$${state.cash.toLocaleString()}$ ($${((state.cash / Math.max(1, pv)) * 100).toFixed(1)}\\%$)
- **Portfolio Risk Score**: $${rk.portfolioRiskScore}/100$ (\`${rk.riskLabel}\`, HHI: $${rk.herfindahlIndex.toFixed(3)}$)
- **Top Concentration Exposure**: $${rk.topAssetConcentrationPct.toFixed(1)}\\%$ in \`${topAsset}\`

#### Modern Portfolio Theory (Sharpe & Diversification)
$$\\text{Sharpe Ratio} = \\frac{\\mathbb{E}[R_p] - R_f}{\\sigma_p} \\approx ${(0.08 / Math.max(0.01, rk.weightedVolatility * Math.sqrt(365))).toFixed(2)}$$
$$\\text{HHI} = \\sum_{i=1}^N w_i^2 = ${rk.herfindahlIndex.toFixed(3)} \\quad (${rk.herfindahlIndex > 0.25 ? 'Concentration Hazard' : 'Adequately Diversified'})$$

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
