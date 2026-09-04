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
import { queryLocalQuantLLM, queryNexusDeterministicQuant, NexusQuantEngine } from './domain/localQuantLLM';
import { GeminiLLMProvider } from './domain/llmProvider';
import { runAgentLoop, AgentTelemetry } from './domain/agentLoop';
import { TradingDecision } from './domain/decision';
import { decryptApiKey, isEncryptedApiKey } from './services/keyVault';
import { buildStructuredMarketContext } from './domain/marketContext';
import { MarketDataValidityGuard } from './domain/marketValidity';
import { DEFAULT_RISK_POLICY, getRiskPolicy } from './domain/riskPolicy';
import { validateAIProposal } from './services/safetyGate';
import { calculateRiskBasedPositionSize } from './domain/positionSizing';

export {
  senseMarketDanger,
  calculateAgenticAllocation,
  simulatePortfolioStressTest,
  synthesizeStrategyBot,
  generateSmartDCAPlan,
  compareTokensAlpha,
  queryLocalQuantLLM,
  queryNexusDeterministicQuant,
  NexusQuantEngine,
};
export type { DangerAssessment, AgenticAllocationPlan };

export type GeminiModel = {
  name: string;
  displayName?: string;
};

// Model 3 series frontier reasoning models
export const SUPPORTED_MODELS: GeminiModel[] = [
  { name: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro (Frontier Quantitative Reasoning, Recommended)' },
  { name: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash (High-Speed & Intelligent)' },
  { name: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite (Ultra-Low Latency)' },
];

/**
 * Validates and resolves model name ensuring only Gemini 3 series models are used.
 * Defaults to Gemini 3.1 Pro for institutional reasoning.
 */
export function resolveGemini3Model(requestedModel?: string): string {
  if (requestedModel && requestedModel.includes('gemini-3')) {
    return requestedModel;
  }
  return 'gemini-3.1-pro-preview';
}

export async function resolveApiKey(customKey?: string): Promise<string> {
  const custom = customKey?.trim();
  if (custom) {
    if (isEncryptedApiKey(custom)) {
      try {
        return await decryptApiKey(custom);
      } catch {
        return '';
      }
    }
    return custom;
  }
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) {
    return (import.meta.env.VITE_GEMINI_API_KEY as string).trim();
  }
  return '';
}

export async function listGeminiModels(customKey?: string): Promise<GeminiModel[]> {
  const key = await resolveApiKey(customKey);
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
 * Generates structured technical insights for a single asset.
 * Uses Gemini if user provided an API key; otherwise gracefully falls back to deterministic local mathematical indicators.
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
  const key = await resolveApiKey(s.settings.geminiApiKey);

  if (key) {
    try {
      const model = resolveGemini3Model(s.settings.geminiModel);
      const prompt = `You are Nexus Quantitative Analyst.
Analyze the target asset strictly from quantitative technical indicators, volatility, and portfolio allocation risk.
Do NOT invent order-book flow or certainty. Be honest, objective, and risk-aware.

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
- Portfolio Risk: ${portfolioContext.riskLabel} (${portfolioContext.riskScore}/100)

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
          'User-Agent': 'nexus-quant-agent',
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
          const rawProposals: any[] = Array.isArray(parsed.proposals) ? parsed.proposals : [];
          const sanitizedProposals: AIActionProposal[] = [];

          for (const p of rawProposals) {
            if (p.type === 'order') {
              const amount = Number(p.amount);
              if (!Number.isFinite(amount) || amount <= 0) continue;
              const prop: AIActionProposal = {
                type: 'order',
                asset,
                side: p.side === 'sell' ? 'sell' : 'buy',
                amount,
                rationale: String(p.rationale || p.reason || 'Technical indicator recommendation'),
                confidence: p.confidence === 'high' || p.confidence === 'low' ? p.confidence : 'medium',
                riskSummary: String(p.riskSummary || 'Requires user verification and allocation check'),
                requiresConfirmation: true,
              };
              const safety = validateAIProposal(prop, s, markets);
              if (safety.valid) {
                sanitizedProposals.push(prop);
              }
            } else if (p.type === 'alert') {
              const val = Number(p.value);
              if (!Number.isFinite(val) || val <= 0) continue;
              const prop: AIActionProposal = {
                type: 'alert',
                asset,
                alertType: p.alertType === 'below' ? 'below' : 'above',
                value: val,
                rationale: String(p.rationale || p.reason || 'Technical indicator price trigger'),
                confidence: p.confidence === 'high' || p.confidence === 'low' ? p.confidence : 'medium',
                riskSummary: String(p.riskSummary || 'Informational price trigger; does not execute trades'),
                requiresConfirmation: true,
              };
              const safety = validateAIProposal(prop, s, markets);
              if (safety.valid) {
                sanitizedProposals.push(prop);
              }
            }
          }

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
    } catch (e) {
      console.warn('Gemini API call failed, falling back to local algorithmic analysis:', e);
    }
  }

  // Deterministic local mathematical indicator fallback
  const dir: 'bullish' | 'bearish' | 'neutral' =
    ind.score >= 1 ? 'bullish' : ind.score <= -1 ? 'bearish' : 'neutral';
  const conf = Math.min(88, 52 + Math.abs(ind.score) * 12);
  const currentPrice = m?.price || 0;

  const proposals: AIActionProposal[] = [];
  const policy = getRiskPolicy(s);
  const validity = MarketDataValidityGuard.validate(m, asset, policy, { requireExecutionGrade: dir === 'bullish' });

  if (dir === 'bullish' && currentPrice > 0 && validity.canExecute) {
    const pv = portfolioValue(s, markets);
    const sized = calculateRiskBasedPositionSize({
      asset,
      side: 'buy',
      entryPrice: currentPrice,
      stopPrice: +(currentPrice * 0.95).toFixed(2),
      targetPrice: +(currentPrice * 1.10).toFixed(2),
      portfolioEquity: pv,
      availableCash: s.cash,
      currentHolding: s.positions[asset] || 0,
      currentHoldingNotional: (s.positions[asset] || 0) * currentPrice,
      market: m,
      policy,
    });

    if (sized.quantity > 0) {
      const orderProposal: AIActionProposal = {
        type: 'order',
        asset,
        side: 'buy',
        amount: sized.quantity,
        rationale: `Moving average trend alignment (SMA10 > SMA30) with RSI (${ind.rsi.toFixed(1)}) in constructive zone.`,
        confidence: 'medium',
        riskSummary: `Risk-budgeted size ($${(sized.quantity * currentPrice).toFixed(2)}) adhering to 15% cash preservation.`,
        requiresConfirmation: true,
      };
      const safety = validateAIProposal(orderProposal, s, markets);
      if (safety.valid) {
        proposals.push(orderProposal);
      }
    }
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
    engine: 'Nexus Deterministic Quant Engine (Offline Fallback)',
  };
}

export interface ChatResponse {
  reply: string;
  actionProposal?: AIActionProposal | null;
  engine: string;
  telemetry?: AgentTelemetry;
  decision?: TradingDecision | null;
}

/**
 * Primary Chat Orchestrator.
 * 1. If Gemini API key is configured, executes the full bounded multi-turn agent loop
 *    with tool-calling across the 26 typed quant tools, challenger verification,
 *    and safety gates.
 * 2. If API key is missing or network call fails, seamlessly falls back to
 *    NexusDeterministicQuant (offline fallback) with transparent engine labeling.
 */
export async function sendAIChat(
  text: string,
  s: AppState,
  markets: Record<Asset, Market | undefined>,
  history: { role: 'user' | 'assistant'; text: string }[]
): Promise<ChatResponse> {
  const key = await resolveApiKey(s.settings.geminiApiKey);

  if (key) {
    try {
      const model = resolveGemini3Model(s.settings.geminiModel);
      const provider = new GeminiLLMProvider();

      const result = await runAgentLoop({
        query: text,
        state: s,
        markets,
        history,
        provider,
        model,
        apiKey: key,
        maxIterations: 5,
      });

      return {
        reply: result.reply,
        actionProposal: result.actionProposal,
        engine: result.engine,
        telemetry: result.telemetry,
        decision: result.decision,
      };
    } catch (err: any) {
      console.warn('Frontier LLM Agent execution encountered error; engaging Deterministic Quant Fallback:', err);
    }
  }

  // Nexus Deterministic Quant Engine (Offline Fallback)
  const localResult = queryNexusDeterministicQuant(text, s, markets);
  const context = buildStructuredMarketContext(s, markets);
  const rk = calculatePortfolioRisk(s, markets);

  const fallbackTelemetry: AgentTelemetry = {
    aiMode: 'Deterministic Quant Fallback (Offline Mode)',
    reasoningTier: 'Deterministic Algorithmic Rules',
    toolsUsed: ['calculate_portfolio_risk', 'sense_market_danger', 'calculate_indicators'],
    dataFreshnessSec: context.assets[context.primaryAsset]?.dataFreshnessSec ?? 0,
    dataQualityScore: context.metadata.overallDataQualityScore,
    portfolioRiskLabel: rk.riskLabel,
    portfolioRiskScore: rk.portfolioRiskScore,
    loopIterations: 1,
  };

  return {
    reply: localResult.reply,
    actionProposal: localResult.actionProposal,
    engine: localResult.engine,
    telemetry: fallbackTelemetry,
    decision: null,
  };
}
