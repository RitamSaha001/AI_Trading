import { AIActionProposal, AppState, Asset, Market } from './types';
import { indicators, money, portfolioValue } from './trading';
import { calculatePortfolioRisk } from './domain/risk';

export type GeminiModel = {
  name: string;
  displayName?: string;
};

export const SUPPORTED_MODELS: GeminiModel[] = [
  { name: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash (Fast, Recommended)' },
  { name: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro (Deep Quantitative Reasoning)' },
  { name: 'gemini-1.5-flash-8b', displayName: 'Gemini 1.5 Flash-8B (High Throughput)' },
];

export async function listGeminiModels(customKey?: string): Promise<GeminiModel[]> {
  const key = customKey;
  if (!key) {
    return SUPPORTED_MODELS;
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();

    const list: GeminiModel[] = [];
    if (data.models) {
      for (const m of data.models) {
        if (m.name && m.supportedGenerationMethods?.includes('generateContent')) {
          const cleanName = m.name.replace(/^models\//, '');
          if (cleanName.includes('gemini-1.5') || cleanName.includes('gemini-2.0') || cleanName.includes('gemini-2.5')) {
            list.push({
              name: cleanName,
              displayName: m.displayName || cleanName,
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
  engine: 'Gemini Live AI' | 'Deterministic Algorithmic Engine (Local Mode)';
}> {
  const m = markets[asset];
  const ind = m
    ? indicators(m.history, m.candles)
    : { s10: null, s30: null, rsi: 50, vol: 0.02, chg: 0, score: 0, signalLabel: 'Neutral' as const, bb: null, macd: null, ema20: null };
  const portfolioContext = buildContext(s, markets);

  try {
    const key = s.settings.geminiApiKey;
    if (key) {
      const model = s.settings.geminiModel || 'gemini-1.5-flash';

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
        headers: { 'Content-Type': 'application/json' },
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
          const parsed = JSON.parse(text);
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
            engine: 'Gemini Live AI',
          };
        }
      }
    }
  } catch (e) {
    console.warn('Gemini API call unsuccessful, activating local algorithmic analysis fallback:', e);
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

  try {
    const key = s.settings.geminiApiKey;
    if (key) {
      const systemPrompt = `You are Lumen Copilot, an educational cryptocurrency paper-trading assistant.
You specialize in transparent portfolio analysis, technical indicator evaluation (SMA/EMA crossovers, RSI oscillators, Bollinger Bands), and risk budgeting.
You DO NOT have access to live order books or insider data. Never claim to analyze order books or predict the future.
Be calm, scannable, and transparent.

Context:
Portfolio Value: $${portfolioContext.portfolioValue}
Cash Available: $${portfolioContext.cash}
Portfolio Risk: ${portfolioContext.riskLabel} (${portfolioContext.riskScore}/100)
Top Concentration: ${portfolioContext.topConcentration} (${portfolioContext.topAsset || 'None'})
Live Prices: ${JSON.stringify(Object.fromEntries(Object.entries(markets || {}).map(([k, v]: any) => [k, { price: v?.price, chg24h: v?.change24h, rsi: v?.indicators?.rsi }]))) }

If the user wants to execute a trade or set a price alert, output a proposal inside <<<ACTION ... ACTION>>>:
For order: {"type":"order","asset":"BTC"|"ETH"|"SOL"|"ADA"|"XRP"|"AVAX"|"LINK"|"DOGE","side":"buy"|"sell","amount":number,"rationale":string,"confidence":"low"|"medium"|"high","riskSummary":string}
For alert: {"type":"alert","asset":"BTC"|"ETH"|"SOL"|"ADA"|"XRP"|"AVAX"|"LINK"|"DOGE","alertType":"above"|"below","value":number,"rationale":string,"confidence":"low"|"medium"|"high","riskSummary":string}`;

      const rawHistory = history.slice(-8, -1).map((h) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }],
      }));

      // Fold consecutive roles to prevent 400 Bad Request
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
        parts: [{ text: `${text}\n\n[Portfolio Context: Value=$${portfolioContext.portfolioValue}, Cash=$${portfolioContext.cash}, Risk=${portfolioContext.riskScore}/100]` }],
      };

      if (formattedHistory.length > 0 && formattedHistory[formattedHistory.length - 1].role === 'user') {
        formattedHistory[formattedHistory.length - 1].parts[0].text += '\n\n' + currentUserMsg.parts[0].text;
      } else {
        formattedHistory.push(currentUserMsg);
      }

      const model = s.settings.geminiModel || 'gemini-1.5-flash';

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
            actionProposal = {
              type: rawProp.type === 'order' ? 'order' : 'alert',
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
            cleanedText = fullText.replace(/<<<ACTION[\s\S]*?ACTION>>>/, '').trim();
          } catch (e) {
            console.warn('Failed to parse proposed action JSON:', e);
          }
        }

        return {
          reply: cleanedText || 'Analysis complete.',
          actionProposal,
          engine: 'Gemini Live AI',
        };
      }
    }
  } catch (err: any) {
    console.warn('Chat request failed:', err);
  }

  // Local fallback response
  return {
    reply: `Portfolio status: Total equity is $${portfolioValue(s, markets).toLocaleString()} with $${money(s.cash)} in liquid cash. Your portfolio risk score is currently ${calculatePortfolioRisk(s, markets).portfolioRiskScore}/100 (${calculatePortfolioRisk(s, markets).riskLabel}). Selected asset ${s.selectedAsset} is quoting at ${money(markets[s.selectedAsset]?.price || 0)}. To enable conversational generative reasoning, configure your Gemini API key in Settings.`,
    actionProposal: null,
    engine: 'Deterministic Algorithmic Engine (Local Mode)',
  };
}
