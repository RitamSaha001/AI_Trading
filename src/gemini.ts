import { AIActionProposal, AppState, Asset, Market } from './types';
import { indicators, money, portfolioValue } from './trading';
import { calculatePortfolioRisk } from './domain/risk';
import {
  senseMarketDanger,
  calculateAgenticAllocation,
  DangerAssessment,
  AgenticAllocationPlan,
} from './domain/agentic';

export { senseMarketDanger, calculateAgenticAllocation };
export type { DangerAssessment, AgenticAllocationPlan };

export type GeminiModel = {
  name: string;
  displayName?: string;
};

// Model 3 series models exclusively
export const SUPPORTED_MODELS: GeminiModel[] = [
  { name: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash (Fast & Intelligent, Recommended)' },
  { name: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro (Deep Quantitative Reasoning)' },
  { name: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite (Ultra-Low Latency)' },
];

/**
 * Validates and resolves model name ensuring only Gemini 3 series models are used.
 * Automatically migrates any legacy or deprecated model name to gemini-3.8-flash.
 */
export function resolveGemini3Model(requestedModel?: string): string {
  if (requestedModel && requestedModel.includes('gemini-3')) {
    return requestedModel;
  }
  return 'gemini-3.8-flash';
}

export function resolveApiKey(customKey?: string): string {
  const custom = customKey?.trim();
  if (custom) return custom;
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) {
    return (import.meta.env.VITE_GEMINI_API_KEY as string).trim();
  }
  return '';
}

export async function listGeminiModels(customKey?: string): Promise<GeminiModel[]> {
  const key = resolveApiKey(customKey);
  if (!key) {
    return SUPPORTED_MODELS;
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
      headers: {
        'x-goog-api-key': key,
        'User-Agent': 'aistudio-build',
      },
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();

    const list: GeminiModel[] = [];
    if (data.models) {
      for (const m of data.models) {
        if (m.name && m.supportedGenerationMethods?.includes('generateContent')) {
          const cleanName = m.name.replace(/^models\//, '');
          // Strictly restrict to Gemini Model 3 series only
          if (cleanName.includes('gemini-3')) {
            list.push({
              name: cleanName,
              displayName: m.displayName ? `${m.displayName} (Gemini 3 Series)` : cleanName,
            });
          }
        }
      }
    }
    return list.length > 0 ? list : SUPPORTED_MODELS;
  } catch {
    return SUPPORTED_MODELS;
  }
}

export function buildContext(s: AppState, markets: Record<Asset, Market | undefined>) {
  const rk = calculatePortfolioRisk(s, markets);
  const pv = portfolioValue(s, markets);
  return {
    portfolioValue: +pv.toFixed(2),
    cash: +s.cash.toFixed(2),
    riskScore: rk.portfolioRiskScore,
    riskLabel: rk.riskLabel,
    topConcentration: rk.topAssetConcentrationPct.toFixed(1) + '%',
    topAsset: rk.topAsset,
    assets: Object.fromEntries(
      (Object.keys(markets) as Asset[]).map((a) => {
        const m = markets[a];
        return [
          a,
          {
            price: m?.price,
            change24h: m?.change24h,
            holding: s.positions[a] || 0,
            indicators: m ? indicators(m.history, m.candles) : null,
          },
        ];
      })
    ),
  };
}

/**
 * Generates structured technical insights. Uses Gemini if user provided an API key;
 * otherwise gracefully falls back to deterministic local mathematical indicators.
 */
export async function fetchAIInsight(
  asset: Asset,
  s: AppState,
  markets: Record<Asset, Market | undefined>
): Promise<{
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  rationale: string;
  signals: { label: string; value: string }[];
  proposals: AIActionProposal[];
  engine: string;
}> {
  const m = markets[asset];
  const ind = m
    ? indicators(m.history, m.candles)
    : { s10: null, s30: null, rsi: 50, vol: 0.02, chg: 0, score: 0, signalLabel: 'Neutral' as const, bb: null, macd: null, ema20: null };
  const portfolioContext = buildContext(s, markets);

  try {
    const key = resolveApiKey(s.settings.geminiApiKey);
    if (key) {
      const model = resolveGemini3Model(s.settings.geminiModel);

      const prompt = `You are Lumen Copilot, an educational quantitative cryptocurrency market analyst.
Analyze the target asset based strictly on standard technical indicators and portfolio allocation risk.
Do NOT make exaggerated claims about order-book flow or certainty. Be honest, objective, and risk-aware.

Target Asset: ${asset}
Spot Price: $${m?.price}
24h Price Change: ${m?.change24h}%
Technical Indicators:
- RSI (14-period): ${ind.rsi.toFixed(1)}
- 10-period SMA: $${ind.s10?.toFixed(2) ?? 'N/A'}
- 30-period SMA: $${ind.s30?.toFixed(2) ?? 'N/A'}
- Return Volatility: ${(ind.vol * 100).toFixed(2)}%
Portfolio Overview:
- Cash Reserve: $${portfolioContext.cash}
- Total Portfolio Value: $${portfolioContext.portfolioValue}
- Current Position in ${asset}: ${portfolioContext.assets?.[asset]?.holding || 0} units
- Portfolio Risk Classification: ${portfolioContext.riskLabel} (${portfolioContext.riskScore}/100)

Return ONLY valid JSON matching this schema:
{
  "direction": "bullish" | "bearish" | "neutral",
  "confidence": number between 40 and 95,
  "rationale": "2-3 precise, objective sentences explaining indicator dynamics and risk considerations",
  "signals": [
    {"label": "Trend Alignment", "value": string},
    {"label": "RSI Momentum", "value": string},
    {"label": "Price Volatility", "value": string},
    {"label": "Portfolio Allocation", "value": string}
  ],
  "proposals": [
    {
      "type": "order" | "alert",
      "side": "buy" | "sell",
      "amount": number,
      "alertType": "above" | "below",
      "value": number,
      "rationale": string,
      "confidence": "low" | "medium" | "high",
      "riskSummary": string
    }
  ]
}`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
          'User-Agent': 'aistudio-build',
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          let cleanJson = text.trim();
          if (cleanJson.startsWith('```json')) {
            cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
          } else if (cleanJson.startsWith('```')) {
            cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
          }
          const parsed = JSON.parse(cleanJson);
          const sanitizedProposals: AIActionProposal[] = Array.isArray(parsed.proposals)
            ? parsed.proposals.map((p: any) => ({
                type: p.type === 'order' ? 'order' : 'alert',
                asset,
                side: p.side === 'sell' ? 'sell' : 'buy',
                amount: Number(p.amount) || 0.05,
                alertType: p.alertType || 'above',
                value: Number(p.value) || Math.round((m?.price || 100) * 1.05),
                rationale: String(p.rationale || p.reason || 'Technical indicator recommendation'),
                confidence: p.confidence === 'high' || p.confidence === 'low' ? p.confidence : 'medium',
                riskSummary: String(p.riskSummary || 'Requires user verification and allocation check'),
                requiresConfirmation: true,
              }))
            : [];

          return {
            direction: parsed.direction || 'neutral',
            confidence: Number(parsed.confidence) || 60,
            rationale: parsed.rationale || 'Analysis completed.',
            signals: parsed.signals || [],
            proposals: sanitizedProposals,
            engine: `Gemini 3 Series (${model})`,
          };
        }
      }
    }
  } catch (e) {
    console.warn('Gemini 3 series API call unsuccessful, activating local algorithmic analysis fallback:', e);
  }

  // Deterministic local mathematical indicator fallback
  const dir: 'bullish' | 'bearish' | 'neutral' =
    ind.score >= 1 ? 'bullish' : ind.score <= -1 ? 'bearish' : 'neutral';
  const conf = Math.min(88, 52 + Math.abs(ind.score) * 12);
  const currentPrice = m?.price || 0;

  const proposals: AIActionProposal[] = [];
  if (dir === 'bullish' && currentPrice > 0) {
    proposals.push({
      type: 'order',
      asset,
      side: 'buy',
      amount: +(500 / currentPrice).toFixed(4),
      rationale: `Moving average trend alignment (SMA10 > SMA30) with RSI (${ind.rsi.toFixed(1)}) in constructive zone.`,
      confidence: 'medium',
      riskSummary: 'Ensure trade notional complies with risk tolerance and max single asset allocation.',
      requiresConfirmation: true,
    });
  } else if (currentPrice > 0) {
    proposals.push({
      type: 'alert',
      asset,
      alertType: 'above',
      value: Math.round(currentPrice * 1.05),
      rationale: `Monitor for potential breakout above ${money(currentPrice * 1.05)}.`,
      confidence: 'medium',
      riskSummary: 'Informational price trigger; does not execute trades.',
      requiresConfirmation: true,
    });
  }

  return {
    direction: dir,
    confidence: conf,
    rationale: `${asset} presents ${dir} technical conditions around ${money(currentPrice)}. 14-period RSI is at ${ind.rsi.toFixed(1)} with a 20-period return volatility of ${(ind.vol * 100).toFixed(2)}%.`,
    signals: [
      {
        label: 'Trend Following',
        value: ind.s10 && ind.s30 && ind.s10 > ind.s30 ? 'Bullish (SMA10 > SMA30)' : 'Defensive / Below Trend',
      },
      {
        label: 'RSI Oscillator',
        value: `${ind.rsi.toFixed(1)} (${ind.rsi > 70 ? 'Overbought' : ind.rsi < 30 ? 'Oversold' : 'Neutral Range'})`,
      },
      {
        label: '24h Momentum',
        value: `${ind.chg >= 0 ? '+' : ''}${ind.chg.toFixed(2)}%`,
      },
      {
        label: 'Return Volatility',
        value: `${(ind.vol * 100).toFixed(2)}%`,
      },
    ],
    proposals,
    engine: 'Deterministic Algorithmic Engine (Local Mode)',
  };
}

export async function sendAIChat(
  text: string,
  s: AppState,
  markets: Record<Asset, Market | undefined>,
  history: { role: 'user' | 'assistant'; text: string }[]
): Promise<{ reply: string; actionProposal?: AIActionProposal | null; engine: string }> {
  const portfolioContext = buildContext(s, markets);
  const dangerAssessment = senseMarketDanger(s, markets);

  try {
    const key = resolveApiKey(s.settings.geminiApiKey);
    if (key) {
      const systemPrompt = `You are Lumen Copilot, an elite quantitative cryptocurrency market analyst and autonomous portfolio risk guardian powered by Google Gemini 3 series.
You specialize in transparent portfolio analysis, technical indicator evaluation (SMA/EMA crossovers, RSI oscillators, Bollinger Bands, ATR, MACD), risk budgeting, and agentic capital allocation.

MATHEMATICAL & LATEX FORMATTING RULES:
Whenever explaining quantitative concepts, risk metrics, Kelly optimization, or indicator calculations, ALWAYS write clean LaTeX formulas:
- Inline math: $formula$ (e.g. $\\text{RSI} = 100 - \\frac{100}{1 + \\text{RS}}$, $\\text{Sharpe} = \\frac{\\mathbb{E}[R_p - R_f]}{\\sigma_p}$, $\\text{VaR}_{95\\%} = \\mu_p - 1.645 \\cdot \\sigma_p$, $f^* = \\frac{bp - q}{b}$)
- Display math for core models: $$formula$$ (e.g. $$w_i^* = \\frac{\\sigma_i^{-1}}{\\sum_{k=1}^N \\sigma_k^{-1}} \\cdot \\left(1 - w_{\\text{cash}}\\right)$$)
Never use raw ASCII fractions like "RSI = 100 - (100 / (1 + RS))" when LaTeX can be used.

AGENTIC AUTONOMOUS POWERS:
1. SENSING DANGER: If you sense high downside volatility, sharp negative momentum divergence, severe concentration (>40% in one volatile token), or depleted cash, warn the user clearly and propose an "emergency_defend" or "rebalance" action.
2. AGENTIC REBALANCING: You can compute and propose complete multi-asset portfolio rebalancing (Kelly criterion or Risk-Parity) with concrete buy/sell execution steps.
3. SPECIFIC PROPOSALS: If proposing an execution, wrap exactly ONE structured JSON inside <<<ACTION ... ACTION>>>.

SUPPORTED ACTIONS:
- Single Order:
  {"type":"order","asset":"BTC"|"ETH"|"SOL"|"ADA"|"XRP"|"AVAX"|"LINK"|"DOGE","side":"buy"|"sell","amount":number,"rationale":string,"confidence":"low"|"medium"|"high","riskSummary":string}
- Price Alert:
  {"type":"alert","asset":"BTC"|"ETH"|...,"alertType":"above"|"below","value":number,"rationale":string,"confidence":"high","riskSummary":string}
- Multi-Asset Agentic Rebalance:
  {"type":"rebalance","asset":"BTC","rationale":string,"confidence":"high","riskSummary":string,"formulaLatex":string,"cashTargetPct":number,"rebalanceTargets":{"BTC":number,"ETH":number,"SOL":number},"rebalanceSteps":[{"asset":"SOL","action":"sell","amount":number,"estimatedPrice":number,"estimatedNotional":number},{"asset":"BTC","action":"buy","amount":number,"estimatedPrice":number,"estimatedNotional":number}]}
- Emergency Capital Defense:
  {"type":"emergency_defend","asset":"BTC","dangerLevel":"HIGH"|"CRITICAL","hazardSource":string,"rationale":string,"confidence":"high","riskSummary":string,"formulaLatex":string,"rebalanceSteps":[{"asset":"SOL","action":"sell","amount":number,"estimatedPrice":number,"estimatedNotional":number}]}

Live Telemetry:
Portfolio Total Value: $${portfolioContext.portfolioValue}
Liquid Cash: $${portfolioContext.cash} (${((s.cash / (portfolioContext.portfolioValue || 1)) * 100).toFixed(1)}%)
Risk Score: ${portfolioContext.riskScore}/100 (${portfolioContext.riskLabel})
Top Concentration: ${portfolioContext.topConcentration} in ${portfolioContext.topAsset || 'None'}
Danger Sentinel Status: ${dangerAssessment.dangerLevel} (Score: ${dangerAssessment.dangerScore}/100, Hazards: ${dangerAssessment.hazards.join('; ') || 'None'})
Live Quotes: ${JSON.stringify(Object.fromEntries(Object.entries(markets || {}).map(([k, v]: any) => [k, { price: v?.price, chg24h: v?.change24h, rsi: v?.indicators?.rsi }]))) }`;

      const rawHistory = history.slice(-8, -1).map((h) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }],
      }));

      const formattedHistory: { role: string; parts: { text: string }[] }[] = [];
      for (const msg of rawHistory) {
        if (formattedHistory.length > 0 && formattedHistory[formattedHistory.length - 1].role === msg.role) {
          formattedHistory[formattedHistory.length - 1].parts[0].text += '\n\n' + msg.parts[0].text;
        } else {
          formattedHistory.push(msg);
        }
      }

      const currentUserMsg = {
        role: 'user',
        parts: [{ text: `${text}\n\n[Live Context: Total=$${portfolioContext.portfolioValue}, Cash=$${portfolioContext.cash}, Danger=${dangerAssessment.dangerLevel} (${dangerAssessment.dangerScore}/100)]` }],
      };

      if (formattedHistory.length > 0 && formattedHistory[formattedHistory.length - 1].role === 'user') {
        formattedHistory[formattedHistory.length - 1].parts[0].text += '\n\n' + currentUserMsg.parts[0].text;
      } else {
        formattedHistory.push(currentUserMsg);
      }

      const model = resolveGemini3Model(s.settings.geminiModel);

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
          'User-Agent': 'aistudio-build',
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: formattedHistory,
          generationConfig: { temperature: 0.25 },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const fullText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        let cleanedText = fullText;
        let actionProposal: AIActionProposal | null = null;

        const actionMatch = fullText.match(/<<<ACTION\s*([\s\S]*?)\s*ACTION>>>/);
        if (actionMatch) {
          try {
            const rawProp = JSON.parse(actionMatch[1]);
            const pType = rawProp.type || 'order';

            if (pType === 'rebalance' || pType === 'emergency_defend') {
              actionProposal = {
                type: pType,
                asset: rawProp.asset || 'BTC',
                dangerLevel: rawProp.dangerLevel || (pType === 'emergency_defend' ? 'HIGH' : 'NORMAL'),
                hazardSource: rawProp.hazardSource || 'Autonomous Risk Audit',
                rationale: rawProp.rationale || 'Agentic portfolio reallocation',
                confidence: rawProp.confidence || 'high',
                riskSummary: rawProp.riskSummary || 'Rebalances portfolio assets towards target weights',
                formulaLatex: rawProp.formulaLatex,
                cashTargetPct: rawProp.cashTargetPct,
                rebalanceTargets: rawProp.rebalanceTargets,
                rebalanceSteps: Array.isArray(rawProp.rebalanceSteps) ? rawProp.rebalanceSteps : [],
                requiresConfirmation: true,
              };
            } else {
              actionProposal = {
                type: pType === 'order' ? 'order' : 'alert',
                asset: rawProp.asset || s.selectedAsset,
                side: rawProp.side === 'sell' ? 'sell' : 'buy',
                amount: Number(rawProp.amount) || 0.05,
                alertType: rawProp.alertType || 'above',
                value: Number(rawProp.value) || 0,
                rationale: rawProp.rationale || rawProp.reason || 'AI strategy recommendation',
                confidence: rawProp.confidence === 'high' || rawProp.confidence === 'low' ? rawProp.confidence : 'medium',
                riskSummary: rawProp.riskSummary || 'Requires allocation check and user authorization',
                requiresConfirmation: true,
              };
            }
            cleanedText = fullText.replace(/<<<ACTION[\s\S]*?ACTION>>>/, '').trim();
          } catch (e) {
            console.warn('Failed to parse proposed action JSON:', e);
          }
        }

        return {
          reply: cleanedText || 'Analysis complete.',
          actionProposal,
          engine: `Gemini 3 Series (${model})`,
        };
      }
    }
  } catch (err: any) {
    console.warn('Chat request failed, activating local autonomous engine:', err);
  }

  // Deep Local Algorithmic Engine with LaTeX Math & Agentic Capabilities
  const lower = text.toLowerCase();
  const pv = portfolioValue(s, markets);
  const rk = calculatePortfolioRisk(s, markets);

  // 1. Danger Sensing Query
  if (lower.includes('danger') || lower.includes('hazard') || lower.includes('protect') || lower.includes('safe') || lower.includes('crash')) {
    const danger = senseMarketDanger(s, markets);
    const reply = `### 🛡️ Autonomous Sentinel Danger Audit

The autonomous risk monitor evaluated your portfolio telemetry:
- **Danger Status**: \`${danger.dangerLevel}\` (Risk Score: $${danger.dangerScore}/100$)
- **Liquid Buffer**: $${((s.cash / (pv || 1)) * 100).toFixed(1)}\\%$ in USD cash
- **Top Concentration**: $${rk.topAssetConcentrationPct.toFixed(1)}\\%$ in \`${rk.topAsset || 'None'}\`

#### Quantitative Danger Formulation
$$${danger.latexFormula}$$

${
  danger.hazards.length > 0
    ? `**Active Hazards Detected:**\n` + danger.hazards.map((h) => `- ⚠️ ${h}`).join('\n')
    : `✅ **All Systems Normal**: No immediate flash drawdowns or toxic volatility spikes detected across your positions.`
}

${
  danger.circuitBreakerRecommended
    ? `> **Circuit Breaker Advisory**: Sensed elevated downside risk. I have prepared an emergency de-risking action below to convert high-beta allocations to cash buffer.`
    : `Portfolio volatility is within safe thresholds. Would you like to optimize asset distribution using Risk-Parity?`
}`;

    return {
      reply,
      actionProposal: danger.defensiveProposal,
      engine: 'Deterministic Algorithmic Engine (Local Mode)',
    };
  }

  // 2. Agentic Allocation & Rebalancing Query
  if (lower.includes('rebalance') || lower.includes('allocate') || lower.includes('fund') || lower.includes('kelly') || lower.includes('parity') || lower.includes('weights')) {
    const plan = calculateAgenticAllocation(s, markets, lower.includes('kelly') ? 'kelly' : 'risk_parity');
    const targetKeys = Object.entries(plan.targetWeights).filter(([, w]) => w > 0);

    const reply = `### ⚖️ Agentic Portfolio Optimization (${plan.style.toUpperCase()})

Calculated optimal capital distribution using inverse-volatility risk budgeting:

$$${plan.latexFormula}$$

#### Mathematical Target Allocation:
${targetKeys.map(([a, w]) => `- **${a}**: $${w}\\%$`).join('\n')}
- **Liquid Cash Reserve**: $${plan.cashTargetPct}\\%$ ($${money((plan.cashTargetPct / 100) * pv)}$)

#### Execution Steps:
${
  plan.steps.length > 0
    ? plan.steps.map((step) => `- **${step.action.toUpperCase()}** \`${step.amount} ${step.asset}\` (~$${money(step.estimatedNotional)})`).join('\n')
    : `- Current allocations already match target optimization thresholds.`
}

${plan.steps.length > 0 ? `I have generated the rebalance action below. Review and authorize in the Safety Gate.` : ''}`;

    return {
      reply,
      actionProposal: plan.steps.length > 0 ? plan.proposal : null,
      engine: 'Deterministic Algorithmic Engine (Local Mode)',
    };
  }

  // 3. Trade/Order Query
  if (lower.includes('buy') || lower.includes('sell') || lower.includes('order')) {
    const isBuy = lower.includes('buy');
    const assetMatch = (['BTC', 'ETH', 'SOL', 'ADA', 'XRP', 'AVAX', 'LINK', 'DOGE'] as Asset[]).find(
      (a) => lower.includes(a.toLowerCase())
    ) || s.selectedAsset;
    const m = markets[assetMatch];
    const ind = m ? indicators(m.history, m.candles) : { rsi: 50, vol: 0.02 };

    const amount = assetMatch === 'BTC' ? 0.05 : assetMatch === 'ETH' ? 0.5 : 10;
    const notional = amount * (m?.price || 100);

    const reply = `### 📋 Trade Recommendation for \`${assetMatch}\`

- **Current Spot**: $${money(m?.price || 0)}$
- **Relative Strength**: $\\text{RSI}_{14} = ${ind.rsi.toFixed(1)}$
- **Historical Volatility**: $\\sigma = ${(ind.vol * 100).toFixed(2)}\\%$

#### Value at Risk Model
$$\\text{VaR}_{95\\%} = -\\left(\\mu - 1.645 \\cdot \\sigma\\right) \\approx ${(ind.vol * 1.645 * 100).toFixed(2)}\\%$$

Proposed **${isBuy ? 'BUY' : 'SELL'}** of \`${amount} ${assetMatch}\` (~$${money(notional)}$). Verify execution parameters below.`;

    const actionProposal: AIActionProposal = {
      type: 'order',
      asset: assetMatch,
      side: isBuy ? 'buy' : 'sell',
      amount,
      rationale: `Algorithmic indicator analysis: RSI is ${ind.rsi.toFixed(1)} with ${m?.change24h || 0}% 24h change.`,
      confidence: 'medium',
      riskSummary: `Order requires ${money(notional)} notional equity.`,
      requiresConfirmation: true,
    };

    return {
      reply,
      actionProposal,
      engine: 'Deterministic Algorithmic Engine (Local Mode)',
    };
  }

  // Default general intelligence response with LaTeX math
  const mSel = markets[s.selectedAsset];
  const indSel = mSel ? indicators(mSel.history, mSel.candles) : { rsi: 50, vol: 0.02, chg: 0 };

  const reply = `### 🧠 Lumen Copilot Portfolio Intelligence

- **Total Equity**: $${money(pv)}$ with $${money(s.cash)}$ in liquid USD cash ($${((s.cash / (pv || 1)) * 100).toFixed(1)}\\%$)
- **Portfolio Risk Score**: $${rk.portfolioRiskScore}/100$ (${rk.riskLabel})
- **Active Asset**: \`${s.selectedAsset}\` quoting at $${money(mSel?.price || 0)}$ ($${indSel.chg >= 0 ? '+' : ''}${indSel.chg.toFixed(2)}\\%$)

#### Indicator Telemetry
$$\\text{RSI}(14) = 100 - \\frac{100}{1 + \\text{RS}} = ${indSel.rsi.toFixed(1)}$$
$$\\text{Sharpe Ratio Estimate}: \\text{SR} = \\frac{R_p - R_f}{\\sigma_p} \\approx ${(0.08 / Math.max(0.01, indSel.vol)).toFixed(2)}$$

**Available Agentic Capabilities:**
- 🛡️ **Sense Market Danger**: Ask me to *"sense danger"* to run the Autonomous Sentinel audit.
- ⚖️ **Agentic Reallocation**: Ask me to *"rebalance funds"* or *"optimize with Kelly criterion"*.
- 📐 **LaTeX Derivations**: Ask me to explain any financial formula with complete mathematical rigor.`;

  return {
    reply,
    actionProposal: null,
    engine: 'Deterministic Algorithmic Engine (Local Mode)',
  };
}
