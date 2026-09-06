import { Asset, Market, AppState, AIActionProposal } from '../../types';
import { portfolioValue, money, META, isIndianAsset } from '../portfolio';
import { calculatePortfolioRisk } from '../risk';
import { calculateBlackScholesAndGreeks } from './optionsGreeksEngine';
import { calculateHRP, calculateVaRAndCVaR } from './portfolioOptimizationEngine';
import { calculateHurstExponent, estimateOrnsteinUhlenbeck } from './regimeDetectionEngine';
import { QuantEngineResponse } from './types';

/**
 * Institutional Quantitative Knowledge Base and Dialogue Synthesizer.
 * Provides deep domain intelligence, mathematical formulations, and contextual responses.
 */
export class QuantDialogueEngine {
  /**
   * Evaluates and routes quantitative domain dialogue.
   */
  public static handleDialogue(
    prompt: string,
    state: AppState,
    markets: Record<Asset, Market | undefined>,
    primaryAsset: Asset,
    pv: number,
    rk: ReturnType<typeof calculatePortfolioRisk>,
    engineLabel: string
  ): QuantEngineResponse | null {
    const q = prompt.trim().toLowerCase();
    const primaryMarket = markets[primaryAsset];
    const spot = primaryMarket?.price || 100;
    const isIndian = isIndianAsset(primaryAsset);
    const currSym = isIndian ? '₹' : '$';

    // 1. Derivatives, Options, Volatility Smile & 25-Delta Skew
    if (
      (q.includes('skew') || q.includes('smile') || q.includes('surface') || q.includes('options') || q.includes('greek')) &&
      (q.includes('delta') || q.includes('volatility') || q.includes('implied') || q.includes('black-scholes') || q.includes('put-call'))
    ) {
      const bs = calculateBlackScholesAndGreeks({
        spotPrice: spot,
        strikePrice: spot,
        timeToExpiryYears: 30 / 365,
        volatility: 0.25,
        riskFreeRate: isIndian ? 0.07 : 0.045,
      });

      const reply = `### Quantitative Options Surface, Volatility Smile & Analytical Greeks

#### 1. Black-Scholes-Merton Partial Differential Equation
The continuous arbitrage-free valuation of derivative claims $V(S, t)$ follows:
$$\\frac{\\partial V}{\\partial t} + \\frac{1}{2}\\sigma^2 S^2 \\frac{\\partial^2 V}{\\partial S^2} + r S \\frac{\\partial V}{\\partial S} - r V = 0$$

Analytical European Call & Put solutions:
$$d_1 = \\frac{\\ln(S/K) + (r + \\frac{1}{2}\\sigma^2)T}{\\sigma\\sqrt{T}}, \\quad d_2 = d_1 - \\sigma\\sqrt{T}$$
$$C(S, K, T) = S \\cdot \\mathcal{N}(d_1) - K e^{-rT} \\mathcal{N}(d_2)$$
$$P(S, K, T) = K e^{-rT} \\mathcal{N}(-d_2) - S \\cdot \\mathcal{N}(-d_1)$$

#### 2. First- and Second-Order Greeks
- **Delta ($\\Delta$)**: $\\frac{\\partial V}{\\partial S} = \\mathcal{N}(d_1)$ (Call: \`+${bs.callGreeks.delta.toFixed(3)}\`, Put: \`${bs.putGreeks.delta.toFixed(3)}\`)
- **Gamma ($\\Gamma$)**: $\\frac{\\partial^2 V}{\\partial S^2} = \\frac{\\mathcal{N}'(d_1)}{S \\sigma \\sqrt{T}} = \`${bs.callGreeks.gamma.toFixed(5)}\`$ (peaks at ATM)
- **Vega ($\\mathcal{V}$)**: $\\text{Vega } (\\mathcal{V}) = \\frac{\\partial V}{\\partial \\sigma} = S \\sqrt{T} \\mathcal{N}'(d_1) = \`${currSym}${bs.callGreeks.vega.toFixed(2)}\`$ per 1% vol shift
- **Theta ($\\Theta$)**: $\\frac{\\partial V}{\\partial t} = \`-${currSym}${Math.abs(bs.callGreeks.theta).toFixed(2)}\`$/day (calendar decay)
- **Rho ($\\rho$)**: $\\frac{\\partial V}{\\partial r} = \`${currSym}${bs.callGreeks.rho.toFixed(3)}\`$
- **Vanna**: $\\frac{\\partial \\Delta}{\\partial \\sigma} = -\\frac{\\mathcal{N}'(d_1) d_2}{\\sigma} = \`${bs.callGreeks.vanna.toFixed(4)}\`$
- **Volga (Vomma)**: $\\frac{\\partial \\mathcal{V}}{\\partial \\sigma} = \\mathcal{V} \\frac{d_1 d_2}{\\sigma} = \`${bs.callGreeks.volga.toFixed(4)}\`$

#### 3. Volatility Smile & 25-Delta Put-Call Skew Formulation
$$\\text{25-Delta Put-Call Skew} = \\sigma(25\\Delta \\text{ Put}) - \\sigma(25\\Delta \\text{ Call})$$
$$\\text{Volatility Smile Curvature} = \\frac{\\sigma(25\\Delta \\text{ Put}) + \\sigma(25\\Delta \\text{ Call})}{2} - \\sigma(\\text{ATM})$$

- **Equity & Index Skew**: Downside OTM puts trade at an implied volatility premium over OTM calls due to crash protection hedging demand.
- **Surface Slicing**: When market implied skew steepens, institutional desks favor ratio put spreads or collar structures to finance protective floors.`;

      return { reply, actionProposal: null, engine: engineLabel };
    }

    // 2. Funding Rates & Perpetual Swaps
    if (
      (q.includes('funding') && (q.includes('rate') || q.includes('perpetual') || q.includes('future') || q.includes('swap'))) ||
      (q.includes('perpetual') && q.includes('future'))
    ) {
      const reply = `### Microstructure of Perpetual Swaps & Funding Rate Equilibrium

#### 1. Mechanism of Perpetual Futures
Traditional futures contracts converge to spot prices via predetermined calendar expiration and delivery. In contrast, **Perpetual Swaps** have no expiration date. They achieve spot convergence through regular **Funding Rate** payments exchanged peer-to-peer between long and short contract holders.

#### 2. Funding Payment Formulation
$$\\text{Funding Rate} = \\text{Clamp}\\left(\\text{Premium Index} + \\text{Clamp}(\\text{Interest Rate} - \\text{Premium Index}, -0.05\\%, +0.05\\%), -0.75\\%, +0.75\\%\\right)$$
$$\\text{Premium Index} (P) = \\frac{\\max(0, \\text{Impact Bid Price} - \\text{Index Price}) - \\max(0, \\text{Index Price} - \\text{Impact Ask Price})}{\\text{Index Price}}$$
$$\\text{Funding Payment} = \\text{Position Size} \\times \\text{Mark Price} \\times \\text{Funding Rate}$$

#### 3. Cash-and-Carry Arbitrage & Basis Yield
$$\\text{Annualized Basis Yield} = \\left(1 + \\text{Funding Rate}_{8h}\\right)^{1095} - 1$$
- **Positive Funding (Contango)**: Perpetuals trade at a premium to spot ($P_{\\text{perp}} > P_{\\text{spot}}$). Longs pay shorts. Basis arbitrageurs short perpetuals while holding spot to harvest delta-neutral yield.
- **Negative Funding (Backwardation)**: Perpetuals trade at a discount ($P_{\\text{perp}} < P_{\\text{spot}}$). Shorts pay longs, signaling heavy hedging or downward speculative positioning.`;

      return { reply, actionProposal: null, engine: engineLabel };
    }

    // 3. Automated Market Makers (AMM), Uniswap & Impermanent Loss
    if (
      q.includes('impermanent loss') ||
      (q.includes('amm') && (q.includes('uniswap') || q.includes('defi') || q.includes('liquidity pool'))) ||
      (q.includes('uniswap') && q.includes('defi'))
    ) {
      const reply = `### Automated Market Makers (AMMs) & Impermanent Loss Dynamics

#### 1. Constant Product Invariant
The foundational Constant Product Market Maker (CPMM) popularized by Uniswap v2 operates on the invariant:
$$x \\cdot y = k$$
where $x$ and $y$ are reserve quantities of token pairs, and $k$ remains constant in the absence of liquidity deposits or withdrawals.
The marginal spot price is defined by the reserve ratio:
$$P = \\frac{y}{x}$$

#### 2. Mathematical Derivation of Impermanent Loss
Let $k_p = \\frac{P_{\\text{new}}}{P_{\\text{initial}}}$ denote the relative price ratio change between the pair assets.
The value of the LP position relative to holding the underlying assets (HODL) is given by:
$$\\text{IL}(k_p) = \\frac{2\\sqrt{k_p}}{1 + k_p} - 1$$

| Relative Price Change ($k_p$) | Divergence Direction | Impermanent Loss $\\text{IL}(k_p)$ | Break-Even Fee Yield Needed |
| :--- | :--- | :--- | :--- |
| **1.25x (+25%)** | Moderate Rally | \`-0.60%\` | $+0.60\\%$ |
| **1.50x (+50%)** | Strong Expansion | \`-2.02%\` | $+2.02\\%$ |
| **2.00x (+100%)** | Large Doubling | \`-5.72%\` | $+5.72\\%$ |
| **3.00x (+200%)** | Trend Runner | \`-13.40%\` | $+13.40\\%$ |
| **0.50x (-50%)** | 50% Drawdown | \`-5.72%\` | $+5.72\\%$ |

#### 3. Loss-Versus-Rebalancing (LVR)
Modern microstructure theory proves that LP divergence is not merely "impermanent" but represents adverse selection against informed arbitrageurs whenever external market prices move.`;

      return { reply, actionProposal: null, engine: engineLabel };
    }

    // 4. Macroeconomics, Liquidity Cycles, M2 & Halving
    if (
      (q.includes('halving') || q.includes('m2') || q.includes('macro') || q.includes('liquidity cycle')) &&
      (q.includes('bitcoin') || q.includes('btc') || q.includes('cycle') || q.includes('global') || q.includes('monetary'))
    ) {
      const reply = `### Macroeconomic Regime & Global Liquidity Cycle Transmission

#### 1. Global M2 Expansion & Fiat Debasement
Asset price cycles across risk assets, equities, and cryptocurrencies are overwhelmingly correlated with global central bank balance sheets and broad money supply:
$$\\Delta \\text{Asset Price} \\approx \\beta_{\\text{M2}} \\cdot \\Delta \\text{Global M2} + \\alpha_{\\text{Adoption}} - \\gamma_{\\text{Real Rates}}$$
- **Global M2 Money Supply**: Aggregate broad money supply across the US Federal Reserve, ECB, Bank of Japan, and PBOC serves as the tide lifting all risk assets.
- **Financial Conditions Index**: Looser financial conditions compress equity risk premia and expand valuation multiples.

#### 2. Bitcoin Halving Supply Invariant
Bitcoin's disinflationary supply schedule halves block rewards every 210,000 blocks (roughly every 4 years):
$$\\text{Daily BTC Issuance} = 144 \\text{ blocks/day} \\times \\text{Block Reward}$$
- **Post-2024 Halving**: Daily issuance dropped from 900 BTC/day to **450 BTC/day** (annual inflation $\\approx 0.85\\%$, lower than gold).
- **Stock-to-Flow Inelasticity**: Inelastic daily new supply meets fluctuating global monetary demand, creating structural convexity during global liquidity expansion phases.`;

      return { reply, actionProposal: null, engine: engineLabel };
    }

    // 5. Technical Indicators: RSI, Bollinger Bands, ATR
    if (
      (q.includes('rsi') || q.includes('bollinger') || q.includes('macd') || q.includes('atr')) &&
      (q.includes('calculate') || q.includes('formula') || q.includes('indicator') || q.includes('explain'))
    ) {
      const reply = `### Mathematical Formulation of Core Technical Indicators

#### 1. Relative Strength Index (RSI)
Developed by J. Welles Wilder, the RSI measures the momentum and velocity of directional price movements:
$$\\text{RSI} = 100 - \\frac{100}{1 + \\text{RS}}, \\quad \\text{RS} = \\frac{\\text{Smoothed Average Gain}}{\\text{Smoothed Average Loss}}$$
For period $N = 14$:
$$\\bar{U}_t = \\frac{13 \\bar{U}_{t-1} + U_t}{14}, \\quad \\bar{D}_t = \\frac{13 \\bar{D}_{t-1} + D_t}{14}$$
where $U_t = \\max(0, P_t - P_{t-1})$ and $D_t = \\max(0, P_{t-1} - P_t)$.

#### 2. Bollinger Bands & %B Bandwidth
Constructed around an $N$-period Simple Moving Average (typically $N=20$) with $K$ standard deviations ($K=2$):
$$\\text{Middle Band} = \\text{SMA}_{20}(P) = \\frac{1}{20} \\sum_{i=0}^{19} P_{t-i}$$
$$\\text{Upper Band} = \\text{SMA}_{20}(P) + 2 \\cdot \\sigma_{20}, \\quad \\text{Lower Band} = \\text{SMA}_{20}(P) - 2 \\cdot \\sigma_{20}$$
$$\\%B = \\frac{P_t - \\text{Lower Band}}{\\text{Upper Band} - \\text{Lower Band}}$$
- $\%B > 1.0$: Price exceeds upper band (overextended expansion)
- $\%B < 0.0$: Price drops below lower band (oversold dip)

#### 3. Average True Range (ATR)
$$\\text{True Range (TR)} = \\max\\left(H_t - L_t, \\,|H_t - C_{t-1}|, \\,|L_t - C_{t-1}|\\right)$$
$$\\text{ATR}_t = \\frac{(N-1) \\cdot \\text{ATR}_{t-1} + \\text{TR}_t}{N}$$
ATR defines institutional volatility stops and dynamic position sizing.`;

      return { reply, actionProposal: null, engine: engineLabel };
    }

    // 6. MEV, Sandwich Bots, and Order Flow Microstructure
    if (
      q.includes('sandwich') ||
      q.includes('mev') ||
      (q.includes('searcher') && q.includes('profit')) ||
      (q.includes('maximal extractable') || q.includes('miner extractable'))
    ) {
      const reply = `### Maximal Extractable Value (MEV) & Mempool Microstructure

#### 1. Mechanics of Maximal Extractable Value (MEV)
**Maximal Extractable Value (MEV)** is the total value searchers and block builders can extract from permissionless blockchains by inserting, deleting, or reordering transactions within a block.

#### 2. Anatomy of a Sandwich Attack
A searcher bot detects a large decentralized exchange swap in the public mempool:
1. **Front-Run**: The bot submits a buy transaction with higher priority gas ($P_{\\text{gas}}$) ahead of the victim, pushing the spot price up to:
$$P_{\\text{max}} = P_0 \\cdot \\left(1 + \\text{Slippage Tolerance}\\right)$$
2. **Victim Execution**: The victim's transaction executes at the worst possible allowable slippage price.
3. **Back-Run**: The bot immediately sells the acquired tokens in the same atomic transaction bundle:
$$\\text{Net Profit} = (P_{\\text{back-run}} - P_{\\text{front-run}}) \\cdot Q - 2 \\cdot \\text{Gas Fees} - \\text{Builder Bribe}$$

#### 3. Loss Versus Rebalancing (LVR)
In continuous time, continuous price volatility $\\sigma$ generates non-recoverable arbitrage leakage:
$$\\text{LVR} = \\int_0^T \\frac{\\sigma^2}{8} S_t \\sqrt{L} \\, dt$$
To mitigate MEV slippage, institutional traders route orders through private RPC relays (e.g. Flashbots Protect) and avoid high slippage tolerances.`;

      return { reply, actionProposal: null, engine: engineLabel };
    }

    // 7. Liquid Staking (LST) vs Lending Risk Matrix
    if (
      (q.includes('staking') || q.includes('lst')) &&
      (q.includes('lending') || q.includes('aave') || q.includes('yield') || q.includes('risk'))
    ) {
      const reply = `### Liquid Staking (LST) vs DeFi Lending: Yield Mechanics & Risk Architecture

#### 1. Yield Generation Mechanism
- **Liquid Staking (LST)**: Yield originates directly from native consensus validation fees (consensus rewards + priority tips + MEV block bribes).
- **Lending Protocols (e.g. Aave)**: Yield is paid by over-collateralized borrowers governed by an algorithmic interest rate kink curve:
$$R_t = \\begin{cases} R_0 + \\frac{U_t}{U_{\\text{kink}}} R_1, & U_t \\le U_{\\text{kink}} \\\ R_0 + R_1 + \\frac{U_t - U_{\\text{kink}}}{1 - U_{\\text{kink}}} R_2, & U_t > U_{\\text{kink}} \\end{cases}$$

#### 2. Comparative Risk Matrix
| Risk Dimension | Liquid Staking (LST) | Lending Protocol (Aave) | Institutional Assessment |
| :--- | :--- | :--- | :--- |
| **Slashing Risk** | Present (Validator misbehavior or downtime) | None | LST carries node operator slashing penalty risk |
| **Smart Contract Risk** | Staking contract + derivative token wrapping | Pool router + liquidation engine contracts | Both expose depositors to EVM contract vulnerabilities |
| **De-Peg / Liquidity Risk** | LST can trade at secondary market discount | Borrow liquidity freeze if utilization $U \\to 100\\%$ | LST secondary liquidity can dislocate in market panics |
| **Bad Debt Risk** | None | Liquidation shortfall on sharp market cascades | Under-collateralization if liquidation bots fail |
| **Re-Hypothecation** | Nil (native consensus custody) | High (funds lent to active leveraged traders) | Lending carries higher counterparty utilization risk |`;

      return { reply, actionProposal: null, engine: engineLabel };
    }

    // 8. Herfindahl-Hirschman Index (HHI) & Concentration Audit
    if (
      q.includes('concentrat') ||
      q.includes('hhi') ||
      (q.includes('diversif') && (q.includes('portfolio') || q.includes('audit')))
    ) {
      const reply = `### Portfolio Concentration Audit: Herfindahl-Hirschman Index (HHI)

#### 1. Mathematical Formulation of Portfolio Concentration
The **Herfindahl-Hirschman Index (HHI)** measures market concentration and diversification risk across portfolio weights:
$$\\text{HHI} = \\sum_{i=1}^N w_i^2, \\quad \\sum_{i=1}^N w_i = 1$$
where $w_i$ represents the portfolio weight of asset $i$.
The **Effective Number of Uncorrelated Constituents ($N_{\\text{eff}}$)** is given by:
$$N_{\\text{eff}} = \\frac{1}{\\text{HHI}}$$

#### 2. Live Portfolio Telemetry
- **Total Portfolio Equity**: $\\$${pv.toLocaleString()}$
- **Liquid Cash Cushion**: $\\$${state.cash.toLocaleString()}$ (**${((state.cash / Math.max(1, pv)) * 100).toFixed(1)}%**)
- **Herfindahl HHI Score**: $\\text{HHI} = ${rk.herfindahlIndex.toFixed(3)}$
- **Effective Number of Bets ($N_{\\text{eff}}$)**: **${(1 / Math.max(0.01, rk.herfindahlIndex)).toFixed(1)}**
- **Dominant Asset**: \`${rk.topAsset || 'None'}\` (**${rk.topAssetConcentrationPct.toFixed(1)}%**)

#### 3. Institutional Concentration Thresholds
| HHI Value | Effective Assets ($N_{\\text{eff}}$) | Concentration Status | Risk Action Required |
| :--- | :--- | :--- | :--- |
| $\\text{HHI} < 0.15$ | $N_{\\text{eff}} > 6.7$ | **Highly Diversified** | Optimal cross-sectional diversification |
| $0.15 \\le \\text{HHI} \\le 0.25$ | $4.0 \\le N_{\\text{eff}} \\le 6.7$ | **Moderately Concentrated** | Balanced risk profile; monitor single asset drift |
| $\\text{HHI} > 0.25$ | $N_{\\text{eff}} < 4.0$ | **Severely Concentrated** | Single-name idiosyncratic risk violates risk limits |`;

      return { reply, actionProposal: null, engine: engineLabel };
    }

    // 9. Layer-2 Rollups: Optimistic vs ZK
    if (
      (q.includes('optimistic') || q.includes('zk') || q.includes('rollup')) &&
      (q.includes('layer') || q.includes('l2') || q.includes('fees') || q.includes('finality'))
    ) {
      const reply = `### Layer-2 Rollup Microeconomics & Verification Architectures

#### 1. Layer-2 Cost Decomposition (Post EIP-4844)
$$\\text{Total L2 Transaction Fee} = \\text{L2 Execution Cost} + \\frac{\\text{L1 Calldata/Blob Cost}}{\\text{Batch Compression Ratio}}$$
Following **EIP-4844 (Proto-Danksharding)**, L2 transaction batches post data in transient data "blobs" rather than expensive persistent L1 calldata, reducing L2 fee overhead by 85-95%.

#### 2. Optimistic vs ZK Rollup Architecture
| Feature Dimension | Optimistic Rollups (Arbitrum, Optimism) | Zero-Knowledge Rollups (Starknet, zkSync) |
| :--- | :--- | :--- |
| **State Validation** | Fraud Proofs (Optimistic assumption until challenged) | **Validity Proofs** (Cryptographic SNARK/STARK) |
| **Finality Latency** | 7-day dispute challenge period for native bridge egress | Cryptographic proof generation + L1 verification ($\le 1$ hour) |
| **Off-Chain Computation** | Minimal overhead (EVM equivalent opcode execution) | Heavy mathematical overhead generating zero-knowledge proofs |
| **Capital Efficiency** | Fast liquidity exits require third-party market maker bridges | Direct atomic settlement on Ethereum L1 upon proof inclusion |`;

      return { reply, actionProposal: null, engine: engineLabel };
    }

    // 10. Greetings & Capabilities Introduction
    if (
      q === 'hi' ||
      q === 'hello' ||
      q === 'hey' ||
      q.startsWith('hello') ||
      q.startsWith('hi ') ||
      (q.includes('who are you') && q.includes('what can you do')) ||
      q.includes('what can you do for me')
    ) {
      const reply = `### Nexus Intelligence: Institutional Quantitative Copilot

Welcome! I am **Nexus Intelligence**, your deterministic offline quantitative reasoning engine and autonomous desk assistant.

#### What I Can Do for You
1. **Autonomous Agentic Workflows**: Multi-phase portfolio optimization, capital defense, and algorithmic execution.
2. **Options & Derivatives Pricing**: Analytical Black-Scholes Greeks ($\\Delta, \\Gamma, \\mathcal{V}, \\Theta, \\rho, \\text{Vanna}, \\text{Volga}$), volatility surfaces, and multi-leg strategies.
3. **Risk & Capital Management**: Real-time Herfindahl HHI concentration audits, Value at Risk ($\\text{VaR}_{95\\%}, \\text{VaR}_{99\\%}$), and Conditional Value at Risk ($\\text{CVaR}$).
4. **Market Microstructure**: Kyle's Lambda price impact, Amihud illiquidity metrics, and Almgren-Chriss optimal liquidation trajectories.
5. **Regime Detection**: Hurst exponent classification, Ornstein-Uhlenbeck mean reversion, and Kalman filter dynamic fair-value state estimation.

Access advanced bot generation, stress testing, and DCA plans anytime via the **Capabilities Hub (\`+\`)** menu below!`;

      return { reply, actionProposal: null, engine: engineLabel };
    }

    // 11. Trading Psychology: Quitting Job to Trade Full Time
    if (
      q.includes('quit my job') ||
      q.includes('quit job') ||
      (q.includes('trade full time') && (q.includes('quit') || q.includes('career') || q.includes('leave')))
    ) {
      const reply = `### Thinking of Quitting Your Job to Trade Full-Time: A Quantitative Reality Check

Transitioning to professional full-time trading requires cold-eyed mathematical solvency and extreme psychological resilience. Here is the unvarnished framework:

#### 1. The Solvency Equation: Living Expenses vs Capital Drawdown
When you trade full-time, your trading account must cover:
$$\\text{Annual Capital Drag} = \\text{Annual Living Expenses} + \\text{Max Expected Systemic Drawdown}$$
- If you have ₹25,00,000 in capital and require ₹60,000/month (₹7,20,000/yr) for living expenses, you need an **immediate 28.8% net annual return just to break even**, before taxes and transaction friction.
- Withdrawing living expenses during a normal 15% drawdown destroys compound growth and triggers catastrophic capital depletion.

#### 2. Mental Capital Drain & The Emotional Doom Loop
- In employment, income is non-correlated with market volatility.
- When trading for survival, every red day feels like an existential threat to your household security.
- This creates **Mental Capital Drain**, leading to over-leveraging, revenge trading, and abandoning validated systematic risk rules.

#### 3. The Professional Blueprint
1. **24-Month Emergency Runway**: Accumulate at least 24 months of living expenses completely separate from your trading capital in liquid debt instruments or bank deposits.
2. **Proven 2-Year Statistical Track Record**: Execute at least 500+ live trades across bull, bear, and chop regimes with verified positive Sharpe ratio ($> 1.5$) and maximum drawdown under 15%.
3. **Automate Execution**: Eliminate discretionary emotion through algorithmic execution gates and strict position sizing limits.`;

      return { reply, actionProposal: null, engine: engineLabel };
    }

    // 12. Emotional Circuit Breaker: FOMO Neutralization
    if (
      q.includes('fomo') ||
      (q.includes('pump') && (q.includes('chase') || q.includes('buy now') || q.includes('should i buy'))) ||
      q.includes('fear of missing out')
    ) {
      const reply = `### Emotional Circuit Breaker: Neutralizing FOMO

#### 1. The Quantitative Reality of Chasing Expansion
When an asset experiences an parabolic momentum spike, its risk-to-reward ratio deteriorates exponentially:
$$\\text{Risk-to-Reward Ratio} = \\frac{\\text{Target Price} - \\text{Entry Price}}{\\text{Entry Price} - \\text{Structural Stop Level}}$$
- As price stretches away from the 20 EMA, the required stop-loss distance widens drastically.
- Buying into the top of an impulsive candle exposes you to immediate **Mean-Reversion** reversion toward equilibrium value.

#### 2. Institutional Axiom: Never Chase the Bid
Professional market makers and quantitative funds **never chase the bid** during an impulsive rally. They sell liquidity into retail FOMO breakouts and wait for a structured pullback or volume consolidation.

#### 3. Actionable Framework
1. **Wait for the Retest**: Allow the price to retrace to the 20-period EMA or previous resistance-turned-support.
2. **Check the Asymmetry**: Only enter if potential upside is at least **$2.5\\times$** the maximum downside risk.
3. **Preserve Cash**: Cash is a position of optionality. Preserving capital ensures dry powder when asymmetric setups present themselves.`;

      return { reply, actionProposal: null, engine: engineLabel };
    }

    // 13. Storytelling & ELI5: Blockchain for a Grandmother / Child
    if (
      (q.includes('grandmother') || q.includes('grandma') || q.includes('child') || q.includes('eli5') || q.includes('simple words')) &&
      q.includes('blockchain')
    ) {
      const reply = `### Blockchain Explained in Simple Words: The Magic Shared Notebook

Imagine you and ten of your closest neighbors share a special ledger—a **Magic Shared Notebook**:

1. **Everyone Has an Identical Copy**: Instead of keeping your savings recorded in a single locked bank building, every single neighbor has an exact copy of this notebook on their kitchen table.
2. **Writing a New Page**: When Alice wants to send 5 cookies to Bob, she announces it out loud: *"I am giving 5 cookies to Bob!"* Every neighbor checks their own notebook to ensure Alice actually has 5 cookies.
3. **Preventing Cheating (No Double-Spending)**: Alice cannot give the same 5 cookies to Charlie at the same time, because everyone's notebook instantly shows she already sent them to Bob.
4. **Indelible Ink**: Once a whole page of cookie trades is written, the neighbors solve a clever puzzle together and stamp the page with a permanent wax seal. Once sealed, no page can ever be erased, torn out, or altered.

That is all a blockchain is: a transparent, shared, permanent notebook that lets people transact honestly without needing a middleman!`;

      return { reply, actionProposal: null, engine: engineLabel };
    }

    // 14. Satoshi Nakamoto Vision & Byzantine Generals
    if (
      (q.includes('satoshi') || q.includes('whitepaper') || q.includes('byzantine')) &&
      (q.includes('vision') || q.includes('problem') || q.includes('bitcoin') || q.includes('generals'))
    ) {
      const reply = `### Satoshi Nakamoto's Vision & Resolution of the Byzantine Generals Problem

#### 1. The Core Economic Vision
On October 31, 2008, Satoshi Nakamoto published *Bitcoin: A Peer-to-Peer Electronic Cash System*. The foundational motivation was creating an unseizable, mathematically sovereign monetary protocol:
> *"A purely peer-to-peer version of electronic cash would allow online payments to be sent directly from one party to another without going through a financial institution."*

On January 3, 2009, Satoshi mined the **Genesis Block** (Block #0), embedding the famous headline into the coinbase parameter:
\`The Times 03/Jan/2009 Chancellor on brink of second bailout for banks\`

#### 2. Resolving the Byzantine Generals Problem
The **Byzantine Generals Problem** is a classic distributed computing dilemma: how can independent distributed nodes reach consensus over an untrusted network when some actors are malicious or uncoordinated?

Satoshi solved this through **Proof-of-Work (PoW)** and the **Nakamoto Consensus** mechanism:
1. **Thermodynamic Grounding**: Participating nodes must commit real-world electrical energy to compute SHA-256 hash inversions.
2. **Longest Chain Rule**: The network objectively agrees on the valid transaction history by selecting the chain with the greatest cumulative Proof-of-Work.
3. **Economic Incentive Alignment**: It is mathematically more profitable for miners to secure the network and earn block rewards than to attempt a 51% attack.`;

      return { reply, actionProposal: null, engine: engineLabel };
    }

    // 15. Humor & Jokes
    if (
      q.includes('joke') ||
      q.includes('funny') ||
      q.includes('humor') ||
      q.includes('laugh')
    ) {
      const reply = `### Quantitative & Crypto Trading Humor

Here is a classic for the quantitative trading desk:

> **Why did the high-frequency quantitative trader break up with their date?**  
> *Because there was too much latency in their communication, the bid-ask spread was too wide, and every time they tried to execute, a Sandwich Bot front-ran their dinner reservation!*

And another:

> A retail trader asks his algorithmic bot: *"Will my portfolio go to the moon today?"*  
> The bot analyzes 10,000 order books, calculates the Hurst exponent, runs 1,000 Monte Carlo paths, and prints:  
> \`Status 200: Congratulations! Your position has successfully decoupled from all known laws of valuation.\``;

      return { reply, actionProposal: null, engine: engineLabel };
    }

    return null;
  }
}
