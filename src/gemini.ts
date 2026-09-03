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

export {
  senseMarketDanger,
  calculateAgenticAllocation,
  simulatePortfolioStressTest,
  synthesizeStrategyBot,
  generateSmartDCAPlan,
  compareTokensAlpha,
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

  // Deep Local Algorithmic Engine with Complete LaTeX Math & Agentic Capabilities
  const lower = text.toLowerCase();
  const pv = portfolioValue(s, markets);
  const rk = calculatePortfolioRisk(s, markets);

  // 1. Stress Test Query
  if (lower.includes('stress') || lower.includes('crash') || lower.includes('shock') || lower.includes('scenario') || lower.includes('drop')) {
    let scenarioId: StressTestScenario['scenarioId'] = 'btc_flash_crash_20';
    if (lower.includes('macro') || lower.includes('rate') || lower.includes('fed')) {
      scenarioId = 'macro_rate_shock';
    } else if (lower.includes('alt') || lower.includes('beta') || lower.includes('liquidation')) {
      scenarioId = 'high_beta_liquidation';
    } else if (lower.includes('winter') || lower.includes('bear') || lower.includes('cascade')) {
      scenarioId = 'crypto_winter_cascade';
    }

    const stress = simulatePortfolioStressTest(s, markets, scenarioId);

    const reply = `### 🌪️ Portfolio Stress Test & Shock Simulation: ${stress.title}

Simulated mathematical stress impact on your current holdings:
- **Projected Drawdown**: $-${stress.simulatedDrawdownPct}\\%$ (Estimated Loss: $${money(stress.simulatedLossUsd)}$)
- **Post-Shock Liquidation Value**: $${money(stress.postShockPortfolioVal)}$
- **Survivability Rating**: \`${stress.survivabilityRating}\` (${stress.survivabilityScore}/100)
- **95% 1-Day Value at Risk**: $\\text{VaR}_{95\\%} \\approx ${stress.var95Pct}\\%$

#### Mathematical Shock Formulation
$$\\Delta V_{\\text{portfolio}} = \\sum_{i=1}^N w_i \\cdot \\Delta P_i \\implies \\text{Projected Drawdown} = -${stress.simulatedDrawdownPct}\\%$$
$$\\text{VaR}_{95\\%} = -\\left(\\mu_p - 1.645 \\cdot \\sigma_p\\right) \\approx ${stress.var95Pct}\\%$$

#### Individual Asset Drawdowns:
${
  stress.assetImpacts.length > 0
    ? stress.assetImpacts.slice(0, 4).map((imp) => `- **${imp.asset}**: ${imp.priceShockPct}% price shock (-$${money(imp.simulatedLossUsd)} loss)`).join('\n')
    : `- 100% liquid cash reserves cushion against asset price shocks.`
}

#### Recommended Risk Mitigation:
${stress.mitigationSteps.map((step) => `- 🛡️ ${step}`).join('\n')}`;

    const actionProposal: AIActionProposal = {
      type: 'stress_test',
      asset: rk.topAsset || s.selectedAsset,
      rationale: `Stress simulation under ${stress.title}. Projected drawdown: -${stress.simulatedDrawdownPct}%.`,
      confidence: 'high',
      riskSummary: `Cushion rating: ${stress.survivabilityRating} (${stress.survivabilityScore}/100)`,
      requiresConfirmation: true,
      stressTest: stress,
    };

    return {
      reply,
      actionProposal,
      engine: 'Deterministic Algorithmic Engine (Local Mode)',
    };
  }

  // 2. Strategy Bot Synthesizer Query
  if (lower.includes('strategy') || lower.includes('bot') || lower.includes('synthesize') || lower.includes('deploy') || lower.includes('grid') || lower.includes('vwap') || lower.includes('breakout')) {
    const targetAsset = (ASSETS as readonly string[]).find((a) => lower.includes(a.toLowerCase())) as Asset || s.selectedAsset;
    let kind: StrategyKind = 'vwap_trend';
    if (lower.includes('breakout') || lower.includes('squeeze')) kind = 'breakout_volatility';
    else if (lower.includes('grid') || lower.includes('scalp')) kind = 'grid_scalp';
    else if (lower.includes('momentum') || lower.includes('trend')) kind = 'momentum';
    else if (lower.includes('mean') || lower.includes('reversion')) kind = 'mean_reversion';
    else if (lower.includes('dca')) kind = 'dca';
    else if (lower.includes('alpha') || lower.includes('multi')) kind = 'ai_multi_factor';

    const bot = synthesizeStrategyBot(targetAsset, kind, s, markets);
    const m = markets[targetAsset];
    const spot = m?.price || 100;

    const reply = `### 🤖 Synthesized Algorithmic Strategy Bot: \`${bot.name}\`

Calibrated dynamic execution parameters for **${targetAsset}** based on current ATR & volatility:
- **Strategy Engine**: \`${bot.kind.replace('_', ' ').toUpperCase()}\`
- **Max Portfolio Allocation**: $${((bot.maxAllocation || 0.25) * 100).toFixed(0)}\\%$ ($${money((bot.maxAllocation || 0.25) * pv)}$)
- **Target Profit (Take-Profit)**: $+${bot.targetProfitPct}\\%$ (~$${money(spot * (1 + (bot.targetProfitPct || 5) / 100))}$)
- **Trailing Stop-Loss**: $-${bot.trailingStopPct}\\%$ (~$${money(spot * (1 - (bot.trailingStopPct || 2) / 100))}$)
- **Cooldown Interval**: $${bot.cooldownSec}$ seconds

#### Execution Bracket Formulation
$$\\text{Target TP} = P_{\\text{entry}} + 3.0 \\cdot \\text{ATR}_{14} = \\$${(spot * (1 + (bot.targetProfitPct || 5) / 100)).toFixed(2)}$$
$$\\text{Trailing SL} = P_{\\text{entry}} - 1.3 \\cdot \\text{ATR}_{14} = \\$${(spot * (1 - (bot.trailingStopPct || 2) / 100)).toFixed(2)}$$

I have compiled the strategy package below. Authorize in the AI Safety Gate to deploy it to live ticker evaluation.`;

    const actionProposal: AIActionProposal = {
      type: 'deploy_strategy',
      asset: targetAsset,
      rationale: `Synthesized ${bot.kind.replace('_', ' ')} bot calibrated to ${targetAsset} volatility.`,
      confidence: 'high',
      riskSummary: `Deploys automated strategy with ${((bot.maxAllocation || 0.25) * 100).toFixed(0)}% allocation limit.`,
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

    return {
      reply,
      actionProposal,
      engine: 'Deterministic Algorithmic Engine (Local Mode)',
    };
  }

  // 3. Smart Value-Weighted DCA Query
  if (lower.includes('dca') || lower.includes('accumulate') || lower.includes('dollar cost') || lower.includes('schedule')) {
    const targetAsset = (ASSETS as readonly string[]).find((a) => lower.includes(a.toLowerCase())) as Asset || s.selectedAsset;
    const dcaPlan = generateSmartDCAPlan(targetAsset, 200, s, markets);
    const m = markets[targetAsset];
    const ind = m ? indicators(m.history, m.candles) : null;

    const reply = `### 📈 Smart Value-Weighted DCA Accumulator for \`${targetAsset}\`

Constructed an intelligent dollar-cost averaging plan with dynamic valuation multipliers:
- **Target Asset**: \`${targetAsset}\` (Spot: $${money(m?.price || 0)}$, 14-period RSI: $${ind?.rsi.toFixed(1) || 50}$)
- **Base Allocation**: $${money(dcaPlan.baseAmountUsd)}$ per execution
- **Dynamic Dip Multiplier**: $${dcaPlan.oversoldMultiplier}\\times$ ($${money(dcaPlan.baseAmountUsd * dcaPlan.oversoldMultiplier)}$) whenever $\\text{RSI} < 35$
- **Euphoria Pause Safeguard**: Automatically pauses purchasing whenever $\\text{RSI} > ${dcaPlan.pauseThresholdRsi}$ to avoid buying cycle peaks.

#### Value-Weighted Multiplier Formulation
$$\\text{Allocation}(RSI) = \\begin{cases} \\$${(dcaPlan.baseAmountUsd * dcaPlan.oversoldMultiplier).toFixed(0)} & \\text{if } \\text{RSI} < 35 \\text{ (Oversold Dip)} \\\\ 0 & \\text{if } \\text{RSI} > 70 \\text{ (Euphoria Top)} \\\\ \\$${dcaPlan.baseAmountUsd} & \\text{otherwise} \\end{cases}$$

Review the DCA plan parameters below to deploy this bot to your active strategy roster.`;

    const actionProposal: AIActionProposal = {
      type: 'smart_dca',
      asset: targetAsset,
      rationale: `Smart value-weighted DCA for ${targetAsset} with dynamic dip buying and peak pauses.`,
      confidence: 'high',
      riskSummary: `Automates $${dcaPlan.baseAmountUsd}/period accumulation with risk safeguards.`,
      requiresConfirmation: true,
      dcaPlan,
    };

    return {
      reply,
      actionProposal,
      engine: 'Deterministic Algorithmic Engine (Local Mode)',
    };
  }

  // 4. Token Comparison & Alpha Radar Query
  if (lower.includes('compare') || lower.includes('versus') || lower.includes(' vs ') || lower.includes('radar') || lower.includes('peer') || lower.includes('alpha')) {
    const mentioned = (ASSETS as readonly string[]).filter((a) => lower.includes(a.toLowerCase())) as Asset[];
    const targetAssets = mentioned.length >= 2 ? mentioned.slice(0, 4) : (['BTC', 'ETH', 'SOL', 'AVAX'] as Asset[]);
    const comparison = compareTokensAlpha(targetAssets, markets);

    const reply = `### 🔬 Multi-Token Alpha Radar & Risk-Adjusted Comparison

Cross-sectional statistical comparison across target assets:

| Asset | Price | 24h Change | RSI (14) | Ann. Volatility | Sharpe Ratio | Beta (BTC) | Regime |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${comparison.tokens.map((t) => `| **${t.asset}** | ${money(t.price)} | ${t.change24h >= 0 ? '+' : ''}${t.change24h}% | ${t.rsi} | ${t.volAnnualizedPct}% | ${t.sharpeEstimate} | ${t.betaToBtc} | \`${t.regime}\` |`).join('\n')}

#### Sharpe & Beta Formulation
$$\\text{Sharpe} = \\frac{R_i - R_f}{\\sigma_i \\cdot \\sqrt{365}}, \\quad \\beta_i = \\frac{\\text{Cov}(R_i, R_{\\text{BTC}})}{\\text{Var}(R_{\\text{BTC}})}$$

**Nexus Verdict**: ${comparison.verdict}`;

    const actionProposal: AIActionProposal = {
      type: 'token_compare',
      asset: comparison.topAlphaAsset,
      rationale: comparison.verdict,
      confidence: 'high',
      riskSummary: `Top alpha selection: ${comparison.topAlphaAsset}`,
      requiresConfirmation: true,
      tokenComparison: comparison,
    };

    return {
      reply,
      actionProposal,
      engine: 'Deterministic Algorithmic Engine (Local Mode)',
    };
  }

  // 5. Danger Sensing Query
  if (lower.includes('danger') || lower.includes('hazard') || lower.includes('protect') || lower.includes('safe') || lower.includes('sentinel')) {
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

  // 6. Agentic Allocation & Rebalancing Query
  if (lower.includes('rebalance') || lower.includes('allocate') || lower.includes('fund') || lower.includes('kelly') || lower.includes('parity') || lower.includes('weights') || lower.includes('growth')) {
    const style = lower.includes('growth')
      ? 'growth_weighted'
      : lower.includes('kelly')
      ? 'kelly'
      : 'risk_parity';
    const plan = calculateAgenticAllocation(s, markets, style);
    const targetKeys = Object.entries(plan.targetWeights).filter(([, w]) => w > 0);

    const reply = `### ⚖️ Agentic Portfolio Optimization (${plan.style.toUpperCase()})

Calculated optimal capital distribution using ${
      plan.style === 'kelly'
        ? 'Fractional Kelly Criterion ($f^* = \\frac{p b - q}{b}$)'
        : plan.style === 'growth_weighted'
        ? 'Growth-Weighted momentum heuristics'
        : 'Inverse-volatility risk budgeting'
    }:

$$${plan.latexFormula}$$

#### Mathematical Target Allocation:
${targetKeys.map(([a, w]) => `- **${a}**: $${w}\\%$`).join('\n')}
- **Liquid Cash Reserve**: $${plan.cashTargetPct}\\%$ ($${money((plan.cashTargetPct / 100) * pv)}$)

#### Two-Stage Execution Feasibility:
- **Post-Sell Liquid Cash**: $${money(plan.executionPlan.estimatedPostSellCash)}
- **Estimated Transaction Fees**: $${money(plan.executionPlan.estimatedTotalFees)}
- **Residual Cash Balance**: $${money(plan.executionPlan.residualCash)}

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

  // 7. Trade/Order Query
  if (lower.includes('buy') || lower.includes('sell') || lower.includes('order')) {
    const isBuy = lower.includes('buy');
    const assetMatch = (ASSETS as readonly string[]).find((a) => lower.includes(a.toLowerCase())) as Asset || s.selectedAsset;
    const m = markets[assetMatch];
    const ind = m ? indicators(m.history, m.candles) : { rsi: 50, vol: 0.02, atr: 10 };

    const currentSpot = m?.price || 100;
    const atrVal = ind.atr || currentSpot * 0.02;
    const amount = assetMatch === 'BTC' ? 0.05 : assetMatch === 'ETH' ? 0.5 : 10;
    const notional = amount * currentSpot;

    const tpPrice = +(currentSpot + atrVal * 2.8).toFixed(2);
    const slPrice = +(Math.max(0.01, currentSpot - atrVal * 1.3)).toFixed(2);

    const reply = `### 📋 Asymmetric Trade Recommendation for \`${assetMatch}\`

- **Current Spot**: $${money(currentSpot)}$
- **Relative Strength**: $\\text{RSI}_{14} = ${ind.rsi.toFixed(1)}$
- **Historical Volatility**: $\\sigma = ${(ind.vol * 100).toFixed(2)}\\%$
- **Suggested Take-Profit (2.8x ATR)**: $${money(tpPrice)}$
- **Suggested Stop-Loss (1.3x ATR)**: $${money(slPrice)}$

#### Value at Risk & Risk/Reward
$$\\text{VaR}_{95\\%} = -\\left(\\mu - 1.645 \\cdot \\sigma\\right) \\approx ${(ind.vol * 1.645 * 100).toFixed(2)}\\%$$
$$\\text{RR Ratio} = \\frac{\\text{TP} - P_0}{P_0 - \\text{SL}} = \\frac{${(tpPrice - currentSpot).toFixed(2)}}{${(currentSpot - slPrice).toFixed(2)}} \\approx 2.15$$

Proposed **${isBuy ? 'BUY' : 'SELL'}** of \`${amount} ${assetMatch}\` (~$${money(notional)}$). Verify execution parameters below.`;

    const actionProposal: AIActionProposal = {
      type: 'order',
      asset: assetMatch,
      side: isBuy ? 'buy' : 'sell',
      amount,
      rationale: `Algorithmic indicator analysis: RSI is ${ind.rsi.toFixed(1)} with dynamic ATR brackets.`,
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

  // Default general intelligence response with LaTeX math & full agentic palette
  const mSel = markets[s.selectedAsset];
  const indSel = mSel ? indicators(mSel.history, mSel.candles) : { rsi: 50, vol: 0.02, chg: 0 };

  const reply = `### 🧠 Lumen Nexus Autonomous Trading Intelligence

- **Total Portfolio Value**: $${money(pv)}$ ($${money(s.cash)}$ liquid USD cash / $${((s.cash / (pv || 1)) * 100).toFixed(1)}\\%$)
- **Portfolio Risk Score**: $${rk.portfolioRiskScore}/100$ (${rk.riskLabel}, HHI: $${rk.herfindahlIndex.toFixed(3)}$)
- **Active Asset**: \`${s.selectedAsset}\` quoting at $${money(mSel?.price || 0)}$ ($${indSel.chg >= 0 ? '+' : ''}${indSel.chg.toFixed(2)}\\%$)

#### Indicator Telemetry
$$\\text{RSI}(14) = 100 - \\frac{100}{1 + \\text{RS}} = ${indSel.rsi.toFixed(1)}$$
$$\\text{Sharpe Ratio Estimate}: \\text{SR} = \\frac{R_p - R_f}{\\sigma_p} \\approx ${(0.08 / Math.max(0.01, indSel.vol)).toFixed(2)}$$

**Available End-to-End Agentic Capabilities (Click \`+\` below or ask directly):**
- 🛡️ **Capital Defense**: *"Sense market danger"* to run the Sentinel flash crash audit.
- 🌪️ **Stress Testing**: *"Run a stress test"* or *"simulate a 20% BTC flash crash"*.
- 🤖 **Strategy Bot Synthesizer**: *"Synthesize a VWAP strategy on SOL"* or *"deploy a grid scalper"*.
- 📈 **Smart DCA Accumulator**: *"Create a smart DCA plan for BTC"*.
- ⚖️ **Agentic Rebalance**: *"Rebalance portfolio with Kelly criterion"* or *"risk parity"*.
- 🔬 **Alpha Comparison Radar**: *"Compare BTC, ETH, and SOL"*.
- 📋 **Asymmetric Trade**: *"Draft buy order with TP/SL brackets"*.`;

  return {
    reply,
    actionProposal: null,
    engine: 'Deterministic Algorithmic Engine (Local Mode)',
  };
}

