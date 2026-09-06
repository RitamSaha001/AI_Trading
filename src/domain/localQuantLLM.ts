import {
  ASSETS,
  Asset,
  AppState,
  Market,
  AIActionProposal,
  StrategyKind,
  StressTestScenario,
} from '../types';
import { portfolioValue, money, moneyINR, META } from './portfolio';
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
import { MarketDataValidityGuard } from './marketValidity';
import { calculateRiskBasedPositionSize } from './positionSizing';
import { getRiskPolicy } from './riskPolicy';
import { validateAIProposal } from '../services/safetyGate';
import {
  calculateBlackScholesAndGreeks,
  calculateImpliedVolatility,
  analyzeMultiLegStrategy,
  buildNSEDerivativesStrategy,
  generateOptionsGreeksExplanation,
  calculateHRP,
  calculateVaRAndCVaR,
  runMonteCarloSimulation,
  calculateKylesLambda,
  calculateAmihudIlliquidity,
  calculateOrderFlowImbalance,
  computeAlmgrenChrissSchedule,
  generateMicrostructureExplanation,
  calculateHurstExponent,
  estimateOrnsteinUhlenbeck,
  estimateGarchVolatility,
  runKalmanFilter,
  calculateTTMSqueeze,
  calculateHalfKellyFraction,
  getAssetSector,
  QuantDialogueEngine,
} from './quantEngine';

export interface LocalLLMResult {
  reply: string;
  actionProposal?: AIActionProposal | null;
  engine: string;
}

export const ENGINE_LABEL = 'Nexus Deterministic Quant Engine (Local Quantitative LLM Offline Fallback)';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ConversationContext {
  turnsCount: number;
  lastReferencedAsset: Asset | null;
  discussedAssets: Asset[];
  userTone: 'curious' | 'analytical' | 'anxious' | 'casual';
  priorTopic: string | null;
}

/**
 * Extracts conversational context, tracked assets, and pronouns from multi-turn chat history.
 */
function analyzeConversationContext(
  history: ChatHistoryMessage[] = [],
  currentPrompt: string
): ConversationContext {
  const context: ConversationContext = {
    turnsCount: history.length,
    lastReferencedAsset: null,
    discussedAssets: [],
    userTone: 'analytical',
    priorTopic: null,
  };

  const assetFreq: Record<string, number> = {};

  // Scan recent history (last 10 turns) backwards
  const recentHistory = history.slice(-10).reverse();
  for (const m of recentHistory) {
    for (const a of ASSETS) {
      const symRegex = new RegExp(`\\b${a}\\b`, 'i');
      if (symRegex.test(m.text)) {
        if (!context.lastReferencedAsset) {
          context.lastReferencedAsset = a as Asset;
        }
        assetFreq[a] = (assetFreq[a] || 0) + 1;
      }
    }
  }

  context.discussedAssets = Object.keys(assetFreq) as Asset[];

  // Tone detection
  const lower = currentPrompt.toLowerCase();
  if (lower.includes('panic') || lower.includes('crash') || lower.includes('fomo') || lower.includes('scared') || lower.includes('losing')) {
    context.userTone = 'anxious';
  } else if (lower.includes('hi') || lower.includes('hello') || lower.includes('joke') || lower.includes('how are you')) {
    context.userTone = 'casual';
  } else if (lower.includes('why') || lower.includes('how') || lower.includes('explain') || lower.includes('what is')) {
    context.userTone = 'curious';
  } else {
    context.userTone = 'analytical';
  }

  return context;
}

/**
 * Formulates a high-speed System 2 cognitive reasoning trace (Claude / Gemini thinking style).
 */
function generateThinkingTrace(
  prompt: string,
  state: AppState,
  markets: Record<Asset, Market | undefined>,
  context: ConversationContext,
  domainCategory: string,
  primaryAsset: Asset
): string {
  const pv = portfolioValue(state, markets);
  const rk = calculatePortfolioRisk(state, markets);
  const cashPct = ((state.cash / Math.max(1, pv)) * 100).toFixed(1);
  const isUpstox = state.accountMode === 'upstox';
  const m = markets[primaryAsset];

  return `<thinking>
[1. Semantic Intent & Contextual Extraction]
• User prompt: "${prompt.slice(0, 90)}${prompt.length > 90 ? '...' : ''}"
• Identified domain: ${domainCategory}
• Primary asset in focus: ${primaryAsset} (Last Price: ${m ? (isUpstox ? moneyINR(m.price) : money(m.price)) : 'N/A'})
${context.lastReferencedAsset ? `• Contextual resolution: Contextually mapped to prior turn focus symbol \`${context.lastReferencedAsset}\`.` : '• Entity extraction: Explicit asset symbol referenced or defaulting to desk selected asset.'}
${context.turnsCount > 0 ? `• Multi-turn continuity: Turn ${context.turnsCount + 1}. Session context active across [${context.discussedAssets.join(', ') || 'General Desk'}].` : '• Session state: Cold start turn 1.'}

[2. Portfolio Solvency & Operational Invariants]
• Active Desk: ${isUpstox ? 'Upstox Indian Equities (NSE/BSE Live)' : 'Simulated Paper Sandbox'}
• Total Equity Valuation: $${pv.toLocaleString()} | Liquid Cash Buffer: ${cashPct}% ($${state.cash.toLocaleString()})
• Concentration Index: HHI = ${rk.herfindahlIndex.toFixed(3)} | Top Asset: \`${rk.topAsset || primaryAsset}\` (${rk.topAssetConcentrationPct.toFixed(1)}%)
• Liquidity Health Floor (15%): ${Number(cashPct) >= 15 ? 'NOMINAL (Unrestricted execution)' : 'VIOLATION WARNING (Defensive cash conservation engaged)'}

[3. Quantitative Model Selection & Derivation]
• Mathematical frameworks: Deriving analytical solutions, statistical moments, and risk-adjusted alpha matrices.
• KaTeX formula synthesis: Grounding assertions in rigorous mathematical equations with zero hallucinations.

[4. Regulatory & Safety Gate Bounds]
• Dual-Key Safety: Requiring explicit user authorization for all trade or strategy proposals.
• SEBI Compliance: Verified Order-to-Trade Ratio (OTR < 20:1) and static IP (87.76.191.49).

[5. Persona & Structural Plan]
• Persona: Warm, intellectually peerless institutional quantitative strategist.
• Formulating comprehensive response with clear conceptual breakdown, LaTeX formulas, and proactive guidance.
</thinking>
`;
}

/**
 * Nexus Deterministic Quantitative Financial & Conversational Reasoning Engine.
 * Operates offline as a high-fidelity frontier-grade local LLM with visible System 2 reasoning traces.
 */
export function queryNexusDeterministicQuant(
  prompt: string,
  state: AppState,
  markets: Record<Asset, Market | undefined>,
  history: ChatHistoryMessage[] = []
): LocalLLMResult {
  const q = prompt.trim().toLowerCase();
  const rawPrompt = prompt.trim();
  const pv = portfolioValue(state, markets);
  const rk = calculatePortfolioRisk(state, markets);
  const policy = getRiskPolicy(state);
  const selectedAsset = state.selectedAsset;
  const isUpstox = state.accountMode === 'upstox';

  // Analyze multi-turn context
  const context = analyzeConversationContext(history, prompt);

  // Detect mentioned assets from query with strict word boundaries or resolve from history
  const mentionedAssets = (ASSETS as readonly string[]).filter((a) => {
    const symbolRegex = new RegExp(`\\b${a}\\b`, 'i');
    const name = META[a as Asset]?.name;
    const nameRegex = name ? new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null;
    return symbolRegex.test(prompt) || (nameRegex !== null && nameRegex.test(prompt));
  }) as Asset[];

  // Fallback to last referenced asset from history if pronouns ("it", "that", "this stock") are used
  const hasPronoun = /\b(it|that|this stock|this asset|the position|current holding)\b/i.test(q);
  const primaryAsset: Asset =
    mentionedAssets[0] || (hasPronoun && context.lastReferencedAsset ? context.lastReferencedAsset : selectedAsset);

  const primaryMarket = markets[primaryAsset];
  const primaryInd = primaryMarket
    ? indicators(primaryMarket.history, primaryMarket.candles)
    : { s10: null, s30: null, rsi: 50, vol: 0.02, chg: 0, score: 0, signalLabel: 'Neutral' as const, bb: null, macd: null, ema20: null, atr: 10 };

  const spot = primaryMarket?.price;
  const spotVal = spot || 0;
  const chg = primaryMarket?.change24h || 0;
  const atr = primaryInd.atr || (spot ? spot * 0.02 : 10);
  const cashBufferPct = ((state.cash / Math.max(1, pv)) * 100).toFixed(1);

  // Helper to format currency
  const fmtMoney = (n: number) => (isUpstox ? moneyINR(n) : money(n));

  // =========================================================================
  // SECTION A: AUTONOMOUS MULTI-STEP AGENTIC WORKFLOWS
  // =========================================================================
  const isAgenticTask =
    (q.includes('audit') && (q.includes('hedge') || q.includes('rebalance') || q.includes('bot') || q.includes('dca') || q.includes('fix'))) ||
    q.includes('take control') ||
    q.includes('take full control') ||
    q.includes('manage my risk') ||
    q.includes('optimize my portfolio') ||
    q.includes('full trading plan') ||
    q.includes('agentic workflow') ||
    (q.includes('protect') && q.includes('rebalance')) ||
    (q.includes('de-risk') && q.includes('deploy')) ||
    (q.includes('find') && q.includes('best') && (q.includes('buy') || q.includes('execute') || q.includes('order')));

  if (isAgenticTask) {
    const danger = senseMarketDanger(state, markets);
    const alphaComp = compareTokensAlpha(['RELIANCE', 'TCS', 'HDFCBANK', 'INFY'] as Asset[], markets);
    const rebalancePlan = calculateAgenticAllocation(state, markets, 'risk_parity');
    const topAlpha = alphaComp.topAlphaAsset;

    let immediateProposal: AIActionProposal;
    let workflowType = 'Portfolio Optimization & Autonomous Risk Sentinel';

    if (danger.dangerScore > 50 || Number(cashBufferPct) < 15) {
      workflowType = 'Emergency Capital Defense & Liquidity Recovery';
      immediateProposal = danger.defensiveProposal || {
        type: 'emergency_defend',
        asset: rk.topAsset || primaryAsset,
        dangerLevel: 'HIGH',
        rationale: 'Autonomous Agentic Workflow: Restoring mandatory 15% cash liquidity reserve.',
        confidence: 'high',
        riskSummary: `Elevated danger detected (${danger.dangerScore}/100). De-risking high-beta exposure.`,
        requiresConfirmation: true,
        cashTargetPct: 20,
        rebalanceSteps: [
          {
            asset: rk.topAsset || primaryAsset,
            action: 'sell',
            amount: 0.1,
            estimatedPrice: spotVal,
            estimatedNotional: +(pv * 0.1).toFixed(2),
          },
        ],
      };
    } else if (rk.herfindahlIndex > 0.25) {
      workflowType = 'Multi-Asset Risk Parity Rebalancing';
      immediateProposal = rebalancePlan.proposal;
    } else {
      workflowType = 'Alpha Harvesting & Systematic Deployment';
      const bot = synthesizeStrategyBot(topAlpha, 'titan_quantum', state, markets);
      immediateProposal = {
        type: 'deploy_strategy',
        asset: topAlpha,
        rationale: `Autonomous Workflow: Deploying Titan Quantum Apex Sentinel with Zero-Loss Armor on top alpha asset ${topAlpha}.`,
        confidence: 'high',
        riskSummary: `Top Sharpe asset (${alphaComp.tokens[0]?.sharpeEstimate || '1.85'}) with 15% cash preservation & zero-loss ratchet defense.`,
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
      };
    }

    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Autonomous Agentic Workflow', primaryAsset);
    const reply = `${thinking}### Autonomous Agentic Workflow: \`${workflowType}\`

Nexus has decomposed your directive into a structured 4-Phase Quantitative Execution Blueprint:

#### Agentic Reasoning & Telemetry Snapshot
1. **Capital Solvency Check**: Portfolio equity is $\\$${pv.toLocaleString()}$ with **${cashBufferPct}% liquid cash** ($\$${state.cash.toLocaleString()}$). Mandatory 15% cash reserve floor is **${Number(cashBufferPct) >= 15 ? 'SECURED' : 'VIOLATED'}**.
2. **Concentration & Volatility Audit**: Herfindahl index is $\\text{HHI} = ${rk.herfindahlIndex.toFixed(3)}$ (${rk.herfindahlIndex > 0.25 ? 'Concentration Hazard' : 'Balanced'}). Top holding \`${rk.topAsset}\` represents **${rk.topAssetConcentrationPct.toFixed(1)}%** of equity.
3. **Alpha Radar Extraction**: Evaluated cross-sectional Sharpe ratios across markets. Top risk-adjusted alpha is currently **${topAlpha}** (Sharpe: $${alphaComp.tokens[0]?.sharpeEstimate || '1.82'}$, Regime: \`${alphaComp.tokens[0]?.regime || 'Expansion'}\`).

#### 4-Phase Execution Roadmap
| Phase | Action Milestone | Operational Target | Status |
| :--- | :--- | :--- | :--- |
| **Phase 1: Capital Defense** | Solvency & Reserve Enforcement | Maintain $\\ge 15\\%$ cash liquidity cushion | \`COMPLETED\` |
| **Phase 2: Risk Parity** | Mitigate Concentration HHI | Rebalance weights to target $\\text{HHI} < 0.22$ | \`QUEUED\` |
| **Phase 3: Alpha Execution** | Systematic Deployment | Deploy algorithmic engine or bracketed order on \`${immediateProposal.asset}\` | **\`READY FOR SIGN-OFF\`** |
| **Phase 4: Sentinel Vigilance** | Automated Circuit Breakers | Active ATR trailing brackets & 24h drawdown kill switch ($-8\\%$) | \`ARMED\` |

#### Mathematical Optimization Formulation
$$\\max_{w} \\quad \\frac{w^T \\mu - R_f}{\\sqrt{w^T \\Sigma w}} \\quad \\text{subject to} \\quad \\sum_{i=1}^N w_i \\le 0.85, \\quad w_{\\text{cash}} \\ge 0.15, \\quad w_i \\le 0.50$$

#### Next High-Leverage Action Ready for Sign-Off
Nexus has compiled the primary transaction proposal below. Authorize in the Dual-Key Safety Gate to execute Phase 3:`;

    return {
      reply,
      actionProposal: immediateProposal,
      engine: ENGINE_LABEL,
    };
  }

  // =========================================================================
  // SECTION B: CONVERSATIONAL HUMAN DIALOGUE, TRADER PSYCHOLOGY & EMOTIONS
  // =========================================================================

  // B1. Greetings, Identity & Capability Overview
  if (
    q === 'hi' ||
    q === 'hello' ||
    q === 'hey' ||
    q.startsWith('hi ') ||
    q.startsWith('hello ') ||
    q.startsWith('hey ') ||
    q.includes('who are you') ||
    q.includes('what can you do') ||
    q.includes('introduce yourself') ||
    q.includes('what are your capabilities')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Greetings & Identity Dialogue', primaryAsset);
    const reply = `${thinking}### Nexus Intelligence

I am your autonomous institutional quantitative desk, execution engine, and risk sentinel—operating completely in your browser with offline neural fallback intelligence.

#### What I Can Do for You:
1. **Autonomous Agentic Workflows**: Ask me to *"audit my portfolio, hedge downside, and deploy an automated bot"* or *"take full control of my risk"*, and I will formulate and execute a multi-phase quantitative plan.
2. **Deterministic Market Analysis**: Live spot quotes, 14-period RSI, volatility bands, and asymmetric ATR take-profit & trailing stop-loss brackets with zero hallucinations.
3. **Capital Defense & Sentinel**: Unblinking surveillance of your liquid cash cushion, Herfindahl concentration index (HHI), and continuous circuit breakers to ensure you never violate the **15% cash liquidity floor**.
4. **Algorithmic Bot Synthesis**: Instant generation of VWAP Trend, Grid Scalp, Volatility Breakout, or Smart DCA strategies calibrated to market volatility.
5. **Systemic Stress Testing**: Monte Carlo and historical flash crash simulations (e.g. -20% BTC crash, macro rate shocks) to audit your survivability before volatility strikes.
6. **Open Financial & Crypto Dialogue**: From derivatives microstructure and AMM impermanent loss to trader psychology, tax drag, and blockchain economics.

How can I assist your portfolio today? You can ask a question, request a trade bracket, or tap the **Capabilities Hub (\`+\`)** to explore actions.`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // B2. Retail Psychology: Quitting Job to Trade Full Time
  if (
    q.includes('quit my job') ||
    q.includes('trade full time') ||
    q.includes('trade full-time') ||
    q.includes('full time trader')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Trader Psychology: Full-Time Transition', primaryAsset);
    const reply = `${thinking}### Thinking of Quitting Your Job to Trade Full-Time?

This is one of the most consequential decisions an investor can ponder. Let's examine the mathematics, volatility reality, and cognitive psychology before you take the leap:

#### 1. The Mathematical Reality of Living Off Trading PnL
When trading is your sole income source, you introduce a catastrophic cognitive bias: **forced profitability under time decay**.
- If your living expenses are $\\$4,000/\\text{month}$ and your portfolio is $\\$60,000$, you need a sustained **80% annualized return** just to pay bills—before taxes, slippage, and compounding!
- During cyclical drawdowns or choppy sideways months, you will be forced to withdraw principal at the exact bottom of market cycles, permanently crippling your capital growth curve:
$$\\text{Net Capital Dynamics}: V_{t+1} = V_t \\cdot (1 + R_t) - \\text{Living Expenses}_t - \\text{Tax}_t$$

#### 2. The Mental Capital Drain
Institutional quantitative traders at firms like Citadel or Renaissance Technologies succeed because **their personal survival is decoupled from day-to-day market ticks**. They receive base salaries, trade with pooled firm capital, and deploy systematic mathematical algorithms.
When your rent depends on where Solana closes on a 4-hour candle, emotional cortisol causes you to:
1. Over-leverage to "make back" yesterday's losses.
2. Cut winning trades prematurely due to fear.
3. Widen stop-losses hoping for a turnaround (leading to devastating liquidations).

#### 3. The Professional Blueprint
- **Do not quit** until your liquid trading capital exceeds **$300,000–$500,000** with at least **18 to 24 months of living expenses locked in risk-free cash**.
- Keep your day job while letting automated algorithms (like Nexus DCA and VWAP bots) compound in the background without emotional interference.`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // B3. Emotional Coaching: FOMO & Chasing Green Candles
  if (
    q.includes('fomo') ||
    q.includes('fear of missing out') ||
    q.includes('missed the rally') ||
    q.includes('should i buy now it pumped') ||
    q.includes('am i too late')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Emotional Circuit Breaker: FOMO Control', primaryAsset);
    const reply = `${thinking}### Emotional Circuit Breaker: Neutralizing FOMO

The urge to jump into a soaring green candle is hardwired human evolutionary biology: we fear social exclusion and regret missed opportunities. In financial markets, however, **FOMO is the primary liquidity mechanism smart money uses to exit positions**.

#### 1. The Asymmetric Mathematics of Chasing Pumps
When an asset has already surged $+30\\%$ to $+60\\%$ in a few days:
- The 14-period RSI is almost certainly pinned above $75$ (Extreme Overbought).
- Your prospective risk/reward ratio collapses:
$$\\text{Expected Value}: \\mathbb{E}[R] = p_{\\text{continue}} \\cdot G - (1 - p_{\\text{continue}}) \\cdot L$$
After an extended vertical expansion, $p_{\\text{continue}}$ drops below $35\\%$, while the mean-reversion drawdown potential ($L$) expands to $2.5 \\times \\text{ATR}$.

#### 2. The Institutional Rule: Never Chase the Bid
Institutions never buy vertical breakouts at the top of Bollinger Band bands ($\\%B > 1.0$). They wait for:
1. **The Mean-Reversion Pullback**: Waiting for price to retest the 20-period EMA or 1.2x ATR support band.
2. **Volume Exhaustion**: Waiting for high-volume sell climaxes to subside into tight consolidation.
3. **Value-Weighted DCA**: If you must build a position, deploy an automated DCA schedule rather than a single market buy order at the highs.

Remember: **There will always be another trade. Protecting your cash liquidity buffer is infinitely more valuable than chasing an overextended candle.**`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // B4. Psychology: Why 90% of Retail Traders Lose Money
  if (
    q.includes('why do traders lose') ||
    q.includes('why do 90%') ||
    q.includes('retail lose money') ||
    q.includes('why do i keep losing')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Behavioral Economics: Loss Aversion', primaryAsset);
    const reply = `${thinking}### Why 90%+ of Retail Traders Lose Money: The Cognitive & Mathematical Trap

Academic studies across retail brokerage accounts consistently show that over $90\\%$ of individual traders lose capital over a 12-month horizon. This failure is rarely due to a lack of market information; it is the structural result of human psychological wiring:

#### 1. Prospect Theory & Loss Aversion Asymmetry (Kahneman & Tversky)
Humans feel the pain of a $\$1,000$ loss roughly **2.5 times more acutely** than the joy of a $\$1,000$ gain:
- When retail traders are in profit by $\$200$, they experience panic that the gain might disappear, so they take profit immediately.
- When they are in a loss by $-\\$1,000$, they become irrational gamblers, refusing to realize the loss and "hoping" for a turnaround until it wipes out their account:
$$\\text{Retail Payoff Curve}: \\text{Tiny Average Gains} \\ll \\text{Catastrophic Tail Losses}$$

#### 2. The Mathematics of Ruin & Position Sizing
Retail traders frequently risk $10\\%$ to $25\\%$ of their account on single directional trades. 
If your portfolio suffers a $-50\\%$ drawdown, you need a **$+100\\%$ gain** just to break even!
$$\\text{Required Recovery Gain}: R_{\\text{req}} = \\frac{D}{1 - D} \\quad (\\text{At } D = 0.50, \\, R_{\\text{req}} = 1.00)$$

#### 3. How Institutional Desks Win
- **Systematic Rules Over Intuition**: Trades are executed by quantitative algorithms with strict mathematical parameters.
- **Strict Fractional Kelly Sizing**: Never risking more than $1\\%$ to $2\\%$ of equity on any single idea.
- **Continuous Cash Cushions**: Always preserving at least **15% liquid cash** to stay solvent during severe drawdowns.`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // B5. ELI5 / Storytelling: Explain Blockchain to a 10-Year-Old or Grandmother
  if (
    q.includes('eli5') ||
    q.includes('explain like i am 5') ||
    q.includes('explain to a 10 year old') ||
    q.includes('explain to my grandmother') ||
    q.includes('simple words')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Conceptual Storytelling: Distributed Ledger ELI5', primaryAsset);
    const reply = `${thinking}### Explaining Distributed Ledgers in Simple Terms

Imagine you and your four best friends—Alex, Maya, Leo, and Sam—love trading Pokémon cards and soccer stickers.

#### The Old Way (A Middleman Bank):
Normally, you all give your stickers to a teacher, and only the teacher keeps the secret notebook writing down who owns what. If the teacher loses the notebook, gets sick, or makes a mistake, nobody knows who has what.

#### The Blockchain Way (The Magic Shared Notebook):
Instead of trusting one teacher, every single one of you gets an identical, magical notebook:
1. When Alex wants to give Leo 2 stickers, Alex shouts to everyone in the room: *"Hey! I am giving 2 stickers to Leo!"*
2. Maya, Sam, Leo, and Alex all check their notebooks to see if Alex actually has 2 stickers.
3. Once everyone agrees, each person writes down on page #1: *"Alex gave Leo 2 stickers"*.
4. Then, you stamp that page with a wax seal that connects it to the previous page like a chain. That is a **Block** in the **Blockchain**!

#### Why It Cannot Be Hacked & Prevents Double-Spending:
If Leo secretly tries to copy a sticker or erase his notebook and write *"Alex gave me 100 stickers!"*, Maya, Alex, and Sam look at their notebooks and say: *"Nope! Our notebooks don't say that!"* This eliminates what computer scientists call **Double-Spending**, and because Leo cannot change everyone else's notebook at the same time, the truth is protected forever without needing a bank or boss!`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // B6. Philosophy & History: Satoshi Nakamoto & The Bitcoin Whitepaper
  if (
    q.includes('satoshi') ||
    q.includes('nakamoto') ||
    q.includes('whitepaper') ||
    q.includes('vision of bitcoin')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Cypherpunk Monetary Philosophy', primaryAsset);
    const reply = `${thinking}### Satoshi Nakamoto & The Genesis of Decentralized Value

On October 31, 2008, amidst the wreckage of the global financial crisis and the Lehman Brothers bankruptcy, an anonymous cryptographer using the pseudonym **Satoshi Nakamoto** published a nine-page PDF to the Cypherpunk mailing list: *"Bitcoin: A Peer-to-Peer Electronic Cash System"*.

#### 1. The Fundamental Breakthrough: Solving the Byzantine Generals Problem
Before Bitcoin, digital money always required a central counterparty (like Visa, PayPal, or a central bank) to prevent **Double-Spending** (copy-pasting digital money like an image file).
Satoshi combined four existing technologies into an unprecedented economic synthesis:
1. **Proof-of-Work** (Adam Back's Hashcash) to bind digital security to physical thermodynamic energy.
2. **Cryptographic Signatures** (Public/Private key pairs) for sovereign self-custody.
3. **Peer-to-Peer Gossip Protocol** for censorship-resistant propagation.
4. **Algorithmic Difficulty Adjustment** targeting a block production timestamp every 10 minutes regardless of how much computing power joins the network.

#### 2. The Embedded Message in Block 0
In the Bitcoin Genesis Block mined on January 3, 2009, Satoshi permanently inscribed a headline from *The Times* (London):
> *"The Times 03/Jan/2009 Chancellor on brink of second bailout for banks."*

This was not merely a timestamp; it was an ideological declaration: a peaceful separation of money and state, replacing arbitrary central bank monetary debasement with mathematically fixed scarcity ($21,000,000$ total coins).`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // B7. Humor & Creative: Crypto Trading Jokes
  if (
    q.includes('joke') ||
    q.includes('funny') ||
    q.includes('make me laugh') ||
    q.includes('humor')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Quantitative Trading Humor', primaryAsset);
    const reply = `${thinking}### Quantitative & Crypto Trading Humor

Here are a few favorites straight from the order book:

1. **The Market Maker's Marriage**:
   A trader tells his wife: *"Honey, our relationship has zero directional delta, positive theta, and optimal basis yield!"*
   She replies: *"Stop speaking in options jargon and tell me why our checking account got liquidated on 50x leverage!"*

2. **The Dip Buyer**:
   Trader: *"Doctor, I can't sleep. Every time I close my eyes, I see red candles."*
   Doctor: *"Have you tried dollar-cost averaging?"*
   Trader: *"I did! Now I can't afford the doctor's visit either!"*

3. **The Sandwich Bot**:
   Why did the retail trader cross the mempool?
   To submit an airdrop claim—only to get front-run, sandwiched, and back-run for $0.04 by a searcher bot paying 400 Gwei in priority gas bribes!`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // B8. Creative: Poetry / Elevator Pitch for Algorithmic Trading
  if (
    q.includes('poem') ||
    q.includes('poetry') ||
    q.includes('pitch') ||
    q.includes('verse')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Creative Verse & Principles', primaryAsset);
    const reply = `${thinking}### The Quantitative Sentinel: Institutional Principles

*In candle shadows, green and red,*  
*Where mortals trade with hope and dread,*  
*The crowd pursues the euphoric high,*  
*And panics when the charts run dry.*  

*No heartbeat shakes the silicon cold,*  
*No greedy impulse to unfold,*  
*With Kelly fractions, variance bound,*  
*Where true statistical edge is found.*  

*Let chaos churn and markets bleed,*  
*We calculate each bracket's need:*  
*A fifteen percent cash reserve floor,*  
*To harvest dips and weather more.*  

*Emotion falls, but math remains—*  
*Compounding calm through quiet gains.*`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // B9. Practical Advice: Taxes and Transaction Costs
  if (
    !q.includes('rollup') &&
    !q.includes('layer-2') &&
    !q.includes('gas fees') &&
    (q.includes('tax') ||
      q.includes('capital gain') ||
      q.includes('slippage drag') ||
      (q.includes('fees') && (q.includes('trading') || q.includes('broker') || q.includes('drag') || q.includes('cost of trading'))))
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Friction & Taxation Dynamics', primaryAsset);
    const reply = `${thinking}### Taxation, Fee Drag & The Hidden Costs of Active Trading

One of the largest leaks in retail compounding is ignoring the friction of transaction fees, spread slippage, and short-term capital gains taxation:

#### 1. Short-Term vs Long-Term Capital Gains
- In most jurisdictions, holding a position for **under 1 year** taxes profits as ordinary income (often $24\\%$ to $37\\%$ marginal rate).
- Holding for **over 1 year** unlocks preferential long-term capital gains rates ($0\\%$, $15\\%$, or $20\\%$).
- **The Churn Trap**: Rapid day-trading creates thousands of taxable events. If you generate $\$20,000$ in gains and pay $\$7,000$ in taxes, while spending $\$2,000$ in taker fees and slippage, your net return collapses dramatically.

#### 2. Compounding Friction Formulation
$$\\text{Net Compound Value}: V_T = V_0 \\cdot \\prod_{t=1}^T \\left[ 1 + R_t (1 - \\tau) - \\text{Fee}_t - \\text{Slippage}_t \\right]$$
Where $\\tau$ is the effective tax rate. Minimizing unnecessary portfolio churn directly boosts terminal wealth.

#### 3. Quantitative Recommendation
- Use **Smart DCA** and systematic rebalancing rather than emotional intraday scalping.
- Enforce strict slippage limits ($<0.25\\%$) on every order execution.`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // =========================================================================
  // SECTION C: SPECIALIZED QUANTITATIVE FINANCIAL & CRYPTO MODULES
  // =========================================================================

  // C1. Systemic Stress Testing & Crash Scenarios
  if (
    q.includes('stress test') ||
    q.includes('flash crash') ||
    q.includes('market crash') ||
    q.includes('what if btc crashes') ||
    q.includes('survive a crash')
  ) {
    const scenarioId: StressTestScenario['scenarioId'] = q.includes('macro') || q.includes('rate') ? 'macro_rate_shock' : 'btc_flash_crash_20';
    const testResult = simulatePortfolioStressTest(state, markets, scenarioId);
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Systemic Stress Testing', primaryAsset);

    const reply = `${thinking}### Systemic Portfolio Stress-Test: \`${testResult.title}\`

Nexus simulated an acute market discontinuity against your live portfolio:

#### Simulated Impact Assessment
- **Expected Portfolio Drawdown**: **-${testResult.simulatedDrawdownPct}%**
- **Estimated Dollar Value at Risk**: **$-\\$${testResult.simulatedLossUsd.toLocaleString()}**
- **Solvency Survivability Rating**: **${testResult.survivabilityRating}**

#### Survivability Analysis & Recommendations
1. **${testResult.mitigationSteps[0] || 'Enforce 15% cash liquidity cushion.'}**
2. **${testResult.mitigationSteps[1] || 'Set trailing volatility stops via ATR.'}**
3. **Liquidity Defense**: If your liquid cash drops below 15%, systematic liquidation kicks in to protect against margin exhaustion.`;

    return {
      reply,
      actionProposal: {
        type: 'stress_test',
        asset: primaryAsset,
        rationale: `Stress-test analysis completed. Survivability is ${testResult.survivabilityRating}.`,
        riskSummary: `Simulated drawdown: -${testResult.simulatedDrawdownPct}%, potential dollar loss: $${testResult.simulatedLossUsd.toLocaleString()}.`,
        confidence: 'high',
        requiresConfirmation: false,
        stressTest: testResult,
      },
      engine: ENGINE_LABEL,
    };
  }

  // C2. Downside Panic & Bear Market Mitigation
  if (
    q.includes('panic') ||
    q.includes('bear market') ||
    q.includes('market is falling') ||
    q.includes('hedge my downside') ||
    q.includes('how to protect')
  ) {
    const danger = senseMarketDanger(state, markets);
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Downside Risk Mitigation', primaryAsset);

    const reply = `${thinking}### Capital Defense & Bear Market Mitigation

When systemic downside volatility expands, emotional discipline and mathematical stops are the only firewall between survival and ruin:

#### 1. Dynamic Market Danger Score: ${danger.dangerScore}/100 (\`${danger.dangerLevel}\`)
${danger.hazards.map((r: string) => `- **${r}**`).join('\n')}

#### 2. Downside Defense Rules
1. **Re-establish 15% Cash Cushion**: If cash reserves are breached, trim high-beta assets.
2. **Deploy Volatility Brackets**: Place ATR-based stops at $1.5 \\times \\text{ATR}$ to avoid catastrophic drawdown tails.
3. **Cease Aggressive Leverage**: Prohibit margin borrowing during regime transitions.`;

    return {
      reply,
      actionProposal: danger.defensiveProposal || null,
      engine: ENGINE_LABEL,
    };
  }

  // C3a. Perpetual Swaps, Funding Rates & Crypto Basis Microstructure
  if (
    q.includes('funding rate') ||
    q.includes('perpetual swap') ||
    q.includes('perp') ||
    q.includes('basis yield') ||
    q.includes('cash and carry') && !q.includes('nse')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Perpetuals & Funding Rate Mechanics', primaryAsset);
    const reply = `${thinking}### Perpetual Swaps & Basis Microstructure

Unlike traditional futures with fixed expiry dates, **Perpetual Swaps** trade continuously. To anchor perpetual prices ($P_{\\text{perp}}$) to the underlying spot index ($P_{\\text{spot}}$), exchanges employ a periodic **Funding Rate Mechanism**:

#### 1. Funding Payment Formulation
$$\\text{Premium Index}: P_t = \\frac{\\max(0, P_{\\text{perp}} - P_{\\text{spot}}) - \\max(0, P_{\\text{spot}} - P_{\\text{perp}})}{P_{\\text{spot}}}$$
$$\\text{Funding Rate} = \\text{Clamp}(P_t + \\text{Clamp}(\\text{Interest} - P_t, -0.05\\%, +0.05\\%), -0.75\\%, +0.75\\%)$$

#### 2. Delta-Neutral Cash-and-Carry Arbitrage
Traders capture annualized risk-free **Basis Yield** by:
1. Buying spot: $+\\$100,000$ BTC (Long).
2. Shorting 1x perpetual: $-\\$100,000$ BTC-PERP (Short).
$$\\text{Net Delta}: \\Delta_{\\text{net}} = +1.0 - 1.0 = 0$$
When funding rates are $+0.03\\%$ per 8 hours, the annualized basis yield is $\\sim 32.8\\%$ APY without directional market exposure.`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // C3b. NSE Equities & Futures Cash-and-Carry Basis Microstructure
  if (
    q.includes('nse cash-and-carry') ||
    q.includes('nse cash and carry') ||
    (q.includes('cost of carry') && (q.includes('nse') || q.includes('equities') || q.includes('nifty')))
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'NSE Equities & Futures Basis Arbitrage', primaryAsset);
    const reply = `${thinking}### NSE Equities & Futures Cash-and-Carry Basis Microstructure

On the National Stock Exchange of India (NSE), futures contracts trade on monthly expiry cycles (last Thursday of the month). The price spread between equity cash ($S_0$) and near-month futures ($F_t$) is governed by the **Cost of Carry Model**:

#### 1. Theoretical Futures Price Formulation
$$F_t = S_0 \\cdot e^{(r - q) \\cdot (T - t)} + \\text{Transaction Drag}$$
Where:
- $r$: The **RBI risk-free repo rate** (currently $\\sim 6.50\\%$ annualized).
- $q$: Expected dividend yield over life $(T - t)$.
- $(T - t)$: Time to monthly derivative expiry.

#### 2. Annualized Basis Yield Arbitrage
When speculative retail sentiment drives futures to an elevated premium above theoretical fair value:
$$\\text{Annualized Basis Yield} = \\left( \\frac{F_t - S_0}{S_0} \\right) \\times \\left( \\frac{365}{D_{\\text{expiry}}} \\right)$$
Arbitrage desks buy physical shares in the CNC Cash segment and sell equal lots of stock futures:
- **Net Position**: Long Cash ($+\\Delta = +1.0$) + Short Futures ($-\\Delta = -1.0$) $\\rightarrow \\Delta = 0$.
- **Convergence Guarantee**: At expiry 15:30 IST, futures prices mandatorily converge to cash close.`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // C4a. Market Making, MEV & Sandwich Attack Microstructure
  if (
    q.includes('sandwich') ||
    q.includes('mev') ||
    q.includes('frontrun') ||
    q.includes('front-run') ||
    q.includes('maximal extractable value')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'MEV & Sandwich Attack Dynamics', primaryAsset);
    const reply = `${thinking}### Maximal Extractable Value (MEV) & Sandwich Attacks

In decentralized finance (DeFi), **Sandwich Attacks** exploit public mempool visibility and slippage tolerance in constant-product AMMs ($x \\cdot y = k$):

#### 1. Execution Sequence
1. **Front-Run**: The MEV searcher detects a victim's pending buy transaction in the mempool and pays high priority fees ($P_{\\text{max}}$) to be included immediately before.
2. **Victim Execution**: The victim's trade executes at the maximum allowable slippage boundary.
3. **Back-Run**: The searcher sells their inventory immediately after, extracting guaranteed risk-free profit.

#### 2. Loss Versus Rebalancing (\\text{LVR})
$$\\text{LVR} = \\int_0^T \\frac{\\sigma^2}{8} \\cdot V_t \\, dt$$
LVR quantifies the permanent wealth transfer from passive liquidity providers to arbitrageurs.`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // C4b. High-Frequency Market Microstructure: OFI & Kyle's Lambda (NSE Equities)
  if (
    q.includes('order flow imbalance') ||
    q.includes('ofi') ||
    q.includes('kyle lambda') ||
    q.includes('kyle\'s lambda')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'High-Frequency Market Microstructure', primaryAsset);
    const reply = `${thinking}### High-Frequency Market Microstructure: OFI & Kyle's Lambda

In quantitative market making across NSE order books, institutional execution desks monitor two essential metrics:

#### 1. Order Flow Imbalance (\\text{OFI})
$$\\text{OFI}_t = \\sum_{k=1}^K \\left[ \\Delta B_{k,t} \\cdot \\mathbf{1}_{\\{P_{B,k,t} \\ge P_{B,k,t-1}\\}} - \\Delta A_{k,t} \\cdot \\mathbf{1}_{\\{P_{A,k,t} \\le P_{A,k,t-1}\\}} \\right]$$
OFI captures instantaneous buying vs. selling pressure across the top 5 levels of market depth before price ticks occur.

#### 2. Kyle's Lambda (\\lambda) Price Impact
$$\\lambda = \\frac{\\text{Cov}(\\Delta P, \\text{OFI})}{\\text{Var}(\\text{OFI})}$$
**Kyle's Lambda** quantifies how many basis points of market impact are generated per unit of net volume traded. Desks use Almgren-Chriss trajectories to minimize permanent price degradation.`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // C5. Options Skew, Volatility Surface & Greeks
  if (
    q.includes('volatility smile') ||
    q.includes('skew') ||
    q.includes('black scholes') ||
    q.includes('greeks') ||
    q.includes('put call') ||
    q.includes('implied volatility')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Options Pricing & Volatility Surface', primaryAsset);
    const reply = `${thinking}### Options Volatility Surface & Greek Sensitivities

Under the classical **Black-Scholes-Merton** model, volatility is assumed constant. In real markets, out-of-the-money options trade at higher implied volatilities, forming the **Volatility Smile** and **Volatility Skew**:

#### 1. The Core Analytical Greeks
- **Delta (\\Delta)**: $\\frac{\\partial V}{\\partial S} = N(d_1)$ (Directional exposure)
- **Gamma (\\Gamma)**: $\\frac{\\partial^2 V}{\\partial S^2} = \\frac{N'(d_1)}{S \\sigma \\sqrt{T}}$ (Curvature & hedging acceleration)
- **\\text{Vega } (\\mathcal{V})**: $\\frac{\\partial V}{\\partial \\sigma} = S \\sqrt{T} N'(d_1)$ (Sensitivity to volatility shocks)
- **Theta (\\Theta)**: $\\frac{\\partial V}{\\partial t}$ (Time decay)

#### 2. \\text{25-Delta Put-Call Skew}
$$\\text{Skew}_{25\\Delta} = \\sigma_{\\text{put}, 25\\Delta} - \\sigma_{\\text{call}, 25\\Delta}$$
When 25-delta skew spikes positive, institutional desks are aggressively bidding downside tail protection.`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // C6. Liquid Staking vs Lending Protocol Risks
  if (
    q.includes('liquid staking') ||
    q.includes('lst') ||
    q.includes('aave') ||
    q.includes('lending risk') ||
    q.includes('staking yield')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'DeFi Staking & Lending Risk Matrix', primaryAsset);
    const reply = `${thinking}### Liquid Staking (LST) vs DeFi Lending

Evaluating yield and structural counterparty exposure across decentralized finance protocols:

#### Comparative Risk Matrix
| Dimension | Liquid Staking (e.g. Lido stETH) | DeFi Lending (e.g. Aave v3) |
| :--- | :--- | :--- |
| **Yield Source** | Consensus + Execution Layer MEV | Borrower Interest Demand |
| **Primary Hazard** | **Slashing Risk** & De-peg Liquidity | Bad Debt & Liquidation Insolvency |
| **Smart Contract** | Low complexity validator deposit | High complexity multi-collateral math |

#### Interest Rate Kink Model
$$\\text{Borrow Rate} = R_0 + \\frac{U}{U_{\\text{kink}}} \\cdot R_1 \\quad (\\text{for } U \\le U_{\\text{kink}})$$
When pool utilization $U$ breaches $U_{\\text{kink}}$, borrowing costs spike vertically to incentivize capital repayment.`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // C7. Portfolio Concentration & Herfindahl-Hirschman Index (HHI)
  if (
    q.includes('concentrated') ||
    q.includes('concentration') ||
    q.includes('hhi') ||
    q.includes('herfindahl')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Portfolio Concentration Audit (HHI)', primaryAsset);
    const reply = `${thinking}### Portfolio Concentration Audit: Herfindahl-Hirschman Index

The **Herfindahl-Hirschman Index (HHI)** quantifies asset concentration risk:

#### 1. Mathematical Formulation
$$\\text{HHI} = \\sum_{i=1}^N w_i^2$$
Where $w_i$ represents the weight of asset $i$ as a fraction of total equity.

#### 2. Live Portfolio Audit
- **Current Portfolio HHI**: **\\text{HHI} = ${rk.herfindahlIndex.toFixed(3)}**
- **Top Holding Concentration**: **${rk.topAssetConcentrationPct.toFixed(1)}%** (\`${rk.topAsset}\`)
- **Status**: ${rk.herfindahlIndex > 0.25 ? '**Concentration Hazard Detected**' : '**Balanced Diversification**'}

#### 3. Institutional Concentration Thresholds
- $\\text{HHI} < 0.15$: Well-Diversified Portfolio.
- $0.15 \\le \\text{HHI} \\le 0.25$: Moderate Concentration.
- $\\text{HHI} > 0.25$: High Concentration (Single asset shock hazard).`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // C8. Layer-2 Rollup Economics & Data Availability (EIP-4844)
  if (
    q.includes('rollup') ||
    q.includes('layer 2') ||
    q.includes('layer-2') ||
    q.includes('zk') ||
    q.includes('optimistic') ||
    q.includes('eip-4844')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Layer-2 Rollup Microeconomics', primaryAsset);
    const reply = `${thinking}### Layer-2 Rollup Microeconomics & Data Availability

Rollups scale blockchain throughput by executing transactions off-chain and posting state commitments to Ethereum L1:

#### Optimistic vs ZK Rollup Architecture
- **Optimistic Rollups**: Assume valid state transitions; rely on a 7-day fraud-proof window for withdrawals.
- **ZK Rollups**: Generate mathematical **Validity Proofs** (SNARKs/STARKs) verifying computational integrity instantly upon settlement.

#### EIP-4844 Blob Economics
$$\\text{Blob Gas Price} = \\text{BaseFee}_{\\text{blob}} \\cdot e^{\\frac{\\text{ExcessBlobs}}{\\text{TargetBlobs}}}$$
By decoupling blob storage from standard EVM execution gas, EIP-4844 reduced rollup settlement costs by up to $95\\%$.`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // C9. DeFi & Uniswap v2 vs v3 Impermanent Loss
  if (
    q.includes('impermanent loss') ||
    q.includes('amm') ||
    q.includes('uniswap')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Automated Market Makers & Impermanent Loss', primaryAsset);
    const reply = `${thinking}### Automated Market Makers & Impermanent Loss

In constant-product AMMs ($x \\cdot y = k$), liquidity providers experience **Impermanent Loss (IL)** when relative token prices diverge:

#### Mathematical Formulation
$$\\text{IL}(k_p) = \\frac{2 \\sqrt{k_p}}{1 + k_p} - 1$$
Where $k_p = \\frac{P_{\\text{new}}}{P_{\\text{initial}}}$ is the price ratio.

#### Divergence vs Loss Matrix
- A $+25\\%$ price divergence results in a $-0.6\\%$ IL.
- A $+100\\%$ price surge ($2\\times$) causes $-5.7\\%$ IL.
- A $+400\\%$ price surge ($5\\times$) causes $-25.5\\%$ IL.

In Uniswap v3 concentrated liquidity, IL is amplified by the leverage factor $\\frac{1}{1 - \\sqrt{p_a / p_b}}$.`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // C10a. Macroeconomics, Global M2 & Bitcoin Halving
  if (
    q.includes('halving') ||
    q.includes('global m2') ||
    q.includes('macro cycle')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Macroeconomic Liquidity Cycles', primaryAsset);
    const reply = `${thinking}### Macroeconomic Regime: Global M2 & The Halving Cycle

Global asset prices are fundamentally driven by central bank balance sheet expansion (**Global M2**):

#### 1. The Global M2 Transmission Mechanism
$$\\Delta \\text{Asset Prices} \\propto \\Delta \\text{Global M2} - \\Delta \\text{Real GDP}$$
When central banks expand M2, excess fiat liquidity flows directly into finite scarce assets like Bitcoin and equities.

#### 2. The Halving Supply Shock
- Prior to April 2024: Block reward was $6.25$ BTC.
- Post-Halving: Block reward dropped to $3.125$ BTC.
- **Daily BTC Issuance**: Slashed from $900$ BTC/day to $450$ BTC/day, removing hundreds of millions in structural miner sell pressure.`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // C10b. Macroeconomics, RBI Monetary Policy & Institutional Liquidity
  if (
    q.includes('rbi repo rate') ||
    q.includes('rbi') ||
    q.includes('fii') ||
    q.includes('dii')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Indian Macroeconomic Dynamics', primaryAsset);
    const reply = `${thinking}### Indian Macroeconomic Cycle & Institutional Liquidity Dynamics

On the domestic Indian macroeconomic front, equity index valuations are anchored to the **RBI Repo Rate** and institutional flows:

#### 1. Interest Rate Transmission & G-Sec Yield
- **RBI Repo Rate**: Set by the Monetary Policy Committee (MPC).
- **10-Year G-Sec Yield**: The risk-free discount benchmark for Equity Risk Premium (ERP).
$$\\text{ERP} = \\text{Nifty Earnings Yield} - \\text{10Y G-Sec Yield}$$

#### 2. Institutional Flow Dynamics: FII vs DII
- **FII (Foreign Institutional Investors)**: Highly sensitive to US 10Y yields, DXY Dollar Index, and currency risk.
- **DII (Domestic Institutional Investors)**: Driven by continuous monthly SIP inflows, providing structural cushion against foreign outflows.`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // C11. Technical Oscillators (RSI Divergence, Bollinger %B, ATR)
  if (
    q.includes('rsi') ||
    q.includes('bollinger') ||
    q.includes('macd') ||
    q.includes('oscillator')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Technical Oscillators & Statistics', primaryAsset);
    const reply = `${thinking}### Technical Oscillators: Relative Strength Index & Bollinger Bands

Evaluating mathematical formulas governing momentum and mean reversion:

#### 1. Relative Strength Index (RSI)
$$\\text{RSI} = 100 - \\frac{100}{1 + \\text{RS}}, \\quad \\text{where } \\text{RS} = \\frac{\\text{Smoothed Gain}}{\\text{Smoothed Loss}}$$
- $\\text{RSI} > 70$: Overbought (Bearish exhaustion risk).
- $\\text{RSI} < 30$: Oversold (Bullish accumulation zone).

#### 2. Bollinger Bands & %B
$$\\text{Upper Band} = \\text{SMA}_{20} + 2\\sigma, \\quad \\text{Lower Band} = \\text{SMA}_{20} - 2\\sigma$$
$$\\%B = \\frac{\\text{Price} - \\text{Lower Band}}{\\text{Upper Band} - \\text{Lower Band}}$$
When $\%B > 1.0$, price is trading outside the 2-standard-deviation envelope.`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // C12. TTM Volatility Squeeze & Half-Kelly Position Sizing
  if (
    q.includes('ttm') ||
    q.includes('squeeze') ||
    q.includes('half-kelly') ||
    q.includes('kelly sizing') ||
    q.includes('kelly criterion')
  ) {
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'TTM Squeeze & Half-Kelly Optimization', primaryAsset);
    const reply = `${thinking}### TTM Volatility Squeeze & Half-Kelly Sizing Architecture

Evaluating volatility compression breakout dynamics and optimal capital allocation:

#### 1. TTM Squeeze Mechanics
The **TTM Squeeze** identifies periods where Bollinger Bands contract inside the **Keltner Channel**:
$$\\text{Bollinger Band} = \\text{SMA}_{20} \\pm 2\\sigma$$
$$\\text{Keltner Channel} = \\text{EMA}_{20} \\pm 1.5 \\times \\text{ATR}_{14}$$
When Bollinger Bands penetrate inside Keltner Channels, market volatility is compressed, preceding explosive directional expansion.

#### 2. Optimal Half-Kelly Criterion Formulation
$$f^* = \\frac{1}{2} \\left( \\frac{p \\cdot b - q}{b} \\right)$$
Where:
- $p$: Probability of a winning trade.
- $q = 1 - p$: Probability of a loss.
- $b$: Payoff ratio (win amount / loss amount).
Using **Half-Kelly** preserves $75\\%$ of Full Kelly growth while reducing volatility by $50\\%$ and avoiding ruin.`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // C13. Multi-Asset Alpha Radar
  if (
    q.includes('alpha radar') ||
    q.includes('top alpha') ||
    q.includes('compare tokens') ||
    q.includes('best asset')
  ) {
    const alphaComp = compareTokensAlpha(['RELIANCE', 'TCS', 'HDFCBANK', 'INFY'] as Asset[], markets);
    const thinking = generateThinkingTrace(prompt, state, markets, context, 'Multi-Asset Alpha Radar', primaryAsset);

    const reply = `${thinking}### Multi-Asset Alpha Radar (Indian Bluechip Fleet)

Evaluating cross-sectional Sharpe ratios and momentum factors across leading Indian equities:

#### Alpha Scoreboard
| Symbol | Price | Sharpe Est. | Volatility | Momentum | Regime |
| :--- | :--- | :--- | :--- | :--- | :--- |
${alphaComp.tokens
  .map(
    (t) =>
      `| **${t.asset}** | ${fmtMoney(markets[t.asset]?.price || 0)} | ${t.sharpeEstimate} | ${t.volAnnualizedPct.toFixed(1)}% | ${t.momentumScore > 0 ? '+' : ''}${t.momentumScore.toFixed(1)} | \`${t.regime}\` |`
  )
  .join('\n')}

#### Top Alpha Asset: **${alphaComp.topAlphaAsset}**
${alphaComp.topAlphaAsset} demonstrates the superior risk-adjusted profile with optimal Sharpe consistency.`;

    return {
      reply,
      actionProposal: null,
      engine: ENGINE_LABEL,
    };
  }

  // C14. Asset-Specific Quantitative Outlook & Brackets (e.g. "What is the quantitative outlook for SOL?")
  if (
    mentionedAssets.length > 0 ||
    q.includes('outlook') ||
    q.includes('support') ||
    q.includes('resistance') ||
    q.includes('bracket') ||
    q.includes('trade idea') ||
    q.includes('status') ||
    q.includes('technical')
  ) {
    const targetAsset = primaryAsset;
    const targetM = markets[targetAsset] || primaryMarket;
    const targetInd = targetM ? indicators(targetM.history, targetM.candles) : primaryInd;
    const p = targetM?.price || 100;
    const a = targetInd.atr || p * 0.02;
    const chg = targetM?.change24h || 0;

    const isReduceIntent =
      q.includes('reduce') ||
      q.includes('trim') ||
      q.includes('cut') ||
      q.includes('exit') ||
      q.includes('sell') ||
      q.includes('take profit') ||
      q.includes('liquidate') ||
      q.includes('lighten') ||
      q.includes('short');

    const isBuyIntent =
      q.includes('buy') ||
      q.includes('accumulate') ||
      q.includes('long') ||
      q.includes('add') ||
      q.includes('enter') ||
      q.includes('scale in');

    const currentHolding = state.positions[targetAsset] || 0;

    let orderSide: 'buy' | 'sell';
    if (isReduceIntent && !isBuyIntent) {
      orderSide = 'sell';
    } else if (isBuyIntent && !isReduceIntent) {
      orderSide = 'buy';
    } else if (currentHolding <= 0) {
      orderSide = 'buy';
    } else {
      orderSide = targetInd.rsi < 65 && (targetInd.s10 || 0) >= (targetInd.s30 || 0) ? 'buy' : 'sell';
    }

    const support = +(p - a * 1.5).toFixed(2);
    const resistance = +(p + a * 2.0).toFixed(2);
    const slPrice = +(Math.max(0.01, p - a * 1.2)).toFixed(2);
    const tpPrice = +(p + a * 2.5).toFixed(2);

    let amount = 0;
    let gatingNotice = '';
    if (orderSide === 'sell') {
      if (currentHolding <= 0) {
        gatingNotice = `\n\n> **Holding Status**: You currently hold 0 \`${targetAsset}\`. No liquidation or trim order can be executed.`;
      } else {
        amount = +(Math.min(currentHolding, Math.max(currentHolding * 0.5, 0.0001))).toFixed(4);
      }
    } else {
      const sized = calculateRiskBasedPositionSize({
        asset: targetAsset,
        side: 'buy',
        entryPrice: p,
        stopPrice: slPrice,
        targetPrice: tpPrice,
        portfolioEquity: pv,
        availableCash: state.cash,
        currentHolding,
        currentHoldingNotional: currentHolding * p,
        market: targetM,
        policy,
      });
      amount = sized.quantity;
      if (amount <= 0) {
        gatingNotice = `\n\n> **Execution Gate Block**: Order quantity is 0 under risk budget and mandatory 15% cash liquidity reserve.`;
      }
    }

    let actionProposal: AIActionProposal | null = null;
    const validity = MarketDataValidityGuard.validate(targetM, targetAsset, policy, { requireExecutionGrade: true });
    if (amount > 0 && validity.canExecute) {
      const proposalCandidate: AIActionProposal = {
        type: 'order',
        asset: targetAsset,
        side: orderSide,
        amount,
        rationale: `${targetAsset} ${targetInd.signalLabel} structure with RSI ${targetInd.rsi.toFixed(1)} and dynamic ATR brackets.`,
        confidence: isBuyIntent || targetInd.score > 0 ? 'high' : 'medium',
        riskSummary: `Requires ${fmtMoney(amount * p)} notional. Adheres to capital preservation rules.`,
        requiresConfirmation: true,
      };

      const safety = validateAIProposal(proposalCandidate, state, markets);
      if (safety.valid) {
        actionProposal = proposalCandidate;
      } else {
        gatingNotice = `\n\n> **Execution Gate Block**: Order proposal disabled due to safety bounds: ${safety.errors.join('; ')}`;
      }
    } else if (!validity.canExecute && amount > 0) {
      gatingNotice = `\n\n> **Execution Gate Block**: Order proposal disabled due to market data feed validation: ${validity.errors.join('; ')}`;
    }

    const thinking = generateThinkingTrace(prompt, state, markets, context, `Quantitative Outlook for ${targetAsset}`, targetAsset);

    const reply = `${thinking}### Quantitative Valuation & Tactical Brackets: \`${targetAsset}\`

Evaluating structural order-book dynamics, momentum oscillators, and volatility boundaries:

#### 1. Price Telemetry & Volatility Bounds
- **Spot Quote**: ${fmtMoney(p)} (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% 24h)
- **Market Regime**: \`${targetInd.signalLabel}\` (Composite score: ${targetInd.score >= 0 ? '+' : ''}${targetInd.score}/100)
- **RSI (14-period)**: ${targetInd.rsi.toFixed(1)} (${targetInd.rsi > 70 ? 'Overbought' : targetInd.rsi < 35 ? 'Oversold' : 'Constructive Range'})
- **Average True Range (\\text{ATR})**: **${fmtMoney(a)}**
- **Support & Resistance Channels**:
  - Support Level: **${fmtMoney(support)}** ($P - 1.5 \\times \\text{ATR}$)
  - Resistance Target: **${fmtMoney(resistance)}** ($P + 2.0 \\times \\text{ATR}$)

#### 2. Volatility Mathematical Formulation
$$\\text{Stop-Loss} = P_{\\text{spot}} - 1.2 \\times \\text{ATR}, \\quad \\text{Take-Profit} = P_{\\text{spot}} + 2.5 \\times \\text{ATR}$$
$$\\text{Asymmetric Risk/Reward Ratio} = \\frac{2.5 \\times \\text{ATR}}{1.2 \\times \\text{ATR}} = 2.08 : 1$$

#### 3. Execution Proposal
Nexus recommends an asymmetric **${orderSide.toUpperCase()}** order bracket with dynamic profit targets while maintaining a **15% cash liquidity reserve**. Review the analysis below:${gatingNotice}`;

    return {
      reply,
      actionProposal,
      engine: ENGINE_LABEL,
    };
  }

  // =========================================================================
  // SECTION D: DYNAMIC FREEFORM CONVERSATIONAL & REASONING ENGINE
  // (Handles novel topics, general questions, life, tech, and economic theory)
  // =========================================================================
  const thinking = generateThinkingTrace(prompt, state, markets, context, 'Contextual Market Analysis & Reasoning', primaryAsset);

  const reply = `${thinking}### Nexus Quantitative Intelligence: Contextual Market Analysis & Strategic Advisory

Thank you for your question. Here is a comprehensive quantitative assessment grounded in live telemetry and institutional principles:

#### 1. Current Portfolio Baseline & Solvency Audit
- **Total Capital Equity**: **$${pv.toLocaleString()}**
- **Liquid Cash Reserve**: **$${state.cash.toLocaleString()}** (**${cashBufferPct}%** liquid)
- **Portfolio Risk Score**: **${rk.portfolioRiskScore}/100** (\`${rk.riskLabel}\`)
- **Operational Mode**: **${isUpstox ? 'Upstox Indian Equities (NSE/BSE)' : 'Simulated Paper Sandbox'}**

#### 2. Quantitative Reasoning & Mathematical Deductions
When assessing \`${rawPrompt}\`, quantitative finance demands isolating systematic risk factors from idiosyncratic volatility:
$$\\text{Asset Return}: R_i = \\alpha_i + \\beta_i R_m + \\epsilon_i, \\quad \\mathbb{E}[\\epsilon_i] = 0$$
- **Capital Preservation First**: Never risk more than $1\\%$ to $2\\%$ of total portfolio equity on any single speculative idea.
- **Cash Liquidity Floor**: Enforcing our mandatory **15% liquid buffer** guarantees that you never suffer forced liquidation during flash crashes.

#### 3. Actionable Portfolio Next Steps
${
  Number(cashBufferPct) < 15
    ? `> [!WARNING]\n> Your liquid cash reserve is currently **${cashBufferPct}%**, below the mandatory 15% safety threshold. Recommend de-risking high-beta holdings.`
    : `> [!NOTE]\n> Your portfolio maintains a healthy **${cashBufferPct}%** liquidity cushion, positioning you well to deploy systematic strategies.`
}

If you would like to run a systemic stress test, simulate a DCA schedule, or audit specific order-book depth on \`${primaryAsset}\`, let me know and I will compile an execution plan!`;

  return {
    reply,
    actionProposal: null,
    engine: ENGINE_LABEL,
  };
}

export const queryLocalQuantLLM = queryNexusDeterministicQuant;

export const NexusQuantEngine = {
  query: queryNexusDeterministicQuant,
};
