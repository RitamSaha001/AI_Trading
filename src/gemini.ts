import {
  ASSETS,
  AIActionProposal,
  AppState,
  Asset,
  Market,
  StrategyKind,
  StressTestScenario,
} from './types';
import { indicators, money, portfolioValue } from './trading';
import { calculatePortfolioRisk } from './domain/risk';
import {
  senseMarketDanger,
  calculateAgenticAllocation,
  simulatePortfolioStressTest,
  synthesizeStrategyBot,
  generateSmartDCAPlan,
  compareTokensAlpha,
  DangerAssessment,
  AgenticAllocationPlan,
} from './domain/agentic';
import { queryLocalQuantLLM } from './domain/localQuantLLM';

export {
  senseMarketDanger,
  calculateAgenticAllocation,
  simulatePortfolioStressTest,
  synthesizeStrategyBot,
  generateSmartDCAPlan,
  compareTokensAlpha,
  queryLocalQuantLLM,
};
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
      const systemPrompt = `You are Lumen Nexus, an executive autonomous quantitative trading strategist and risk guardian powered by Google Gemini 3 series.

TONE & STYLE:
- Speak with the crisp, authoritative precision of a top-tier quantitative strategist or portfolio risk manager.
- Be direct, concise, and high-signal. Avoid fluff, unnecessary chattiness, or generic filler.
- Structure responses with executive clarity:
  1. Executive Take (1-2 sentences on market regime or portfolio telemetry)
  2. Mathematical Telemetry (clean KaTeX LaTeX formulations for Sharpe, VaR, or Kelly optimization)
  3. Capital Preservation Bounds (drawdown bounds, single-asset caps, liquidity cushion)
  4. Action Directive (wrap proposed action inside <<<ACTION ... ACTION>>> when warranted)

MATHEMATICAL & LATEX FORMATTING RULES:
Whenever explaining quantitative concepts, risk metrics, Kelly optimization, or indicator calculations, ALWAYS write clean LaTeX formulas:
- Inline math: $formula$ (e.g. $\\text{RSI} = 100 - \\frac{100}{1 + \\text{RS}}$, $\\text{Sharpe} = \\frac{\\mathbb{E}[R_p - R_f]}{\\sigma_p}$, $\\text{VaR}_{95\\%} = \\mu_p - 1.645 \\cdot \\sigma_p$, $f^* = \\frac{bp - q}{b}$)
- Display math for core models: $$formula$$ (e.g. $$w_i^* = \\frac{\\sigma_i^{-1}}{\\sum_{k=1}^N \\sigma_k^{-1}} \\cdot \\left(1 - w_{\\text{cash}}\\right)$$)
Never use raw ASCII fractions like "RSI = 100 - (100 / (1 + RS))" when LaTeX can be used.

AGENTIC AUTONOMOUS POWERS:
You can execute and propose 8 specialized agentic financial actions.
When recommending an action, wrap exactly ONE valid JSON payload inside <<<ACTION ... ACTION>>>.

SUPPORTED ACTION ENVELOPES:
1. Single Order:
   {"type":"order","asset":"BTC","side":"buy"|"sell","amount":number,"rationale":string,"confidence":"high","riskSummary":string}
2. Price & Volatility Alert:
   {"type":"alert","asset":"BTC","alertType":"above"|"below"|"changeUp"|"changeDown","value":number,"rationale":string,"confidence":"high","riskSummary":string}
3. Agentic Multi-Asset Rebalance:
   {"type":"rebalance","asset":"BTC","rationale":string,"confidence":"high","riskSummary":string,"formulaLatex":string,"cashTargetPct":number,"rebalanceTargets":{"BTC":number,"ETH":number,"SOL":number},"rebalanceSteps":[{"asset":"SOL","action":"sell","amount":number,"estimatedPrice":number,"estimatedNotional":number},{"asset":"BTC","action":"buy","amount":number,"estimatedPrice":number,"estimatedNotional":number}]}
4. Emergency Capital Defense:
   {"type":"emergency_defend","asset":"BTC","dangerLevel":"HIGH"|"CRITICAL","hazardSource":string,"rationale":string,"confidence":"high","riskSummary":string,"formulaLatex":string,"rebalanceSteps":[{"asset":"SOL","action":"sell","amount":number,"estimatedPrice":number,"estimatedNotional":number}]}
5. Deploy Algorithmic Strategy Bot:
   {"type":"deploy_strategy","asset":"BTC"|"ETH"|"SOL"|"LINK"|"SUI","strategyParams":{"kind":"vwap_trend"|"breakout_volatility"|"ai_multi_factor"|"grid_scalp"|"momentum"|"mean_reversion"|"dca","name":string,"maxAllocation":number,"cooldownSec":number,"targetProfitPct":number,"trailingStopPct":number},"rationale":string,"confidence":"high","riskSummary":string}
6. Portfolio Stress-Test & Crash Simulation:
   {"type":"stress_test","asset":"BTC","stressTest":{"scenarioId":"btc_flash_crash_20"|"macro_rate_shock"|"high_beta_liquidation"|"crypto_winter_cascade"},"rationale":string,"confidence":"high","riskSummary":string}
7. Smart Value-Weighted DCA Plan:
   {"type":"smart_dca","asset":"BTC"|"ETH"|"SOL","dcaPlan":{"asset":string,"frequency":"Weekly","baseAmountUsd":number,"oversoldMultiplier":1.6,"pauseThresholdRsi":70,"targetProfitPct":8.0,"trailingStopPct":2.5},"rationale":string,"confidence":"high","riskSummary":string}
8. Multi-Asset Alpha Radar Comparison:
   {"type":"token_compare","asset":"BTC","tokens":["BTC","ETH","SOL","AVAX"],"rationale":string,"confidence":"high","riskSummary":string}

Live Telemetry:
Portfolio Total Value: $${portfolioContext.portfolioValue}
Liquid Cash: $${portfolioContext.cash} (${((s.cash / (portfolioContext.portfolioValue || 1)) * 100).toFixed(1)}%)
Risk Score: ${portfolioContext.riskScore}/100 (${portfolioContext.riskLabel})
Top Concentration: ${portfolioContext.topConcentration} in ${portfolioContext.topAsset || 'None'}
Danger Sentinel Status: ${dangerAssessment.dangerLevel} (Score: ${dangerAssessment.dangerScore}/100, Hazards: ${dangerAssessment.hazards.join('; ') || 'None'})
Live Quotes: ${JSON.stringify(Object.fromEntries(Object.entries(markets || {}).slice(0, 12).map(([k, v]: any) => [k, { price: v?.price, chg24h: v?.change24h, rsi: v?.indicators?.rsi }]))) }`;

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
            const targetAsset = rawProp.asset && ASSETS.includes(rawProp.asset) ? rawProp.asset : s.selectedAsset;

            if (pType === 'rebalance' || pType === 'emergency_defend') {
              actionProposal = {
                type: pType,
                asset: targetAsset,
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
            } else if (pType === 'deploy_strategy') {
              const kind = rawProp.strategyParams?.kind || 'vwap_trend';
              const synthesized = synthesizeStrategyBot(targetAsset, kind, s, markets, rawProp.strategyParams);
              actionProposal = {
                type: 'deploy_strategy',
                asset: targetAsset,
                rationale: rawProp.rationale || `Automated ${kind.replace('_', ' ')} bot calibrated for ${targetAsset}`,
                confidence: 'high',
                riskSummary: `Allocates up to ${((synthesized.maxAllocation || 0.25) * 100).toFixed(0)}% of portfolio into automated execution`,
                requiresConfirmation: true,
                strategyParams: {
                  kind: synthesized.kind,
                  name: synthesized.name,
                  maxAllocation: synthesized.maxAllocation,
                  cooldownSec: synthesized.cooldownSec,
                  targetProfitPct: synthesized.targetProfitPct,
                  trailingStopPct: synthesized.trailingStopPct,
                  params: synthesized.params,
                },
              };
            } else if (pType === 'stress_test') {
              const scId = rawProp.stressTest?.scenarioId || 'btc_flash_crash_20';
              const simulated = simulatePortfolioStressTest(s, markets, scId);
              actionProposal = {
                type: 'stress_test',
                asset: targetAsset,
                rationale: rawProp.rationale || `Simulated stress testing under ${simulated.title}`,
                confidence: 'high',
                riskSummary: `Projected portfolio impact: -${simulated.simulatedDrawdownPct}% ($${simulated.simulatedLossUsd.toLocaleString()})`,
                requiresConfirmation: true,
                stressTest: simulated,
              };
            } else if (pType === 'smart_dca') {
              const budget = Number(rawProp.dcaPlan?.baseAmountUsd) || 200;
              const dcaPlan = generateSmartDCAPlan(targetAsset, budget, s, markets);
              actionProposal = {
                type: 'smart_dca',
                asset: targetAsset,
                rationale: rawProp.rationale || `Automated Value-Weighted DCA plan for ${targetAsset}`,
                confidence: 'high',
                riskSummary: `Allocates $${dcaPlan.baseAmountUsd}/week with dynamic dip buying multipliers`,
                requiresConfirmation: true,
                dcaPlan,
              };
            } else if (pType === 'token_compare') {
              const tokens = Array.isArray(rawProp.tokens) ? rawProp.tokens : ['BTC', 'ETH', 'SOL'];
              const comparison = compareTokensAlpha(tokens, markets);
              actionProposal = {
                type: 'token_compare',
                asset: targetAsset,
                rationale: rawProp.rationale || comparison.verdict,
                confidence: 'high',
                riskSummary: `Peer alpha analysis across ${comparison.tokens.length} assets`,
                requiresConfirmation: true,
                tokenComparison: comparison,
              };
            } else {
              actionProposal = {
                type: pType === 'order' ? 'order' : 'alert',
                asset: targetAsset,
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

  // High-Benchmark Local Quantitative Financial & Crypto LLM Fallback Engine
  return queryLocalQuantLLM(text, s, markets);
}
